# Stop adding, start proving

Written 13 Nov 2026, one day before the deadline (14 Nov, 23:59 UTC).
Grounded in commands run against this repo on that date; every claim below was checked, not remembered.

## The situation in one paragraph

The guard is the best thing in this repo and the screener will not see it. `shared/magicblock-guards.ts`
refuses to sign eleven distinct classes of hostile transaction, each with a named reason. Nothing in the
repo demonstrates that. An AI first-pass screen checks "does it run and do what the README says"; today it
finds a failing `npm test`, no `README.md`, zero test files, and a landing page claiming features that do
not exist in the code. The gap is not the product. The gap is the evidence.

So: add nothing. Prove what is already there.

## Verified state of the repo (13 Nov 2026)

| Claim | How it was checked | Result |
| --- | --- | --- |
| ~~Root `npm test` fails~~ | `package.json` scripts | **fixed 13 Nov: 18 tests pass in 0.65 s** |
| ~~No `README.md`~~ | `ls README*` | **fixed 13 Nov: `README.md`, every claim has a command** |
| ~~No tests anywhere~~ | `find` for `*.test.ts`, `*.spec.ts` | **fixed 13 Nov: `test/guard-attacks.test.ts`** |
| Guard is 253 lines | `wc -l shared/magicblock-guards.ts` | 253 |
| Guard is used in 8 places | `grep -rn magicblock-guards` | web lib (5), scripts (2), verify-lib (1) |
| ~~MCP / spend limits not in code~~ | `grep -rn -i 'mcp\|spend limit'` | **fixed 13 Nov: claims rewritten everywhere** |

## Priority 1 — the attack table — **DONE 13 Nov 2026**

`test/guard-attacks.test.ts` + `test/helpers.ts`. Root `npm test` runs it: **18 tests, 18 pass, 0.65 s,
no network, no wallet, no devnet.** Runner is Node 24's built-in `node --test` with the `tsx` loader —
both already dependencies, nothing new added.

Covered offline: wrong `sendTo`; a second required signer; a sole signer who is not the sender; an
unlisted program; `Approve`, `SetAuthority`, `CloseAccount`, `Burn`; the same restriction on Token-2022;
an SPL instruction with no data; a source that is not the sender's USDC ATA; `TransferChecked` on the
wrong mint. Plus five cases on `matchMagicBlockPayout`: a failed tx, a wrong amount, an exact amount
from an unrelated payer, and a payout to the wrong recipient.

**The tests were verified to bite.** Four mutations were introduced into the guard and each was caught,
then reverted (`git diff shared/magicblock-guards.ts` is empty):

| Mutation | Result |
| --- | --- |
| `TOKEN_IX_OK` widened to allow Approve/SetAuthority/Burn/CloseAccount | 5 failed |
| allowlist check short-circuited | 1 failed |
| source-account check disabled | 1 failed |
| payout validator/vault check disabled | 1 failed |

`tsconfig.json` now includes `test/**/*.ts`; `npx tsc -p tsconfig.json` exits 0. A `typecheck` script
was added alongside `test`.

### Still open: the simulation tier

Five checks in `checkEconomics` need a live `simulateTransaction` and are **not** covered: overcharge
past `amount + fee + 0.2%` (line 128), owner changed (130), delegate set (131), close authority set
(132), SOL drain past 0.01 (133). They are listed at the foot of the test file. To bring them offline,
record a `getAccountInfo` + `simulateTransaction` pair into `test/fixtures/` and inject a stub
`Connection`. Worth doing if time allows; the seven byte-level refusals are the ones that carry the
argument.

<details>
<summary>Original plan for this priority (kept for the reasoning)</summary>


One offline test file. No wallet, no RPC, no devnet, runs in about two seconds. Each case builds a
`VersionedTransaction`, hands it to `assertMagicBlockTx`, and asserts the refusal reason. The test output
is the pitch: a reader who does not trust a word of the README can run one command and watch eleven
attacks get refused by name.

These are the real refusal paths in the code today, read out of `shared/magicblock-guards.ts`:

