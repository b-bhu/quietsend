# Try report 3 — Honesty / docs / demo-readiness

Independent Hermes session (`glm-5.3-flash` via ollama-cloud), 2026-11-12 18:41 IST (Asia/Calcutta).
Angle: PLAN.md, README.draft.md, in-app PUBLIC/HIDDEN labels vs what is really on chain; overclaims; judge's first impression.
Method: GLM had no tools and no keys; it was fed the docs and UI copy plus curl of `:5173` and `inspectTx` of the proven txs. I verified every finding against those sources. Times below are IST (Asia/Calcutta), converted from Solana `blockTime`.

## Verdict

The privacy wording in PLAN, the explorer "Honest summary", and most of README.draft.md is careful and matches the chain: hide-mode leg 1 does not name the recipient wallet or ATA; leg 2 does not name the sender; fee is 0.1% (1.001/1.000 and 0.1001/0.1000); legs were 2 s and 1 s apart. Gaps were copy-level: the app tagline overclaimed "No Solana key exists.", README.draft.md still said the web app was "planned but not built", the tab title was "web" with a broken favicon, one HIDDEN tag was used for an architecture fact, and "NEAR-key-free signing" inverted the mechanism. All of those are fixed below. No design-change items.

## On-chain check (for the labels)

- Normal 1 USDC (`3hUZ5hSA…`, 2026-11-12 00:13:06 IST): sender and recipient ATA public; recipient *wallet* is not in account keys (only the ATA is) but USDC changes name the recipient owner. Explorer normal-mode copy still correctly states sender, recipient and amount are public (it prints them from the record).
- Hide 1 USDC leg 1 (`2w2LRuLn…`, 17:37:27 IST): sender −1.001, vault +1.001; recipient wallet **no**, recipient ATA **no**.
- Hide 1 USDC leg 2 (`5cTHDqYs…`, 17:37:29 IST, 2 seconds later): vault −1, recipient +1; sender **no**; signed by `MAS1Dt9q…`, not the user.
- Hide 0.1 USDC legs (`4pgywdpf…` at 18:22:27 IST, `S4LR9EjX…` at 18:22:28 IST): same pattern, 1 second apart, fee 0.0001.

This matches PLAN/README: the direct link is not in either transaction; amount and timing remain easy to match.

## Findings (verified)

| # | Severity (GLM) | Verdict | File:line (as GLM saw it) | Notes |
|---|---|---|---|---|
| 1 | high | **Real** | `App.tsx:101` | Tagline "No Solana key exists." is stronger than PLAN/README ("no key is stored"; shares exist on the MPC network). |
| 2 | high | **Real** | `README.draft.md` ~26, ~84, ~13 | Draft said the web app was planned / not built; PLAN items 1–5 are done and `:5173` was serving the app. |
| 3 | medium | **Real** | `web/index.html:5,7` | Title `web`; favicon served the HTML index. |
| 4 | medium | **Real** | `Explorer.tsx:70` | "HIDDEN: no private key anywhere: 16 MPC nodes sign together" is an architecture claim, not a chain-derived hidden fact, and it dropped the "at least 11 of 16" qualifier. Line is 70, not only "approx". |
| 5 | medium | **Real** | `Explorer.tsx:143` (GLM said ~123; actual line 143) | "NEAR-key-free signing" is backwards: a NEAR key authorizes the MPC request. |
| 6 | low | **Real** | `Send.tsx:43-44` | "MagicBlock private transfer" overshoots; the mode hides the direct link, not amount/timing. The 0.1% fee was confirmed on both proven runs. |
| 7 | nit | **Real** | `README.draft.md` proven txs | The 0.1 USDC hide run was verified but not listed. |

GLM correctly noted `lib/near.ts` `excludedWallets` was not in its file set; I confirmed it hides `ethereum-wallets`, `near-cli`, and `ledger`, matching PLAN.

## Fixed in this pass (copy / chrome only)

- Tagline is now "No Solana private key is stored anywhere." (`App.tsx`).
- README.draft.md now describes both the scripts and the built web app, and lists the 0.1 USDC hide-run explorer links. It is still a draft, not the official README.
- Title and favicon as in try-report-1.
- Explorer NEAR card: untagged line "no Solana private key is stored on your device — 16 MPC nodes hold shares, and at least 11 must sign together."
- Explorer fee line uses `rec.mbFeeTokens` when present, instead of a hardcoded "amount + 0.1% fee".
- Normal-mode honest summary: "Only the MPC signing without a Solana key is special here (a NEAR key still authorizes it)."
- Send toggle: "Hide recipient (MagicBlock, 2 legs, 0.1% fee — hides the direct link, not the amount)".

## Needs Bibhu

None from this report. (Deploy to Vercel and the official README promotion were already waiting on your yes, per PLAN.)

## Checked and OK (agreed)

