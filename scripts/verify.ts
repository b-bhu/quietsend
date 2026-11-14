// One-command check a screening agent can run: read-only by default.
//   npm run verify              derive the human-mode address and check published devnet txs
//   npm run verify -- --send    if a gitignored key is present, also send 0.1 USDC (normal, human mode)
import {
  DEFAULT_MB_VALIDATOR,
  DEFAULT_MB_VAULT,
  buildReceipt,
  derivePolicySolanaAddress,
  deriveSolanaAddress,
  ataOf,
  formatUsdc,
  getBalances,
  getConfig,
  inspectTx,
  mpcSignViaKey,
  runSend,
} from "../core/index.ts";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(ROOT, ".env.local"), quiet: true });
loadEnv({ path: resolve(ROOT, ".env"), quiet: true });

const ACCOUNT = process.env.NEAR_ACCOUNT ?? "bibhu-usdc.testnet";
const EXPECTED_HUMAN = "7snfiiW6ZP2pgACBx3ZtKKcpNwTk74gGGQPRtxDVnt27";
const RECIPIENT = "7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C";

// Published Solana devnet transactions from the proven runs (see README.draft.md).
const NORMAL_TX = "3hUZ5hSAwM8XBsxkM1nGVwE2G6UxdwBjS8qaD1wmj3L7WUo9z8bGsZdzVCCZKfi3RpnKQica5tCb16snroE4uKgt";
const HIDE_LEG1 = "2w2LRuLninNbG2MbWeCAczuJUaEW9yAxMhVR2GD1JmXEfWdBjvQYDETY6mPMX3uF1WqHPZnUB3CixhvfSLGfxKq7";
const HIDE_LEG2 = "5cTHDqYssFJx2cfUuXe3LYEpz5f2Q3MfVNuFuqp9Qrw4PJ3WhzqYG1h6ZAD9aEG9HxJpZNAHe3jSJCxN7v88dsUk";

const ok = (cond: boolean, msg: string) => {
  console.log(cond ? "PASS" : "FAIL", msg);
  if (!cond) process.exitCode = 1;
};

function loadKey(accountId: string): string | undefined {
  if (process.env.NEAR_PRIVATE_KEY) return process.env.NEAR_PRIVATE_KEY;
  const keyFile = resolve(ROOT, ".keys", `${accountId}.json`);
  if (!existsSync(keyFile)) return undefined;
  const j = JSON.parse(readFileSync(keyFile, "utf8")) as { private_key?: string };
  return typeof j.private_key === "string" ? j.private_key : undefined;
}

