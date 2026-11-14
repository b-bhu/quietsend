// Agent send of USDC on Base Sepolia through the policy contract, gasless for the agent.
//   npx tsx scripts/evm-02-send.ts <recipient 0x…> <amount USDC, e.g. 0.01>
//   npx tsx scripts/evm-02-send.ts --status       (addresses and balances only)
import { derivePolicyEvmAddress, EVM_CHAINS, getEvmBalances, parseUsdc, formatUsdc, sendEvmUsdc } from "../core/index.ts";
import { resolveAccount, loadPolicyKey, loadRelayerKey } from "../mcp/keys.ts";
import { privateKeyToAccount } from "viem/accounts";

const DEFAULT_ACCOUNT = resolveAccount();

const chain = "base-sepolia" as const;
const c = EVM_CHAINS[chain];
const agent = await derivePolicyEvmAddress(DEFAULT_ACCOUNT);
const relayer = privateKeyToAccount(loadRelayerKey()).address;
const [a, r] = await Promise.all([getEvmBalances(chain, agent), getEvmBalances(chain, relayer)]);
console.log(`agent   ${agent}  USDC ${formatUsdc(a.usdcBase)}  ETH ${Number(a.eth) / 1e18}  ${c.explorerAddr(agent)}`);
console.log(`relayer ${relayer}  ETH ${Number(r.eth) / 1e18}`);
if (process.argv.includes("--status")) process.exit(0);

const [to, amount] = process.argv.slice(2);
if (!to || !amount) throw new Error("usage: evm-02-send.ts <recipient 0x…> <amount USDC>");
const res = await sendEvmUsdc({
  chain,
  nearAccount: DEFAULT_ACCOUNT,
  agentKey: loadPolicyKey(DEFAULT_ACCOUNT),
  relayerKey: loadRelayerKey(),
  to,
  amountBase: parseUsdc(amount),
  log: (m) => console.log("  ·", m),
});
console.log(JSON.stringify(res, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
