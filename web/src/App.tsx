// First: @solana/web3.js expects a global Buffer before it loads. The app is its own chunk
// (main.tsx), so the polyfill rides with it rather than with the landing.
import "./lib/polyfill";
import { useCallback, useEffect, useState } from "react";
import { deriveSolanaAddress, getConnector, type SigningWallet } from "./lib/near";
import { loadPending } from "./lib/history";
import { resumePending } from "./lib/send";
import Landing from "./components/Landing";
import Demo from "./components/Demo";
import Docs from "./components/Docs";
import Home from "./components/Home";
import Send from "./components/Send";
import Explorer from "./components/Explorer";
import History from "./components/History";
import AccountMenu from "./components/AccountMenu";

export interface Session {
  nearAccount: string;
  solanaAddress: string;
  wallet: SigningWallet;
}

const useHash = () => {
  const [h, setH] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
};

export default function App() {
  const route = useHash();
  const [account, setAccount] = useState<string>();
  const [wallet, setWallet] = useState<SigningWallet>();
  const [address, setAddress] = useState<string>();
  const [err, setErr] = useState<string>();
  const [resumeMsg, setResumeMsg] = useState<string>();

  const adopt = useCallback(async (w: SigningWallet & { getAccounts(): Promise<{ accountId: string }[]> }) => {
    const accts = await w.getAccounts();
    const id = accts[0]?.accountId;
    if (!id) throw new Error("Wallet connected but returned no account");
    setWallet(w);
    setAccount(id);
    setAddress(await deriveSolanaAddress(id));
  }, []);

  // Restore a previous wallet connection + listen for sign-in/out events.
  useEffect(() => {
    let off = () => {};
    getConnector().then(async (c) => {
      await c.whenManifestLoaded;
      const onIn = async (e: { wallet: unknown }) => adopt(e.wallet as never).catch((x) => setErr(String(x)));
      const onOut = () => {
        setWallet(undefined);
        setAccount(undefined);
        setAddress(undefined);
      };
      c.on("wallet:signIn", onIn);
      c.on("wallet:signOut", onOut);
      off = () => {
        c.off("wallet:signIn", onIn);
        c.off("wallet:signOut", onOut);
      };
      try {
        const cur = await c.getConnectedWallet();
        await adopt(cur.wallet as never);
      } catch {
        /* not connected */
      }
    });
    return () => off();
  }, [adopt]);

  // An interrupted send (reload mid-signing) is resumed from the NEAR tx hash.
  useEffect(() => {
    if (!loadPending()) return;
    setResumeMsg("Resuming an interrupted send…");
    resumePending((m) => setResumeMsg(m))
      .then((r) => setResumeMsg(r ? `Resumed send finished (${r.status}).` : undefined))
      .catch((e) => setResumeMsg("Could not resume: " + (e instanceof Error ? e.message : e)));
  }, []);

  const connect = async () => {
    setErr(undefined);
    try {
      const c = await getConnector();
      await c.connect(); // opens the wallet picker; "wallet:signIn" does the rest
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const disconnect = async () => {
    const c = await getConnector();
    await c.disconnect();
  };

  const session: Session | undefined =
    account && address && wallet ? { nearAccount: account, solanaAddress: address, wallet } : undefined;
  const page = route.startsWith("/tx/") ? "tx" : route.slice(1) || "landing";

  // Which top tab is lit: the one whose screen is showing. A receipt, the guard demo and
  // the account page light none; every other route falls through to Send below.
  const tab =
    page === "history" ? "history"
    : page.startsWith("docs") ? "docs"
    : page === "tx" || page === "demo" || (page === "account" && session) ? undefined
    : "send";

  if (page === "landing") return <Landing onEnter={() => (location.hash = "#/send")} />;

  return (
    <div className="frame">
      <nav className="app-nav">
        <div className="nav-left">
          <a className="logo" href="#/">quietsend</a>
          <div className="nav-tabs">
            <a href="#/send" aria-current={tab === "send" ? "page" : undefined}>Send</a>
            <a href="#/history" aria-current={tab === "history" ? "page" : undefined}>History</a>
            <a href="#/docs" aria-current={tab === "docs" ? "page" : undefined}>Docs</a>
          </div>
        </div>
        <div className="nav-right">
          {session ? (
            <AccountMenu session={session} onDisconnect={disconnect} />
          ) : (
            <button className="ghost" onClick={connect}>Connect NEAR wallet</button>
          )}
        </div>
      </nav>

      {err && <p className="err" style={{ margin: "0 auto 16px", maxWidth: 560 }}>{err}</p>}
      {resumeMsg && <p className="log" style={{ margin: "0 auto 16px", maxWidth: 560 }}>{resumeMsg}</p>}

      {page === "tx" ? (
        <Explorer id={route.slice("/tx/".length)} />
      ) : page === "demo" ? (
        <Demo />
      ) : page.startsWith("docs") ? (
        <Docs page={page.slice("docs/".length)} />
      ) : page === "history" ? (
        <History />
      ) : page === "account" && session ? (
        <Home session={session} />
      ) : (
        <Send session={session} onConnect={connect} />
      )}
    </div>
  );
}