async function main() {
  console.log("quietsend verify (Solana devnet + NEAR testnet, read-only unless --send)");

  const human = await deriveSolanaAddress(ACCOUNT);
  console.log(`human-mode address for ${ACCOUNT} + solana-1: ${human}`);
  ok(human === EXPECTED_HUMAN, `human-mode address is the published ${EXPECTED_HUMAN}`);

  try {
    const policy = await derivePolicySolanaAddress(ACCOUNT);
    console.log(`policy-mode address for ${getConfig().policyContract} + ${ACCOUNT}/solana-1: ${policy}`);
    ok(policy !== human, "policy-mode address differs from the human-mode address");
  } catch (e) {
    console.log("NOTE", "could not derive the policy-mode address:", e instanceof Error ? e.message : e);
  }

  const bal = await getBalances(human);
  console.log(`balances at human address: SOL ${bal.sol}, USDC ${formatUsdc(bal.usdcBase)}`);
  ok(bal.sol > 0 && bal.usdcBase >= 0n, "human-mode balances are readable on devnet");

  const normal = await inspectTx(NORMAL_TX);
  ok(!!normal, `normal tx fetched: https://explorer.solana.com/tx/${NORMAL_TX}?cluster=devnet`);
  if (normal) {
    ok(!normal.err, "normal tx succeeded on chain");
    ok(normal.accounts.includes(human) || normal.usdcChanges.some((c) => c.owner === human), "normal tx (PUBLIC) contains the sender");
    // If the recipient already has a USDC account, the wallet pubkey itself may not be a static key —
    // the recipient is still public as the owner of that token account.
    ok(
      normal.accounts.includes(RECIPIENT) ||
        normal.usdcChanges.some((c) => c.owner === RECIPIENT) ||
        normal.accounts.includes(ataOf(RECIPIENT)),
      "normal tx (PUBLIC) contains the recipient (wallet or their USDC account)",
    );
    const recDelta = normal.usdcChanges.find((c) => c.owner === RECIPIENT)?.deltaBase ?? 0n;
    ok(recDelta === 1_000_000n, `normal tx recipient received 1 USDC (got ${recDelta})`);
  }

  const leg1 = await inspectTx(HIDE_LEG1);
  ok(!!leg1, `hide leg 1 fetched: https://explorer.solana.com/tx/${HIDE_LEG1}?cluster=devnet`);
  if (leg1) {
    ok(!leg1.err, "hide leg 1 succeeded on chain");
    ok(leg1.accounts.includes(human), "hide leg 1 (PUBLIC) contains the sender");
    ok(!leg1.accounts.includes(RECIPIENT), "hide leg 1 (HIDDEN): recipient is not in the transaction");
    ok(leg1.accounts.includes(DEFAULT_MB_VAULT) || leg1.usdcChanges.some((c) => c.owner === DEFAULT_MB_VAULT), "hide leg 1 touches the MagicBlock vault");
  }

  const leg2 = await inspectTx(HIDE_LEG2);
  ok(!!leg2, `hide leg 2 fetched: https://explorer.solana.com/tx/${HIDE_LEG2}?cluster=devnet`);
  if (leg2) {
    ok(!leg2.err, "hide leg 2 succeeded on chain");
    ok(leg2.accounts.includes(RECIPIENT), "hide leg 2 (PUBLIC) contains the recipient");
    ok(!leg2.accounts.includes(human), "hide leg 2 (HIDDEN): sender is not in the transaction");
    ok(leg2.signers.includes(DEFAULT_MB_VALIDATOR), `hide leg 2 is signed by MagicBlock validator ${DEFAULT_MB_VALIDATOR}`);
    const recDelta = leg2.usdcChanges.find((c) => c.owner === RECIPIENT)?.deltaBase ?? 0n;
    ok(recDelta === 1_000_000n, `hide leg 2 recipient received 1 USDC (got ${recDelta})`);
  }

  const wantSend = process.argv.includes("--send");
  const key = loadKey(ACCOUNT);
  if (wantSend) {
    if (!key) {
      console.log("NOTE --send was passed but no key is present; skipping the live send (read-only checks still stand).");
    } else {
      console.log("LIVE send of 0.1 USDC (normal, human mode)…");
      const rec = await runSend(
        {
          sign: (message, onHash) => mpcSignViaKey(ACCOUNT, key, message, onHash),
          nearAccount: ACCOUNT,
          solanaAddress: human,
          recipient: RECIPIENT,
          amountUi: "0.1",
          mode: "normal",
        },
        (m) => console.log("  ·", m),
      );
      const receipt = await buildReceipt(rec, { signerBackend: "human" });
      console.log("LIVE receipt", receipt.legs[0]?.explorer, "status", receipt.status);
      ok(rec.status === "confirmed" && !!rec.leg1Sig, "live send confirmed on devnet");
    }
  } else if (key) {
    console.log("NOTE a key is present; re-run with --send to perform a live 0.1 USDC transfer. Not done in the default read-only run.");
  } else {
    console.log("NOTE no gitignored key was found; skipped the live send (this is expected on a fresh clone).");
  }

  if (process.exitCode) {
    console.log("VERIFY FAILED");
    process.exit(process.exitCode);
  }
  console.log("VERIFY PASSED");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
