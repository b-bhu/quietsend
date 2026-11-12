import { useEffect, useState } from "react";
import type { Session } from "../App";
import { DERIVATION_PATH, SIGNER_CONTRACT, explorerAddr } from "../lib/config";
import { formatUsdc, getBalances, type Balances } from "../lib/solana";

export default function Home({ session }: { session: Session }) {
  const [bal, setBal] = useState<Balances>();
  const [err, setErr] = useState<string>();
  const load = () => getBalances(session.solanaAddress).then(setBal).catch((e) => setErr(String(e)));
  useEffect(() => {
    load();
  }, [session.solanaAddress]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Your Solana devnet address</h2>
      <p className="mono" data-testid="solana-address">{session.solanaAddress}</p>
      <button onClick={() => navigator.clipboard.writeText(session.solanaAddress)}>Copy</button>{" "}
      <a href={explorerAddr(session.solanaAddress)} target="_blank">Explorer</a>
      <p>
        Derived by <code>{SIGNER_CONTRACT}</code> from <b>{session.nearAccount}</b> + path <code>{DERIVATION_PATH}</code>.
      </p>
      <h2>Balances</h2>
      {err && <p className="err">{err}</p>}
      {bal ? (
        <table>
          <tbody>
            <tr><td>SOL</td><td data-testid="sol">{bal.sol}</td></tr>
            <tr><td>USDC (Circle devnet)</td><td data-testid="usdc">{formatUsdc(bal.usdcBase)}</td></tr>
          </tbody>
        </table>
      ) : (
        <p>Loading...</p>
      )}
      <button onClick={load}>Refresh</button>
    </div>
  );
}
