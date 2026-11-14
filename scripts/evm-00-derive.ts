// Derive the agent's EVM address (policy contract + "<user>/evm-1", secp256k1)
// two independent ways: the signer's view call, and chainsig.js local math.
import { contracts } from "chainsig.js";
import bs58 from "bs58";
import { keccak_256 } from "@noble/hashes/sha3.js";

const POLICY = process.argv[2] ?? "policy.quietsend.testnet";
const USER = process.argv[3] ?? "bibhu-usdc.testnet";
const path = `${USER}/evm-1`;

async function viewDerived(): Promise<string> {
  const args = Buffer.from(JSON.stringify({ path, predecessor: POLICY, domain_id: 0 })).toString("base64");
  const r = await fetch("https://test.rpc.fastnear.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: "v1.signer-prod.testnet", method_name: "derived_public_key", args_base64: args } }),
  }).then((x) => x.json());
  return JSON.parse(Buffer.from(r.result.result).toString());
}

function evmAddress(secpKey: string): string {
  // the view call returns "secp256k1:<base58 x||y>"; chainsig.js returns hex "04<x><y>"
  let b: Uint8Array = secpKey.startsWith("secp256k1:")
    ? bs58.decode(secpKey.slice("secp256k1:".length))
    : Buffer.from(secpKey.replace(/^0x/, ""), "hex");
  if (b.length === 65) b = b.slice(1);
  return "0x" + Buffer.from(keccak_256(b).slice(12)).toString("hex");
}

const a = evmAddress(await viewDerived());
const cs = new contracts.ChainSignatureContract({ networkId: "testnet", contractId: "v1.signer-prod.testnet" });
const b = evmAddress(String(await cs.getDerivedPublicKey({ path, predecessor: POLICY, IsEd25519: false } as any)));
console.log({ policy: POLICY, path, viewCall: a, chainsigJs: b, match: a === b });
if (a !== b) process.exit(1);
