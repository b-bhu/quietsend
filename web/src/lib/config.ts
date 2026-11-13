// Vite env overlay on top of core defaults. This is the only file that reads import.meta.env.
import {
  DEFAULT_CONFIG,
  DEFAULT_MB_ALLOWED_PROGRAMS,
  DEFAULT_MB_VALIDATOR,
  DEFAULT_MB_VAULT,
  DEFAULT_NEAR_RPCS,
  NETWORK,
  SIGN_DEPOSIT_YOCTO,
  SIGN_GAS,
  USDC_DECIMALS,
  USDC_MINT,
  MB_API,
  configure,
  explorerTx,
  explorerAddr,
  nearTx,
  getConfig,
} from "../../../core/index";

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
  string,
  string | undefined
>;

configure({
  nearRpcs: [env.VITE_NEAR_RPC, ...DEFAULT_NEAR_RPCS].filter((x): x is string => !!x),
  solanaRpc: env.VITE_SOLANA_RPC || DEFAULT_CONFIG.solanaRpc,
  mbAllowedPrograms: [
    ...DEFAULT_MB_ALLOWED_PROGRAMS,
    ...(env.VITE_MB_EXTRA_PROGRAMS ? env.VITE_MB_EXTRA_PROGRAMS.split(",").map((s) => s.trim()).filter(Boolean) : []),
  ],
  mbValidator: env.VITE_MB_VALIDATOR || DEFAULT_MB_VALIDATOR,
  mbVault: env.VITE_MB_VAULT || DEFAULT_MB_VAULT,
});

const cfg = getConfig();

export { NETWORK, SIGN_DEPOSIT_YOCTO, SIGN_GAS, USDC_DECIMALS, USDC_MINT, MB_API, explorerTx, explorerAddr, nearTx };
export const SIGNER_CONTRACT = cfg.signerContract;
export const DERIVATION_PATH = cfg.derivationPath;
export const DOMAIN_ID = cfg.domainId;
export const NEAR_RPCS = cfg.nearRpcs;
export const SOLANA_RPC = cfg.solanaRpc;
export const MB_ALLOWED_PROGRAMS = cfg.mbAllowedPrograms;
export const MB_VALIDATOR = cfg.mbValidator;
export const MB_VAULT = cfg.mbVault;
