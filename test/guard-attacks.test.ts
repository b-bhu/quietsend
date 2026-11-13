/**
 * What this proves
 * ----------------
 * NEAR's Chain Signatures MPC signs whatever bytes it is given. quietsend asks it
 * to sign a Solana transaction that a third party (MagicBlock's API) built, so the
 * transaction builder is untrusted by design. This file hands the guard the bytes
 * a hostile or broken builder could return and asserts that it refuses, by reason,
 * BEFORE any signature exists.
 *
 * Every case here is offline: no RPC, no wallet, no devnet, no network. Run it with
 *   npm test
 *
 * The simulation-based checks (overcharge, owner/delegate/close-authority changes,
 * SOL drain) live in checkEconomics, which needs a live simulateTransaction. They
 * are listed at the end of this file as the integration tier and are not run here.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  assertMagicBlockTx,
  matchMagicBlockPayout,
  DEFAULT_MB_VALIDATOR,
  DEFAULT_MB_VAULT,
  TOKEN_2022_PROGRAM,
} from "../shared/magicblock-guards.ts";
import {
  EPHEMERAL_SPL,
  IX,
  USDC_MINT,
  attacker,
  foreignIx,
  guardArgs,
  recipient,
  sender,
  senderAta,
  tokenIx,
  transferCheckedIx,
  transferIx,
  v0,
} from "./helpers.ts";

/** The shape MagicBlock actually returns for a legitimate leg-1 transfer. */
const honestTx = () =>
  v0(sender, [
    SystemProgram.transfer({ fromPubkey: new PublicKey(sender), toPubkey: new PublicKey(recipient), lamports: 1 }),
    transferCheckedIx(senderAta, USDC_MINT, attacker, sender),
  ]);

describe("the guard accepts a well-formed MagicBlock transaction", () => {
  test("an honest leg-1 transfer passes and reports its programs", () => {
    const out = assertMagicBlockTx(guardArgs(honestTx()));
    assert.ok(out.programs.length > 0, "should report the programs it saw");
    assert.ok(out.keys.includes(sender), "should report the account keys");
  });
});

describe("attacks the guard refuses before any signature exists", () => {
  // 1. The API claims to send somewhere other than the base layer.
  test("refuses sendTo other than base", () => {
    assert.throws(
      () => assertMagicBlockTx(guardArgs(honestTx(), { sendTo: "ephemeral" })),
      /sendTo=ephemeral \(expected base\)/,
    );
  });

  // 2. A second signature is required, so the transaction cannot be what it claims.
  test("refuses a transaction that needs a signer other than the sender", () => {
    const withExtraSigner = v0(sender, [
      tokenIx(IX.Transfer, [senderAta, attacker, sender]),
    ]);
    // Force a second required signature, as a malicious builder would.
    withExtraSigner.message.header.numRequiredSignatures = 2;
    assert.throws(
      () => assertMagicBlockTx(guardArgs(withExtraSigner)),
      /needs signers other than the sender; refusing to sign/,
    );
  });

  // 2b. The sole signer is someone else entirely.
  test("refuses a transaction whose sole signer is not the sender", () => {
    assert.throws(
      () => assertMagicBlockTx(guardArgs(honestTx(), { from: attacker })),
      /needs signers other than the sender; refusing to sign/,
    );
  });

  // 3. An unrecognised program is invoked.
  test("refuses a call to a program that is not on the allowlist", () => {
    const evil = "Stake11111111111111111111111111111111111111";
    assert.throws(
      () => assertMagicBlockTx(guardArgs(v0(sender, [foreignIx(evil)]))),
      /calls an unrecognised program, refusing to sign/,
    );
  });

  // 5. Delegation: Approve lets a third party move the tokens later.
  test("refuses SPL Approve (would delegate the USDC account)", () => {
    assert.throws(
      () => assertMagicBlockTx(guardArgs(v0(sender, [tokenIx(IX.Approve, [senderAta, attacker, sender])]))),
      new RegExp(`direct SPL Token instruction type ${IX.Approve}; refusing to sign`),
    );
  });

  // 5b. Ownership theft: SetAuthority hands the account to someone else.
  test("refuses SPL SetAuthority (would hand over the USDC account)", () => {
    assert.throws(
      () => assertMagicBlockTx(guardArgs(v0(sender, [tokenIx(IX.SetAuthority, [senderAta, sender])]))),
      new RegExp(`direct SPL Token instruction type ${IX.SetAuthority}; refusing to sign`),
    );
  });

  // 5c. CloseAccount sweeps the rent lamports to an arbitrary destination.
  test("refuses SPL CloseAccount (would sweep the account)", () => {
    assert.throws(
      () => assertMagicBlockTx(guardArgs(v0(sender, [tokenIx(IX.CloseAccount, [senderAta, attacker, sender])]))),
      new RegExp(`direct SPL Token instruction type ${IX.CloseAccount}; refusing to sign`),
    );
  });

  // 5d. Burn destroys the tokens outright.
  test("refuses SPL Burn (would destroy the tokens)", () => {
    assert.throws(
      () => assertMagicBlockTx(guardArgs(v0(sender, [tokenIx(IX.Burn, [senderAta, USDC_MINT, sender])]))),
      new RegExp(`direct SPL Token instruction type ${IX.Burn}; refusing to sign`),
    );
  });

  // 5e. The same restriction must hold for Token-2022, not just the classic program.
  test("refuses a disallowed Token-2022 instruction too", () => {
    const tx = v0(sender, [tokenIx(IX.Approve, [senderAta, attacker, sender], TOKEN_2022_PROGRAM)]);
    assert.throws(
      () =>
        assertMagicBlockTx(
          guardArgs(tx, { allowedPrograms: [EPHEMERAL_SPL, TOKEN_2022_PROGRAM] }),
        ),
      new RegExp(`direct SPL Token instruction type ${IX.Approve}; refusing to sign`),
    );
  });

  // 6. The source is a token account that is not the sender's USDC ATA.
  test("refuses a transfer whose source is not the sender's USDC account", () => {
    const someoneElsesAta = attacker;
    assert.throws(
      () => assertMagicBlockTx(guardArgs(v0(sender, [transferIx(someoneElsesAta, recipient, sender)]))),
      /transfer from a token account that is not your USDC account; refusing to sign/,
    );
  });

  // 7. TransferChecked on the wrong mint: a different token is moved.
  test("refuses TransferChecked on a mint that is not USDC", () => {
    const otherMint = "So11111111111111111111111111111111111111112";
    assert.throws(
      () => assertMagicBlockTx(guardArgs(v0(sender, [transferCheckedIx(senderAta, otherMint, recipient, sender)]))),
      /transfer a token other than USDC; refusing to sign/,
    );
  });

  // 3b. An empty SPL instruction has no tag to check, so it cannot be allowed.
  test("refuses an SPL Token instruction with no data", () => {
    const tx = v0(sender, [
      new TransactionInstruction({
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        keys: [],
        data: Buffer.alloc(0),
      }),
    ]);
    assert.throws(
      () => assertMagicBlockTx(guardArgs(tx)),
      /direct SPL Token instruction type undefined; refusing to sign/,
    );
  });
});

