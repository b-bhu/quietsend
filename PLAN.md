# quietsend: send Solana USDC with only a NEAR account (v1 plan)

Deadline: 14 Nov 2026, 23:59 UTC (15 Nov, 05:29 IST). **NEAR testnet + Solana devnet only.**

## User
A NEAR user who wants to send USDC on Solana without a Solana wallet, seed phrase or Solana key.

## v1 scope (locked)
- **Vite + React + TypeScript, no backend** (`web/`). Everything runs in the browser.
- **NEAR-wallet-only connect** through NEAR Connect (`@hot-labs/near-connect`). See "Wallets" below.
- **Two modes**
  1. **Normal**: SPL `transferChecked` from the derived Solana address, MPC-signed.
  2. **Hide recipient**: MagicBlock private base-to-base transfer (`POST /v1/spl/transfer`, v0 tx), same MPC signing, then the app watches for MagicBlock's payout. Proven end to end by `scripts/mb-*.ts` and by the web lib.
- **Side-by-side explorer page** after every send: `NEAR request | Leg 1 | Leg 2`, each fact labelled PUBLIC or HIDDEN, computed live from the chain (for example "recipient appears in leg 1: no").
- **localStorage history** (no server). An in-flight send is persisted so a reload can resume it.

## Flow
1. Connect NEAR wallet, so the app has `accountId`.
2. Derived Solana address = signer view `derived_public_key{path:"solana-1", predecessor:accountId, domain_id:1}` on `v1.signer-prod.testnet`. Balances: SOL and Circle devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
3. Build the unsigned Solana transaction in the browser (normal: web3.js + spl-token; hide: MagicBlock API).
4. Wallet calls `sign` on the signer: `payload_v2: {Eddsa: <message hex>}`, `path`, `domain_id: 1`, 1 yoctoNEAR deposit, 300 Tgas. The NEAR tx hash is captured.
5. Signature (64 bytes) is read from the wallet's outcome (or from NEAR RPC by tx hash), verified locally against the derived pubkey, attached, and broadcast to devnet.
6. Hide mode: poll the recipient's token account for the payout, accepted only when the signature is new and the recipient's USDC delta equals the amount.

## Honest privacy statement (goes in the README table too)
- No Solana private key exists: 16 MPC nodes hold shares and at least 11 sign together. Only the user's NEAR account can ask. This is **security, not privacy**.
- **Normal**: sender, recipient and amount are public on Solana. The NEAR sign call (account, path, message) is public.
- **Hide recipient (MagicBlock)**: breaks the *direct sender to recipient link on Solana* (leg 1 never names the recipient, leg 2 never names the sender).
  **Still public:** the amounts (leg 1 is amount + 0.1% fee, leg 2 is the amount), the timing of the two legs (a few seconds apart), and the NEAR sign call (account + path). A patient observer can match the legs by amount and timing.
- **A random derivation path is not privacy**: the path is in the public NEAR call, and derivation is public math.
- Trust: MagicBlock (hosted API, TEE-based settlement). We do not verify their attestation.

## Wallets (verified 12 Nov 2026)
- **NEAR Wallet Selector is deprecated** ("Do not use `@near-wallet-selector/*`", docs.near.org). v1 uses **NEAR Connect** (`@hot-labs/near-connect` 0.12.0) instead.
- On `network: "testnet"`, NEAR Connect only lists wallets whose manifest sets `features.testnet: true`: **Meteor, Intear, Nightly, Ledger, WalletConnect, NEAR CLI, Ethereum Wallets**. **HOT Wallet and MyNearWallet do not set it, so they are not offered on testnet.** The app hides Ledger, NEAR CLI and Ethereum Wallets (untested paths).
- Wallet code runs in sandboxed iframes/popups, so the signed result normally returns to the page as a promise, not through a full-page redirect.

## Risks and how v1 handles them
- **Blockhash expiry (about 60-90 s)**: the Solana message is built right before the wallet prompt; if the wallet/MPC takes longer, the app refuses to broadcast and asks to send again (the NEAR call is already spent, about 1 yoctoNEAR plus gas). No rebuild-and-resign, because that would need a second wallet approval.
- **Wallet redirect or reload mid-send**: `pending` (unsigned tx, message, NEAR tx hash) is stored in localStorage; on load the app re-reads the signature from the NEAR tx hash and finishes if the blockhash is still valid. If the hash was never captured, the send is dropped.
- **The MPC signs whatever bytes it is given**, so for MagicBlock transactions the app checks, before the wallet prompt: exactly 1 required signer and it is the user's derived address; `sendTo === "base"`; every program is on an allowlist; no direct SPL Token instruction other than Transfer/TransferChecked; and a **simulation** shows the sender's USDC account loses at least the amount and at most amount + reported fee (+0.2%), its owner/delegate/close-authority are unchanged, and SOL spend is at most 0.01. Otherwise it refuses to sign.
- **Solana RPC**: `api.devnet.solana.com` is unreachable from the dev box. `VITE_SOLANA_RPC` is configurable and defaults to OnFinality's public devnet endpoint, which rate-limits (429/503): the app retries with backoff and avoids websockets. Use a keyed RPC for the demo.
- **Devnet v1 transactions**: MagicBlock's payout is a version-1 transaction; `@solana/web3.js` 1.98.4 (pinned) can't parse it in `getParsedTransaction`, so the explorer reads it with raw JSON-RPC.
- **No MagicBlock auth token** is used or stored (the transfer endpoint needs none). `scripts/mb-01*.ts` do auth experiments only and write to gitignored `out/`.

