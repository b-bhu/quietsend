import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import DocsHome from "./DocsHome";

/**
 * Renders the repo's own markdown (synced into public/docs by scripts/sync-docs.mjs),
 * so the site and GitHub read the same text. Agents can fetch the raw files or /llms.txt.
 */
const PAGES: Record<string, { file: string; title: string }> = {
  guide: { file: "/docs/INTEGRATING.md", title: "Developer guide" },
  security: { file: "/docs/SECURITY.md", title: "Security" },
};
const GITHUB = "https://github.com/b-bhu/quietsend/blob/main/";

// Links between docs stay in the app; links to other repo files go to GitHub.
function rewriteLinks(html: string): string {
  return html.replace(/href="([^"#:]+\.md)(#[^"]*)?"/g, (_m, path: string) => {
    const name = path.split("/").pop()!.toLowerCase();
    if (name === "integrating.md") return 'href="#/docs/guide"';
    if (name === "security.md") return 'href="#/docs/security"';
    if (name === "install.md") return 'href="/install.md" target="_blank" rel="noreferrer"';
    return `href="${GITHUB}${path.replace(/^(\.\.\/)+/, "")}" target="_blank" rel="noreferrer"`;
  });
}

// One tab bar for every docs page, so it never moves between them.
const TABS: { href: string; label: string; page?: string; external?: boolean }[] = [
  { href: "#/docs", label: "Overview", page: "" },
  { href: "#/docs/guide", label: "Developer guide", page: "guide" },
  { href: "#/docs/security", label: "Security", page: "security" },
  { href: "/install.md", label: "install.md", external: true },
  { href: "/llms.txt", label: "llms.txt", external: true },
  { href: GITHUB.replace("blob/main/", ""), label: "GitHub", external: true },
];

export default function Docs({ page }: { page: string }) {
  const known = page in PAGES ? page : "";
  return (
    <div className="docs-shell">
      <nav className="docs-tabs" aria-label="Docs">
        {TABS.map((t) =>
          t.external ? (
            <a key={t.href} href={t.href} target="_blank" rel="noreferrer">{t.label}</a>
          ) : (
            <a key={t.href} href={t.href} aria-current={known === t.page ? "page" : undefined}>{t.label}</a>
          ),
        )}
      </nav>
      {known ? <MarkdownDoc page={known} /> : <DocsHome />}
    </div>
  );
}

function MarkdownDoc({ page }: { page: string }) {
  const doc = PAGES[page];
  const [html, setHtml] = useState<string>();
  const [err, setErr] = useState<string>();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    setHtml(undefined);
    setErr(undefined);
    fetch(doc.file)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${doc.file}: ${r.status}`))))
      .then((md) => live && setHtml(rewriteLinks(marked.parse(md, { async: false }) as string)))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    window.scrollTo(0, 0);
    return () => {
      live = false;
    };
  }, [doc.file]);

  // A copy button on every code block.
  useEffect(() => {
    const root = ref.current;
    if (!root || !html) return;
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".copy")) return;
      const b = document.createElement("button");
      b.className = "ghost copy";
      b.textContent = "Copy";
      b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? "");
          b.textContent = "Copied";
          setTimeout(() => (b.textContent = "Copy"), 1200);
        } catch {
          /* clipboard blocked; the text is still selectable */
        }
      };
      pre.appendChild(b);
    });
  }, [html]);

  return (
    <div className="docs">
      {err && <p className="err">{err}</p>}
      {html ? <article ref={ref} className="prose" dangerouslySetInnerHTML={{ __html: html }} /> : !err && <p className="hint">Loading…</p>}
    </div>
  );
}