Honest summary matches PLAN; Send's "recipient and amount public" / one-approval / blockhash hint; "(devnet / testnet)" in the h1; Circle USDC 6 decimals; no mainnet claims; README limitations (not anonymous, not trustless/TDX, delay/split untested, no recovery path without the NEAR account).

## Raw GLM output

```markdown
# quietsend — Try-report, session 3 (honesty / docs / demo-readiness)

## 1. Summary

Compared PLAN.md and README.draft.md against five chain-verified devnet transactions (the provided `inspectTx` output) and the served dev app (curl evidence), plus the in-app copy in App/Explorer/Send/Home/History. Verdict: the privacy wording in both docs and the in-app "Honest summary" is unusually careful and matches the on-chain evidence (leg 1 contains no recipient wallet or ATA, leg 2 contains no sender, fee exactly 0.1% on both proven runs, legs 1–2 s apart); the three README "Proven transactions" links are real txs with `err null`. The gaps are copy-level: the app tagline makes an unqualified "No Solana key exists." claim the docs deliberately avoid; README.draft.md is stale and claims the web app is "planned but not built" while it is built, running and serving source; and the page chrome says "web" with a broken favicon. Two smaller label/wording bugs in the Explorer. No `DesignChange: yes` findings — everything below is a safe copy/chrome fix.

## 2. FINDINGS

1. **Unqualified tagline "No Solana key exists."**
   - Severity: high
   - File:line: web/src/App.tsx:101 (approx)
   - Observed: `<p style={{ margin: "4px 0" }}>Send Solana USDC with only a NEAR account. No Solana key exists.</p>`. PLAN.md's "Honest privacy statement" and README.draft.md both qualify this ("16 MPC nodes hold shares and at least 11 sign together" / "never held or written **by the user or by these scripts**"); the app's one-liner, the first thing a judge reads, does not. As written it is false under a hostile reading: key material does exist, as shares on the MPC network, and the network's policy — not the user's device — bounds who can sign.
   - Why it matters: this is exactly the overclaim this review is meant to catch; a security-literate judge will test the strongest sentence first.
   - Fix: e.g. "Send Solana USDC with only a NEAR account — no Solana private key exists on your side; an MPC network holds only shares (16 nodes, ≥11 must sign)."
   - DesignChange: no (though Bibhu should approve final wording since it is the product's voice)

2. **README.draft.md is stale: describes the web app as "planned but not built"**
   - Severity: high
   - File:line: README.draft.md:26, :84 (approx; also :13)
   - Observed: "*A Vite + React web app is planned* ... *it is not built or described in detail here*" and "*Not a polished product. It is Node/TypeScript scripts run manually with NEAR keys in `.keys/`; the web app is planned but not built.*" Contradicted by PLAN.md build order (items 1–5 `[done]`, including normal send, hide send, explorer page) and by reality: the dev server at 127.0.0.1:5173 returns 200 with `#root` and serves `/src/App.tsx`, `/src/components/Send.tsx`, `/src/lib/send.ts`. web/README.md documents run steps. README:13's "the user's NEAR wallet **would** approve the call" describes implemented behaviour in future tense.
   - Why it matters: a judge reading the README first will underrate the project to "scripts only" while the demoed page contradicts the text — the report looks unreconciled.
   - Fix: rewrite the status/"Scripts overview"/"Not a polished product" lines to describe both artifacts: the web app (built, wallet-authorized, no `.keys/`) and the scripts (manual, `.keys/`, used to prove the txs).
   - DesignChange: no

3. **Tab title is "web" and favicon link 404s to HTML**
   - Severity: medium
   - File:line: web/index.html:7 (title), web/index.html:5 (icon link) — counted from the listing
   - Observed (real curl output): "GET / -> 200, HTML title is `web`" while the in-app h1 is "quietsend (devnet / testnet)"; "GET /favicon.svg -> 200 but Content-Type: text/html, same 626-byte index.html (web/public/ is empty; no favicon file)" — so the browser tries to parse HTML as SVG and shows a broken/no icon.
   - Why it matters: title+favicon are the judge's very first impression, before any copy loads; "web" is a scaffold name.
   - Fix: set `<title>quietsend — Solana USDC via NEAR (devnet/testnet)</title>`; add a small favicon.svg to `web/public/` or delete the `<link rel="icon">` line.
   - DesignChange: no