| # | Attack | Guard check | Line |
| --- | --- | --- | --- |
| 1 | API returns `sendTo` other than `base` | string compare | 55 |
| 2 | Transaction requires a second signer | `numRequiredSignatures !== 1 \|\| keys[0] !== from` | 57 |
| 3 | Calls an unlisted program | allowlist of 8 programs | 60 |
| 4 | Hides a program behind an address lookup table | `programIdIndex` resolves to nothing | 74 |
| 5 | `Approve` (delegate), `SetAuthority`, `CloseAccount`, `Burn` | `TOKEN_IX_OK = {3, 12}` only | 76 |
| 6 | Drains a token account that is not the sender's USDC ATA | source compared to `ataOfMint` | 79 |
| 7 | `TransferChecked` on a mint that is not USDC | mint index compared to `usdcMint` | 83 |
| 8 | Overcharges past `amount + fee + 0.2%` | simulation, USDC delta bound | 128 |
| 9 | Sets an owner on the sender's USDC account | post-sim account byte check | 130 |
| 10 | Sets a delegate | `readUInt32LE(72) !== 0` | 131 |
| 11 | Sets a close authority | `readUInt32LE(129) !== 0` | 132 |
| 12 | Drains more than 0.01 SOL | lamport delta bound | 133 |

Cases 1 to 7 need no network at all — they are pure byte checks on a transaction built in the test.
Cases 8 to 12 need `simulateTransaction`, so either record a fixture of a real simulation response
and replay it, or mark those as the integration tier and keep the offline tier green without them.
**Do the offline tier first.** Seven refusals that run with no network beat twelve that need devnet.

Then make root `npm test` run it, so the first command a screener types passes.

</details>

## Priority 2 — README with a proof per row — **DONE 13 Nov 2026**

`README.md`, 201 lines. Leads with the guard: *"NEAR Chain Signatures will sign any bytes you hand
them. quietsend inspects and simulates the Solana transaction first."* The honest privacy table from
`README.draft.md` is kept nearly verbatim — it is the most credible thing in the repo — and a section
states plainly that the guard is not a security boundary.

**Every command in it was run before publishing:**

| Command | Result |
| --- | --- |
| `npm install && npm test` from a clean clone | 18/18, ~0.7 s, no network |
| `npm run typecheck` | exit 0 |
| `cd web && npx tsc -b` | exit 0 |
| `npx tsx web/scripts/verify-lib.ts` | 16 PASS, 0 FAIL, exit 0 (live devnet, no credentials) |
| the mutation one-liner | 13 pass / 5 fail, then `git checkout` restores the guard |

The clean-clone run matters: root `node_modules` had never been installed in this repo, so before today
`npm test` would have failed at `Cannot find package 'tsx'` regardless of the test file.

**`verify-lib.ts` turned out to be the second proving tier** and the README now features it. It imports
the same `web/src/lib` modules the browser runs, derives the address through the signer view call *and*
independently through `chainsig.js` local math, asserts they agree, then exercises the live MagicBlock
API and devnet RPC — including a real refused overcharge and the payout matcher rejecting look-alikes.
Read-only, no keys.

`README.draft.md` is still in the tree. Delete it once the new README is reviewed.

<details>
<summary>Original plan for this priority</summary>


Promote `README.draft.md` to `README.md`. Every claim gets a command beside it that a stranger can run.
No claim without a command; if there is no command, cut the claim.

- Keep the honest privacy table. It is the most credible thing on the site. Most submissions in this
  space will overclaim; ours states what is still public (amounts, timing, the NEAR sign call).
- Lead with the guard, not the send. "Send Solana USDC with a NEAR account" is NEAR's own quickstart
  and `chainsig.js` is already a dependency. The sentence that is actually ours:
  **Chain Signatures will sign anything they are handed. quietsend inspects and simulates the Solana
  transaction before a NEAR account is asked to sign it.**
- Hide-recipient becomes the case study for *why* the guard has to exist — an untrusted third party
  builds the transaction and we never trust its description of itself.

</details>

## Priority 3 — cut the unbacked claims — **DONE 13 Nov 2026**

Rewritten, not deleted. Cutting shots 7 to 9 would have removed 15 of 49 seconds and the whole
developer/agent audience. Instead each one now shows something that exists:

| Shot | Was | Now |
| --- | --- | --- |
| 7 | "Just plug in with MCP!" / caption JUST PLUG IN WITH MCP | "Just plug yourself in!" / PLUG IN YOUR AGENT |
| 8 | "Set your limits! Twenty a transfer, a hundred a day!" / sticker 20 MAX · 100 A DAY | "But I read the fine print! Nope!" — magnifying glass down a receipt, then a refused stamp / CHECKED BEFORE SIGNING |
| 9 | "Over the limit? It waits for you!" | "Not without you! It waits for you!" / NEEDS YOUR WALLET |

