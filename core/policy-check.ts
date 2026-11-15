// What the policy contract would decide for a send, computed from its get_policy view.
// Mirrors evaluate() in contract/src/lib.rs, in the same order: zero, hard cap, per
// transfer, daily (reset each UTC day), allowlist. Used by quote_send so an agent can
// see the outcome before it asks for a signature. The contract stays the authority.
import type { PolicyView } from "./near";
import { formatUsdc } from "./solana";

export type PolicyCheck = {
  approval: "under_limit" | "needs_approval" | "rejected" | "policy_contract_not_deployed";
  note: string;
};

const DAY_MS = 86_400_000;

/**
 * `recipient` is the contract's label: a Solana address, or `base-sepolia:0x…` in
 * lowercase. One budget covers both chains.
 */
export function evaluatePolicyView(policy: PolicyView, amountBase: bigint, recipient: string, nowMs = Date.now()): PolicyCheck {
  const per = BigInt(policy.per_transfer);
  const daily = BigInt(policy.daily);
  const cap = BigInt(policy.cap);
  const today = Math.floor(nowMs / DAY_MS);
  const spent = policy.day === undefined || policy.day === today ? BigInt(policy.spent_today) : 0n;
  const limits = `per transfer ${formatUsdc(per)} USDC, daily ${formatUsdc(daily)} USDC, spent today ${formatUsdc(spent)} USDC`;
  if (amountBase <= 0n) return { approval: "rejected", note: "amount must be greater than 0" };
  if (amountBase > cap) return { approval: "rejected", note: `amount exceeds the hard cap of ${formatUsdc(cap)} USDC; refused even with approval` };
  if (amountBase > per) return { approval: "needs_approval", note: `above the per-transfer limit (${limits}); the owner must approve` };
  if (spent + amountBase > daily) return { approval: "needs_approval", note: `the daily limit would be exceeded (${limits}); the owner must approve` };
  const allow = policy.allowlist ?? [];
  if (allow.length && !allow.includes(recipient)) {
    return { approval: "needs_approval", note: "recipient is not on the allowlist; the owner must approve" };
  }
  return { approval: "under_limit", note: `within policy (${limits}); the contract would sign` };
}
