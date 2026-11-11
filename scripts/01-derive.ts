// Step 1: derive the Solana devnet address controlled by a NEAR testnet account + path.
// Read-only: no funds, no transactions.
import { contracts } from "chainsig.js";

const ACCOUNT = process.env.NEAR_ACCOUNT ?? "bibhu-dev.testnet";
const PATH = process.env.DERIVATION_PATH ?? "solana-1";
const SIGNER = "v1.signer-prod.testnet";

const contract = new contracts.ChainSignatureContract({ networkId: "testnet", contractId: SIGNER });

// A: chainsig.js (what the official near-multichain example uses)
const pk = await contract.getDerivedPublicKey({ path: PATH, predecessor: ACCOUNT, IsEd25519: true } as any);
console.log("chainsig.js derived key:", pk);

// B: raw view call on the signer contract, as an independent cross-check
const args = Buffer.from(JSON.stringify({ path: PATH, predecessor: ACCOUNT, domain_id: 1 })).toString("base64");
const res = await fetch("https://rpc.testnet.near.org", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query",
    params: { request_type: "call_function", finality: "final", account_id: SIGNER, method_name: "derived_public_key", args_base64: args } }),
}).then(r => r.json());
const raw = res.result ? JSON.parse(Buffer.from(res.result.result).toString()) : res;
console.log("signer view derived_public_key:", raw);

const addr = String(pk).replace(/^ed25519:/, "");
console.log(`\nNEAR account: ${ACCOUNT}\nPath: ${PATH}\nSolana devnet address: ${addr}\nhttps://explorer.solana.com/address/${addr}?cluster=devnet`);
