/**
 * The browser demo at #/demo and these tests run the SAME cases through the SAME
 * guard, by importing shared/attack-cases.ts. This file is what stops the demo
 * from claiming a refusal the guard does not actually produce.
 *
 * Offline: nothing is signed, broadcast or sent.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { assertMagicBlockTx } from "../shared/magicblock-guards.ts";
import {
  ATTACK_CASES,
  DEMO_ALLOWED_PROGRAMS,
  HONEST_CASE,
  ataOf,
  type AttackContext,
} from "../shared/attack-cases.ts";
import { USDC_MINT } from "./helpers.ts";

const ctx = (): AttackContext => {
  const from = Keypair.generate().publicKey.toBase58();
  return {
    from,
    fromAta: ataOf(from, USDC_MINT),
    attacker: Keypair.generate().publicKey.toBase58(),
    recipient: Keypair.generate().publicKey.toBase58(),
    usdcMint: USDC_MINT,
  };
};

const call = (a: { tx: never; sendTo: string; from: string }, allowed: string[]) =>
  assertMagicBlockTx({ ...a, usdcMint: USDC_MINT, allowedPrograms: allowed });

describe("cases shared with the browser demo", () => {
  test("the control case is accepted, so the guard is not refusing everything", () => {
    const c = ctx();
    assert.doesNotThrow(() => call(HONEST_CASE.build(c) as never, DEMO_ALLOWED_PROGRAMS));
  });

  test("every case has a distinct id", () => {
    const ids = ATTACK_CASES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  for (const c of ATTACK_CASES) {
    test(`${c.id}: refused, and for the stated reason`, () => {
      const x = ctx();
      let msg: string | undefined;
      try {
        call(c.build(x) as never, c.allowedPrograms ?? DEMO_ALLOWED_PROGRAMS);
      } catch (e) {
        msg = e instanceof Error ? e.message : String(e);
      }
      assert.ok(msg, `the guard ACCEPTED a hostile transaction: ${c.title}`);
      assert.ok(
        msg.includes(c.expect),
        `demo would show the wrong reason for "${c.title}":\n  expected to contain: ${c.expect}\n  guard said: ${msg}`,
      );
    });

    test(`${c.id}: has copy for the demo`, () => {
      assert.ok(c.title.length > 8, "title too short to render");
      assert.ok(c.harm.length > 20, "harm text too short to explain the risk");
    });
  }
});
