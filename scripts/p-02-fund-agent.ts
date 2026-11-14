// Fund the agent's Solana policy address from the human-mode address (same NEAR account).
// One devnet transaction: SOL for fees + the agent's USDC account + USDC.
//   npx tsx scripts/p-02-fund-agent.ts [sol=0.05] [usdc=3]
// Signed with the account's full-access key via NEAR Chain Signatures (human mode).
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  attachSignature, broadcast, deriveSolanaAddress, derivePolicySolanaAddress, explorerTx, formatUsdc,
  getBalances, getConfig, getConnection, getMint, mpcSignViaKey, parseUsdc,
} from "../core/index.ts";
import { resolveAccount, loadPrivateKey } from "../mcp/keys.ts";

const DEFAULT_ACCOUNT = resolveAccount();

const sol = Number(process.argv[2] ?? "0.05");
const usdc = parseUsdc(process.argv[3] ?? "3");
const from = await deriveSolanaAddress(DEFAULT_ACCOUNT);
const agent = await derivePolicySolanaAddress(DEFAULT_ACCOUNT);
console.log(`human ${from} → agent ${agent} (policy ${getConfig().policyContract}): ${sol} SOL + ${formatUsdc(usdc)} USDC`);

const mint = getMint();
const fromPk = new PublicKey(from);
const agentPk = new PublicKey(agent);
const agentAta = getAssociatedTokenAddressSync(mint, agentPk);
const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash("confirmed");
const tx = new Transaction({ feePayer: fromPk, blockhash, lastValidBlockHeight }).add(
  SystemProgram.transfer({ fromPubkey: fromPk, toPubkey: agentPk, lamports: Math.round(sol * LAMPORTS_PER_SOL) }),
  createAssociatedTokenAccountIdempotentInstruction(fromPk, agentAta, agentPk, mint),
  createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, fromPk), mint, agentAta, fromPk, usdc, getConfig().usdcDecimals),
);
const unsignedB64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
const { signature, nearTxHash } = await mpcSignViaKey(DEFAULT_ACCOUNT, loadPrivateKey(DEFAULT_ACCOUNT), tx.serializeMessage());
console.log("NEAR sign tx:", nearTxHash);
const sig = await broadcast(attachSignature({ kind: "legacy", unsignedB64 }, from, signature), lastValidBlockHeight);
console.log("Solana tx:", explorerTx(sig));
const b = await getBalances(agent);
console.log(`agent now: SOL ${b.sol}, USDC ${formatUsdc(b.usdcBase)}`);
