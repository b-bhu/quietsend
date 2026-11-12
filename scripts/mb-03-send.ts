// Gate 2b: request private transfer, guard the unsigned tx, MPC-sign the v0 message,
// broadcast to base devnet, then watch for a MagicBlock-signed (or vault-touching) payout.
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  DERIVED_ADDRESS,
  CIRCLE_USDC_DEVNET,
  MB_ALLOWED_PROGRAMS,
  MB_VALIDATOR,
  MB_VAULT,
  getConnection,
} from "./config.ts";
import {
  assertMagicBlockTx,
  checkEconomics,
  fetchTxView,
  matchMagicBlockPayout,
} from "../shared/magicblock-guards.ts";
import { mbFetch, mpcSign, saveOut, tokenBalance, explorer, RECIPIENT, CLUSTER } from "./mb-lib.ts";

const amount = Number(process.env.MB_AMOUNT ?? 1_000_000);
if (!Number.isInteger(amount) || amount <= 0) throw new Error("MB_AMOUNT must be a positive integer in base units");
const amountBase = BigInt(amount);
const { connection, rpcUrl } = await getConnection();
const recipAta = getAssociatedTokenAddressSync(new PublicKey(CIRCLE_USDC_DEVNET), new PublicKey(RECIPIENT));
const senderAta = getAssociatedTokenAddressSync(new PublicKey(CIRCLE_USDC_DEVNET), new PublicKey(DERIVED_ADDRESS));
const before = { sender: await tokenBalance(connection, DERIVED_ADDRESS, CIRCLE_USDC_DEVNET), recipient: await tokenBalance(connection, RECIPIENT, CIRCLE_USDC_DEVNET) };
console.log("BEFORE", before);
const seenBefore = new Set((await connection.getSignaturesForAddress(recipAta, { limit: 20 })).map((s) => s.signature));

const body = {
  from: DERIVED_ADDRESS, to: RECIPIENT, mint: CIRCLE_USDC_DEVNET, amount, cluster: CLUSTER,
  visibility: "private", fromBalance: "base", toBalance: "base",
  initIfMissing: true, initAtasIfMissing: true, initVaultIfMissing: true, minDelayMs: "0", maxDelayMs: "0",
};
const t0 = Date.now();
const r = await mbFetch("/v1/spl/transfer", { method: "POST", body: JSON.stringify(body) });
if (!r.ok) throw new Error("transfer build failed: " + JSON.stringify(r.json));
console.log("built:", r.json.version, "sendTo:", r.json.sendTo, "fees:", JSON.stringify(r.json.fees));
const tx = VersionedTransaction.deserialize(Buffer.from(r.json.transactionBase64, "base64"));
const { programs } = assertMagicBlockTx({
  tx,
  sendTo: r.json.sendTo,
  from: DERIVED_ADDRESS,
  usdcMint: CIRCLE_USDC_DEVNET,
  allowedPrograms: MB_ALLOWED_PROGRAMS,
});
const feesTokens = BigInt(r.json.fees?.tokens ?? "0");
await checkEconomics(connection, tx, DERIVED_ADDRESS, amountBase, feesTokens, CIRCLE_USDC_DEVNET);
console.log("guards passed; programs:", programs.length);
const msgBytes = tx.message.serialize();
console.log("message bytes:", msgBytes.length);
const sig = await mpcSign(msgBytes);
console.log("MPC signed + locally verified in", ((Date.now() - t0) / 1000).toFixed(1), "s");
tx.signatures[0] = sig;
const signedB64 = Buffer.from(tx.serialize()).toString("base64");

let sigStr: string;
try {
  sigStr = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
  console.log("sent via OnFinality devnet RPC");
} catch (e) {
  console.log("own-RPC send failed:", e instanceof Error ? e.message : e);
  const s = await mbFetch("/v1/transaction/send", { method: "POST", body: JSON.stringify({ transactionBase64: signedB64, sendTo: "base", cluster: CLUSTER }) });
  console.log("MB send:", s.status, JSON.stringify(s.json));
  if (!s.ok) throw new Error("send failed");
  sigStr = s.json.signature;
}
console.log("LEG1 (deposit/transfer-in) signature:", sigStr);
console.log(explorer(sigStr));
const conf = await connection.confirmTransaction({ signature: sigStr, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: r.json.lastValidBlockHeight }, "confirmed");
console.log("confirmed:", JSON.stringify(conf.value));
saveOut("mb-leg1.json", { signature: sigStr, explorer: explorer(sigStr), before, request: body, response: { ...r.json, transactionBase64: undefined } });

// Watch for the payout to the recipient's token account. A new sig only settles when the
// recipient's USDC delta equals the requested amount AND the tx is signed by the MagicBlock
// validator or touches the MagicBlock vault.
const deadline = Date.now() + 10 * 60_000;
let after = before;
const seen = new Set(seenBefore);
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10_000));
  after = { sender: await tokenBalance(connection, DERIVED_ADDRESS, CIRCLE_USDC_DEVNET), recipient: await tokenBalance(connection, RECIPIENT, CIRCLE_USDC_DEVNET) };
  const fresh = (await connection.getSignaturesForAddress(recipAta, { limit: 20 }))
    .map((s) => s.signature)
    .filter((s) => !seen.has(s) && s !== sigStr)
    .reverse();
  console.log(new Date().toISOString(), "recipient:", after.recipient, "sender:", after.sender, "new recipient-ATA txs:", fresh.join(",") || "-");
  for (const payoutSig of fresh) {
    const view = await fetchTxView(rpcUrl, payoutSig, CIRCLE_USDC_DEVNET).catch((e) => {
      console.log("  could not inspect", payoutSig.slice(0, 8), e instanceof Error ? e.message : e);
      return undefined;
    });
    if (!view) continue;
    seen.add(payoutSig);
    const match = matchMagicBlockPayout(view, {
      recipient: RECIPIENT,
      amountBase,
      validator: MB_VALIDATOR,
      vault: MB_VAULT,
    });
    if (match.ok) {
      saveOut("mb-result.json", {
        leg1: sigStr,
        leg1Explorer: explorer(sigStr),
        payoutSigs: [{ sig: payoutSig, explorer: explorer(payoutSig) }],
        before,
        after,
        senderAta: senderAta.toBase58(),
        recipAta: recipAta.toBase58(),
        validator: MB_VALIDATOR,
        vault: MB_VAULT,
      });
      console.log("SETTLED. Payout tx:", explorer(payoutSig));
      process.exit(0);
    }
    console.log("  ignoring", payoutSig.slice(0, 8) + "...:", match.reason);
  }
}
saveOut("mb-result.json", { leg1: sigStr, leg1Explorer: explorer(sigStr), before, after, settled: false });
console.log("NOT SETTLED within 10 min");
process.exit(2);