Shot 9's action is unchanged (robot reaches, Mike's hand lands, robot freezes), so no re-shoot is
implied — only the line. The new meaning is stronger and needs no code: **every send requires the
human's wallet approval**, and a NEAR function-call access key cannot attach the 1 yoctoNEAR deposit
the signer demands, so an agent key cannot reach the signer at all.

Files corrected: `docs/ad/grokbot-brief.v2.md` (the product-facts paragraph that told the bots the
features "are already built and working on testnet", the change notes, the shot table, the per-shot
prompts, the caption list), `docs/ad/production-pack.md` (shot table, audio lines, prop labels, and the
"Honest notes" bullet that asserted the claim), `docs/ad/concept-board.html`,
`web/src/components/Landing.tsx` (the card is now **Checked before signing**),
`docs/mocks/02-landing.html`, and a stale comment in `video/src/Composition.tsx`.

**Found while doing this: Grok has delivered.** `video/` is a Remotion project, and
`video/public/raw/quietsend-cut-v2.mp4` (30 MB, 1920x1080, 24 fps) landed at 21:04 on 13 Nov. The cut
holds **nine** clips, not ten, running 42 s — and the sticker shot was never filmed; the timeline goes
plug → close. So the limits claim never reached the footage. **No caption layer is written yet**, which
is where the false text would have gone. The corrected captions above are the ones to build.

Verified after the edits: `npm test` 18/18, `npm run typecheck` exit 0, `cd web && npx tsc -b` exit 0,
`cd video && npx tsc --noEmit` exit 0.

<details>
<summary>Original plan for this priority</summary>


MCP and per-transfer / per-day spend limits exist in copy and nowhere in the code. In an AI screen an
unbacked claim costs more than a missing feature: it turns "incomplete" into "inaccurate".

Three places, and the third is the one that is still moving:

1. `web/src/components/Landing.tsx:79` — "Plug an agent in over MCP and cap what it can spend per
   transfer and per day."
2. `docs/mocks/02-landing.html:247` — same string in the mock.
3. **The video.** `docs/ad/production-pack.md:244` instructs: *"Agent, policy and MCP work on testnet.
   Shots 6 to 9 advertise them as working, with no 'coming soon' tag."* And
   `docs/ad/grokbot-brief.v2.md:146`: *"The MCP plug-in and the limits are already built and working on
   testnet."* Those briefs are with the Grok bots now. Shots 7 to 9 are being rendered against a claim
   the repo cannot support.

Decide once, apply to all three. Either the feature ships with a test, or the claim comes out of the
landing page, the mock and the ad brief together. Half-correcting it is worse than either.

</details>

## Priority 4 — SECURITY.md — **DONE 13 Nov 2026**

`docs/SECURITY.md`, 132 lines, linked from the README. Opens with the sentence that matters: the guard
is input validation, not a security boundary, because it runs in the page that requests the signature.

It separates three things that are usually blurred together:

1. **What holds regardless of the guard** — no Solana private key exists anywhere, and every signature
   needs the human's wallet because a function-call access key cannot attach the 1 yoctoNEAR deposit
   `sign` demands. Also: the MPC's signature is verified locally with `ed25519.verify` before broadcast.
2. **What the guard stops** — a 13-row table of attacks mapped to line numbers, twelve of them covered
   by `npm test`.
3. **What it does not stop** — a compromised frontend, a malicious dependency, another approved dapp,
   XSS, MPC collusion, a lying NEAR RPC, NEAR account-name re-registration, and build-time widening
   through `VITE_MB_EXTRA_PROGRAMS` / `VITE_MB_VALIDATOR` / `VITE_MB_VAULT`.

Ends with seven numbered known gaps and a note that the most useful bug report is a transaction shape
the guard wrongly accepts, as a failing test case.

Every line reference was checked against the tree, and two citations were wrong in the first draft and
corrected: the derived-address view call is `web/src/lib/near.ts:17` (not `config.ts:13`), and the
env-var block is `config.ts:36–45` (not `38–47`). Each negative claim was verified by grep — no
`chainsig.js` cross-check in `web/src`, no reconciliation, no attestation check, no re-registration
warning.

