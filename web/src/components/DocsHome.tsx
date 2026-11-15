import { Fragment, useState } from "react";
import { Out } from "./icons";

/**
 * The docs front page: one line to paste into an agent, how it works, how to connect by
 * hand, the MCP tools and the transactions that prove them. The line points at /install,
 * which serves docs/INSTALL.md: the agent reads it and sets itself up
 * (scripts/connect.ts adds quietsend to every AI app on the computer).
 */
const SITE = "https://quietsend.vercel.app";
const INSTALL_LINE = `Set up quietsend from ${SITE}/install`;
const GITHUB = "https://github.com/b-bhu/quietsend";

// Code is split into [text, kind] runs so commands and comments read like a terminal.
type Run = [string, "" | "c" | "s"];
const SETUP: { id: string; label: string; file: string; code: Run[][]; copy: string }[] = [
  {
    id: "all",
    label: "Every app",
    file: "terminal",
    code: [
      [["git clone https://github.com/b-bhu/quietsend && cd quietsend && npm install", ""]],
      [["NEAR_ACCOUNT=", ""], ["you.testnet", "s"], [" npm run connect", ""]],
      [["# finds your AI apps and adds quietsend to each; --dry-run previews, --remove undoes", "c"]],
    ],
    copy: "git clone https://github.com/b-bhu/quietsend && cd quietsend && npm install\nNEAR_ACCOUNT=you.testnet npm run connect",
  },
  {
    id: "claude",
    label: "Claude Code",
    file: "terminal",
    code: [
      [["claude mcp add quietsend -e NEAR_ACCOUNT=", ""], ["you.testnet", "s"], [" -- npx tsx /path/to/quietsend/mcp/server.ts", ""]],
      [["# runs from your checkout, so the agent's key stays on this machine", "c"]],
    ],
    copy: "claude mcp add quietsend -e NEAR_ACCOUNT=you.testnet -- npx tsx /path/to/quietsend/mcp/server.ts",
  },
  {
    id: "json",
    label: "Config file",
    file: "claude_desktop_config.json · .cursor/mcp.json · settings.json",
    code: [
      [["{", ""]],
      [['  "mcpServers": {', ""]],
      [['    "quietsend": {', ""]],
      [['      "command": ', ""], ['"npx"', "s"], [",", ""]],
      [['      "args": [', ""], ['"tsx"', "s"], [", ", ""], ['"/path/to/quietsend/mcp/server.ts"', "s"], ["],", ""]],
      [['      "env": { "NEAR_ACCOUNT": ', ""], ['"you.testnet"', "s"], [" }", ""]],
      [["    }", ""]],
      [["  }", ""]],
      [["}", ""]],
    ],
    copy: `{
  "mcpServers": {
    "quietsend": {
      "command": "npx",
      "args": ["tsx", "/path/to/quietsend/mcp/server.ts"],
      "env": { "NEAR_ACCOUNT": "you.testnet" }
    }
  }
}`,
  },
];

const TOOLS: { group: string; about: string; names: string[] }[] = [
  {
    group: "Wallet",
    about: "The agent's address on Solana or Base, derived from your NEAR account, and its balances. A fee and limit check before any send.",
    names: ["get_address_and_balance", "quote_send"],
  },
  {
    group: "Pay",
    about: "Send USDC on Solana devnet or Base Sepolia, optionally hiding the recipient on Solana. Pay an HTTP 402 endpoint and retry.",
    names: ["send", "fetch_paid"],
  },
  {
    group: "Receipts",
    about: "What a past send made public, what it hid, and the explorer links that show it.",
    names: ["get_receipt"],
  },
];

const FACTS: { title: string; body: string }[] = [
  { title: "Runs on your machine", body: "A local stdio server. Keys sit in a gitignored .keys folder; nothing is hosted." },
  { title: "One budget, two chains", body: "The daily limit counts Solana and Base sends together. Over the cap is refused outright." },
  { title: "Testnet only", body: "Solana devnet and Base Sepolia. The USDC comes from a faucet and is worth nothing." },
];

