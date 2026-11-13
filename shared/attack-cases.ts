/**
 * The hostile transactions the guard must refuse, as data.
 *
 * Shared on purpose: `test/guard-attacks.test.ts` asserts against these, and the
 * browser demo at `#/demo` runs the same list through the same guard. One source,
 * so the demo can never drift from what the tests prove.
 *
 * Everything here is offline. Each case builds an unsigned v0 transaction; nothing
 * is signed, broadcast, or sent anywhere.
 */
import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ASSOCIATED_TOKEN_PROGRAM, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./magicblock-guards";

/** SPL Token instruction tags. Only 3 and 12 are tolerated at the top level. */
export const SPL = {
  Transfer: 3,
  Approve: 4,
  SetAuthority: 6,
  Burn: 8,
  CloseAccount: 9,
  TransferChecked: 12,
} as const;

export interface AttackCase {
  /** Stable id, used as a React key and in test names. */
  id: string;
  /** What a hostile API would be attempting. */
  title: string;
  /** Why it would hurt the user, in one sentence. */
  harm: string;
  /** Substring expected in the guard's refusal, so tests and demo agree. */
  expect: string;
  /** Builds the transaction plus the arguments the guard is called with. */
  build(ctx: AttackContext): { tx: VersionedTransaction; sendTo: string; from: string };
  /**
   * Allowlist override. Only the Token-2022 case needs one: with Token-2022 absent
   * from the allowlist it would be refused by the program check before the
   * instruction check is reached, which would demonstrate the wrong guard.
   */
  allowedPrograms?: string[];
}

export interface AttackContext {
  /** The user's derived Solana address. */
  from: string;
  /** The user's USDC associated token account. */
  fromAta: string;
  /** An address the attacker controls. */
  attacker: string;
  /** An ordinary recipient. */
  recipient: string;
  usdcMint: string;
}

export const ataOf = (owner: string, mint: string) =>
  getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner)).toBase58();

const ix = (programId: string, keys: string[], data: number[]) =>
  new TransactionInstruction({
    programId: new PublicKey(programId),
    keys: keys.map((k) => ({ pubkey: new PublicKey(k), isWritable: true, isSigner: false })),
    data: Buffer.from(data),
  });

const splIx = (tag: number, keys: string[], program = TOKEN_PROGRAM) =>
  ix(program, keys, [tag, ...new Array(8).fill(0)]);

/** Compile instructions into an unsigned v0 transaction paid for by `payer`. */
const v0 = (payer: string, instructions: TransactionInstruction[]) =>
  new VersionedTransaction(
    new TransactionMessage({
      payerKey: new PublicKey(payer),
      recentBlockhash: PublicKey.default.toBase58(),
      instructions,
    }).compileToV0Message(),
  );

/** A legitimate-looking leg 1: move USDC out of the user's own account. */
const honest = (c: AttackContext) =>
  v0(c.from, [
    SystemProgram.transfer({
      fromPubkey: new PublicKey(c.from),
      toPubkey: new PublicKey(c.recipient),
      lamports: 1,
    }),
    splIx(SPL.TransferChecked, [c.fromAta, c.usdcMint, c.attacker, c.from]),
  ]);

export const HONEST_CASE = {
  id: "honest",
  title: "A well-formed MagicBlock transfer",
  harm: "This is what a legitimate leg 1 looks like. The guard must let it through.",
  build: (c: AttackContext) => ({ tx: honest(c), sendTo: "base", from: c.from }),
};

