import { useEffect, useRef, useState, type ReactNode } from "react";
import { Arrow, Copy } from "./icons";

/**
 * The docs front page: one line to paste into an agent, how it works, how to connect by
 * hand, and the MCP tools. The line points at /install, which serves docs/INSTALL.md:
 * the agent reads it and sets itself up (scripts/connect.ts adds every local AI app).
 */
const SITE = "https://quietsend.vercel.app";
const INSTALL_LINE = `Set up quietsend from ${SITE}/install`;
const APPS = ["Claude Code", "Claude Desktop", "Cursor", "Windsurf", "VS Code", "Codex", "Gemini CLI"];

const SETUP: { id: string; label: string; file: string; code: string; note: string }[] = [
  {
    id: "all",
    label: "Every app",
    file: "terminal",
    code: `git clone https://github.com/b-bhu/quietsend && cd quietsend && npm install
NEAR_ACCOUNT=you.testnet npm run connect
# finds your AI apps and adds quietsend to each; --dry-run to preview`,
    note: "Backs up each config it changes and skips a file it cannot parse. Undo with npm run connect -- --remove.",
  },
  {
    id: "claude",
    label: "Claude Code",
    file: "terminal",
    code: `claude mcp add quietsend -e NEAR_ACCOUNT=you.testnet -- npx tsx /path/to/quietsend/mcp/server.ts`,
    note: "Runs from your checkout of the repo, so your keys stay on this machine.",
  },
  {
    id: "json",
    label: "Config file",
    file: "mcp.json",
    code: `{
  "mcpServers": {
    "quietsend": {
      "command": "npx",
      "args": ["tsx", "/path/to/quietsend/mcp/server.ts"],
      "env": { "NEAR_ACCOUNT": "you.testnet" }
    }
  }
}`,
    note: "Claude Desktop, Cursor, Windsurf, Gemini CLI. VS Code uses \"servers\" instead of \"mcpServers\".",
  },
];

const TOOLS: { group: string; about: string; names: string[] }[] = [
  {
    group: "Wallet",
    about: "The agent's address on Solana or Base, derived from your NEAR account, with its balances. A fee and limit check before any send.",
    names: ["get_address_and_balance", "quote_send"],
  },
  {
    group: "Pay",
    about: "Send USDC on Solana devnet or Base Sepolia, optionally hiding the recipient on Solana. Pay an HTTP 402 endpoint and retry.",
    names: ["send", "fetch_paid"],
  },
  {
    group: "Proof",
    about: "A receipt for a past send: what was public, what was hidden, and the explorer links that show it.",
    names: ["get_receipt"],
  },
];

const HOLDS: { k: string; title: string; body: string }[] = [
  { k: "limits", title: "Limits held on-chain", body: "Per-send, daily and a hard cap, enforced by policy.quietsend.testnet. The agent's key cannot change them." },
  { k: "gas", title: "Gasless on Base", body: "The paying address holds USDC only. A relayer pays gas and cannot change the amount or recipient." },
  { k: "hide", title: "Hide who you paid", body: "On Solana, MagicBlock splits the payment so no single transaction links you to the recipient." },
  { k: "402", title: "Pays for APIs", body: "fetch_paid settles x402 exact payments in USDC on Base Sepolia, inside the same limits." },
];

function useCopy() {
  const [copied, setCopied] = useState<string>();
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? undefined : c)), 1400);
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  };
  return { copied, copy };
}

function Section({ n, label, id, children }: { n: string; label: string; id?: string; children: ReactNode }) {
  return (
    <section className="dh-sec" id={id}>
      <div className="dh-label" aria-hidden="true">
        <span className="dh-rule" />
        <span>{n}</span>
        <span>{label}</span>
        <span className="dh-rule" />
      </div>
      {children}
    </section>
  );
}

