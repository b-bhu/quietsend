// Attach the MPC Ed25519 signature to the unsigned Solana transaction and broadcast to devnet.
// Mirrors chainsig.js Solana.finalizeTransactionSigning + broadcastTx.
// Usage:
//   npx tsx scripts/05-broadcast.ts --dry-run
//   npx tsx scripts/05-broadcast.ts
import { Transaction, PublicKey } from "@solana/web3.js";
import { contracts, chainAdapters } from "chainsig.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { existsSync, readFileSync } from "node:fs";
import {
  DERIVED_ADDRESS,
  SIGNATURE_PATH,
  SIGNER_CONTRACT,
  UNSIGNED_TX_PATH,
  getConnection,
} from "./config.ts";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!existsSync(UNSIGNED_TX_PATH)) {
    throw new Error("Missing out/unsigned-tx.json. Run scripts/03-build-tx.ts first.");
  }
  const meta = JSON.parse(readFileSync(UNSIGNED_TX_PATH, "utf8")) as {
    unsignedTxBase64: string;
    messageHex: string;
    sender: string;
  };
  const transaction = Transaction.from(Buffer.from(meta.unsignedTxBase64, "base64"));
  const messageBytes = Buffer.from(meta.messageHex, "hex");

  if (dryRun && !existsSync(SIGNATURE_PATH)) {
    console.log("--dry-run: unsigned tx loaded.");
    console.log("Sender / fee payer:", meta.sender);
    console.log("Message length:", messageBytes.length);
    console.log("Recent blockhash:", transaction.recentBlockhash);
    console.log("No signature file yet (run 04-sign.ts). Would attach it, finalize, and broadcast to devnet.");
    console.log(`Explorer URL once broadcast: https://explorer.solana.com/tx/<signature>?cluster=devnet`);
    return;
  }

  if (!existsSync(SIGNATURE_PATH)) {
    throw new Error("Missing out/signature.json. Run scripts/04-sign.ts first (requires NEAR_PRIVATE_KEY).");
  }
  const sigFile = JSON.parse(readFileSync(SIGNATURE_PATH, "utf8")) as { signatureHex: string };
  const signatureBytes = Buffer.from(sigFile.signatureHex, "hex");
  const derivedPk = new PublicKey(DERIVED_ADDRESS).toBytes();
  const ok = ed25519.verify(signatureBytes, messageBytes, derivedPk);
  console.log("Local Ed25519 verify:", ok ? "OK" : "FAILED");
  if (!ok) throw new Error("Refusing to broadcast: signature does not verify");

  const { connection } = await getConnection();
  const contract = new contracts.ChainSignatureContract({
    networkId: "testnet",
    contractId: SIGNER_CONTRACT,
  });
  const solana = new chainAdapters.solana.Solana({
    solanaConnection: connection,
    contract,
  });

  const signedBase64 = solana.finalizeTransactionSigning({
    transaction,
    rsvSignatures: { scheme: "Ed25519", signature: Array.from(signatureBytes) },
    senderAddress: DERIVED_ADDRESS,
  });

  if (dryRun) {
    console.log("--dry-run: finalized signed transaction, not broadcasting.");
    console.log("Signed tx base64 length:", signedBase64.length);
    return;
  }

  const { hash } = await solana.broadcastTx(signedBase64);
  const url = `https://explorer.solana.com/tx/${hash}?cluster=devnet`;
  console.log("Broadcast signature:", hash);
  console.log(url);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
