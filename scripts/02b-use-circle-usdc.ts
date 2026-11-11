// Use Circle's devnet USDC (funded by Bibhu via faucet) instead of a self-made mint.
// Records mint + ATAs in out/state.json. Read-only on-chain. Usage: npx tsx scripts/02b-use-circle-usdc.ts [recipient]
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { CIRCLE_USDC_DEVNET, DERIVED_ADDRESS, getConnection, saveState } from "./config.ts";

const recipient = process.argv[2] ?? "7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C";
const mint = new PublicKey(CIRCLE_USDC_DEVNET);
const senderAta = getAssociatedTokenAddressSync(mint, new PublicKey(DERIVED_ADDRESS));
const recipientAta = getAssociatedTokenAddressSync(mint, new PublicKey(recipient));
const { connection, rpcUrl } = await getConnection();
const sol = await connection.getBalance(new PublicKey(DERIVED_ADDRESS));
const bal = async (a: PublicKey) => (await connection.getTokenAccountBalance(a).catch(() => null))?.value.uiAmountString ?? "ATA missing";
const s = await bal(senderAta), r = await bal(recipientAta);
console.log({ rpcUrl, sol: sol / 1e9, mint: mint.toBase58(), senderAta: senderAta.toBase58(), senderUsdc: s, recipient, recipientAta: recipientAta.toBase58(), recipientUsdc: r });
if (r === "ATA missing") throw new Error("Recipient has no USDC ATA; add a create-ATA instruction first.");
await saveState({ rpcUrl, solLamports: sol, mint: mint.toBase58(), mintKind: "circle-devnet-usdc", decimals: 6,
  senderAta: senderAta.toBase58(), recipient, recipientAta: recipientAta.toBase58(), senderTokenBalance: s, recipientTokenBalance: r });
