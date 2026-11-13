import { PublicKey } from "@solana/web3.js";
import { requestPrivateTransfer, assertUnsignedMagicBlock } from "./magicblock";
import { matchMagicBlockPayout } from "./guards";
import { getConfig } from "./config";
import {
  ataOf,
  attachSignature,
  broadcast,
  buildNormalTransfer,
  getBalances,
  hideRecipientDebit,
  isExpired,
  parseUsdc,
  recentSigs,
  toHex,
  type Unsigned,
} from "./solana";
import { inspectTx } from "./inspect";

export type Mode = "normal" | "hide";
export type Status = "signing" | "broadcasting" | "leg1-confirmed" | "settled" | "confirmed" | "failed";

export interface SendRecord {
  id: string;
  createdAt: number;
  nearAccount: string;
  path: string;
  solanaAddress: string;
  mode: Mode;
  recipient: string;
  recipientAta: string;
  amountBase: string; // USDC base units (6 decimals)
  status: Status;
  error?: string;
  nearTxHash?: string;
  leg1Sig?: string;
  leg2Sig?: string;
  seenAtaSigs?: string[]; // recipient-ATA signatures that existed before the send (to spot the payout)
  mbFeeTokens?: string; // MagicBlock privacy fee, base units
}

export interface PendingSend {
  id: string;
  kind: "legacy" | "v0";
  unsignedB64: string;
  messageHex: string;
  lastValidBlockHeight: number;
  nearTxHash?: string;
  mbFeeTokens?: string;
}

export type Log = (msg: string) => void;

export interface SendPersistence {
  saveRecord(r: SendRecord): void;
  savePending?(p: PendingSend): void;
  clearPending?(): void;
}

