// Offline checks for the 402 server side: what a paid endpoint must refuse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount, sign } from "viem/accounts";
import { authorizationDigest, EVM_CHAINS } from "../core/evm.ts";
import { verifyPayment, type PaymentRequirements } from "../core/x402.ts";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // throwaway
const agent = privateKeyToAccount(KEY);
const PAY_TO = "0x2222222222222222222222222222222222222222";
const req: PaymentRequirements = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "10000",
  resource: "http://localhost/premium",
  payTo: PAY_TO,
  maxTimeoutSeconds: 120,
  asset: EVM_CHAINS["base-sepolia"].usdc,
};

async function header(over: Partial<{ to: string; value: bigint; validBefore: bigint; signer: `0x${string}`; tamper: boolean }> = {}) {
  const a = {
    from: agent.address,
    to: (over.to ?? PAY_TO) as `0x${string}`,
    value: over.value ?? 10000n,
    validAfter: 0n,
    validBefore: over.validBefore ?? BigInt(Math.floor(Date.now() / 1000) + 60),
    nonce: ("0x" + "ab".repeat(32)) as `0x${string}`,
  };
  const s = await sign({ hash: authorizationDigest("base-sepolia", a), privateKey: over.signer ?? KEY });
  const sig = (s.r + s.s.slice(2) + (27 + Number(s.yParity)).toString(16)) as `0x${string}`;
  const value = over.tamper ? (a.value + 1n).toString() : a.value.toString();
  const p = {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: { signature: sig, authorization: { ...a, value, validAfter: "0", validBefore: a.validBefore.toString() } },
  };
  return Buffer.from(JSON.stringify(p)).toString("base64");
}

test("accepts a correct payment", async () => {
  const v = await verifyPayment(await header(), req);
  assert.equal(v.ok, true);
});

for (const [name, over, reason] of [
  ["wrong payee", { to: "0x3333333333333333333333333333333333333333" }, "pays the wrong address"],
  ["below price", { value: 9999n }, "amount below price"],
  ["expired", { validBefore: 1n }, "authorization not currently valid"],
  ["amount edited after signing", { tamper: true }, "signature does not match from"],
  ["signed by someone else", { signer: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" }, "signature does not match from"],
] as const) {
  test(`refuses: ${name}`, async () => {
    const v = await verifyPayment(await header(over as never), req);
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.reason, reason);
  });
}

test("refuses garbage", async () => {
  const v = await verifyPayment("not-base64-json", req);
  assert.equal(v.ok, false);
});
