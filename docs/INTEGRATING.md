# Integrating: agents and developers

**NEAR testnet and Solana devnet only.** Devnet USDC has no value.

The ad says "plug yourself in". This is how.

There is **no MCP server and no spending-limit system in this repo** — do not expect either. What exists is a library you can call from Node, and one interface you have to satisfy. `web/scripts/verify-lib.ts` is a working non-browser caller that has made real devnet sends; it is the reference implementation for everything below.

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

## The constraint that will bite you

**A NEAR function-call access key cannot do this.**

`sign` on `v1.signer-prod.testnet` requires a **1 yoctoNEAR deposit** (`SIGN_DEPOSIT_YOCTO`, [`web/src/lib/config.ts:17`](../web/src/lib/config.ts)), and a function-call access key **cannot attach a deposit**. So the restricted key you would normally hand an agent cannot reach the signer at all. Only a full-access key can.

This is not a policy we chose; it is how NEAR works, and it has two consequences:

1. **Every send needs a full-access key**, which in the web app means a human approving in their wallet. An agent cannot sign on its own. That is the real safety property here — stronger than any spending cap we could have written, and it is why this repo has no spending caps.
2. **If you want an agent to operate unattended, you need a contract between the agent and the signer.** The agent calls your contract with a function-call key; the contract holds the full-access path and calls `sign`. That is the architectural fix described in [SECURITY.md](SECURITY.md) and [next-version.md](next-version.md). It is **not built here.**

Anyone planning an autonomous integration should read that before designing around it.

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

- Are you happy that every send needs a full-access key today? If not, you need the contract described above, and it does not exist yet.
- Do you need amounts hidden? `hide` mode hides the *link*, not the amount. See the privacy table in the [README](../README.md).
- Are you relying on the guard as a security boundary? Don't — read [SECURITY.md](SECURITY.md) first.
