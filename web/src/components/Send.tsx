import { useState } from "react";
import type { Session } from "../App";
import type { Mode } from "../lib/history";
import { isAddr } from "../lib/inspect";
import { classifyRecipient, connection } from "../lib/solana";
import { runSend } from "../lib/send";

export default function Send({ session }: { session: Session }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [mode, setMode] = useState<Mode>("normal");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string>();
  const [warn, setWarn] = useState<string>();

  const lookupRecipient = async (raw: string) => {
    const recipient = raw.trim();
    if (!recipient || !isAddr(recipient)) {
      setWarn(undefined);
      return undefined;
    }
    try {
      const { warning } = await classifyRecipient(connection, recipient);
      setWarn(warning);
      return warning;
    } catch (e) {
      setWarn(undefined);
      console.warn("recipient lookup failed", e);
      return undefined;
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr(undefined);
    setLog([]);
    try {
      const recipient = to.trim();
      if (!isAddr(recipient)) throw new Error("Not a valid Solana address");
      const warning = await lookupRecipient(recipient);
      if (warning) setLog((l) => [...l, "Warning: " + warning]);
      const rec = await runSend(
        { wallet: session.wallet, nearAccount: session.nearAccount, solanaAddress: session.solanaAddress, recipient, amountUi: amount, mode },
        (m) => setLog((l) => [...l, m]),
      );
      location.hash = "#/tx/" + rec.id;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <label>Recipient Solana address</label>
      <input
        value={to}
        onChange={(e) => {
          setTo(e.target.value);
          setWarn(undefined);
        }}
        onBlur={() => void lookupRecipient(to)}
        placeholder="Solana devnet address"
        disabled={busy}
      />
      {warn && <p className="warn">{warn}</p>}
      <label>Amount (USDC)</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
      <label>Mode</label>
      <label style={{ margin: 0 }}>
        <input type="radio" style={{ width: "auto" }} checked={mode === "normal"} onChange={() => setMode("normal")} disabled={busy} /> Normal
        (recipient and amount public)
      </label>
      <label style={{ margin: 0 }}>
        <input type="radio" style={{ width: "auto" }} checked={mode === "hide"} onChange={() => setMode("hide")} disabled={busy} /> Hide
        recipient (MagicBlock, 2 legs, 0.1% fee — hides the direct link, not the amount)
      </label>
      <p>
        <button onClick={submit} disabled={busy || !to}>{busy ? "Working..." : "Send"}</button>
      </p>
      <p><small>You approve one NEAR transaction in your wallet (1 yoctoNEAR deposit to the signer). Approve within about a minute: the Solana blockhash expires.</small></p>
      {log.length > 0 && <div className="log">{log.join("\n")}</div>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