4. **"HIDDEN" tag on an architecture claim; node-count wording conflicts with README**
   - Severity: medium
   - File:line: web/src/components/Explorer.tsx:70 (approx)
   - Observed: `<Hid>no private key anywhere: 16 MPC nodes sign together</Hid>` sits in the NEAR-request card among chain-derived PUBLIC facts. Per PLAN ("each fact labelled PUBLIC or HIDDEN, computed live from the chain"), HIDDEN here means "not on chain" — but this line is not an on-chain fact at all; it is an architecture statement, computable from no transaction. It also says "16 MPC nodes **sign together**", while README.draft.md says "At least **11 of 16** nodes produce an Ed25519 signature".
   - Why it matters: on the demo's centrepiece page, a fact tagged HIDDEN with no hidden counterpart invites the question "hidden from whom?" and the 16 vs 11-of-16 discrepancy is catchable against the README.
   - Fix: re-tag as PUBLIC and reword: "no Solana key on your device — signing is MPC (16 shares, ≥11 must sign)".
   - DesignChange: no

5. **"NEAR-key-free signing" inverts the mechanism (normal-mode honest summary)**
   - Severity: medium
   - File:line: web/src/components/Explorer.tsx:123 (approx)
   - Observed: `<li>Everything on Solana is public: sender, recipient and amount. Only the NEAR-key-free signing is special here.</li>` The signing is Solana-key-free but NEAR-key-**authorized** — a NEAR key signs the MPC request (README:13, PLAN flow step 4). "NEAR-key-free" says the opposite of what happens.
   - Why it matters: it is the honest-summary block, i.e. the sentence a reviewer reads most carefully; the inverted term discredits the surrounding correct text.
   - Fix: "Only the MPC signing without a Solana key is special here (a NEAR key still authorizes it)."
   - DesignChange: no

6. **Hide-mode label says "private transfer" and states the fee as fixed**
   - Severity: low
   - File:line: web/src/components/Send.tsx:43–44 (approx)
   - Observed: radio label `... Hide recipient (MagicBlock private transfer: 2 legs, 0.1% fee)`. The mode hides only the sender↔recipient link (amount, timing, NEAR call stay public — the app's own honest summary says so); unqualified "private" overshoots, and "0.1% fee" is MagicBlock's current rate (0.001 on 1.0; 0.0001 on 0.1 — both verified) which PLAN hedges elsewhere ("at most amount + reported fee (+0.2%)").
   - Why it matters: the label is the claim users see before any disclaimer; "private" invites the exact misunderstanding the honest summary then has to undo.
   - Fix: "Hide recipient (2-leg MagicBlock route, fee ≈0.1% — hides the direct sender↔recipient link, not amount/timing)".
   - DesignChange: no

7. **README lists one proven run; a second full run is verified**
   - Severity: nit
   - File:line: README.draft.md:61–70 (approx, "Proven transactions")
   - Observed: "All on Solana devnet, from the tested run:" lists the 1-USDC normal + 1-USDC leg 1/leg 2. The provided chain data also proves a 0.1-USDC hide run (legs `4pgywdpf…`, `S4LR9EjX…`, 1 s apart, fee 0.0001) that is absent.
   - Why it matters: tiny completeness gap in the evidence record, nothing more.
   - Fix: add the 0.1-USDC links or write "one run shown; a second (0.1 USDC) also verified".
   - DesignChange: no

## 3. Checked and looks OK

- Chain vs claims: leg 1 lacks recipient wallet **and** ATA; leg 2 lacks sender (16 accounts, signers = MagicBlock only); fee arithmetic matches (−1.001/+1.001 then −1/+1; −0.1001/+0.1001 then −0.1/+0.1); legs 2 s / 1 s apart, consistent with "a few seconds apart" in PLAN/README/summary.
- README's three explorer links match the verified tx hashes exactly, all `err null`.
- In-app "Honest summary" (both modes) matches PLAN's "Honest privacy statement", including "a random path would not help: the path is in the public NEAR call" and "A patient observer can still match the legs".
- Send screen honesty: normal mode labelled "recipient and amount public"; one-approval/1-yoctoNEAR/~60 s blockhash hint matches PLAN's risk section.
- Network/token claims: "(devnet / testnet)" in app h1 plus README status line; Circle devnet USDC and 6-decimals note consistent with the 6-decimal deltas in `inspectTx`. No mainnet claims anywhere.
- README limitation bullets (not anonymous, not trustless/TDX, no recovery path, delay/split untested at 0 ms, Roadmap "Nothing below is built") all present and mutually consistent with PLAN's unverified-stretch list.
- web/README.md env-var and source-map lists match the modules actually imported by the provided components.

## 4. Evidence limits (not checked, not claimed)

Per instructions I ran nothing; all transaction facts come from the supplied `inspectTx` output. Wallet-connect behaviour (PLAN marks Bibhu's hand-test as `[todo]`) is unverified. PLAN's "the app hides Ledger, NEAR CLI and Ethereum Wallets" must live in `lib/near.ts`, which was not provided — neither confirmed nor denied. Line numbers for source files are counted from the listings (approx); index.html line numbers are from direct count. Demo RPC config (keyed vs OnFinality default) is unknown; PLAN already flags 429/503 there, reconfirm `VITE_SOLANA_RPC` before the demo.

```
