# quietsend

**Send USDC on Solana and Base from a NEAR account. No Solana or Ethereum private key exists anywhere: NEAR Chain Signatures sign each payment.**

**Status: NEAR testnet, Solana devnet and Base Sepolia only.** Nothing here touches mainnet. Test USDC has no value.

## What it does

- **Send USDC on Solana, optionally hiding who you paid.** The hide-recipient mode routes the payment through MagicBlock, so no single transaction links you to the recipient.
- **Spending limits that hold.** Give an agent a key that can only ask a NEAR contract for a signature. The contract enforces a per-send limit, a daily limit and a hard cap that you set, on Solana and Base together. Anything over the limit waits for your approval. The agent's key cannot change the limits or approve its own sends.
- **Gasless on Base.** The paying address holds USDC only. A relayer pays the gas and cannot change the amount or the recipient.
- **Pay for APIs.** An agent can pay an HTTP 402 endpoint (x402 `exact`, USDC on Base Sepolia) within the same limits.

## Try it

**Live:** https://quietsend.vercel.app · developer guide at [quietsend.vercel.app/#/docs](https://quietsend.vercel.app/#/docs)

```bash
npm install && npm test
```

55 tests, plus 25 in the Rust contract. No network, no wallet, about a second.

```bash
npm run verify
```

Read-only and needs no keys. It checks the published Solana and Base transactions below against the live chains.

```bash
cd web && npm install && npm run dev
```

The app opens at `localhost:5173`: send at `#/send`, the developer guide at `#/docs`, the guard demo at `#/demo`. To connect an agent, start with the **[developer guide](docs/INTEGRATING.md)**. Agents can also read [llms.txt](llms.txt).

## How it works

1. **Derive.** NEAR's MPC signer (`v1.signer-prod.testnet`) derives a key from *(who is asking, a path label)*. That gives a fixed address on another chain: Ed25519 for Solana, secp256k1 for Base. The same inputs always give the same address, so there is nothing to store.
2. **Check.** Before anything is signed, the bytes are checked. A payment built by MagicBlock goes through the guard (below). A payment with spending limits goes through the policy contract, which parses the Solana transaction, or builds the Base authorization itself, and checks the limits.
3. **Sign.** At least 11 of 16 MPC nodes produce the signature. It is checked locally against the derived address before use.
4. **Send.** The transaction is broadcast to Solana. On Base, a relayer submits the signed authorization.

Example: `bibhu-usdc.testnet` + `solana-1` → `7snfiiW6ZP2pgACBx3ZtKKcpNwTk74gGGQPRtxDVnt27`. Anyone who knows the account and path can recompute this, because both appear in the public NEAR sign call.

## Hiding who you paid

The payment takes two transactions. In the first, you pay MagicBlock's vault and the recipient does not appear. About a second later the vault pays the recipient, and you do not appear. MagicBlock charges 0.1%.

| | Normal | Hide recipient |
|---|---|---|
| Sender | Public | Public in the first transaction. Absent from the second. |
| Recipient | Public | Public in the second transaction. Absent from the first. |
| Sender ↔ recipient link | Public | **Not in either transaction.** It can still be guessed from amount and timing. |
| Amount | Public | Public in both, so it can be matched across them |
| NEAR sign call | Public | Public. It links the NEAR account to the derived address. |
| Trust | NEAR MPC | Unlinking also depends on Intel TDX and MagicBlock. There is no math-only proof. |

A random derivation path would not help, because the path is in the public NEAR call.

## Spending limits

The policy contract is `policy.quietsend.testnet` ([contract/src/lib.rs](contract/src/lib.rs)). Each NEAR account sets its own policy:

| Setting | Effect |
|---|---|
| `per_transfer` | Above this, the send waits for approval |
| `daily` | Above this per UTC day, counted across Solana and Base, the send waits |
| `cap` | Above this, the send is refused, even with approval |
| `allowlist` | If set, only these recipients pass without approval |

**Why the limits hold.** NEAR's signer charges 1 yoctoNEAR per signature, and a NEAR function-call key cannot attach a deposit. So the agent's key cannot call the signer directly. Its only route is the contract. Changing the policy and approving a held send also need a deposit, so only the account's full-access key can do them.

**What the contract signs.** On Solana it parses the transaction and requires exactly one USDC transfer, of the stated amount, to the stated recipient. On Base it signs no transaction at all. It builds an [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) `transferWithAuthorization` digest for the Base Sepolia USDC contract and signs only that, so the signature can only mean "exactly this amount, to this address, within the hour". The client rebuilds the digest independently and refuses to relay unless it recovers to the derived address. A Rust test and a TypeScript test assert the same digest.

Setup for any NEAR testnet account takes one command: `NEAR_ACCOUNT=you.testnet npm run setup-agent`. See the [developer guide](docs/INTEGRATING.md).

## Proof

Everything below is checked by `npm run verify`.

**Solana devnet**

