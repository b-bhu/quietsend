// Fund a new quietsend user (bibhupadhy.testnet) for their first web-app send.
// 1) Send 2 testnet NEAR from bibhu-usdc.testnet (leave at least 2 NEAR on the sender).
// 2) From the sender's derived Solana address (path solana-1), MPC-sign and broadcast
//    0.05 devnet SOL + 2 Circle devnet USDC, creating the recipient ATA idempotently.
// Testnet/devnet only. Never prints keys.
// Usage: npx tsx scripts/06-fund-user.ts
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  CIRCLE_USDC_DEVNET,
  DERIVATION_PATH,
  DERIVED_ADDRESS,
  DEVNET_GENESIS,
  DOMAIN_ID,
  NEAR_ACCOUNT,
  NEAR_RPC,
  ROOT,
  SIGN_DEPOSIT_YOCTONEAR,
  SIGN_GAS,
  SIGNER_CONTRACT,
  TOKEN_DECIMALS,
} from "./config.ts";

config({ path: resolve(ROOT, ".env.local") });
config({ path: resolve(ROOT, ".env") });

const RECIPIENT_NEAR = "bibhupadhy.testnet";
const RECIPIENT_SOLANA = "6YNoCJybfDsfCeyK9BBia65QhRTNcQ8g1kFVx8g3dPfr";
const ONFINALITY_RPC = "https://solana-devnet.api.onfinality.io/public";
const YOCTO = 10n ** 24n;
const SEND_NEAR = 2n * YOCTO;
const MIN_LEAVE_NEAR = 2n * YOCTO;
const SEND_SOL_LAMPORTS = Math.round(0.05 * LAMPORTS_PER_SOL);
const SEND_USDC = 2n * 10n ** BigInt(TOKEN_DECIMALS);

