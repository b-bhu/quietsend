// End-to-end test of the policy contract on NEAR testnet + Solana devnet.
//   npx tsx scripts/p-01-policy-e2e.ts
// 1. owner sets policy (per_transfer 1 USDC, daily 3, hard cap 5) and prepays 0.01 NEAR
// 2. owner adds a function-call key limited to policy.<owner> method sign_for_caller (key in .keys/)
// 3. derives the policy-mode Solana address and funds it from the human-mode address (once)
// 4. with ONLY the function-call key: 0.1 USDC send -> signed -> broadcast
// 5. 2 USDC send -> needs_approval (no signature); owner approves; fresh tx -> signed -> broadcast
// Testnet/devnet only. Never prints keys.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
import { getTransactionLastResult } from "@near-js/utils";
import { ed25519 } from "@noble/curves/ed25519.js";
import { contracts } from "chainsig.js";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  CIRCLE_USDC_DEVNET, DEVNET_GENESIS, DERIVATION_PATH, DERIVED_ADDRESS, DOMAIN_ID, NEAR_ACCOUNT, NEAR_RPC, OUT_DIR,
  ROOT, SIGN_DEPOSIT_YOCTONEAR, SIGN_GAS, SIGNER_CONTRACT, TOKEN_DECIMALS,
} from "./config.ts";

const POLICY = process.env.POLICY_ACCOUNT ?? "policy.quietsend.testnet"; // was policy.bibhu-usdc.testnet until 14 Nov 2026
const RECIPIENT = new PublicKey("7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C");
const RPC = process.env.SOLANA_RPC ?? "https://solana-devnet.api.onfinality.io/public";
const USDC = (n: number) => BigInt(Math.round(n * 10 ** TOKEN_DECIMALS));
const POLICY_VALUES = { per_transfer: USDC(1).toString(), daily: USDC(3).toString(), cap: USDC(5).toString() };
const FUND_SOL = Math.round(0.05 * LAMPORTS_PER_SOL);
const FUND_USDC = USDC(3);
const FC_KEY_FILE = resolve(ROOT, ".keys", `${NEAR_ACCOUNT}.policy-fc.json`);
const mint = new PublicKey(CIRCLE_USDC_DEVNET);
const links: Record<string, string> = {};
const nb = (h: string) => "https://testnet.nearblocks.io/txns/" + h;
const sx = (s: string) => "https://explorer.solana.com/tx/" + s + "?cluster=devnet";

function readKey(file: string): KeyPair {
  return KeyPair.fromString(JSON.parse(readFileSync(file, "utf8")).private_key as KeyPairString);
}
const provider = new JsonRpcProvider({ url: NEAR_RPC });

async function usdcBal(c: Connection, owner: PublicKey) {
  const r = await c.getParsedTokenAccountsByOwner(owner, { mint });
  return r.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
}

