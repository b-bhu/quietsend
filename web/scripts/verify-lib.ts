// Headless verification of web/src/lib (no browser, no real wallet).
//   npx tsx web/scripts/verify-lib.ts                 read-only: derive, balances, build/validate unsigned txs
//   npx tsx web/scripts/verify-lib.ts --send normal   REAL devnet send of 0.1 USDC via the lib, signed by the MPC
//   npx tsx web/scripts/verify-lib.ts --send hide     same through MagicBlock (2 legs)
// A "fake wallet" stands in for NEAR Connect: it signs the same `sign` function call with the existing key
// in .keys/ (never printed). Everything else is the code the browser runs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
import { contracts } from "chainsig.js";

const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
(globalThis as any).window = { dispatchEvent() {} };

const { deriveSolanaAddress, signatureFromNearTx } = await import("../src/lib/near.ts");
const { getBalances, formatUsdc, buildNormalTransfer, ataOf } = await import("../src/lib/solana.ts");
const { requestPrivateTransfer, checkEconomics } = await import("../src/lib/magicblock.ts");
const { runSend } = await import("../src/lib/send.ts");
const { inspectTx } = await import("../src/lib/inspect.ts");

const ACCOUNT = "bibhu-usdc.testnet";
const EXPECTED = "7snfiiW6ZP2pgACBx3ZtKKcpNwTk74gGGQPRtxDVnt27";
const RECIPIENT = "7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C";
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };

// 1. derivation: lib (signer view call) vs expected vs chainsig.js (local math from the root key)
const addr = await deriveSolanaAddress(ACCOUNT);
ok(addr === EXPECTED, `derived address ${addr}`);
const cs = new contracts.ChainSignatureContract({ networkId: "testnet", contractId: "v1.signer-prod.testnet" });
const csKey = String(await cs.getDerivedPublicKey({ path: "solana-1", predecessor: ACCOUNT, IsEd25519: true } as any)).replace(/^ed25519:/, "");
ok(csKey === addr, "chainsig.js derivation matches the view-call derivation");
ok((await deriveSolanaAddress(ACCOUNT, "solana-2")) !== addr, "different path gives a different address");

// 2. balances
const bal = await getBalances(addr);
console.log(`balances: SOL ${bal.sol}, USDC ${formatUsdc(bal.usdcBase)}`);
ok(bal.sol > 0 && bal.usdcBase > 0n, "balances readable and funded");

// 3. unsigned tx builders
const n = await buildNormalTransfer(addr, RECIPIENT, 100_000n);
ok(n.messageBytes.length > 100 && n.kind === "legacy", `normal tx built, message ${n.messageBytes.length} bytes`);
const mb = await requestPrivateTransfer(addr, RECIPIENT, 100_000n);
ok(mb.kind === "v0" && mb.sendTo === "base", `MagicBlock tx built (v0), fees tokens=${mb.feesTokens} lamports=${mb.feesLamports}, programs=${mb.programs.length}`);
ok(!mb.programs.some((p) => p === ""), "program allowlist passed");
// negative controls: the economic check must reject a tx that spends more than the user asked for
{
  const { VersionedTransaction } = await import("@solana/web3.js");
  const tx = VersionedTransaction.deserialize(Buffer.from(mb.unsignedB64, "base64"));
  let rejected = false;
  try { await checkEconomics(tx, addr, 10_000n, BigInt(mb.feesTokens)); } catch (e) { rejected = true; console.log("  (expected) " + (e as Error).message.slice(0, 120)); }
  ok(rejected, "economic check rejects a tx that spends 0.1 USDC when the user asked for 0.01");
  let rej2 = false;
  try { await requestPrivateTransfer("9Rdh6nbt6Wq1Wu49yFjP5uqT8JgRDxxARbLBjbHKp8it", RECIPIENT, 100_000n); } catch (e) { rej2 = true; console.log("  (expected) " + (e as Error).message.slice(0, 120)); }
  ok(rej2, "request for a different sender is rejected");
}
ok(ataOf(RECIPIENT) === "6ejj46Y5gcukzFF3878XSgfAui6cUxh62Mboa2D4cCcd", "recipient ATA matches the one seen in scripts/");

