import { useEffect, useRef, useState } from "react";
import type { Session } from "../App";

/** The signed-in account as one button; its menu holds the address page and Disconnect. */
export default function AccountMenu({ session, onDisconnect }: { session: Session; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(session.solanaAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked; the address page shows it in full */
    }
  };
  const a = session.solanaAddress;

  return (
    <div className="acct" ref={root}>
      <button className="acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="account">
        <i className="acct-dot" />
        <span className="acct-name">{session.nearAccount}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-head">
            <span className="k">NEAR testnet</span>
            <b>{session.nearAccount}</b>
            <span className="k">Solana address</span>
            <span className="acct-addr">{a.slice(0, 6)}…{a.slice(-6)}</span>
          </div>
          <a role="menuitem" href="#/account" onClick={() => setOpen(false)}>Address and balances</a>
          <button role="menuitem" onClick={copy}>{copied ? "Copied" : "Copy Solana address"}</button>
          <button role="menuitem" className="danger" onClick={() => { setOpen(false); onDisconnect(); }}>Disconnect</button>
        </div>
      )}
    </div>
  );
}
