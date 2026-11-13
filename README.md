# quietsend

**NEAR Chain Signatures will sign any bytes you hand them. quietsend inspects and simulates the Solana transaction first, then asks a NEAR account to sign.**

Send Solana devnet USDC with only a NEAR account — no Solana private key exists anywhere. The sending is the test harness. The contribution is the guard that sits between an untrusted transaction builder and an MPC network that signs without asking questions.

**Status: NEAR testnet + Solana devnet only.** Nothing here touches mainnet. Devnet USDC has no value.

```bash
npm install && npm test
```

44 tests, no network, no wallet, under a second. Most of them are hostile transactions the guard refuses, each for a named reason.

---

## Why the guard is the point

Deriving an address, building a transaction, signing it with Chain Signatures and broadcasting it is NEAR's documented quickstart; `chainsig.js` is in this repo's dependencies and does most of it. That part is not hard.

The hard part is that **the MPC signs whatever message it is given.** In hide-recipient mode the Solana transaction is built by MagicBlock's API — a third party. If that API returns a transaction that delegates your token account, reassigns its owner, closes it, or moves ten times the amount you asked for, a naive client hands those bytes to the MPC and the MPC signs them. There is no "are you sure" step in an MPC network.

So `shared/magicblock-guards.ts` (253 lines) treats the transaction builder as hostile:

- **exactly one required signer,** and it must be the user's own derived address
- **every program on an allowlist** — and anything hidden behind an address lookup table is refused, because a lookup table cannot be resolved without extra fetches
- **SPL token instructions restricted to `Transfer` (3) and `TransferChecked` (12).** `Approve`, `SetAuthority`, `CloseAccount` and `Burn` are refused outright
- **the source must be the user's own USDC associated token account,** and `TransferChecked`'s mint must be USDC
- **simulation before signing:** the transaction is simulated and the user's own accounts are checked — USDC spent is at least the amount and at most amount + reported fee + 0.2%; owner unchanged; no delegate; no close authority; at most 0.01 SOL spent

All of it fails closed, and all of it runs **before** a signature exists.

---

## Every claim, with a command that proves it

No wallet or credentials needed for the first three.

