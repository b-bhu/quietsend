// HTTP 402 pay-per-call, x402 "exact" scheme on EVM (v1 headers).
//
// A paid endpoint answers 402 with what it accepts. The agent gets an EIP-3009
// authorization signed through the policy contract (limits apply), sends it in
// X-PAYMENT, and the server settles it on-chain and pays the gas. The agent
// never holds ETH and never submits a transaction.
import { Buffer } from "buffer";
import type { Hex } from "viem";
import {
  EVM_CHAINS,
  isEvmAddress,
  recoverAuthorizer,
  relayAuthorization,
  signEvmAuthorization,
  type Authorization,
  type EvmChainName,
} from "./evm";

export type PaymentRequirements = {
  scheme: "exact";
  network: string;
  maxAmountRequired: string; // base units
  resource: string;
  description?: string;
  mimeType?: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: { name?: string; version?: string };
};

export type PaymentPayload = {
  x402Version: 1;
  scheme: "exact";
  network: string;
  payload: {
    signature: Hex;
    authorization: { from: Hex; to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex };
  };
};

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const dec = <T>(s: string): T => JSON.parse(Buffer.from(s, "base64").toString("utf8")) as T;

function supported(r: PaymentRequirements): EvmChainName | undefined {
  const c = (EVM_CHAINS as Record<string, (typeof EVM_CHAINS)[EvmChainName]>)[r.network];
  if (!c || r.scheme !== "exact") return undefined;
  return r.asset.toLowerCase() === c.usdc.toLowerCase() ? (r.network as EvmChainName) : undefined;
}

// ---------------- client (the agent) ----------------

export type FetchPaidResult =
  | { status: "free"; httpStatus: number; body: string }
  | {
      status: "paid";
      httpStatus: number;
      body: string;
      paid: { chain: EvmChainName; amountBase: string; payTo: string; from: string; nearTxHash: string; settlementTx?: string; explorer?: string };
    }
  | { status: "needs_approval"; intentId?: string; reason?: string; nearTxHash: string; requirements: PaymentRequirements }
  | { status: "refused"; reason: string; requirements?: PaymentRequirements[] };

export async function fetchPaid(
  url: string,
  opts: { nearAccount: string; agentKey: string; maxAmountBase: bigint; init?: RequestInit; log?: (m: string) => void },
): Promise<FetchPaidResult> {
  const log = opts.log ?? (() => {});
  const first = await fetch(url, opts.init);
  if (first.status !== 402) return { status: "free", httpStatus: first.status, body: await first.text() };

  const offer = (await first.json().catch(() => ({}))) as { accepts?: PaymentRequirements[]; error?: string };
  const accepts = offer.accepts ?? [];
  const req = accepts.find((r) => supported(r));
  if (!req) return { status: "refused", reason: "no payment option quietsend supports (exact USDC on base-sepolia)", requirements: accepts };
  const amount = BigInt(req.maxAmountRequired);
  if (amount > opts.maxAmountBase) {
    return { status: "refused", reason: `price ${amount} base units is above the caller's max ${opts.maxAmountBase}`, requirements: accepts };
  }
  if (!isEvmAddress(req.payTo)) return { status: "refused", reason: `payTo is not an EVM address: ${req.payTo}` };
  const chain = supported(req)!;
  log(`402: ${req.description ?? req.resource} costs ${amount} base units on ${chain}, pay to ${req.payTo}`);

  const signed = await signEvmAuthorization({
    chain,
    nearAccount: opts.nearAccount,
    agentKey: opts.agentKey,
    to: req.payTo,
    amountBase: amount,
    windowSeconds: Math.min(Math.max(req.maxTimeoutSeconds || 60, 30), 600),
    log,
  });
  if (signed.status === "needs_approval") return { ...signed, requirements: req };

  const a = signed.authorization;
  const payment: PaymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: chain,
    payload: {
      signature: signed.signature,
      authorization: { from: a.from, to: a.to, value: a.value.toString(), validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), nonce: a.nonce },
    },
  };
  const headers = new Headers(opts.init?.headers);
  headers.set("X-PAYMENT", enc(payment));
  const second = await fetch(url, { ...opts.init, headers });
  const settle = second.headers.get("X-PAYMENT-RESPONSE");
  const settled = settle ? dec<{ success?: boolean; transaction?: string; network?: string }>(settle) : undefined;
  const body = await second.text();
  if (second.status === 402) return { status: "refused", reason: `server refused the payment: ${body.slice(0, 300)}` };
  return {
    status: "paid",
    httpStatus: second.status,
    body,
    paid: {
      chain,
      amountBase: amount.toString(),
      payTo: req.payTo,
      from: a.from,
      nearTxHash: signed.nearTxHash,
      settlementTx: settled?.transaction,
      explorer: settled?.transaction ? EVM_CHAINS[chain].explorerTx(settled.transaction) : undefined,
    },
  };
}

// ---------------- server (the paid endpoint) ----------------

export function paymentRequired(req: PaymentRequirements, error = "X-PAYMENT header is required") {
  return { x402Version: 1, error, accepts: [req] };
}

/** Check an X-PAYMENT header against what we asked for. Returns the authorization or a reason. */
export async function verifyPayment(
  header: string,
  req: PaymentRequirements,
): Promise<{ ok: true; chain: EvmChainName; auth: Authorization; vrs: { v: number; r: Hex; s: Hex } } | { ok: false; reason: string }> {
  let p: PaymentPayload;
  try {
    p = dec<PaymentPayload>(header);
  } catch {
    return { ok: false, reason: "X-PAYMENT is not base64 JSON" };
  }
  const chain = supported(req);
  if (!chain || p.scheme !== "exact" || p.network !== req.network) return { ok: false, reason: "wrong scheme or network" };
  const x = p.payload?.authorization;
  const sig = p.payload?.signature;
  if (!x || !sig || !/^0x[0-9a-fA-F]{130}$/.test(sig)) return { ok: false, reason: "malformed payload" };
  if (x.to.toLowerCase() !== req.payTo.toLowerCase()) return { ok: false, reason: "pays the wrong address" };
  if (BigInt(x.value) < BigInt(req.maxAmountRequired)) return { ok: false, reason: "amount below price" };
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(x.validBefore) <= now + 5n || BigInt(x.validAfter) > now) return { ok: false, reason: "authorization not currently valid" };
  const auth: Authorization = {
    from: x.from,
    to: x.to,
    value: BigInt(x.value),
    validAfter: BigInt(x.validAfter),
    validBefore: BigInt(x.validBefore),
    nonce: x.nonce,
  };
  const vrs = { r: ("0x" + sig.slice(2, 66)) as Hex, s: ("0x" + sig.slice(66, 130)) as Hex, v: parseInt(sig.slice(130, 132), 16) };
  const signer = await recoverAuthorizer(chain, auth, vrs);
  if (signer.toLowerCase() !== auth.from.toLowerCase()) return { ok: false, reason: "signature does not match from" };
  return { ok: true, chain, auth, vrs };
}

/** Submit the authorization on-chain (the server pays gas) and build X-PAYMENT-RESPONSE. */
export async function settlePayment(v: { chain: EvmChainName; auth: Authorization; vrs: { v: number; r: Hex; s: Hex } }, gasKey: Hex) {
  const { txHash } = await relayAuthorization(v.chain, v.auth, v.vrs, gasKey);
  return { txHash, header: enc({ success: true, transaction: txHash, network: v.chain, payer: v.auth.from }) };
}
