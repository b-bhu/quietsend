import { useEffect, useState } from "react";
import type { Session } from "../App";
import { DERIVATION_PATH, SIGNER_CONTRACT, explorerAddr } from "../lib/config";
import { formatUsdc, getBalances, type Balances } from "../lib/solana";
import { Copy, Out } from "./icons";

export default function Home({ session }: { session: Session }) {
  const [bal, setBal] = useState<Balances>();
  const [err, setErr] = useState<string>();
  const [copied, setCopied] = useState(false);

  const load = () => {
    setErr(undefined);
    getBalances(session.solanaAddress).then(setBal).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, [session.solanaAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(session.solanaAddress);
    } catch {
      const el = document.querySelector("[data-testid=solana-address]");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="view">
      <h1>Your Solana address</h1>
      <p className="lede">NEAR derived it. No private key for it exists anywhere.</p>

      <div className="addr">
        <span className="k">Solana devnet</span>
        <p className="v" data-testid="solana-address">{session.solanaAddress}</p>
        <div className="acts">
          <button className="ghost" onClick={copy}><Copy />{copied ? "Copied" : "Copy"}</button>
          <a className="ghost" href={explorerAddr(session.solanaAddress)} target="_blank" rel="noreferrer">
            <Out />Explorer
          </a>
        </div>
        <p className="hint" style={{ marginTop: 16, padding: 0 }}>
          Derived by <span className="mono">{SIGNER_CONTRACT}</span> from <b>{session.nearAccount}</b> on path{" "}
          <span className="mono">{DERIVATION_PATH}</span>.
        </p>
      </div>

      {err && <p className="err" style={{ marginTop: 16, maxWidth: 640 }}>Could not load balances — {err}</p>}

      <div className="bal">
        <div>
          <span className="k">USDC</span>
          <p className="v" data-testid="usdc">{bal ? formatUsdc(bal.usdcBase) : "—"}</p>
        </div>
        <div>
          <span className="k">SOL (for fees)</span>
          <p className="v" data-testid="sol">{bal ? bal.sol : "—"}</p>
        </div>
      </div>

      <p style={{ marginTop: 20 }}>
        <button className="ghost" onClick={load}>Refresh</button>
      </p>
    </div>
  );
}
