import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./keys.ts";
import type { EvmReceipt, Receipt } from "../core/index.ts";

/** A Solana receipt (legs) or a Base receipt (one txHash). */
export type StoredReceipt = Receipt | EvmReceipt;

const memory = new Map<string, StoredReceipt>();
// 0x hashes are matched case-insensitively; Solana signatures are base58 and case-sensitive.
const key = (k: string) => (k.startsWith("0x") ? k.toLowerCase() : k);
const FILE = resolve(ROOT, "out", "mcp-receipts.json");

function loadFile(): void {
  if (!existsSync(FILE)) return;
  try {
    const all = JSON.parse(readFileSync(FILE, "utf8")) as StoredReceipt[];
    for (const r of all) index(r, false);
  } catch {
    // ignore a corrupt cache; receipts can still be rebuilt from a tx hash
  }
}

function index(r: StoredReceipt, persistFile: boolean) {
  memory.set(r.id, r);
  if (r.nearTxHash) memory.set(r.nearTxHash, r);
  if ("legs" in r) {
    for (const leg of r.legs) {
      if (leg.signature) memory.set(leg.signature, r);
    }
  } else {
    memory.set(key(r.txHash), r);
  }
  if (persistFile) {
    mkdirSync(resolve(ROOT, "out"), { recursive: true });
    const unique = [...new Map([...memory.values()].map((x) => [x.id, x])).values()];
    writeFileSync(FILE, JSON.stringify(unique, null, 2) + "\n");
  }
}

loadFile();

export function saveReceipt(r: StoredReceipt): void {
  index(r, true);
}

export function getStoredReceipt(idOrTx: string): StoredReceipt | undefined {
  return memory.get(key(idOrTx));
}
