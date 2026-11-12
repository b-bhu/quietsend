# Try report 2 — Security / correctness

Independent Hermes session (`glm-5.3-flash` via ollama-cloud), 2026-11-12 18:41 IST (Asia/Calcutta).
Angle: MPC sign request shape, MagicBlock blind-signing guards, amounts/decimals, leg-2 detection, secret handling, localStorage.
Method: GLM had no tools and no keys; it was fed the web lib, `scripts/04-sign.ts`, `scripts/mb-03-send.ts`, `scripts/mb-lib.ts`, `scripts/config.ts`, the `--dry-run` sign request, verify-lib output, parseUsdc/isAddr cases, and `inspectTx` of the proven devnet txs. I verified every finding against that code and those outputs. `.gitignore` covers `.env*`, `.keys/`, and `out/` (GLM could not see it; I confirmed).

## Verdict

No critical or high findings. The web lib matches the intended guard chain: sign request shape is identical to `04-sign.ts --dry-run` (`payload_v2.Eddsa`, path `solana-1`, `domain_id: 1`, 1 yoctoNEAR, 300 Tgas); checks run before the wallet prompt; the signature is verified locally before broadcast; localStorage holds no keys. Remaining issues: a residual blind-sign gap on *other* tokens at the derived address (I tightened the top-level Transfer source check), the still-unguarded `scripts/mb-03-send.ts` (needs Bibhu), and a heuristic leg-2 detector (needs Bibhu).

## Findings (verified)

| # | Severity (GLM) | Verdict | File | Notes |
|---|---|---|---|---|
| 1 | medium | **Real** | `magicblock.ts` `checkTopLevelInstructions` / `checkEconomics` | Top-level Transfer(3)/TransferChecked(12) were allowed from *any* token account; economics only watches the USDC ATA and SOL. A compromised MB API could move other tokens at the derived address. Bounded (today the address holds only USDC+SOL). |
| 2 | low | **Real** | `scripts/mb-03-send.ts:27` vs later `sendTo` check | Script still MPC-signs before almost any check, and treats any recipient-balance change as settled. Known divergence from the web lib. |
| 3 | low | **Real** | `send.ts` `pollLeg2` | Any new sig on the recipient ATA with exact USDC delta counts as leg 2. A coincidental same-amount transfer could mark the send settled while the vault still holds funds. |
| 4 | low | **Real** | `solana.ts` `broadcast` + `send.ts` `finish` | `leg1Sig` was assigned only after confirm. If confirm failed after `sendRawTransaction` succeeded, history showed failed with no signature. |
| 5 | low | **Real** | `send.ts` / `isAddr` | Any valid base58 was accepted, including mints and the system program. (ATAs/PDAs are off-curve and are now rejected — see fixes.) Warning on "looks like a token/mint account" would change product UX. |
| 6 | low | **Real** | `config.ts` `VITE_MB_EXTRA_PROGRAMS` | `split(",")` had no trim. |
| 7 | nit | **Real** | `magicblock.ts` program allowlist | LUT-loaded program ids already fail closed; the error text could be empty (`undefined` joined). |
| 8 | nit | **Real** | `magicblock.ts` `checkEconomics` | Pre-state was fetched after simulation; a too-short post-account would throw `RangeError` instead of the friendly refusal. Still fail-closed. |
| 9 | nit | **Real** | `scripts/04-sign.ts` dry-run log | Confirmed: `Deposit: 1 yoctoNEAR (1 yoctoNEAR)`. |

