# Security model

**NEAR testnet and Solana devnet only.** Devnet USDC has no value. Nothing in this document is a claim about a mainnet deployment, and the design has not been audited.

Written 13 Nov 2026. Every code reference below was checked against the tree on that date.

---

## The one sentence that matters

**The guard in this repo is input validation, not a security boundary.** It runs in the same page that requests the signature, so anything that controls the page controls the guard. It defends the user against a *hostile transaction builder*. It does not defend them against a hostile frontend.

If you read nothing else, read that. The rest of this document is the detail behind it.

---

## What the architecture actually guarantees

Two properties hold regardless of the guard, because they come from NEAR, not from our code.

**1. No Solana private key exists.** The key material lives only as shares across the Chain Signatures MPC network; at least 11 of 16 nodes must cooperate to produce a signature. Nothing in this repo ever holds, derives or writes a Solana secret key. This is a real property, and it is **security, not privacy** — see [the privacy table in the README](../README.md#what-is-public-and-what-is-not).

**2. Every signature needs the human's NEAR wallet approval.** There is no automated signing path, and this is structural rather than a policy setting:

> `sign` on `v1.signer-prod.testnet` requires a 1 yoctoNEAR deposit (`SIGN_DEPOSIT_YOCTO = "1"`, [`web/src/lib/config.ts:17`](../web/src/lib/config.ts)). A NEAR **function-call access key cannot attach a deposit.** So a key scoped to the signer contract cannot call it — only a full-access key can, and that means the wallet prompt.

That is why an agent cannot drain this thing on its own, and it is a stronger statement than any spending limit we could have written. It also points at the fix described at the end of this document.

Additionally, the MPC's returned signature is verified locally with `ed25519.verify` against the derived public key before the transaction is broadcast ([`web/src/lib/solana.ts:105` and `:111`](../web/src/lib/solana.ts)). A signature that does not verify is never sent.

---

## The threat the guard is for

In hide-recipient mode, **the Solana transaction is built by MagicBlock's API** — a third party at `https://payments.magicblock.app`. The MPC signs whatever message it is handed; there is no "are you sure?" inside an MPC network. So a naive client that forwards the API's bytes to the signer has handed a stranger the power to author a transaction that the user's own address will sign.

That is the threat `shared/magicblock-guards.ts` addresses. Before the wallet prompt — before any signature exists — the transaction is parsed and simulated, and refused unless it is exactly what was asked for.

| Check | Where | Attack it stops |
|---|---|---|
| `sendTo` must be `base` | `:55` | API silently routing the transfer somewhere else |
| Exactly one required signer, and it is the user | `:57` | A transaction that needs a co-signer, so it is not what it claims |
| Every program on an allowlist | `:60` | An unrelated program invoked with the user's authority |
| Nothing behind an address lookup table | `:74` | Hiding a program from inspection |
| SPL instructions restricted to `Transfer`/`TransferChecked` | `:76` | `Approve` (delegation), `SetAuthority` (ownership theft), `CloseAccount` (sweep), `Burn` |
| Source must be the user's own USDC ATA | `:79` | Draining a different token account |
| `TransferChecked` mint must be USDC | `:83` | Moving a different token |
| Simulated USDC spend within `amount + fee + 0.2%` | `:128` | Overcharging |
| Owner unchanged after simulation | `:130` | Ownership theft the instruction stream hid |
| No delegate set | `:131` | Deferred drain |
| No close authority set | `:132` | Deferred sweep |
| At most 0.01 SOL spent | `:133` | Lamport drain |

All of it fails closed: an unparseable or unexpected transaction is refused, never signed "just in case".

Twelve of these are covered by offline tests. Run them:

```bash
npm test
```

The five simulation-based checks (`:128`–`:133`) are exercised only against live devnet, by `npx tsx web/scripts/verify-lib.ts`. They have **no offline test** yet. That gap is stated in the README and at the foot of `test/guard-attacks.test.ts`.

---

## What the guard does **not** protect against

This is the honest part, and it is the reason the guard is not a boundary.

**A compromised frontend.** The guard is JavaScript in the page. Whoever serves or modifies the page decides whether it runs. A tampered deployment can delete the checks and the wallet prompt will look identical.

**A malicious or compromised dependency.** The app has a normal npm tree. Any package in it runs in the same context as the guard and can patch it at runtime.

**Any other dapp the user approves.** The protection is specific to transactions this app builds. A full-access NEAR key approved elsewhere can call `sign` directly, with any payload, and never touch this code.

**A browser extension or XSS on the origin.** Same context, same consequence.

**MPC collusion.** A threshold of MPC nodes can sign without any NEAR transaction at all. Nothing in this repo can prevent that. It is detectable — by reconciling signatures against on-chain NEAR calls — but no such reconciliation is implemented.

**A malicious NEAR RPC.** The derived address is obtained from a `derived_public_key` view call on the signer contract ([`web/src/lib/near.ts:17`](../web/src/lib/near.ts)). A lying RPC could return an attacker's address, and the user would fund it. `verify-lib.ts` cross-checks the view call against local `chainsig.js` math, which would catch this — but the browser app does not perform that cross-check.

**NEAR account name re-registration.** Derived keys bind to the account-ID *string*. If a named account is deleted and re-created by someone else, they may inherit every derived address for that name on every chain. The app does not warn about this.

**Configuration that widens the guard.** Three environment variables weaken it by design, for key rotation and debugging ([`web/src/lib/config.ts:36–45`](../web/src/lib/config.ts)):

| Variable | Effect |
|---|---|
| `VITE_MB_EXTRA_PROGRAMS` | Appends programs to the allowlist |
| `VITE_MB_VALIDATOR` | Changes whose signature counts as a valid payout |
| `VITE_MB_VAULT` | Changes which vault is trusted |

Anyone who controls the build environment can therefore widen the allowlist. A deployment that cares should pin these and review them.

---

## Trust assumptions in hide-recipient mode

- **MagicBlock** builds leg 1 and signs leg 2. We never verify their TEE attestation. If you do not trust MagicBlock or Intel TDX, assume no unlinking at all.
- The unlinking is **operational, not cryptographic.** There is no proof — only that the recipient does not appear in leg 1 and the sender does not appear in leg 2.
- **Amounts and timing stay public on both legs,** and the two legs are matchable by a patient observer. The proven runs used 0 ms delay, so matching is easy.
- **The NEAR sign call is public** in both modes: the account and derivation path are visible, and the derived address is public math from them. A random path is not privacy.
- The payout is accepted only on an exact amount **and** MagicBlock's validator signature or vault involvement (`matchMagicBlockPayout`, `:198`). An exact-amount payment from an unrelated payer is refused — tested offline.

---

## The architectural fix

Move the checks out of the page and into a NEAR contract that sits between the requester and the signer. The requester calls the contract; the contract validates and then calls `sign`. A browser-side check becomes an on-chain one, and it can no longer be removed by whoever serves the page.

The deposit rule above is what gives this real force: a function-call key **cannot** reach the signer, so an agent routed through such a contract has no way around it. The architecture enforces the boundary instead of asking politely.

**This is now built** (`contract/src/lib.rs`, deployed at `policy.bibhu-usdc.testnet`; agent front door `mcp/server.ts`). It enforces a per-transfer limit and a daily limit, holds anything above them as an intent until the owner calls `approve_intent`, and binds the payload it signs. `scripts/p-01-policy-e2e.ts` proves the flow end to end with a function-call key.

What that does and does not change:

- **It is a real boundary for the agent path.** An agent's function-call key cannot reach the signer, so it cannot bypass the contract. The limits are enforced on-chain, not in a page.
- **It does not fix the browser path.** A human sending from the web app still signs with a full-access key, and the browser-side guard above still applies, with all the limits stated in this document.
- **Addresses differ.** Policy mode derives from predecessor `policy.bibhu-usdc.testnet` and path `<user>/solana-1`, which is a different Solana address from human mode.
- **The contract is unaudited**, like the rest of this project.

---

## Reporting a problem

This is a testnet hackathon project with no production deployment and no bug bounty. Open an issue, or include the output of `npm test` and the failing transaction signature if you have one. If you find a transaction shape the guard accepts but should not, that is the most useful thing you can send — ideally as a failing case added to `test/guard-attacks.test.ts`.

## Known gaps, in one list

1. Five economic checks have no offline test.
2. The browser app does not cross-check the derived address against local derivation math (`verify-lib.ts` does).
3. No warning on NEAR account name re-registration.
4. No reconciliation of MPC signatures against NEAR calls, so collusion is undetected.
5. No MagicBlock attestation verification.
6. `VITE_MB_*` variables can widen the allowlist at build time.
7. The guard is browser-side, which is the subject of this whole document.
