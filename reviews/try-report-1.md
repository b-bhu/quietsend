# Try report 1 — User-flow tester

Independent Hermes session (`glm-5.3-flash` via ollama-cloud), 2026-11-12 18:41 IST (Asia/Calcutta).
Angle: walk the app as a new NEAR user (login, home, send, explorer, history, resume, errors).
Method: GLM had no tools and no keys; it was fed the web UI/lib source plus real outputs from `npx tsx web/scripts/verify-lib.ts` (read-only, all PASS), `parseUsdc`/`isAddr` edge cases, and curl of `:5173`. I then verified every finding against the code and those outputs.

## Verdict

Happy path is coherent. No critical or high user-flow bugs. GLM's findings were accurate, mostly low/nit (validation messages, silent "Check again", demo chrome). Resume-from-NEAR-hash is correctly designed. I fixed the clear bugs below. I did not change send modes, detection rules, or script behaviour.

## Findings (verified)

| # | Severity (GLM) | Verdict | File:line (as GLM saw it) | Notes |
|---|---|---|---|---|
| 1 | low | **Real** | `Send.tsx:47`, `send.ts:45`, unused `isAddr` in `inspect.ts:59` | Send only guarded `!to`. Invalid address bubbled a raw web3.js error. |
| 2 | low | **Real** | `Home.tsx:23,32` | On RPC failure, error and "Loading..." both showed forever. |
| 3 | low | **Real** | `Explorer.tsx:106-111` | "Check again" discarded `pollLeg2` logs and showed no timeout text after 30 s. |
| 4 | low | **Real (reasoned, not executed)** | `App.tsx:72-79`, `main.tsx` StrictMode | Two overlapping `resumePending` runs in dev could let a failed second run overwrite a settled record. Plausible; not reproduced with a wallet. |
| 5 | low | **Real** | `send.ts:53` `ataOf` | Off-curve / PDA recipients throw a library error from `getAssociatedTokenAddressSync`. |
| 6 | nit | **Real** | `solana.ts:35-36` | Confirmed: `"-1"` used to say "up to 6 decimals". |
| 7 | nit | **Real** | `web/index.html:5`, empty `web/public/` | curl: `/favicon.svg` was `text/html` (the index page). |
| 8 | nit | **Real** | `web/index.html:7` | Title was `web`. |
| 9 | nit | **Real** | `Home.tsx:17` | Copy had no feedback; clipboard rejection was unhandled. |
| 10 | nit | **Real (low likelihood)** | `History.tsx` / `formatUsdc` | `loadHistory` does not validate shape; `BigInt` on a bad `amountBase` would crash the table. |

## Fixed in this pass (no design change)

- Send validates with `isAddr` and shows "Not a valid Solana address"; `runSend` also maps the throw and rejects off-curve recipients with a clear message (`send.ts`, `Send.tsx`).
- Home: if balances fail, show the error only (no eternal "Loading..."); Copy flashes "Copied!" and falls back to selecting the address (`Home.tsx`).
- Explorer "Check again" shows poll status and "No payout found in 30 s — try again later." (`Explorer.tsx`). Detection logic unchanged.
- `resumePending` has a module-level in-flight lock so StrictMode cannot overlap two resumes (`send.ts`).
- `parseUsdc("-1")` now says "Amount must be greater than 0" (`solana.ts`).
- Tab title is `quietsend (devnet / testnet)`; added `web/public/favicon.svg` (curl now returns `image/svg+xml`).
- History renders "?" / "—" for a malformed amount or date instead of crashing.

## Needs Bibhu

None from this report alone. Related leftovers are listed in try-report-2 (recipient "warn if not a wallet", tighter leg-2 detection).

## Checked and OK (agreed)

`parseUsdc`/`formatUsdc` edge matrix; self-send / USDC+fee / SOL floors; expired-blockhash message; pending persist + resume from NEAR tx hash; verify-lib all PASS including economic-check and pollLeg2 positive/negative cases.

## Raw GLM output

