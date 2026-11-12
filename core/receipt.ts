import { explorerAddr, explorerTx, getConfig, nearTx } from "./config";
import { inspectTx, short, type TxView } from "./inspect";
import { formatUsdc } from "./solana";
import type { Mode, SendRecord } from "./send";

export type Visibility = "PUBLIC" | "HIDDEN";

export type PrivacyRow = {
  visibility: Visibility;
  claim: string;
  observed?: string;
};

export type ReceiptLeg = {
  name: "leg1" | "leg2";
  role: string;
  signature?: string;
  explorer?: string;
  signers?: string[];
  accounts?: string[];
  usdcChanges?: { owner: string; deltaUsdc: string }[];
  containsRecipient?: boolean;
  containsSender?: boolean;
};

export type Receipt = {
  id: string;
  mode: "normal" | "hide_recipient";
  signerBackend?: "human" | "policy";
  status: string;
  nearAccount: string;
  path: string;
  solanaAddress: string;
  solanaExplorer: string;
  recipient: string;
  amountUsdc: string;
  mbFeeUsdc?: string;
  nearTxHash?: string;
  nearExplorer?: string;
  legs: ReceiptLeg[];
  privacy: PrivacyRow[];
  summary: string;
};

export function modeLabel(mode: Mode): "normal" | "hide_recipient" {
  return mode === "hide" ? "hide_recipient" : "normal";
}

function usdcOut(view: TxView | undefined, owner: string): string | undefined {
  if (!view) return undefined;
  const hits = view.usdcChanges.filter((c) => c.owner === owner);
  if (!hits.length) return undefined;
  return hits.map((c) => formatUsdc(c.deltaBase)).join(", ");
}

export function privacyTable(opts: {
  mode: Mode;
  sender: string;
  recipient: string;
  recipientAta: string;
  amountUsdc: string;
  mbFeeUsdc?: string;
  path: string;
  nearAccount: string;
  signerContract: string;
  leg1?: TxView;
  leg2?: TxView;
}): PrivacyRow[] {
  const { mode, sender, recipient, recipientAta, amountUsdc, mbFeeUsdc, path, nearAccount, signerContract, leg1, leg2 } = opts;
  if (mode === "normal") {
    return [
      { visibility: "PUBLIC", claim: `sender ${short(sender)}` },
      { visibility: "PUBLIC", claim: `recipient ${short(recipient)} and amount ${amountUsdc} USDC` },
      {
        visibility: "PUBLIC",
        claim: `NEAR account ${nearAccount} called sign on ${signerContract} with path ${path} (anyone can recompute the Solana address)`,
      },
    ];
  }
  const leg1HasRecipient = leg1 ? (leg1.accounts.includes(recipient) ? "yes" : "no") : "not yet observed";
  const leg1HasAta = leg1 ? (leg1.accounts.includes(recipientAta) ? "yes" : "no") : "not yet observed";
  const senderDelta = usdcOut(leg1, sender);
  const recDelta = usdcOut(leg2, recipient);
  const leg2HasSender = leg2 ? (leg2.accounts.includes(sender) ? "yes" : "no") : "not yet observed";
  const feeNote = mbFeeUsdc ? `: ${mbFeeUsdc} USDC` : "";
  return [
    { visibility: "PUBLIC", claim: `sender ${short(sender)} is visible on leg 1` },
    {
      visibility: "PUBLIC",
      claim: `sender USDC change on leg 1: ${senderDelta ?? "..."} (amount plus the MagicBlock fee${feeNote})`,
    },
    {
      visibility: "HIDDEN",
      claim: `recipient ${short(recipient)} appears in leg 1`,
      observed: `${leg1HasRecipient} (recipient token account: ${leg1HasAta})`,
    },
    {
      visibility: "PUBLIC",
      claim: `recipient ${short(recipient)} received ${recDelta ?? "..."} USDC on leg 2`,
    },
    {
      visibility: "PUBLIC",
      claim: `leg 2 signed by MagicBlock, not by the sender: ${leg2 ? leg2.signers.map((s) => short(s)).join(", ") : "..."}`,
    },
    {
      visibility: "HIDDEN",
      claim: `sender ${short(sender)} appears in leg 2`,
      observed: leg2HasSender,
    },
    {
      visibility: "PUBLIC",
      claim: `NEAR account ${nearAccount} called sign on ${signerContract} with path ${path} (anyone can recompute the Solana address)`,
    },
    {
      visibility: "PUBLIC",
      claim: "amount and timing of the two legs remain visible and can be matched by a patient observer",
    },
  ];
}

