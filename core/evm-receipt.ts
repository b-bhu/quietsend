// Receipts for EVM (Base) sends, the counterpart of receipt.ts for Solana.
//
// A Base send is one transaction: the relayer submits transferWithAuthorization,
// USDC moves from the agent's derived address to the recipient. Nothing is hidden,
// so every privacy row is PUBLIC; the receipt says so rather than leaving it out.
import { parseAbi, parseEventLogs, type Hex } from "viem";
import { getConfig, nearTx } from "./config";
import { EVM_CHAINS, EVM_PATH_SUFFIX, publicClient, type EvmChainName, type EvmSendResult } from "./evm";
import type { PrivacyRow } from "./receipt";
import { formatUsdc } from "./solana";

export type EvmReceipt = {
  id: string;
  chain: EvmChainName;
  status: "confirmed" | "failed";
  signerBackend: "policy";
  nearAccount: string;
  /** Derivation path on the policy contract, `<account>/evm-1`. */
  path: string;
  from: Hex;
  fromExplorer: string;
  recipient: Hex;
  amountUsdc: string;
  txHash: Hex;
  explorer: string;
  /** The address that submitted the transaction and paid its gas. */
  relayer?: Hex;
  nearTxHash?: string;
  nearExplorer?: string;
  usdcTransfers?: { from: Hex; to: Hex; amountUsdc: string }[];
  privacy: PrivacyRow[];
  summary: string;
};

const TRANSFER_ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/** What a Base send shows. All of it is public; there is no hide-recipient on Base. */
export function evmPrivacyRows(o: { nearAccount: string; from: string; to: string; amountUsdc: string; relayer?: string }): PrivacyRow[] {
  const policy = getConfig().policyContract;
  return [
    { visibility: "PUBLIC", claim: "Sender address (the agent's Base address)", observed: o.from },
    { visibility: "PUBLIC", claim: "Recipient address", observed: o.to },
    { visibility: "PUBLIC", claim: "Amount", observed: `${o.amountUsdc} USDC` },
    ...(o.relayer ? [{ visibility: "PUBLIC" as const, claim: "Relayer that submitted the transaction and paid gas", observed: o.relayer }] : []),
    {
      visibility: "PUBLIC",
      claim: `NEAR sign call: ${o.nearAccount} called sign_evm_for_caller on ${policy} with path ${o.nearAccount}/${EVM_PATH_SUFFIX}, which links the NEAR account to the Base address`,
    },
  ];
}

const newId = () => "evm-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** The receipt for a Base send that went through (`status: "sent"`). */
export function buildEvmReceipt(res: Extract<EvmSendResult, { status: "sent" }>, nearAccount: string): EvmReceipt {
  const c = EVM_CHAINS[res.chain];
  const amountUsdc = formatUsdc(res.amountBase);
  return {
    id: newId(),
    chain: res.chain,
    status: "confirmed", // relayAuthorization waits for the receipt and throws if it reverted
    signerBackend: "policy",
    nearAccount,
    path: `${nearAccount}/${EVM_PATH_SUFFIX}`,
    from: res.from,
    fromExplorer: c.explorerAddr(res.from),
    recipient: res.to,
    amountUsdc,
    txHash: res.txHash,
    explorer: res.explorer,
    relayer: res.relayer,
    nearTxHash: res.nearTxHash,
    nearExplorer: res.nearTxHash ? nearTx(res.nearTxHash) : undefined,
    usdcTransfers: [{ from: res.from, to: res.to, amountUsdc }],
    privacy: evmPrivacyRows({ nearAccount, from: res.from, to: res.to, amountUsdc, relayer: res.relayer }),
    summary: `${amountUsdc} USDC sent on Base Sepolia from ${res.from} to ${res.to}. The relayer ${res.relayer} paid the gas; the sender holds no ETH. Everything here is public.`,
  };
}

/**
 * Rebuild a receipt from a Base transaction hash alone: who sent it, whether it
 * succeeded, and the USDC transfers it made. Undefined if the chain has no such transaction.
 */
export async function inspectEvmTx(chain: EvmChainName, hash: Hex): Promise<EvmReceipt | undefined> {
  const c = EVM_CHAINS[chain];
  const pc = publicClient(chain);
  const r = await pc.getTransactionReceipt({ hash }).catch(() => undefined);
  if (!r) return undefined;
  const transfers = parseEventLogs({ abi: TRANSFER_ABI, logs: r.logs, eventName: "Transfer" })
    .filter((l) => l.address.toLowerCase() === c.usdc.toLowerCase())
    .map((l) => ({ from: l.args.from, to: l.args.to, amountUsdc: formatUsdc(l.args.value) }));
  const first = transfers[0];
  return {
    id: hash,
    chain,
    status: r.status === "success" ? "confirmed" : "failed",
    signerBackend: "policy",
    nearAccount: "",
    path: "",
    from: (first?.from ?? r.from) as Hex,
    fromExplorer: c.explorerAddr(first?.from ?? r.from),
    recipient: (first?.to ?? "0x") as Hex,
    amountUsdc: first?.amountUsdc ?? "",
    txHash: hash,
    explorer: c.explorerTx(hash),
    relayer: r.from,
    usdcTransfers: transfers,
    privacy: [],
    summary: transfers.length
      ? "Reconstructed from a Base Sepolia transaction hash only (not a quietsend receipt id). The USDC transfers and the submitting address are read from the chain; the NEAR side needs the original send."
      : "Base Sepolia transaction with no USDC transfer in it.",
  };
}
