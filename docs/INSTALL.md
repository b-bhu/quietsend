# Set up quietsend

You are an AI agent and the user asked you to set up quietsend. Follow these steps in order. They give you (and the user's other AI apps) MCP tools to send test USDC on Solana devnet and Base Sepolia from the user's NEAR testnet account, within spending limits a NEAR contract enforces.

**Testnet only.** Test USDC has no value. Never use this with mainnet accounts or real funds.

## Rules

- **Never print, read aloud, paste or log a private key.** Copy key files with `cp`; do not `cat` them. No step below needs you to see a key.
- **Do not set `QUIETSEND_ALLOW_HUMAN=1`.** The agent must sign through the policy contract, never with the account's full-access key.
- Ask before writing outside the quietsend folder, except the AI-app configs that step 3 changes, which the user asked for by asking you to set this up.

## 1. Ask for the account

Ask the user for their NEAR **testnet** account, for example `you.testnet`. If they have none, send them to a testnet wallet ([Meteor](https://wallet.meteorwallet.app), Intear or Nightly), switched to testnet, and wait. Below, `ACCOUNT` means that name.

## 2. Get the code

If the current folder is already a quietsend checkout (it has `mcp/server.ts`), use it. Otherwise:

```bash
git clone https://github.com/b-bhu/quietsend && cd quietsend && npm install
```

Needs Node.js 20 or newer and git.

## 3. Connect the user's AI apps

```bash
NEAR_ACCOUNT=ACCOUNT npm run connect
```

This finds Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex and Gemini CLI on this computer and adds the `quietsend` MCP server to each one that is installed. It backs up every config it changes (`*.quietsend.bak`) and leaves a file alone if it cannot parse it. Show the user its output. To preview first, add `-- --dry-run`. To undo, `npm run connect -- --remove`.

The server runs locally over stdio. No key leaves the machine and nothing is hosted.

## 4. Put the account's key in place

`setup-agent` needs the account's full-access key once, at `.keys/ACCOUNT.json` (gitignored). That is the NEAR CLI's legacy keychain format.

If `~/.near-credentials/testnet/ACCOUNT.json` exists, copy it without opening it:

```bash
mkdir -p .keys && cp ~/.near-credentials/testnet/ACCOUNT.json .keys/ && chmod 600 .keys/ACCOUNT.json
```

Otherwise ask the user to export the key from their wallet and save it there themselves, as `{"account_id":"ACCOUNT","public_key":"ed25519:…","private_key":"ed25519:…"}`. Do not offer to type it for them.

## 5. Set the limits and create the agent's key

```bash
NEAR_ACCOUNT=ACCOUNT npm run setup-agent -- --per 1 --daily 3 --cap 5
```

Ask the user for the limits if they care; 1 / 3 / 5 USDC is the default. This sets the limits on `policy.quietsend.testnet`, prepays signing fees (0.01 NEAR), and creates the agent's key at `.keys/ACCOUNT.policy-fc.json`. That key can only ask the contract for a signature, so it cannot raise its own limits.

It prints three addresses. Tell the user to fund them:

| Address | Needs | Faucet |
|---|---|---|
| Agent, Solana | devnet USDC and about 0.05 SOL | [faucet.circle.com](https://faucet.circle.com) (Solana Devnet), [faucet.solana.com](https://faucet.solana.com) |
| Agent, Base | Base Sepolia USDC only | [faucet.circle.com](https://faucet.circle.com) (Base Sepolia) |
| Relayer | a little Base Sepolia ETH, for gas | [Coinbase faucet](https://portal.cdp.coinbase.com/products/faucet) |

## 6. Check it works

Tell the user to restart any AI app that was open during step 3. Then call the `get_address_and_balance` tool (in a new session if your own tools were loaded before step 3). It should return the Solana address with its balances. Run `quote_send` before the first `send`.

A send over the per-transfer or daily limit returns `needs_approval` and signs nothing. The user approves it with their full-access key; see [Limits and approvals](https://quietsend.vercel.app/#/docs/guide).

## Reference

- Developer guide: https://quietsend.vercel.app/docs/INTEGRATING.md
- Threat model: https://quietsend.vercel.app/docs/SECURITY.md
- Overview for agents: https://quietsend.vercel.app/llms.txt
