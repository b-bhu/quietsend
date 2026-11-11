// Build an UNSIGNED SPL transferChecked of 1 devnet USDC (Circle) from the derived address to the recipient.
// Mirrors chainsig.js Solana.prepareTransactionForSigning: compileMessage().serialize()
// is the exact Ed25519 payload.
// Usage: npx tsx scripts/03-build-tx.ts
import { PublicKey, Connection } from "@solana/web3.js";
import { createTransferCheckedInstruction } from "@solana/spl-token";
import { contracts, chainAdapters } from "chainsig.js";
import { writeFileSync } from "node:fs";
import {
  DERIVED_ADDRESS,
  DERIVATION_PATH,
  NEAR_ACCOUNT,
  SIGNER_CONTRACT,
  TOKEN_DECIMALS,
  TRANSFER_UI_AMOUNT,
  UNSIGNED_MESSAGE_HEX,
  UNSIGNED_TX_PATH,
  ensureDirs,
  getConnection,
  loadState,
} from "./config.ts";

async function main() {
  const state = await loadState();
  if (!state.mint || !state.senderAta || !state.recipientAta) {
    throw new Error("Missing mint/ATAs in out/state.json. Run scripts/02-mint.ts first.");
  }

  const { connection, rpcUrl } = await getConnection();
  const contract = new contracts.ChainSignatureContract({
    networkId: "testnet",
    contractId: SIGNER_CONTRACT,
  });
  const solana = new chainAdapters.solana.Solana({
    solanaConnection: connection,
    contract,
  });

  const amount = BigInt(TRANSFER_UI_AMOUNT) * 10n ** BigInt(TOKEN_DECIMALS);
  const instruction = createTransferCheckedInstruction(
    new PublicKey(state.senderAta),
    new PublicKey(state.mint),
    new PublicKey(state.recipientAta),
    new PublicKey(DERIVED_ADDRESS),
    amount,
    TOKEN_DECIMALS,
  );

  // amount: 0n so the adapter does not also add a native SOL transfer.
  const prepared = await solana.prepareTransactionForSigning({
    from: DERIVED_ADDRESS,
    to: state.recipient ?? DERIVED_ADDRESS,
    amount: 0n,
    instructions: [instruction],
    feePayer: new PublicKey(DERIVED_ADDRESS),
  });

  const { transaction } = prepared.transaction;
  const messageBytes = Buffer.from(prepared.hashesToSign[0]);
  // Cross-check: Transaction.serializeMessage() === compileMessage().serialize()
  const viaSerializeMessage = Buffer.from(transaction.serializeMessage());
  if (!messageBytes.equals(viaSerializeMessage)) {
    throw new Error("hashesToSign does not match transaction.serializeMessage()");
  }

  ensureDirs();
  writeFileSync(UNSIGNED_MESSAGE_HEX, messageBytes.toString("hex") + "\n");
  writeFileSync(
    UNSIGNED_TX_PATH,
    JSON.stringify(
      {
        rpcUrl,
        sender: DERIVED_ADDRESS,
        path: DERIVATION_PATH,
        nearAccount: NEAR_ACCOUNT,
        mint: state.mint,
        senderAta: state.senderAta,
        recipient: state.recipient,
        recipientAta: state.recipientAta,
        amount: amount.toString(),
        decimals: TOKEN_DECIMALS,
        recentBlockhash: transaction.recentBlockhash,
        unsignedTxBase64: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
        messageHex: messageBytes.toString("hex"),
        messageBase64: messageBytes.toString("base64"),
        messageLength: messageBytes.length,
      },
      null,
      2,
    ) + "\n",
  );

  console.log("Unsigned SPL transferChecked of", TRANSFER_UI_AMOUNT, "devnet USDC (Circle)");
  console.log("From ATA:", state.senderAta);
  console.log("To ATA:  ", state.recipientAta);
  console.log("Fee payer / owner:", DERIVED_ADDRESS);
  console.log("Message length:", messageBytes.length, "bytes");
  console.log("Message base64:", messageBytes.toString("base64"));
  console.log("Message hex written to:", UNSIGNED_MESSAGE_HEX);
  console.log("Unsigned tx written to:", UNSIGNED_TX_PATH);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
