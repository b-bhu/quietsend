import "./config";
export { deriveSolanaAddress, signatureFromNearTx, mpcSignViaWallet, type SigningWallet } from "../../../core/index";
import { getProvider } from "../../../core/index";

/** Same singleton-style export the previous lib had. */
export const provider = getProvider();

// ---- NEAR Connect (wallet connector; replaces the deprecated NEAR Wallet Selector) ----
import type { NearConnector as NC } from "@hot-labs/near-connect";
let connector: Promise<NC> | undefined;
export function getConnector(): Promise<NC> {
  connector ??= import("@hot-labs/near-connect").then(
    ({ NearConnector }) => new NearConnector({
        network: "testnet",
        features: { signAndSendTransaction: true },
        // Only wallets we expect to work for a plain function call; the others are untested here.
        excludedWallets: ["ethereum-wallets", "near-cli", "ledger"],
      }),
  );
  return connector;
}