/** Adds "play" to an element the first time it scrolls into view. */
function usePlayOnView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.classList.add("play");
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function DocsHome() {
  const { copied, copy } = useCopy();
  const term = usePlayOnView<HTMLDivElement>();
  const [tab, setTab] = useState(SETUP[0].id);
  const setup = SETUP.find((s) => s.id === tab)!;

  return (
    <div className="dh">
      <header className="dh-hero">
        <span className="dh-badge"><i />Testnet · Solana devnet · Base Sepolia</span>
        <h1>Give your agent<br />a wallet with limits.</h1>
        <p className="dh-lede">
          It sends USDC from your NEAR account. A contract holds the limits, and no Solana or Ethereum key exists anywhere.
        </p>

        <div className="dh-paste">
          <div className="dh-paste-top">
            <span>Paste this into your AI chat or agent</span>
          </div>
          <div className="dh-paste-row">
            <code>{INSTALL_LINE}</code>
            <button className="dh-copy" onClick={() => copy("hero", INSTALL_LINE)}>
              {copied === "hero" ? "Copied" : <><Copy />Copy</>}
            </button>
          </div>
        </div>
        <p className="dh-apps">Works with {APPS.join(" · ")}</p>
        <a className="link dh-alt" href="#/docs" onClick={(e) => { e.preventDefault(); document.getElementById("setup")?.scrollIntoView({ behavior: "smooth" }); }}>
          Or connect every AI app on this computer yourself <Arrow />
        </a>
      </header>

      <Section n="01" label="How it works">
        <h2 className="dh-h2">Three steps to a paying agent.</h2>
        <p className="dh-sub">No wallet to install, no seed phrase, no config to edit. Your agent reads the install page and does the setup.</p>
        <div className="dh-steps">
          <article className="dh-step">
            <span className="dh-num">[1]</span>
            <h3>Give your agent one line</h3>
            <p>Paste it into Claude Code, Codex, Cursor or any agent that runs shell commands.</p>
            <div className="dh-vis"><code className="dh-line">{INSTALL_LINE}</code></div>
          </article>
          <article className="dh-step">
            <span className="dh-num">[2]</span>
            <h3>It connects your AI apps</h3>
            <p>It finds every AI app on this computer and adds quietsend to each one. Then it sets your limits on NEAR.</p>
            <div ref={term} className="dh-vis dh-term" aria-label="npm run connect output">
              <span className="dim">$ npm run connect</span>
              <span><b>✓</b> Claude Desktop <em>added</em></span>
              <span><b>✓</b> Cursor <em>added</em></span>
              <span><b>✓</b> Claude Code <em>added</em></span>
              <span><b>✓</b> limits 1 · 3 · 5 USDC</span>
            </div>
          </article>
          <article className="dh-step">
            <span className="dh-num">[3]</span>
            <h3>Your agent can pay</h3>
            <p>In any of those apps it can send, quote, and pay for APIs. Anything over the limits waits for your approval.</p>
            <div className="dh-vis dh-chat">
              <span className="me">&gt; pay 0.5 USDC to 7snf…nt27 on Solana</span>
              <span className="ok"><i />sent · within your limits</span>
            </div>
          </article>
        </div>
      </Section>

      <Section n="02" label="Set it up yourself" id="setup">
        <h2 className="dh-h2">One command, or edit the config.</h2>
        <p className="dh-sub">
          quietsend is one local MCP server, <code>quietsend</code>. One command adds it to the AI apps on your computer, or add it by hand.
          It runs over stdio, so the agent's key never leaves your machine.
        </p>
        <div className="dh-card">
          <div className="dh-tabs" role="tablist">
            {SETUP.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === tab} onClick={() => setTab(s.id)}>{s.label}</button>
            ))}
            <span className="dh-file">{setup.file}</span>
          </div>
          <div className="dh-code">
            <pre><code>{setup.code}</code></pre>
            <button className="ghost dh-codecopy" onClick={() => copy(setup.id, setup.code)}>{copied === setup.id ? "Copied" : "Copy"}</button>
          </div>
          <p className="dh-note">{setup.note}</p>
        </div>
        <p className="dh-sub dh-after">
          Then give the agent its key and limits: <code>NEAR_ACCOUNT=you.testnet npm run setup-agent</code>.
          The <a href="#/docs/guide">developer guide</a> has the details.
        </p>
      </Section>

      <Section n="03" label="Tools">
        <h2 className="dh-h2">What your agent can do.</h2>
        <p className="dh-sub">The quietsend server exposes these MCP tools.</p>
        <div className="dh-tools">
          {TOOLS.map((t) => (
            <article key={t.group} className="dh-tool">
              <h3>{t.group}</h3>
              <p>{t.about}</p>
              <div className="dh-chips">{t.names.map((n) => <code key={n}>{n}</code>)}</div>
            </article>
          ))}
        </div>
        <div className="dh-holds">
          {HOLDS.map((h) => (
            <div key={h.k}>
              <h3>{h.title}</h3>
              <p>{h.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section n="04" label="Read more">
        <div className="dh-more">
          <a href="#/docs/guide"><b>Developer guide</b><span>Setup, tools, limits, approvals, errors</span><Arrow /></a>
          <a href="#/docs/security"><b>Security</b><span>What the guard and the contract protect against</span><Arrow /></a>
          <a href="/install.md" target="_blank" rel="noreferrer"><b>install.md</b><span>The steps your agent follows</span><Arrow /></a>
          <a href="/llms.txt" target="_blank" rel="noreferrer"><b>llms.txt</b><span>The whole project, for agents</span><Arrow /></a>
        </div>
      </Section>
    </div>
  );
}
