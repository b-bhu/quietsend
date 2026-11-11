// Fund the derived Solana devnet address with devnet SOL.
// Usage: npx tsx scripts/02-fund.ts
// Prefers requestAirdrop on https://api.devnet.solana.com, retries small amounts,
// then a throwaway-funded transfer, then other public devnet RPCs.
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DERIVED_ADDRESS,
  KEYS_DIR,
  OFFICIAL_SOLANA_RPC,
  FALLBACK_SOLANA_RPCS,
  ensureDirs,
  getConnection,
  saveState,
  rpcWorks,
} from "./config.ts";

function loadOrCreatePayer(): Keypair {
  ensureDirs();
  const path = resolve(KEYS_DIR, "faucet-payer.json");
  if (existsSync(path)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")));
    return Keypair.fromSecretKey(secret);
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log("Wrote throwaway faucet payer pubkey:", kp.publicKey.toBase58(), "(secret in .keys/faucet-payer.json)");
  return kp;
}

async function requestAirdrop(connection: Connection, pubkey: PublicKey, lamports: number): Promise<string> {
  const sig = await connection.requestAirdrop(pubkey, lamports);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  return sig;
}

async function tryAirdrop(connection: Connection, rpcUrl: string, pubkey: PublicKey, sols: number[]): Promise<boolean> {
  for (const sol of sols) {
    const lamports = Math.round(sol * LAMPORTS_PER_SOL);
    try {
      console.log(`requestAirdrop ${sol} SOL to ${pubkey.toBase58()} via ${rpcUrl}`);
      const sig = await requestAirdrop(connection, pubkey, lamports);
      console.log("Airdrop signature:", sig);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  failed (${sol} SOL): ${msg}`);
    }
  }
  return false;
}

async function main() {
  const dest = new PublicKey(DERIVED_ADDRESS);
  const amounts = [1, 0.5, 0.25, 0.1];

  const rpcCandidates = [OFFICIAL_SOLANA_RPC, ...FALLBACK_SOLANA_RPCS];
  if (process.env.SOLANA_RPC) rpcCandidates.unshift(process.env.SOLANA_RPC);

  // 1) Direct airdrop to the derived address, official RPC first.
  let funded = false;
  let usedRpc = "";
  for (const url of rpcCandidates) {
    const ok = await rpcWorks(url).catch(() => false);
    if (!ok) {
      console.log("Skipping unreachable/non-devnet RPC:", url);
      continue;
    }
    const connection = new Connection(url, "confirmed");
    if (await tryAirdrop(connection, url, dest, amounts)) {
      funded = true;
      usedRpc = url;
      break;
    }
  }

  // 2) Airdrop to a throwaway keypair we control, then transfer to the derived address.
  if (!funded) {
    console.log("Direct airdrop failed. Trying throwaway payer airdrop + transfer.");
    const payer = loadOrCreatePayer();
    for (const url of rpcCandidates) {
      const ok = await rpcWorks(url).catch(() => false);
      if (!ok) continue;
      const connection = new Connection(url, "confirmed");
      if (!(await tryAirdrop(connection, url, payer.publicKey, [2, 1, 0.5, 0.25, 0.1]))) continue;
      const payerBal = await connection.getBalance(payer.publicKey);
      // Leave ~0.05 SOL on the payer for later mint rent, send the rest.
      const keep = Math.round(0.05 * LAMPORTS_PER_SOL);
      const send = Math.max(payerBal - keep - 5000, 0);
      if (send <= 0) {
        console.log("Payer funded but balance too small to transfer.");
        continue;
      }
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: dest, lamports: send }),
      );
      const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
      console.log(`Transferred ${send / LAMPORTS_PER_SOL} SOL from payer ${payer.publicKey.toBase58()} tx=${sig}`);
      funded = true;
      usedRpc = url;
      await saveState({ fundedPayerPubkey: payer.publicKey.toBase58(), rpcUrl: url });
      break;
    }
  }

  const { connection, rpcUrl } = usedRpc
    ? { connection: new Connection(usedRpc, "confirmed"), rpcUrl: usedRpc }
    : await getConnection();
  const lamports = await connection.getBalance(dest);
  const sol = lamports / LAMPORTS_PER_SOL;
  console.log(`\nDerived address: ${DERIVED_ADDRESS}`);
  console.log(`Final SOL balance: ${sol} SOL (${lamports} lamports)`);
  console.log(`RPC: ${rpcUrl}`);
  console.log(`https://explorer.solana.com/address/${DERIVED_ADDRESS}?cluster=devnet`);
  await saveState({ solLamports: lamports, rpcUrl });

  if (lamports === 0) {
    console.error(`
Funding failed. Official requestAirdrop on ${OFFICIAL_SOLANA_RPC} was not reachable from this environment,
and public fallback RPCs rejected requestAirdrop. Alternative CLI (run from a network that can reach the official RPC):

  solana airdrop 1 ${DERIVED_ADDRESS} --url ${OFFICIAL_SOLANA_RPC}

Then re-run: npx tsx scripts/02-fund.ts
`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
