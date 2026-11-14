// quietsend MCP server (stdio). Log only to stderr — stdout is the protocol.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import {
  buildReceipt,
  classifyRecipient,
  derivePolicySolanaAddress,
  derivePolicyEvmAddress,
  deriveSolanaAddress,
  EVM_CHAINS,
  getConfig,
  getEvmBalances,
  sendEvmUsdc,
  formatUsdc,
  getBalances,
  getConnection,
  hideRecipientDebit,
  inspectTx,
  mpcSignViaKey,
  mpcSignViaPolicy,
  NeedsApprovalError,
  parseUsdc,
  quotePrivacyPreview,
  runSend,
  viewPolicy,
  type Mode,
  type Receipt,
} from "../core/index.ts";
import { fetchPaid } from "../core/x402.ts";
import { resolveAccount, loadPolicyKey, loadPrivateKey, loadRelayerKey } from "./keys.ts";
import { getStoredReceipt, saveReceipt } from "./receipts.ts";

const log = (...args: unknown[]) => console.error("[quietsend]", ...args);

const SignerBackend = z.enum(["human", "policy"]);
const SendMode = z.enum(["normal", "hide_recipient"]);
const Chain = z.enum(["solana-devnet", "base-sepolia"]);
const jsonSafe = <T>(o: T): T => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

function asMode(mode: "normal" | "hide_recipient"): Mode {
  return mode === "hide_recipient" ? "hide" : "normal";
}

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
    isError,
  };
}

function errResult(message: string) {
  log("error:", message);
  return textResult({ error: message }, true);
}

async function addressFor(nearAccount: string, backend: "human" | "policy"): Promise<string> {
  if (backend === "policy") return derivePolicySolanaAddress(nearAccount);
  return deriveSolanaAddress(nearAccount);
}

