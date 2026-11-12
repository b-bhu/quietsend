// Gate 1b: REAL auth against the devnet TEE (the payments API's login returns a mock token for any signature).
import bs58 from "bs58";
import { DERIVED_ADDRESS } from "./config.ts";
import { mpcSign, saveOut } from "./mb-lib.ts";

const TEE = "https://devnet-tee.magicblock.app";
const post = async (sig: Uint8Array, challenge: string) => {
  const r = await fetch(`${TEE}/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pubkey: DERIVED_ADDRESS, challenge, signature: bs58.encode(sig) }) });
  return { status: r.status, text: await r.text() };
};
const getCh = async () => (await (await fetch(`${TEE}/auth/challenge?pubkey=${DERIVED_ADDRESS}`)).json()).challenge as string;

let ch = await getCh();
console.log("negative control (garbage sig):", JSON.stringify(await post(new Uint8Array(64).fill(7), ch)));
ch = await getCh();
console.log("challenge:", JSON.stringify(ch));
const sig = await mpcSign(new TextEncoder().encode(ch));
const r = await post(sig, ch);
let token: string | undefined;
try { token = JSON.parse(r.text).token; } catch {}
console.log("MPC-signed login:", r.status, token ? "token received (redacted)" : r.text);
saveOut("mb-tee-auth.json", { challenge: ch, status: r.status, gotToken: !!token, token });