## Build order and status
1. [done] Scaffold + wallet login (account id shown).
2. [done] Derived address + SOL/USDC balances (lib verified headlessly for `bibhu-usdc.testnet`).
3. [done] Normal send + NEAR tx hash + explorer link (lib verified with a real 0.1 USDC devnet send).
4. [done] Hide recipient (lib verified with a real 0.1 USDC devnet send).
5. [done] Explorer page.
6. [part] UI/UX redo done (13 Nov 2026): new theme, landing screen, send form, explorer, history — all screens checked by hand with a real wallet. Still todo: README privacy table; deploy to Vercel (only with Bibhu's yes). The ad video is being made in Grok; drop it at web/public/ad.mp4 and the landing picks it up.

## Before anything else
**[docs/stop-adding-start-proving.md](docs/stop-adding-start-proving.md)** — the work that decides the AI screening. Reviews behind it: [docs/next-version.md](docs/next-version.md).
- [done 13 Nov] **Offline attack tests.** `test/guard-attacks.test.ts`: root `npm test` runs 18 tests in 0.65 s with no network, no wallet, no devnet. Proves the guard refuses twelve classes of hostile transaction by name. Verified by mutation (four deliberate breaks, all caught, all reverted).
- [done 13 Nov] **README.md** with a proving command per claim. Leads with the guard, not the send. Keeps the honest privacy table from the draft verbatim. Every command in it was run: `npm install && npm test` from a clean clone (18/18), `npm run typecheck` (0), `cd web && npx tsc -b` (0), `npx tsx web/scripts/verify-lib.ts` (16 PASS / 0 FAIL against live devnet), and the mutation command that proves the tests bite. `README.draft.md` kept for now; delete once happy.
- [done 13 Nov] **Cut the MCP / spend-limit claims.** Rewritten rather than deleted, so the ad keeps its ten shots and gains the real differentiator. Shot 7: "plug yourself in" (no protocol claim). Shot 8 was a "20 MAX / 100 A DAY" sticker and is now Mike inspecting a receipt with a magnifying glass and stamping it refused — the pre-sign guard, covered by 18 tests. Shot 9: "Not without you!" instead of "Over the limit?" — true because every send needs the human's wallet approval. Fixed in `grokbot-brief.v2.md` (product facts, change notes, shot table, prompts, captions), `production-pack.md`, `concept-board.html`, `Landing.tsx` (card is now "Checked before signing"), `docs/mocks/02-landing.html`, and the stale comment in `video/src/Composition.tsx`. Verified: `npm test` 18/18, `npm run typecheck` 0, `cd web && npx tsc -b` 0.
- [done 13 Nov] **Docs are reachable.** They existed only in `docs/` where nobody browsing the site or any agent would find them, while the ad invited agents to "plug yourself in" with nothing to read. Added `docs/INTEGRATING.md` (the one function to call, a working non-browser wallet, and the function-call-key deposit rule that blocks unattended agents), `web/public/llms.txt` as the agent entry point, and real links from the landing page, the demo and the app footer. `web/scripts/sync-docs.mjs` copies them into `web/public/docs/` before dev and build, so the served copies cannot drift; the copies are gitignored.
- [done 13 Nov] **`#/demo` attack toggle.** `web/src/components/Demo.tsx` runs 12 hostile transactions through the real guard in the browser; a Guard on/off toggle shows what a client without it would sign. Cases live in `shared/attack-cases.ts`, imported by both the page and `test/shared-cases.test.ts`, so the demo cannot drift from the tests. Checked by hand at 1440px and 375px, no console errors. Suite now 44 tests.
- [done 13 Nov] **docs/SECURITY.md** — threat model. States plainly that the guard is input validation, not a security boundary, and lists seven known gaps. Documents the two properties that hold regardless of the guard (no Solana key exists; a function-call key cannot attach the deposit `sign` requires, so every signature needs the wallet). Also records that `VITE_MB_EXTRA_PROGRAMS` / `VITE_MB_VALIDATOR` / `VITE_MB_VAULT` can widen the guard at build time. Every line reference checked against the tree.

## Stretch (only if time; unverified)
- ~~**Helius Rings "hide amount" mode**~~: **ruled out 13 Nov 2026.** The default ring encrypts amounts and leaves wallets visible — the opposite half from ours, not an upgrade. Counterparty hiding needs Anonymous Custom Rings, still in audit, Q4 2026 mainnet target. Core programs are mainnet, devnet SDK support unstated, and the remote prover is an undocumented trust assumption. Full reasoning in [docs/next-version.md](docs/next-version.md).
- **NEAR fee contract in Rust**: the contract takes a fee, then asks the MPC to sign (address = contract + user path). Adds fees/bonus points, not privacy.
- MagicBlock delay/split options to blur amount/timing matching (untested).

## Cut order if we slip
1. Explorer page reduced to plain Solana Explorer + NearBlocks links.
2. Hide mode dropped to "roadmap".
3. Stretch items.

---

## v2 for agents (APPROVED by Bibhu, 12 Nov 2026)

Approved direction: a headless MCP server, a NEAR policy contract, and the private send we already have. Helius Rings stays last and optional. Decisions: two Solana addresses (human and policy), over-cap requests are approved first and then signed fresh, Rust 1.95+ installed on the build box, contract account `policy.bibhu-usdc.testnet`.

### User
A person who delegates sending to an agent (Grok Bot, Claude, ChatGPT, or a script). The agent must never hold the user's full NEAR key. The human still sets limits and approves anything over the cap.

### Core flow
1. The human, once, with their wallet (full-access key, 1 yoctoNEAR): deploys or binds to the policy contract, sets per-transfer and daily limits, an optional recipient allowlist, and an approval cap, and adds a function-call access key that can only call this contract (zero deposit). They also prepay a tiny NEAR balance the contract uses to attach 1 yoctoNEAR to the signer.
2. The agent (through the MCP server or a CLI) calls the policy contract with that function-call key: quote, then send (normal or hide recipient).
3. The contract checks the caller, the limits, and the allowlist. It does **not** let the caller pick the full derivation path. It sets `path` to `<caller>/solana-1`, then cross-contract calls `v1.signer-prod.testnet` `sign` with `payload_v2: {Eddsa: <hex>}`, `domain_id: 1`, 1 yoctoNEAR, and at least 15 Tgas on the sign receipt.
4. The signer yields until the MPC responds, then resumes and returns the signature to the contract's callback. The MCP server reads that signature, attaches it, and broadcasts on Solana devnet.
5. `get_receipt` returns a machine-readable receipt, including the PUBLIC/HIDDEN table, for the agent or a judge to check.

If the send is over the cap, or the recipient is not allowed, the contract does **not** sign. It stores an intent (recipient, amount, mode). The human approves that intent in their wallet (1 yoctoNEAR). The agent then retries with a fresh Solana transaction: approving first and signing later, because a Solana blockhash only lasts about 60–90 seconds.

### Address change (important)
Today the Solana address is derived from `(user account, "solana-1")`, for example Bibhu's `6YNo…`. When the policy contract calls `sign`, the predecessor is the **contract**, so the address becomes `(policy contract, "<user>/solana-1")`. That is a **new** Solana address. Existing USDC at `6YNo…` does not move.

Proposal: keep today's wallet path as **human mode** (same address as now). Agent sends go through the policy contract to the new address, which we fund on devnet for the demo. The MCP tools always say which address they are using.

### MCP tools
Local stdio server, reusing the tested web/script libraries. Suggested package: current MCP TypeScript SDK v2, `@modelcontextprotocol/server` (2.4.0 as of 12 Nov 2026). Log to stderr only.

| Tool | Input | Output |
| --- | --- | --- |
| `get_address_and_balance` | optional `near_account` (defaults to the configured account) | NEAR account, mode (`human` or `policy`), Solana address, SOL, USDC |
| `quote_send` | `recipient`, `amount_usdc`, `mode` (`normal` \| `hide_recipient`) | fee, total debit, under-limit or needs-approval, PUBLIC/HIDDEN preview |
| `send` | same as quote | `signed` \| `needs_approval` \| `rejected`, NEAR tx, Solana tx(es), receipt id |
| `get_receipt` | receipt id or tx hash | JSON receipt: legs, amounts, explorer links, a PUBLIC/HIDDEN table |

The agent never sees a seed or private key. Credentials stay in a gitignored local env file.

How a client adds it (stdio): Claude Desktop, Settings → Developer → Edit Config, then restart. File: `~/Library/Application Support/Claude/claude_desktop_config.json` on a Mac.

```json
{
  "mcpServers": {
    "quietsend": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/quietsend/mcp/server.ts"]
    }
  }
}
```

Claude Code can use the same command, or a project `.mcp.json`. Whether Grok Bot can load a local stdio server the same way is **unverified**; judges and a one-command CLI are the first audience.

### Policy contract (Rust, testnet only)
Shared contract, for example `policy.bibhu-usdc.testnet` (name not fixed). Methods:

- `new(mpc)` — init.
- `deposit()` — payable; the human prepays the 1-yoctoNEAR the contract later attaches to the signer. Needed because a function-call key **cannot** attach a deposit (NEAR rejects it with `DepositWithFunctionCall`).
- `set_policy(per_transfer, daily, cap, allowlist)` — owner only, require 1 yoctoNEAR.
- `sign_for_caller(payload_hex, recipient, amount, mode)` — zero deposit from the caller. Checks limits, prefixes the path with the predecessor, attaches 1 yoctoNEAR, calls the signer, returns the signature (or `needs_approval`) in the callback.
- `approve_intent(id)` — owner, 1 yoctoNEAR; marks a pending intent approved, does not sign a stale hash.
- Views: `get_policy(account)`, `get_intent(id)`, maybe a helper for the derived path.

Storage: owner, mpc account, prepaid deposits, per-user policy (limits, spent today, day bucket, allowlist), pending intents.

Security we must not skip: never let the caller choose the full path; never sign an unchecked hash for a key the contract owns (for v2 we still accept an app-built Solana message, but the contract should at least bind it to this caller and this path, and we keep the existing MagicBlock pre-sign guards in the MCP/app). Whoever can deploy new code to the contract can sign for every user's policy address, so the contract account's full-access keys must stay tight.

Toolchain gap (box, 12 Nov 2026): current `near-sdk` is 5.30.1 and `cargo-near` is 0.23.0; both need Rust 1.95. This box has system `rustc`/`cargo` 1.85.1, rustup 1.29.1 with **no** toolchain and no `wasm32-unknown-unknown`, and no `cargo-near`. Building the contract means installing a rustup toolchain 1.95+ and the wasm target first. Not done yet (large install).

### Demo a screening agent can run
One command, for example `npm run verify`, that a Claude Code / Codex reviewer can run from a public clone:

1. Prints the policy (or demo) Solana address and the human-mode address.
2. Points at already-published devnet transactions (Normal and Hide recipient) and checks, live, that the PUBLIC/HIDDEN table matches the chain.
3. If a gitignored testnet key is present, also does a small policy-path send and prints a fresh receipt. If not, it says so and still exits 0 on the read-only checks.
4. Expected output is spelled out in the README as "do X, see Y", with no marketing language.

Also add `llms.txt` and a LICENSE, and make the repo public only with Bibhu's yes, by 14 Nov 2026, 23:59 UTC.

### Honest privacy (same as v1, plus the contract)
- **Normal**: sender, recipient and amount are public on Solana.
- **Hide recipient**: breaks the direct sender-to-recipient link on Solana. Amounts, timing, and the NEAR sign call (now the policy contract + `<user>/solana-1`) are still public.
- Limits, intents and approvals are public on NEAR. That is the point of a policy engine, not privacy.
- MPC is security, not privacy. A random path is not privacy.

### Build order and cut order if we slip
Order (two tracks in parallel): A) shared `core/`, MCP stdio server, `npm run verify`, `llms.txt`, LICENSE; B) Rust 1.95 + wasm + cargo-near, slim policy contract, deploy on testnet, fund the policy-mode address, end-to-end policy send. Then (5) wire the web app so Explorer can show a policy send, (6) Helius only if time remains.

Cut, last first:
1. Helius Rings.
2. Web UI redesign (Bibhu's later idea).
3. Recipient allowlist (keep amount limits).
4. Remote/HTTP MCP (stdio + CLI are enough for judges).
5. Daily limit and intent queue (keep a single per-transfer cap).
6. Last resort, and it weakens Track 06: MCP + today's private send, contract only as a written design, no deploy.

Rough time, given about two days left: MCP + verify script, half a day, low risk. Policy contract, about a day, medium-high risk (new Rust toolchain, address change, yield/callback, funding). README/llms.txt, a few hours, high value for AI screening.

### Open questions for Bibhu
- Confirm we keep **two** Solana addresses (human mode at `6YNo…`, agent/policy mode at a new funded address), rather than moving funds.
- Shared contract account name (working name: `policy.bibhu-usdc.testnet`).
- OK to install Rust 1.95+ and the wasm target on this box?
- Over-cap flow as intent-then-resign, not sign-and-wait?
- Making the repo public, and any hosted demo, still need an explicit yes. Every push needs his yes.
