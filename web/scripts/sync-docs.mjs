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
const out = resolve(here, "../public/docs");

const FILES = [
  ["README.md", "README.md"],
  ["docs/INTEGRATING.md", "INTEGRATING.md"],
  ["docs/SECURITY.md", "SECURITY.md"],
  ["docs/next-version.md", "next-version.md"],
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [from, to] of FILES) copyFileSync(resolve(root, from), resolve(out, to));
console.log(`synced ${FILES.length} docs -> web/public/docs`);