<details>
<summary>Original plan for this priority</summary>


The guard **is not a security boundary**, and saying so plainly is worth more than implying otherwise.
It runs inside the page that requests the signature, so a compromised frontend, a malicious dependency,
or any other dapp the user approves goes straight around it. What it is: fail-closed input validation
against an untrusted transaction builder. Rare, valuable, correctly scoped — not a firewall.

The architectural fix, and the sharpest technical point we have:

> A NEAR function-call access key **cannot attach a deposit**, and `sign` requires 1 yoctoNEAR
> (`SIGN_DEPOSIT_YOCTO = "1"`, `web/src/lib/config.ts:17`). So an agent holding a function-call key
> cannot reach the signer at all. Route it through a contract and the architecture enforces the
> boundary instead of asking politely.

Write it down. Do not build it today — moving the predecessor to a contract changes every derived
address, and that is not a one-day change this close to a deadline.

</details>

## Priority 5 — the attack demo — **DONE 13 Nov 2026**

Route **`#/demo`**, `web/src/components/Demo.tsx`. Twelve hostile transactions run through the **real**
`assertMagicBlockTx` in the page — it is synchronous and needs no network, so the whole thing works
offline. A control case (a well-formed transfer) is accepted, which stops the page from being a guard
that simply refuses everything.

The **Guard on / Guard off** toggle is the differentiator in one click: off, every card turns red and
reads "No check runs. The MPC is asked to sign this, and it will."

**The cases are shared, not duplicated.** `shared/attack-cases.ts` holds them as data, imported by both
the demo and `test/shared-cases.test.ts`. The test asserts each case is refused *for the stated reason*,
so the demo cannot show a refusal the guard does not produce. Suite went 18 → 44 tests.

The page states its own limits: the five simulation-only checks it cannot run, and that the guard is not
a security boundary.

**A real bug this caught.** The Token-2022 case was initially refused by the *allowlist* rather than the
instruction check, because Token-2022 is not in the default allowlist — a refusal for the wrong reason,
which would have demonstrated the wrong thing. Cases can now carry an allowlist override, and the test
asserting the reason is what surfaced it.

Checked by hand in the browser at 1440x900 (two-column grid) and 375x812 (stacked), with the toggle and
the per-card "Show the guard's words" expansion exercised. No console errors.

<details>
<summary>Original plan for this priority</summary>


A query-param mode on the React app that runs a send against a deliberately tampered transaction and
shows the refusal in the UI. Makes the differentiator one click instead of one `npm test`. Genuinely
good, strictly after the tests exist.

</details>

## Explicitly not doing

- **Helius Privacy Rings.** Checked 13 Nov 2026 against helius.dev/blog/solana-privacy-rings. Three
  blockers: the default ring encrypts *amounts* and leaves wallets visible (the opposite half from ours,
  not an upgrade); the counterparty-hiding **Anonymous Custom Rings** are still in audit with a Q4 2026
  mainnet target; core programs are mainnet and the post never states that the SDKs work on devnet,
  which is where this project lives permanently. A fourth concern specific to us: the **remote prover**
  is reached through Helius's RPC URL and the post does not say what it sees, which is a trust
  assumption we would have to disclose and could not characterise — bad for a project whose value is an
  honest table. Roadmap paragraph, no code. See `docs/next-version.md`.
- **The NEAR policy contract.** Right idea, wrong week. SECURITY.md instead.
- **Further video polish.** The video is nearly done and the bots are on it. The one video change worth
  making is the claim correction in Priority 3, which is a copy fix, not polish.
- **Mainnet.** Never. Testnet and devnet only, by standing decision.

## Order of work

1. ~~Offline attack tests, root `npm test` green.~~ **Done 13 Nov 2026.**
2. ~~`README.md` with a command per claim.~~ **Done 13 Nov 2026.**
3. ~~Cut MCP / spend-limit claims from `Landing.tsx`, the mock, and the ad briefs.~~ **Done 13 Nov 2026.**
4. ~~`docs/SECURITY.md`.~~ **Done 13 Nov 2026.**
5. ~~`?demo` attack toggle, if time remains.~~ **Done 13 Nov 2026.**

Nothing on this list adds a feature. That is the point.
