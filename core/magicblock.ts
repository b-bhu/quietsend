import { Buffer } from "buffer";
import { VersionedTransaction } from "@solana/web3.js";
import { assertMagicBlockTx, checkEconomics as checkEconomicsShared } from "./guards";
import { getConfig } from "./config";
import { getConnection, type Unsigned } from "./solana";

export interface MbTransfer extends Unsigned {
  sendTo: string;
  feesTokens: string; // base units
  feesLamports: string;
  programs: string[];
}

/**
 * POST /v1/spl/transfer: private base->base transfer. Returns an UNSIGNED v0 transaction with the recipient
 * encrypted inside. Proven end to end by scripts/mb-*.ts (devnet). No bearer token is needed for this call.
 * minDelayMs/maxDelayMs "0": no settlement delay (delay/split options exist but are untested here).
 */
export async function requestPrivateTransfer(from: string, to: string, amountBase: bigint): Promise<MbTransfer> {
  const cfg = getConfig();
  const res = await fetch(cfg.mbApi + "/v1/spl/transfer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      mint: cfg.usdcMint,
      amount: Number(amountBase),
      cluster: "devnet",
      visibility: "private",
      fromBalance: "base",
      toBalance: "base",
      initIfMissing: true,
      initAtasIfMissing: true,
      initVaultIfMissing: true,
      minDelayMs: "0",
      maxDelayMs: "0",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`MagicBlock API ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`MagicBlock API ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);

  const raw = Buffer.from(j.transactionBase64 as string, "base64");
  const tx = VersionedTransaction.deserialize(raw);
  // The MPC signs whatever bytes it is given, so check before asking for a signature.
  const { programs } = assertMagicBlockTx({
    tx,
    sendTo: j.sendTo,
    from,
    usdcMint: cfg.usdcMint,
    allowedPrograms: cfg.mbAllowedPrograms,
  });

  const feesTokens = BigInt(j.fees?.tokens ?? "0");
  await checkEconomics(tx, from, amountBase, feesTokens);

  return {
    kind: "v0",
    unsignedB64: raw.toString("base64"),
    messageBytes: tx.message.serialize(),
    lastValidBlockHeight: Number(j.lastValidBlockHeight),
    sendTo: j.sendTo,
    feesTokens: feesTokens.toString(),
    feesLamports: String(j.fees?.lamports ?? "0"),
    programs,
  };
}

/** Re-run the pre-sign guards on an already-built MagicBlock transaction (called again immediately before sign). */
export async function assertUnsignedMagicBlock(u: Unsigned, from: string, amountBase: bigint, feesTokens: bigint): Promise<void> {
  const cfg = getConfig();
  const tx = VersionedTransaction.deserialize(Buffer.from(u.unsignedB64, "base64"));
  assertMagicBlockTx({
    tx,
    sendTo: "base",
    from,
    usdcMint: cfg.usdcMint,
    allowedPrograms: cfg.mbAllowedPrograms,
  });
  await checkEconomics(tx, from, amountBase, feesTokens);
}

/** Economics check bound to the current connection and USDC mint. */
export async function checkEconomics(tx: VersionedTransaction, from: string, amountBase: bigint, feesTokens: bigint) {
  return checkEconomicsShared(getConnection(), tx, from, amountBase, feesTokens, getConfig().usdcMint);
}
