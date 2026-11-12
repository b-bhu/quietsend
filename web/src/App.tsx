import { useCallback, useEffect, useState } from "react";
import { deriveSolanaAddress, getConnector, type SigningWallet } from "./lib/near";
import { loadPending } from "./lib/history";
import { resumePending } from "./lib/send";
import Home from "./components/Home";
import Send from "./components/Send";
import Explorer from "./components/Explorer";
import History from "./components/History";

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
  const [walletsAvailable, setWalletsAvailable] = useState<string[]>([]);
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
      setWalletsAvailable(c.availableWallets.map((w) => w.manifest.name));
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
    setResumeMsg("Resuming an interrupted send...");
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

  const session: Session | undefined = account && address && wallet ? { nearAccount: account, solanaAddress: address, wallet } : undefined;
  const page = route.startsWith("/tx/") ? "tx" : route.slice(1) || "home";

  return (
    <main>
      <h1>quietsend (devnet / testnet)</h1>
      <p style={{ margin: "4px 0" }}>Send Solana USDC with only a NEAR account. No Solana private key is stored anywhere.</p>
      <nav>
        {session ? (
          <>
            <span>
              NEAR account: <b data-testid="account">{session.nearAccount}</b>
            </span>
            <button onClick={disconnect}>Disconnect</button>
          </>
        ) : (
          <button onClick={connect}>Connect NEAR wallet</button>
        )}
        <a className={page === "home" ? "on" : ""} href="#/">Home</a>
        <a className={page === "send" ? "on" : ""} href="#/send">Send</a>
        <a className={page === "history" ? "on" : ""} href="#/history">History</a>
      </nav>
      {!session && walletsAvailable.length > 0 && <small>Testnet wallets offered: {walletsAvailable.join(", ")}</small>}
      {err && <p className="err">{err}</p>}
      {resumeMsg && <p className="log">{resumeMsg}</p>}
      {page === "tx" ? (
        <Explorer id={route.slice("/tx/".length)} />
      ) : page === "history" ? (
        <History />
      ) : !session ? (
        <p>Connect a NEAR testnet wallet to see your derived Solana address.</p>
      ) : page === "send" ? (
        <Send session={session} />
      ) : (
        <Home session={session} />
      )}
    </main>
  );
}
