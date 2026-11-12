// Step 4: request an Ed25519 signature from v1.signer-prod.testnet.
// Reads NEAR_PRIVATE_KEY only from the environment / gitignored .env.local (never printed).
// Do not run the live path in this environment (no NEAR key). Use --dry-run to print the request JSON.
// Usage:
//   npx tsx scripts/04-sign.ts --dry-run
//   NEAR_ACCOUNT=bibhu-dev.testnet NEAR_PRIVATE_KEY=ed25519:... npx tsx scripts/04-sign.ts
import { config } from "dotenv";
import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { PublicKey } from "@solana/web3.js";
import { actionCreators } from "@near-js/transactions";
import { getTransactionLastResult } from "@near-js/utils";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  DERIVED_ADDRESS,
  DERIVATION_PATH,
  DOMAIN_ID,
  KEY_TYPE,
  NEAR_ACCOUNT as DEFAULT_NEAR_ACCOUNT,
  NEAR_RPC,
  ROOT,
  SIGN_DEPOSIT_YOCTONEAR,
  SIGN_GAS,
  SIGN_GAS_MINIMUM_TGAS,
  SIGNATURE_PATH,
  SIGNER_CONTRACT,
  UNSIGNED_MESSAGE_HEX,
  UNSIGNED_TX_PATH,
  ensureDirs,
} from "./config.ts";

config({ path: resolve(ROOT, ".env.local") });
config({ path: resolve(ROOT, ".env") });

const dryRun = process.argv.includes("--dry-run");

function loadMessageHex(): string {
  if (existsSync(UNSIGNED_MESSAGE_HEX)) {
    return readFileSync(UNSIGNED_MESSAGE_HEX, "utf8").trim();
  }
  if (existsSync(UNSIGNED_TX_PATH)) {
    const j = JSON.parse(readFileSync(UNSIGNED_TX_PATH, "utf8"));
    if (j.messageHex) return String(j.messageHex);
  }
  if (dryRun) return "<run scripts/03-build-tx.ts to fill this hex>";
  throw new Error("Missing out/unsigned-message.hex. Run scripts/03-build-tx.ts first.");
}

function signRequest(messageHex: string) {
  return {
    request: {
      path: DERIVATION_PATH,
      payload_v2: { Eddsa: messageHex },
      domain_id: DOMAIN_ID,
    },
  };
}

function extractSignatureBytes(sig: unknown): Uint8Array {
  if (!sig || typeof sig !== "object") throw new Error("Empty signature");
  const s = sig as { signature?: number[] | Uint8Array; scheme?: string };
  if (s.signature) return Uint8Array.from(s.signature);
  throw new Error(`Unexpected signature shape: ${Object.keys(s).join(",")}`);
}

async function main() {
  const accountId = process.env.NEAR_ACCOUNT || DEFAULT_NEAR_ACCOUNT;
  const messageHex = loadMessageHex();
  const request = signRequest(messageHex);

  console.log("Signer contract:", SIGNER_CONTRACT);
  console.log("NEAR account:", accountId);
  console.log("Path:", DERIVATION_PATH);
  console.log("keyType:", KEY_TYPE, "domain_id:", DOMAIN_ID);
  console.log("Deposit:", SIGN_DEPOSIT_YOCTONEAR.toString(), "yoctoNEAR");
  console.log(
    "Gas:",
    SIGN_GAS.toString(),
    `(300 Tgas; live config minimum is ${SIGN_GAS_MINIMUM_TGAS} Tgas)`,
  );
  console.log("Sign request JSON:\n", JSON.stringify(request, null, 2));

  if (dryRun) {
    console.log("\n--dry-run: not sending a NEAR transaction.");
    return;
  }

  const keyFile = resolve(ROOT, ".keys", `${accountId}.json`);
  const privateKey = process.env.NEAR_PRIVATE_KEY ??
    (existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, "utf8")).private_key : undefined); // never printed
  if (!privateKey) {
    throw new Error(
      "NEAR_PRIVATE_KEY is not set. Put it in gitignored .env.local (never print it) or pass it as an env var. Use --dry-run to inspect the request without a key.",
    );
  }

  const keyPair = KeyPair.fromString(privateKey as KeyPairString);
  const signer = new KeyPairSigner(keyPair);
  const provider = new JsonRpcProvider({ url: NEAR_RPC });
  const account = new Account(accountId, provider, signer);

  // Same `sign` call chainsig.js makes (1 yoctoNEAR, 300 Tgas), sent directly so the NEAR tx hash is kept.
  const messageBytes = Buffer.from(messageHex, "hex");
  const outcome = await account.signAndSendTransaction({
    receiverId: SIGNER_CONTRACT,
    actions: [actionCreators.functionCall("sign", request, SIGN_GAS, SIGN_DEPOSIT_YOCTONEAR)],
  });
  const nearTxHash = outcome.transaction.hash as string;
  console.log("NEAR tx hash:", nearTxHash);
  console.log("NearBlocks: https://testnet.nearblocks.io/txns/" + nearTxHash);
  const signatures = [getTransactionLastResult(outcome)];

  if (!signatures[0]) throw new Error("No signature returned from the signer contract");
  const signatureBytes = extractSignatureBytes(signatures[0]);
  const derivedPk = new PublicKey(DERIVED_ADDRESS).toBytes();
  const ok = ed25519.verify(signatureBytes, messageBytes, derivedPk);
  console.log("Local Ed25519 verify against derived pubkey:", ok ? "OK" : "FAILED");
  if (!ok) throw new Error("Signature did not verify against the derived Solana public key");

  ensureDirs();
  writeFileSync(
    SIGNATURE_PATH,
    JSON.stringify(
      {
        scheme: "Ed25519",
        signatureHex: Buffer.from(signatureBytes).toString("hex"),
        signatureBase64: Buffer.from(signatureBytes).toString("base64"),
        verified: ok,
        derivedAddress: DERIVED_ADDRESS,
        nearTxHash,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Signature written to", SIGNATURE_PATH, `(${signatureBytes.length} bytes)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
