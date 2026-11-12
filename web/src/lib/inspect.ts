import { PublicKey } from "@solana/web3.js";
import { SOLANA_RPC } from "./config";
import { MINT, rpcFetch } from "./solana";

export interface TokenChange {
  owner: string;
  deltaBase: bigint;
}
export interface TxView {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
  signers: string[];
  accounts: string[]; // static + address-table-loaded keys
  usdcChanges: TokenChange[];
}

/**
 * Read what a Solana tx exposes publicly: signers, every account it touches, USDC balance changes by owner.
 * Uses raw JSON-RPC: devnet now returns version-1 transactions (MagicBlock's payout is one) and
 * @solana/web3.js 1.98.4's getParsedTransaction rejects them in its response validation.
 */
export async function inspectTx(signature: string): Promise<TxView | undefined> {
  const res = await rpcFetch(SOLANA_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 1 }],
    }),
  });
  const j = (await res.json()) as { result?: any; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  const t = j.result;
  if (!t || !t.meta) return undefined;
  const keys: { pubkey: string; signer: boolean }[] = t.transaction.message.accountKeys;
  const mint = MINT.toBase58();
  const owners = new Map<string, bigint>();
  const add = (owner: string | undefined, amt: string, sign: 1n | -1n) => {
    if (owner) owners.set(owner, (owners.get(owner) ?? 0n) + sign * BigInt(amt));
  };
  for (const b of t.meta.preTokenBalances ?? []) if (b.mint === mint) add(b.owner, b.uiTokenAmount.amount, -1n);
  for (const b of t.meta.postTokenBalances ?? []) if (b.mint === mint) add(b.owner, b.uiTokenAmount.amount, 1n);
  return {
    signature,
    slot: t.slot,
    blockTime: t.blockTime ?? null,
    err: t.meta.err,
    signers: keys.filter((k) => k.signer).map((k) => k.pubkey),
    accounts: [...new Set([...keys.map((k) => k.pubkey), ...(t.meta.loadedAddresses?.writable ?? []), ...(t.meta.loadedAddresses?.readonly ?? [])])],
    usdcChanges: [...owners].filter(([, d]) => d !== 0n).map(([owner, deltaBase]) => ({ owner, deltaBase })),
  };
}

export const short = (s: string, n = 6) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
export const isAddr = (s: string) => {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
};