function createServer(): McpServer {
  const server = new McpServer({ name: "quietsend", version: "0.2.0" });

  server.registerTool(
    "get_address_and_balance",
    {
      title: "Get address and balance",
      description:
        "Derive the agent's address for a NEAR testnet account and read its balances. chain=solana-devnet (default): mode=human uses (account, solana-1); mode=policy uses (policy contract, account/solana-1). chain=base-sepolia: the policy address (policy contract, account/evm-1). Testnet only. Never returns keys.",
      inputSchema: z.object({
        near_account: z.string().optional().describe("NEAR testnet account. Defaults to the configured account."),
        mode: SignerBackend.optional().describe("human (default) or policy (agent address)."),
        chain: Chain.optional().describe("solana-devnet (default) or base-sepolia (policy/agent address only)."),
      }),
    },
    async ({ near_account, mode, chain }) => {
      try {
        const nearAccount = resolveAccount(near_account);
        if (chain === "base-sepolia") {
          const address = await derivePolicyEvmAddress(nearAccount);
          const bal = await getEvmBalances("base-sepolia", address);
          return textResult({
            nearAccount,
            chain,
            mode: "policy",
            address,
            usdc: formatUsdc(bal.usdcBase),
            usdcBase: bal.usdcBase.toString(),
            eth: (Number(bal.eth) / 1e18).toString(),
            note: "Gasless: this address needs USDC only. A relayer pays gas for each transfer.",
            explorer: EVM_CHAINS["base-sepolia"].explorerAddr(address),
          });
        }
        const backend = mode ?? "human";
        const solanaAddress = await addressFor(nearAccount, backend);
        const bal = await getBalances(solanaAddress);
        return textResult({
          nearAccount,
          mode: backend,
          solanaAddress,
          sol: bal.sol,
          usdc: formatUsdc(bal.usdcBase),
          usdcBase: bal.usdcBase.toString(),
        });
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "quote_send",
    {
      title: "Quote a USDC send",
      description:
        "Preview a Normal or Hide-recipient USDC send on Solana devnet: fee, total debit, whether it would need approval, and a PUBLIC/HIDDEN table. Does not send.",
      inputSchema: z.object({
        recipient: z.string().describe("Recipient Solana address."),
        amount_usdc: z.string().describe('Amount in USDC, for example "0.1".'),
        mode: SendMode.describe("normal or hide_recipient."),
        signer_backend: SignerBackend.optional().describe("human (default) or policy."),
        near_account: z.string().optional(),
      }),
    },
    async ({ recipient, amount_usdc, mode, signer_backend, near_account }) => {
      try {
        const amountBase = parseUsdc(amount_usdc);
        const feeBase = mode === "hide_recipient" ? amountBase / 1000n + 1n : 0n;
        const totalDebit = mode === "hide_recipient" ? hideRecipientDebit(amountBase) : amountBase;
        const backend = signer_backend ?? "human";
        const nearAccount = resolveAccount(near_account);
        let warning: string | undefined;
        try {
          const check = await classifyRecipient(getConnection(), recipient);
          warning = check.warning;
        } catch {
          // quote should still work if the RPC lookup fails
        }
        let approval: "under_limit" | "needs_approval" | "rejected" | "policy_contract_not_deployed" = "under_limit";
        let approvalNote =
          backend === "human"
            ? "Human mode has no on-chain spending cap; the account key authorizes the sign call directly."
            : `Policy limits are enforced by ${getConfig().policyContract}.`;
        if (backend === "policy") {
          const policy = await viewPolicy(nearAccount);
          if (policy === "not_deployed") {
            approval = "policy_contract_not_deployed";
            approvalNote = "policy contract not deployed yet";
          } else if (policy === "no_policy") {
            approval = "rejected";
            approvalNote = `no policy set for ${nearAccount}; the owner must call set_policy first`;
          } else {
            const per = BigInt(policy.per_transfer);
            const daily = BigInt(policy.daily);
            const cap = BigInt(policy.cap);
            const spent = BigInt(policy.spent_today);
            if (amountBase > cap) {
              approval = "rejected";
              approvalNote = `amount exceeds the hard cap of ${formatUsdc(cap)} USDC`;
            } else if (amountBase > per || spent + amountBase > daily) {
              approval = "needs_approval";
              approvalNote = `over the agent cap (per transfer ${formatUsdc(per)} USDC, daily ${formatUsdc(daily)} USDC, spent today ${formatUsdc(spent)} USDC); the owner must approve`;
            } else {
              approval = "under_limit";
              approvalNote = `within policy (per transfer ${formatUsdc(per)} USDC, daily ${formatUsdc(daily)} USDC, spent today ${formatUsdc(spent)} USDC)`;
            }
          }
        }
        return textResult({
          nearAccount,
          signerBackend: backend,
          mode,
          recipient,
          amountUsdc: amount_usdc,
          feeUsdc: formatUsdc(feeBase),
          feeNote:
            mode === "hide_recipient"
              ? "MagicBlock charges 0.1% (plus 1 base unit of rounding). SOL rent/fees are separate."
              : "No USDC fee. The sender pays a small amount of devnet SOL for the transaction.",
          totalDebitUsdc: formatUsdc(totalDebit),
          approval,
          approvalNote,
          recipientWarning: warning,
          privacy: quotePrivacyPreview(asMode(mode)),
        });
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "send",
    {
      title: "Send USDC",
      description:
        "Send USDC from the derived address. chain=solana-devnet (default): mode=normal is a public SPL transfer; mode=hide_recipient uses MagicBlock (two legs) with pre-sign guards. signer_backend=human calls v1.signer-prod.testnet with the account key; policy calls the policy contract's sign_for_caller. chain=base-sepolia: always the policy contract (sign_evm_for_caller), mode=normal only, gasless for the agent (EIP-3009, a relayer pays gas); the same USDC limits apply across both chains. Testnet only. Never returns keys.",
      inputSchema: z.object({
        recipient: z.string().describe("Solana address, or 0x address for base-sepolia."),
        amount_usdc: z.string(),
        mode: SendMode,
        signer_backend: SignerBackend.optional().describe("human (default) or policy. base-sepolia is always policy."),
        near_account: z.string().optional(),
        chain: Chain.optional().describe("solana-devnet (default) or base-sepolia."),
      }),
    },
    async ({ recipient, amount_usdc, mode, signer_backend, near_account, chain }) => {
      const backend = signer_backend ?? "human";
      let nearAccount: string;
      try {
        nearAccount = resolveAccount(near_account);
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
      const hide = asMode(mode);
      if (chain === "base-sepolia") {
        if (mode !== "normal") return errResult("hide_recipient is Solana-only (MagicBlock). On base-sepolia use mode=normal.");
        if (signer_backend === "human") return errResult("base-sepolia sends go through the policy contract only; use signer_backend=policy.");
        try {
          const res = await sendEvmUsdc({
            chain,
            nearAccount,
            agentKey: loadPolicyKey(nearAccount),
            relayerKey: loadRelayerKey(),
            to: recipient,
            amountBase: parseUsdc(amount_usdc),
            log: (m) => log(m),
          });
          return textResult(jsonSafe({ ...res, amount_usdc }));
        } catch (e) {
          return errResult(e instanceof Error ? e.message : String(e));
        }
      }
      try {
        const key = backend === "policy" ? loadPolicyKey(nearAccount) : loadPrivateKey(nearAccount); // never logged
        const solanaAddress = await addressFor(nearAccount, backend);
        log(`send ${mode} ${amount_usdc} USDC via ${backend} from ${nearAccount} / ${solanaAddress.slice(0, 6)}…`);

        if (backend === "policy") {
          // Build-and-sign through the policy contract. If it is not deployed, fail clearly
          // before we construct a Solana transaction that would expire.
          // runSend's sign callback is what actually calls the contract; we still need to
          // surface needs_approval without broadcasting.
          let policyStatus: "signed" | "needs_approval" | undefined;
          const rec = await runSend(
            {
              sign: async (message, onHash) => {
                const result = await mpcSignViaPolicy(
                  nearAccount,
                  key,
                  message,
                  { recipient, amountBase: parseUsdc(amount_usdc), mode: hide },
                  onHash,
                );
                if (result.status === "needs_approval") {
                  policyStatus = "needs_approval";
                  throw new NeedsApprovalError({ intentId: result.intentId, nearTxHash: result.nearTxHash, reason: result.reason });
                }
                policyStatus = "signed";
                return { signature: result.signature, nearTxHash: result.nearTxHash };
              },
              nearAccount,
              path: `${nearAccount}/solana-1`,
              solanaAddress,
              recipient,
              amountUi: amount_usdc,
              mode: hide,
              policyPayload: true,
            },
            (m) => log(m),
          );
          const receipt = await buildReceipt(rec, { signerBackend: "policy" });
          saveReceipt(receipt);
          return textResult({
            status: policyStatus ?? "signed",
            receiptId: rec.id,
            nearTx: rec.nearTxHash,
            solanaTx: rec.leg1Sig,
            receipt,
          });
        }

        const rec = await runSend(
          {
            sign: (message, onHash) => mpcSignViaKey(nearAccount, key, message, onHash),
            nearAccount,
            solanaAddress,
            recipient,
            amountUi: amount_usdc,
            mode: hide,
          },
          (m) => log(m),
        );
        const receipt = await buildReceipt(rec, { signerBackend: "human" });
        saveReceipt(receipt);
        return textResult({
          status: rec.status === "failed" ? "rejected" : "signed",
          receiptId: rec.id,
          nearTx: rec.nearTxHash,
          solanaTx: rec.leg1Sig,
          leg2Tx: rec.leg2Sig,
          receipt,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (e instanceof NeedsApprovalError || message === "needs_approval") {
          const extra = e instanceof NeedsApprovalError ? e : undefined;
          return textResult({
            status: "needs_approval",
            nearAccount,
            mode,
            recipient,
            amount_usdc,
            intentId: extra?.intentId,
            nearTx: extra?.nearTxHash,
            reason: extra?.reason,
          });
        }
        if (message.includes("policy contract not deployed yet")) {
          return errResult("policy contract not deployed yet");
        }
        return errResult(message);
      }
    },
  );

  server.registerTool(
    "fetch_paid",
    {
      title: "Fetch a paid URL (HTTP 402)",
      description:
        "GET a URL. If it answers HTTP 402 with an x402 'exact' USDC offer on base-sepolia, pay it through the policy contract (same limits as send; over-limit returns needs_approval and nothing is paid) and retry with the X-PAYMENT header. The server settles on-chain and pays gas. max_amount_usdc is a hard ceiling for this call. Testnet only.",
      inputSchema: z.object({
        url: z.string().url(),
        max_amount_usdc: z.string().describe('Most this call may pay, in USDC, e.g. "0.05".'),
        near_account: z.string().optional(),
      }),
    },
    async ({ url, max_amount_usdc, near_account }) => {
      try {
        const nearAccount = resolveAccount(near_account);
        const r = await fetchPaid(url, {
          nearAccount,
          agentKey: loadPolicyKey(nearAccount),
          maxAmountBase: parseUsdc(max_amount_usdc),
          log: (m) => log(m),
        });
        return textResult(jsonSafe(r), r.status === "refused");
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "get_receipt",
    {
      title: "Get a send receipt",
      description:
        "Return a JSON receipt for a previous send: legs, amounts, explorer links, and a PUBLIC/HIDDEN table consistent with the web Explorer page. Pass a receipt id or a Solana/NEAR transaction hash.",
      inputSchema: z.object({
        id: z.string().describe("Receipt id, Solana transaction signature, or NEAR transaction hash."),
      }),
    },
    async ({ id }) => {
      try {
        const stored = getStoredReceipt(id);
        if (stored) return textResult(stored);
        const view = await inspectTx(id).catch(() => undefined);
        if (!view) return errResult("No receipt with that id, and no Solana devnet transaction with that signature, was found.");
        // Rebuild a minimal receipt from the chain so a judge can inspect a published tx.
        const reconstructed: Receipt = {
          id,
          mode: "normal",
          status: view.err ? "failed" : "confirmed",
          nearAccount: "",
          path: "",
          solanaAddress: view.signers[0] ?? "",
          solanaExplorer: `https://explorer.solana.com/address/${view.signers[0] ?? ""}?cluster=devnet`,
          recipient: "",
          amountUsdc: "",
          legs: [
            {
              name: "leg1",
              role: "on-chain transaction",
              signature: view.signature,
              explorer: `https://explorer.solana.com/tx/${view.signature}?cluster=devnet`,
              signers: view.signers,
              accounts: view.accounts,
              usdcChanges: view.usdcChanges.map((c) => ({ owner: c.owner, deltaUsdc: formatUsdc(c.deltaBase) })),
            },
          ],
          privacy: [],
          summary:
            "Reconstructed from a Solana signature only (not a quietsend receipt id). See signers, accounts and USDC changes; PUBLIC/HIDDEN claims need the original send context.",
        };
        return textResult(reconstructed);
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  return server;
}

log("starting stdio server");
serveStdio(createServer, { onerror: (e) => log(e) });
