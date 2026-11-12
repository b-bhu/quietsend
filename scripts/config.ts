import { Connection } from "@solana/web3.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MB_ALLOWED_PROGRAMS,
  DEFAULT_MB_VALIDATOR,
  DEFAULT_MB_VAULT,
} from "../shared/magicblock-guards.ts";


export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KEYS_DIR = resolve(ROOT, ".keys");
export const OUT_DIR = resolve(ROOT, "out");

export const NEAR_ACCOUNT = process.env.NEAR_ACCOUNT ?? "bibhu-usdc.testnet";
export const DERIVATION_PATH = "solana-1";
export const DERIVED_ADDRESS = "7snfiiW6ZP2pgACBx3ZtKKcpNwTk74gGGQPRtxDVnt27";
export const SIGNER_CONTRACT = "v1.signer-prod.testnet";
export const DOMAIN_ID = 1;
export const KEY_TYPE = "Eddsa" as const;
export const NEAR_RPC = "https://rpc.testnet.near.org";

// Official public RPC. In some environments (including this box) it resolves
// via a fake-ip DNS (198.18.0.0/15) and TLS fails; scripts fall back.
export const OFFICIAL_SOLANA_RPC = "https://api.devnet.solana.com";
export const FALLBACK_SOLANA_RPCS = [
  "https://solana-devnet.api.onfinality.io/public",
];
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

// Official Circle Solana devnet USDC mint:
// https://developers.circle.com/stablecoins/usdc-contract-addresses
export const CIRCLE_USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export const MB_ALLOWED_PROGRAMS = [
  ...DEFAULT_MB_ALLOWED_PROGRAMS,
  ...(process.env.MB_EXTRA_PROGRAMS
    ? process.env.MB_EXTRA_PROGRAMS.split(",").map((s) => s.trim()).filter(Boolean)
    : []),
];
export const MB_VALIDATOR = process.env.MB_VALIDATOR || DEFAULT_MB_VALIDATOR;
export const MB_VAULT = process.env.MB_VAULT || DEFAULT_MB_VAULT;

// Deposit: 1 yoctoNEAR. chainsig.js getCurrentSignatureDeposit() and
// https://github.com/near/mpc/blob/main/crates/contract/README.md
// View methods experimental_signature_deposit / signature_deposit do not exist
// on v1.signer-prod.testnet (verified by view call, 2026-11-11).
export const SIGN_DEPOSIT_YOCTONEAR = 1n;

// Minimum gas from live config view: sign_call_gas_attachment_requirement_tera_gas = 15.
// chainsig.js attaches NEAR_MAX_GAS = 300 Tgas. Unused gas is refunded.
export const SIGN_GAS = 300_000_000_000_000n;
export const SIGN_GAS_MINIMUM_TGAS = 15;

export const TOKEN_DECIMALS = 6;
export const TOKEN_SYMBOL = "tUSDC";
export const MINT_UI_AMOUNT = 100;
export const TRANSFER_UI_AMOUNT = 1;

export const STATE_PATH = resolve(OUT_DIR, "state.json");
export const UNSIGNED_MESSAGE_HEX = resolve(OUT_DIR, "unsigned-message.hex");
export const UNSIGNED_TX_PATH = resolve(OUT_DIR, "unsigned-tx.json");
export const SIGNATURE_PATH = resolve(OUT_DIR, "signature.json");

export function ensureDirs() {
  mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(OUT_DIR, { recursive: true });
}

export async function rpcWorks(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash" }),
      signal: AbortSignal.timeout(12_000),
    });
    const json = (await res.json()) as { result?: string };
    return json.result === DEVNET_GENESIS;
  } catch {
    return false;
  }
}

export async function pickSolanaRpc(): Promise<string> {
  const candidates = [OFFICIAL_SOLANA_RPC, ...FALLBACK_SOLANA_RPCS];
  if (process.env.SOLANA_RPC) candidates.unshift(process.env.SOLANA_RPC);
  for (const url of candidates) {
    if (await rpcWorks(url)) {
      console.log("Using Solana devnet RPC:", url);
      return url;
    }
    console.log("RPC not reachable or not devnet:", url);
  }
  throw new Error(
    `No reachable Solana devnet RPC. Official ${OFFICIAL_SOLANA_RPC} failed; tried ${candidates.join(", ")}`,
  );
}

export async function getConnection(): Promise<{ connection: Connection; rpcUrl: string }> {
  const rpcUrl = await pickSolanaRpc();
  return { connection: new Connection(rpcUrl, "confirmed"), rpcUrl };
}

export type State = {
  derivedAddress: string;
  solLamports?: number;
  rpcUrl?: string;
  mint?: string;
  mintKind?: "circle-devnet-usdc" | "test-tusdc";
  decimals?: number;
  senderAta?: string;
  recipient?: string;
  recipientAta?: string;
  senderTokenBalance?: string;
  recipientTokenBalance?: string;
  fundedPayerPubkey?: string;
};

export async function loadState(): Promise<State> {
  const { readFileSync, existsSync } = await import("node:fs");
  if (!existsSync(STATE_PATH)) {
    return { derivedAddress: DERIVED_ADDRESS };
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
}

export async function saveState(partial: Partial<State>): Promise<State> {
  const { writeFileSync } = await import("node:fs");
  ensureDirs();
  const prev = await loadState();
  const next = { ...prev, ...partial, derivedAddress: DERIVED_ADDRESS };
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
  return next;
}