// Each of these is checked against the live chain by `npm run verify`.
const PROOF: { what: string; chain: string; tx: string; href: string }[] = [
  {
    what: "0.01 USDC sent by an agent, gas paid by the relayer",
    chain: "Base Sepolia",
    tx: "0x9f97ba15…bd75",
    href: "https://sepolia.basescan.org/tx/0x9f97ba15033da937bf1d345a401f5f310a27ac28c1aaa2651a1b1698ce25bd75",
  },
  {
    what: "An HTTP 402 API paid through fetch_paid",
    chain: "Base Sepolia",
    tx: "0x39cf7150…fb53",
    href: "https://sepolia.basescan.org/tx/0x39cf7150062d714d12a51421f67e592c544b41a56f360179440285bfa7ddfb53",
  },
  {
    what: "A send under limits, signed through the contract",
    chain: "Solana devnet",
    tx: "2x4tT2BS…QKVJj4",
    href: "https://explorer.solana.com/tx/2x4tT2BSRLU3pcBerzDcyQGR224S19imdu2xEw2qcDBRDr4vNT1LUCZgXisXkiqwhU4xibNY3YpeZiCGYCQKVJj4?cluster=devnet",
  },
  {
    what: "Hide recipient, first half: you pay the vault, the recipient is absent",
    chain: "Solana devnet",
    tx: "2w2LRuLn…fxKq7",
    href: "https://explorer.solana.com/tx/2w2LRuLninNbG2MbWeCAczuJUaEW9yAxMhVR2GD1JmXEfWdBjvQYDETY6mPMX3uF1WqHPZnUB3CixhvfSLGfxKq7?cluster=devnet",
  },
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

/** ├── 01 HOW IT WORKS ─────────┤ */
function Rule({ n, label }: { n: string; label: string }) {
  return (
    <div className="qs-rule" aria-hidden="true">
      <span className="g">├──</span>
      <span className="l"><b>{n}</b> {label}</span>
      <span className="x" />
      <span className="g">┤</span>
    </div>
  );
}

export default function DocsHome() {
  const { copied, copy } = useCopy();
  const [tab, setTab] = useState(SETUP[0].id);
  const setup = SETUP.find((s) => s.id === tab)!;

  return (
    <div className="qs">
      <header className="qs-hero">
        <h1>Give your agent a wallet with limits.</h1>
        <p className="qs-sub">
          It sends USDC on Solana and Base from your NEAR account. A NEAR contract enforces the limits you set,
          so the agent can't spend past them.
        </p>
        <div className="qs-cta">
          <div className="qs-box qs-install">
            <div className="qs-ihead">Paste this into your AI chat or agent</div>
            <div className="qs-ibody">
              <code>{INSTALL_LINE}</code>
              <button className="qs-brand" onClick={() => copy("hero", INSTALL_LINE)}>{copied === "hero" ? "Copied" : "Copy"}</button>
            </div>
          </div>
          <p className="qs-hint"><i />Testnet only · Solana devnet and Base Sepolia</p>
          <a className="qs-alt" href="#/docs" onClick={(e) => { e.preventDefault(); document.getElementById("manual")?.scrollIntoView({ behavior: "smooth" }); }}>
            Or connect your AI apps yourself →
          </a>
        </div>
      </header>

      <section className="qs-blk">
        <Rule n="01" label="How it works" />
        <h2>Three steps to a paying agent.</h2>
        <p className="qs-lead">You need a NEAR testnet account and its key. Your agent reads the install page and runs the rest.</p>
        <ol className="qs-pipe">
          <li>
            <span className="pn">[1]</span>
            <h3>Give your agent one line</h3>
            <p>Paste it into Claude Code, Codex, Cursor or any agent that runs shell commands.</p>
            <code>{INSTALL_LINE}</code>
          </li>
          <li>
            <span className="pn">[2]</span>
            <h3>It connects your apps</h3>
            <p>It adds quietsend to every AI app it finds, then sets your limits on NEAR and makes the agent's key.</p>
            <code>npm run connect &amp;&amp; npm run setup-agent</code>
          </li>
          <li>
            <span className="pn">[3]</span>
            <h3>Over the limit, it waits</h3>
            <p>Your agent can quote, send and pay HTTP 402 APIs. A send over your limit comes back unsigned until you approve it.</p>
            <code>{'{ "status": "needs_approval", "intentId": "3" }'}</code>
          </li>
        </ol>
      </section>

      <section className="qs-blk" id="manual">
        <Rule n="02" label="Set it up yourself" />
        <h2>One command, or edit the config.</h2>
        <p className="qs-lead">
          quietsend is one local MCP server, <code>quietsend</code>. One command adds it to the AI apps on your computer,
          or add it by hand. Then run <code>npm run setup-agent</code> to set your limits.
        </p>
        <div className="qs-box qs-manual">
          <div className="qs-tabs" role="tablist">
            {SETUP.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === tab} onClick={() => setTab(s.id)}>{s.label}</button>
            ))}
          </div>
          <div className="qs-cbody">
            <div className="qs-code">
              <span className="file">{setup.file}</span>
              <pre>
                {setup.code.map((line, i) => (
                  <Fragment key={i}>
                    {line.map(([t, k], j) => (k ? <span key={j} className={k}>{t}</span> : <Fragment key={j}>{t}</Fragment>))}
                    {"\n"}
                  </Fragment>
                ))}
              </pre>
            </div>
            <button className="qs-copy" onClick={() => copy(setup.id, setup.copy)}>{copied === setup.id ? "Copied" : "Copy"}</button>
          </div>
        </div>
      </section>

      <section className="qs-blk">
        <Rule n="03" label="Tools" />
        <h2>What your agent can do.</h2>
        <p className="qs-lead">The quietsend server exposes these MCP tools.</p>
        <ul className="qs-tree">
          <li className="root">quietsend</li>
          {TOOLS.map((t) => (
            <li key={t.group}>
              <div className="tg">
                <h3>{t.group}</h3>
                <p>{t.about}</p>
                <div className="tl">{t.names.map((n) => <code key={n}>{n}</code>)}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="qs-facts">
          {FACTS.map((f) => (
            <div key={f.title} className="fact"><b>{f.title}</b>{f.body}</div>
          ))}
        </div>
      </section>

      <section className="qs-blk">
        <Rule n="04" label="Proof" />
        <h2>Every claim has a transaction.</h2>
        <p className="qs-lead">
          <code>npm run verify</code> checks each of these against the live chain, with no keys. A 2 USDC send over a
          1 USDC limit came back <code>needs_approval</code>; a 6 USDC send over a 5 USDC cap was refused.
        </p>
        <ul className="qs-proof">
          {PROOF.map((p) => (
            <li key={p.tx}>
              <span className="what">{p.what}</span>
              <span className="chain">{p.chain}</span>
              <a href={p.href} target="_blank" rel="noreferrer">{p.tx}<Out /></a>
            </li>
          ))}
        </ul>
      </section>

      <footer className="qs-foot">
        <a className="logo" href="#/">quietsend</a>
        <div className="fl">
          <a href="#/send">Send</a>
          <a href="#/docs/guide">Developer guide</a>
          <a href="#/docs/security">Security</a>
          <a href="#/demo">Guard demo</a>
          <a href="/install.md" target="_blank" rel="noreferrer">install.md</a>
          <a href="/llms.txt" target="_blank" rel="noreferrer">llms.txt</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
