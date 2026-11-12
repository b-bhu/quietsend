// Show what each leg exposes on-chain (accounts, programs, token balance changes, logs).
import { readFileSync } from "node:fs";
import { getConnection } from "./config.ts";
import { saveOut } from "./mb-lib.ts";
const res = JSON.parse(readFileSync(new URL("../out/mb-result.json", import.meta.url), "utf8"));
const sigs: string[] = [res.leg1, ...res.payoutSigs.map((p: any) => p.sig)];
const { connection } = await getConnection();
const out: any = {};
for (const s of sigs) {
  const t: any = await connection.getParsedTransaction(s, { maxSupportedTransactionVersion: 1 as any, commitment: "confirmed" });
  const keys = t.transaction.message.accountKeys.map((k: any) => `${k.pubkey.toBase58 ? k.pubkey.toBase58() : k.pubkey}${k.signer ? " (signer)" : ""}`);
  const bal = (t.meta.postTokenBalances ?? []).map((b: any, i: number) => {
    const pre = (t.meta.preTokenBalances ?? []).find((p: any) => p.accountIndex === b.accountIndex);
    return { acct: keys[b.accountIndex], owner: b.owner, mint: b.mint, pre: pre?.uiTokenAmount.uiAmountString ?? "0", post: b.uiTokenAmount.uiAmountString };
  });
  const ixs = t.transaction.message.instructions.map((i: any) => ({ program: i.program ?? i.programId.toBase58(), type: i.parsed?.type, info: i.parsed?.info ? JSON.stringify(i.parsed.info) : undefined }));
  out[s] = { slot: t.slot, err: t.meta.err, signers: keys.filter((k: string) => k.includes("signer")), tokenBalanceChanges: bal, instructions: ixs, logs: t.meta.logMessages };
  console.log("\n=== ", s, "\nslot", t.slot, "err", t.meta.err, "\nsigners:", out[s].signers, "\ntoken balance changes:", JSON.stringify(bal, null, 1), "\ninstructions:", JSON.stringify(ixs, null, 1).slice(0, 3000), "\nlogs:", t.meta.logMessages.slice(0, 25).join("\n"));
}
saveOut("mb-inspect.json", out);
