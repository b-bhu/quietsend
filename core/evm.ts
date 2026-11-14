// EVM sends: USDC "gasless" transfers (EIP-3009 transferWithAuthorization).
//
// 1. The policy contract checks limits and builds the EIP-712 digest itself,
//    then the MPC signs it with the agent's derived secp256k1 key.
// 2. We rebuild the same digest here, recover the signer and require it to be
//    the agent's derived address. A mismatch stops the send.
// 3. A relayer wallet submits transferWithAuthorization and pays the gas. The
//    agent's address only ever holds USDC; the relayer cannot change amount or
//    recipient without breaking the signature.
import { Buffer } from "buffer";
import bs58 from "bs58";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  createPublicClient,
  createWalletClient,
  hashTypedData,
  http,
  parseAbi,
  recoverAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { getConfig } from "./config";
import { getProvider, mpcSignEvmViaPolicy, type PolicySignResult } from "./near";

export type EvmChainName = "base-sepolia";

export const EVM_CHAINS = {
  "base-sepolia": {
    chain: baseSepolia,
    chainId: 84532,
    rpc: "https://sepolia.base.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Hex,
    usdcName: "USDC",
    usdcVersion: "2",
    explorerTx: (h: string) => `https://sepolia.basescan.org/tx/${h}`,
    explorerAddr: (a: string) => `https://sepolia.basescan.org/address/${a}`,
  },
} as const;

export const EVM_PATH_SUFFIX = "evm-1";
const EVM_DOMAIN_ID = 0;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

export function isEvmAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

function chainCfg(chain: EvmChainName) {
  const c = EVM_CHAINS[chain];
  if (!c) throw new Error(`unsupported EVM chain ${chain}`);
  return c;
}

export function publicClient(chain: EvmChainName) {
  const c = chainCfg(chain);
  return createPublicClient({ chain: c.chain, transport: http(c.rpc) });
}

function evmAddressFromKey(key: string): Hex {
  let b: Uint8Array = key.startsWith("secp256k1:") ? bs58.decode(key.slice("secp256k1:".length)) : Buffer.from(key.replace(/^0x/, ""), "hex");
  if (b.length === 65) b = b.slice(1);
  if (b.length !== 64) throw new Error("unexpected secp256k1 public key length " + b.length);
  return ("0x" + Buffer.from(keccak_256(b).slice(12)).toString("hex")) as Hex;
}

/** The agent's EVM address: predecessor = policy contract, path `<user>/evm-1`, secp256k1. */
export async function derivePolicyEvmAddress(nearAccount: string): Promise<Hex> {
  const cfg = getConfig();
  const pk = await getProvider().callFunction<string>({
    contractId: cfg.signerContract,
    method: "derived_public_key",
    args: { path: `${nearAccount}/${EVM_PATH_SUFFIX}`, predecessor: cfg.policyContract, domain_id: EVM_DOMAIN_ID },
  });
  if (typeof pk !== "string" || !pk.startsWith("secp256k1:")) throw new Error("Unexpected derived key: " + JSON.stringify(pk));
  return evmAddressFromKey(pk);
}

export async function getEvmBalances(chain: EvmChainName, address: Hex): Promise<{ eth: bigint; usdcBase: bigint }> {
  const c = chainCfg(chain);
  const pc = publicClient(chain);
  const [eth, usdcBase] = await Promise.all([
    pc.getBalance({ address }),
    pc.readContract({ address: c.usdc, abi: USDC_ABI, functionName: "balanceOf", args: [address] }),
  ]);
  return { eth, usdcBase };
}

export type Authorization = {
  from: Hex;
  to: Hex;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

/** The EIP-712 digest the contract builds. Rebuilt here independently, with viem. */
export function authorizationDigest(chain: EvmChainName, a: Authorization): Hex {
  const c = chainCfg(chain);
  return hashTypedData({
    domain: { name: c.usdcName, version: c.usdcVersion, chainId: c.chainId, verifyingContract: c.usdc },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: a,
  });
}

/** 65 bytes r||s||recid from the MPC → low-s (EIP-2) v/r/s that USDC accepts. */
export function toVrs(sig65: Uint8Array): { v: number; r: Hex; s: Hex } {
  if (sig65.length !== 65) throw new Error("expected a 65-byte ECDSA signature, got " + sig65.length);
  let s = BigInt("0x" + Buffer.from(sig65.slice(32, 64)).toString("hex"));
  let recid = sig65[64];
  if (s > SECP256K1_N / 2n) {
    s = SECP256K1_N - s;
    recid ^= 1;
  }
  return {
    v: 27 + recid,
    r: ("0x" + Buffer.from(sig65.slice(0, 32)).toString("hex")) as Hex,
    s: ("0x" + s.toString(16).padStart(64, "0")) as Hex,
  };
}

export async function recoverAuthorizer(chain: EvmChainName, a: Authorization, vrs: { v: number; r: Hex; s: Hex }): Promise<Hex> {
  const sig = (vrs.r + vrs.s.slice(2) + vrs.v.toString(16).padStart(2, "0")) as Hex;
  return recoverAddress({ hash: authorizationDigest(chain, a), signature: sig });
}

export function randomNonce(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + Buffer.from(b).toString("hex")) as Hex;
}

