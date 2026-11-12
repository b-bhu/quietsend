import "./polyfill";
import { Buffer } from "buffer";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SOLANA_RPC, USDC_DECIMALS, USDC_MINT } from "./config";
export { classifyRecipient } from "../../../shared/magicblock-guards";

// Public devnet RPCs answer 429/502/503 under light load; retry with backoff (no websocket is used, see broadcast()).
export const rpcFetch: typeof fetch = async (input, init) => {
  for (let i = 0; ; i++) {
    const res = await fetch(input, init);
    if ([429, 502, 503].includes(res.status) && i < 6) {
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
      continue;
    }
    return res;
  }
};
export const connection = new Connection(SOLANA_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true, fetch: rpcFetch });
export const MINT = new PublicKey(USDC_MINT);

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const ataOf = (owner: string) => getAssociatedTokenAddressSync(MINT, new PublicKey(owner)).toBase58();

export function parseUsdc(ui: string): bigint {
  const s = ui.trim();
  if (s.startsWith("-")) throw new Error("Amount must be greater than 0");
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) throw new Error("Enter a USDC amount with up to 6 decimals");
  const base = BigInt(m[1]) * 10n ** 6n + BigInt((m[2] ?? "").padEnd(6, "0"));
  if (base <= 0n) throw new Error("Amount must be greater than 0");
  if (base > 1_000_000n * 10n ** 6n) throw new Error("Amount too large for this demo (max 1,000,000 USDC)");
  return base;
}
export function formatUsdc(base: bigint | string): string {
  const b = BigInt(base);
  const whole = b / 10n ** 6n;
  const frac = (b % 10n ** 6n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export interface Balances {
  sol: number;
  usdcBase: bigint;
}
export async function getBalances(address: string): Promise<Balances> {
  const owner = new PublicKey(address);
  const [lamports, tokens] = await Promise.all([
    connection.getBalance(owner),
    connection.getParsedTokenAccountsByOwner(owner, { mint: MINT }),
  ]);
  const usdcBase = tokens.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
  return { sol: lamports / LAMPORTS_PER_SOL, usdcBase };
}

export interface Unsigned {
  kind: "legacy" | "v0";
  unsignedB64: string;
  messageBytes: Uint8Array; // exactly what the MPC must sign
  lastValidBlockHeight: number;
}

/** Normal send: SPL transferChecked (+ idempotent recipient ATA creation, paid by the sender). */
export async function buildNormalTransfer(from: string, to: string, amountBase: bigint): Promise<Unsigned> {
  const fromPk = new PublicKey(from);
  const toPk = new PublicKey(to);
  const senderAta = getAssociatedTokenAddressSync(MINT, fromPk);
  const recipientAta = getAssociatedTokenAddressSync(MINT, toPk);
  const ixs = [];
  if (!(await connection.getAccountInfo(recipientAta))) {
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(fromPk, recipientAta, toPk, MINT));
  }
  ixs.push(createTransferCheckedInstruction(senderAta, MINT, recipientAta, fromPk, amountBase, USDC_DECIMALS));
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: fromPk, blockhash, lastValidBlockHeight }).add(...ixs);
  return {
    kind: "legacy",
    unsignedB64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    messageBytes: tx.serializeMessage(), // == compileMessage().serialize(), checked in scripts/03-build-tx.ts
    lastValidBlockHeight,
  };
}

export async function isExpired(lastValidBlockHeight: number): Promise<boolean> {
  return (await connection.getBlockHeight("confirmed")) > lastValidBlockHeight;
}

/** Attach the MPC signature (verified locally against the derived pubkey) and return raw tx bytes. */
export function attachSignature(u: { kind: "legacy" | "v0"; unsignedB64: string }, signer: string, sig: Uint8Array): Uint8Array {
  const raw = Buffer.from(u.unsignedB64, "base64");
  if (u.kind === "legacy") {
    const tx = Transaction.from(raw);
    const msg = tx.serializeMessage();
    if (!ed25519.verify(sig, msg, new PublicKey(signer).toBytes())) throw new Error("MPC signature does not verify for " + signer);
    tx.addSignature(new PublicKey(signer), Buffer.from(sig));
    if (!tx.verifySignatures()) throw new Error("Signed transaction failed verification");
    return tx.serialize();
  }
  const tx = VersionedTransaction.deserialize(raw);
  if (!ed25519.verify(sig, tx.message.serialize(), new PublicKey(signer).toBytes())) throw new Error("MPC signature does not verify for " + signer);
  tx.signatures[0] = sig;
  return tx.serialize();
}

export async function broadcast(
  rawTx: Uint8Array,
  lastValidBlockHeight: number,
  onSent?: (signature: string) => void,
): Promise<string> {
  const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: false, maxRetries: 5 });
  onSent?.(sig);
  // Poll instead of connection.confirmTransaction(): that opens a websocket, which public devnet RPCs rate limit.
  for (;;) {
    const st = (await connection.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error("Transaction failed on Solana: " + JSON.stringify(st.err));
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      const again = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
      if (again && !again.err) return sig;
      throw new Error("Transaction not confirmed before its blockhash expired (signature " + sig + ")");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Newest signatures touching an account (used to spot MagicBlock's payout to the recipient token account). */
export async function recentSigs(address: string, limit = 20): Promise<string[]> {
  return (await connection.getSignaturesForAddress(new PublicKey(address), { limit })).map((s) => s.signature);
}
