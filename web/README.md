# quietsend web (NEAR testnet + Solana devnet)

Vite + React + TypeScript, no backend. See `../PLAN.md`.

```
npm install
npm run dev      # http://localhost:5173
npm run build
```

Env (optional, `.env.local`, gitignored):
- `VITE_SOLANA_RPC`: Solana devnet RPC (default: OnFinality public, rate limited)
- `VITE_NEAR_RPC`: NEAR testnet RPC tried first (defaults: fastnear, rpc.testnet.near.org)
- `VITE_MB_EXTRA_PROGRAMS`: comma list of extra program ids to allow in MagicBlock transactions

Headless lib check (no wallet): from the repo root, `npx tsx web/scripts/verify-lib.ts` (read-only).
`--send normal` / `--send hide` do a REAL devnet send of 0.1 USDC using a fake wallet backed by `.keys/`.

Source map: `src/lib/{config,near,solana,magicblock,send,history,inspect}.ts`, `src/components/*`, `src/App.tsx`.
