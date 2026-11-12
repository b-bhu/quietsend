import { PublicKey } from "@solana/web3.js";
import { txViewFromRpcResult, type TokenChange, type TxView } from "./guards";
import { getConfig } from "./config";
import { getMint, rpcFetch } from "./solana";

export type { TokenChange, TxView };

/**
 * Read what a Solana tx exposes publicly: signers, every account it touches, USDC balance changes by owner.
 * Uses raw JSON-RPC: devnet now returns version-1 transactions (MagicBlock's payout is one) and
 * @solana/web3.js 1.98.4's getParsedTransaction rejects them in its response validation.
 */
export async function inspectTx(signature: string): Promise<TxView | undefined> {
  const res = await rpcFetch(getConfig().solanaRpc, {
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
  if (!j.result) return undefined;
  return txViewFromRpcResult(signature, j.result, getMint().toBase58());
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