async function broadcast(c: Connection, tx: Transaction, signer: PublicKey, sig: Uint8Array, lastValid: number) {
  tx.addSignature(signer, Buffer.from(sig));
  if (!tx.verifySignatures()) throw new Error("signed tx failed verification");
  const id = await c.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  for (;;) {
    const st = (await c.getSignatureStatuses([id])).value[0];
    if (st?.err) throw new Error("Solana tx failed: " + JSON.stringify(st.err));
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return id;
    if ((await c.getBlockHeight("confirmed")) > lastValid) throw new Error("blockhash expired: " + id);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function sigBytes(res: any): Uint8Array {
  // direct signer result: {scheme, signature:[64]}; contract result: {status:"signed", signature:{scheme, signature:[64]}}
  const inner = Array.isArray(res?.signature) ? res : res?.signature;
  if (!Array.isArray(inner?.signature)) throw new Error("no signature in result: " + JSON.stringify(res)?.slice(0, 300));
  return Uint8Array.from(inner.signature);
}

async function main() {
  if (!NEAR_RPC.includes("testnet") || !POLICY.endsWith(".testnet")) throw new Error("testnet only");
  const c = new Connection(RPC, "confirmed");
  if ((await c.getGenesisHash()) !== DEVNET_GENESIS) throw new Error("RPC is not Solana devnet");
  mkdirSync(OUT_DIR, { recursive: true });

  const owner = new Account(NEAR_ACCOUNT, provider, new KeyPairSigner(readKey(resolve(ROOT, ".keys", `${NEAR_ACCOUNT}.json`))));
  const view = <T = any>(method: string, args: Record<string, unknown>) => provider.callFunction(POLICY, method, args) as Promise<T>;

  // ---- 1. policy + prepaid ----
  const cur: any = await view("get_policy", { account_id: NEAR_ACCOUNT });
  const same = cur && cur.per_transfer === POLICY_VALUES.per_transfer && cur.daily === POLICY_VALUES.daily && cur.cap === POLICY_VALUES.cap;
  if (!same) {
    const o = await owner.signAndSendTransaction({
      receiverId: POLICY,
      actions: [actionCreators.functionCall("set_policy", { ...POLICY_VALUES, allowlist: null, allow_hide_unverified: false }, 30_000_000_000_000n, 1n)],
    });
    console.log("set_policy:", nb(o.transaction.hash)); links.setPolicy = nb(o.transaction.hash);
  } else console.log("policy already set");
  console.log("get_policy:", JSON.stringify(await view("get_policy", { account_id: NEAR_ACCOUNT })));
  if (BigInt((await view<string>("get_prepaid", { account_id: NEAR_ACCOUNT })) as string) < 100n) {
    const o = await owner.signAndSendTransaction({
      receiverId: POLICY,
      actions: [actionCreators.functionCall("deposit", {}, 30_000_000_000_000n, 10n ** 22n)], // 0.01 NEAR
    });
    console.log("deposit 0.01 NEAR:", nb(o.transaction.hash)); links.deposit = nb(o.transaction.hash);
  }
  console.log("prepaid yocto:", await view("get_prepaid", { account_id: NEAR_ACCOUNT }));

  // ---- 2. function-call key ----
  if (!existsSync(FC_KEY_FILE)) {
    const kp = KeyPair.fromRandom("ed25519");
    writeFileSync(FC_KEY_FILE, JSON.stringify({ account_id: NEAR_ACCOUNT, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  }
  const fcKp = readKey(FC_KEY_FILE);
  const fcPub = fcKp.getPublicKey().toString();
  let hasKey = true;
  try { await provider.query({ request_type: "view_access_key", finality: "final", account_id: NEAR_ACCOUNT, public_key: fcPub }); } catch { hasKey = false; }
  if (!hasKey) {
    const o = await owner.signAndSendTransaction({
      receiverId: NEAR_ACCOUNT,
      actions: [actionCreators.addKey(fcKp.getPublicKey(), actionCreators.functionCallAccessKey(POLICY, ["sign_for_caller", "sign_evm_for_caller"], 10n ** 24n))],
    });
    console.log("added function-call key", fcPub, "->", nb(o.transaction.hash)); links.addFcKey = nb(o.transaction.hash);
  } else console.log("function-call key present:", fcPub);
  const agent = new Account(NEAR_ACCOUNT, provider, new KeyPairSigner(fcKp));

  // ---- 3. derive the policy-mode address ----
  const path = await view<string>("derived_path", { account_id: NEAR_ACCOUNT });
  const cs = new contracts.ChainSignatureContract({ networkId: "testnet", contractId: SIGNER_CONTRACT });
  const pk = await cs.getDerivedPublicKey({ path, predecessor: POLICY, IsEd25519: true } as any);
  const addr = String(pk).replace(/^ed25519:/, "");
  const agentSol = new PublicKey(addr);
  const agentAta = getAssociatedTokenAddressSync(mint, agentSol);
  console.log(`\nPolicy-mode Solana address: ${addr}\n  (predecessor=${POLICY}, path=${path})\n  human-mode address stays ${DERIVED_ADDRESS}`);
  links.policyAddress = `https://explorer.solana.com/address/${addr}?cluster=devnet`;

  // ---- fund (human mode address -> policy address), once ----
  const solNow = await c.getBalance(agentSol);
  const usdcNow = await usdcBal(c, agentSol);
  console.log(`policy address balance: ${solNow / LAMPORTS_PER_SOL} SOL, ${Number(usdcNow) / 1e6} USDC`);
  if (solNow < FUND_SOL / 2 || usdcNow < FUND_USDC) {
    const human = new PublicKey(DERIVED_ADDRESS);
    const humanAta = getAssociatedTokenAddressSync(mint, human);
    const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: human, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({ fromPubkey: human, toPubkey: agentSol, lamports: FUND_SOL }),
      createAssociatedTokenAccountIdempotentInstruction(human, agentAta, agentSol, mint),
      createTransferCheckedInstruction(humanAta, mint, agentAta, human, FUND_USDC, TOKEN_DECIMALS),
    );
    const msg = tx.serializeMessage();
    const o = await owner.signAndSendTransaction({
      receiverId: SIGNER_CONTRACT,
      actions: [actionCreators.functionCall("sign", { request: { path: DERIVATION_PATH, payload_v2: { Eddsa: Buffer.from(msg).toString("hex") }, domain_id: DOMAIN_ID } }, SIGN_GAS, SIGN_DEPOSIT_YOCTONEAR)],
    });
    const sig = sigBytes(getTransactionLastResult(o));
    if (!ed25519.verify(sig, msg, human.toBytes())) throw new Error("funding signature invalid");
    const id = await broadcast(c, tx, human, sig, lastValidBlockHeight);
    console.log("funded policy address (0.05 SOL + 3 USDC):", sx(id)); links.fund = sx(id);
  }

  // ---- 4/5. sends via the function-call key only ----
  async function agentSend(label: string, amount: bigint) {
    const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: agentSol, blockhash, lastValidBlockHeight }).add(
      createAssociatedTokenAccountIdempotentInstruction(agentSol, getAssociatedTokenAddressSync(mint, RECIPIENT), RECIPIENT, mint),
      createTransferCheckedInstruction(agentAta, mint, getAssociatedTokenAddressSync(mint, RECIPIENT), agentSol, amount, TOKEN_DECIMALS),
    );
    const msg = tx.serializeMessage();
    const o = await agent.signAndSendTransaction({
      receiverId: POLICY,
      actions: [actionCreators.functionCall("sign_for_caller", {
        payload_hex: Buffer.from(msg).toString("hex"), recipient: RECIPIENT.toBase58(), amount: amount.toString(), mode: "normal",
      }, SIGN_GAS, 0n)],
    });
    const hash = o.transaction.hash as string;
    const res: any = getTransactionLastResult(o);
    console.log(`\n[${label}] sign_for_caller NEAR tx: ${nb(hash)}`);
    console.log(`[${label}] contract result status: ${res?.status}`, res?.status === "signed" ? "" : JSON.stringify(res));
    return { res, hash, tx, msg, lastValidBlockHeight };
  }
  async function finishSend(label: string, r: Awaited<ReturnType<typeof agentSend>>) {
    if (r.res?.status !== "signed") throw new Error(`${label}: expected signed, got ${JSON.stringify(r.res)}`);
    if (r.res.path !== path) throw new Error("contract used an unexpected path: " + r.res.path);
    const sig = sigBytes(r.res);
    if (!ed25519.verify(sig, r.msg, agentSol.toBytes())) throw new Error("signature does not verify against the policy address");
    const id = await broadcast(c, r.tx, agentSol, sig, r.lastValidBlockHeight);
    console.log(`[${label}] Solana tx: ${sx(id)}`);
    links[label + ".near"] = nb(r.hash); links[label + ".solana"] = sx(id);
  }

  const before = await usdcBal(c, RECIPIENT);
  const agentBefore = await usdcBal(c, agentSol);
  const a = await agentSend("under-cap 0.1 USDC", USDC(0.1));
  await finishSend("under-cap", a);

  const b = await agentSend("over-cap 2 USDC", USDC(2));
  if (b.res?.status !== "needs_approval") throw new Error("expected needs_approval, got " + JSON.stringify(b.res));
  links["needs-approval.near"] = nb(b.hash);
  console.log("signature present in needs_approval result?", "signature" in b.res ? "YES (bad)" : "no");
  const intentId = String(b.res.intent_id);
  console.log("intent:", JSON.stringify(await view("get_intent", { id: intentId })));

  const ap = await owner.signAndSendTransaction({
    receiverId: POLICY,
    actions: [actionCreators.functionCall("approve_intent", { id: intentId }, 30_000_000_000_000n, 1n)],
  });
  console.log("\napprove_intent (owner, 1 yocto):", nb(ap.transaction.hash)); links.approve = nb(ap.transaction.hash);

  const d = await agentSend("post-approval 2 USDC", USDC(2));
  await finishSend("post-approval", d);

  const after = await usdcBal(c, RECIPIENT);
  console.log(`\nRecipient USDC: ${Number(before) / 1e6} -> ${Number(after) / 1e6} (expected +2.1 unless someone else also paid it)`);
  console.log("policy address now:", Number(await usdcBal(c, agentSol)) / 1e6, "USDC;", (await c.getBalance(agentSol)) / LAMPORTS_PER_SOL, "SOL");
  console.log("policy state:", JSON.stringify(await view("get_policy", { account_id: NEAR_ACCOUNT })));
  writeFileSync(resolve(OUT_DIR, "policy-e2e.json"), JSON.stringify({ policyAddress: addr, links }, null, 2));
  console.log("\nLinks:\n" + JSON.stringify(links, null, 2));
  // the recipient is a shared test wallet, so check the sender side exactly
  if (agentBefore - (await usdcBal(c, agentSol)) !== USDC(2.1)) throw new Error("policy address USDC delta is not -2.1");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
