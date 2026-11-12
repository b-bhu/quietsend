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
6. [todo] Bibhu tests wallet login + approve by hand; UI/UX redo (Bibhu); README privacy table; deploy to Vercel (only with Bibhu's yes).

## Stretch (only if time; unverified)
- **Helius Rings "hide amount" mode**: shielded key rebuilt from a deterministic MPC signature of a fixed message, never stored. Untested; Helius SDK is alpha and needs an API key.
- **NEAR fee contract in Rust**: the contract takes a fee, then asks the MPC to sign (address = contract + user path). Adds fees/bonus points, not privacy.
- MagicBlock delay/split options to blur amount/timing matching (untested).

## Cut order if we slip
1. Explorer page reduced to plain Solana Explorer + NearBlocks links.
2. Hide mode dropped to "roadmap".
3. Stretch items.
