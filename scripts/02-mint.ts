// Create a test SPL mint (tUSDC, 6 decimals) and fund the derived address's ATA.
// Circle's official Solana devnet USDC mint is 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
// (https://developers.circle.com/stablecoins/usdc-contract-addresses) but the Circle
// faucet is web/captcha-based, so this script falls back to a self-made test mint.
// Usage: npx tsx scripts/02-mint.ts
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CIRCLE_USDC_DEVNET,
  DERIVED_ADDRESS,
  KEYS_DIR,
  MINT_UI_AMOUNT,
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
  ensureDirs,
  getConnection,
  saveState,
} from "./config.ts";

function loadOrCreateKeypair(name: string): Keypair {
  ensureDirs();
  const path = resolve(KEYS_DIR, `${name}.json`);
  if (existsSync(path)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(`Wrote ${name} pubkey:`, kp.publicKey.toBase58(), `(secret in .keys/${name}.json)`);
  return kp;
}

async function maybeAirdrop(connection: Connection, kp: Keypair) {
  const bal = await connection.getBalance(kp.publicKey);
  if (bal >= 0.05 * LAMPORTS_PER_SOL) return;
  try {
    console.log("Airdropping 1 SOL to mint authority", kp.publicKey.toBase58());
    const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("Airdrop to mint authority failed:", msg);
  }
}

async function circleUsdcAvailable(connection: Connection): Promise<boolean> {
  try {
    const mint = await getMint(connection, new PublicKey(CIRCLE_USDC_DEVNET));
    console.log(
      `Circle devnet USDC mint exists: ${CIRCLE_USDC_DEVNET} (decimals=${mint.decimals})`,
    );
    return mint.decimals === 6;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("Could not read Circle devnet USDC mint:", msg);
    return false;
  }
}

async function main() {
  const { connection } = await getConnection();
  const derived = new PublicKey(DERIVED_ADDRESS);

  const circleOk = await circleUsdcAvailable(connection);
  if (circleOk) {
    const ata = getAssociatedTokenAddressSync(new PublicKey(CIRCLE_USDC_DEVNET), derived);
    let raw = 0n;
    try {
      raw = (await getAccount(connection, ata)).amount;
    } catch {
      /* no ATA yet */
    }
    console.log(`Derived ATA for Circle USDC: ${ata.toBase58()} balance=${Number(raw) / 1e6} USDC`);
    console.log(
      "Circle's faucet is web/captcha-based (https://faucet.circle.com); no programmatic mint. Falling back to a self-made test mint labeled tUSDC (not Circle USDC).",
    );
  }

  const mintAuthority = loadOrCreateKeypair("mint-authority");
  const recipient = loadOrCreateKeypair("recipient");
  await maybeAirdrop(connection, mintAuthority);

  const authorityBal = await connection.getBalance(mintAuthority.publicKey);
  if (authorityBal < 0.02 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Mint authority ${mintAuthority.publicKey.toBase58()} has only ${authorityBal / LAMPORTS_PER_SOL} SOL; need some devnet SOL to create the mint. Fund it and re-run.`,
    );
  }

  const mintKp = loadOrCreateKeypair("mint");
  const mint = mintKp.publicKey;
  let mintExists = false;
  try {
    const info = await getMint(connection, mint);
    mintExists = true;
    console.log(`Reusing existing test mint ${mint.toBase58()} decimals=${info.decimals}`);
  } catch {
    /* create below */
  }

  const senderAta = getAssociatedTokenAddressSync(mint, derived);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient.publicKey);
  const mintAmount = BigInt(MINT_UI_AMOUNT) * 10n ** BigInt(TOKEN_DECIMALS);

  const tx = new Transaction();
  if (!mintExists) {
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: mintAuthority.publicKey,
        newAccountPubkey: mint,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mint, TOKEN_DECIMALS, mintAuthority.publicKey, mintAuthority.publicKey),
    );
  }
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(mintAuthority.publicKey, senderAta, derived, mint),
    createAssociatedTokenAccountIdempotentInstruction(
      mintAuthority.publicKey,
      recipientAta,
      recipient.publicKey,
      mint,
    ),
  );
  if (!mintExists) {
    tx.add(createMintToInstruction(mint, senderAta, mintAuthority.publicKey, mintAmount));
  } else {
    // Only mint if sender ATA is empty / short.
    let current = 0n;
    try {
      current = (await getAccount(connection, senderAta)).amount;
    } catch {
      current = 0n;
    }
    if (current < mintAmount) {
      tx.add(createMintToInstruction(mint, senderAta, mintAuthority.publicKey, mintAmount - current));
    }
  }

  const sig = await sendAndConfirmTransaction(connection, tx, [mintAuthority, mintKp], { commitment: "confirmed" });
  console.log("Mint/ATA tx:", sig);

  const senderBal = (await getAccount(connection, senderAta)).amount;
  let recipientBal = 0n;
  try {
    recipientBal = (await getAccount(connection, recipientAta)).amount;
  } catch {
    recipientBal = 0n;
  }

  console.log(`\nTest mint (NOT Circle USDC): ${mint.toBase58()}`);
  console.log(`Symbol/label: ${TOKEN_SYMBOL}, decimals: ${TOKEN_DECIMALS}`);
  console.log(`Mint authority pubkey: ${mintAuthority.publicKey.toBase58()}`);
  console.log(`Sender (derived) ATA: ${senderAta.toBase58()} balance=${Number(senderBal) / 10 ** TOKEN_DECIMALS} ${TOKEN_SYMBOL}`);
  console.log(`Recipient pubkey: ${recipient.publicKey.toBase58()}`);
  console.log(`Recipient ATA: ${recipientAta.toBase58()} balance=${Number(recipientBal) / 10 ** TOKEN_DECIMALS} ${TOKEN_SYMBOL}`);

  await saveState({
    mint: mint.toBase58(),
    mintKind: "test-tusdc",
    decimals: TOKEN_DECIMALS,
    senderAta: senderAta.toBase58(),
    recipient: recipient.publicKey.toBase58(),
    recipientAta: recipientAta.toBase58(),
    senderTokenBalance: senderBal.toString(),
    recipientTokenBalance: recipientBal.toString(),
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
