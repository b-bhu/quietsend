import { useEffect, useState } from "react";
import { loadHistory } from "../lib/history";
import { formatUsdc } from "../lib/solana";
import { short } from "../lib/inspect";

function safeUsdc(base: string) {
  try {
    return formatUsdc(base);
  } catch {
    return "?";
  }
}

const LABEL: Record<string, string> = {
  signing: "Signing",
  broadcasting: "Broadcasting",
  "leg1-confirmed": "Waiting for payout",
  confirmed: "Sent",
  settled: "Sent",
  failed: "Failed",
};

export default function History() {
  const [rows, setRows] = useState(loadHistory());
  useEffect(() => {
    const f = () => setRows(loadHistory());
    window.addEventListener("quietsend:history", f);
    return () => window.removeEventListener("quietsend:history", f);
  }, []);

  return (
    <div className="view">
      <h1>History</h1>
      <p className="lede">Kept in this browser only.</p>

      {!rows.length ? (
        <p className="empty">No sends yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>When</th><th>Mode</th><th>To</th><th>USDC</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{Number.isFinite(r.createdAt) ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                <td>{r.mode === "hide" ? "Hide recipient" : "Normal"}</td>
                <td className="mono">{short(r.recipient)}</td>
                <td className="strong">{safeUsdc(r.amountBase)}</td>
                <td>{LABEL[r.status] ?? r.status}</td>
                <td><a className="link" href={"#/tx/" + r.id}>Open</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
