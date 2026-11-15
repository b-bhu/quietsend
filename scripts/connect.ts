// Add the quietsend MCP server to every AI app on this computer.
//
//   NEAR_ACCOUNT=you.testnet npm run connect            # finds your AI apps and adds quietsend
//   npm run connect -- --account you.testnet --dry-run  # show what would change, write nothing
//   npm run connect -- --only cursor,claude-desktop     # just these apps
//   npm run connect -- --remove                         # take quietsend out again
//
// It looks for Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex and Gemini CLI,
// and touches only the apps that are installed. Each config file is backed up next to
// itself (<file>.quietsend.bak) before it is changed, and a file it cannot parse is left
// alone. The server runs locally over stdio, so no key leaves this machine: the configs
// hold only the NEAR account name and the path to mcp/server.ts.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { hasPolicyKey, ROOT } from "../mcp/keys.ts";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const DRY = flag("dry-run");
const REMOVE = flag("remove");
const ONLY = opt("only")?.split(",").map((s) => s.trim());
const account = opt("account") ?? process.env.NEAR_ACCOUNT;
if (!account && !REMOVE) {
  console.error("Set your NEAR testnet account: NEAR_ACCOUNT=you.testnet npm run connect");
  process.exit(1);
}

const NAME = "quietsend";
// Absolute node + tsx, so apps launched from the Dock (no shell PATH, no nvm) can start it.
const command = process.execPath;
const args = [resolve(ROOT, "node_modules/tsx/dist/cli.mjs"), resolve(ROOT, "mcp/server.ts")];
const env = { NEAR_ACCOUNT: account ?? "" };
if (!existsSync(args[0])) {
  console.error("tsx is missing. Run `npm install` in the quietsend folder first.");
  process.exit(1);
}

const home = homedir();
const os = platform();
const appData = os === "win32" ? process.env.APPDATA ?? join(home, "AppData/Roaming") : "";
const appSupport =
  os === "darwin" ? join(home, "Library/Application Support") : os === "win32" ? appData : join(home, ".config");

type Result = "added" | "updated" | "removed" | "unchanged" | "absent" | "skipped";
interface App {
  id: string;
  name: string;
  /** The folder whose presence means the app is installed. */
  installed: () => boolean;
  apply: () => Result;
  where: string;
}

/** Back up, then write. In a dry run, only report. */
function write(file: string, text: string) {
  if (DRY) return;
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) copyFileSync(file, `${file}.quietsend.bak`);
  writeFileSync(file, text);
}

/** Apps whose config is JSON with the servers under one key (mcpServers, or servers in VS Code). */
function jsonApp(id: string, name: string, dir: string, file: string, key: "mcpServers" | "servers", typed = false): App {
  const path = join(dir, file);
  return {
    id,
    name,
    where: path,
    installed: () => existsSync(dir),
    apply() {
      let cfg: Record<string, unknown> = {};
      if (existsSync(path)) {
        const raw = readFileSync(path, "utf8").trim();
        if (raw) {
          try {
            cfg = JSON.parse(raw);
          } catch {
            return "skipped"; // JSON with comments, or broken: never rewrite what we cannot read
          }
        }
      }
      const servers = (cfg[key] ?? {}) as Record<string, unknown>;
      const before = JSON.stringify(servers[NAME]);
      if (REMOVE) {
        if (!(NAME in servers)) return "absent";
        delete servers[NAME];
      } else {
        servers[NAME] = typed ? { type: "stdio", command, args, env } : { command, args, env };
      }
      if (!REMOVE && before === JSON.stringify(servers[NAME])) return "unchanged";
      cfg[key] = servers;
      write(path, JSON.stringify(cfg, null, 2) + "\n");
      return REMOVE ? "removed" : before ? "updated" : "added";
    },
  };
}