// 3b. leg-2 detection against the already-settled hide send from 12 Nov (read-only): must find the MagicBlock payout
{
  const { pollLeg2 } = await import("../src/lib/send.ts");
  const rec: any = {
    id: "t", createdAt: 0, nearAccount: ACCOUNT, path: "solana-1", solanaAddress: addr, mode: "hide", recipient: RECIPIENT,
    recipientAta: "6ejj46Y5gcukzFF3878XSgfAui6cUxh62Mboa2D4cCcd", amountBase: "100000", status: "leg1-confirmed",
    leg1Sig: "4pgywdpfMCFq78K4NChbJNMfh3QGNnzmF1fFHDhhSzari8r2pcADLHF7M6jpXsRb7vXzj6awBcKuXLDkR6LM57mw",
    seenAtaSigs: ["23Q26dTtYtakY2ZhxrqYX7NeLjzFzgwpk54Tz2Mag3eXBhp78rh43MC58uxskBxQLFQLJcesCz2tXqRedLNyCN5F"],
  };
  const r = await pollLeg2(rec, (m) => console.log("  ·", m), 20_000);
  ok(r.leg2Sig === "S4LR9EjXeDpD8NyiDUVmeT8qSWtpGFKRcHaHhh8xBrWsFKQPhXgYp3fC3ozLnnkcm97pMLNVjsFX7rYYcU48FCq" && r.status === "settled", "pollLeg2 finds the payout (new sig + recipient delta == amount): " + r.leg2Sig?.slice(0, 10));
  const wrong = await pollLeg2({ ...rec, leg2Sig: undefined, status: "leg1-confirmed", amountBase: "123456" }, (m) => console.log("  ·", m), 8_000);
  ok(!wrong.leg2Sig, "pollLeg2 ignores a payout whose amount does not match");
}
// 4. optional real sends
const mode = process.argv.includes("--send") ? process.argv[process.argv.indexOf("--send") + 1] : undefined;
if (mode === "normal" || mode === "hide") {
  const pk = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../.keys", `${ACCOUNT}.json`), "utf8")).private_key as KeyPairString;
  const account = new Account(ACCOUNT, new JsonRpcProvider({ url: "https://rpc.testnet.near.org" }), new KeyPairSigner(KeyPair.fromString(pk)));
  const wallet = {
    async signAndSendTransaction(p: any) {
      const a = p.actions[0].params;
      console.log("fake wallet: sign call", a.methodName, "deposit", a.deposit, "gas", a.gas, "payload keys", Object.keys(a.args.request.payload_v2));
      return account.signAndSendTransaction({ receiverId: p.receiverId, actions: [actionCreators.functionCall(a.methodName, a.args, BigInt(a.gas), BigInt(a.deposit))] });
    },
  };
  const rec = await runSend({ wallet, nearAccount: ACCOUNT, solanaAddress: addr, recipient: RECIPIENT, amountUi: "0.1", mode }, (m) => console.log("  ·", m));
  console.log("RESULT", JSON.stringify(rec, null, 1));
  ok(!!rec.nearTxHash && !!rec.leg1Sig, "NEAR hash and leg 1 captured");
  ok(rec.status === (mode === "normal" ? "confirmed" : "settled"), "final status " + rec.status);
  // resume path: re-read the signature purely from the NEAR tx hash
  const again = await signatureFromNearTx(rec.nearTxHash!, ACCOUNT);
  ok(again.length === 64, "signature recovered from NEAR tx hash via viewTransactionStatus");
  const v1 = await inspectTx(rec.leg1Sig!);
  console.log("leg1 accounts include recipient:", v1?.accounts.includes(RECIPIENT), "| ATA:", v1?.accounts.includes(rec.recipientAta));
  if (mode === "hide" && rec.leg2Sig) {
    const v2 = await inspectTx(rec.leg2Sig);
    console.log("leg2 signers:", v2?.signers, "| accounts include sender:", v2?.accounts.includes(addr));
    ok(v1?.accounts.includes(RECIPIENT) === false, "leg 1 does not name the recipient");
    ok(v2?.accounts.includes(addr) === false, "leg 2 does not name the sender");
  }
}
