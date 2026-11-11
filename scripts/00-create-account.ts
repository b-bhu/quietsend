// Create a fresh NEAR testnet account via the official testnet helper.
// The private key is written ONLY to gitignored .keys/<account>.json (mode 600) and never printed.
// Usage: npx tsx scripts/00-create-account.ts <name>.testnet
import { KeyPair } from "near-api-js";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
const accountId = process.argv[2];
if (!accountId?.endsWith(".testnet")) throw new Error("Pass an account like name.testnet");
const file = `.keys/${accountId}.json`;
if (existsSync(file)) throw new Error(`${file} exists; refusing to overwrite`);
const view = await fetch("https://rpc.testnet.near.org", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "final", account_id: accountId } }) }).then(r => r.json());
if (view.result) throw new Error(`${accountId} already exists`);
const kp = KeyPair.fromRandom("ed25519");
const publicKey = kp.getPublicKey().toString();
mkdirSync(".keys", { recursive: true, mode: 0o700 });
writeFileSync(file, JSON.stringify({ account_id: accountId, public_key: publicKey, private_key: kp.toString() }), { mode: 0o600 });
const res = await fetch("https://helper.testnet.near.org/account", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }) });
console.log("helper status:", res.status, (await res.text()).slice(0, 200));
console.log("account:", accountId, "public key:", publicKey, "key file:", file);