/**
 * The payout matcher decides when leg 2 has really happened. It is pure, so the
 * hostile cases are offline too: a wrong amount, or an exact amount paid by someone
 * who is neither the MagicBlock validator nor the vault, must not be accepted.
 */
describe("the payout matcher refuses look-alike payouts", () => {
  const amountBase = 100_000n; // 0.1 USDC
  const good = {
    err: null,
    signers: [DEFAULT_MB_VALIDATOR],
    accounts: [DEFAULT_MB_VAULT, recipient],
    usdcChanges: [{ owner: recipient, deltaBase: amountBase }],
  };

  test("accepts the real payout", () => {
    const r = matchMagicBlockPayout(good, {
      recipient,
      amountBase,
      validator: DEFAULT_MB_VALIDATOR,
      vault: DEFAULT_MB_VAULT,
    });
    assert.deepEqual(r, { ok: true });
  });

  test("refuses a failed transaction", () => {
    const r = matchMagicBlockPayout({ ...good, err: { InstructionError: [0, "Custom"] } }, {
      recipient,
      amountBase,
      validator: DEFAULT_MB_VALIDATOR,
      vault: DEFAULT_MB_VAULT,
    });
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /failed on chain/);
  });

  test("refuses a payout for the wrong amount", () => {
    const r = matchMagicBlockPayout(
      { ...good, usdcChanges: [{ owner: recipient, deltaBase: 99_999n }] },
      { recipient, amountBase, validator: DEFAULT_MB_VALIDATOR, vault: DEFAULT_MB_VAULT },
    );
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /is not the expected 100000/);
  });

  test("refuses an exact amount from an unrelated payer", () => {
    const r = matchMagicBlockPayout(
      { ...good, signers: [attacker], accounts: [attacker, recipient] },
      { recipient, amountBase, validator: DEFAULT_MB_VALIDATOR, vault: DEFAULT_MB_VAULT },
    );
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /exact amount, but not signed by MagicBlock validator/);
  });

  test("refuses a payout to a different recipient", () => {
    const r = matchMagicBlockPayout(
      { ...good, usdcChanges: [{ owner: attacker, deltaBase: amountBase }] },
      { recipient, amountBase, validator: DEFAULT_MB_VALIDATOR, vault: DEFAULT_MB_VAULT },
    );
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /recipient delta 0 is not the expected/);
  });
});

/**
 * Integration tier — NOT run here, because each needs a live simulateTransaction
 * against devnet. These are the checks in `checkEconomics`
 * (shared/magicblock-guards.ts:97):
 *
 *   - overcharge past amount + reported fee + 0.2%        (line 128)
 *   - owner of the sender's USDC account changed          (line 130)
 *   - a delegate set on the sender's USDC account         (line 131)
 *   - a close authority set on the sender's USDC account  (line 132)
 *   - more than 0.01 SOL spent                            (line 133)
 *
 * To cover them offline, record a getAccountInfo + simulateTransaction response
 * pair into test/fixtures/ and inject a stub Connection.
 */
