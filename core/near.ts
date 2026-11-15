import { Buffer } from "buffer";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
import { getTransactionLastResult } from "@near-js/utils";
import { FailoverRpcProvider, JsonRpcProvider as NearJsonRpcProvider } from "near-api-js";
import { getConfig, onConfigChange } from "./config";

let provider: FailoverRpcProvider | undefined;
let providerKey = "";

function resetProvider() {
  provider = undefined;
  providerKey = "";
}
onConfigChange(resetProvider);

export function getProvider(): FailoverRpcProvider {
  const rpcs = getConfig().nearRpcs;
  const key = rpcs.join("|");
  if (!provider || providerKey !== key) {
    provider = new FailoverRpcProvider(rpcs.map((url) => new NearJsonRpcProvider({ url })));
    providerKey = key;
  }
  return provider;
}

/** Solana address for (nearAccount, path): the Ed25519 key the MPC derives (domain 1). Read-only view call. */
export async function deriveSolanaAddress(nearAccount: string, path?: string): Promise<string> {
  const cfg = getConfig();
  const pk = await getProvider().callFunction<string>({
    contractId: cfg.signerContract,
    method: "derived_public_key",
    args: { path: path ?? cfg.derivationPath, predecessor: nearAccount, domain_id: cfg.domainId },
  });
  if (typeof pk !== "string" || !pk.startsWith("ed25519:")) throw new Error("Unexpected derived key: " + JSON.stringify(pk));
  return pk.slice("ed25519:".length); // base58 pubkey == Solana address
}

/** Policy-mode address: derived from (policy contract, "<user>/solana-1"), not from the user account alone. */
export async function derivePolicySolanaAddress(nearAccount: string): Promise<string> {
  const cfg = getConfig();
  return deriveSolanaAddress(cfg.policyContract, `${nearAccount}/${cfg.derivationPath}`);
}

/** The minimal wallet surface we need (NearWalletBase from @hot-labs/near-connect satisfies it). */
export interface SigningWallet {
  signAndSendTransaction(params: {
    signerId?: string;
    receiverId: string;
    actions: { type: "FunctionCall"; params: { methodName: string; args: object; gas: string; deposit: string } }[];
  }): Promise<unknown>;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

type Outcome = {
  status?: { SuccessValue?: string; Failure?: unknown } | string;
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
};

const hashOf = (o: Outcome) => o.transaction?.hash ?? o.transaction_outcome?.id;

function decodeSuccessValue(raw: string): unknown {
  try {
    return JSON.parse(atob(raw));
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      return raw;
    }
  }
}

export type SignResult =
  | { kind: "signature"; signature: Uint8Array; path?: string }
  | { kind: "needs_approval"; intentId?: string; reason?: string; raw: unknown }
  | { kind: "rejected"; reason: string; raw: unknown };

export class NeedsApprovalError extends Error {
  intentId?: string;
  nearTxHash?: string;
  reason?: string;
  constructor(opts?: { intentId?: string; nearTxHash?: string; reason?: string }) {
    super("needs_approval");
    this.name = "NeedsApprovalError";
    this.intentId = opts?.intentId;
    this.nearTxHash = opts?.nearTxHash;
    this.reason = opts?.reason;
  }
}

/**
 * Parse a signer or policy-contract result.
 * Direct MPC: { scheme, signature: number[64] }
 * Policy contract (serde tag = status): { status: "signed"|"needs_approval"|"rejected", ... }
 *   signed: { status, signature: { scheme, signature: number[64] }, path, spent_today }
 */
