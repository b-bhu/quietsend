import { useEffect, useState } from "react";
import type { Session } from "../App";
import { DERIVATION_PATH, SIGNER_CONTRACT, explorerAddr } from "../lib/config";
import { formatUsdc, getBalances, type Balances } from "../lib/solana";

export default function Home({ session }: { session: Session }) {
  const [bal, setBal] = useState<Balances>();
  const [err, setErr] = useState<string>();
  const [copied, setCopied] = useState(false);
  const load = () => {
    setErr(undefined);
    getBalances(session.solanaAddress).then(setBal).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    load();
  }, [session.solanaAddress]); // eslint-disable-line react-hooks/exhaustive-deps
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
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Your Solana devnet address</h2>
      <p className="mono" data-testid="solana-address">{session.solanaAddress}</p>
      <button onClick={copy}>{copied ? "Copied!" : "Copy"}</button>{" "}
      <a href={explorerAddr(session.solanaAddress)} target="_blank">Explorer</a>
      <p>
        Derived by <code>{SIGNER_CONTRACT}</code> from <b>{session.nearAccount}</b> + path <code>{DERIVATION_PATH}</code>.
      </p>
      <h2>Balances</h2>
      {err && <p className="err">Could not load balances — {err}</p>}
      {bal ? (
        <table>
          <tbody>
            <tr><td>SOL</td><td data-testid="sol">{bal.sol}</td></tr>
            <tr><td>USDC (Circle devnet)</td><td data-testid="usdc">{formatUsdc(bal.usdcBase)}</td></tr>
          </tbody>
        </table>
      ) : err ? null : (
        <p>Loading...</p>
      )}
      <button onClick={load}>Refresh</button>
    </div>
  );
}
