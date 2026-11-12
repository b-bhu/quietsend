// Shared MagicBlock guards and payout/recipient checks. Usable from the Vite app
// (web/src/lib) and from Node scripts (scripts/mb-03-send.ts). No env or RPC
// defaults live here: callers pass connection, mint, allowlist, validator, vault.

import { Buffer } from "buffer";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

// Programs seen in the proven MagicBlock transfer (out/mb-inspect.txt).
export const DEFAULT_MB_ALLOWED_PROGRAMS = [
  "SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2", // ephemeral SPL token program
  ASSOCIATED_TOKEN_PROGRAM,
  TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  "ComputeBudget111111111111111111111111111111",
  "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1",
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
  "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
];

// Sole signer of the proven leg-2 payouts (out/mb-inspect.json). Configurable by callers.
export const DEFAULT_MB_VALIDATOR = "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";
// Vault authority that received the proven leg-1 USDC and paid it out in leg 2.
export const DEFAULT_MB_VAULT = "EiV97BPvmJzP4kzy28ciqddhQW864Wit3r3zYiLXARjG";

// SPL Token instruction tags we tolerate at the top level: Transfer (3), TransferChecked (12).
// Approve / SetAuthority / CloseAccount / Burn etc. are rejected outright.
const TOKEN_IX_OK = new Set([3, 12]);

export function ataOfMint(owner: string, mint: string): string {
  return getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner)).toBase58();
}

export type GuardedTx = { programs: string[]; keys: string[] };

/**
 * Fail-closed checks on an unsigned MagicBlock transaction, before any MPC sign.
 * sendTo must be "base"; the only required signer is the sender; every top-level
 * program must be allowlisted; top-level SPL token ixs may only Transfer/TransferChecked
 * from the sender's USDC ATA (TransferChecked mint must be USDC).
 */
export function assertMagicBlockTx(opts: {
  tx: VersionedTransaction;
  sendTo: string;
  from: string;
  usdcMint: string;
  allowedPrograms: string[];
}): GuardedTx {
  const { tx, sendTo, from, usdcMint, allowedPrograms } = opts;
  if (sendTo !== "base") throw new Error("MagicBlock returned sendTo=" + sendTo + " (expected base)");
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  if (tx.message.header.numRequiredSignatures !== 1 || keys[0] !== from)
    throw new Error("MagicBlock transaction needs signers other than the sender; refusing to sign");
  const programs = [...new Set(tx.message.compiledInstructions.map((i) => keys[i.programIdIndex]))];
  const unknown = programs.filter((p) => !p || !allowedPrograms.includes(p));
  if (unknown.length)
    throw new Error(
      "MagicBlock transaction calls an unrecognised program, refusing to sign: " +
        unknown.map((p) => p || "(lookup-table program)").join(", "),
    );
  checkTopLevelInstructions(tx, keys, ataOfMint(from, usdcMint), usdcMint);
  return { programs: programs.filter((p): p is string => !!p), keys };
}

function checkTopLevelInstructions(tx: VersionedTransaction, keys: string[], senderAta: string, usdcMint: string) {
  for (const ix of tx.message.compiledInstructions) {
    const program = keys[ix.programIdIndex];
    if (program == null)
      throw new Error("MagicBlock transaction references a program via a lookup table; refusing to sign");
    if (program !== TOKEN_PROGRAM && program !== TOKEN_2022_PROGRAM) continue;
    if (!ix.data.length || !TOKEN_IX_OK.has(ix.data[0]!))
      throw new Error("MagicBlock transaction contains a direct SPL Token instruction type " + ix.data[0] + "; refusing to sign");
    const source = keys[ix.accountKeyIndexes[0]!];
    if (source !== senderAta)
      throw new Error("MagicBlock transaction would transfer from a token account that is not your USDC account; refusing to sign");
    if (ix.data[0] === 12) {
      const mint = keys[ix.accountKeyIndexes[1]!];
      if (mint !== usdcMint)
        throw new Error("MagicBlock transaction would transfer a token other than USDC; refusing to sign");
    }
  }
}

const u64le = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset + o, 8).getBigUint64(0, true);

/**
 * Don't trust the API's description of the transaction: simulate it (no signatures needed) and check what it
 * does to the user's own accounts. Sender USDC token account: spends at least `amount` and at most
 * amount + reported fee (+ 0.2% margin); owner unchanged; no delegate; no close authority.
 * Sender SOL: spends at most 0.01 SOL (tx fee + one-time rent).
 */
export async function checkEconomics(
  connection: Connection,
  tx: VersionedTransaction,
  from: string,
  amountBase: bigint,
  feesTokens: bigint,
  usdcMint: string,
): Promise<void> {
  const senderAta = ataOfMint(from, usdcMint);
  const senderPk = new PublicKey(from);
  const ataPk = new PublicKey(senderAta);
  const [before, solBefore] = await Promise.all([
    connection.getAccountInfo(ataPk),
    connection.getBalance(senderPk),
  ]);
  if (!before || before.data.length < 165) throw new Error("Your USDC account could not be read; refusing to sign");
  const sim = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [senderAta, from] },
  });
  if (sim.value.err) throw new Error("MagicBlock transaction fails in simulation: " + JSON.stringify(sim.value.err));
  const [after, sol] = sim.value.accounts ?? [];
  if (!after || !sol) throw new Error("Simulation returned no account state; refusing to sign");
  const post = Buffer.from(after.data[0]!, "base64");
  if (post.length < 165) throw new Error("MagicBlock transaction would leave your USDC account in an unexpected state; refusing to sign");
  const pre = before.data;
  const spent = u64le(pre, 64) - u64le(post, 64);
  const maxSpend = amountBase + feesTokens + amountBase / 500n + 1n;
  if (spent < amountBase || spent > maxSpend)
    throw new Error(`MagicBlock transaction would move ${spent} base units from your USDC account; expected ${amountBase} + fee ${feesTokens}. Refusing to sign.`);
  if (!Buffer.from(post.subarray(32, 64)).equals(Buffer.from(pre.subarray(32, 64))))
    throw new Error("MagicBlock transaction would change the owner of your USDC account; refusing to sign");
  if (post.readUInt32LE(72) !== 0) throw new Error("MagicBlock transaction would set a delegate on your USDC account; refusing to sign");
  if (post.length >= 133 && post.readUInt32LE(129) !== 0) throw new Error("MagicBlock transaction would set a close authority on your USDC account; refusing to sign");
  if (solBefore - sol.lamports > 10_000_000) throw new Error("MagicBlock transaction would spend more than 0.01 SOL; refusing to sign");
}

