import { useEffect, useState } from "react";
import type { Session } from "../App";
import type { Mode } from "../lib/history";
import { isAddr } from "../lib/inspect";
import { classifyRecipient, connection, formatUsdc, getBalances, type Balances } from "../lib/solana";
import { runSend } from "../lib/send";
import { Arrow, Eye, EyeOff } from "./icons";

export default function Send({ session, onConnect }: { session?: Session; onConnect: () => void }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>("normal");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string>();
  const [warn, setWarn] = useState<string>();
  const [bal, setBal] = useState<Balances>();

  useEffect(() => {
    setBal(undefined);
    if (!session) return;
    let live = true;
    getBalances(session.solanaAddress)
      .then((b) => live && setBal(b))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [session?.solanaAddress]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const amt = parseFloat(amount) || 0;
  const ready = !!session && !!to.trim() && amt > 0;
  const label = !session
    ? "Connect NEAR wallet"
    : busy
      ? "Working…"
      : !to.trim()
        ? "Enter a recipient"
        : !(amt > 0)
          ? "Enter an amount"
          : `Send ${amt.toFixed(2)} USDC`;

  const submit = async () => {
    if (!session) return onConnect();
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
    <div className="view">
      <h1>Send USDC</h1>

      <div className="form">
        {session ? (
          <div className="account">
            <span data-testid="account">{session.nearAccount}</span>
            <span>{bal ? <><b>{formatUsdc(bal.usdcBase)}</b> USDC available</> : "loading balance…"}</span>
          </div>
        ) : (
          <div className="account">
            <span>Not connected</span>
            <span>Connect to see your balance</span>
          </div>
        )}

        <p className="on-chain"><i />Sending on Solana devnet</p>

        <div className="field">
          <input
            className="mono"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setWarn(undefined);
            }}
            onBlur={() => void lookupRecipient(to)}
            placeholder="Recipient's Solana address"
            aria-label="Recipient's Solana address"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>

        <div className="amount">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            aria-label="Amount in USDC"
            inputMode="decimal"
            autoComplete="off"
            disabled={busy}
          />
          <span className="unit">USDC</span>
        </div>

        <div className="seg" role="group" aria-label="Privacy mode">
          <button type="button" aria-pressed={mode === "normal"} onClick={() => setMode("normal")} disabled={busy}>
            Normal
          </button>
          <button type="button" aria-pressed={mode === "hide"} onClick={() => setMode("hide")} disabled={busy}>
            Hide recipient
          </button>
        </div>

        <p className="shows">
          {mode === "hide" ? (
            <>
              <span className="tag hidden"><EyeOff />Hidden</span>
              <span>Who you paid. The amount and time still show.</span>
            </>
          ) : (
            <>
              <span className="tag public"><Eye />Public</span>
              <span>Who you paid, how much and when.</span>
            </>
          )}
        </p>

        {mode === "hide" && <p className="hint">Two transfers through MagicBlock, plus a 0.1% fee.</p>}
        {warn && <p className="warn">{warn}</p>}

        <button className="btn block" onClick={submit} disabled={busy || (!!session && !ready)}>
          {label} {ready && !busy && <Arrow />}
        </button>

        <p className="hint">
          You approve one NEAR transaction in your wallet. Approve within about a minute: the Solana blockhash expires.
        </p>

        {log.length > 0 && <div className="log">{log.join("\n")}</div>}
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}
