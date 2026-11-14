// Defaults for quietsend. No import.meta.env or process.env is read here —
// callers pass overrides through configure().
import {
  DEFAULT_MB_ALLOWED_PROGRAMS,
  DEFAULT_MB_VALIDATOR,
  DEFAULT_MB_VAULT,
} from "./guards";

export const NETWORK = "testnet" as const;
export const SIGNER_CONTRACT = "v1.signer-prod.testnet";
export const DERIVATION_PATH = "solana-1";
export const DOMAIN_ID = 1;
export const SIGN_DEPOSIT_YOCTO = "1";
export const SIGN_GAS = "300000000000000"; // 300 Tgas; unused gas is refunded

export const DEFAULT_NEAR_RPCS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];
// OnFinality public devnet endpoint. api.devnet.solana.com is unreachable from the dev box.
export const DEFAULT_SOLANA_RPC = "https://solana-devnet.api.onfinality.io/public";

export const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_DECIMALS = 6;

export const MB_API = "https://payments.magicblock.app";
// Moved from policy.bibhu-usdc.testnet on 14 Nov 2026 (adds EVM). Derived agent
// addresses changed with it, because the MPC predecessor is the contract.
export const POLICY_CONTRACT = "policy.quietsend.testnet";

export type QuietSendConfig = {
  signerContract: string;
  derivationPath: string;
  domainId: number;
  signDepositYocto: string;
  signGas: string;
  nearRpcs: string[];
  solanaRpc: string;
  usdcMint: string;
  usdcDecimals: number;
  mbApi: string;
  mbAllowedPrograms: string[];
  mbValidator: string;
  mbVault: string;
  policyContract: string;
};

export const DEFAULT_CONFIG: QuietSendConfig = {
  signerContract: SIGNER_CONTRACT,
  derivationPath: DERIVATION_PATH,
  domainId: DOMAIN_ID,
  signDepositYocto: SIGN_DEPOSIT_YOCTO,
  signGas: SIGN_GAS,
  nearRpcs: [...DEFAULT_NEAR_RPCS],
  solanaRpc: DEFAULT_SOLANA_RPC,
  usdcMint: USDC_MINT,
  usdcDecimals: USDC_DECIMALS,
  mbApi: MB_API,
  mbAllowedPrograms: [...DEFAULT_MB_ALLOWED_PROGRAMS],
  mbValidator: DEFAULT_MB_VALIDATOR,
  mbVault: DEFAULT_MB_VAULT,
  policyContract: POLICY_CONTRACT,
};

let current: QuietSendConfig = {
  ...DEFAULT_CONFIG,
  nearRpcs: [...DEFAULT_CONFIG.nearRpcs],
  mbAllowedPrograms: [...DEFAULT_CONFIG.mbAllowedPrograms],
};

const listeners: Array<() => void> = [];

/** Called by solana/near runtimes to drop cached RPC clients when config changes. */
export function onConfigChange(fn: () => void): void {
  listeners.push(fn);
}

export function configure(partial: Partial<QuietSendConfig>): QuietSendConfig {
  current = {
    ...current,
    ...partial,
    nearRpcs: partial.nearRpcs ? [...partial.nearRpcs] : current.nearRpcs,
    mbAllowedPrograms: partial.mbAllowedPrograms ? [...partial.mbAllowedPrograms] : current.mbAllowedPrograms,
  };
  for (const fn of listeners) fn();
  return current;
}

export function getConfig(): QuietSendConfig {
  return current;
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const nearTx = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
