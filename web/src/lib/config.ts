// All constants for quietsend v1. NEAR testnet + Solana devnet only.
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
  string,
  string | undefined
>;

export const NETWORK = "testnet" as const;
export const SIGNER_CONTRACT = "v1.signer-prod.testnet";
export const DERIVATION_PATH = "solana-1"; // label chosen by us; any label gives a different address
export const DOMAIN_ID = 1; // Ed25519 domain on the NEAR signer
export const SIGN_DEPOSIT_YOCTO = "1";
export const SIGN_GAS = "300000000000000"; // 300 Tgas; unused gas is refunded

// NEAR RPC: fastnear is what docs.near.org uses; rpc.testnet.near.org is the fallback.
export const NEAR_RPCS = [env.VITE_NEAR_RPC, "https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"].filter(
  (x): x is string => !!x,
);

// Solana devnet RPC. api.devnet.solana.com is unreachable from the dev box, so the default is
// OnFinality's public devnet endpoint (rate limited: set VITE_SOLANA_RPC to a keyed endpoint for demos).
export const SOLANA_RPC = env.VITE_SOLANA_RPC || "https://solana-devnet.api.onfinality.io/public";

// Official Circle devnet USDC: https://developers.circle.com/stablecoins/usdc-contract-addresses
export const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_DECIMALS = 6;

export const MB_API = "https://payments.magicblock.app";
// Programs seen in the proven MagicBlock transfer (out/mb-inspect.txt). The app refuses to have the MPC
// sign a MagicBlock transaction that calls anything else, since the MPC signs whatever bytes it is given.
export const MB_ALLOWED_PROGRAMS = [
  "SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2", // ephemeral SPL token program
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "11111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
  "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1",
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
  "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
  ...(env.VITE_MB_EXTRA_PROGRAMS ? env.VITE_MB_EXTRA_PROGRAMS.split(",") : []),
];

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const nearTx = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
