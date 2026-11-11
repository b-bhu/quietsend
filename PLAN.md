# NEAR → Solana USDC transfer (v1 plan)

Deadline: 14 Nov 2026, 23:59 UTC (15 Nov, 05:29 IST). Testnet and devnet only.

## User
A NEAR user who wants to send USDC on Solana without a Solana wallet or a Solana key.

## Core flow
1. Log in with a NEAR testnet wallet.
2. See the derived Solana devnet address and its USDC balance.
3. Enter a recipient and an amount.
4. Approve one NEAR transaction, which asks `v1.signer-prod.testnet` to sign the Solana transfer.
5. The transfer is broadcast to Solana devnet, and you see an explorer page.

## v1 must prove
One real devnet USDC (test SPL token) transfer, signed by NEAR MPC and requested by the user's NEAR account.

## Architecture
- **Browser:** NEAR wallet login. The wallet signs the call to the MPC signer, so no server ever holds signing power.
- **Small backend (TypeScript):** builds the unsigned SPL transfer, broadcasts the signed transfer, stores each user's random path, and saves each transfer record (NEAR tx hash + Solana signature).
- **Explorer page:** shows the NEAR signing request and the Solana transfer side by side. It shows a user only their own transfers.

## Privacy (v1)
- A random, opaque derivation path per user replaces `solana-1`, so knowing the NEAR account ID doesn't reveal the Solana address.
- No Solana private key exists anywhere; MPC nodes each hold only a share of it.
- Still public: the Solana transfer (sender address, recipient, amount). The backend knows the path, so it can link the two accounts.
- The README gets an honest table of what is hidden and what is public.
- Later: Confidential Intents (mainnet only), not in v1.

## Build steps
1. Derive the address with path `solana-1` for the confirmed testnet account; print it.
2. Fund it with devnet SOL; create a test SPL mint and token accounts.
3. Build an unsigned SPL transfer and serialize the message.
4. Call the signer for an Ed25519 signature (verify the deposit and gas).
5. Attach the signature, broadcast, and show the explorer link.
6. Backend + Vite frontend with NEAR login wrapping steps 1 to 5, plus the explorer page.
7. Switch to random paths, write the README table, then the demo video and X post (Bibhu posts).

## Cut order if we slip
1. Explorer page reduced to plain Solana Explorer + NearBlocks links.
2. Backend reduced to browser-only.
3. Random path kept only as a documented option.
