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

export default function History() {
  const [rows, setRows] = useState(loadHistory());
  useEffect(() => {
    const f = () => setRows(loadHistory());
    window.addEventListener("quietsend:history", f);
    return () => window.removeEventListener("quietsend:history", f);
  }, []);
  if (!rows.length) return <p>No sends yet (history is kept in this browser's localStorage).</p>;
  return (
    <table>
      <thead><tr><th>When</th><th>Mode</th><th>To</th><th>USDC</th><th>Status</th><th /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{Number.isFinite(r.createdAt) ? new Date(r.createdAt).toLocaleString() : "—"}</td>
            <td>{r.mode}</td>
            <td className="mono">{short(r.recipient)}</td>
            <td>{safeUsdc(r.amountBase)}</td>
            <td>{r.status}</td>
            <td><a href={"#/tx/" + r.id}>open</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
