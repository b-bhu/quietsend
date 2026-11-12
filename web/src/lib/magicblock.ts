import "./polyfill";
import { Buffer } from "buffer";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { MB_ALLOWED_PROGRAMS, MB_API, USDC_MINT } from "./config";
import { ataOf, connection, type Unsigned } from "./solana";

export interface MbTransfer extends Unsigned {
  sendTo: string;
  feesTokens: string; // base units
  feesLamports: string;
  programs: string[];
}

/**
 * POST /v1/spl/transfer: private base->base transfer. Returns an UNSIGNED v0 transaction with the recipient
 * encrypted inside. Proven end to end by scripts/mb-*.ts (devnet). No bearer token is needed for this call.
 * minDelayMs/maxDelayMs "0": no settlement delay (delay/split options exist but are untested here).
 */
export async function requestPrivateTransfer(from: string, to: string, amountBase: bigint): Promise<MbTransfer> {
  const res = await fetch(MB_API + "/v1/spl/transfer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      mint: USDC_MINT,
      amount: Number(amountBase),
      cluster: "devnet",
      visibility: "private",
      fromBalance: "base",
      toBalance: "base",
      initIfMissing: true,
      initAtasIfMissing: true,
      initVaultIfMissing: true,
      minDelayMs: "0",
      maxDelayMs: "0",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`MagicBlock API ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`MagicBlock API ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);

  const raw = Buffer.from(j.transactionBase64 as string, "base64");
  const tx = VersionedTransaction.deserialize(raw);
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  // The MPC signs whatever bytes it is given, so check before asking for a signature.
  if (j.sendTo !== "base") throw new Error("MagicBlock returned sendTo=" + j.sendTo + " (expected base)");
  if (tx.message.header.numRequiredSignatures !== 1 || keys[0] !== from)
    throw new Error("MagicBlock transaction needs signers other than the sender; refusing to sign");
  const programs = [...new Set(tx.message.compiledInstructions.map((i) => keys[i.programIdIndex]))];
  const unknown = programs.filter((p) => !MB_ALLOWED_PROGRAMS.includes(p));
  if (unknown.length) throw new Error("MagicBlock transaction calls an unrecognised program, refusing to sign: " + unknown.join(", "));

  const feesTokens = BigInt(j.fees?.tokens ?? "0");
  checkTopLevelInstructions(tx, keys);
  await checkEconomics(tx, from, amountBase, feesTokens);

  return {
    kind: "v0",
    unsignedB64: raw.toString("base64"),
    messageBytes: tx.message.serialize(),
    lastValidBlockHeight: Number(j.lastValidBlockHeight),
    sendTo: j.sendTo,
    feesTokens: feesTokens.toString(),
    feesLamports: String(j.fees?.lamports ?? "0"),
    programs,
  };
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// SPL Token instruction tags we tolerate at the top level: Transfer (3), TransferChecked (12).
// Approve / SetAuthority / CloseAccount / Burn etc. are rejected outright.
const TOKEN_IX_OK = new Set([3, 12]);

function checkTopLevelInstructions(tx: VersionedTransaction, keys: string[]) {
  for (const ix of tx.message.compiledInstructions) {
    if (keys[ix.programIdIndex] === TOKEN_PROGRAM && !TOKEN_IX_OK.has(ix.data[0]))
      throw new Error("MagicBlock transaction contains a direct SPL Token instruction type " + ix.data[0] + "; refusing to sign");
  }
}

const u64le = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset + o, 8).getBigUint64(0, true);

/**
 * Don't trust the API's description of the transaction: simulate it (no signatures needed) and check what it
 * does to the user's own accounts. Sender USDC token account: spends at least `amount` and at most
 * amount + reported fee (+ 0.2% margin); owner unchanged; no delegate; no close authority.
 * Sender SOL: spends at most 0.01 SOL (tx fee + one-time rent).
 */
export async function checkEconomics(tx: VersionedTransaction, from: string, amountBase: bigint, feesTokens: bigint) {
  const senderAta = ataOf(from);
  const sim = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [senderAta, from] },
  });
  if (sim.value.err) throw new Error("MagicBlock transaction fails in simulation: " + JSON.stringify(sim.value.err));
  const [after, sol] = sim.value.accounts ?? [];
  const before = await connection.getAccountInfo(new PublicKey(senderAta));
  const solBefore = await connection.getBalance(new PublicKey(from));
  if (!after || !before || !sol) throw new Error("Simulation returned no account state; refusing to sign");
  const post = Buffer.from(after.data[0], "base64");
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
