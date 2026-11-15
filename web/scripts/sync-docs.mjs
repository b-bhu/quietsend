/**
 * Copy the docs the site serves into web/public/docs, so /docs/*.md and the
 * links in llms.txt resolve for a reader or an agent.
 *
 * Runs before `npm run dev` and `npm run build`, so the served copies cannot
 * drift from the ones in the repo. Never edit web/public/docs by hand.
 */
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const pub = resolve(here, "../public");
const out = resolve(pub, "docs");

const FILES = [
  ["README.md", "docs/README.md"],
  ["docs/INTEGRATING.md", "docs/INTEGRATING.md"],
  ["docs/SECURITY.md", "docs/SECURITY.md"],
  ["docs/next-version.md", "docs/next-version.md"],
  ["docs/INSTALL.md", "docs/INSTALL.md"],
  // "Set up quietsend from https://quietsend.vercel.app/install" points an agent here.
  ["docs/INSTALL.md", "install.md"],
  // The canonical agent entry point lives at the repo root; serve it at /llms.txt.
  ["llms.txt", "llms.txt"],
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [from, to] of FILES) {
  const dest = resolve(pub, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(resolve(root, from), dest);
}
console.log(`synced ${FILES.length} files -> web/public`);