/** Build a transaction and attach + broadcast a signature. The caller supplies the NEAR sign function. */
export interface SendInput {
  sign: (message: Uint8Array, onHash?: (hash: string) => void) => Promise<{ signature: Uint8Array; nearTxHash: string }>;
  nearAccount: string;
  path?: string;
  solanaAddress: string;
  recipient: string;
  amountUi: string;
  mode: Mode;
  /** Always include create-ATA-idempotent so the policy contract's payload binding accepts the message. */
  policyPayload?: boolean;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const persist = (hooks: SendPersistence | undefined, rec: SendRecord) => hooks?.saveRecord(rec);

export async function runSend(inp: SendInput, log: Log = () => {}, hooks?: SendPersistence): Promise<SendRecord> {
  const cfg = getConfig();
  const amountBase = parseUsdc(inp.amountUi);
  let to: string;
  try {
    to = new PublicKey(inp.recipient).toBase58();
  } catch {
    throw new Error("Not a valid Solana address");
  }
  if (!PublicKey.isOnCurve(to)) throw new Error("That address is a program address and can't hold a USDC token account");
  if (to === inp.solanaAddress) throw new Error("Recipient is your own derived address");

  const bal = await getBalances(inp.solanaAddress);
  const need = inp.mode === "hide" ? hideRecipientDebit(amountBase) : amountBase;
  if (bal.usdcBase < need) throw new Error("Not enough USDC at the derived address");
  if (bal.sol < 0.003) throw new Error("Derived address needs about 0.003 devnet SOL for fees/rent");

  const recipientAta = ataOf(to);
  const rec: SendRecord = {
    id: newId(),
    createdAt: Date.now(),
    nearAccount: inp.nearAccount,
    path: inp.path ?? cfg.derivationPath,
    solanaAddress: inp.solanaAddress,
    mode: inp.mode,
    recipient: to,
    recipientAta,
    amountBase: amountBase.toString(),
    status: "signing",
    seenAtaSigs: await recentSigs(recipientAta).catch(() => []),
  };
  persist(hooks, rec);

  try {
    // 1. Build the unsigned transaction (right before the sign prompt, to keep the blockhash fresh).
    let u: Unsigned;
    if (inp.mode === "hide") {
      log("Asking MagicBlock for a private transfer...");
      const mb = await requestPrivateTransfer(inp.solanaAddress, to, amountBase);
      rec.mbFeeTokens = mb.feesTokens;
      log(`MagicBlock programs: ${mb.programs.length} (all recognised). Privacy fee ${mb.feesTokens} base units.`);
      u = mb;
    } else {
      log("Building SPL transferChecked...");
      u = await buildNormalTransfer(inp.solanaAddress, to, amountBase, { alwaysCreateAta: !!inp.policyPayload });
    }
    const pending: PendingSend = {
      id: rec.id,
      kind: u.kind,
      unsignedB64: u.unsignedB64,
      messageHex: toHex(u.messageBytes),
      lastValidBlockHeight: u.lastValidBlockHeight,
      mbFeeTokens: rec.mbFeeTokens,
    };
    hooks?.savePending?.(pending);
    persist(hooks, rec);

    // 2. Re-run MagicBlock pre-sign guards immediately before asking the MPC to sign.
    if (inp.mode === "hide") {
      await assertUnsignedMagicBlock(u, inp.solanaAddress, amountBase, BigInt(rec.mbFeeTokens ?? "0"));
    }

    log("Waiting for the NEAR sign request...");
    const { signature, nearTxHash } = await inp.sign(u.messageBytes, (h) => {
      rec.nearTxHash = h;
      pending.nearTxHash = h;
      hooks?.savePending?.(pending);
      persist(hooks, rec);
      log("NEAR tx " + h);
    });
    rec.nearTxHash = nearTxHash;
    return await finish(rec, pending, signature, log, hooks);
  } catch (e) {
    rec.status = "failed";
    rec.error = e instanceof Error ? e.message : String(e);
    persist(hooks, rec);
    hooks?.clearPending?.();
    throw e;
  }
}

/** Attach signature, broadcast, and for hide mode wait for the payout leg. */
export async function finish(
  rec: SendRecord,
  p: PendingSend,
  signature: Uint8Array,
  log: Log,
  hooks?: SendPersistence,
): Promise<SendRecord> {
  if (await isExpired(p.lastValidBlockHeight)) {
    throw new Error(
      "The Solana blockhash expired while waiting for the wallet/MPC (about 60-90 s). The NEAR call already happened; just send again.",
    );
  }
  rec.status = "broadcasting";
  persist(hooks, rec);
  const raw = attachSignature(p, rec.solanaAddress, signature);
  log("Signature verified locally; broadcasting to Solana devnet...");
  rec.leg1Sig = await broadcast(raw, p.lastValidBlockHeight, (sig) => {
    rec.leg1Sig = sig;
    persist(hooks, rec);
  });
  hooks?.clearPending?.();
  log("Leg 1 confirmed: " + rec.leg1Sig);
  if (rec.mode === "normal") {
    rec.status = "confirmed";
    persist(hooks, rec);
    return rec;
  }
  rec.status = "leg1-confirmed";
  persist(hooks, rec);
  return await pollLeg2(rec, log, 5 * 60_000, hooks);
}

/**
 * Watch the recipient's token account for MagicBlock's payout. A signature only counts when it is new (not in
 * the pre-send set, not leg 1), the recipient received exactly the amount, AND it is signed by the MagicBlock
 * validator or touches the MagicBlock vault. Other exact-amount transfers are logged and ignored.
 */
export async function pollLeg2(rec: SendRecord, log: Log = () => {}, timeoutMs = 5 * 60_000, hooks?: SendPersistence): Promise<SendRecord> {
  const cfg = getConfig();
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
      const match = matchMagicBlockPayout(v, {
        recipient: rec.recipient,
        amountBase: BigInt(rec.amountBase),
        validator: cfg.mbValidator,
        vault: cfg.mbVault,
      });
      if (match.ok) {
        rec.leg2Sig = sig;
        rec.status = "settled";
        persist(hooks, rec);
        log("Leg 2 (payout) found: " + sig);
        return rec;
      }
      log(`Ignoring ${sig.slice(0, 8)}...: ${match.reason}`);
    }
    log("Waiting for MagicBlock payout...");
    await new Promise((r) => setTimeout(r, 6000));
  }
  return rec; // still "leg1-confirmed"; the explorer page has a "check again" button
}