export function parseSignValue(value: unknown): SignResult | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    const s = value.trim();
    if (/needs[_ ]?approval/i.test(s)) return { kind: "needs_approval", raw: value };
    try {
      return parseSignValue(JSON.parse(s));
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const status = typeof v.status === "string" ? v.status.toLowerCase() : undefined;

  if (status === "needs_approval" || v.needs_approval === true || v.NeedsApproval != null) {
    const intent = v.intent_id ?? v.intentId ?? v.id;
    return {
      kind: "needs_approval",
      intentId: intent != null ? String(intent) : undefined,
      reason: v.reason != null ? String(v.reason) : undefined,
      raw: value,
    };
  }
  if (status === "rejected") {
    return { kind: "rejected", reason: v.reason != null ? String(v.reason) : "rejected", raw: value };
  }

  // Direct MPC result, or contract wrapper { status: "signed", signature: { scheme, signature: [...] } }.
  const inner = Array.isArray(v.signature) || v.signature instanceof Uint8Array ? v : v.signature;
  // ECDSA (secp256k1): { scheme, big_r: { affine_point: "02/03<x>" }, s: { scalar: "<hex>" }, recovery_id }
  // Returned as 65 bytes r || s || recovery_id (0/1), not yet normalised to low-s.
  const ecdsa = (inner && typeof inner === "object" ? inner : v) as Record<string, unknown>;
  if (ecdsa.big_r && ecdsa.s && ecdsa.recovery_id != null) {
    const bigR = String((ecdsa.big_r as { affine_point?: unknown }).affine_point ?? "");
    const sHex = String((ecdsa.s as { scalar?: unknown }).scalar ?? "");
    if (!/^0[23][0-9a-fA-F]{64}$/.test(bigR) || !/^[0-9a-fA-F]{64}$/.test(sHex)) {
      throw new Error("Unexpected ECDSA signer response");
    }
    const sig = new Uint8Array(65);
    sig.set(Buffer.from(bigR.slice(2), "hex"), 0);
    sig.set(Buffer.from(sHex, "hex"), 32);
    sig[64] = Number(ecdsa.recovery_id);
    return { kind: "signature", signature: sig, path: typeof v.path === "string" ? v.path : undefined };
  }
  if (inner && typeof inner === "object") {
    const bytes = (inner as { signature?: unknown }).signature;
    if (Array.isArray(bytes) || bytes instanceof Uint8Array) {
      const sig = Uint8Array.from(bytes);
      if (sig.length !== 64) throw new Error("Unexpected signer response: signature length " + sig.length);
      return { kind: "signature", signature: sig, path: typeof v.path === "string" ? v.path : undefined };
    }
  }
  return undefined;
}

function valueFromOutcome(o: Outcome): unknown {
  const st = o.status;
  if (st && typeof st === "object" && st.Failure) {
    throw new Error("NEAR sign call failed: " + JSON.stringify(st.Failure));
  }
  try {
    const last = getTransactionLastResult(o as Parameters<typeof getTransactionLastResult>[0]);
    if (last != null && last !== "") return last;
  } catch {
    // no last result yet (tx still yielding) — fall through to SuccessValue
  }
  if (st && typeof st === "object" && typeof st.SuccessValue === "string" && st.SuccessValue.length) {
    return decodeSuccessValue(st.SuccessValue);
  }
  return undefined;
}

function signResultFromOutcome(o: Outcome): SignResult | undefined {
  const raw = valueFromOutcome(o);
  if (raw == null) return undefined;
  const parsed = parseSignValue(raw);
  if (parsed) return parsed;
  throw new Error("Unexpected signer response: " + String(typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 200));
}

function signatureFromOutcome(o: Outcome): Uint8Array | undefined {
  const parsed = signResultFromOutcome(o);
  if (!parsed) return undefined;
  if (parsed.kind === "needs_approval") throw new Error("NEAR sign call returned needs_approval");
  if (parsed.kind === "rejected") throw new Error("Policy rejected the send: " + parsed.reason);
  return parsed.signature;
}

/** Poll the NEAR RPC for the result of an already-submitted sign call (used after a redirect or an early wallet return). */
export async function signatureFromNearTx(txHash: string, nearAccount: string, timeoutMs = 90_000): Promise<Uint8Array> {
  const t0 = Date.now();
  let lastErr: unknown;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = (await getProvider().viewTransactionStatus({ txHash, accountId: nearAccount, waitUntil: "EXECUTED_OPTIMISTIC" })) as unknown as {
        final_execution_outcome?: Outcome;
      } & Outcome;
      const sig = signatureFromOutcome(res.final_execution_outcome ?? res);
      if (sig) return sig;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("NEAR sign call failed")) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for NEAR sign result" + (lastErr ? ": " + String(lastErr) : ""));
}

