# quietsend: where this goes next

Three independent reviews, 13 Nov 2026. Each reviewer saw the product and the
constraints but not the others' work. Every factual claim below about our own
repo has been checked.

---

## The one thing all three agreed on

**The sending is not the product. The guard is.**

Chain Signatures will sign whatever bytes it is handed. "Derive an address, build
a transaction, call `sign`, broadcast" is NEAR's own documented quickstart, and
`chainsig.js` is already in our dependencies. Anyone can do that part in a
weekend.

What is rare is treating the thing that *builds* the transaction as hostile:
allowlisting programs, requiring exactly one signer, forbidding SPL instructions
other than Transfer/TransferChecked, and **simulating** to confirm the balance
change lands inside expected bounds — all before any signature exists.

One reviewer put it exactly: *the contribution is the guard, and sending is the
test harness for it.*

Everything in `shared/magicblock-guards.ts` (253 lines) is the project. The rest
is scaffolding that proves it works.

---

## The hardest finding: our guard is not a security boundary

Two reviewers reached this independently.

Our checks run **in the page that requests the signature**. The signer will sign
anything for that account and path. So they are bypassed by:

- a compromised or malicious frontend,
- a bad dependency in our own build,
- any other dapp the user approves.

What we actually built is **input validation against an untrusted transaction
builder** (MagicBlock's hosted API). That is genuinely valuable and rarely done.
It is not a firewall, and we should stop implying it is.

There is a second, related weakness: **the wallet prompt is blind signing.** The
user approves a hex blob. A NEAR wallet cannot render a Solana transaction. Our
simulation only helps if the page is honest.

### The fix, and what it costs

Put a NEAR contract between the requester and the signer. It parses the Solana
message, enforces structural rules, and only then calls `sign`.

One detail makes this much stronger than it first appears:

> A NEAR **function-call access key cannot attach a deposit**, and `sign`
> requires 1 yoctoNEAR (verified in our own `config.ts:17`). So an agent holding
> a function-call key **cannot call the signer directly at all.** It must go
> through the contract.

The architecture forces the boundary instead of asking politely. That is the
single most interesting technical fact to come out of this review.

Costs and limits:

- **Derived addresses change.** The MPC predecessor becomes the contract, so
  addresses are `(contract, path)` not `(user, path)`. Existing balances need
  migrating. Settle this before anyone accumulates addresses.
- **A contract cannot simulate.** Only structural rules move on-chain; economic
  bounds stay in the browser as defence in depth.
- **Parser differential.** If our parser and the Solana runtime disagree about a
  message, we sign something we misread. Strict templates, and fuzz against
  `@solana/web3.js` serialization.
- **Gas cost of parsing a Solana message in a NEAR contract is unverified.**

---

## What is weak, stated plainly

1. **The core flow is the tutorial.** Ed25519 (domain 1) is slightly
   less-travelled than secp256k1, but it is a small edge.
2. **Hide-recipient is custodial mixing behind an API.** MagicBlock sees sender,
   recipient and amount. Our proven run used no delay and no splitting, so
   matching leg 1 to leg 2 by amount and a one-second gap is trivial. The
   property we deliver is narrow: *no single Solana transaction names both
   parties.*
3. **The public NEAR sign call ties the account to the Solana address
   permanently** — and for hide-recipient, publishes the full leg-1 message.
   Check our honesty copy covers that.
4. **Intent is published before broadcast.** The full Solana message hits NEAR
   seconds before it reaches Solana. That is a front-running leak, and signing
   cannot be cancelled: anyone can lift the signature from the NEAR outcome and
   broadcast it.
5. **Impact and sustainability score low** on testnet-forever with no backend.
   Don't pretend otherwise — frame it as a reference implementation.
6. **A polished landing page and a parody video next to zero tests** reads as
   marketing over engineering. Wrong ratio for a technical judge.

---

## Documentation: the urgent one

An AI performs the first-pass screen. Its stated job: **check that the project
runs and does what the README says.**

Current state, all verified:

| Thing | Reality |
|---|---|
| `npm test` at repo root | Exits 1, "no test specified" |
| MCP / spend-limit code | **Not in the repo.** Only in landing-page copy |
| Tests or fixtures | None exist |
| `README.md` | Does not exist. Only `README.draft.md`, never promoted |

So the screener today runs `npm test`, gets a failure, finds no README, and sees
the landing page claim MCP and spending limits with no code behind them. **Every
unbacked claim is a liability in that screen, not a selling point.**

### The principle

Every claim in the README sits next to a command that proves it, and that
command needs no wallet, no funds and no secrets.

### Structure

```
README.md            claims table at the top, one page
VERIFY.md            expected output of each command, verbatim
docs/SECURITY.md     threat model: what the guard stops and what it does not
docs/PRIVACY.md      the public / not-public table (already drafted)
fixtures/            recorded real runs, as JSON
test/                offline tests
```

### Three tiers, one command each

**1. `npm test` — offline, deterministic, seconds.**
- *Guard, negative cases:* build ~10 hostile transactions in code, assert each is
  refused with a named reason. SetAuthority, Approve, CloseAccount, an unlisted
  program, a second required signer, a wrong vault, an overcharge past the bound,
  a SOL drain. **A table of attacks blocked is the most persuasive output we can
  produce.**
- *Guard, positive cases:* the recorded good MagicBlock leg-1 and normal transfer
  pass.
- *Signature:* fixture with message bytes, the real 64-byte MPC signature, and
  the derived pubkey; verify with `@noble/curves`. Proves the MPC produced a
  valid Solana signature with no network access.
- *Payout matching:* run `matchMagicBlockPayout` over recorded leg-1/leg-2 RPC
  results.

**2. `npm run verify:live` — read-only network, no keys.**
- Call `derived_public_key` and assert it equals the documented address.
- Fetch the recorded Solana signatures, assert the token deltas.
- Fetch the recorded NEAR sign transaction, assert its signature matches the one
  on the Solana transaction. *That chain of evidence is the entire product claim,
  checked from public data.*
- Fall back to fixtures with a clear `SKIPPED: pruned` message if RPCs have
  dropped old transactions — never fail on that.

**3. `npm run dev` — the app.**
- A `?demo` read-only mode: take any NEAR account name, show the derived address
  and balances, build a transaction, run the guard, display pass/fail, and stop
  before the wallet prompt.
- An **attack toggle** that injects a malicious instruction and shows the
  refusal. One click, and the differentiator is on screen.

### Precision rules

- Exact numbers, not adjectives.
- Same words for the same thing. "Hide recipient" must never become "private".
- **Mention MCP and spend limits only if code and a test are in the repo.**
  Otherwise cut the mention entirely.

---

## Positioning

**Do not lead with spending limits.** Five of the first eight listed projects are
agent spending guardrails. We would be the sixth, and the least complete.

**Do not lead with privacy.** Our own honesty table undercuts it, and a
privacy-literate judge will take it apart.

**Lead with this:**

> Chain Signatures will sign anything. quietsend inspects and simulates a Solana
> transaction *before* a NEAR account is asked to sign it — demonstrated against
> an untrusted third-party transaction builder.

The competitors cap amounts on NEAR. We inspect what the bytes will do on another
chain. Hide-recipient becomes the case study showing why the guard is needed, and
the privacy table becomes proof of honesty rather than a claim to defend.

---

## What to build, merged across all three reviews

### Must, before anything else (~2 days)
1. **Tests, fixtures, README, SECURITY.md, demo/attack mode.** Non-negotiable.
   Make root `npm test` pass.

### High value, days each
2. **Extract the guard as a standalone module.** `inspect(txBytes, policy) →
   {ok, reasons, effects}`, taking a declarative policy and producing a
   human-readable "this transaction will: …" summary shown before the wallet
   prompt. Answers blind signing directly.
3. **Signature ledger.** Rebuild history from NEAR instead of localStorage (we
   use localStorage in 5 places today). Decode each payload. Flag *dangling*
   signatures (signed, never landed) and *unmatched* Solana transactions (landed
   with no NEAR receipt — which would be evidence of MPC compromise).
4. **Send to a NEAR name.** Resolve `bob.testnet` to a derived address. Because
   derivation is a public view call, **you can compute someone's address before
   they have ever touched that chain.** No registry, no claim link. The clearest
   thing a normal wallet cannot do.

### The architecturally significant step
5. **Policy contract.** On-chain SPL-transfer parser, per-transfer and daily
   caps, recipient allowlist, one function-call session key. Turns advisory
   guards into enforced ones. Estimates diverge sharply: 4–6 days for a rough
   version, 2–3 weeks for a demo, months to harden. **If we don't build it, name
   it in SECURITY.md as the known limit and the next step.**

### Later
6. **EVM on Sepolia** with the same guard discipline — proves generality. Catch:
   an ECDSA payload is a 32-byte digest, so a contract cannot inspect it; it must
   accept the unsigned transaction, parse the RLP, and compute keccak itself.
7. **Path namespace UI.** Purpose paths, per-invoice receive addresses, a
   fundless `auth` path. Honest copy: **"unlinkable until spent"** is true;
   "private addresses" is not.

---

## What not to build (all three were emphatic)

- **A backend co-signer or policy server.** The contract does the job and keeps
  the no-backend design value.
- **A program allowlist without instruction templates.** Not a safety property —
  `Approve` and `SetAuthority` prove it. Our own guard already knows this.
- **An LLM judging transaction intent as a policy step.** Non-deterministic,
  injectable, unauditable.
- **Arbitrary message / EIP-712 / Permit signing.** Bypasses simulation; the
  classic drain vector. Fixed templates only.
- **Login with a derived key as a product.** Slower, costs a transaction, and
  publishes every login.
- **Bitcoin.** One signature per input means several NEAR transactions per send,
  for no new insight.
- **A generic dapp connector.** Months of work, unusable at this latency, and it
  turns the guard into blind signing of arbitrary dapp transactions.
- **Durable nonces by default.** Trades an expiry annoyance for an indefinitely
  live signed transaction.
- **Stealth addresses or stronger privacy claims.** The architecture leaks by
  construction.
- **Any wording implying privacy for agent flows.** The audit trail makes them
  *more* traceable than a normal wallet.
- **More landing-page or video polish.** Not what the screen or the technical
  judges reward.

---

## Helius Privacy Rings — checked, and deliberately not used

Checked 13 Nov 2026 against helius.dev/blog/solana-privacy-rings. Worth knowing
about; wrong thing to build this week, and the reasons are specific rather than
a matter of taste.

**What it is.** Not ring signatures — the post never explains the name. It is
*"programmable shielded pools with encrypted onchain balances and native Solana
execution"*: deposit into a private balance, transfer privately, withdraw to a
public balance, with succinct ZK proofs verified on Solana. A **viewing key**
decrypts your own balances. Repo `helius-labs/zolana`, circuits built with
Blueshift's XARK toolchain, audited by Certora, ZK Security and OtterSec.

**Why it is not an upgrade for us.** The default ring hides the *opposite half*
from what we hide: *"assets and amounts are encrypted, while wallets remain
visible."* Counterparties stay public, so there is no linkability break. We
already ship a linkability break with public amounts. The variant that encrypts
counterparties is **Anonymous Custom Rings**, each one its own Solana program,
*"currently being audited"* with a target mainnet release of **Q4 2026**.

**Three blockers**

1. **Wrong half.** Amount privacy, not counterparty privacy. Complementary to
   ours, not a replacement — and only useful if both halves actually work.
2. **Mainnet.** Core programs are deployed on Solana mainnet. A devnet demo is
   linked, but the post never states that the SDKs or privacy RPC methods work
   on devnet. This project is devnet-only, permanently.
3. **Not finished.** Formal verification of the permissionless programs and
   circuits is *"underway,"* expected *"by the end of 2026."* There is a trusted
   setup whose ceremony the post does not describe.

**A fourth concern that is ours specifically.** The **remote prover** is reached
through the Helius RPC URL, and the post does not say what the prover sees or
whether proving is client-side. For a project whose value is "no backend,
everything in the browser, and here is an honest table of what is still public,"
that is a new trust assumption we would have to disclose and could not
characterise. It would weaken the honesty table, not strengthen it.

**The one genuinely useful observation.** Rings does not replace the guard — it
is a *second* untrusted transaction builder. A Rings deposit is bytes a NEAR MPC
would be asked to sign blind, exactly the problem we already solved for
MagicBlock. That is evidence the guard generalises, which is the argument worth
making:

> Rings encrypts amounts and leaves wallets visible. quietsend breaks the
> sender-to-recipient link and leaves amounts visible. Together they close both
> halves — and either way, something has to inspect the transaction before a
> NEAR account signs it.

**Not verified.** The docs pages at `helius.dev/docs/privacy/*` (program
addresses, RPC method names) and whether the devnet demo is actually reachable.
The devnet question is the only one that could change this answer.

---

## Where this architecture is genuinely worse than a normal wallet

Worth stating in SECURITY.md, because saying it first is a credibility asset.

- **Latency.** Seconds to tens of seconds per signature. Anything
  latency-sensitive is out.
- **Blockhash expiry** (~60–90s) can be exceeded by a slow wallet prompt plus MPC
  time. We already handle this by refusing to broadcast.
- **One wallet prompt and one NEAR transaction per signature.**
- **Cost.** NEAR gas per signature on top of target-chain gas.
- **Liveness.** Depends on NEAR, the MPC network, a NEAR RPC and the target chain
  together. No offline signing.
- **Privacy.** Structurally worse: one public name links every address on every
  chain, and every signing intent is logged.
- **Blast radius.** One full-access key controls all chains and all paths.
- **Name re-registration.** Keys bind to the account-ID *string*. If a named
  account is deleted and re-created by someone else, they may inherit every
  derived key on every chain. **Verify and warn loudly.**
- **MPC collusion.** A threshold of nodes can sign with no NEAR transaction at
  all. Can't be prevented — but *can* be detected, which is what the
  reconciliation check in item 3 is for.

---

## Unverified — check before relying on any of it

- Gas cost of parsing a Solana message inside a NEAR contract.
- NEAR account deletion and name re-creation rules.
- Real signing latency distribution and gas burn on testnet.
- The exact secp256k1 domain ID and response format on `v1.signer-prod.testnet`
  (we only use domain 1 today).
- Whether the Ed25519 payload has a length cap constraining large Solana
  messages.
- How long public devnet/testnet RPCs retain old transactions (affects whether
  live verification stays green).
- Whether MagicBlock's v0 message uses address lookup tables (a contract cannot
  resolve those).
