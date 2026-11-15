// quote_send's limit check must agree with the contract. These are the cases from
// contract/src/lib.rs `limit_logic` and `allowlist_logic`, plus the daily reset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicyView } from "../core/policy-check.ts";
import type { PolicyView } from "../core/near.ts";

const NOW = Date.UTC(2026, 10, 15, 12); // any fixed time
const TODAY = Math.floor(NOW / 86_400_000);
const pol = (spent: number, allowlist: string[] = [], day = TODAY): PolicyView => ({
  per_transfer: "1000000",
  daily: "3000000",
  cap: "5000000",
  spent_today: String(spent),
  day,
  allowlist,
});
const decide = (p: PolicyView, amount: number, recipient = "r") => evaluatePolicyView(p, BigInt(amount), recipient, NOW).approval;

test("limit logic matches the contract", () => {
  assert.equal(decide(pol(0), 100_000), "under_limit");
  assert.equal(decide(pol(0), 1_000_000), "under_limit");
  assert.equal(decide(pol(0), 1_000_001), "needs_approval");
  assert.equal(decide(pol(0), 5_000_001), "rejected");
  assert.equal(decide(pol(0), 0), "rejected");
  assert.equal(decide(pol(2_500_000), 1_000_000), "needs_approval"); // 3.5 > 3 daily
  assert.equal(decide(pol(2_000_000), 1_000_000), "under_limit");
});

test("allowlist logic matches the contract, Base labels included", () => {
  assert.equal(decide(pol(0, ["good"]), 1, "good"), "under_limit");
  assert.equal(decide(pol(0, ["good"]), 1, "other"), "needs_approval");
  const base = "base-sepolia:0xea70c99ba5aad8c0128122b5afb588161c2671a0";
  assert.equal(decide(pol(0, [base]), 1, base), "under_limit");
});

test("yesterday's spend does not count today, as in the contract", () => {
  assert.equal(decide(pol(2_500_000, [], TODAY - 1), 1_000_000), "under_limit");
  assert.equal(decide(pol(2_500_000, [], TODAY), 1_000_000), "needs_approval");
});

test("over the cap is refused even when the per-transfer limit would also trip", () => {
  const r = evaluatePolicyView(pol(0), 6_000_000n, "r", NOW);
  assert.equal(r.approval, "rejected");
  assert.match(r.note, /hard cap/);
});
