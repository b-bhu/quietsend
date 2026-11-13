import { useEffect, useState } from "react";
import { getRecord, type SendRecord, type Status } from "../lib/history";
import { explorerTx, nearTx, SIGNER_CONTRACT } from "../lib/config";
import { inspectTx, short, type TxView } from "../lib/inspect";
import { formatUsdc } from "../lib/solana";
import { pollLeg2 } from "../lib/send";
import { Eye, EyeOff, Out } from "./icons";

const Row = ({ k, v, tag }: { k: string; v: React.ReactNode; tag?: "public" | "hidden" }) => (
  <div className="row">
    <span className="k">{k}</span>
    <span className="v">{v}</span>
    {tag && (
      <span className={"tag " + tag}>
        {tag === "public" ? <Eye /> : <EyeOff />}
        {tag}
      </span>
    )}
  </div>
);

/** A row for something deliberately NOT in the transaction. Hatched, so absence reads as a feature. */
const Absent = ({ k, v }: { k: string; v: string }) => (
  <div className="row absent">
    <span className="k">{k}</span>
    <span className="v">{v}</span>
    <span className="tag hidden"><EyeOff />hidden</span>
  </div>
);

function useTx(sig?: string) {
  const [v, setV] = useState<TxView>();
  const [err, setErr] = useState<string>();
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
      } catch (e) {
        if (live) setErr(String(e));
      }
    };
    go(0);
    return () => {
      live = false;
    };
  }, [sig]);
  return { v, err };
}

