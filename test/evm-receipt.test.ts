// The receipt a Base send leaves behind: all fields filled, every privacy row PUBLIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvmReceipt } from "../core/evm-receipt.ts";

test("a Base send receipt records the transfer, relayer and NEAR call, all public", () => {
  const r = buildEvmReceipt(
    {
      status: "sent",
      chain: "base-sepolia",
      from: "0x906f0d04f6b07644a8acfe76a167ae7a859af817",
      to: "0xea70c99ba5aad8c0128122b5afb588161c2671a0",
      amountBase: 10_000n,
      txHash: "0x9f97ba15033da937bf1d345a401f5f310a27ac28c1aaa2651a1b1698ce25bd75",
      explorer: "https://sepolia.basescan.org/tx/0x9f97ba15033da937bf1d345a401f5f310a27ac28c1aaa2651a1b1698ce25bd75",
      nearTxHash: "NEARHASH",
      relayer: "0x1111111111111111111111111111111111111111",
    },
    "you.testnet",
  );
  assert.match(r.id, /^evm-/);
  assert.equal(r.amountUsdc, "0.01");
  assert.equal(r.path, "you.testnet/evm-1");
  assert.equal(r.status, "confirmed");
  assert.equal(r.relayer, "0x1111111111111111111111111111111111111111");
  assert.ok(r.nearExplorer?.endsWith("NEARHASH"));
  assert.ok(r.privacy.length >= 4);
  assert.ok(r.privacy.every((row) => row.visibility === "PUBLIC"));
  assert.deepEqual(r.usdcTransfers, [{ from: r.from, to: r.recipient, amountUsdc: "0.01" }]);
});
