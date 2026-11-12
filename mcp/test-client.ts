// Spawns mcp/server.ts over stdio and exercises the tools against devnet.
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT = "bibhu-usdc.testnet";
const EXPECTED = "7snfiiW6ZP2pgACBx3ZtKKcpNwTk74gGGQPRtxDVnt27";
const EXPECTED_POLICY = "5NdtJHkHvpayzyX4DmWniVNz7s1W4785BPqPuWJmo9Ao";
const RECIPIENT = "7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C";

function parseTool(result: { content?: Array<{ type: string; text?: string }>; isError?: boolean; structuredContent?: unknown }) {
  const text = result.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "";
  let data: any = result.structuredContent;
  if (data == null && text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
  }
  if (result.isError) {
    const msg = data?.error ?? text;
    throw new Error(String(msg));
  }
  return data;
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(ROOT, "node_modules/tsx/dist/cli.mjs"), resolve(ROOT, "mcp/server.ts")],
    cwd: ROOT,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (buf: Buffer) => {
    const s = buf.toString();
    if (s.trim()) process.stderr.write("[server] " + s);
  });

  const policyOnly = process.argv.includes("--policy-only");
  const client = new Client({ name: "quietsend-test", version: "0.2.0" });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name);
    console.log("TOOLS", names.join(", "));
    if (!["get_address_and_balance", "quote_send", "send", "get_receipt"].every((n) => names.includes(n))) {
      throw new Error("Missing expected tools: " + names.join(", "));
    }

    const addr = parseTool(
      await client.callTool({ name: "get_address_and_balance", arguments: { near_account: ACCOUNT, mode: "human" } }),
    );
    console.log("ADDRESS", JSON.stringify({ nearAccount: addr.nearAccount, mode: addr.mode, solanaAddress: addr.solanaAddress, sol: addr.sol, usdc: addr.usdc }));
    if (addr.solanaAddress !== EXPECTED) throw new Error("Unexpected address " + addr.solanaAddress);

    const quote = parseTool(
      await client.callTool({
        name: "quote_send",
        arguments: { recipient: RECIPIENT, amount_usdc: "0.1", mode: "normal", signer_backend: "human", near_account: ACCOUNT },
      }),
    );
    console.log("QUOTE", JSON.stringify({ feeUsdc: quote.feeUsdc, totalDebitUsdc: quote.totalDebitUsdc, approval: quote.approval, privacy: quote.privacy?.length }));

    if (policyOnly) {
      console.log("SKIP human live send (--policy-only)");
    } else {
    console.log("SEND starting 0.1 USDC normal / human…");
    const sent = parseTool(
      await client.callTool({
        name: "send",
        arguments: { recipient: RECIPIENT, amount_usdc: "0.1", mode: "normal", signer_backend: "human", near_account: ACCOUNT },
      }),
    );
    const explorer = sent.receipt?.legs?.[0]?.explorer ?? (sent.solanaTx ? `https://explorer.solana.com/tx/${sent.solanaTx}?cluster=devnet` : undefined);
    console.log("SEND status=", sent.status, "receiptId=", sent.receiptId);
    console.log("EXPLORER", explorer);

    const receipt = parseTool(await client.callTool({ name: "get_receipt", arguments: { id: sent.receiptId } }));
    console.log("RECEIPT", JSON.stringify({
      id: receipt.id,
      mode: receipt.mode,
      status: receipt.status,
      amountUsdc: receipt.amountUsdc,
      recipient: receipt.recipient,
      nearExplorer: receipt.nearExplorer,
      legs: receipt.legs?.map((l: any) => ({ name: l.name, explorer: l.explorer })),
      privacy: receipt.privacy,
      summary: receipt.summary,
    }, null, 2));

    if (!explorer) throw new Error("Send did not return an explorer link");
    }

    const policyAddr = parseTool(
      await client.callTool({ name: "get_address_and_balance", arguments: { near_account: ACCOUNT, mode: "policy" } }),
    );
    console.log("POLICY ADDRESS", JSON.stringify({ nearAccount: policyAddr.nearAccount, mode: policyAddr.mode, solanaAddress: policyAddr.solanaAddress, sol: policyAddr.sol, usdc: policyAddr.usdc }));
    if (policyAddr.solanaAddress !== EXPECTED_POLICY) throw new Error("Unexpected policy address " + policyAddr.solanaAddress);

    const policyQuote = parseTool(
      await client.callTool({
        name: "quote_send",
        arguments: { recipient: RECIPIENT, amount_usdc: "0.1", mode: "normal", signer_backend: "policy", near_account: ACCOUNT },
      }),
    );
    console.log("POLICY QUOTE", JSON.stringify({ feeUsdc: policyQuote.feeUsdc, totalDebitUsdc: policyQuote.totalDebitUsdc, approval: policyQuote.approval, approvalNote: policyQuote.approvalNote }));

    console.log("POLICY SEND starting 0.1 USDC normal / policy…");
    const policySent = parseTool(
      await client.callTool({
        name: "send",
        arguments: { recipient: RECIPIENT, amount_usdc: "0.1", mode: "normal", signer_backend: "policy", near_account: ACCOUNT },
      }),
    );
    const policyExplorer = policySent.receipt?.legs?.[0]?.explorer ?? (policySent.solanaTx ? `https://explorer.solana.com/tx/${policySent.solanaTx}?cluster=devnet` : undefined);
    console.log("POLICY SEND status=", policySent.status, "receiptId=", policySent.receiptId);
    console.log("POLICY EXPLORER", policyExplorer);

    const policyReceipt = parseTool(await client.callTool({ name: "get_receipt", arguments: { id: policySent.receiptId } }));
    console.log("POLICY RECEIPT", JSON.stringify({
      id: policyReceipt.id,
      mode: policyReceipt.mode,
      signerBackend: policyReceipt.signerBackend,
      status: policyReceipt.status,
      solanaAddress: policyReceipt.solanaAddress,
      amountUsdc: policyReceipt.amountUsdc,
      recipient: policyReceipt.recipient,
      nearExplorer: policyReceipt.nearExplorer,
      legs: policyReceipt.legs?.map((l: any) => ({ name: l.name, explorer: l.explorer })),
      privacy: policyReceipt.privacy,
      summary: policyReceipt.summary,
    }, null, 2));

    if (!policyExplorer) throw new Error("Policy send did not return an explorer link");
    if (policyReceipt.solanaAddress !== EXPECTED_POLICY) throw new Error("Policy receipt is not from the policy-mode address");
    console.log("OK");
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
