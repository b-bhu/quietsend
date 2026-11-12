import { FailoverRpcProvider, JsonRpcProvider } from "near-api-js";
import {
  DERIVATION_PATH,
  DOMAIN_ID,
  NEAR_RPCS,
  SIGNER_CONTRACT,
  SIGN_DEPOSIT_YOCTO,
  SIGN_GAS,
} from "./config";

export const provider = new FailoverRpcProvider(NEAR_RPCS.map((url) => new JsonRpcProvider({ url })));

/** Solana address for (nearAccount, path): the Ed25519 key the MPC derives (domain 1). Read-only view call. */
export async function deriveSolanaAddress(nearAccount: string, path = DERIVATION_PATH): Promise<string> {
  const pk = await provider.callFunction<string>({
    contractId: SIGNER_CONTRACT,
    method: "derived_public_key",
    args: { path, predecessor: nearAccount, domain_id: DOMAIN_ID },
  });
  if (typeof pk !== "string" || !pk.startsWith("ed25519:")) throw new Error("Unexpected derived key: " + JSON.stringify(pk));
  return pk.slice("ed25519:".length); // base58 pubkey == Solana address
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

function signatureFromOutcome(o: Outcome): Uint8Array | undefined {
  const st = o.status;
  if (st && typeof st === "object") {
    if (st.Failure) throw new Error("NEAR sign call failed: " + JSON.stringify(st.Failure));
    if (typeof st.SuccessValue === "string" && st.SuccessValue.length) {
      const json = JSON.parse(atob(st.SuccessValue)) as { scheme?: string; signature?: number[] };
      if (!json.signature || json.signature.length !== 64) throw new Error("Unexpected signer response: " + atob(st.SuccessValue).slice(0, 200));
      return Uint8Array.from(json.signature);
    }
  }
  return undefined;
}

/** Poll the NEAR RPC for the result of an already-submitted sign call (used after a redirect or an early wallet return). */
export async function signatureFromNearTx(txHash: string, nearAccount: string, timeoutMs = 90_000): Promise<Uint8Array> {
  const t0 = Date.now();
  let lastErr: unknown;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = (await provider.viewTransactionStatus({ txHash, accountId: nearAccount, waitUntil: "EXECUTED_OPTIMISTIC" })) as unknown as {
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
  path = DERIVATION_PATH,
): Promise<{ signature: Uint8Array; nearTxHash: string }> {
  const outcome = (await wallet.signAndSendTransaction({
    signerId: nearAccount,
    receiverId: SIGNER_CONTRACT,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "sign",
          args: { request: { payload_v2: { Eddsa: toHex(message) }, path, domain_id: DOMAIN_ID } },
          gas: SIGN_GAS,
          deposit: SIGN_DEPOSIT_YOCTO,
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

// ---- NEAR Connect (wallet connector; replaces the deprecated NEAR Wallet Selector) ----
import type { NearConnector as NC } from "@hot-labs/near-connect";
let connector: Promise<NC> | undefined;
export function getConnector(): Promise<NC> {
  connector ??= import("@hot-labs/near-connect").then(
    ({ NearConnector }) => new NearConnector({
        network: "testnet",
        features: { signAndSendTransaction: true },
        // Only wallets we expect to work for a plain function call; the others are untested here.
        excludedWallets: ["ethereum-wallets", "near-cli", "ledger"],
      }),
  );
  return connector;
}