export const ATTACK_CASES: AttackCase[] = [
  {
    id: "send-to",
    title: "Reroute the transfer off the base layer",
    harm: "The API claims a different destination layer than the one the app asked for, so the money goes somewhere the app never checked.",
    expect: "expected base",
    build: (c) => ({ tx: honest(c), sendTo: "ephemeral", from: c.from }),
  },
  {
    id: "second-signer",
    title: "Require a second signature",
    harm: "A transaction needing another signer is not the transaction the app described, and what the co-signer adds cannot be seen here.",
    expect: "needs signers other than the sender",
    build: (c) => {
      const tx = honest(c);
      tx.message.header.numRequiredSignatures = 2;
      return { tx, sendTo: "base", from: c.from };
    },
  },
  {
    id: "wrong-signer",
    title: "Make someone else the sole signer",
    harm: "The MPC would be asked to sign for an address that is not the user's, so the signature would be useless or worse.",
    expect: "needs signers other than the sender",
    build: (c) => ({ tx: honest(c), sendTo: "base", from: c.attacker }),
  },
  {
    id: "unlisted-program",
    title: "Call a program nobody allowlisted",
    harm: "Any program invoked with the user's authority can do whatever it likes with the accounts it is handed.",
    expect: "unrecognised program",
    build: (c) => ({
      tx: v0(c.from, [ix("Stake11111111111111111111111111111111111111", [c.from], [0])]),
      sendTo: "base",
      from: c.from,
    }),
  },
  {
    id: "approve",
    title: "Delegate the USDC account (Approve)",
    harm: "A delegate can move the tokens later, at any time, with no further approval from the user.",
    expect: "instruction type 4",
    build: (c) => ({
      tx: v0(c.from, [splIx(SPL.Approve, [c.fromAta, c.attacker, c.from])]),
      sendTo: "base",
      from: c.from,
    }),
  },
  {
    id: "set-authority",
    title: "Hand over the account (SetAuthority)",
    harm: "Changing the owner gives the account away permanently. The user keeps nothing.",
    expect: "instruction type 6",
    build: (c) => ({
      tx: v0(c.from, [splIx(SPL.SetAuthority, [c.fromAta, c.from])]),
      sendTo: "base",
      from: c.from,
    }),
  },
  {
    id: "close-account",
    title: "Sweep and close the account",
    harm: "Closing the token account sends its rent lamports wherever the attacker chooses.",
    expect: "instruction type 9",
    build: (c) => ({
      tx: v0(c.from, [splIx(SPL.CloseAccount, [c.fromAta, c.attacker, c.from])]),
      sendTo: "base",
      from: c.from,
    }),
  },
  {
    id: "burn",
    title: "Destroy the tokens (Burn)",
    harm: "Burning is irreversible. Nobody receives the money; it stops existing.",
    expect: "instruction type 8",
    build: (c) => ({
      tx: v0(c.from, [splIx(SPL.Burn, [c.fromAta, c.usdcMint, c.from])]),
      sendTo: "base",
      from: c.from,
    }),
  },
  {
    id: "token-2022",
    title: "Try the same thing through Token-2022",
    harm: "A guard that only knows the classic token program would wave this through.",
    expect: "instruction type 4",
    allowedPrograms: [TOKEN_2022_PROGRAM, SYSTEM_PROGRAM],
    build: (c) => ({
      tx: v0(c.from, [splIx(SPL.Approve, [c.fromAta, c.attacker, c.from], TOKEN_2022_PROGRAM)]),
      sendTo: "base",
      from: c.from,
    }),
  },
  {
    id: "empty-data",
    title: "Send a token instruction with no data",
    harm: "With no instruction tag there is nothing to inspect, so it cannot be judged safe.",
    expect: "instruction type undefined",
    build: (c) => ({
      tx: v0(c.from, [ix(TOKEN_PROGRAM, [], [])]),
      sendTo: "base",
      from: c.from,
    }),
  },
  {
    id: "foreign-source",
    title: "Drain a different token account",
    harm: "The source is not the account the user agreed to spend from.",
    expect: "not your USDC account",
    build: (c) => ({
      tx: v0(c.from, [splIx(SPL.Transfer, [c.attacker, c.recipient, c.from])]),
      sendTo: "base",
      from: c.from,
    }),
  },
  {
    id: "wrong-mint",
    title: "Move a different token entirely",
    harm: "The user approved a USDC transfer, not a transfer of whatever else they hold.",
    expect: "token other than USDC",
    build: (c) => ({
      tx: v0(c.from, [
        splIx(SPL.TransferChecked, [c.fromAta, "So11111111111111111111111111111111111111112", c.recipient, c.from]),
      ]),
      sendTo: "base",
      from: c.from,
    }),
  },
];

/** The allowlist the demo and tests pass to the guard. */
export const DEMO_ALLOWED_PROGRAMS = [
  "SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2",
  ASSOCIATED_TOKEN_PROGRAM,
  TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
];

/**
 * The checks that need a live `simulateTransaction` and so cannot run offline.
 * Listed here so the demo can state the gap instead of hiding it.
 */
export const SIMULATION_ONLY = [
  { title: "Overcharge past amount + fee + 0.2%", line: 128 },
  { title: "Owner of the USDC account changed", line: 130 },
  { title: "Delegate set on the USDC account", line: 131 },
  { title: "Close authority set on the USDC account", line: 132 },
  { title: "More than 0.01 SOL spent", line: 133 },
];