export type EvmSendResult =
  | {
      status: "sent";
      chain: EvmChainName;
      from: Hex;
      to: Hex;
      amountBase: bigint;
      txHash: Hex;
      explorer: string;
      nearTxHash: string;
      relayer: Hex;
    }
  | { status: "needs_approval"; intentId?: string; reason?: string; nearTxHash: string };

export type SignedAuthorization = {
  status: "signed";
  chain: EvmChainName;
  authorization: Authorization;
  vrs: { v: number; r: Hex; s: Hex };
  /** 65-byte r||s||v hex, the form x402 puts in its payment header. */
  signature: Hex;
  nearTxHash: string;
};
export type NeedsApproval = { status: "needs_approval"; intentId?: string; reason?: string; nearTxHash: string };

/**
 * Ask the policy contract for an EIP-3009 authorization and verify it locally.
 * Nothing moves on the EVM chain yet; whoever holds the result can submit it.
 */
export async function signEvmAuthorization(opts: {
  chain: EvmChainName;
  nearAccount: string;
  agentKey: string;
  to: string;
  amountBase: bigint;
  windowSeconds?: number;
  log?: (msg: string) => void;
}): Promise<SignedAuthorization | NeedsApproval> {
  const log = opts.log ?? (() => {});
  if (!isEvmAddress(opts.to)) throw new Error(`recipient is not an EVM address: ${opts.to}`);
  if (opts.amountBase <= 0n) throw new Error("amount must be greater than 0");
  const from = await derivePolicyEvmAddress(opts.nearAccount);
  const to = opts.to.toLowerCase() as Hex;
  const { usdcBase } = await getEvmBalances(opts.chain, from);
  if (usdcBase < opts.amountBase) {
    throw new Error(`insufficient USDC on ${opts.chain}: ${from} holds ${usdcBase} base units, needs ${opts.amountBase}`);
  }
  const auth: Authorization = {
    from,
    to,
    value: opts.amountBase,
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + (opts.windowSeconds ?? 600)),
    nonce: randomNonce(),
  };
  log(`asking ${getConfig().policyContract} to sign ${opts.amountBase} base units ${from} → ${to} on ${opts.chain}`);
  const signed: PolicySignResult = await mpcSignEvmViaPolicy(
    opts.nearAccount,
    opts.agentKey,
    { chain: opts.chain, from, recipient: to, amountBase: auth.value, validBefore: auth.validBefore, nonceHex: auth.nonce },
    (h) => log(`NEAR tx ${h}`),
  );
  if (signed.status === "needs_approval") {
    return { status: "needs_approval", intentId: signed.intentId, reason: signed.reason, nearTxHash: signed.nearTxHash };
  }
  const vrs = toVrs(signed.signature);
  const recovered = await recoverAuthorizer(opts.chain, auth, vrs);
  if (recovered.toLowerCase() !== from.toLowerCase()) {
    throw new Error(`signature recovers to ${recovered}, not the agent address ${from}; refusing to use it`);
  }
  log(`signature recovers to ${from}`);
  const signature = (vrs.r + vrs.s.slice(2) + vrs.v.toString(16).padStart(2, "0")) as Hex;
  return { status: "signed", chain: opts.chain, authorization: auth, vrs, signature, nearTxHash: signed.nearTxHash };
}

/** Submit a signed authorization and pay its gas. Simulates first, so a bad one costs nothing. */
export async function relayAuthorization(
  chain: EvmChainName,
  auth: Authorization,
  vrs: { v: number; r: Hex; s: Hex },
  relayerKey: Hex,
): Promise<{ txHash: Hex; explorer: string; relayer: Hex }> {
  const c = chainCfg(chain);
  const relayer = privateKeyToAccount(relayerKey);
  const wc = createWalletClient({ account: relayer, chain: c.chain, transport: http(c.rpc) });
  const pc = publicClient(chain);
  const args = [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, vrs.v, vrs.r, vrs.s] as const;
  await pc.simulateContract({ account: relayer, address: c.usdc, abi: USDC_ABI, functionName: "transferWithAuthorization", args });
  const txHash = await wc.writeContract({ address: c.usdc, abi: USDC_ABI, functionName: "transferWithAuthorization", args });
  const receipt = await pc.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`transferWithAuthorization reverted: ${txHash}`);
  return { txHash, explorer: c.explorerTx(txHash), relayer: relayer.address };
}

/**
 * Agent send of USDC on an EVM chain, through the policy contract.
 * `agentKey` is the NEAR function-call key; `relayerKey` pays gas on the EVM chain.
 */
export async function sendEvmUsdc(opts: {
  chain: EvmChainName;
  nearAccount: string;
  agentKey: string;
  relayerKey: Hex;
  to: string;
  amountBase: bigint;
  windowSeconds?: number;
  log?: (msg: string) => void;
}): Promise<EvmSendResult> {
  const log = opts.log ?? (() => {});
  const signed = await signEvmAuthorization(opts);
  if (signed.status === "needs_approval") return signed;
  const { txHash, explorer, relayer } = await relayAuthorization(opts.chain, signed.authorization, signed.vrs, opts.relayerKey);
  log(`relayed ${txHash}`);
  const a = signed.authorization;
  return { status: "sent", chain: opts.chain, from: a.from, to: a.to, amountBase: a.value, txHash, explorer, nearTxHash: signed.nearTxHash, relayer };
}