/**
 * Ask the wallet to call `sign` on the MPC signer for these bytes (1 yoctoNEAR, 300 Tgas, Eddsa, domain 1).
 * `onHash` fires as soon as the NEAR tx hash is known so the caller can persist it.
 */
export async function mpcSignViaWallet(
  wallet: SigningWallet,
  nearAccount: string,
  message: Uint8Array,
  onHash?: (hash: string) => void,
  path?: string,
): Promise<{ signature: Uint8Array; nearTxHash: string }> {
  const cfg = getConfig();
  const outcome = (await wallet.signAndSendTransaction({
    signerId: nearAccount,
    receiverId: cfg.signerContract,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "sign",
          args: { request: { payload_v2: { Eddsa: toHex(message) }, path: path ?? cfg.derivationPath, domain_id: cfg.domainId } },
          gas: cfg.signGas,
          deposit: cfg.signDepositYocto,
        },
      },
    ],
  })) as Outcome;
  const nearTxHash = hashOf(outcome);
  if (!nearTxHash) throw new Error("Wallet returned no transaction hash");
  onHash?.(nearTxHash);
  const signature = signatureFromOutcome(outcome) ?? (await signatureFromNearTx(nearTxHash, nearAccount));
  return { signature, nearTxHash };
}

function accountFromKey(accountId: string, privateKey: string): Account {
  const cfg = getConfig();
  // Prefer the official testnet RPC for signed txs (failover is for reads).
  const url = cfg.nearRpcs.find((u) => u.includes("rpc.testnet.near.org")) ?? cfg.nearRpcs[cfg.nearRpcs.length - 1] ?? "https://rpc.testnet.near.org";
  const keyPair = KeyPair.fromString(privateKey as KeyPairString);
  return new Account(accountId, new JsonRpcProvider({ url }), new KeyPairSigner(keyPair));
}

function isPolicyMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /doesn't exist|does not exist|UnknownAccount|AccountDoesNotExist|MethodNotFound|MethodResolveError|compilation error|wasm file is empty|ContractMethodNotFound/i.test(msg);
}

const POLICY_NOT_DEPLOYED = "policy contract not deployed yet";

/**
 * Human-mode sign: the account's key calls `sign` on v1.signer-prod.testnet
 * (1 yoctoNEAR, 300 Tgas), the same path as scripts/04-sign.ts.
 */
export async function mpcSignViaKey(
  accountId: string,
  privateKey: string,
  message: Uint8Array,
  onHash?: (hash: string) => void,
  path?: string,
): Promise<{ signature: Uint8Array; nearTxHash: string }> {
  const cfg = getConfig();
  const account = accountFromKey(accountId, privateKey);
  const request = { request: { payload_v2: { Eddsa: toHex(message) }, path: path ?? cfg.derivationPath, domain_id: cfg.domainId } };
  const outcome = (await account.signAndSendTransaction({
    receiverId: cfg.signerContract,
    actions: [actionCreators.functionCall("sign", request, BigInt(cfg.signGas), BigInt(cfg.signDepositYocto))],
  })) as Outcome;
  const nearTxHash = hashOf(outcome);
  if (!nearTxHash) throw new Error("NEAR sign call returned no transaction hash");
  onHash?.(nearTxHash);
  const signature = signatureFromOutcome(outcome) ?? (await signatureFromNearTx(nearTxHash, accountId));
  return { signature, nearTxHash };
}

export type PolicySignResult =
  | { status: "signed"; signature: Uint8Array; nearTxHash: string; path?: string }
  | { status: "needs_approval"; nearTxHash: string; intentId?: string; reason?: string };

export type PolicyView = {
  per_transfer: string;
  daily: string;
  cap: string;
  spent_today: string;
  /** UTC day (unix days) that spent_today belongs to; on a later day the contract counts 0. */
  day?: number;
  allowlist?: string[];
  allow_hide_unverified?: boolean;
};

