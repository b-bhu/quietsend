import { mpcSignViaWallet, signatureFromNearTx, type SigningWallet } from "./near";
import {
  runSend as runSendCore,
  finish,
  pollLeg2 as pollLeg2Core,
  type Log,
  type Mode,
  type PendingSend,
  type SendPersistence,
  type SendRecord,
} from "../../../core/index";
import { clearPending, getRecord, loadPending, savePending, saveRecord } from "./history";

export type { Log, Mode, SendRecord };

export interface SendInput {
  wallet: SigningWallet;
  nearAccount: string;
  solanaAddress: string;
  recipient: string;
  amountUi: string;
  mode: Mode;
}

const hooks: SendPersistence = {
  saveRecord,
  savePending,
  clearPending,
};

/** Full send. Persists progress after every step so a reload / redirect can resume (see resumePending). */
export async function runSend(inp: SendInput, log: Log = () => {}): Promise<SendRecord> {
  return runSendCore(
    {
      sign: (message, onHash) => mpcSignViaWallet(inp.wallet, inp.nearAccount, message, onHash),
      nearAccount: inp.nearAccount,
      solanaAddress: inp.solanaAddress,
      recipient: inp.recipient,
      amountUi: inp.amountUi,
      mode: inp.mode,
    },
    log,
    hooks,
  );
}

export async function pollLeg2(rec: SendRecord, log: Log = () => {}, timeoutMs = 5 * 60_000): Promise<SendRecord> {
  return pollLeg2Core(rec, log, timeoutMs, hooks);
}

/**
 * After a reload (or a redirect-style wallet that navigated away), finish an interrupted send.
 * If the NEAR hash was never captured we cannot recover the signature: the pending send is dropped.
 */
// Module-level lock: React StrictMode in dev mounts effects twice, and two overlapping
// resumes of the same pending send can race (the loser may overwrite a settled record as failed).
let resumeLock: Promise<SendRecord | undefined> | undefined;

export async function resumePending(log: Log = () => {}): Promise<SendRecord | undefined> {
  if (resumeLock) return resumeLock;
  resumeLock = (async () => {
    const p = loadPending();
    if (!p) return undefined;
    const rec = getRecord(p.id);
    if (!rec) {
      clearPending();
      return undefined;
    }
    try {
      if (!p.nearTxHash) throw new Error("Interrupted before the wallet returned a NEAR tx hash; nothing to resume. Send again.");
      log("Resuming: reading the signature from NEAR tx " + p.nearTxHash);
      const sig = await signatureFromNearTx(p.nearTxHash, rec.nearAccount);
      return await finish(rec, p as PendingSend, sig, log, hooks);
    } catch (e) {
      rec.status = "failed";
      rec.error = e instanceof Error ? e.message : String(e);
      saveRecord(rec);
      clearPending();
      throw e;
    }
  })();
  try {
    return await resumeLock;
  } finally {
    resumeLock = undefined;
  }
}
