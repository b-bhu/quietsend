# Brief for the Grok bot: quietsend infomercial ad (v2)

You are making a 49-second parody 1990s TV infomercial. Ten shots, one set, two
characters. It plays muted and looping on a website landing page, so the picture
has to tell the story on its own.

Work in the order below. Do not skip a step. Each step's output is the input to
the next one.

## What changed and why

This is a rewrite of `grokbot-brief.md`. The original file is unchanged.

- Added a full shot list (size, lens, camera move, action, exact dialogue) and
  made every image and video prompt name the camera, lens and film stock.
  Video prompts now use the seven-block Imagine template, with caps constraints
  that repeat positions and the locked camera. Source: Grok Imagine guide,
  "Inside Episode 1: The Oath".
- Character sheets must be three panels on plain grey (close-up, full front,
  full back). Check the existing sheets and remake them only if they don't
  match. Source: Imagine guide.
- Added end or mid keyframes for shots 2, 3, 6 and 9, timed to the pour, the
  sweep, the robot landing, and Mike's hand arriving on the jar. Shot 7 already
  had an end frame. Source: Imagine guide (middle keyframes timed for
  entrances and payoffs).
- Delivery uses folders: `00-refs/`, `01-keyframes/` (first framing pass), `01-keyframes-v2/` (landing-layout framing), `02-takes/`. Source:
  Imagine guide (organised file naming).
- Added a layered timeline that keeps picture, dialogue, SFX and later
  packaging (captions, tags, app overlay) in separate columns. Real app screen
  footage is a supplied asset, not generated. Captions stay out of the
  generated image so lettering is not garbled. Source: rea-video remake notes
  (`references/remake.md`, `docs/videomd.md`).
- Opening line now follows the reference ad's "Hi, [Name] here with [Product]"
  formula: "Hi, Quiet Mike here with quietsend!" Source: YouTube transcript of
  "Bitrix24 Jimmy Pays CRM".
- Shot 5 no longer mentions ETH or implies sending on Ethereum. Hide-recipient
  stays, because that feature is real. Source: product facts.
- Shot 6 robot line is "How can I help?" Source: clarity; the old line was not
  an intentional joke.
- **Shot 8: restored 13 Nov 2026 (second pass).** The limits are real and
  deployed; an earlier pass removed them in error. The sticker gag stands, with
  the numbers the contract enforces: **1 a transfer, 3 a day**. The old brief's
  "20 MAX / 100 A DAY" was invented and must not come back. Source: live
  `get_policy` on `policy.bibhu-usdc.testnet`.
- **Shot 9: restored 13 Nov 2026 (second pass), amount corrected.** The robot
  asks for **two**: over the 1-per-transfer limit, under the 3 daily limit and
  the 5 hard cap, so the contract returns `NeedsApproval` and holds the intent
  for the owner. That is a wait, which is what the shot shows. The original
  "ten thousand" and the interim "fifty" would both be over the hard cap and
  rejected outright, which the freeze would misrepresent. Source: contract
  `evaluate()` and live policy values.
- **Corrected twice; this is the final state (13 Nov 2026).** The MCP plug-in
  and the limits DO work on testnet: `mcp/server.ts` and the policy contract at
  `policy.bibhu-usdc.testnet`. An interim pass removed them after auditing only
  one branch; the work was on another and is now merged. Shots 7 to 9 advertise
  them as working, with no "coming soon" tag, and the "FOR AGENTS" tag stays.
  Source: merged repo, live contract state.
- Shortened shot 10 to 10 words so it fits the 12-word lip-sync rule, while
  keeping "It's on testnet". Source: hard rule 6.
- Shots 2 and 3 no longer pour keys and brown leather wallets. The bucket
  spills gear crypto people will recognise, all blank and with no logos:
  hardware-wallet sticks with tiny dark screens and two buttons, paper
  seed-phrase cards with blank numbered lines, a blank steel seed plate,
  yellow sticky notes, tangled USB cables, and small wallets in fox orange,
  purple and blue. SFX is a plastic and paper clatter, not only metal keys.
  The captions "A WALLET FOR EVERY CHAIN?" and "NO NEW WALLET!" stay, and now
  match the picture more closely. Source: Bibhu.
- The Robot is no longer a small table-top prop. He is a grown man, the same
  height as Mike, in a cheap cardboard robot costume, who walks in from frame
  right and stands behind the table next to Mike. Mike stays centre-right from
  shot 1 so he does not jump when the Robot enters. Shot 6 is the entrance and
  a stiff wave. In shot 7, Mike plugs the oversized plug into a socket on the
  Robot's right side (the side facing Mike), which is visible to the locked
  front camera, and the chest lamp goes green. Shots 8 to 10 keep the sticker,
  the reach for the jar, and the close, but with both men standing behind the
  table. Caps constraints are now: MIKE CENTRE-LEFT, ROBOT MAN RIGHT, BOTH
  BEHIND THE TABLE. Remake the Robot character sheet as a three-panel grey
  sheet of this costumed man. Source: Bibhu.
