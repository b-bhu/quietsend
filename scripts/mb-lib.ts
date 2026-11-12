// Shared helpers for the MagicBlock devnet test: MPC-sign arbitrary bytes, call the API, balances.
import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { PublicKey, Connection } from "@solana/web3.js";
import { contracts } from "chainsig.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { DERIVED_ADDRESS, DERIVATION_PATH, KEY_TYPE, NEAR_ACCOUNT, NEAR_RPC, ROOT, SIGNER_CONTRACT, OUT_DIR, ensureDirs } from "./config.ts";

export const MB_API = "https://payments.magicblock.app";
export const CLUSTER = "devnet";
export const RECIPIENT = "7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C";
export const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

export function saveOut(name: string, data: unknown) {
  ensureDirs();
  writeFileSync(resolve(OUT_DIR, name), JSON.stringify(data, null, 2) + "\n");
}

export async function mbFetch(path: string, init?: RequestInit & { token?: string }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(MB_API + path, { ...init, headers, signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

// Sign raw bytes with the NEAR MPC (Ed25519, domain 1, path solana-1). Never prints the NEAR key.
export async function mpcSign(bytes: Uint8Array): Promise<Uint8Array> {
  const keyFile = resolve(ROOT, ".keys", `${NEAR_ACCOUNT}.json`);
  const pk = JSON.parse(readFileSync(keyFile, "utf8")).private_key;
  const account = new Account(NEAR_ACCOUNT, new JsonRpcProvider({ url: NEAR_RPC }), new KeyPairSigner(KeyPair.fromString(pk as KeyPairString)));
  const contract = new contracts.ChainSignatureContract({ networkId: "testnet", contractId: SIGNER_CONTRACT });
  const sigs = await contract.sign({ payloads: [Buffer.from(bytes)], path: DERIVATION_PATH, keyType: KEY_TYPE, signerAccount: account });
  const s = sigs[0] as { signature?: number[] };
  if (!s?.signature) throw new Error("No signature from MPC");
  const sig = Uint8Array.from(s.signature);
  if (!ed25519.verify(sig, bytes, new PublicKey(DERIVED_ADDRESS).toBytes())) throw new Error("MPC signature failed local verify");
  return sig;
}

export async function tokenBalance(conn: Connection, owner: string, mint: string): Promise<string> {
  const r = await conn.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
  if (!r.value.length) return "0 (no token account)";
  return r.value.map((a) => a.account.data.parsed.info.tokenAmount.uiAmountString).join(",");
}