```markdown
# Try report — Session 1 (user-flow tester)

Walked the app as a first-time NEAR user from source plus the real outputs: connect/restore → Home → Send (normal and hide) → Explorer → History, plus reload/resume and the three error drills (bad address, too-large amount, expired blockhash). The happy path is coherent end-to-end: session restore via `getConnectedWallet`, derived address on Home, balance checks before any_NEAR call, one 1-yocto wallet approval, local ed25519 verification before broadcast, honest PUBLIC/HIDDEN explorer cards, event-driven history. Error paths mostly produce typed, specific messages; I found no critical crash in the provided flow code. Findings: 5 low + 5 nit, mostly message clarity and demo polish (favicon/title broken per real curl output). Resume-after-reload is correctly designed — it recovers the signature from the NEAR tx hash without needing the wallet. Cannot verify: actual wallet click-through, MagicBlock fee internals (`magicblock.ts`/`config.ts` not provided).

## Findings

**1. A bad recipient address surfaces as a raw web3.js error; `isAddr` exists but the UI never uses it**
- Severity: low
- File:line: web/src/lib/send.ts:45; web/src/components/Send.tsx:33-47 (approx); web/src/lib/inspect.ts:55 (approx, unused export)
- Observed: Send.tsx's only guard is `disabled={busy || !to}` (line 47); the address is passed unvalidated to `runSend`, which does `new PublicKey(inp.recipient).toBase58(); // throws on invalid address` (send.ts:45). The tested helper `isAddr` ("not-an-address" → false per real output) is imported by no component. A typo'd paste yields whatever web3.js throws (likely "Invalid public key input") in red, with no hint which field or what's expected.
- Why it matters: this is the most likely first failure for a new user; the raw library text makes the app look broken rather than guiding them.
- Suggested fix: validate on submit (or blur) with `isAddr(to.trim())` and render "Not a valid Solana address" next to the field before calling `runSend`.
- DesignChange: no

**2. Balance-load failure on Home shows both an error and an eternal "Loading..."**
- Severity: low
- File:line: web/src/components/Home.tsx:23 and approx 32
- Observed: `{err && <p className="err">{err}</p>}` is followed by `{bal ? <table>…</table> : <p>Loading...</p>}`. On RPC failure (public devnet RPCs 429/502/503, per the comment at solana.ts:18) `err` is set but `bal` stays undefined, so the panel reads "Could not load…/error" plus "Loading..." forever until the user spots the Refresh button.
- Why it matters: a first-time user concludes the app is hung.
- Suggested fix: when `err` is set, render "Could not load balances — `<reason>`" (and the Refresh button) instead of "Loading...".
- DesignChange: no

**3. Explorer "Check again" is silent: 30 s wait, polling log discarded, no found/not-found feedback**
- Severity: low
- File:line: web/src/components/Explorer.tsx:approx 97-110; web/src/lib/send.ts:pollLeg2 (log passed as `() => {}`)
- Observed: the button calls `pollLeg2(rec, () => {}, 30_000)` — every log line ("Ignoring …", "Waiting for MagicBlock payout...") is thrown away; if nothing matches in 30 s the UI re-renders exactly as before ("not seen yet").
- Why it matters: during a demo the user clicks, waits up to 30 s with zero feedback, and "MB hasn't paid yet" is indistinguishable from "nothing will ever come".
- Suggested fix: forward log lines into a small status `<p>` and on timeout display "No payout found in 30 s — try again later."
- DesignChange: no

**4. StrictMode double-invokes the resume effect → two concurrent `resumePending` runs in dev (duplicate broadcast attempt)**
- Severity: low
- File:line: web/src/App.tsx:approx 72-79; web/src/main.tsx:7-10
- Observed: the resume `useEffect` has no cancellation; `loadPending()`/`getRecord()` are read at effect start, but `clearPending()` happens only inside `finish()` after the broadcast (send.ts) or in the failure catch. React 18 StrictMode (dev build, which is what `npm run dev` serves) invokes effects twice, so two overlapping resumes can both reach `attachSignature` → `broadcast` of the same raw tx. Not executed by me; this is reasoning about React's documented dev behavior plus the code's pending lifecycle.
- Why it matters: identical bytes are usually deduped by the node, but it makes `saveRecord` double-write statuses; if the re-submission errors (some RPCs reject an already-processed tx), the second run's catch can overwrite a just-settled record with `status: "failed"`, `error: "Transaction already processed…"`.
- Suggested fix: add a module-level in-flight guard (or clear pending at the start of `resumePending`) so resume runs once per page load.
- DesignChange: no

**5. Recipient address that is a PDA / off-curve key throws a raw library error after the balance checks**
- Severity: low
- File:line: web/src/lib/send.ts:53 (`const recipientAta = ataOf(to);`)
- Observed: `ataOf` calls `getAssociatedTokenAddressSync(MINT, owner)` with the default `allowOwnerOffCurve = false`, which throws for off-curve owners; neither Send.tsx nor runSend pre-validates. (Only a related data point is observed: the verify-lib capture shows an off-curve owner rejected with `Owner public key is off-curve` — that was a different-sender probe, not this UI path.)
- Why it matters: users plausibly paste a program/vault address; the error text is library-speak, appearing after two RPC round-trips.
- Suggested fix: before `ataOf`, detect off-curve recipients with `new PublicKey(to)` + `isOnCurve()` and show "That address is a program address and can't hold a USDC token account."
- DesignChange: no

**6. Negative amounts report "Enter a USDC amount with up to 6 decimals"**
- Severity: nit
- File:line: web/src/lib/solana.ts:35-36
- Observed (real output): `"-1" ERR Enter a USDC amount with up to 6 decimals` — the regex `^(\d+)(?:\.(\d{1,6}))?$` rejects it and the generic format message fires.
- Why it matters: a sign mistake is mislabeled as a decimal-format mistake.
- Suggested fix: add a branch: if the trimmed input starts with "-", say "Amount must be positive."
- DesignChange: no

