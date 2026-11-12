import "./polyfill";
import { Buffer } from "buffer";
import { VersionedTransaction } from "@solana/web3.js";
import { assertMagicBlockTx, checkEconomics as checkEconomicsShared } from "../../../shared/magicblock-guards";
import { MB_ALLOWED_PROGRAMS, MB_API, USDC_MINT } from "./config";
import { connection, type Unsigned } from "./solana";

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
  const res = await fetch(MB_API + "/v1/spl/transfer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      mint: USDC_MINT,
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
    usdcMint: USDC_MINT,
    allowedPrograms: MB_ALLOWED_PROGRAMS,
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

/** Web wrapper around the shared economics check, bound to the app's connection and USDC mint. */
export async function checkEconomics(tx: VersionedTransaction, from: string, amountBase: bigint, feesTokens: bigint) {
  return checkEconomicsShared(connection, tx, from, amountBase, feesTokens, USDC_MINT);
}
