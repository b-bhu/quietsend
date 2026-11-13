// Deploy and init the quietsend policy contract on NEAR testnet.
//   npx tsx scripts/p-00-deploy-policy.ts           (create subaccount, deploy, init)
//   npx tsx scripts/p-00-deploy-policy.ts --redeploy (redeploy code with the contract's own key; state kept)
// Build first: (cd contract && cargo near build non-reproducible-wasm)
// Keys: the contract account's key goes only to gitignored .keys/<account>.json (never printed).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
import { CIRCLE_USDC_DEVNET, NEAR_ACCOUNT, NEAR_RPC, ROOT, SIGNER_CONTRACT } from "./config.ts";

export const POLICY_ACCOUNT = process.env.POLICY_ACCOUNT ?? `policy.${NEAR_ACCOUNT}`;
const WASM = resolve(ROOT, "contract/target/near/quietsend_policy.wasm");
const FUND = 3n * 10n ** 24n; // 3 NEAR: ~2.1 NEAR storage for the wasm + headroom

function loadKey(accountId: string): KeyPair | undefined {
  const f = resolve(ROOT, ".keys", `${accountId}.json`);
  return existsSync(f) ? KeyPair.fromString(JSON.parse(readFileSync(f, "utf8")).private_key as KeyPairString) : undefined;
}

async function exists(provider: JsonRpcProvider, id: string) {
  try { await provider.query({ request_type: "view_account", finality: "final", account_id: id }); return true; } catch { return false; }
}

async function main() {
  if (!POLICY_ACCOUNT.endsWith(".testnet") || !NEAR_RPC.includes("testnet")) throw new Error("testnet only");
  const redeploy = process.argv.includes("--redeploy");
  const provider = new JsonRpcProvider({ url: NEAR_RPC });
  const wasm = readFileSync(WASM);
  const present = await exists(provider, POLICY_ACCOUNT);

  if (present) {
    if (!redeploy) throw new Error(`${POLICY_ACCOUNT} exists; pass --redeploy to upgrade code`);
    const kp = loadKey(POLICY_ACCOUNT);
    if (!kp) throw new Error(`no key for ${POLICY_ACCOUNT} in .keys/`);
    const acct = new Account(POLICY_ACCOUNT, provider, new KeyPairSigner(kp));
    const out = await acct.signAndSendTransaction({ receiverId: POLICY_ACCOUNT, actions: [actionCreators.deployContract(wasm)] });
    console.log("Redeployed. NearBlocks: https://testnet.nearblocks.io/txns/" + out.transaction.hash);
    return;
  }

  const parentKey = loadKey(NEAR_ACCOUNT);
  if (!parentKey) throw new Error(`no key for ${NEAR_ACCOUNT} in .keys/`);
  const kp = KeyPair.fromRandom("ed25519");
  const keyFile = resolve(ROOT, ".keys", `${POLICY_ACCOUNT}.json`);
  if (existsSync(keyFile)) throw new Error(`${keyFile} exists; refusing to overwrite`);
  writeFileSync(keyFile, JSON.stringify({ account_id: POLICY_ACCOUNT, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });

  const parent = new Account(NEAR_ACCOUNT, provider, new KeyPairSigner(parentKey));
  const init = { owner: NEAR_ACCOUNT, mpc: SIGNER_CONTRACT, usdc_mint: CIRCLE_USDC_DEVNET };
  const out = await parent.signAndSendTransaction({
    receiverId: POLICY_ACCOUNT,
    actions: [
      actionCreators.createAccount(),
      actionCreators.transfer(FUND),
      actionCreators.addKey(kp.getPublicKey(), actionCreators.fullAccessKey()),
      actionCreators.deployContract(wasm),
      actionCreators.functionCall("new", init, 30_000_000_000_000n, 0n),
    ],
  });
  console.log("Created + deployed + init:", POLICY_ACCOUNT);
  console.log("NearBlocks: https://testnet.nearblocks.io/txns/" + out.transaction.hash);
  console.log("Account:    https://testnet.nearblocks.io/address/" + POLICY_ACCOUNT);
  const cfg = await provider.callFunction(POLICY_ACCOUNT, "get_config", {});
  console.log("get_config:", JSON.stringify(cfg));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
