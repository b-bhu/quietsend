# quietsend

Send Solana devnet USDC using only a NEAR account. No Solana private key is stored anywhere.

**Status: Solana devnet + NEAR testnet only.** Nothing here touches mainnet, and devnet USDC has no real value.

## What it is

quietsend lets you send Solana devnet USDC using only a NEAR account, via NEAR Chain Signatures (an MPC signing network).

- Signing uses Ed25519, domain 1, through the NEAR signer contract `v1.signer-prod.testnet`.
- No Solana private key is stored anywhere. The Solana key material exists only as MPC shares across the Chain Signatures network and is never held or written by the user or by these scripts.
- A NEAR key is still used to *authorize* the MPC sign request. In the scripts that NEAR key sits in a gitignored `.keys/` directory; in the web app (`web/`), the user's NEAR wallet approves the call instead.

This is not a privacy product. It reduces key-management burden (one NEAR account instead of a separate Solana key) and, in one mode, removes the direct on-chain sender↔recipient link. Exact properties are in the table below — read that section before assuming what this hides.

The token is official Circle Solana devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`), which uses **6 decimals** (1 USDC = `1_000_000` base units).

## How it works

1. **Derive.** A Solana address is derived from your NEAR account plus a path label (we use `solana-1`). The same account + path always yields the same address. Example: `7snfiiW6ZP2pgACBx3ZtKKcpNwTk74gGGQPRtxDVnt27` belongs to `bibhu-usdc.testnet` + `solana-1`. Anyone who knows the account and path can recompute the address; the public NEAR sign call reveals both, so the link is not a secret.
2. **Build.** An unsigned Solana transaction is constructed — either a normal SPL USDC transfer, or a MagicBlock "private payments" transaction (see the privacy table: this does not hide amount, token, or the NEAR link).
3. **Sign.** The NEAR account asks the MPC signer to sign the transaction message. At least 11 of 16 nodes produce an Ed25519 signature, and it verifies against the derived Solana address.
4. **Broadcast.** The signed transaction is sent to Solana devnet.

**What's in the repo:** Node/TypeScript scripts that follow the four steps above (NEAR credentials in the gitignored `.keys/` directory), plus a Vite + React web app in `web/` where the user's NEAR wallet authorizes the sign call. The scripts were used to prove the transactions below; the app reuses the same lib logic in the browser.

## Modes

### Normal

One Solana transaction: sender → recipient. The same flow as a usual SPL transfer of 1 USDC (1 USDC = `1_000_000` base units at 6 decimals).

### Hide recipient (MagicBlock "private payments")

Two legs:

- **Leg 1:** the sender deposits into MagicBlock's vault. The recipient's address is not in this transaction.
- **Leg 2:** the vault pays the recipient. The sender's address is not in this transaction.

In the proven test run, MagicBlock charged a 0.001 USDC fee: the sender paid **1.001 USDC** and the recipient received **1.000 USDC**.

MagicBlock also offers delay/split options that could blur amount-and-timing matching, but they were **not tested** here — the proven run used `minDelayMs`/`maxDelayMs` of 0.

## What is public and what is not

Read this before assuming anything about privacy. quietsend is **not** private or anonymous in any unqualified sense.

| | Normal mode | Hide-recipient mode |
|---|---|---|
| Sender | Public | Public on leg 1 (sender → vault). Not present on leg 2. |
| Recipient | Public | Public on leg 2 (vault → recipient). Not present on leg 1. |
| Direct sender↔recipient link | Public (one transaction) | **Not on-chain in either transaction.** An observer can still guess the link from amount and timing. |
| Amount | Public | **Visible** on both legs, and together with timing is matchable across them. |
| Token | Public | Visible. |
| NEAR sign call | Public | Public. The NEAR account + path in the sign request can be linked to the derived Solana address. This is true in both modes — it is how Chain Signatures work. |
| Trust | NEAR MPC (no Solana key is stored) | Unlinking depends on **Intel TDX plus MagicBlock**, not on a math-only proof. If you do not trust TEEs or MagicBlock, do not assume any unlinking. |

**This is testnet / devnet only.** Do not expect any of these properties to hold on, or carry over to, any real-money deployment.

## Proven transactions

All on Solana devnet, from the tested run:

- Normal transfer:
  https://explorer.solana.com/tx/3hUZ5hSAwM8XBsxkM1nGVwE2G6UxdwBjS8qaD1wmj3L7WUo9z8bGsZdzVCCZKfi3RpnKQica5tCb16snroE4uKgt?cluster=devnet
- MagicBlock leg 1 (deposit to vault):
  https://explorer.solana.com/tx/2w2LRuLninNbG2MbWeCAczuJUaEW9yAxMhVR2GD1JmXEfWdBjvQYDETY6mPMX3uF1WqHPZnUB3CixhvfSLGfxKq7?cluster=devnet
- MagicBlock leg 2 (vault pays recipient):
  https://explorer.solana.com/tx/5cTHDqYssFJx2cfUuXe3LYEpz5f2Q3MfVNuFuqp9Qrw4PJ3WhzqYG1h6ZAD9aEG9HxJpZNAHe3jSJCxN7v88dsUk?cluster=devnet

A second hide-recipient run of 0.1 USDC was also verified (fee 0.0001 USDC, legs 1 second apart):

- MagicBlock leg 1 (0.1 USDC):
  https://explorer.solana.com/tx/4pgywdpfMCFq78K4NChbJNMfh3QGNnzmF1fFHDhhSzari8r2pcADLHF7M6jpXsRb7vXzj6awBcKuXLDkR6LM57mw?cluster=devnet
- MagicBlock leg 2 (0.1 USDC):
  https://explorer.solana.com/tx/S4LR9EjXeDpD8NyiDUVmeT8qSWtpGFKRcHaHhh8xBrWsFKQPhXgYp3fC3ozLnnkcm97pMLNVjsFX7rYYcU48FCq?cluster=devnet

## Roadmap

Nothing below is built. These are **upcoming**, not done:

- **Helius Rings hide-amount mode** — currently the amount is visible in every mode; Rings is the planned path to hiding it.
- **A NEAR fee/policy contract** — to move fee handling and transfer policy on-chain under the NEAR account.

## What this is not / limitations

- **Not mainnet.** Devnet/testnet only; devnet USDC is valueless, and contracts and network behavior can change.
- **Not anonymous.** The derived Solana address is a deterministic function of the NEAR account plus path. The public NEAR sign call reveals that account and path, so anyone can recompute the address and link the two. In hide-recipient mode, amounts and timing still allow correlation across the two legs.
- **Not trustless.** Hide-recipient mode relies on Intel TDX and MagicBlock. There is no math-only proof of unlinking, and no independent audit of this project.
- **Not a polished product.** The scripts are run manually with NEAR keys in `.keys/`. The web app in `web/` is functional on devnet/testnet (plain UI; wallet login still needs a hand test) but is not a finished product.
- **Not feature-complete on hide-recipient options.** MagicBlock's delay/split options were not tested (the proven run used 0 ms delay), so amount-and-timing matching remains easy in the proven transactions.
- **No custody of Solana keys — and no separate recovery path.** If your NEAR account can't authorize a sign request, the derived Solana address can't be used. That is the trade.
