import { Buffer } from "buffer";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
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
  | { kind: "signature"; signature: Uint8Array }
  | { kind: "needs_approval"; intentId?: string; raw: unknown };

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
  const v = value as {
    scheme?: string;
    signature?: number[] | Uint8Array;
    needs_approval?: boolean;
    NeedsApproval?: unknown;
    intent_id?: string;
    intentId?: string;
    id?: string;
  };
  if (v.needs_approval || v.NeedsApproval != null) {
    const intent = v.intent_id ?? v.intentId ?? (typeof v.NeedsApproval === "object" && v.NeedsApproval && "id" in (v.NeedsApproval as object) ? String((v.NeedsApproval as { id: unknown }).id) : v.id);
    return { kind: "needs_approval", intentId: intent != null ? String(intent) : undefined, raw: value };
  }
  if (v.signature) {
    const sig = Uint8Array.from(v.signature);
    if (sig.length !== 64) throw new Error("Unexpected signer response: signature length " + sig.length);
    return { kind: "signature", signature: sig };
  }
  return undefined;
}

function signResultFromOutcome(o: Outcome): SignResult | undefined {
  const st = o.status;
  if (st && typeof st === "object") {
    if (st.Failure) throw new Error("NEAR sign call failed: " + JSON.stringify(st.Failure));
    if (typeof st.SuccessValue === "string" && st.SuccessValue.length) {
      const parsed = parseSignValue(decodeSuccessValue(st.SuccessValue));
      if (parsed) return parsed;
      throw new Error("Unexpected signer response: " + String(decodeSuccessValue(st.SuccessValue)).slice(0, 200));
    }
  }
  return undefined;
}

function signatureFromOutcome(o: Outcome): Uint8Array | undefined {
  const parsed = signResultFromOutcome(o);
  if (!parsed) return undefined;
  if (parsed.kind === "needs_approval") throw new Error("NEAR sign call returned needs_approval");
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
  | { status: "signed"; signature: Uint8Array; nearTxHash: string }
  | { status: "needs_approval"; nearTxHash: string; intentId?: string };

/**
 * Policy-mode sign: a function-call key calls sign_for_caller on the policy contract
 * with zero deposit. Throws a clear error if the contract is not deployed yet.
 */
export async function mpcSignViaPolicy(
  accountId: string,
  privateKey: string,
  message: Uint8Array,
  args: { recipient: string; amountBase: bigint; mode: "normal" | "hide" },
  onHash?: (hash: string) => void,
): Promise<PolicySignResult> {
  const cfg = getConfig();
  const account = accountFromKey(accountId, privateKey);
  const body = {
    payload_hex: toHex(message),
    recipient: args.recipient,
    amount: args.amountBase.toString(),
    mode: args.mode === "hide" ? "hide_recipient" : "normal",
  };
  let outcome: Outcome;
  try {
    outcome = (await account.signAndSendTransaction({
      receiverId: cfg.policyContract,
      actions: [actionCreators.functionCall("sign_for_caller", body, BigInt(cfg.signGas), 0n)],
    })) as Outcome;
  } catch (e) {
    if (isPolicyMissingError(e)) throw new Error(POLICY_NOT_DEPLOYED);
    throw e;
  }
  const nearTxHash = hashOf(outcome);
  if (!nearTxHash) throw new Error("Policy sign call returned no transaction hash");
  onHash?.(nearTxHash);
  try {
    const parsed = signResultFromOutcome(outcome);
    if (parsed?.kind === "needs_approval") return { status: "needs_approval", nearTxHash, intentId: parsed.intentId };
    if (parsed?.kind === "signature") return { status: "signed", signature: parsed.signature, nearTxHash };
    const polled = await signatureFromNearTx(nearTxHash, accountId);
    return { status: "signed", signature: polled, nearTxHash };
  } catch (e) {
    if (isPolicyMissingError(e) || (e instanceof Error && /needs_approval/.test(e.message))) {
      if (isPolicyMissingError(e)) throw new Error(POLICY_NOT_DEPLOYED);
    }
    // If the tx succeeded but the value is needs_approval, parse again from chain.
    throw e;
  }
}