export function summaryFor(mode: Mode): string {
  if (mode === "hide") {
    return "Hidden: the direct sender-to-recipient link on Solana. Leg 1 never names the recipient; leg 2 never names the sender. Still public: the amount (about the same in both legs), the timing of the two legs, and the NEAR sign call (account and path). A random path would not help: the path is in the public NEAR call.";
  }
  return "Everything on Solana is public: sender, recipient and amount. Only the MPC signing without a Solana key is special here (a NEAR key still authorizes it).";
}

export async function buildReceipt(
  rec: SendRecord,
  opts?: { signerBackend?: "human" | "policy" },
): Promise<Receipt> {
  const cfg = getConfig();
  const [leg1, leg2] = await Promise.all([
    rec.leg1Sig ? inspectTx(rec.leg1Sig) : Promise.resolve(undefined),
    rec.leg2Sig ? inspectTx(rec.leg2Sig) : Promise.resolve(undefined),
  ]);
  const amountUsdc = formatUsdc(rec.amountBase);
  const mbFeeUsdc = rec.mbFeeTokens ? formatUsdc(rec.mbFeeTokens) : undefined;
  const legs: ReceiptLeg[] = [
    {
      name: "leg1",
      role: rec.mode === "hide" ? "deposit to MagicBlock vault" : "SPL transfer",
      signature: rec.leg1Sig,
      explorer: rec.leg1Sig ? explorerTx(rec.leg1Sig) : undefined,
      signers: leg1?.signers,
      accounts: leg1?.accounts,
      usdcChanges: leg1?.usdcChanges.map((c) => ({ owner: c.owner, deltaUsdc: formatUsdc(c.deltaBase) })),
      containsRecipient: leg1 ? leg1.accounts.includes(rec.recipient) : undefined,
      containsSender: leg1 ? leg1.accounts.includes(rec.solanaAddress) : undefined,
    },
  ];
  if (rec.mode === "hide") {
    legs.push({
      name: "leg2",
      role: "payout to recipient",
      signature: rec.leg2Sig,
      explorer: rec.leg2Sig ? explorerTx(rec.leg2Sig) : undefined,
      signers: leg2?.signers,
      accounts: leg2?.accounts,
      usdcChanges: leg2?.usdcChanges.map((c) => ({ owner: c.owner, deltaUsdc: formatUsdc(c.deltaBase) })),
      containsRecipient: leg2 ? leg2.accounts.includes(rec.recipient) : undefined,
      containsSender: leg2 ? leg2.accounts.includes(rec.solanaAddress) : undefined,
    });
  }
  return {
    id: rec.id,
    mode: modeLabel(rec.mode),
    signerBackend: opts?.signerBackend,
    status: rec.status,
    nearAccount: rec.nearAccount,
    path: rec.path,
    solanaAddress: rec.solanaAddress,
    solanaExplorer: explorerAddr(rec.solanaAddress),
    recipient: rec.recipient,
    amountUsdc,
    mbFeeUsdc,
    nearTxHash: rec.nearTxHash,
    nearExplorer: rec.nearTxHash ? nearTx(rec.nearTxHash) : undefined,
    legs,
    privacy: privacyTable({
      mode: rec.mode,
      sender: rec.solanaAddress,
      recipient: rec.recipient,
      recipientAta: rec.recipientAta,
      amountUsdc,
      mbFeeUsdc,
      path: rec.path,
      nearAccount: rec.nearAccount,
      signerContract: cfg.signerContract,
      leg1,
      leg2,
    }),
    summary: summaryFor(rec.mode),
  };
}

/** Privacy preview used by quote_send — claims only, no on-chain observation yet. */
export function quotePrivacyPreview(mode: Mode): PrivacyRow[] {
  if (mode === "normal") {
    return [
      { visibility: "PUBLIC", claim: "sender, recipient and amount will all appear in one Solana transaction" },
      { visibility: "PUBLIC", claim: "the NEAR sign call (account and path) is public; anyone can recompute the Solana address" },
    ];
  }
  return [
    { visibility: "HIDDEN", claim: "the recipient does not appear in leg 1 (sender → MagicBlock vault)" },
    { visibility: "HIDDEN", claim: "the sender does not appear in leg 2 (vault → recipient)" },
    { visibility: "PUBLIC", claim: "the amount is visible on both legs and, with timing, can be matched" },
    { visibility: "PUBLIC", claim: "the NEAR sign call (account and path) is public; anyone can recompute the Solana address" },
  ];
}