- Each shot is generated as its own clip and later stitched in a Remotion
  project (React-based video editing), with hard cuts, because the camera and
  set never change. Continuity depends on each shot's last frame matching the
  next shot's first frame, via the keyframes. Captions, the real app overlays,
  the fine-print crawl and the "FOR AGENTS" tag are Remotion layers. Re-render
  only the shot that changed. Do not build the Remotion project yet.
  Source: Bibhu.
- The landing-page headline and button sit over the LEFT side of the video,
  so the old 40% empty-table rule is replaced. The left ~38% of the frame
  must be empty pale cream wall plus a plain table edge: no people, no props,
  no shelf. Mike stands centre-right (about 55–60% across) in every shot,
  including when he is alone, so hard cuts do not jump. The Robot enters
  from frame right and stands far right (about 78–85%). The grey shelf moves
  to the far right edge or out of frame. The table can be ~25–35% of the
  frame height; the bottom ~15% stays calm table surface for the feature
  row; all props stay in the right half. Shot 9's coin jar is now huge,
  about knee to waist height and overflowing with gold coins. Shot 9 mid
  has only Mike's one hand just landing on the lid. The plug socket stays
  on the side of the costume that faces Mike. Source: Bibhu's landing
  layout.

## The hard rules

1. **Keyframe first, always.** Never ask for a video from words alone. Make a
   still image, get it approved, then animate that exact image. When a shot has
   a mid or end frame, generate and approve those stills too, then use them
   with the start frame. The video prompt must not invent new framing or a new
   set. It uses all seven blocks, but [Camera & Style] and [Environment &
   Atmosphere] only lock what the still already shows.
2. **One set, one camera.** Every shot is the same white table in the same
   studio. Static tripod camera. No zoom, no push-in, no pan, no tilt.
3. **The LEFT ~38% of the frame is empty pale cream wall plus a plain table
   edge.** No people, no props, no shelf in that zone. The website puts its
   headline ("No new wallet") and the Send USDC button there, vertically
   centred in the left third. Mike stands centre-right, about 55–60% of the
   way across the frame, in every shot, including when he is alone, so hard
   cuts do not jump. When the Robot is in the shot, he stands far right,
   about 78–85% across, the same height as Mike. He enters from frame right.
   The table runs across the lower part of the frame at about 25–35% of the
   frame height. The bottom ~15% is calm, empty table surface, because a
   feature row overlaps it. All props stay in the right half of the frame.
   The grey shelf, if visible, sits on the extreme far right edge, or is out
   of frame. Neither person steps in front of the table or into the left
   38%.
4. **No text in the generated image.** The model garbles lettering. Every
   caption, label, tag and sticker lettering is added later in the edit, as a
   packaging layer on clean footage. All props are blank. Seed-phrase cards
   may show blank numbered lines, but no readable words.
5. **One action per shot.** Two things happening means two shots.
6. **Twelve words or fewer per spoken line**, so the lips have a chance of
   matching.
7. **If a prompt fails, make it shorter.** Cut words, don't add them.
8. **The generator outputs ~3:2, not 16:9.** This is known and cannot be
   changed. So frame every still LOOSE: leave empty cream wall above the heads
   and empty table below, because the top and bottom will be cropped away to
   make 16:9. Mike, the Robot man, and the table must still work after that
   crop.

## Product facts (do not invent others)

quietsend sends USDC on Solana devnet only, using a NEAR testnet account
through NEAR Chain Signatures. It does not send on Ethereum or any other
chain.

Hide recipient (MagicBlock) is real: it hides the recipient address. Never
call the product private or anonymous without saying exactly what is hidden.
"Hide who you paid" is accurate. "Private", "anonymous" or "untraceable" is
not, unless qualified.

**Corrected twice. Read this version only (13 Nov 2026, second pass).**

An earlier pass removed the MCP and limit claims as unbuilt. That was wrong:
the work existed on another branch and is now merged. Both features are real
and deployed. The numbers below are read from the live contract, not invented.

**Deployed policy contract:** `policy.bibhu-usdc.testnet`. Live values for the
demo account, confirmed on chain:

- **1 USDC per transfer**
- **3 USDC a day**
- **5 USDC hard cap**

