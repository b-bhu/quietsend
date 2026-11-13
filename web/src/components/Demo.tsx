import { useMemo, useState } from "react";
import { Keypair } from "@solana/web3.js";
import { assertMagicBlockTx } from "../../../shared/magicblock-guards";
import {
  ATTACK_CASES,
  DEMO_ALLOWED_PROGRAMS,
  HONEST_CASE,
  SIMULATION_ONLY,
  ataOf,
  type AttackContext,
} from "../../../shared/attack-cases";
import { USDC_MINT } from "../lib/config";
import { short } from "../lib/inspect";
import { Eye, EyeOff } from "./icons";

type Result = { ok: true } | { ok: false; reason: string };

/** Run one case through the real guard. Nothing is signed, broadcast or sent. */
function run(build: () => { tx: never; sendTo: string; from: string }, allowed: string[]): Result {
  try {
    const a = build();
    assertMagicBlockTx({ ...a, usdcMint: USDC_MINT, allowedPrograms: allowed });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export default function Demo() {
  const [guardOn, setGuardOn] = useState(true);
  const [open, setOpen] = useState<string>();

  // Fresh throwaway addresses per page load. No key here ever signs anything.
  const ctx = useMemo<AttackContext>(() => {
    const from = Keypair.generate().publicKey.toBase58();
    return {
      from,
      fromAta: ataOf(from, USDC_MINT),
      attacker: Keypair.generate().publicKey.toBase58(),
      recipient: Keypair.generate().publicKey.toBase58(),
      usdcMint: USDC_MINT,
    };
  }, []);

  const honest = useMemo(
    () => run(() => HONEST_CASE.build(ctx) as never, DEMO_ALLOWED_PROGRAMS),
    [ctx],
  );

  const results = useMemo(
    () =>
      ATTACK_CASES.map((c) => ({
        c,
        r: run(() => c.build(ctx) as never, c.allowedPrograms ?? DEMO_ALLOWED_PROGRAMS),
      })),
    [ctx],
  );

  const refused = results.filter((x) => !x.r.ok).length;

  return (
    <div className="view demo">
      <span className="pill">
        <i className={"dot " + (guardOn ? "done" : "bad")} />
        {guardOn ? `${refused} of ${results.length} attacks refused` : "Guard bypassed — every attack would be signed"}
      </span>

      <h1 style={{ marginTop: 16 }}>What the guard refuses</h1>
      <p className="lede" style={{ maxWidth: 620 }}>
        NEAR's MPC signs whatever bytes it is handed. In hide-recipient mode those bytes are built by
        MagicBlock's API — a third party. Each card below is a transaction such an API could return, run
        through the <b>real guard</b> from <span className="mono">shared/magicblock-guards.ts</span> in this
        page. Nothing is signed, broadcast or sent.
      </p>

      <div className="demo-toggle">
        <div className="seg" role="group" aria-label="Guard">
          <button aria-pressed={guardOn} onClick={() => setGuardOn(true)}>
            <Eye /> Guard on
          </button>
          <button aria-pressed={!guardOn} onClick={() => setGuardOn(false)}>
            <EyeOff /> Guard off
          </button>
        </div>
        <p className="hint">
          {guardOn
            ? "Each transaction is inspected before any signature exists."
            : "This is what a client without the guard does: forward the bytes and let the MPC sign."}
        </p>
      </div>

      <div className={"demo-honest step " + (honest.ok ? "" : "now")}>
        <span className="where">Control</span>
        <h2>{HONEST_CASE.title}</h2>
        <p className="demo-harm">{HONEST_CASE.harm}</p>
        <div className="foot">
          {honest.ok ? (
            <span className="verdict-ok">Accepted — the guard is not simply refusing everything.</span>
          ) : (
            <span className="verdict-bad">Refused: {honest.reason}</span>
          )}
        </div>
      </div>

      <div className="demo-grid">
        {results.map(({ c, r }) => {
          const signed = !guardOn;
          return (
            <div key={c.id} className={"step demo-card " + (signed ? "danger" : "")}>
              <span className="where">{signed ? "Would be signed" : "Refused"}</span>
              <h2>{c.title}</h2>
              <p className="demo-harm">{c.harm}</p>

              <div className="foot">
                {signed ? (
                  <span className="verdict-bad">
                    No check runs. The MPC is asked to sign this, and it will.
                  </span>
                ) : r.ok ? (
                  <span className="verdict-bad">
                    Guard accepted this. That is a bug — please open an issue.
                  </span>
                ) : (
                  <>
                    <span className="verdict-ok">Refused before any signature existed.</span>
                    <button className="ghost demo-why" onClick={() => setOpen(open === c.id ? undefined : c.id)}>
                      {open === c.id ? "Hide the guard's words" : "Show the guard's words"}
                    </button>
                    {open === c.id && <code className="demo-reason">{r.reason}</code>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="verdict" style={{ marginTop: 24 }}>
        <ul>
          <li>
            <b>These are the same cases the test suite asserts.</b> Both the tests and this page import{" "}
            <span className="mono">shared/attack-cases.ts</span>, so the demo cannot drift from what{" "}
            <span className="mono">npm test</span> proves.
          </li>
          <li>
            <b>Not covered here:</b> {SIMULATION_ONLY.length} further checks need a live{" "}
            <span className="mono">simulateTransaction</span> and cannot run offline —{" "}
            {SIMULATION_ONLY.map((s) => s.title).join("; ")}.
          </li>
          <li>
            <b>The guard is not a security boundary.</b> It runs in this page, so whatever controls the page
            controls the guard. It defends against a hostile transaction builder, not a hostile frontend —{" "}
            <a className="link" href="/docs/SECURITY.md" target="_blank" rel="noreferrer">read the security model</a>.
          </li>
          <li>
            <b>Plugging an agent in?</b>{" "}
            <a className="link" href="/docs/INTEGRATING.md" target="_blank" rel="noreferrer">
              Integrating
            </a>{" "}
            covers the one function to call — and the NEAR deposit rule that stops a function-call key from
            reaching the signer at all.
          </li>
        </ul>
      </div>

      <p className="demo-addrs">
        Throwaway addresses for this page load — sender {short(ctx.from)}, attacker {short(ctx.attacker)}. No
        key here can sign anything.
      </p>

      <p style={{ marginTop: 28 }}>
        <a className="btn" href="#/send">Try a real send</a>
      </p>
    </div>
  );
}
