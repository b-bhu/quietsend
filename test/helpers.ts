/**
 * Transaction builders for the guard tests. Everything here is offline: keys are
 * generated, the blockhash is a placeholder, and no transaction is ever signed or
 * sent. The point is to hand `assertMagicBlockTx` the bytes a hostile or buggy
 * transaction builder might return, and check that it refuses.
 */
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  ataOfMint,
} from "../shared/magicblock-guards.ts";

/** Circle's devnet USDC mint, the same one the app uses. */
export const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** A program on the guard's allowlist: MagicBlock's ephemeral SPL token program. */
export const EPHEMERAL_SPL = "SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2";

/** Deterministic-enough stand-ins. Addresses are random per run; nothing depends on their value. */
export const sender = Keypair.generate().publicKey.toBase58();
export const recipient = Keypair.generate().publicKey.toBase58();
export const attacker = Keypair.generate().publicKey.toBase58();

export const senderAta = ataOfMint(sender, USDC_MINT);

/** SPL Token instruction tags. 3 and 12 are the only two the guard tolerates. */
export const IX = {
  Transfer: 3,
  Approve: 4,
  Revoke: 5,
  SetAuthority: 6,
  Burn: 8,
  CloseAccount: 9,
  TransferChecked: 12,
} as const;

const key = (pubkey: string, writable = true, signer = false) => ({
  pubkey: new PublicKey(pubkey),
  isWritable: writable,
  isSigner: signer,
});

/**
 * Wrap instructions into an unsigned v0 transaction whose first account key — and
 * so the sole required signer — is `payer`.
 */
export function v0(payer: string, instructions: TransactionInstruction[]): VersionedTransaction {
  const msg = new TransactionMessage({
    payerKey: new PublicKey(payer),
    recentBlockhash: PublicKey.default.toBase58(),
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

/** An SPL Token instruction with an arbitrary tag, for the rejected-instruction cases. */
export function tokenIx(tag: number, accounts: string[], program = TOKEN_PROGRAM): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(program),
    keys: accounts.map((a) => key(a)),
    data: Buffer.from([tag, ...new Array(8).fill(0)]),
  });
}

/** A plain SPL `Transfer` (tag 3): source, destination, authority. */
export function transferIx(source: string, dest: string, authority: string): TransactionInstruction {
  return tokenIx(IX.Transfer, [source, dest, authority]);
}

/** `TransferChecked` (tag 12): source, mint, destination, authority. The mint is checked by the guard. */
export function transferCheckedIx(
  source: string,
  mint: string,
  dest: string,
  authority: string,
): TransactionInstruction {
  return tokenIx(IX.TransferChecked, [source, mint, dest, authority]);
}

/** An instruction on an arbitrary program, used for the allowlist case. */
export function foreignIx(program: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(program),
    keys: [key(sender)],
    data: Buffer.from([0]),
  });
}

/** The arguments `assertMagicBlockTx` takes, with the honest values filled in. */
export function guardArgs(tx: VersionedTransaction, over: Record<string, unknown> = {}) {
  return {
    tx,
    sendTo: "base",
    from: sender,
    usdcMint: USDC_MINT,
    allowedPrograms: [EPHEMERAL_SPL, ASSOCIATED_TOKEN_PROGRAM, TOKEN_PROGRAM, SYSTEM_PROGRAM],
    ...over,
  } as Parameters<typeof import("../shared/magicblock-guards.ts").assertMagicBlockTx>[0];
}