/** View get_policy on the policy contract. */
export async function viewPolicy(accountId: string): Promise<PolicyView | "not_deployed" | "no_policy"> {
  const cfg = getConfig();
  try {
    const p = await getProvider().callFunction({
      contractId: cfg.policyContract,
      method: "get_policy",
      args: { account_id: accountId },
    });
    if (!p) return "no_policy";
    return p as PolicyView;
  } catch (e) {
    if (isPolicyMissingError(e)) return "not_deployed";
    throw e;
  }
}

/**
 * Policy-mode sign: a function-call key calls sign_for_caller on the policy contract
 * with zero deposit. Throws a clear error if the contract is not deployed yet.
 * The contract result is tagged { status: "signed" | "needs_approval" | "rejected" }.
 */
export async function mpcSignViaPolicy(
  accountId: string,
  privateKey: string,
  message: Uint8Array,
  args: { recipient: string; amountBase: bigint; mode: "normal" | "hide" },
  onHash?: (hash: string) => void,
): Promise<PolicySignResult> {
  const body = {
    payload_hex: toHex(message),
    recipient: args.recipient,
    amount: args.amountBase.toString(),
    mode: args.mode === "hide" ? "hide_recipient" : "normal",
  };
  return callPolicySign(accountId, privateKey, "sign_for_caller", body, onHash);
}

/** Ask the policy contract for an EIP-3009 USDC authorization signature (EVM). */
export async function mpcSignEvmViaPolicy(
  accountId: string,
  privateKey: string,
  args: { chain: string; from: string; recipient: string; amountBase: bigint; validBefore: bigint; nonceHex: string },
  onHash?: (hash: string) => void,
): Promise<PolicySignResult> {
  const body = {
    chain: args.chain,
    from: args.from,
    recipient: args.recipient,
    amount: args.amountBase.toString(),
    valid_before: args.validBefore.toString(),
    nonce_hex: args.nonceHex,
  };
  return callPolicySign(accountId, privateKey, "sign_evm_for_caller", body, onHash);
}

async function callPolicySign(
  accountId: string,
  privateKey: string,
  method: "sign_for_caller" | "sign_evm_for_caller",
  body: Record<string, string>,
  onHash?: (hash: string) => void,
): Promise<PolicySignResult> {
  const cfg = getConfig();
  const account = accountFromKey(accountId, privateKey);
  let outcome: Outcome;
  try {
    outcome = (await account.signAndSendTransaction({
      receiverId: cfg.policyContract,
      actions: [actionCreators.functionCall(method, body, BigInt(cfg.signGas), 0n)],
    })) as Outcome;
  } catch (e) {
    if (isPolicyMissingError(e)) throw new Error(POLICY_NOT_DEPLOYED);
    throw e;
  }
  const nearTxHash = hashOf(outcome);
  if (!nearTxHash) throw new Error("Policy sign call returned no transaction hash");
  onHash?.(nearTxHash);

  const apply = (parsed: SignResult | undefined): PolicySignResult | undefined => {
    if (!parsed) return undefined;
    if (parsed.kind === "needs_approval") return { status: "needs_approval", nearTxHash, intentId: parsed.intentId, reason: parsed.reason };
    if (parsed.kind === "rejected") throw new Error("Policy rejected the send: " + parsed.reason);
    return { status: "signed", signature: parsed.signature, nearTxHash, path: parsed.path };
  };

  const immediate = apply(signResultFromOutcome(outcome));
  if (immediate) return immediate;

  // Still yielding (MPC sign in flight): poll the same way a human-mode sign does,
  // but accept a needs_approval / rejected value, not only a raw 64-byte signature.
  const t0 = Date.now();
  let lastErr: unknown;
  while (Date.now() - t0 < 90_000) {
    try {
      const res = (await getProvider().viewTransactionStatus({ txHash: nearTxHash, accountId, waitUntil: "EXECUTED_OPTIMISTIC" })) as unknown as {
        final_execution_outcome?: Outcome;
      } & Outcome;
      const applied = apply(signResultFromOutcome(res.final_execution_outcome ?? res));
      if (applied) return applied;
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith("NEAR sign call failed") || e.message.startsWith("Policy rejected"))) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for policy sign result" + (lastErr ? ": " + String(lastErr) : ""));
}
