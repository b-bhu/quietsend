// Gate 1: does MagicBlock need an auth challenge signature, and does an MPC Ed25519 signature pass /v1/spl/login?
import bs58 from "bs58";
import { DERIVED_ADDRESS, CIRCLE_USDC_DEVNET } from "./config.ts";
import { mbFetch, mpcSign, saveOut, CLUSTER } from "./mb-lib.ts";

const ch = await mbFetch(`/v1/spl/challenge?pubkey=${DERIVED_ADDRESS}&cluster=${CLUSTER}`);
console.log("challenge:", ch.status, JSON.stringify(ch.json));
const challenge: string = ch.json.challenge;
const msg = new TextEncoder().encode(challenge);
const sig = await mpcSign(msg);
console.log("MPC signed challenge, local verify OK, sig bytes:", sig.length);

const body = { pubkey: DERIVED_ADDRESS, challenge, signature: bs58.encode(sig), cluster: CLUSTER };
const login = await mbFetch("/v1/spl/login", { method: "POST", body: JSON.stringify(body) });
console.log("login:", login.status, typeof login.json === "string" ? login.json : JSON.stringify(login.json).replace(/"token":"[^"]{6}[^"]*"/, '"token":"<redacted>"'));
const token = login.json?.token;
saveOut("mb-auth.json", { challenge, loginStatus: login.status, gotToken: !!token, token });

if (token) {
  const pb = await mbFetch(`/v1/spl/private-balance?address=${DERIVED_ADDRESS}&mint=${CIRCLE_USDC_DEVNET}&cluster=${CLUSTER}`, { token });
  console.log("private-balance:", pb.status, JSON.stringify(pb.json));
}
const mi = await mbFetch(`/v1/spl/is-mint-initialized?mint=${CIRCLE_USDC_DEVNET}&cluster=${CLUSTER}`);
console.log("is-mint-initialized (Circle devnet USDC):", mi.status, JSON.stringify(mi.json));
