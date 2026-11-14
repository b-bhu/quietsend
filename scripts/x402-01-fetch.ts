// Agent side of the 402 demo: fetch a paid URL, paying through the policy contract.
//   npx tsx scripts/x402-demo-server.ts &      (in another terminal)
//   npx tsx scripts/x402-01-fetch.ts [url] [max USDC]
import { fetchPaid } from "../core/x402.ts";
import { parseUsdc } from "../core/index.ts";
import { resolveAccount, loadPolicyKey } from "../mcp/keys.ts";

const DEFAULT_ACCOUNT = resolveAccount();

const url = process.argv[2] ?? "http://localhost:4021/premium";
const max = parseUsdc(process.argv[3] ?? "0.05");
const r = await fetchPaid(url, { nearAccount: DEFAULT_ACCOUNT, agentKey: loadPolicyKey(DEFAULT_ACCOUNT), maxAmountBase: max, log: (m) => console.log("  ·", m) });
console.log(JSON.stringify(r, null, 2));
