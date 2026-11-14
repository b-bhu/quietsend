// Offline checks for the EVM path: digest parity with the Rust contract,
// MPC ECDSA parsing, low-s normalisation and signer recovery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { sign } from "viem/accounts";
import { authorizationDigest, recoverAuthorizer, toVrs, type Authorization } from "../core/evm.ts";
import { parseSignValue } from "../core/near.ts";

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// Same inputs as contract/src/evm.rs `digest_matches_typescript`.
const FIXED: Authorization = {
  from: "0x0101010101010101010101010101010101010101",
  to: "0x0202020202020202020202020202020202020202",
  value: 10n,
  validAfter: 0n,
  validBefore: 100n,
  nonce: "0x0707070707070707070707070707070707070707070707070707070707070707",
};
const FIXED_DIGEST = authorizationDigest("base-sepolia", FIXED);

test("viem digest equals the digest the Rust contract builds", () => {
  // contract/src/evm.rs `digest_matches_typescript` asserts the same constant.
  assert.equal(FIXED_DIGEST, "0x2347ce9472d49c349823c3a1d0fb50c8f4d5a30f4b4b7dcc362baea4ae58514e");
});

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // throwaway test key
const acct = privateKeyToAccount(KEY);

async function mpcStyle(a: Authorization) {
  const sig = await sign({ hash: authorizationDigest("base-sepolia", a), privateKey: KEY });
  const r = sig.r.slice(2);
  const s = BigInt(sig.s);
  const recid = Number(sig.yParity);
  return { r, s, recid };
}

test("parses the MPC ECDSA response into 65 bytes", async () => {
  const a = { ...FIXED, from: acct.address };
  const { r, s, recid } = await mpcStyle(a);
  const parsed = parseSignValue({
    status: "signed",
    signature: { scheme: "Secp256k1", big_r: { affine_point: "02" + r }, s: { scalar: s.toString(16).padStart(64, "0") }, recovery_id: recid },
    path: "x.testnet/evm-1",
  });
  assert.equal(parsed?.kind, "signature");
  if (parsed?.kind !== "signature") return;
  assert.equal(parsed.signature.length, 65);
  assert.equal(await recoverAuthorizer("base-sepolia", a, toVrs(parsed.signature)), acct.address);
});

test("high-s signatures are normalised to low-s and still recover", async () => {
  const a = { ...FIXED, from: acct.address };
  const { r, s, recid } = await mpcStyle(a);
  const high = new Uint8Array(65);
  high.set(Buffer.from(r, "hex"), 0);
  high.set(Buffer.from((N - s).toString(16).padStart(64, "0"), "hex"), 32);
  high[64] = recid ^ 1;
  const vrs = toVrs(high);
  assert.ok(BigInt(vrs.s) <= N / 2n);
  assert.equal(await recoverAuthorizer("base-sepolia", a, vrs), acct.address);
});

test("a signature over different terms recovers to someone else", async () => {
  const a = { ...FIXED, from: acct.address };
  const { r, s, recid } = await mpcStyle(a);
  const sig = new Uint8Array(65);
  sig.set(Buffer.from(r, "hex"), 0);
  sig.set(Buffer.from(s.toString(16).padStart(64, "0"), "hex"), 32);
  sig[64] = recid;
  const tampered = { ...a, value: a.value + 1n };
  assert.notEqual(await recoverAuthorizer("base-sepolia", tampered, toVrs(sig)), acct.address);
});
