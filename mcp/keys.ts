// Load a NEAR key from a gitignored path. The key is never logged or returned.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KEYS_DIR = resolve(ROOT, ".keys");

// Load env files if present. dotenv does not print values.
loadEnv({ path: resolve(ROOT, ".env.local"), quiet: true });
loadEnv({ path: resolve(ROOT, ".env"), quiet: true });

export const DEFAULT_ACCOUNT = process.env.NEAR_ACCOUNT ?? "bibhu-usdc.testnet";

export function loadPrivateKey(accountId: string): string {
  if (process.env.NEAR_PRIVATE_KEY) return process.env.NEAR_PRIVATE_KEY;
  const keyFile = resolve(KEYS_DIR, `${accountId}.json`);
  if (existsSync(keyFile)) {
    const j = JSON.parse(readFileSync(keyFile, "utf8")) as { private_key?: string };
    if (typeof j.private_key === "string" && j.private_key) return j.private_key;
  }
  throw new Error(
    `No NEAR key found for ${accountId}. Put a gitignored key file at .keys/${accountId}.json or set NEAR_PRIVATE_KEY (never print the key).`,
  );
}

export function hasPrivateKey(accountId: string): boolean {
  try {
    loadPrivateKey(accountId);
    return true;
  } catch {
    return false;
  }
}

/** Function-call key limited to sign_for_caller. Never fall back to the full-access key. */
export function loadPolicyKey(accountId: string): string {
  if (process.env.NEAR_POLICY_PRIVATE_KEY) return process.env.NEAR_POLICY_PRIVATE_KEY;
  const keyFile = resolve(KEYS_DIR, `${accountId}.policy-fc.json`);
  if (existsSync(keyFile)) {
    const j = JSON.parse(readFileSync(keyFile, "utf8")) as { private_key?: string };
    if (typeof j.private_key === "string" && j.private_key) return j.private_key;
  }
  throw new Error(
    `No policy function-call key found for ${accountId}. Put a gitignored key file at .keys/${accountId}.policy-fc.json (never print the key).`,
  );
}

export function hasPolicyKey(accountId: string): boolean {
  try {
    loadPolicyKey(accountId);
    return true;
  } catch {
    return false;
  }
}
