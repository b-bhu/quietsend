import { useEffect, useState, type ReactNode } from "react";
import { getRecord, type SendRecord } from "../lib/history";
import { explorerTx, nearTx, SIGNER_CONTRACT } from "../lib/config";
import { inspectTx, short, type TxView } from "../lib/inspect";
import { formatUsdc } from "../lib/solana";
import { pollLeg2 } from "../lib/send";

const Pub = ({ children }: { children: ReactNode }) => (
  <li><span className="tag pub">PUBLIC</span> {children}</li>
);
const Hid = ({ children }: { children: ReactNode }) => (
  <li><span className="tag hid">HIDDEN</span> {children}</li>
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
  if (!rec) return <p>Send not found in this browser's history.</p>;
  const hide = rec.mode === "hide";
  const amt = formatUsdc(rec.amountBase);
  const appears = (v: TxView | undefined, addr: string) => (v ? (v.accounts.includes(addr) ? "yes" : "no") : "...");

  return (
    <div>
      <h2>
        {hide ? "Hide recipient (MagicBlock)" : "Normal send"}: {amt} USDC, status <b>{rec.status}</b>
      </h2>
      {rec.error && <p className="err">{rec.error}</p>}
      <div className="cols">
        <div className="card">
          <h3>1. NEAR request</h3>
          {rec.nearTxHash ? <a href={nearTx(rec.nearTxHash)} target="_blank">NearBlocks: {short(rec.nearTxHash)}</a> : <p>no hash yet</p>}
          <ul>
            <Pub>NEAR account <b>{rec.nearAccount}</b> called <code>sign</code> on <code>{SIGNER_CONTRACT}</code></Pub>
            <Pub>derivation path <code>{rec.path}</code> (so anyone can compute {short(rec.solanaAddress)} from the account)</Pub>
            <Pub>the bytes to sign (the Solana message)</Pub>
            <li>no Solana private key is stored on your device — 16 MPC nodes hold shares, and at least 11 must sign together</li>
          </ul>
        </div>

        <div className="card">
          <h3>{hide ? "2. Leg 1: deposit to MagicBlock" : "2. Solana transfer"}</h3>
          {rec.leg1Sig ? <a href={explorerTx(rec.leg1Sig)} target="_blank">Solana Explorer: {short(rec.leg1Sig)}</a> : <p>not broadcast</p>}
          {leg1.err && <p className="err">{leg1.err}</p>}
          <ul>
            <Pub>sender {short(rec.solanaAddress)}</Pub>
            {!hide && <Pub>recipient {short(rec.recipient)} and amount {amt} USDC</Pub>}
            {hide && (
              <>
                <Pub>
                  sender USDC change:{" "}
                  {leg1.v ? leg1.v.usdcChanges.filter((c) => c.owner === rec.solanaAddress).map((c) => formatUsdc(-c.deltaBase)).join(", ") + " USDC out" : "..."}{" "}
                  (amount plus the MagicBlock fee{rec.mbFeeTokens ? `: ${formatUsdc(rec.mbFeeTokens)} USDC` : ""})
                </Pub>
                <Hid>
                  recipient {short(rec.recipient)} appears in this tx: <b data-testid="leg1-has-recipient">{appears(leg1.v, rec.recipient)}</b>
                  {" "}(recipient token account: {appears(leg1.v, rec.recipientAta)})
                </Hid>
              </>
            )}
          </ul>
          {leg1.v && <details><summary>accounts touched ({leg1.v.accounts.length})</summary><div className="mono">{leg1.v.accounts.join("\n")}</div></details>}
        </div>

        {hide && (
          <div className="card">
            <h3>3. Leg 2: payout to recipient</h3>
            {rec.leg2Sig ? (
              <a href={explorerTx(rec.leg2Sig)} target="_blank">Solana Explorer: {short(rec.leg2Sig)}</a>
            ) : (
              <p>
                not seen yet{" "}
                <button
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
                  {checking ? "Checking..." : "Check again"}
                </button>
                {checkMsg && <span className="log" style={{ display: "block", marginTop: 8 }}>{checkMsg}</span>}
              </p>
            )}
            {leg2.err && <p className="err">{leg2.err}</p>}
            <ul>
              <Pub>recipient {short(rec.recipient)} received{" "}
                {leg2.v ? leg2.v.usdcChanges.filter((c) => c.owner === rec.recipient).map((c) => formatUsdc(c.deltaBase)).join(", ") : "..."} USDC
              </Pub>
              <Pub>signed by MagicBlock, not by you: {leg2.v ? leg2.v.signers.map((s) => short(s)).join(", ") : "..."}</Pub>
              <Hid>
                your address {short(rec.solanaAddress)} appears in this tx: <b data-testid="leg2-has-sender">{appears(leg2.v, rec.solanaAddress)}</b>
              </Hid>
            </ul>
          </div>
        )}
      </div>
      <h2>Honest summary</h2>
      <ul>
        {hide ? (
          <>
            <li>Hidden: the direct sender to recipient link on Solana. Leg 1 never names the recipient; leg 2 never names you.</li>
            <li>Still public: the amount (about the same in both legs), the timing of the two legs, and the NEAR sign call above (account and path).</li>
            <li>A patient observer can still match the legs by amount and timing. A random path would not help: the path is in the public NEAR call.</li>
          </>
        ) : (
          <li>Everything on Solana is public: sender, recipient and amount. Only the MPC signing without a Solana key is special here (a NEAR key still authorizes it).</li>
        )}
      </ul>
    </div>
  );
}