The contract returns one of three outcomes, and the difference matters for the
ad: **Allow** (signs), **NeedsApproval** (over per-transfer or over the daily
limit: it is held as an intent and waits for the owner to call
`approve_intent`), and **Reject** (over the hard cap: refused outright, no
waiting). Shot 9 shows the middle case.

**Why an agent cannot simply bypass it.** A NEAR function-call access key
cannot attach a deposit, and `sign` requires 1 yoctoNEAR. So the agent's key
cannot reach the signer at all — it can only reach the contract, and the
contract decides. The restriction is used, not worked around.

**MCP:** `mcp/server.ts`, run with `npm run mcp`. An agent connects over stdio.
End-to-end proof of the whole flow (function-call key send, needs_approval,
approve, fresh send): `scripts/p-01-policy-e2e.ts`.

**Also true, and still shown:** the transaction is inspected and simulated
before signing. Anything that would delegate the token account, change its
owner, close it, burn the tokens, call an unlisted program or move more than
amount plus fee is refused. 44 offline tests; `npm test`.

Use the real numbers in the ad. Do not invent limits.

Keep "It's on testnet" in the closing line. Do not imply mainnet or real
funds.

## Tone and shape

The idea is based on the 45-second Bitrix24 ad "Bitrix24 Jimmy Pays CRM"
(https://www.youtube.com/watch?v=qBg2oYtXMlQ). Work from its spoken shape, not
from visuals that were not verified here.

From the auto-generated English transcript, the pattern is:

1. Host intro: "Hi, [Name] here with [Product]".
2. A short promise, then a physical payoff ("just like that").
3. Feature beats as a short question plus a short payoff ("Need to segment
   your clients? Not a problem." / "Sales automation? No sweat.").
4. An automation beat: the human starts it, the system handles the rest.
5. A fast close and a direct call to action.

Tone: loud, cheerful, slightly ridiculous 1990s American TV salesman. Keep
the lines short. Let the picture carry the gag, because the landing-page loop
is muted.

Our ten shots already follow that shape (intro, dump the wallets, sweep them
off, send from one account, hide the recipient, plug in the agent, set
limits, the agent waits, close). Do not add shots or change the gag sequence.

## The look (put this at the top of every image prompt)

```
1990s American TV infomercial, shot on a broadcast studio video camera,
1990s Betacam SP videotape look. Standard zoom lens at a fixed wide setting.
Flat, bright, even studio lighting, slightly soft image, mild VHS colour bleed.
Seamless pale cream studio backdrop. Photorealistic, live action.
```

## Character sheets

Mike's existing sheet can be kept if it already matches the layout below. The
Robot has changed: remake his sheet from scratch as a grown man in the
cardboard costume, using the same three-panel layout. Do not reuse the old
table-top robot sheet.

```
Plain mid-grey seamless backdrop, no set, no furniture, no props, no text.
Even, flat studio lighting. Photorealistic, live action.
A three-panel character reference sheet, arranged left to right:
left, a close-up of the head and shoulders;
centre, a full front view, head to toe;
right, a full back view, head to toe.
[Paste the QUIET MIKE or THE ROBOT description.]
A single photorealistic image. No text, no labels, no watermarks.
```

For the Robot sheet, the close-up is the cardboard box head and shoulders of
the costume. The front view is the full costumed man, head to toe, including
the side socket on the torso (see the character description). The back view
is the back of the box head, the box torso, grey trousers and sneakers.

Use the approved sheets as image references so the same two people and the
same costumes appear in every single shot.

## The two characters

**QUIET MIKE** — stocky cheerful man, mid 40s, round face, short neat brown
hair, thick black-framed rectangular glasses, clean shaven, big confident smile.
Mustard-yellow short-sleeved button-down shirt, navy blue tie, grey trousers,
black belt. No logos. He stands behind the table, centre-right, about 55–60% of the way across the frame.

**THE ROBOT** — a grown man, the same height as Mike, wearing a cheap homemade
cardboard robot costume. Silver spray-painted box head with visible tape
seams, two round yellow lamp eyes, a rectangular mouth slot, and one wire
antenna. Silver spray-painted box torso with a round lamp in the centre of
the chest, unlit at first, glowing green later. A blank white socket is
mounted on the right side of the torso, the side that faces Mike when both
stand behind the table facing the camera, so the plug-in is visible to the
locked front camera. Silver dryer-hose sleeves. Grey trousers and sneakers.
Looks handmade and clumsy, a person in a costume, not a real machine and not
a table-top prop. He stands behind the table, on the right, next to Mike.

## The wallet pile (shots 2 and 3)

When the bucket is tipped, this is what spills onto the table. All of it is
blank. No logos, no brand marks, no readable lettering. Seed-phrase cards may
show rows of blank numbered lines, but no words.

- Small blank hardware-wallet sticks, USB-stick shaped, each with a tiny dark
  screen and two buttons
- Paper seed-phrase cards with rows of blank numbered lines
- One blank steel seed plate
- Yellow sticky notes, also blank
- Tangled USB cables
- Small wallets in fox orange, purple and blue (these hint at familiar crypto
  wallets such as MetaMask and Phantom, but do not name them or use their
  logos in any image or video prompt; in prompts, say only "small wallets in
  fox orange, purple and blue, no logos")

## The set

```
Empty TV infomercial studio. Pale cream seamless backdrop. A white laminate
demonstration table runs across the lower part of the frame and occupies about
25–35% of the frame height; its surface is clean, and the bottom 15% of the
frame is calm empty table. The LEFT 38% of the image is empty cream wall plus
the plain left edge of the table: no people, no props, no shelf. If a grey
metal shelf with plain blue, red and yellow plastic tubs is visible, it sits
only on the extreme far right edge, or is left out of frame.
MEDIUM WIDE SHOT, camera at chest height, straight on, locked off.
Broadcast studio video camera, standard zoom lens at a fixed wide setting,
1990s Betacam SP videotape look.
No people. No text, no signs, no logos. No socket on the table.
```

There is no socket on the table. The only socket in the ad is the one on the
Robot costume, used in shot 7.

Make one approved empty-set still. Use it as a set reference for every later
image.

## Shot list

Every shot is a MEDIUM WIDE, static tripod, standard zoom at a fixed wide
setting, 1990s Betacam SP look. The camera never moves. Mike is centre-right (about 55–60% across) behind
the table in every shot, so he does not jump when the Robot enters. The left
38% stays empty.

| # | Sec | Story beat | Start picture | Action | Dialogue (exact) |
|---|-----|------------|---------------|--------|------------------|
| 1 | 4 | Host intro | Mike alone, centre-right, hands at his sides, empty table, right side of the frame empty | Mike raises both hands, waves with a big smile, then lowers his arms. He stays upright and does not lean forward. | Mike: "Hi, Quiet Mike here with quietsend!" |
| 2 | 4 | The old mess | Mike centre-right, holding a grey plastic bucket tilted over the table, a hardware-wallet stick, a paper card and a cable just spilling out | Mike tips the bucket; the blank crypto-wallet gear pours onto the middle of the table. He looks at the camera and shrugs. | Mike, puzzled: "A wallet for every chain?" |
| 3 | 4 | Physical payoff | A heap of the blank crypto-wallet gear on the table, Mike's right arm raised at the left end of the heap | In one fast motion Mike sweeps his right arm left to right, pushing every item off the right end. The table is left empty. He grins at the camera. | Mike, happily: "No new wallet!" |
| 4 | 6 | One account, send | Empty table. Mike centre-right holds a tablet in both hands at chest height, screen facing camera, screen blank and softly glowing white | Mike holds the tablet up toward the camera and taps the blank screen three times with one finger, nodding as he talks. | Mike, fast and cheerful: "One NEAR account. Pick who, pick how much, send!" |
| 5 | 6 | Hide who you paid | Same as 4, but the tablet is in his left hand and his right index finger touches the blank screen | Mike swipes one finger across the blank tablet screen from right to left, then throws his free hand up and laughs. | Mike, excited: "Solangel? Send. Hide who you paid. Go nuts, man!" |
| 6 | 5 | The agent arrives | Mike centre-right behind the empty table, looking toward frame right; the right side of the frame is empty | The Robot man steps in from frame right, in front of the shelf, and stops behind the table on the right, next to Mike, the same height as Mike. He waves stiffly. Mike looks at him, surprised. | Robot, flat monotone: "Hello. I am a robot. How can I help?" |
| 7 | 5 | Plug the agent in | Both behind the table: Mike centre-right holds an oversized grey plug with a thick cable; the Robot man stands on the right, chest lamp unlit, the blank white socket visible on the side of his torso that faces Mike | Mike pushes the oversized grey plug into the socket on the Robot's right side. The Robot's chest lamp switches on and glows green. Mike gives the camera a thumbs up. | Mike: "Hey, agent! Just plug in with MCP!" |
| 8 | 5 | Set the limits | Both behind the table, Robot's chest lamp glowing green, the plug still in his side socket; Mike holds a blank white round sticker the size of his palm | Mike presses the blank white round sticker firmly onto the centre of the Robot's chest with two fingers, then gives it one extra pat. The Robot looks down at the sticker. | Mike, quickly: "Set your limits! One a transfer, three a day!" |
| 9 | 5 | Over the limit, it waits | Both behind the table; a glass jar full of gold coins on the table between them; the Robot's arm half raised toward the jar; chest lamp glowing green | The Robot slowly reaches one arm toward the jar. Mike calmly places his hand flat on the lid. The Robot freezes mid-reach and waits. Mike smiles at the camera. | Robot, flat monotone: "I would like to send two." Then Mike, friendly: "Over the limit? It waits for you!" |
| 10 | 5 | Close | Both stand behind the table: Mike centre-right pointing straight at camera; the Robot man on the right, chest lamp glowing green | Mike points straight at the camera with his right hand and holds the pose with a big grin. The Robot slowly raises one arm. | Mike, loud and fast: "It's on testnet. Nobody got hurt. Try this at home!" |

Word counts, for the 12-word rule: (1) 6, (2) 5, (3) 3, (4) 9, (5) 9, (6) 9,
(7) 7, (8) 10, (9) 6 then 7, (10) 10.

## File naming

Keep approved stills and clips in this tree. Do not add captions, music or
titles to the files.

```
00-refs/
  mike-sheet.png
  robot-sheet.png
  set-empty.png
01-keyframes/
  shot-01-start.png
  shot-02-start.png
  shot-02-end.png
  shot-03-start.png
  shot-03-end.png
  shot-04-start.png
  shot-05-start.png
  shot-06-start.png
  shot-06-mid.png
  shot-06-end.png
  shot-07-start.png
  shot-07-end.png
  shot-08-start.png
  shot-09-start.png
  shot-09-mid.png
  shot-10-start.png
02-takes/
  shot-01.mp4
  shot-02.mp4
  ...
  shot-10.mp4
```

If a take is rejected, keep it as `02-takes/shot-01-take-02.mp4` and only
promote a take to `shot-01.mp4` once it is approved.

For hard cuts in the later Remotion edit, the end keyframe of one shot must
match the start keyframe of the next. In particular: `shot-03-end` matches
the empty table in `shot-04-start`; `shot-05` ends on Mike centre-right at the
empty table, which is `shot-06-start`; `shot-06-end` matches `shot-07-start`
(Robot standing on the right, lamp unlit); `shot-07-end` matches
`shot-08-start` (lamp green, plug in).

## Step A: make the keyframe stills

One still per row in the table below. Pattern for every one:

```
[paste THE LOOK]
Use the QUIET MIKE reference, the ROBOT reference if the Robot man is in the
shot, and the SET reference. Same two people, same costumes, same set, same
camera position.
MEDIUM WIDE SHOT, camera at chest height, straight on and level.
Broadcast studio video camera, standard zoom lens at a fixed wide setting,
1990s Betacam SP videotape look.
Quiet Mike stands behind the white table, centre-right, about 55–60% across. [WHAT THE STILL MUST SHOW]
The LEFT 38% of the frame is empty cream wall and a plain table edge.
The white table runs across the lower 25–35% of the frame. The bottom 15%
is calm empty table surface. Props, if any, stay in the right half.
Empty cream wall above their heads.
A single photorealistic image. No text anywhere. No logos. No readable words
on cards or stickers.
```

| File | What the still must show |
|---|---|
| `shot-01-start` | Mike alone, centre-right, hands at his sides, empty table, right side of the frame empty |
| `shot-02-start` | Mike centre-right, holding a grey plastic bucket tilted over the table, a blank hardware-wallet stick, a paper seed-phrase card with blank numbered lines, and a USB cable just spilling out |
| `shot-02-end` | A heap of the blank crypto-wallet gear on the middle of the table (hardware-wallet sticks, paper seed-phrase cards with blank numbered lines, one blank steel seed plate, yellow sticky notes, tangled USB cables, and small wallets in fox orange, purple and blue, no logos); Mike still holding the bucket |
| `shot-03-start` | The same heap of blank crypto-wallet gear on the table, Mike's right arm raised at the left end of the heap |
| `shot-03-end` | Empty table, Mike centre-right grinning, his right arm just finished the sweep at the right end |
| `shot-04-start` | Empty table. Mike centre-right holds a tablet in both hands at chest height, screen facing camera, screen blank and softly glowing white |
| `shot-05-start` | Same as 4, but the tablet is in his left hand and his right index finger touches the blank screen |
| `shot-06-start` | Mike centre-right behind the empty table, looking toward frame right; the right side of the frame is empty. No Robot yet |
| `shot-06-mid` | The Robot man mid-stride entering from frame right, in front of the shelf, same height as Mike; Mike still centre-right, looking toward him. Chest lamp unlit |
| `shot-06-end` | The Robot man standing behind the table on the right, facing camera, one hand in a stiff wave; Mike looking at him, surprised. Chest lamp still unlit. Both behind the table |
| `shot-07-start` | Both behind the table: Mike centre-right holds an oversized grey plug with a thick cable; the Robot man stands on the right; the blank white socket is visible on the side of the torso that faces Mike. Chest lamp unlit |
| `shot-07-end` | The plug is seated in that side socket, the thick cable hanging; the Robot's chest lamp is glowing green; Mike gives a thumbs up |
| `shot-08-start` | Both behind the table, the Robot's chest lamp glowing green, the plug still in the side socket; Mike holds a blank white round sticker the size of his palm |
| `shot-09-start` | Both behind the table; a glass jar full of gold coins on the table between them; the Robot's arm half raised toward it; chest lamp glowing green |
| `shot-09-mid` | Same huge overflowing jar; only Mike's one hand is just landing flat on the lid; the Robot's arm is still reaching and has not touched the jar |
| `shot-10-start` | Both stand behind the table: Mike centre-right pointing straight at camera; the Robot man on the right, chest lamp glowing green |

Do not move on from a still until the left 38% is empty of people and props,
the table is about 25–35% of the frame height, and there is empty wall above
their heads. Neither person stands in front of the table or in the left 38%.

## Step B: animate each approved still

Take the approved still (and the mid or end frame, when the shot has one) and
animate it. Every video prompt uses all seven blocks below. Paste all seven
every time, even when a block is unchanged.

If a prompt fails, make it shorter. Cut words, don't add them.

### Shared blocks (used in every shot)

**[Camera & Style]**
Animate this image. 1990s American TV infomercial, shot on a broadcast studio
video camera, 1990s Betacam SP videotape look. Standard zoom lens at a fixed
wide setting. Flat, bright, even studio lighting, slightly soft image, mild VHS
colour bleed. Photorealistic, live action. STATIC TRIPOD CAMERA. The framing
never changes from the first frame to the last. No zoom, no push-in, no pan, no
tilt. MEDIUM WIDE SHOT, camera at chest height, straight on and level.

**[Environment & Atmosphere]**
Same empty TV infomercial studio as the still. Pale cream seamless backdrop.
The white laminate table runs across the lower 25–35% of the frame. The bottom
15% is calm empty table surface. The left 38% is empty cream wall and a plain
table edge. If a grey metal shelf with plain blue, red and yellow tubs is
visible, it is only on the extreme far right edge. Soft, even studio light.
No change in weather, time of day, or set dressing. No socket on the table.

**[Restrictions / Constraints]**
THE LEFT 38% OF THE FRAME STAYS EMPTY PALE CREAM WALL AND A PLAIN TABLE EDGE.
NO PEOPLE, NO PROPS, NO SHELF IN THE LEFT 38%. MIKE STAYS CENTRE-RIGHT, ABOUT
55 TO 60% ACROSS, STANDING BEHIND THE TABLE, IN THE SAME SPOT IN EVERY SHOT.
THE FAR RIGHT STAYS EMPTY UNTIL THE ROBOT MAN ENTERS FROM FRAME RIGHT. WHEN
THE ROBOT MAN IS IN THE SHOT, HE STAYS FAR RIGHT, ABOUT 78 TO 85% ACROSS,
STANDING BEHIND THE TABLE, THE SAME HEIGHT AS MIKE. BOTH STAY BEHIND THE
TABLE. NEITHER STEPS IN FRONT OF THE TABLE OR INTO THE LEFT 38%. THE TABLE
OCCUPIES ABOUT 25 TO 35% OF THE FRAME HEIGHT. THE BOTTOM 15% STAYS CALM EMPTY
TABLE SURFACE. ALL PROPS STAY IN THE RIGHT HALF. EMPTY CREAM WALL ABOVE THEIR
HEADS. STATIC TRIPOD CAMERA. NO ZOOM, NO PUSH-IN, NO PAN, NO TILT. THE FRAMING
NEVER CHANGES. ONE CONTINUOUS SHOT, NO CUTS. NO ON-SCREEN TEXT, NO CAPTIONS,
NO SUBTITLES, NO LOGOS, NO LETTERING ON PROPS. NO READABLE WORDS ON CARDS OR
STICKERS. NO MUSIC.

### The ten shots

Copy the four changing blocks into the template. Where a shot lists a mid or
end frame, use those approved stills as the middle or last keyframe.

**1 — 4 sec** — start frame: `shot-01-start`

[Subject Motion / Action] Mike raises both hands and waves at the camera with a big smile, then lowers his arms to his sides. He stays standing upright and does not lean forward.

[Physics & Details] His shirt and tie move only as much as a normal wave requires. Glasses stay on his face.

[Audio] Loud and cheerful, American TV salesman voice: "Hi, Quiet Mike here with quietsend!"

[SFX] Faint studio room tone.

**2 — 4 sec** — start frame: `shot-02-start`; end frame: `shot-02-end`

[Subject Motion / Action] Mike tips the grey bucket and the blank crypto-wallet gear pours onto the middle of the table: hardware-wallet sticks, paper seed-phrase cards, a steel seed plate, yellow sticky notes, tangled USB cables, and small wallets in fox orange, purple and blue. He looks at the camera and shrugs.

[Physics & Details] Plastic hardware-wallet sticks and the steel plate clatter and bounce slightly. Paper cards and sticky notes flutter and land flat. Cables slump. Colourful wallets land flat. Nothing falls off the table. No logos and no readable words appear on any item.

[Audio] Puzzled: "A wallet for every chain?"

[SFX] A mixed clatter of plastic, paper and a steel plate on a hard table, not only metal keys.

**3 — 4 sec** — start frame: `shot-03-start`; end frame: `shot-03-end`

[Subject Motion / Action] In one fast motion Mike sweeps his right arm across the table from left to right, pushing every hardware-wallet stick, card, plate, sticky note, cable and colourful wallet off the right end. The table is left completely empty. He grins at the camera.

[Physics & Details] Objects slide and fall out of frame to the right. Paper flutters. Nothing bounces back onto the table.

[Audio] Shouts happily: "No new wallet!"

[SFX] Scraping sweep, then a mixed crash of plastic, paper and a steel plate hitting the floor off screen.

**4 — 6 sec** — start frame: `shot-04-start`

[Subject Motion / Action] Mike holds the tablet up toward the camera and taps the blank screen three times with one finger, nodding as he talks.

[Physics & Details] The tablet screen stays blank white the whole time. No icons, no text, no picture appear on the glass.

[Audio] Fast and cheerful: "One NEAR account. Pick who, pick how much, send!"

[SFX] Three soft taps on glass.

**5 — 6 sec** — start frame: `shot-05-start`

[Subject Motion / Action] Mike swipes one finger across the blank tablet screen from right to left, then throws his free hand up in the air and laughs.

[Physics & Details] The tablet screen stays blank white the whole time. No icons, no text, no picture appear on the glass.

[Audio] Excited: "Solangel? Send. Hide who you paid. Go nuts, man!"

[SFX] One soft swipe on glass.

**6 — 5 sec** — start frame: `shot-06-start`; mid frame: `shot-06-mid` (timed to the Robot man entering from the right); end frame: `shot-06-end`

[Subject Motion / Action] The Robot man steps in from frame right, walking in front of the shelf, and stops behind the table on the right, next to Mike, the same height as Mike. He waves stiffly, one dryer-hose arm rising and falling. Mike turns slightly toward him and looks surprised.

[Physics & Details] He walks like a person in a stiff cardboard costume. The box head and torso stay on. The yellow lamp eyes are on. The chest lamp stays unlit. He does not step in front of the table or into the left 38% of the frame.

[Audio] The Robot, flat monotone mechanical voice: "Hello. I am a robot. How can I help?"

[SFX] A few footsteps and a light cardboard rustle, then one electronic beep.

**7 — 5 sec** — start frame: `shot-07-start`; end frame: `shot-07-end`

[Subject Motion / Action] Mike pushes the oversized grey plug into the blank white socket on the Robot's right side, the side that faces Mike. The round lamp on the Robot's chest switches on and glows green. Mike gives the camera a thumbs up.

[Physics & Details] The thick cable hangs and sways with weight. The chest lamp is unlit until the plug seats, then it glows green and stays green. The socket is on the costume, not on the table. Both men stay behind the table.

[Audio] Mike: "Hey, agent! Just plug in with MCP!"

[SFX] A solid plastic click, then a rising electronic power-up hum.

**8 — 5 sec** — start frame: `shot-08-start`

**Restored 13 Nov 2026 (second pass).** An earlier pass replaced this shot because the limits looked unbuilt. They are built and deployed. The sticker gag is back, with the numbers the contract actually enforces: **1 per transfer, 3 a day** (hard cap 5). Do not write "20 MAX" or "100 A DAY".

[Subject Motion / Action] Mike presses the blank white round sticker firmly onto the centre of the Robot's chest with two fingers, then gives it one extra pat. The Robot looks down at the sticker.

[Physics & Details] The sticker is blank, with no lettering — the caption carries the numbers. It stays stuck on the cardboard torso. The chest lamp stays green. The plug stays in the side socket. Both men stay behind the table.

[Audio] Quickly: "Set your limits! One a transfer, three a day!"

[SFX] A flat tap on cardboard.

**9 — 5 sec** — start frame: `shot-09-start`; mid frame: `shot-09-mid` (timed to Mike's one hand landing on the lid; the Robot must not be touching the jar)

[Subject Motion / Action] The Robot slowly reaches one arm toward the huge overflowing glass jar of gold coins. Mike calmly places one hand flat on the lid. The Robot freezes mid-reach and waits, arm still extended, not touching the jar. Mike smiles at the camera.

[Physics & Details] The jar does not tip or slide. Coins stay inside the jar. The Robot does not grab the jar and does not lower his arm. Both men stay behind the table. The reach is a standing person reaching down to the table, not a table-top prop.

[Audio] The Robot, flat monotone: "I would like to send two." Then Mike, friendly: "Over the limit? It waits for you!"

[SFX] One short, mild game-show hold-tone when Mike's hand lands on the lid. Not a wrong-answer buzzer; this is a wait, not a refusal.

**Restored 13 Nov 2026 (second pass), with a corrected amount.** The robot asks for **two**, which is over the 1-per-transfer limit and under both the 3 daily limit and the 5 hard cap. The contract therefore returns `NeedsApproval` and holds it as an intent until the owner approves — a wait, which is what the shot shows. Do not use a number above 5: that is the hard cap and would be rejected outright, not held, so the hold-tone and the freeze would be wrong.

If the two voices get mixed up, split this into two separate shots: first the
Robot's line and the reach, then Mike's hand, his line, and the freeze.

**10 — 5 sec** — start frame: `shot-10-start`

[Subject Motion / Action] Mike points straight at the camera with his right hand and holds the pose with a big grin. The Robot man, standing on the right behind the table, slowly raises one arm.

[Physics & Details] Mike holds the point without leaning into the camera. The Robot's arm rises smoothly and stops. Both men stay behind the table, Mike centre-right, the Robot on the right.

[Audio] Loud and fast: "It's on testnet. Nobody got hurt. Try this at home!"

[SFX] Soft servo whirr as the Robot's arm rises.

## Step C: hand back

Deliver:

- the approved character sheets and the empty-set still in `00-refs/`
- the approved keyframe stills in `01-keyframes/`, using the names above
- the ten clips as `02-takes/shot-01.mp4` through `02-takes/shot-10.mp4`

Do not add captions, music, tags or titles. That happens in the edit.

## Edit and assembly

Each shot is generated as its own clip, then stitched later in a Remotion
project (React-based video editing). Do not build the Remotion project yet.

Use hard cuts between shots, because the camera and the set never change.
Continuity depends on each shot's last frame matching the next shot's first
frame. That is what the end and start keyframes are for. If a cut jumps
(Mike shifts, the table changes, the Robot pops in without the entrance
shot), remake the stills so they match before generating a new take.

Captions, the real app screen overlays on the tablet in shots 4 and 5, the
fine-print crawl, and the "FOR AGENTS" tag are Remotion layers. They are not
baked into the generated clips.

If one shot changes, re-render only that shot and drop the new clip into the
same timeline slot.

## Packaging (added later in the edit, not your job)

This layer sits on top of the clean generated clips. Do not bake any of it
into the stills or the takes.

Captions in heavy white type with a blue outline, one per shot:

1. QUIET MIKE
2. A WALLET FOR EVERY CHAIN?
3. NO NEW WALLET!
4. ONE ACCOUNT. SEND.
5. SOLANGELS. HIDE WHO YOU PAID.
6. (none)
7. JUST PLUG IN WITH MCP
8. 1 MAX · 3 A DAY
9. WAITING FOR HUMAN
10. DO TRY THIS AT HOME.

Shots 2 and 3 now show crypto-wallet gear, so "A WALLET FOR EVERY CHAIN?"
and "NO NEW WALLET!" match the picture directly.

Real app screen footage is laid over the blank tablet in shots 4 and 5. That
footage is a real asset, supplied in the edit, not generated. A fast
fine-print crawl runs along the bottom of shot 5. It must stay accurate, for
example: demo on NEAR testnet and Solana devnet only; sends USDC on Solana;
hide recipient hides the recipient address; no real funds. It must not say
private, anonymous, Ethereum, or mainnet.

A small "FOR AGENTS" tag sits in a corner through shots 7 to 9. Not "COMING
SOON".

Music, if any, is added in the edit. The landing-page loop plays muted, so
the picture still has to work with the sound off.