function formatNear(yocto: bigint): string {
  const whole = yocto / YOCTO;
  const frac = (yocto % YOCTO).toString().padStart(24, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole.toString()}`;
}

async function viewNearBalance(accountId: string): Promise<bigint> {
  const res = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: accountId },
    }),
  }).then((r) => r.json()) as { result?: { amount?: string }; error?: unknown };
  if (!res.result?.amount) {
    throw new Error(`Could not view ${accountId} on testnet: ${JSON.stringify(res.error ?? res)}`);
  }
  return BigInt(res.result.amount);
}

function loadNearAccount(accountId: string): Account {
  if (!accountId.endsWith(".testnet")) {
    throw new Error(`Refusing to use non-testnet account ${accountId}`);
  }
  const keyFile = resolve(ROOT, ".keys", `${accountId}.json`);
  const privateKey = process.env.NEAR_PRIVATE_KEY ??
    (existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, "utf8")).private_key : undefined);
  if (!privateKey) {
    throw new Error(`No key for ${accountId}. Put it in gitignored .keys/${accountId}.json or NEAR_PRIVATE_KEY.`);
  }
  const signer = new KeyPairSigner(KeyPair.fromString(privateKey as KeyPairString));
  const provider = new JsonRpcProvider({ url: NEAR_RPC });
  return new Account(accountId, provider, signer);
}

function extractSignatureBytes(sig: unknown): Uint8Array {
  if (!sig || typeof sig !== "object") throw new Error("Empty signature");
  const s = sig as { signature?: number[] | Uint8Array };
  if (s.signature) return Uint8Array.from(s.signature);
  throw new Error(`Unexpected signature shape: ${Object.keys(s as object).join(",")}`);
}

async function usdcBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<bigint> {
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  return accounts.value.reduce(
    (sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount),
    0n,
  );
}

async function main() {
  if (!NEAR_ACCOUNT.endsWith(".testnet") || !RECIPIENT_NEAR.endsWith(".testnet")) {
    throw new Error("Refusing to run: both NEAR accounts must be .testnet");
  }
  if (!NEAR_RPC.includes("testnet")) {
    throw new Error(`Refusing to run: NEAR_RPC is not testnet (${NEAR_RPC})`);
  }

  const rpcUrl = process.env.SOLANA_RPC ?? ONFINALITY_RPC;
  const connection = new Connection(rpcUrl, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS) {
    throw new Error(`Refusing to run: ${rpcUrl} genesis ${genesis} is not Solana devnet`);
  }
  console.log("Solana RPC:", rpcUrl, "(devnet ok)");

  const sender = new PublicKey(DERIVED_ADDRESS);
  const recipient = new PublicKey(RECIPIENT_SOLANA);
  const mint = new PublicKey(CIRCLE_USDC_DEVNET);
  const senderAta = getAssociatedTokenAddressSync(mint, sender);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient);

  // --- 1. NEAR transfer -------------------------------------------------
  const senderNearBefore = await viewNearBalance(NEAR_ACCOUNT);
  const recipNearBefore = await viewNearBalance(RECIPIENT_NEAR);
  console.log(`${NEAR_ACCOUNT} balance: ${formatNear(senderNearBefore)} NEAR`);
  console.log(`${RECIPIENT_NEAR} balance: ${formatNear(recipNearBefore)} NEAR`);

  let nearTxHash: string | undefined;
  let nearSent = 0n;
  if (recipNearBefore >= SEND_NEAR) {
    console.log(`${RECIPIENT_NEAR} already has >= 2 NEAR; skipping NEAR transfer.`);
  } else {
    const room = senderNearBefore > MIN_LEAVE_NEAR ? senderNearBefore - MIN_LEAVE_NEAR : 0n;
    if (room === 0n) {
      throw new Error(
        `${NEAR_ACCOUNT} has ${formatNear(senderNearBefore)} NEAR; cannot send any while leaving 2 NEAR.`,
      );
    }
    nearSent = room >= SEND_NEAR ? SEND_NEAR : room;
    if (nearSent < SEND_NEAR) {
      console.log(
        `Not enough to send 2 NEAR and leave 2 NEAR. Sending a safe ${formatNear(nearSent)} NEAR instead.`,
      );
    }
    const account = loadNearAccount(NEAR_ACCOUNT);
    const outcome = await account.signAndSendTransaction({
      receiverId: RECIPIENT_NEAR,
      actions: [actionCreators.transfer(nearSent)],
    });
    nearTxHash = outcome.transaction.hash as string;
    console.log(`Sent ${formatNear(nearSent)} NEAR`);
    console.log("NEAR tx hash:", nearTxHash);
    console.log("NearBlocks: https://testnet.nearblocks.io/txns/" + nearTxHash);
  }

  // --- 2. Solana SOL + USDC (MPC sign, same request as scripts/04-sign.ts) ---
  const senderSolBefore = await connection.getBalance(sender);
  const recipSolBefore = await connection.getBalance(recipient);
  const senderUsdcBefore = await usdcBalance(connection, sender, mint);
  const recipUsdcBefore = await usdcBalance(connection, recipient, mint);
  console.log(`Sender ${DERIVED_ADDRESS}: ${senderSolBefore / LAMPORTS_PER_SOL} SOL, ${Number(senderUsdcBefore) / 1e6} USDC`);
  console.log(`Recipient ${RECIPIENT_SOLANA}: ${recipSolBefore / LAMPORTS_PER_SOL} SOL, ${Number(recipUsdcBefore) / 1e6} USDC`);

  let solTxSig: string | undefined;
  const alreadyFunded =
    recipSolBefore >= SEND_SOL_LAMPORTS && recipUsdcBefore >= SEND_USDC;
  if (alreadyFunded) {
    console.log("Recipient already has >= 0.05 SOL and >= 2 USDC; skipping Solana transfer.");
  } else {
    if (senderSolBefore < SEND_SOL_LAMPORTS + 5_000_000) {
      throw new Error(
        `Sender has ${senderSolBefore / LAMPORTS_PER_SOL} SOL; need 0.05 SOL plus rent/fees.`,
      );
    }
    if (senderUsdcBefore < SEND_USDC) {
      throw new Error(
        `Sender has ${Number(senderUsdcBefore) / 1e6} USDC; need 2 USDC.`,
      );
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: sender, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: recipient,
        lamports: SEND_SOL_LAMPORTS,
      }),
      createAssociatedTokenAccountIdempotentInstruction(sender, recipientAta, recipient, mint),
      createTransferCheckedInstruction(senderAta, mint, recipientAta, sender, SEND_USDC, TOKEN_DECIMALS),
    );
    const messageBytes = tx.serializeMessage();
    const messageHex = Buffer.from(messageBytes).toString("hex");
    const request = {
      request: {
        path: DERIVATION_PATH,
        payload_v2: { Eddsa: messageHex },
        domain_id: DOMAIN_ID,
      },
    };
    console.log("Requesting MPC Ed25519 signature (path solana-1, domain 1)...");

    const account = loadNearAccount(NEAR_ACCOUNT);
    const { getTransactionLastResult } = await import("@near-js/utils");
    const outcome = await account.signAndSendTransaction({
      receiverId: SIGNER_CONTRACT,
      actions: [actionCreators.functionCall("sign", request, SIGN_GAS, SIGN_DEPOSIT_YOCTONEAR)],
    });
    const signNearTx = outcome.transaction.hash as string;
    console.log("MPC sign NEAR tx:", signNearTx);
    console.log("NearBlocks: https://testnet.nearblocks.io/txns/" + signNearTx);

    const signatureBytes = extractSignatureBytes(getTransactionLastResult(outcome));
    const ok = ed25519.verify(signatureBytes, messageBytes, sender.toBytes());
    console.log("Local Ed25519 verify against", DERIVED_ADDRESS, ":", ok ? "OK" : "FAILED");
    if (!ok) throw new Error("Signature did not verify against the derived Solana public key");

    if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      throw new Error("Solana blockhash expired during MPC sign; re-run the script (NEAR already sent is skipped on retry).");
    }

    tx.addSignature(sender, Buffer.from(signatureBytes));
    if (!tx.verifySignatures()) throw new Error("Signed transaction failed verification");
    const raw = tx.serialize();
    solTxSig = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 5 });
    console.log("Broadcast Solana tx:", solTxSig);

    for (;;) {
      const st = (await connection.getSignatureStatuses([solTxSig])).value[0];
      if (st?.err) throw new Error("Solana transaction failed: " + JSON.stringify(st.err));
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) break;
      if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
        const again = (await connection.getSignatureStatuses([solTxSig], { searchTransactionHistory: true })).value[0];
        if (again && !again.err) break;
        throw new Error("Solana tx not confirmed before blockhash expired: " + solTxSig);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.log("Solana explorer: https://explorer.solana.com/tx/" + solTxSig + "?cluster=devnet");
  }

  // --- 3. Verify --------------------------------------------------------
  const senderNearAfter = await viewNearBalance(NEAR_ACCOUNT);
  const recipNearAfter = await viewNearBalance(RECIPIENT_NEAR);
  const senderSolAfter = await connection.getBalance(sender);
  const recipSolAfter = await connection.getBalance(recipient);
  const senderUsdcAfter = await usdcBalance(connection, sender, mint);
  const recipUsdcAfter = await usdcBalance(connection, recipient, mint);

  console.log("\n=== Funding result ===");
  console.log(`${RECIPIENT_NEAR}: ${formatNear(recipNearAfter)} NEAR`);
  console.log(`${RECIPIENT_SOLANA}: ${recipSolAfter / LAMPORTS_PER_SOL} SOL, ${Number(recipUsdcAfter) / 1e6} USDC`);
  console.log(`${NEAR_ACCOUNT} leftover: ${formatNear(senderNearAfter)} NEAR`);
  console.log(`${DERIVED_ADDRESS} leftover: ${senderSolAfter / LAMPORTS_PER_SOL} SOL, ${Number(senderUsdcAfter) / 1e6} USDC`);
  if (nearTxHash) console.log("NEAR transfer: https://testnet.nearblocks.io/txns/" + nearTxHash);
  if (solTxSig) console.log("Solana transfer: https://explorer.solana.com/tx/" + solTxSig + "?cluster=devnet");
  console.log("Recipient Solana explorer: https://explorer.solana.com/address/" + RECIPIENT_SOLANA + "?cluster=devnet");

  if (recipNearAfter < nearSent && !nearTxHash) {
    // skipped because already funded
  } else if (recipNearAfter < 1n * YOCTO) {
    throw new Error(`${RECIPIENT_NEAR} still has less than 1 NEAR after funding`);
  }
  if (recipSolAfter < SEND_SOL_LAMPORTS) {
    throw new Error(`Recipient SOL is ${recipSolAfter / LAMPORTS_PER_SOL}, expected at least 0.05`);
  }
  if (recipUsdcAfter < SEND_USDC) {
    throw new Error(`Recipient USDC is ${Number(recipUsdcAfter) / 1e6}, expected at least 2`);
  }
  console.log("Verification: OK");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