/** Codex keeps MCP servers in TOML: replace our own [mcp_servers.quietsend] table, keep the rest. */
function codexApp(): App {
  const dir = join(home, ".codex");
  const path = join(dir, "config.toml");
  const header = `[mcp_servers.${NAME}]`;
  return {
    id: "codex",
    name: "Codex",
    where: path,
    installed: () => existsSync(dir),
    apply() {
      const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
      const lines = raw.split("\n");
      const start = lines.findIndex((l) => l.trim() === header || l.trim().startsWith(`[mcp_servers.${NAME}.`));
      let end = start;
      if (start >= 0) {
        end = start + 1;
        while (end < lines.length && !(lines[end].trim().startsWith("[") && !lines[end].trim().startsWith(`[mcp_servers.${NAME}`))) end++;
      }
      const old = start >= 0 ? lines.slice(start, end).join("\n").trim() : "";
      const block = [
        header,
        `command = ${JSON.stringify(command)}`,
        `args = [${args.map((a) => JSON.stringify(a)).join(", ")}]`,
        `env = { NEAR_ACCOUNT = ${JSON.stringify(env.NEAR_ACCOUNT)} }`,
      ].join("\n");
      if (REMOVE && start < 0) return "absent";
      if (!REMOVE && old === block) return "unchanged";
      const kept = start >= 0 ? [...lines.slice(0, start), ...lines.slice(end)] : lines;
      let text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
      if (!REMOVE) text = (text ? text + "\n\n" : "") + block;
      write(path, text + "\n");
      return REMOVE ? "removed" : start >= 0 ? "updated" : "added";
    },
  };
}

/** Claude Code has its own CLI; use it rather than editing ~/.claude.json by hand. */
function claudeCodeApp(): App {
  const which = () => {
    try {
      return execFileSync(os === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" }).trim().split("\n")[0];
    } catch {
      return "";
    }
  };
  const run = (a: string[]) => execFileSync("claude", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return {
    id: "claude-code",
    name: "Claude Code",
    where: "claude mcp (user scope)",
    installed: () => !!which(),
    apply() {
      let present = false;
      try {
        run(["mcp", "get", NAME]);
        present = true;
      } catch {
        /* not added yet */
      }
      if (REMOVE && !present) return "absent";
      if (DRY) return REMOVE ? "removed" : present ? "updated" : "added";
      if (present) run(["mcp", "remove", NAME, "--scope", "user"]);
      if (!REMOVE) run(["mcp", "add", "--scope", "user", NAME, "-e", `NEAR_ACCOUNT=${env.NEAR_ACCOUNT}`, "--", command, ...args]);
      return REMOVE ? "removed" : present ? "updated" : "added";
    },
  };
}

const vscodeUser = join(appSupport, "Code/User");
const APPS: App[] = [
  claudeCodeApp(),
  jsonApp("claude-desktop", "Claude Desktop", join(appSupport, "Claude"), "claude_desktop_config.json", "mcpServers"),
  jsonApp("cursor", "Cursor", join(home, ".cursor"), "mcp.json", "mcpServers"),
  jsonApp("windsurf", "Windsurf", join(home, ".codeium/windsurf"), "mcp_config.json", "mcpServers"),
  jsonApp("vscode", "VS Code", vscodeUser, "mcp.json", "servers", true),
  codexApp(),
  jsonApp("gemini", "Gemini CLI", join(home, ".gemini"), "settings.json", "mcpServers"),
];

const VERB: Record<Result, string> = {
  added: "added",
  updated: "updated",
  removed: "removed",
  unchanged: "already set",
  absent: "not there",
  skipped: "has comments or is not JSON; left alone, add it by hand",
};

console.log(
  `${DRY ? "[dry run] " : ""}${REMOVE ? "Removing quietsend from" : `Connecting quietsend (${account}) to`} your AI apps\n`,
);
let touched = 0;
let found = 0;
for (const app of APPS) {
  if (ONLY && !ONLY.includes(app.id)) continue;
  if (!app.installed()) {
    console.log(`  · ${app.name.padEnd(15)} not installed`);
    continue;
  }
  found++;
  try {
    const r = app.apply();
    if (r === "added" || r === "updated" || r === "removed") touched++;
    console.log(`  ${r === "skipped" ? "!" : "✓"} ${app.name.padEnd(15)} ${VERB[r].padEnd(12)} ${app.where}`);
  } catch (e) {
    console.log(`  ! ${app.name.padEnd(15)} failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}

console.log("");
if (!found) {
  console.log("No supported AI app found. See https://quietsend.vercel.app/#/docs for the config to add by hand.");
} else if (DRY) {
  console.log(`Dry run: ${touched} app(s) would change. Run again without --dry-run to write.`);
} else if (REMOVE) {
  console.log(`Removed from ${touched} app(s). Backups are next to each file as *.quietsend.bak.`);
} else {
  console.log(`Done. Restart the apps that were open, then ask: "what is my quietsend address?"`);
  if (touched) console.log("Backups of the old configs are next to each file as *.quietsend.bak.");
  if (account && !hasPolicyKey(account)) {
    console.log(`\nNo agent key yet for ${account}. Before the first send, run:\n  NEAR_ACCOUNT=${account} npm run setup-agent`);
  }
}
