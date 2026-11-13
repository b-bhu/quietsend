# Review brief: quietsend ad, edit v4

You are a senior commercial editor and motion designer reviewing a finished rough edit.
Write a **draft of concrete improvements** we can apply in the edit.

## Hard constraints (do not break these)

- **Do not add or cut clips.** The nine clips, their order and their trims are locked.
  No new footage can be generated. Shots for "spending limits" and "over the limit, it
  waits" were dropped on purpose; do not ask for them.
- **No music.** The client said no music bed.
- Everything you suggest must be doable in the edit as **overlays, captions, graphics,
  reframing (crop / zoom / position per clip), timing of overlays, colour, sound effects**.
- **Product facts only.** Do not invent features (see "Product facts" below).

## What you have

- The edited video: `reviews/ad-v4/quietsend-v4.mp4` (42.0 s, 1920x1080, 24 fps, sound).
- Two frames per clip, 960x540: `reviews/ad-v4/frames/clipNN_<seconds>s.jpg`.
  **Look at every frame image.** Times in the filenames are timeline seconds.
- Product docs you may quote on screen: `docs/INTEGRATING.md`, `llms.txt`, `README.md`.

## The ad

A parody 1990s TV infomercial. Host "Quiet Mike" (mustard shirt, navy tie) behind a
white demo table; a cardboard Robot appears later. One set, locked camera. It plays on
the landing page **muted and looping by default**, so on-screen text must carry the
story without sound. The landing page puts its headline and Send button over the
**bottom ~40%** (the empty table top) and the **left third** of the frame.

Already done in the edit: trims to each spoken line; the real app UI composited onto the
blank tablet in clips 4-6 (tracked, Mike's fingers stay in front); a 90s TV look
(grade, horizontal tape softness, colour bleed, scanlines, grain, vignette, a rare
rolling tracking band); framing matched across cuts (the incoming clip starts framed like
the outgoing clip's last frame, then eases back over 20 frames).

| # | Timeline | Clip | Spoken line (from the script) | On screen |
|---|---|---|---|---|
| 1 | 0.00-5.29 | Intro | "Hi, Quiet Mike here with quietsend!" | Mike waves, then hands on table |
| 2 | 5.29-9.58 | Bucket | "A wallet for every chain?" | Tips a bucket of blank hardware wallets, seed cards, cables onto the table, shrugs |
| 3 | 9.58-14.33 | Sweep | "No new wallet!" | Sweeps the pile off the table, grins, waves |
| 4 | 14.33-18.04 | Tablet A | "One NEAR account. Pick who, pick how much, send!" | App: Send USDC form fills, button, "Sent 20.00 USDC" |
| 5 | 18.04-22.96 | Tablet B | "Solangel? Send. Hide who you paid. Go nuts, man!" | App: Normal / Hide recipient switch flips to HIDDEN, then receipt with Recipient "Not in this tx" HIDDEN |
| 6 | 22.96-27.79 | Tablet C | (third tablet take) | App: two-step hidden receipt, "You -> vault" / "Vault -> them", "No transaction names you and them together." |
| 7 | 27.79-31.00 | Robot | Robot: "Hello. I am a robot. How can I help?" | Robot walks in beside Mike |
| 8 | 31.00-36.54 | Plug | "Hey, agent! Just plug in ..." | Mike plugs a giant grey plug into a socket on the Robot's side; chest lamp turns green; thumbs up |
| 9 | 36.54-42.00 | Close | "It's on testnet. Nobody got hurt. Try this at home!" | Mike points at camera, Robot waves |

## What we plan next (critique and improve this)

1. **Captions that are NOT subtitles.** Big kinetic 90s-infomercial words placed **all
   over the frame**, interacting with the set: in the empty wall space, stamped on the
   table, next to props, following the action. **Not every line** gets one: only the
   punches. Heavy condensed type (Anton-like), white with a thick blue outline, pop in
   (110% -> 100%).
2. **Show the real docs in the agent section (clips 7-9).** A docs card / terminal
   overlay with real content from `docs/INTEGRATING.md`, e.g. `npm run mcp`, the policy
   contract `policy.bibhu-usdc.testnet`, `per_transfer` / `daily` / `approve_intent`.
   Clip 8's caption must say "PLUG IN YOUR AGENT".

## Product facts (do not invent others)

- Sends **USDC on Solana devnet** from a **NEAR testnet account** via NEAR Chain
  Signatures. No other chains. Testnet only, no real money.
- **Hide recipient** (MagicBlock) hides **who you paid**, not the amount or timing.
  Never say "private", "anonymous" or "untraceable" unqualified.
- **Agents:** an MCP server (`npm run mcp`) sends through a policy contract
  `policy.bibhu-usdc.testnet` with a per-transfer limit, a daily limit and a hard cap;
  anything over a limit is held until the owner calls `approve_intent`.
- Every transaction is inspected and simulated before signing (the "guard"); `npm test`.

## Your output

Plain Markdown, no preamble, these sections:

1. **Verdict** (3 lines max): what works, the biggest problem.
2. **Per-clip draft** for all 9 clips: for each, what to put on screen, the exact words,
   where (describe position in the 1920x1080 frame, e.g. "upper-left wall, x 120-760,
   y 90-300"), when (timeline seconds in/out), how it animates, and any reframing
   (zoom %, shift) for that clip. Say "nothing" if a clip should stay clean.
3. **Docs moment** (clips 7-9): exactly which lines from the docs to show, the layout,
   and timing.
4. **Product clarity**: anything on screen that is wrong, unclear or oversells,
   checked against the product facts.
5. **Top 5 changes** ranked by impact.
