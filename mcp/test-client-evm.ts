// Spawns mcp/server.ts over stdio and exercises the Base Sepolia + 402 tools, as an agent would.
// Needs the x402 demo server running: npx tsx scripts/x402-demo-server.ts
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAY_TO = process.env.PAY_TO ?? "0xEA70C99BA5aad8C0128122B5aFb588161C2671a0";

type ToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean; structuredContent?: unknown };
const data = (r: ToolResult) => (r.structuredContent ?? JSON.parse(r.content?.[0]?.text ?? "{}")) as Record<string, any>;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(ROOT, "node_modules/tsx/dist/cli.mjs"), resolve(ROOT, "mcp/server.ts")],
  cwd: ROOT,
  env: { ...process.env, NEAR_ACCOUNT: process.env.NEAR_ACCOUNT ?? "bibhu-usdc.testnet" } as Record<string, string>,
  stderr: "pipe",
});
const client = new Client({ name: "quietsend-evm-test", version: "0.1.0" });
await client.connect(transport);
const call = async (name: string, args: Record<string, unknown>) => {
  const r = (await client.callTool({ name, arguments: args })) as ToolResult;
  const d = data(r);
  console.log(`\n${name} ${JSON.stringify(args)}\n→ ${r.isError ? "ERROR " : ""}${JSON.stringify(d, null, 2)}`);
  return d;
};

const tools = (await client.listTools()).tools.map((t) => t.name);
console.log("tools:", tools.join(", "));
await call("get_address_and_balance", { chain: "base-sepolia" });
await call("send", { chain: "base-sepolia", recipient: PAY_TO, amount_usdc: "0.01", mode: "normal", signer_backend: "policy" });
await call("send", { chain: "base-sepolia", recipient: PAY_TO, amount_usdc: "0.01", mode: "hide_recipient" });
await call("fetch_paid", { url: "http://localhost:4021/premium", max_amount_usdc: "0.05" });
await client.close();
