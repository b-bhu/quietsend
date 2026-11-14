// Set up an agent for your NEAR testnet account. Safe to re-run: it updates limits and
// skips what already exists.
//
//   NEAR_ACCOUNT=you.testnet npm run setup-agent                      # 1 / 3 / 5 USDC
//   NEAR_ACCOUNT=you.testnet npm run setup-agent -- --per 0.5 --daily 2 --cap 4
//
// Needs your full-access key at .keys/<account>.json ({ account_id, public_key, private_key }).
// It then:
//   1. sets your limits on the policy contract (set_policy, 1 yocto: only your full key can)
//   2. prepays the 1-yocto signing fee for future agent sends (0.01 NEAR)
//   3. adds the agent's key: a function-call key that can call only sign_for_caller and
//      sign_evm_for_caller on the policy contract, saved to .keys/<account>.policy-fc.json
//   4. creates a Base relayer key (.keys/base-relayer.json) if you have none
//   5. prints the addresses to fund
// Keys are written with mode 600 and never printed.
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { derivePolicyEvmAddress, derivePolicySolanaAddress, getConfig, parseUsdc } from "../core/index.ts";
import { NEAR_RPC, ROOT } from "./config.ts";

const account = process.env.NEAR_ACCOUNT;
if (!account) {
  console.error("Set NEAR_ACCOUNT, e.g. NEAR_ACCOUNT=you.testnet npm run setup-agent");
  process.exit(1);
}
const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const per = parseUsdc(arg("per", "1"));
const daily = parseUsdc(arg("daily", "3"));
const cap = parseUsdc(arg("cap", "5"));
const POLICY = getConfig().policyContract;
const KEYS = resolve(ROOT, ".keys");
const PREPAY = 10n ** 22n; // 0.01 NEAR = 10^22 signatures' worth of 1-yocto fees
const FC_ALLOWANCE = 10n ** 24n; // 1 NEAR gas allowance for the agent key
const nb = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;

async function main() {
  if (!account!.endsWith(".testnet") || !NEAR_RPC.includes("testnet")) throw new Error("testnet only");
  mkdirSync(KEYS, { recursive: true, mode: 0o700 });
  const ownerFile = resolve(KEYS, `${account}.json`);
  if (!existsSync(ownerFile)) {
    throw new Error(
      `Missing ${ownerFile}. Put your account's full-access key there as {"account_id","public_key","private_key"}. ` +
        "The near CLI's legacy keychain (~/.near-credentials/testnet/<account>.json) uses this format.",
    );
  }
  const owner = KeyPair.fromString(JSON.parse(readFileSync(ownerFile, "utf8")).private_key as KeyPairString);
  const provider = new JsonRpcProvider({ url: NEAR_RPC });
  const acct = new Account(account!, provider, new KeyPairSigner(owner));
  const view = <T>(method: string, args: Record<string, unknown>) => provider.callFunction(POLICY, method, args) as Promise<T>;

  // 1 + 2. limits and prepaid fee (one transaction)
  const prepaid = BigInt(await view<string>("get_prepaid", { account_id: account }));
  const actions = [
    actionCreators.functionCall(
      "set_policy",
      { per_transfer: per.toString(), daily: daily.toString(), cap: cap.toString(), allowlist: null, allow_hide_unverified: false },
      30_000_000_000_000n,
      1n,
    ),
  ];
  if (prepaid < 1000n) actions.push(actionCreators.functionCall("deposit", {}, 30_000_000_000_000n, PREPAY));
  const out = await acct.signAndSendTransaction({ receiverId: POLICY, actions });
  console.log(`limits set on ${POLICY}${prepaid < 1000n ? " + signing fees prepaid" : ""}: ${nb(out.transaction.hash)}`);

  // 3. the agent's restricted key, scoped to this contract
  const fcFile = resolve(KEYS, `${account}.policy-fc.json`);
  const existing = existsSync(fcFile) ? JSON.parse(readFileSync(fcFile, "utf8")) : undefined;
  if (existing?.receiver_id === POLICY) {
    console.log("agent key already set up:", fcFile);
  } else {
    if (existing) {
      const old = resolve(KEYS, `${account}.policy-fc.previous.json`);
      renameSync(fcFile, old);
      console.log("kept your previous agent key (another contract) as", old);
    }
    const fc = KeyPair.fromRandom("ed25519");
    const add = await acct.signAndSendTransaction({
      receiverId: account!,
      actions: [actionCreators.addKey(fc.getPublicKey(), actionCreators.functionCallAccessKey(POLICY, ["sign_for_caller", "sign_evm_for_caller"], FC_ALLOWANCE))],
    });
    writeFileSync(fcFile, JSON.stringify({ account_id: account, receiver_id: POLICY, public_key: fc.getPublicKey().toString(), private_key: fc.toString() }), { mode: 0o600 });
    console.log(`agent key added (can call only sign_for_caller, sign_evm_for_caller): ${nb(add.transaction.hash)}`);
  }

  // 4. Base relayer
  const relayerFile = resolve(KEYS, "base-relayer.json");
  if (!existsSync(relayerFile)) {
    const pk = generatePrivateKey();
    writeFileSync(relayerFile, JSON.stringify({ address: privateKeyToAccount(pk).address, private_key: pk, note: "Base Sepolia gas relayer, testnet only" }), { mode: 0o600 });
    console.log("created a Base relayer key:", relayerFile);
  }
  const relayer = JSON.parse(readFileSync(relayerFile, "utf8")).address as string;

  // 5. what to fund
  const [sol, base] = await Promise.all([derivePolicySolanaAddress(account!), derivePolicyEvmAddress(account!)]);
  console.log(`
Your agent for ${account}:
  limits      ${arg("per", "1")} USDC per send · ${arg("daily", "3")} a day (all chains) · ${arg("cap", "5")} max
  Solana      ${sol}
              fund with devnet USDC (faucet.circle.com) and ~0.05 SOL for fees
  Base        ${base}
              fund with Base Sepolia USDC only (faucet.circle.com); no ETH needed
  relayer     ${relayer}
              fund with a little Base Sepolia ETH; it pays gas for your agent's Base sends`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