| Claim | Command | What you should see |
|---|---|---|
| The guard refuses 12 classes of hostile transaction, by name | `npm test` | 44 tests pass, under a second, no network |
| You can watch it refuse them in a browser | `cd web && npm run dev`, then open `#/demo` | 12 attack cards, and a toggle showing what happens without the guard |
| The tests actually bite (not vacuous) | see [Proving the tests aren't vacuous](#proving-the-tests-arent-vacuous) | breaking the guard fails tests |
| Scripts and guard typecheck | `npm run typecheck` | exits 0, no output |
| The web app builds | `cd web && npm install && npx tsc -b` | exits 0 |
| The privacy claims hold on chain | `npm run verify` | 20 PASS: leg 1 has no recipient, leg 2 has no sender, both verified against devnet |
| Derivation is real, and cross-checked two independent ways | `npx tsx web/scripts/verify-lib.ts` | 16 PASS, 0 FAIL, exit 0 (needs network) |
| An agent can send under policy | `npm run mcp`, or `npx tsx scripts/p-01-policy-e2e.ts` | function-call key send, `needs_approval`, approve, fresh send |
| The guard refuses a real overcharge from the live MagicBlock API | same command, line "economic check rejects…" | refusal printed with the base-unit amounts |
| A payout is accepted only on exact amount **and** MagicBlock's signer/vault | same command, lines "pollLeg2…" | wrong amounts ignored, real payout found |

`verify-lib.ts` is the honest one to read. It imports the *same* `web/src/lib` modules the browser runs, derives the address through the signer's view call **and** independently via `chainsig.js` local math, asserts the two agree, then hits the live MagicBlock API and devnet RPC. Read-only; it needs no keys. With `--send normal` or `--send hide` it performs a real devnet send using a NEAR key in the gitignored `.keys/`.

### Proving the tests aren't vacuous

A passing suite proves nothing if it would also pass against a broken guard. Break it on purpose:

```bash
sed -i '' 's/const TOKEN_IX_OK = new Set(\[3, 12\]);/const TOKEN_IX_OK = new Set([3, 12, 4, 6, 8, 9]);/' shared/magicblock-guards.ts && npm test; git checkout shared/magicblock-guards.ts
```

Five tests fail — Approve, SetAuthority, CloseAccount, Burn and the Token-2022 case — then the guard is restored. Three other mutations were checked the same way during development (short-circuiting the program allowlist, disabling the source-account check, disabling the payout validator/vault check); each failed exactly one test.

---

## What the tests cover

`test/guard-attacks.test.ts`, all offline:

| Attack | Guard check |
|---|---|
| API claims `sendTo` other than `base` | string compare |
| Transaction needs a second signature | `numRequiredSignatures !== 1` |
| Sole signer is not the sender | `keys[0] !== from` |
| Calls a program not on the allowlist | 8-program allowlist |
| `Approve` — delegates your token account | tag not in `{3, 12}` |
| `SetAuthority` — hands over your account | tag not in `{3, 12}` |
| `CloseAccount` — sweeps the account | tag not in `{3, 12}` |
| `Burn` — destroys the tokens | tag not in `{3, 12}` |
| Same attack via Token-2022 instead | both programs checked |
| SPL instruction with no data to inspect | empty-data refusal |
| Source is not the sender's USDC ATA | compared to derived ATA |
| `TransferChecked` on a non-USDC mint | mint compared to USDC |

Plus five on `matchMagicBlockPayout`: a failed transaction, a wrong amount, a payout to the wrong recipient, and — the sharp one — an **exact-amount payout from an unrelated payer**, which is refused because it is neither signed by MagicBlock's validator nor touches its vault.

### See it in a browser

```bash
cd web && npm install && npm run dev
```

Open **`#/demo`**. Twelve hostile transactions, each run through the real guard in the page — nothing signed, broadcast or sent. Flip **Guard off** and every card turns red: that is what a client without the guard hands to the MPC.

The page and the test suite both import `shared/attack-cases.ts`, so the demo cannot claim a refusal the tests do not prove. `test/shared-cases.test.ts` asserts each case is refused *for the stated reason*, which is what keeps the two in step.

**Not yet covered offline.** Five checks in `checkEconomics` need a live `simulateTransaction`: overcharge past amount + fee + 0.2%, owner changed, delegate set, close authority set, and SOL drain past 0.01. They are exercised live by `verify-lib.ts` (the overcharge case prints its refusal) but have no offline fixture yet. Named at the foot of the test file with line numbers.

---

## How it works

1. **Derive.** A Solana address comes from your NEAR account plus a path label (`solana-1`), via `derived_public_key` on `v1.signer-prod.testnet`, domain 1 (Ed25519). Same account + path always gives the same address. `bibhu-usdc.testnet` + `solana-1` → `7snfiiW6ZP2pgACBx3ZtKKcpNwTk74gGGQPRtxDVnt27`. Anyone knowing the account and path can recompute it — the public NEAR sign call reveals both, so this link is **not** secret.
2. **Build.** An unsigned Solana transaction: either a normal SPL `transferChecked`, or a MagicBlock private transfer built by their API.
3. **Guard.** The checks above. Refuse rather than sign anything unexpected.
4. **Sign.** The NEAR account calls `sign` on the signer contract with `payload_v2: {Eddsa: <message hex>}`, 1 yoctoNEAR deposit, 300 Tgas. At least 11 of 16 MPC nodes produce an Ed25519 signature, verified locally against the derived address before use.
5. **Broadcast.** Sent to Solana devnet.

No Solana private key is ever created. The key material exists only as MPC shares. A NEAR key *authorizes* the request: in the scripts from a gitignored `.keys/`, in the web app from the user's NEAR wallet.

The token is Circle devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`), 6 decimals — 1 USDC = `1_000_000` base units.

---

## Modes

**Normal.** One transaction, sender → recipient. An ordinary SPL transfer that happens to be MPC-signed.

**Hide recipient (MagicBlock private payments).** Two legs: the sender deposits to MagicBlock's vault (the recipient is not in this transaction), then ~1 s later the vault pays the recipient (the sender is not in this transaction). In the proven run MagicBlock charged 0.001 USDC: the sender paid 1.001, the recipient received 1.000.

MagicBlock's delay/split options could blur amount-and-timing matching but were **not tested**; the proven runs used 0 ms delay.

---

## What is public and what is not

Read this before assuming anything. quietsend is **not** private or anonymous in any unqualified sense.

| | Normal mode | Hide-recipient mode |
|---|---|---|
| Sender | Public | Public on leg 1 (sender → vault). Not present on leg 2. |
| Recipient | Public | Public on leg 2 (vault → recipient). Not present on leg 1. |
| Direct sender↔recipient link | Public (one transaction) | **Not on-chain in either transaction.** An observer can still guess it from amount and timing. |
| Amount | Public | **Visible** on both legs, and with timing is matchable across them. |
| Token | Public | Visible. |
| NEAR sign call | Public | Public. The NEAR account + path in the sign request links to the derived Solana address. True in both modes — it is how Chain Signatures work. |
| Trust | NEAR MPC (no Solana key stored) | Unlinking depends on **Intel TDX plus MagicBlock**, not a math-only proof. If you do not trust TEEs or MagicBlock, assume no unlinking. |

A random derivation path would not help: the path is in the public NEAR call, and derivation is public math.

---

## The guard is not a security boundary

Stated plainly, because it matters more than the feature list.

The guard runs **in the page that requests the signature.** A compromised frontend, a malicious npm dependency, or any other dapp the user approves goes straight around it. What this is: **fail-closed input validation against an untrusted transaction builder.** Rare, valuable, correctly scoped — not a firewall, and not a policy engine.

The architectural fix, and the sharpest point in this design:

> A NEAR **function-call access key cannot attach a deposit**, and `sign` requires 1 yoctoNEAR (`SIGN_DEPOSIT_YOCTO`, `web/src/lib/config.ts:17`). So an agent holding a function-call key **cannot reach the signer at all.** Route it through a contract that performs these checks on-chain and the architecture *enforces* the boundary instead of asking politely.

**This is built.** `contract/src/lib.rs` is deployed at `policy.bibhu-usdc.testnet`, and `mcp/server.ts` is the agent-facing front door (`npm run mcp`). The contract enforces a per-transfer limit and a daily limit, holds anything over them as an intent until `approve_intent`, and binds the payload it signs. End-to-end proof: `scripts/p-01-policy-e2e.ts`.

Addresses differ between the two paths: policy mode derives from predecessor `policy.bibhu-usdc.testnet` with path `<user>/solana-1`, not from the user's own account. See [llms.txt](llms.txt).

**Full threat model, including what the guard does not protect against: [docs/SECURITY.md](docs/SECURITY.md).**

---

## Calling it from an agent or a Node process

[docs/INTEGRATING.md](docs/INTEGRATING.md) — one function, one interface you implement, and a working non-browser wallet in about twenty lines. `web/scripts/verify-lib.ts` is the reference caller and has made real devnet sends.

The thing to read first: a NEAR **function-call access key cannot attach a deposit**, and `sign` requires 1 yoctoNEAR — so an agent's restricted key cannot reach the signer directly. The policy contract turns that into the design: the agent's key only reaches the contract, and the contract decides whether to sign, applying a per-transfer limit, a daily limit, and human approval for anything above them.

When the app is running, the docs are served at `/docs/` and `/llms.txt` points an agent at them.

---

## Layout

```
shared/magicblock-guards.ts   the guard: 253 lines, used by both the app and the scripts
shared/attack-cases.ts        the hostile transactions, shared by the tests and the demo
test/guard-attacks.test.ts    offline attack tests  ·  npm test
web/src/components/Demo.tsx   the #/demo page: the same cases, in the browser
web/                          Vite + React + TypeScript app, no backend
  src/lib/                    derive, build, guard, sign, broadcast, poll, inspect
  scripts/verify-lib.ts       headless verification of src/lib against live devnet
scripts/                      step-by-step Node scripts (00-create-account … 06-fund-user)
docs/INTEGRATING.md           for agents and developers: the one function to call
docs/SECURITY.md              threat model: what the guard does and does not protect
web/public/llms.txt           agent-facing entry point, served at /llms.txt
docs/next-version.md          merged technical review: where this goes next
PLAN.md                       scope, risks, build status
```

Run the app:

```bash
cd web && npm install && npm run dev
```

Wallets on NEAR testnet: Meteor, Intear or Nightly (NEAR Wallet Selector is deprecated; this uses NEAR Connect). HOT Wallet and MyNearWallet do not advertise testnet support and are not offered.

Set `VITE_SOLANA_RPC` to a keyed devnet endpoint. `api.devnet.solana.com` is unreachable from some networks and the public fallback rate-limits.

---

## Proven devnet transactions

| What | Signature |
|---|---|
| Normal transfer, 1 USDC | [`3hUZ5hSA…uKgt`](https://explorer.solana.com/tx/3hUZ5hSAwM8XBsxkM1nGVwE2G6UxdwBjS8qaD1wmj3L7WUo9z8bGsZdzVCCZKfi3RpnKQica5tCb16snroE4uKgt?cluster=devnet) |
| Hide, leg 1 — deposit to vault | [`2w2LRuLn…fxKq7`](https://explorer.solana.com/tx/2w2LRuLninNbG2MbWeCAczuJUaEW9yAxMhVR2GD1JmXEfWdBjvQYDETY6mPMX3uF1WqHPZnUB3CixhvfSLGfxKq7?cluster=devnet) |
| Hide, leg 2 — vault pays recipient | [`5cTHDqYs…8dsUk`](https://explorer.solana.com/tx/5cTHDqYssFJx2cfUuXe3LYEpz5f2Q3MfVNuFuqp9Qrw4PJ3WhzqYG1h6ZAD9aEG9HxJpZNAHe3jSJCxN7v88dsUk?cluster=devnet) |
| Hide, leg 1 — second run, 0.1 USDC | [`4pgywdpf…M57mw`](https://explorer.solana.com/tx/4pgywdpfMCFq78K4NChbJNMfh3QGNnzmF1fFHDhhSzari8r2pcADLHF7M6jpXsRb7vXzj6awBcKuXLDkR6LM57mw?cluster=devnet) |
| Hide, leg 2 — second run, 0.1 USDC | [`S4LR9EjX…48FCq`](https://explorer.solana.com/tx/S4LR9EjXeDpD8NyiDUVmeT8qSWtpGFKRcHaHhh8xBrWsFKQPhXgYp3fC3ozLnnkcm97pMLNVjsFX7rYYcU48FCq?cluster=devnet) |

The second run: 0.0001 USDC fee, legs 1 second apart. `verify-lib.ts` reads that real leg 2 back off the chain and checks the payout matcher accepts it — and that look-alikes with wrong amounts are ignored.

---

## Limitations

- **Not mainnet,** and nothing here is a claim about mainnet behaviour.
- **Not anonymous.** The derived address is a deterministic function of the NEAR account and path, both public in the sign call. In hide mode, amount and timing still allow correlation.
- **Not trustless.** Hide mode relies on Intel TDX and MagicBlock. No math-only proof of unlinking; no attestation verification; no independent audit of this project.
- **The guard is browser-side,** so it is input validation, not a boundary. See above.
- **Blockhash expiry (~60–90 s).** If the wallet or MPC is slow, the app refuses to broadcast and asks you to send again — the NEAR call is already spent. No silent rebuild-and-resign, which would need a second approval.
- **Five economic checks have no offline test** yet; they run only against live devnet.
- **MagicBlock delay/split untested,** so amount-and-timing matching is easy in the proven runs.
- **No separate recovery path.** If your NEAR account cannot authorize a sign request, the derived address cannot be used. That is the trade.
- **No MagicBlock auth token** is used or stored; their transfer endpoint needs none.

## Roadmap

Nothing below is built. See [docs/next-version.md](docs/next-version.md) for the reasoning.

- **On-chain guard in a NEAR contract** — the architectural fix described above.
- **Offline fixtures for the five simulation checks.**
- **Helius Privacy Rings** was evaluated and ruled out for now: its default ring encrypts *amounts* while leaving wallets visible — the opposite half from what this hides — and counterparty hiding needs Custom Rings, still in audit with a Q4 2026 mainnet target.
