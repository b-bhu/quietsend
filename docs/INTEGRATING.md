# Integrating: agents and developers

**NEAR testnet and Solana devnet only.** Devnet USDC has no value.

The ad says "plug yourself in". This is how.

There are **two** ways in:

1. **The MCP server** (`npm run mcp`, `mcp/server.ts`) — an agent connects over stdio and sends through the **policy contract** deployed at `policy.bibhu-usdc.testnet`, which enforces a per-transfer limit and a daily limit and holds anything over them for human approval. This is the path the ad is talking about.
2. **The library directly** (`runSend`) — for a Node process that holds a full-access key and wants no contract in the way. Documented below.

`web/scripts/verify-lib.ts` is a working non-browser caller of the library and has made real devnet sends; it is the reference implementation for the direct path.

---

## The whole surface

One function, one interface you provide.

```ts
import { runSend } from "./web/src/lib/send.ts";

const rec = await runSend({
  wallet,                              // you provide this; see below
  nearAccount: "you.testnet",
  solanaAddress: derived,              // from deriveSolanaAddress(nearAccount)
  recipient: "7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C",
  amountUi: "0.1",                     // USDC, human units
  mode: "normal",                      // or "hide" for the two-leg MagicBlock transfer
}, (m) => console.log(m));             // optional progress log
```

`runSend` derives nothing on your behalf, builds the Solana transaction, **runs the guard**, asks your wallet to authorize the MPC `sign` call, verifies the returned signature locally, broadcasts, and for `hide` mode waits for the payout leg.

### The wallet interface

This is the only thing you implement:

```ts
export interface SigningWallet {
  signAndSendTransaction(params: {
    signerId?: string;
    receiverId: string;
    actions: {
      type: "FunctionCall";
      params: { methodName: string; args: object; gas: string; deposit: string };
    }[];
  }): Promise<unknown>;
}
```

In the browser, `@hot-labs/near-connect` satisfies it directly. From Node, about twenty lines:

```ts
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";

const account = new Account(
  ACCOUNT_ID,
  new JsonRpcProvider({ url: "https://rpc.testnet.near.org" }),
  new KeyPairSigner(KeyPair.fromString(PRIVATE_KEY)),
);

const wallet = {
  async signAndSendTransaction(p) {
    const a = p.actions[0].params;
    return account.signAndSendTransaction({
      receiverId: p.receiverId,
      actions: [actionCreators.functionCall(a.methodName, a.args, BigInt(a.gas), BigInt(a.deposit))],
    });
  },
};
```

Working version: [`web/scripts/verify-lib.ts`](../web/scripts/verify-lib.ts). Run it read-only against live devnet with no credentials:

```bash
npx tsx web/scripts/verify-lib.ts
```

---

## The constraint, and how the contract solves it

`sign` on `v1.signer-prod.testnet` requires a **1 yoctoNEAR deposit**, and a NEAR function-call access key **cannot attach a deposit**. So the restricted key you would normally hand an agent cannot reach the signer directly. Only a full-access key can.

That is exactly why the **policy contract** exists. The agent holds a function-call key scoped to the contract; the contract holds a prepaid yoctoNEAR balance and makes the signer call on the agent's behalf. The restriction is not worked around — it is used, because the agent's key cannot bypass the contract and reach the signer itself.

The contract (`contract/src/lib.rs`) then applies policy before it signs anything:

- **`per_transfer`** — a single send above it returns `NeedsApproval` instead of signing
- **`daily`** — a send that would push the day's spend past it returns `NeedsApproval`
- **`cap`** — `per_transfer` can never be set above it
- **`approve_intent(id)`** — the owner releases a held intent, and only then is it signed

So a held send genuinely "waits for you". End-to-end proof: `scripts/p-01-policy-e2e.ts` (function-call key send, `needs_approval`, approve, fresh send).

**Addresses differ between the two paths.** Human mode derives from the user's own account (`you.testnet` + `solana-1`). Policy mode derives from predecessor `policy.bibhu-usdc.testnet` with path `<user>/solana-1`, which is a **different Solana address** — fund the right one. See `llms.txt` for a worked example of both.

---

## What you get back

```ts
interface SendRecord {
  id: string;
  mode: "normal" | "hide";
  nearAccount: string;
  solanaAddress: string;
  recipient: string;
  amountBase: string;   // USDC base units, 6 decimals
  status: "signing" | "broadcasting" | "leg1-confirmed" | "confirmed" | "settled" | "failed";
  nearTxHash?: string;  // the NEAR sign call
  leg1Sig?: string;     // Solana signature
  leg2Sig?: string;     // hide mode: MagicBlock's payout
  mbFeeTokens?: string; // hide mode: the privacy fee actually charged
  error?: string;
}
```

Terminal states are `confirmed` (normal), `settled` (hide) and `failed`. In `hide` mode a payout is accepted only when the recipient's USDC delta equals the amount exactly **and** the transaction is signed by MagicBlock's validator or touches its vault — a same-amount payment from anyone else is ignored.

---

## The guard runs whether you want it to or not

Before your wallet is asked to authorize anything, a MagicBlock transaction is parsed and simulated, and refused unless it is exactly what was requested: one signer (you), allowlisted programs only, no address lookup tables, SPL instructions limited to `Transfer`/`TransferChecked` from your own USDC account, and a simulated balance change inside `amount + fee + 0.2%` with no owner, delegate or close-authority change.

Twelve refusal paths are covered by tests you can run in under a second:

```bash
npm test
```

Watch them in a browser at **`#/demo`**, including a toggle for what a client without the guard would sign.

**Read [SECURITY.md](SECURITY.md) before trusting this in anything that matters.** The short version: the guard runs in the same process that requests the signature, so it protects you from a hostile *transaction builder*, not from a hostile frontend or a compromised dependency.

---

## Deriving an address without sending

```ts
import { deriveSolanaAddress } from "./web/src/lib/near.ts";
const addr = await deriveSolanaAddress("you.testnet");            // path "solana-1"
const other = await deriveSolanaAddress("you.testnet", "solana-2"); // a different address
```

Derivation is public math over the account ID and path, both of which appear in the public NEAR sign call. **A random path is not privacy.** `verify-lib.ts` cross-checks this view call against local `chainsig.js` derivation; the browser app does not.

---

## Things that will trip you up

| | |
|---|---|
| **Blockhash expiry** | The Solana message is built right before the wallet prompt and dies in 60–90 s. If signing is slow the send refuses to broadcast and asks you to try again — the NEAR call is already spent. There is no rebuild-and-resign, because it would need a second approval. |
| **RPC rate limits** | The default devnet RPC rate-limits. Set `VITE_SOLANA_RPC` to a keyed endpoint for anything repeated. |
| **SOL for fees** | The derived address needs ~0.003 devnet SOL. `scripts/06-fund-user.ts` funds a new account. |
| **Recipient checks** | Program addresses are rejected; mints and token accounts produce a warning, not a block. |
| **`localStorage`** | `runSend` persists progress so a reload can resume. In Node, `verify-lib.ts` stubs it with a `Map` — you must do the same. |

---

## Questions worth asking before you build on this

- Agent or human? An agent should go through the MCP server and the policy contract; a trusted Node process can call `runSend` directly with a full-access key.
- Do you need amounts hidden? `hide` mode hides the *link*, not the amount. See the privacy table in the [README](../README.md).
- Are you relying on the guard as a security boundary? Don't — read [SECURITY.md](SECURITY.md) first.