| What | Transaction |
|---|---|
| Normal transfer, 1 USDC | [`3hUZ5hSA…uKgt`](https://explorer.solana.com/tx/3hUZ5hSAwM8XBsxkM1nGVwE2G6UxdwBjS8qaD1wmj3L7WUo9z8bGsZdzVCCZKfi3RpnKQica5tCb16snroE4uKgt?cluster=devnet) |
| Hide recipient, you → vault | [`2w2LRuLn…fxKq7`](https://explorer.solana.com/tx/2w2LRuLninNbG2MbWeCAczuJUaEW9yAxMhVR2GD1JmXEfWdBjvQYDETY6mPMX3uF1WqHPZnUB3CixhvfSLGfxKq7?cluster=devnet) |
| Hide recipient, vault → recipient | [`5cTHDqYs…8dsUk`](https://explorer.solana.com/tx/5cTHDqYssFJx2cfUuXe3LYEpz5f2Q3MfVNuFuqp9Qrw4PJ3WhzqYG1h6ZAD9aEG9HxJpZNAHe3jSJCxN7v88dsUk?cluster=devnet) |
| Send under limits, through the contract | [`2x4tT2BS…QKVJj4`](https://explorer.solana.com/tx/2x4tT2BSRLU3pcBerzDcyQGR224S19imdu2xEw2qcDBRDr4vNT1LUCZgXisXkiqwhU4xibNY3YpeZiCGYCQKVJj4?cluster=devnet) |

**Base Sepolia.** The paying address `0x906f0d04f6b07644a8acfe76a167ae7a859af817` has never sent a transaction itself.

| What | Transaction |
|---|---|
| Send under limits, 0.01 USDC, gas paid by the relayer | [`0x9f97ba15…bd75`](https://sepolia.basescan.org/tx/0x9f97ba15033da937bf1d345a401f5f310a27ac28c1aaa2651a1b1698ce25bd75) |
| The same, through the MCP `send` tool | [`0x98e23fca…89aa`](https://sepolia.basescan.org/tx/0x98e23fcabbe41b4de392c1df1c5b960fb1e138952d030a8fda0724158cda89aa) |
| HTTP 402 payment through `fetch_paid`, settled by the paid server | [`0x39cf7150…fb53`](https://sepolia.basescan.org/tx/0x39cf7150062d714d12a51421f67e592c544b41a56f360179440285bfa7ddfb53) |

A 2 USDC send, over the 1 USDC per-transfer limit, returned `needs_approval` and nothing was signed. A 6 USDC send, over the 5 USDC cap, was refused.

## The guard

NEAR's MPC signs whatever bytes it is given. In hide-recipient mode those bytes come from MagicBlock's API, a third party. [core/guards.ts](core/guards.ts) treats that builder as hostile and refuses before any signature exists unless:

- the transaction has **exactly one required signer**, and it is your derived address
- **every program is on an allowlist.** Address lookup tables are refused.
- **SPL token instructions are only `Transfer` or `TransferChecked`.** `Approve`, `SetAuthority`, `CloseAccount` and `Burn` are refused, on both token programs.
- the source is **your own USDC account** and the mint is USDC
- **a simulation** shows USDC spent between the amount and amount + fee + 0.2%, the owner unchanged, no delegate or close authority, and at most 0.01 SOL spent

The tests in `test/guard-attacks.test.ts` refuse 12 hostile transactions, each for a named reason. `#/demo` runs the same cases (`shared/attack-cases.ts`) in the browser, with a toggle that shows what would be signed without the guard. Five more tests cover the payout matcher. An exact-amount payout from an unrelated payer is refused, because MagicBlock neither signed it nor did it touch MagicBlock's vault.

To confirm the tests would catch a broken guard, break it on purpose:

```bash
sed -i '' 's/const TOKEN_IX_OK = new Set(\[3, 12\]);/const TOKEN_IX_OK = new Set([3, 12, 4, 6, 8, 9]);/' core/guards.ts && npm test; git checkout core/guards.ts
```

Ten tests fail (the attack tests and the demo's shared cases both catch it), then the guard is restored.

The guard runs in the same process that asks for the signature, so it protects against a hostile *transaction builder*, not a hostile frontend or dependency. Spending limits do not rely on it: they live in the contract. [SECURITY.md](docs/SECURITY.md) has the full threat model.

## Limitations

- **Testnet only and unaudited.** Nothing here is a claim about mainnet.
- **Not anonymous.** The derived address follows from the NEAR account and path, both public. In hide-recipient mode, amount and timing still allow correlation. MagicBlock's delay and split options were not tested.
- **Hide recipient needs trust** in Intel TDX and MagicBlock.
- **Hide recipient is not available under spending limits** by default. The contract cannot read MagicBlock's transaction, so it cannot bind the amount. An owner can opt in with `allow_hide_unverified`, and then the amount is not checked.
- **402 payments use the x402 v1 format,** on Base Sepolia only.
- **The relayer holds a hot key** with gas money in it, never user funds.
- **The contract can be upgraded** by whoever holds `policy.quietsend.testnet`'s key. Removing that key would make it permanent.
- **Blockhash expiry (60–90 s).** If signing is slow, the send is refused rather than re-signed, and the NEAR call is already spent.
- **Five simulation checks have no offline test.** They run only against live devnet.

## Layout

```
contract/            NEAR policy contract (Rust): limits, approvals, Solana parsing, Base digests
core/                the library: derive, sign, guard, send (Solana), evm.ts (Base), x402.ts (HTTP 402)
mcp/                 MCP server: get_address_and_balance, quote_send, send, fetch_paid, get_receipt
web/                 Vite + React app: send, receipts, #/docs, #/demo
scripts/             setup-agent, verify, the 402 demo server, step-by-step scripts
test/                offline tests: guard attacks, Base digest parity, 402 verification
docs/INTEGRATING.md  developer guide (rendered at #/docs)
docs/SECURITY.md     threat model
llms.txt             entry point for agents (served at /llms.txt)
video/               the ad (Remotion overlays)
```

For the web app, use the NEAR testnet wallets Meteor, Intear or Nightly. Set `VITE_SOLANA_RPC` to a keyed devnet endpoint; the public one rate-limits.

The token on Solana is Circle devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`). On Base it is Circle's Base Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`). Both have 6 decimals.