**7. Favicon link serves the 626-byte index.html (broken icon, console MIME warning)**
- Severity: nit
- File:line: web/index.html:5
- Observed (real output): `GET /favicon.svg → 200 but Content-Type: text/html, same 626-byte index.html` because `web/public/` is empty.
- Why it matters: the tab icon fails and the browser console shows a MIME warning on every load — visible noise during a demo.
- Suggested fix: add a real `web/public/favicon.svg` or delete the `<link rel="icon">` line.
- DesignChange: no

**8. Tab title is "web"**
- Severity: nit
- File:line: web/index.html:7 (`<title>web</title>`)
- Observed: real curl confirms the title, while the in-app h1 (App.tsx:~113) says "quietsend (devnet / testnet)".
- Why it matters: first impression in the tab bar for a demo.
- Suggested fix: `<title>quietsend (devnet / testnet)</title>`.
- DesignChange: no

**9. Copy button gives no feedback and fails silently on insecure origins**
- Severity: nit
- File:line: web/src/components/Home.tsx:17
- Observed: `onClick={() => navigator.clipboard.writeText(session.solanaAddress)}` — no confirmation state and the promise rejection is unhandled. Over plain http from a non-localhost host (e.g. demoing on a phone via LAN), the Clipboard API is unavailable, so the button does nothing.
- Suggested fix: on resolve flash "Copied!" and on reject fall back to selecting the text.
- DesignChange: no

**10. A corrupted `amountBase`/`createdAt` row in localStorage can crash History/Explorer rendering**
- Severity: nit
- File:line: web/src/lib/history.ts:12-15 (approx, `read`); web/src/components/History.tsx:20-25 (approx)
- Observed: `read` guards `JSON.parse` but not shape; the row render calls `formatUsdc(r.amountBase)` → `BigInt(string)` throws, and without an error boundary React unmounts to a blank page. Low likelihood (values are written only by send.ts), so flagged as a robustness nit only.
- Suggested fix: `try/catch` inside row rendering (or filter malformed rows in `loadHistory`).
- DesignChange: no

## Things that looked OK (coverage)

- `parseUsdc`/`formatUsdc`: all 20 edge cases in the real output match the code — trim, leading zeros, exact 1,000,000 cap ("1000000" passes, "1000000.1" rejects), 0/0.0/0.000000 rejected with a distinct message, scientific notation/comma/".1" rejected.
- `isAddr` real-output consistency, including `1111…1` and `So111…112` (both valid curve keys).
- Headless verify-lib: derivation equals the view-call derivation, path sensitivity, balances readable, normal tx message 214 bytes, MagicBlock v0 build + program allowlist, economic guard refusing the 0.1-USDC-when-0.01-asked attack (message quoted verbatim in output), different-sender rejection, `pollLeg2` positive and negative cases.
- Client-side guards in `runSend`: self-send check (send.ts:46), USDC floor including the hide-mode fee estimate, SOL floor ("about 0.003 devnet SOL"), both with human-readable messages; recipient trimmed in Send.tsx so trailing-space paste works.
- Expired-blockhash path: typed message ("The NEAR call already happened; just send again"), failed record saved with `nearTxHash` retained, pending cleared.
- Resume: pending saved before the wallet prompt / after each step, cleared after leg1 broadcast or on failure; `resumePending` needs no wallet (reads signature from NEAR RPC) and has specific no-hash messaging.
- History refresh via `quietsend:history` event, 100-record cap, empty-state sentence; Explorer "Send not found" message; route handling including bare `#/tx/` (empty id → not found); nav active-state logic.
- Explorer privacy claims match the leg semantics (leg1 never names the recipient; leg2 payout matched by owner + exact amount; failed txs skipped) against `inspectTx`'s owner-keyed balance deltas.

## Evidence limits (not claimed as bugs)

- `magicblock.ts`, `config.ts`, `polyfill.ts`, and `scripts/` were not provided: I could not verify the MagicBlock fee formula against the UI's "0.1%" label (one sample point matches: fee 100 of 100000), the balance precheck's fee estimate (`amountBase/1000n + 1n`, send.ts:49) versus the actual `mb.feesTokens` fetched later, `SIGN_GAS`/`SIGN_DEPOSIT_YOCTO` values vs the UI's "1 yoctoNEAR" copy, or the `VITE_*` defaults.
- Wallet-side UX (picker, redirect wallets, `@hot-labs/near-connect` event names) is unverified — the app cannot be clicked.
- Finding 4 is reasoning about React 18 StrictMode dev mode, not an executed repro; its worst-case outcome depends on node handling of duplicate tx submission.

```
