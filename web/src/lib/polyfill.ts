// @solana/web3.js 1.x and @solana/spl-token expect a global Buffer in the browser.
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
