import { PublicKey } from "@solana/web3.js";
import {
  clearPending,
  getRecord,
  loadPending,
  saveRecord,
  savePending,
  type Mode,
  type PendingSend,
  type SendRecord,
} from "./history";
import { requestPrivateTransfer } from "./magicblock";
import { mpcSignViaWallet, signatureFromNearTx, type SigningWallet } from "./near";
import {
  ataOf,
  attachSignature,
  broadcast,
  buildNormalTransfer,
  getBalances,
  isExpired,
  parseUsdc,
  recentSigs,
  toHex,
  type Unsigned,
} from "./solana";
import { DERIVATION_PATH } from "./config";
import { inspectTx } from "./inspect";

export type Log = (msg: string) => void;

export interface SendInput {
  wallet: SigningWallet;
  nearAccount: string;
  solanaAddress: string;
  recipient: string;
  amountUi: string;
  mode: Mode;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Full send. Persists progress after every step so a reload / redirect can resume (see resumePending). */
export async function runSend(inp: SendInput, log: Log = () => {}): Promise<SendRecord> {
  const amountBase = parseUsdc(inp.amountUi);
  const to = new PublicKey(inp.recipient).toBase58(); // throws on invalid address
  if (to === inp.solanaAddress) throw new Error("Recipient is your own derived address");

  const bal = await getBalances(inp.solanaAddress);
  const need = inp.mode === "hide" ? amountBase + amountBase / 1000n + 1n : amountBase;
  if (bal.usdcBase < need) throw new Error("Not enough USDC at the derived address");
  if (bal.sol < 0.003) throw new Error("Derived address needs about 0.003 devnet SOL for fees/rent");

  const recipientAta = ataOf(to);
  const rec: SendRecord = {
    id: newId(),
    createdAt: Date.now(),
    nearAccount: inp.nearAccount,
    path: DERIVATION_PATH,
    solanaAddress: inp.solanaAddress,
    mode: inp.mode,
    recipient: to,
    recipientAta,
    amountBase: amountBase.toString(),
    status: "signing",
    seenAtaSigs: await recentSigs(recipientAta).catch(() => []),
  };
  saveRecord(rec);

  try {
    // 1. Build the unsigned transaction (right before the wallet prompt, to keep the blockhash fresh).
    let u: Unsigned;
    if (inp.mode === "hide") {
      log("Asking MagicBlock for a private transfer...");
      const mb = await requestPrivateTransfer(inp.solanaAddress, to, amountBase);
      rec.mbFeeTokens = mb.feesTokens;
      log(`MagicBlock programs: ${mb.programs.length} (all recognised). Privacy fee ${mb.feesTokens} base units.`);
      u = mb;
    } else {
      log("Building SPL transferChecked...");
      u = await buildNormalTransfer(inp.solanaAddress, to, amountBase);
    }
    const pending: PendingSend = {
      id: rec.id,
      kind: u.kind,
      unsignedB64: u.unsignedB64,
      messageHex: toHex(u.messageBytes),
      lastValidBlockHeight: u.lastValidBlockHeight,
    };
    savePending(pending);
    saveRecord(rec);

    // 2. Wallet approves the NEAR call to the MPC signer.
    log("Waiting for your wallet to approve the NEAR sign request...");
    const { signature, nearTxHash } = await mpcSignViaWallet(inp.wallet, inp.nearAccount, u.messageBytes, (h) => {
      rec.nearTxHash = h;
      pending.nearTxHash = h;
      savePending(pending);
      saveRecord(rec);
      log("NEAR tx " + h);
    });
    rec.nearTxHash = nearTxHash;
    return await finish(rec, pending, signature, log);
  } catch (e) {
    rec.status = "failed";
    rec.error = e instanceof Error ? e.message : String(e);
    saveRecord(rec);
    clearPending();
    throw e;
  }
}

/** Attach signature, broadcast, and for hide mode wait for the payout leg. */
async function finish(rec: SendRecord, p: PendingSend, signature: Uint8Array, log: Log): Promise<SendRecord> {
  if (await isExpired(p.lastValidBlockHeight)) {
    throw new Error(
      "The Solana blockhash expired while waiting for the wallet/MPC (about 60-90 s). The NEAR call already happened; just send again.",
    );
  }
  rec.status = "broadcasting";
  saveRecord(rec);
  const raw = attachSignature(p, rec.solanaAddress, signature);
  log("Signature verified locally; broadcasting to Solana devnet...");
  rec.leg1Sig = await broadcast(raw, p.lastValidBlockHeight);
  clearPending();
  log("Leg 1 confirmed: " + rec.leg1Sig);
  if (rec.mode === "normal") {
    rec.status = "confirmed";
    saveRecord(rec);
    return rec;
  }
  rec.status = "leg1-confirmed";
  saveRecord(rec);
  return await pollLeg2(rec, log);
}

/**
 * Watch the recipient's token account for MagicBlock's payout. A signature only counts when it is new (not in
 * the pre-send set, not leg 1) AND its parsed USDC balance changes show the recipient received exactly the amount.
 */
export async function pollLeg2(rec: SendRecord, log: Log = () => {}, timeoutMs = 5 * 60_000): Promise<SendRecord> {
  const seen = new Set([...(rec.seenAtaSigs ?? []), rec.leg1Sig ?? ""]);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const fresh = (await recentSigs(rec.recipientAta).catch(() => [])).filter((s) => !seen.has(s)).reverse(); // oldest first
    for (const sig of fresh) {
      const v = await inspectTx(sig).catch((e) => {
        log(`Could not read ${sig.slice(0, 8)}...: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
        return undefined;
      });
      if (!v) continue; // not indexed yet; look again next round
      seen.add(sig);
      const got = v.usdcChanges.find((c) => c.owner === rec.recipient)?.deltaBase ?? 0n;
      if (!v.err && got === BigInt(rec.amountBase)) {
        rec.leg2Sig = sig;
        rec.status = "settled";
        saveRecord(rec);
        log("Leg 2 (payout) found: " + sig);
        return rec;
      }
      log(`Ignoring ${sig.slice(0, 8)}...: recipient delta ${got} is not the expected ${rec.amountBase}`);
    }
    log("Waiting for MagicBlock payout...");
    await new Promise((r) => setTimeout(r, 6000));
  }
  return rec; // still "leg1-confirmed"; the explorer page has a "check again" button
}

/**
 * After a reload (or a redirect-style wallet that navigated away), finish an interrupted send.
 * If the NEAR hash was never captured we cannot recover the signature: the pending send is dropped.
 */
export async function resumePending(log: Log = () => {}): Promise<SendRecord | undefined> {
  const p = loadPending();
  if (!p) return undefined;
  const rec = getRecord(p.id);
  if (!rec) {
    clearPending();
    return undefined;
  }
  try {
    if (!p.nearTxHash) throw new Error("Interrupted before the wallet returned a NEAR tx hash; nothing to resume. Send again.");
    log("Resuming: reading the signature from NEAR tx " + p.nearTxHash);
    const sig = await signatureFromNearTx(p.nearTxHash, rec.nearAccount);
    return await finish(rec, p, sig, log);
  } catch (e) {
    rec.status = "failed";
    rec.error = e instanceof Error ? e.message : String(e);
    saveRecord(rec);
    clearPending();
    throw e;
  }
}
