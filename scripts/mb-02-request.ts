// Gate 2a: ask MagicBlock for an UNSIGNED private transfer (devnet) and inspect it. Sends nothing.
import { VersionedTransaction } from "@solana/web3.js";
import { DERIVED_ADDRESS, CIRCLE_USDC_DEVNET, getConnection } from "./config.ts";
import { mbFetch, saveOut, tokenBalance, RECIPIENT, CLUSTER } from "./mb-lib.ts";

const amount = Number(process.env.MB_AMOUNT ?? 1_000_000);
const { connection } = await getConnection();
console.log("sender USDC before:", await tokenBalance(connection, DERIVED_ADDRESS, CIRCLE_USDC_DEVNET));
console.log("recipient USDC before:", await tokenBalance(connection, RECIPIENT, CIRCLE_USDC_DEVNET));
console.log("sender SOL:", (await connection.getBalance(new (await import("@solana/web3.js")).PublicKey(DERIVED_ADDRESS))) / 1e9);

const body = {
  from: DERIVED_ADDRESS, to: RECIPIENT, mint: CIRCLE_USDC_DEVNET, amount,
  cluster: CLUSTER, visibility: "private", fromBalance: "base", toBalance: "base",
  initIfMissing: true, initAtasIfMissing: true, initVaultIfMissing: true,
  minDelayMs: "0", maxDelayMs: "0",
};
const r = await mbFetch("/v1/spl/transfer", { method: "POST", body: JSON.stringify(body) });
console.log("status:", r.status);
if (!r.ok) { console.log(JSON.stringify(r.json)); process.exit(1); }
const { transactionBase64, ...rest } = r.json;
console.log(JSON.stringify(rest, null, 1));
const tx = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));
console.log("tx version:", tx.version, "numRequiredSignatures:", tx.message.header.numRequiredSignatures);
console.log("static keys:", tx.message.staticAccountKeys.map((k) => k.toBase58()).join(" "));
console.log("program ids:", tx.message.compiledInstructions.map((i) => tx.message.staticAccountKeys[i.programIdIndex].toBase58()).join(" "));
saveOut("mb-transfer-request.json", { request: body, response: r.json });
