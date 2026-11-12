import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./keys.ts";
import type { Receipt } from "../core/index.ts";

const memory = new Map<string, Receipt>();
const FILE = resolve(ROOT, "out", "mcp-receipts.json");

function loadFile(): void {
  if (!existsSync(FILE)) return;
  try {
    const all = JSON.parse(readFileSync(FILE, "utf8")) as Receipt[];
    for (const r of all) index(r, false);
  } catch {
    // ignore a corrupt cache; receipts can still be rebuilt from a tx hash
  }
}

function index(r: Receipt, persistFile: boolean) {
  memory.set(r.id, r);
  if (r.nearTxHash) memory.set(r.nearTxHash, r);
  for (const leg of r.legs) {
    if (leg.signature) memory.set(leg.signature, r);
  }
  if (persistFile) {
    mkdirSync(resolve(ROOT, "out"), { recursive: true });
    const unique = [...new Map([...memory.values()].map((x) => [x.id, x])).values()];
    writeFileSync(FILE, JSON.stringify(unique, null, 2) + "\n");
  }
}

loadFile();

export function saveReceipt(r: Receipt): void {
  index(r, true);
}

export function getStoredReceipt(idOrTx: string): Receipt | undefined {
  return memory.get(idOrTx);
}