const HEAD: Record<Status, string> = {
  signing: "Sending",
  broadcasting: "Sending",
  "leg1-confirmed": "Sending",
  confirmed: "Sent",
  settled: "Sent",
  failed: "Failed",
};

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
  const appears = (v: TxView | undefined, addr: string) => (v ? (v.accounts.includes(addr) ? "yes" : "no") : "…");
  const done = rec.status === "confirmed" || rec.status === "settled";
  const failed = rec.status === "failed";

  // Card state follows the real status from lib/send.ts.
  const nearState = rec.nearTxHash ? "done" : failed ? "bad" : "now";
  const leg1State = rec.leg1Sig ? "done" : rec.status === "broadcasting" ? "now" : failed ? "bad" : "todo";
  const leg2State = rec.leg2Sig ? "done" : rec.status === "leg1-confirmed" ? "now" : "todo";

  const card = (s: string) => "step" + (s === "todo" ? " todo" : s === "now" ? " now" : "");
  const dot = (s: string) => "dot" + (s === "done" ? " done" : s === "todo" ? " idle" : s === "bad" ? " bad" : "");

  return (
    <div className="view result">
      <span className="pill">
        <i className={dot(failed ? "bad" : done ? "done" : "now")} />
        {failed
          ? "Failed"
          : done
            ? "Done"
            : rec.status === "signing"
              ? "NEAR's nodes are signing"
              : rec.status === "leg1-confirmed"
                ? "Waiting for MagicBlock's payout"
                : "Broadcasting to Solana"}
      </span>

      <h1 style={{ marginTop: 16 }}>{HEAD[rec.status]}</h1>
      <p className="lede">
        {amt} USDC to <span className="mono">{short(rec.recipient)}</span>
      </p>
      {rec.error && <p className="err" style={{ marginTop: 16, maxWidth: 560 }}>{rec.error}</p>}

      <div className="steps" style={{ ["--n" as string]: hide ? 3 : 2 }}>
        <div className={card(nearState)}>
          <span className="where">NEAR</span>
          <h2>You asked NEAR to sign</h2>
          <div className="rows">
            <Row k="Your account" v={rec.nearAccount} tag="public" />
            <Row k="Solana address it controls" v={short(rec.solanaAddress)} tag="public" />
            <Row k="What was signed" v={`sign() on ${SIGNER_CONTRACT}, path ${rec.path}`} tag="public" />
          </div>
          <div className="foot">
            <span>At least 11 of 16 MPC nodes signed. No Solana key exists.</span>
            {rec.nearTxHash && (
              <a href={nearTx(rec.nearTxHash)} target="_blank" rel="noreferrer">
                NearBlocks: {short(rec.nearTxHash)} <Out />
              </a>
            )}
          </div>
        </div>

        <div className={card(leg1State)}>
          <span className="where">Solana{hide ? " · step 1" : ""}</span>
          <h2>{hide ? "You to vault" : "You to recipient"}</h2>
          <div className="rows">
            <Row k="Sender" v={short(rec.solanaAddress)} tag="public" />
            {hide ? (
              <Absent k="Recipient" v="Not in this transaction" />
            ) : (
              <Row k="Recipient" v={short(rec.recipient)} tag="public" />
            )}
            <Row
              k="Amount"
              v={hide ? `${amt} USDC + ${rec.mbFeeTokens ? formatUsdc(rec.mbFeeTokens) : "0.1%"} fee` : `${amt} USDC`}
              tag="public"
            />
            {hide && leg1.v && (
              <Row k="Recipient appears in this tx" v={appears(leg1.v, rec.recipient)} />
            )}
          </div>
          {leg1.err && <p className="err" style={{ marginTop: 12 }}>{leg1.err}</p>}
          <div className="foot">
            {rec.leg1Sig ? (
              <a href={explorerTx(rec.leg1Sig)} target="_blank" rel="noreferrer">
                Solana Explorer: {short(rec.leg1Sig)} <Out />
              </a>
            ) : (
              <span className="wait"><i className={dot(leg1State)} />{leg1State === "now" ? "Broadcasting…" : "Not started"}</span>
            )}
          </div>
        </div>

        {hide && (
          <div className={card(leg2State)}>
            <span className="where">Solana · step 2</span>
            <h2>Vault to recipient</h2>
            <div className="rows">
              <Absent k="Sender" v="Not in this transaction" />
              <Row k="Recipient" v={short(rec.recipient)} tag="public" />
              <Row k="Amount" v={`${amt} USDC`} tag="public" />
              {leg2.v && <Row k="Your address appears in this tx" v={appears(leg2.v, rec.solanaAddress)} />}
            </div>
            {leg2.err && <p className="err" style={{ marginTop: 12 }}>{leg2.err}</p>}
            <div className="foot">
              {rec.leg2Sig ? (
                <>
                  <span>Signed by MagicBlock, not by you.</span>
                  <a href={explorerTx(rec.leg2Sig)} target="_blank" rel="noreferrer">
                    Solana Explorer: {short(rec.leg2Sig)} <Out />
                  </a>
                </>
              ) : (
                <>
                  <span className="wait"><i className={dot(leg2State)} />{leg2State === "now" ? "Waiting for the payout…" : "Not started"}</span>
                  <button
                    className="ghost"
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                    disabled={checking || !rec.leg1Sig}
                    onClick={async () => {
                      setChecking(true);
                      setCheckMsg(undefined);
                      try {
                        const next = await pollLeg2(rec, (m) => setCheckMsg(m), 30_000);
                        setRec({ ...next });
                        if (!next.leg2Sig) setCheckMsg("No payout found in 30 s — try again later.");
                      } finally {
                        setChecking(false);
                      }
                    }}
                  >
                    {checking ? "Checking…" : "Check again"}
                  </button>
                  {checkMsg && <span className="mono" style={{ fontSize: 12 }}>{checkMsg}</span>}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="verdict">
        {hide ? (
          <ul>
            <li><b>Hidden:</b> the direct sender-to-recipient link. Step 1 never names the recipient; step 2 never names you.</li>
            <li><b>Still public:</b> the amount, the timing of the two steps, and the NEAR sign call above.</li>
            <li>A patient observer could match the steps by amount and timing. A random path would not help: the path is in the public NEAR call.</li>
          </ul>
        ) : (
          <ul>
            <li><b>Everything on Solana is public</b> here: sender, recipient and amount.</li>
            <li>What's different is only that no Solana private key exists — a NEAR key authorised the MPC signature.</li>
          </ul>
        )}
      </div>

      <p style={{ marginTop: 28 }}>
        <a className="btn" href="#/send">Send another</a>
      </p>
    </div>
  );
}
