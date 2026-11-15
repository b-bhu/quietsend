# Developer guide

quietsend lets an agent send USDC on **Solana devnet** and **Base Sepolia** from a NEAR testnet account, through NEAR Chain Signatures. The agent's key can only ask the policy contract `policy.quietsend.testnet` for a signature, and the contract enforces limits the account owner sets.

Testnet only. Test USDC has no value.

## Quickstart

```bash
git clone https://github.com/b-bhu/quietsend && cd quietsend && npm install
```

Put your NEAR testnet account's full-access key at `.keys/you.testnet.json`. This is the same format as the near CLI's legacy keychain file, `~/.near-credentials/testnet/you.testnet.json`. The folder is gitignored.

```bash
NEAR_ACCOUNT=you.testnet npm run setup-agent -- --per 1 --daily 3 --cap 5
```

This sets your limits, prepays signing fees, and creates the agent's key at `.keys/you.testnet.policy-fc.json`. That key can call only `sign_for_caller` and `sign_evm_for_caller`. The script then prints three addresses to fund:

| Address | Fund with | Where |
|---|---|---|
| Agent, Solana | devnet USDC and about 0.05 SOL | USDC: [faucet.circle.com](https://faucet.circle.com) (Solana Devnet). SOL: [faucet.solana.com](https://faucet.solana.com) |
| Agent, Base | Base Sepolia USDC only, no ETH | [faucet.circle.com](https://faucet.circle.com) (Base Sepolia) |
| Relayer | a little Base Sepolia ETH. It pays gas for the agent's Base sends | [Coinbase Developer Platform faucet](https://portal.cdp.coinbase.com/products/faucet) (sign-in, no mainnet balance needed) |

Some Base Sepolia ETH faucets only pay addresses that hold mainnet ETH, which a new relayer never will. The Coinbase faucet does not have that rule. Alternatively, claim to your own wallet and forward a little.

Re-run `setup-agent` with new values at any time to change the limits.

## Connect

The MCP server runs on your machine over stdio, so your keys stay local.

**Every AI app at once**

```bash
NEAR_ACCOUNT=you.testnet npm run connect
```

This finds Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex and Gemini CLI and adds `quietsend` to each one that is installed. It backs up each config it changes (`*.quietsend.bak`) and leaves alone a file it cannot parse. Add `-- --dry-run` to preview, `-- --only cursor,vscode` to pick apps, `-- --remove` to undo.

Or tell your agent `Set up quietsend from https://quietsend.vercel.app/install`. It reads [INSTALL.md](INSTALL.md) and runs these steps itself.

**Claude Code**

```bash
claude mcp add quietsend -e NEAR_ACCOUNT=you.testnet -- npx tsx /path/to/quietsend/mcp/server.ts
```

**Claude Desktop, Cursor, Windsurf.** Put this in the app's MCP config. VS Code uses `servers` instead of `mcpServers`.

```json
{
  "mcpServers": {
    "quietsend": {
      "command": "npx",
      "args": ["tsx", "/path/to/quietsend/mcp/server.ts"],
      "env": { "NEAR_ACCOUNT": "you.testnet" }
    }
  }
}
```

**ChatGPT, Grok.** These connect only to remote MCP servers at a public URL. Hosting this server would mean hosting your agent's key, so it is not offered.

**Node**

```ts
import { sendEvmUsdc } from "./core/index.ts";
import { fetchPaid } from "./core/x402.ts";
import { loadPolicyKey, loadRelayerKey } from "./mcp/keys.ts";

const res = await sendEvmUsdc({
  chain: "base-sepolia",
  nearAccount: "you.testnet",
  agentKey: loadPolicyKey("you.testnet"),
  relayerKey: loadRelayerKey(),
  to: "0x…",
  amountBase: 10_000n, // 0.01 USDC
});

const page = await fetchPaid("https://api.example/paid", {
  nearAccount: "you.testnet",
  agentKey: loadPolicyKey("you.testnet"),
  maxAmountBase: 50_000n,
});
```

## Tools

| Tool | Arguments | Does |
|---|---|---|
| `get_address_and_balance` | `chain?`, `mode?` (`policy` / `human`), `near_account?` | Derives the address and reads its balances |
| `quote_send` | `recipient`, `amount_usdc`, `mode`, `chain?`, `signer_backend?` | Shows the fee, the balance on Base, and whether the contract would sign it, hold it for approval or refuse it. Sends nothing |
| `send` | `recipient`, `amount_usdc`, `mode`, `chain?`, `signer_backend?` | Sends USDC |
| `fetch_paid` | `url`, `max_amount_usdc` | GETs a URL. On HTTP 402 it pays (x402 v1, `exact`, USDC on `base-sepolia`) and retries |
| `get_receipt` | `id` | A receipt for a past send, on Solana or Base: a receipt id, a Solana signature, a Base `0x` hash or a NEAR hash. A hash this server did not send is rebuilt from the chain |

- **`chain`** is `solana-devnet` (the default) or `base-sepolia`.
- **`mode`** is `normal` or `hide_recipient`. `hide_recipient` works on Solana only.
- **`signer_backend`** defaults to `policy`: the contract and its limits. `human` signs with the account's full-access key, with no limits, and the server refuses it unless started with `QUIETSEND_ALLOW_HUMAN=1`. On Base it is always `policy`.

Every agent send returns one of:

```json
{ "status": "sent", "txHash": "0x…", "explorer": "https://…" }
{ "status": "needs_approval", "intentId": "3", "reason": "amount 2000000 is above per_transfer 1000000" }
{ "error": "Policy rejected the send: amount 6000000 is above the hard cap 5000000" }
```

On Solana the success status is `signed`. A Base send that went through also returns a `receiptId`, which `get_receipt` accepts, as it does the `txHash`.

## Limits and approvals

The limits are stored per NEAR account on `policy.quietsend.testnet`. Only the account's full-access key can change them, because each change needs a 1 yoctoNEAR deposit and the agent's key cannot attach one.

| Field | Effect |
|---|---|
| `per_transfer` | Above this, the send waits for approval |
| `daily` | Above this per UTC day, counted across Solana and Base, the send waits |
| `cap` | Above this, the send is refused, even with approval |
| `allowlist` | If set, only these recipients pass without approval. Solana addresses, or `base-sepolia:0x…` in lowercase |

Approve a held send. It can then be used once within 24 hours, by repeating the same request.

```bash
near contract call-function as-transaction policy.quietsend.testnet approve_intent json-args '{"id":"3"}' prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as you.testnet network-config testnet sign-with-access-key-file .keys/you.testnet.json send
```

Use `cancel_intent` the same way to drop one. Read a policy with:

```bash
near contract call-function as-read-only policy.quietsend.testnet get_policy json-args '{"account_id":"you.testnet"}' network-config testnet now
```

## Chains

| | Solana devnet | Base Sepolia |
|---|---|---|
| Agent address | contract + `you.testnet/solana-1`, Ed25519 | contract + `you.testnet/evm-1`, secp256k1 |
| USDC | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Gas | the agent pays SOL | a relayer pays. The agent holds no ETH |
| What is signed | the transaction, parsed and checked by the contract | an EIP-3009 authorization the contract builds itself |
| Hide recipient | yes, through MagicBlock, but off for agents by default | no |

## Errors

| Message | Meaning |
|---|---|
| `No NEAR account` | Set `NEAR_ACCOUNT` or pass `near_account` |
| `no policy set` | Run `setup-agent` |
| `prepaid balance is empty` | Run `setup-agent` again, or call `deposit` with some NEAR |
| `insufficient USDC` | Fund the agent address for that chain. This is checked before signing, so nothing counts against the limits |
| `hide_recipient is Solana-only` | Use `mode: "normal"` on Base |
| `Timed out` or `429` | The public RPC is rate-limiting. Retry, or set your own RPC |

## Verify

```bash
npm test
```

```bash
npm run verify
```

```bash
cd contract && cargo test
```

The first and third need no network or keys. `npm run verify` needs no keys either: it checks the published Solana devnet transactions, and that each Base Sepolia proof moved USDC out of the contract-derived agent address, submitted by someone else. [SECURITY.md](SECURITY.md) covers what this does not protect against.