`.gitignore` is correct (GLM's "I cannot verify" is not a bug). I did not treat "CPI burn indistinguishable from the intended deposit" as a separate bug: that residual is inherent to simulation-on-watched-accounts, and changing it would be a new design.

## Fixed in this pass (no design or script-behaviour change)

- Top-level Token Transfer/TransferChecked must source the sender's USDC ATA; TransferChecked must use the USDC mint. LUT program indexes get an explicit refusal message. `checkEconomics` now reads pre-state first and rejects short account data with a clear message (`magicblock.ts`). verify-lib still builds a real MagicBlock tx and PASSes, so the proven instruction shape is compatible.
- `broadcast` calls `onSent(sig)` immediately after `sendRawTransaction`; `finish` persists `leg1Sig` at that moment. The expiry error also includes the signature (`solana.ts`, `send.ts`). Successful path unchanged.
- `VITE_MB_EXTRA_PROGRAMS` is trimmed and empty entries dropped (`config.ts`).
- Dry-run log is now `Deposit: 1 yoctoNEAR` (`04-sign.ts` — log text only).

## Needs Bibhu

1. **Port the web MagicBlock guards into `scripts/mb-03-send.ts`, or retire that script as a live path.** It still signs whatever MagicBlock returns (sign happens before the `sendTo` check; no allowlist, no economics). Recommendation: one shared guard module; keep the script as the reference demo *with* the guards on. I did not change the script's behaviour.
2. **Tighten `pollLeg2` so a payout must also be signed by MagicBlock (or touch the vault), not just "new sig + exact amount".** Today's rule can mark a coincidental same-amount transfer as settled. Recommendation: start with a warning in the explorer, then make the signer check hard once we confirm `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` is stable. I did not change detection.
3. **Warn (not block) when the recipient is a mint, the system program, or another unexpected account type.** Off-curve / ATA pastes are now blocked; on-curve foot-guns (e.g. a mint) are not. Recommendation: `getAccountInfo` at send time and a warning. I did not add this.

## Checked and OK (agreed)

Sign-request parity with the dry-run; guard ordering (all checks before the wallet prompt); local ed25519 verify; `parseUsdc` matrix (1 USDC = 1_000_000, max 1_000_000 USDC still inside JS safe integers for `Number(amountBase)`); `inspectTx` deltas on all five proven txs; pollLeg2 positive/negative in verify-lib; no secrets in localStorage (history + one pending unsigned tx / message hex / NEAR hash only); NEAR keys only read from gitignored `.keys/` / env and never printed.

## Raw GLM output

```markdown
# Try-report — quietsend, session 2/3 (security / correctness)

## 1. Summary

Compared the web lib guard chain against the stated intent and against `scripts/mb-03-send.ts`, using the provided real outputs as ground truth. Verified the MPC sign request shape (path `solana-1`, `payload_v2.Eddsa` hex, `domain_id: 1`, 1 yoctoNEAR deposit, 300 Tgas) is byte-identical between `web/src/lib/near.ts` and the `04-sign.ts` dry-run output. Walked the blind-signing guards in `requestPrivateTransfer` (sendTo=base, single signer = user, program allowlist, top-level SPL token ix filter, simulation economics) — all run before the wallet prompt, all fail-closed, and the two negative controls pass in the verify output. Checked SPL account-layout offsets used by `checkEconomics` against the real account layout (amount@64, owner 32..64, delegate tag@72, close-authority tag@129) — correct. Ran the parseUsdc/isAddr edge matrices against the regex/logic — all outputs consistent. Traced `inspectTx` deltas and `pollLeg2` behaviour against the five real devnet txs and the verify-leg2 run — consistent. Reviewed secret handling and localStorage shapes — no keys or secrets anywhere in browser state. Verdict: **no critical or high findings; the web lib matches the stated intent.** Remaining issues are a scope gap in the token-ix/economics guard (other assets at the derived address), the still-unguarded legacy script, a heuristic leg-2 detector, and a few ugly-but-fail-safe error paths. Caveat: no live web-path sign ran this session (no real sends), so the manual-shaped sign call and the resume path are unproven today, only shape-checked.

## 2. Findings

**1. Token-ix filter and economics guard do not bind the signed tx to the user's USDC account — other assets at the derived address are not protected**
- Severity: medium
- File: web/src/lib/magicblock.ts (checkTopLevelInstructions and checkEconomics), approx
- Observed: `const TOKEN_IX_OK = new Set([3, 12]);` allows any top-level Transfer(3)/TransferChecked(12) regardless of which token account is the source, and `checkEconomics` simulates only `addresses: [senderAta, from]` — the USDC ATA and native SOL. So a malicious/compromised MagicBlock API response could include a Transfer(3) whose source is the user's *other* token account (e.g. a non-USDC ATA at the derived address, authority = derived address): tag 3 is allowed, the Token program is allowlisted, and both economic checks would still pass. Equally, a burn via CPI from an allowlisted program is indistinguishable from the intended deposit (same balance delta).
- Why it matters: this is the concrete residual of the blind-signing threat — the MPC could sign movement/destruction of assets beyond this send's amount. Loss is bounded (≤0.01 SOL, whatever non-USDC tokens sit at the derived address — currently none per the verify output, and any exploit requires a compromised MB API which already holds the leg-1 funds), hence medium not high.
- Fix: parse top-level Transfer/TransferChecked and require source == senderAta (and mint == USDC for TransferChecked); optionally reject any tx listing another token-program account owned by the user. The proven leg-1 txs show the legitimate flow has source == senderAta, so this is safe to add.
- DesignChange: no

**2. scripts/mb-03-send.ts still blind-signs the MagicBlock tx and settles on any recipient-balance change**
- Severity: low (known divergence, but it is the historically live path)
- File: scripts/mb-03-send.ts, approx
- Observed: `const sig = await mpcSign(msgBytes);` runs **before** `if (r.json.sendTo !== "base") throw` — the tx is signed before any check, and there is no signers-count check, no program allowlist, no token-ix filter, no economics simulation (all of which the web lib now has). Settlement is `if (after.recipient !== before.recipient)` — *any* change to the recipient's USDC balance counts as SETTLED, much looser than the web lib's exact-amount rule. `amount = Number(process.env.MB_AMOUNT ?? 1_000_000)` is unvalidated.
- Why it matters: if anyone re-runs the script for the demo, they get the weaker behaviour the prior review removed from the web lib; two divergent code paths for the same security decision.
- Fix: either delete/deprecate the script or make it import the guard functions from the web lib so both paths share one implementation.
- DesignChange: yes — porting guards into (or retiring) the script changes script behaviour/scope; ask Bibhu. Recommendation: single shared guard module, script kept as the reference demo with guards on.

**3. pollLeg2 can mark a send "settled" from an unrelated same-amount transfer**
- Severity: low
- File: web/src/lib/send.ts (runSend / pollLeg2), approx
- Observed: `if (!v.err && got === BigInt(rec.amountBase))` accepts *any* new signature touching `recipientAta` with delta == amount. Also `seenAtaSigs: await recentSigs(recipientAta).catch(() => [])` — if that first snapshot RPC call fails, the pre-send set is silently empty, widening the window. (A tx where the recipient's other token accounts moved is fine; only the ATA delta is read — good.)
- Why it matters: the record flips to `settled` and the UI stops polling while the vault may still hold the user's leg-1 funds; a coincidental third-party transfer of the same amount masks a real MB non-payout. The verify output proves it works on the clean case; nothing proves robustness on a busy recipient ATA.
- Fix: additionally require the payout signature to come from MagicBlock's key (`MAS1Dt9qreoRMQ...`, seen as sole signer in both leg-2 txs) or to include its vault account, at least as a logged diagnostic first.
- DesignChange: yes — pinning the signer changes detection behaviour (an MB signer rotation would break detection); recommend confirming with Bibhu before making it a hard check.

**4. leg1Sig is lost if broadcast's confirm loop fails after sendRawTransaction succeeded**
- Severity: low
- File: web/src/lib/solana.ts (broadcast) + web/src/lib/send.ts (finish), approx
- Observed: `rec.leg1Sig = await broadcast(raw, p.lastValidBlockHeight);` — the assignment only happens on success. `broadcast()` can throw `"Transaction not confirmed before its blockhash expired"` after the tx was already submitted; it rechecks history exactly once before giving up. The catch in `runSend`/`resumePending` then marks the record `failed` with no signature.
- Why it matters: funds may have moved on-chain while the history shows a bare "failed" with no sig to link to; the user cannot audit the leg.
- Fix: let `broadcast` expose the signature as soon as `sendRawTransaction` returns (callback or an error object carrying it) and persist it to the record before polling.
- DesignChange: no

**5. Recipient accepts any valid base58 value, including token accounts, PDAs, and mints**
- Severity: low
- File: web/src/lib/send.ts (runSend) + web/src/lib/inspect.ts (isAddr), approx
- Observed: `isAddr("11111111111111111111111111111111")` → true and `isAddr("So11111111111111111111111111111111111111112")` → true (from the real edge-case output). `runSend` does `new PublicKey(inp.recipient).toBase58()` and computes `recipientAta = ataOf(to)` — pasting an existing token account (e.g. `6ejj46Y5...`, the recipient's ATA) or a program/mint address would build an ATA-of-that-address and transfer USDC into an account nobody can spend from.
- Why it matters: silent permanent misroute on user error; on devnet amounts it is a foot-gun, not theft. The only guard is the self-send check (`if (to === inp.solanaAddress)`).
- Fix: at send time resolve `getAccountInfo(recipient)` and warn (not block) when the address is not a normal wallet account (owner != SystemProgram / is a token account); keep isAddr as the fast path.
- DesignChange: no

**6. VITE_MB_EXTRA_PROGRAMS widens the blind-signing allowlist with no trimming or validation**
- Severity: low
- File: web/src/lib/config.ts (MB_ALLOWED_PROGRAMS), approx
- Observed: `...(env.VITE_MB_EXTRA_PROGRAMS ? env.VITE_MB_EXTRA_PROGRAMS.split(",") : [])` — no trim, no empty filtering, no logging.
- Why it matters: a build-time env var can silently extend what the MPC may be asked to sign; a sloppy entry (spaces, a typo'd program) becomes a live permission. (Empty/garbage entries are harmless because they match nothing, but that is luck, not validation.)
- Fix: `.split(",").map((s) => s.trim()).filter(Boolean)` and log the effective extras at startup.
- DesignChange: no

**7. LUT-loaded program ids produce a refusal with an empty program name**
- Severity: nit
- File: web/src/lib/magicblock.ts (requestPrivateTransfer), approx
- Observed: `const programs = [...new Set(tx.message.compiledInstructions.map((i) => keys[i.programIdIndex]))]` uses `staticAccountKeys` only. A v0 tx whose programIdIndex points into lookup-table-loaded addresses yields `undefined` there; `unknown.join(", ")` then renders as "" (Array.join stringifies undefined as empty), so the error reads "…refusing to sign: " with no name. Behaviour is fail-closed (the tx is still rejected).
- Why it matters: confusing diagnostics during a demo; also verify-lib's `ok(!mb.programs.some((p) => p === ""))` would not catch the undefined case.
- Fix: explicitly reject out-of-range `programIdIndex` with "program id from a lookup table"; make the verify check `p == null`.
- DesignChange: no

**8. checkEconomics: pre-state fetched after simulation, and a closed sender ATA crashes with a RangeError instead of the friendly refusal**
- Severity: nit
- File: web/src/lib/magicblock.ts (checkEconomics), approx
- Observed: `const before = await connection.getAccountInfo(...)` and `solBefore` are read *after* `simulateTransaction(...)`, so `spent = u64le(pre, 64) - u64le(post, 64)` mixes snapshots (TOCTOU; also `solBefore - sol.lamports` race). If a malicious tx closes the sender's ATA, simulation returns empty account data for it and `new DataView(..., post.byteOffset + 64, 8)` throws a raw RangeError. Both failure modes still refuse the signature (any throw aborts before return), so this is robustness only.
- Why it matters: confusing error surface; a concurrent transfer elsewhere could skew the spend delta.
- Fix: fetch the pre-state before simulating; guard `post.length < 129` with the existing "refusing to sign" wording.
- DesignChange: no

**9. Dry-run deposit line prints "1 yoctoNEAR (1 yoctoNEAR)"**
- Severity: nit
- File: scripts/04-sign.ts (Deposit console.log), approx
- Observed (real output): `Deposit: 1 yoctoNEAR (1 yoctoNEAR)` — the value and the hardcoded parenthetical are identical, so the parens add nothing.
- Why it matters: cosmetic only; no correctness impact.
- Fix: print `Deposit: ${SIGN_DEPOSIT_YOCTONEAR} yoctoNEAR`.
- DesignChange: no

## 3. Checked and looked OK

- Sign request shape parity: web `mpcSignViaWallet` (`request: { payload_v2: { Eddsa: hex }, path, domain_id }`), 1 yoctoNEAR deposit, 300 Tgas are identical to `scripts/04-sign.ts` and to the real dry-run output; same contract, path, domain, derived address, and mint/decimals constants across web and scripts.
- Guard ordering: `requestPrivateTransfer` performs sendTo-check, single-signer check, allowlist, token-ix filter, and economics simulation all before returning the unsigned tx — nothing is signed before all checks pass; the wallet prompt happens afterwards.
- Local verification before broadcast: `attachSignature` ed25519-verifies against the derived pubkey for both legacy and v0 paths and re-verifies the assembled tx; a wallet/derived-account mismatch fails closed with a clear error.
- checkEconomics SPL layout offsets are correct for the 165-byte token account (amount@64, owner 32..64, delegate tag@72, close-authority tag@129 with the length guard), and the negative control ("expected 10000 + fee 100") proves the spend bound works.
- Fail-closed on lookup-table program ids (rejected, see finding 7 for the message only); fail-closed on unknown ix tags and on empty ix data.
- parseUsdc/formatUsdc full edge matrix matches the code (1e-3, "1,000", ".1", trailing spaces, leading zeros, 7-decimals, >1M cap); formatUsdc output matches the balances line ("17.7989").
- inspectTx USDC deltas by owner reproduce all five real devnet txs correctly (leg1 vault +1.001, leg2 vault −1 / recipient +1, etc.), including aggregated static+loaded addresses and v1-tx handling via raw JSON-RPC.
- pollLeg2 proven both ways against the settled 0.1-USDC send from 12 Nov (finds S4LR9EjX, ignores delta-mismatched sigs); `seen` set and oldest-first ordering handled correctly.
- Secret handling: NEAR keys are only read from env/.keys in the script paths and never printed (verify-lib's fake wallet logs only method/deposit/gas/payload *keys*); out/signature.json contains no secret; "no Solana key is stored" holds in all reviewed code. (I cannot verify .gitignore contents from this prompt — operator-enforced.)
- localStorage contents: history stores addresses/amounts/hashes/seenAtaSigs; the single pending holds unsigned tx bytes + NEAR hash — no secrets; cap of 100 records; corrupt-JSON fallback; redirect-safe resume with pending kept before the wallet prompt and nearTxHash saved before polling.
- Resume failure paths mark the record `failed` and clear pending with explicit messages; blockhash-expiry has a friendly "send again" message.
- Balance/fee margins coherent for the current fee model (fee = 0.1% of amount: need = amount + amount/1000 + 1 covers spend exactly; checkEconomics allows up to 0.2% + 1).

## 4. Evidence gaps (not claimed as bugs)

- No real sign/send was allowed this session, so the web-shaped manual `sign` call, the wallet-redirect resume path (`signatureFromNearTx`), and verify-lib's `--send` blocks are shape-reviewed only — not live-proven today. The proven leg-1/leg-2 txs came from the chainsig.js script path with the same constants.
- The MagicBlock allowlist entries whose identity I could not independently verify (`ACLseoPoy…`, `DELeGGvX…`, `SPLxh1LV…`) are taken as-is from the proven tx; they are only ever checked as allowlist members, and economics bounds their effect on the watched accounts.
- Fresh-recipient behaviour (recipient ATA created inside leg-1/leg-2 because `initAtasIfMissing: true`) is not visible in the inspected txs — all inspected sends used the pre-existing recipient; the privacy claim "leg 1 does not name the recipient" holds for the wallet address but was not observed for a first-time recipient.

```