export type TokenChange = { owner: string; deltaBase: bigint };

export type TxView = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
  signers: string[];
  accounts: string[];
  usdcChanges: TokenChange[];
};

/** Parse a getTransaction (jsonParsed, maxSupportedTransactionVersion: 1) RPC result. */
export function txViewFromRpcResult(signature: string, t: any, usdcMint: string): TxView | undefined {
  if (!t || !t.meta) return undefined;
  const keys: { pubkey: string; signer: boolean }[] = t.transaction.message.accountKeys;
  const owners = new Map<string, bigint>();
  const add = (owner: string | undefined, amt: string, sign: 1n | -1n) => {
    if (owner) owners.set(owner, (owners.get(owner) ?? 0n) + sign * BigInt(amt));
  };
  for (const b of t.meta.preTokenBalances ?? []) if (b.mint === usdcMint) add(b.owner, b.uiTokenAmount.amount, -1n);
  for (const b of t.meta.postTokenBalances ?? []) if (b.mint === usdcMint) add(b.owner, b.uiTokenAmount.amount, 1n);
  return {
    signature,
    slot: t.slot,
    blockTime: t.blockTime ?? null,
    err: t.meta.err,
    signers: keys.filter((k) => k.signer).map((k) => k.pubkey),
    accounts: [
      ...new Set([
        ...keys.map((k) => k.pubkey),
        ...(t.meta.loadedAddresses?.writable ?? []),
        ...(t.meta.loadedAddresses?.readonly ?? []),
      ]),
    ],
    usdcChanges: [...owners].filter(([, d]) => d !== 0n).map(([owner, deltaBase]) => ({ owner, deltaBase })),
  };
}

export async function fetchTxView(rpcUrl: string, signature: string, usdcMint: string): Promise<TxView | undefined> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 1 }],
    }),
  });
  const j = (await res.json()) as { result?: any; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  if (!j.result) return undefined;
  return txViewFromRpcResult(signature, j.result, usdcMint);
}

export type PayoutMatch = { ok: true } | { ok: false; reason: string };

/**
 * A payout counts only when the recipient's USDC delta is exactly `amountBase`
 * AND the tx is signed by the MagicBlock validator or touches the MagicBlock vault.
 */
export function matchMagicBlockPayout(
  view: Pick<TxView, "err" | "signers" | "accounts" | "usdcChanges">,
  opts: { recipient: string; amountBase: bigint; validator: string; vault: string },
): PayoutMatch {
  if (view.err) return { ok: false, reason: "transaction failed on chain" };
  const got = view.usdcChanges.find((c) => c.owner === opts.recipient)?.deltaBase ?? 0n;
  if (got !== opts.amountBase)
    return { ok: false, reason: `recipient delta ${got} is not the expected ${opts.amountBase}` };
  const signedByValidator = view.signers.includes(opts.validator);
  const touchesVault = view.accounts.includes(opts.vault) || view.signers.includes(opts.vault);
  if (!signedByValidator && !touchesVault)
    return {
      ok: false,
      reason: `exact amount, but not signed by MagicBlock validator ${opts.validator} and does not touch vault ${opts.vault}`,
    };
  return { ok: true };
}

export type RecipientCheck = { warning?: string };

function tokenAccountKind(data: Uint8Array, owner: string): "mint" | "token-account" | undefined {
  if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) return undefined;
  if (data.length < 82) return undefined;
  if (data.length > 165) {
    const accountType = data[165];
    if (accountType === 1) return "mint";
    if (accountType === 2) return "token-account";
  }
  if (data.length === 82) return "mint";
  if (data.length === 165) return "token-account";
  if (data.length > 82 && data.length < 165) return "mint";
  return "token-account";
}

/**
 * Warn (do not block) when a recipient looks like a mint, an executable program,
 * the system program, or a token account. System-owned accounts and nonexistent
 * addresses are treated as ordinary wallets and pass with no warning.
 */
export async function classifyRecipient(connection: Connection, address: string): Promise<RecipientCheck> {
  const pk = new PublicKey(address);
  const id = pk.toBase58();
  if (id === SYSTEM_PROGRAM)
    return { warning: "This is the Solana system program, not a wallet. You can still send, but the funds may be lost." };
  const info = await connection.getAccountInfo(pk);
  if (!info) return {};
  if (info.executable)
    return { warning: "This address is an executable program, not a wallet. You can still send, but the funds may be lost." };
  const kind = tokenAccountKind(info.data, info.owner.toBase58());
  if (kind === "mint")
    return { warning: "This address looks like a token mint, not a wallet. You can still send, but the funds may be lost." };
  if (kind === "token-account")
    return { warning: "This address is a token account, not a wallet. You can still send, but the funds may be lost." };
  return {};
}

