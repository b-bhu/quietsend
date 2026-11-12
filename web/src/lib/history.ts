// localStorage history + the one in-flight ("pending") send, so a reload or wallet redirect can resume.
export type Mode = "normal" | "hide";
export type Status = "signing" | "broadcasting" | "leg1-confirmed" | "settled" | "confirmed" | "failed";

export interface SendRecord {
  id: string;
  createdAt: number;
  nearAccount: string;
  path: string;
  solanaAddress: string;
  mode: Mode;
  recipient: string;
  recipientAta: string;
  amountBase: string; // USDC base units (6 decimals)
  status: Status;
  error?: string;
  nearTxHash?: string;
  leg1Sig?: string;
  leg2Sig?: string;
  seenAtaSigs?: string[]; // recipient-ATA signatures that existed before the send (to spot the payout)
  mbFeeTokens?: string; // MagicBlock privacy fee, base units
}

export interface PendingSend {
  id: string; // same as the SendRecord id
  kind: "legacy" | "v0";
  unsignedB64: string;
  messageHex: string;
  lastValidBlockHeight: number;
  nearTxHash?: string;
}

const HIST = "quietsend:history:v1";
const PEND = "quietsend:pending:v1";

const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};

export const loadHistory = (): SendRecord[] => read<SendRecord[]>(HIST, []);
export function saveRecord(r: SendRecord) {
  const all = loadHistory().filter((x) => x.id !== r.id);
  all.unshift(r);
  localStorage.setItem(HIST, JSON.stringify(all.slice(0, 100)));
  window.dispatchEvent(new Event("quietsend:history"));
}
export const getRecord = (id: string) => loadHistory().find((r) => r.id === id);
export const loadPending = (): PendingSend | undefined => read<PendingSend | undefined>(PEND, undefined);
export const savePending = (p: PendingSend) => localStorage.setItem(PEND, JSON.stringify(p));
export const clearPending = () => localStorage.removeItem(PEND);
