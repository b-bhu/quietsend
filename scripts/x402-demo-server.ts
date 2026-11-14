// A tiny paid API for testing quietsend's 402 flow. Testnet only.
//   npx tsx scripts/x402-demo-server.ts            → http://localhost:4021/premium
// GET /premium costs 0.01 USDC on Base Sepolia, paid to PAY_TO. The server settles the
// agent's authorization itself and pays the gas with the relayer key (.keys/base-relayer.json),
// the way an x402 facilitator would.
import { createServer } from "node:http";
import { paymentRequired, settlePayment, verifyPayment, type PaymentRequirements } from "../core/x402.ts";
import { EVM_CHAINS } from "../core/evm.ts";
import { loadRelayerKey } from "../mcp/keys.ts";
import { privateKeyToAccount } from "viem/accounts";

const PORT = Number(process.env.PORT ?? 4021);
const gasKey = loadRelayerKey();
// Default payee: the relayer's own address, so a demo payment stays inside wallets we control.
const PAY_TO = process.env.PAY_TO ?? privateKeyToAccount(gasKey).address;
const PRICE_BASE = process.env.PRICE_BASE ?? "10000"; // 0.01 USDC

const requirements = (resource: string): PaymentRequirements => ({
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: PRICE_BASE,
  resource,
  description: "quietsend demo: one premium answer",
  mimeType: "application/json",
  payTo: PAY_TO,
  maxTimeoutSeconds: 120,
  asset: EVM_CHAINS["base-sepolia"].usdc,
  extra: { name: "USDC", version: "2" },
});

const seen = new Set<string>(); // nonces already settled by this server

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const json = (code: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(code, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  if (url.pathname !== "/premium") return json(404, { error: "try GET /premium" });
  const reqs = requirements(url.href);
  const header = req.headers["x-payment"];
  if (typeof header !== "string") return json(402, paymentRequired(reqs));

  const v = await verifyPayment(header, reqs);
  if (!v.ok) {
    console.error("refused:", v.reason);
    return json(402, paymentRequired(reqs, v.reason));
  }
  if (seen.has(v.auth.nonce)) return json(402, paymentRequired(reqs, "nonce already used"));
  try {
    const s = await settlePayment(v, gasKey);
    seen.add(v.auth.nonce);
    console.error(`settled ${v.auth.value} base units from ${v.auth.from}: ${EVM_CHAINS["base-sepolia"].explorerTx(s.txHash)}`);
    return json(200, { answer: "The premium answer is 42.", paidBy: v.auth.from, settlement: s.txHash }, { "X-PAYMENT-RESPONSE": s.header });
  } catch (e) {
    console.error("settlement failed:", e instanceof Error ? e.message : e);
    return json(402, paymentRequired(reqs, "settlement failed"));
  }
}).listen(PORT, () => console.error(`x402 demo on http://localhost:${PORT}/premium — ${Number(PRICE_BASE) / 1e6} USDC to ${PAY_TO}`));
