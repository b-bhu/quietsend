import { useEffect, useState } from "react";
import { getRecord, type SendRecord, type Status } from "../lib/history";
import { explorerTx, nearTx } from "../lib/config";
import { inspectTx, short, type TxView } from "../lib/inspect";
import { formatUsdc } from "../lib/solana";
import { pollLeg2 } from "../lib/send";
import { Out } from "./icons";

function useTx(sig?: string) {
  const [v, setV] = useState<TxView>();
  useEffect(() => {
    setV(undefined);
    if (!sig) return;
    let live = true;
    const go = async (n: number) => {
      try {
        const r = await inspectTx(sig);
        if (!live) return;
        if (r) setV(r);
        else if (n < 5) setTimeout(() => go(n + 1), 2500);
      } catch {
        /* the explorer link still works; the on-chain check is a bonus */
      }
    };
    go(0);
    return () => {
      live = false;
    };
  }, [sig]);
  return v;
}

const HEAD: Record<Status, string> = {
  signing: "Sending",
  broadcasting: "Sending",
  "leg1-confirmed": "Sending",
  confirmed: "Sent",
  settled: "Sent",
  failed: "Failed",
};

type StepState = "done" | "now" | "todo" | "bad";

function Step({ state, title, sub, href, hash }: { state: StepState; title: string; sub?: string; href?: string; hash?: string }) {
  return (
    <li className={"trail-step " + state}>
      <i className={"dot" + (state === "done" ? " done" : state === "todo" ? " idle" : state === "bad" ? " bad" : "")} />
      <div className="trail-main">
        <span className="trail-title">{title}</span>
        {sub && <span className="trail-sub">{sub}</span>}
      </div>
      {href && hash ? (
        <a className="trail-link" href={href} target="_blank" rel="noreferrer">
          {short(hash)} <Out />
        </a>
      ) : (
        <span className="trail-link muted">{state === "now" ? "…" : ""}</span>
      )}
    </li>
  );
}

export default function Explorer({ id }: { id: string }) {
  const [rec, setRec] = useState<SendRecord | undefined>(getRecord(id));
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string>();
  useEffect(() => {
    setRec(getRecord(id));
    const f = () => setRec(getRecord(id));
    window.addEventListener("quietsend:history", f);
    return () => window.removeEventListener("quietsend:history", f);
  }, [id]);

  const leg1 = useTx(rec?.leg1Sig);
  const leg2 = useTx(rec?.leg2Sig);

  if (!rec) {
    return (
      <div className="view">
        <h1>Not found</h1>
        <p className="empty">This send isn't in this browser's history.</p>
        <p style={{ marginTop: 20 }}><a className="link" href="#/send">Send something →</a></p>
      </div>
    );
  }

  const hide = rec.mode === "hide";
  const amt = formatUsdc(rec.amountBase);
  const done = rec.status === "confirmed" || rec.status === "settled";
  const failed = rec.status === "failed";

  // Step state follows the real status from lib/send.ts.
  const nearState: StepState = rec.nearTxHash ? "done" : failed ? "bad" : "now";
  const leg1State: StepState = rec.leg1Sig ? "done" : failed ? "bad" : rec.status === "broadcasting" ? "now" : "todo";
  const leg2State: StepState = rec.leg2Sig ? "done" : rec.status === "leg1-confirmed" ? "now" : "todo";

  // On-chain check, shown only once both legs are fetched: neither names the other side.
  const unlinked =
    hide && leg1 && leg2 && !leg1.accounts.includes(rec.recipient) && !leg2.accounts.includes(rec.solanaAddress);

  return (
    <div className="view result">
      <h1>{HEAD[rec.status]}</h1>
      <p className="lede">
        {amt} USDC to <span className="mono">{short(rec.recipient)}</span>
        {hide && <span className="quiet-tag">recipient hidden</span>}
      </p>
      {rec.error && <p className="err" style={{ marginTop: 16, maxWidth: 520 }}>{rec.error}</p>}

      <ol className="trail">
        <Step
          state={nearState}
          title="Signed with NEAR"
          sub={rec.nearAccount}
          href={rec.nearTxHash ? nearTx(rec.nearTxHash) : undefined}
          hash={rec.nearTxHash}
        />
        <Step
          state={leg1State}
          title={hide ? "To MagicBlock's vault" : "To recipient"}
          sub={hide && rec.mbFeeTokens ? `${amt} USDC + ${formatUsdc(rec.mbFeeTokens)} fee` : `${amt} USDC`}
          href={rec.leg1Sig ? explorerTx(rec.leg1Sig) : undefined}
          hash={rec.leg1Sig}
        />
        {hide && (
          <Step
            state={leg2State}
            title="Vault to recipient"
            sub={`${amt} USDC`}
            href={rec.leg2Sig ? explorerTx(rec.leg2Sig) : undefined}
            hash={rec.leg2Sig}
          />
        )}
      </ol>

      {hide && rec.leg1Sig && !rec.leg2Sig && !failed && (
        <p className="trail-note">
          <button
            className="ghost"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              setCheckMsg(undefined);
              try {
                const next = await pollLeg2(rec, (m) => setCheckMsg(m), 30_000);
                setRec({ ...next });
                if (!next.leg2Sig) setCheckMsg("No payout yet. Try again in a minute.");
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking ? "Checking…" : "Check for payout"}
          </button>
          {checkMsg && <span className="trail-sub" style={{ marginLeft: 10 }}>{checkMsg}</span>}
        </p>
      )}

      {done && (
        <p className="trail-note">
          {hide
            ? unlinked
              ? "Checked on Solana: no transaction contains both your address and the recipient's. The amount and timing are public."
              : "No Solana transaction contains both your address and the recipient's. The amount and timing are public."
            : "A normal Solana transfer: sender, recipient and amount are public."}
        </p>
      )}

      <p className="trail-actions">
        <a className="btn" href="#/send">Send another</a>
        <a className="link" href="#/history">History</a>
      </p>
    </div>
  );
}
