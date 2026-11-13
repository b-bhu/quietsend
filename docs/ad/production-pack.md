# quietsend ad: production pack for Grok Imagine

A 49-second parody infomercial. Ten shots, one set, two characters. Follow the steps in order; each step's output is the input to the next.

The method is the one from Grok Imagine's own prompting guide ("Inside Episode 1: The Oath"): script, shot list, character sheets, location, keyframes, video prompts in blocks, then the edit.

Script version 3, locked by Bibhu on 13 Nov 2026.

## Rules that keep this cheap to make

1. **One set, locked-off camera.** Every shot is the same table in the same studio. No camera moves. Grok drifted in on the first test, so every video prompt starts with the camera lock.
2. **No generated text.** AI video garbles lettering. Every caption, label and stamp is added in the edit. Props are blank.
3. **The tablet screen is blank.** Grok cannot draw our app. In shots 4 and 5 Mike holds a tablet with an empty screen; the real app footage is laid over the picture in the edit while his voice keeps playing.
4. **One action per shot.** If a shot needs two things to happen, it is two shots.
5. **Short lines.** About twelve words per shot, so lips and audio have a chance of matching.
6. **Keep the bottom 40% calm.** The table top fills the lower 40% of the frame and stays empty at its front edge. The landing page puts its headline and button there.
7. **If a prompt fails, make it shorter.** This is the guide's own advice.

## Step 1. Script (49 seconds)

Who it speaks to: ETH bros and Solangels (shot 5), developers and agents (the Robot, shots 6 to 9).

| # | Sec | Who | Line | Action | Caption added in edit |
|---|---|---|---|---|---|
| 1 | 4 | Mike | "Hi, Quiet Mike here!" | Waves both hands at camera | QUIET MIKE |
| 2 | 4 | Mike | "A wallet for every chain?" | Tips a bucket of keys and leather wallets onto the table | A WALLET FOR EVERY CHAIN? |
| 3 | 4 | Mike | "No new wallet!" | Sweeps the whole pile off the table with one arm | NO NEW WALLET! |
| 4 | 6 | Mike | "One NEAR account. Pick who, pick how much, send!" | Holds up a tablet and taps it. App footage: the form, then "Sent" | ONE ACCOUNT. SEND. |
| 5 | 6 | Mike | "ETH bro? Solangel? Send. Hide who you paid. Go nuts, man!" | Swipes the tablet. App footage: the Hide recipient switch, then the receipt with the recipient marked HIDDEN | ETH BROS. SOLANGELS. GO NUTS. plus fine-print crawl |
| 6 | 5 | Robot | "Hello. I am a robot. How can I do it?" | Mike lifts the small cardboard Robot onto the table | none |
| 7 | 5 | Mike | "Hey, agent! Just plug in with MCP!" | Mike pushes a big plug into the socket on the table; the Robot's chest light turns green | JUST PLUG IN WITH MCP |
| 8 | 5 | Mike | "Set your limits! One a transfer, three a day!" | Presses a blank round sticker on the Robot's chest | 1 MAX · 3 A DAY |
| 9 | 5 | Robot, then Mike | "I would like to send two." / "Over the limit? It waits for you!" | Robot's arm reaches for a jar of coins; Mike calmly puts his hand on the lid | WAITING FOR HUMAN |
| 10 | 5 | Mike | "It's on testnet. No one got hurt in this stunt. Do try this at home!" | Mike points at camera with a big grin | DO TRY THIS AT HOME |

**Fine-print crawl for shot 5** (small text scrolling fast along the bottom, read by a speed-talking voice): "Amount and timing still visible. A patient observer could guess. Hides who you paid, not that you paid."

## Step 2. The look (paste at the top of every image and video prompt)

```
1990s American TV infomercial, shot on a broadcast studio video camera. Flat, bright, even studio lighting, slightly soft image, mild VHS colour bleed. Seamless pale cream studio backdrop. Photorealistic, live action. 16:9.
```

## Step 3. Character sheets (done)

Both sheets exist in Bibhu's Grok account. Previews are in `stills/`.

**Quiet Mike** (kept)

```
Photorealistic character reference sheet for QUIET MIKE, a cheerful 1990s TV infomercial host.
CHARACTER: Stocky man in his mid 40s, round friendly face, short neat brown hair, thick black-framed rectangular glasses, clean shaven, big confident smile.
COSTUME: Mustard-yellow short-sleeved button-down shirt, navy blue tie, grey trousers, black belt. No logos, no text.
LAYOUT: Single wide 16:9 image divided into THREE VERTICAL PANELS with thin white dividing lines. LEFT: three-quarter facial close-up. CENTER: full-body front view, arms relaxed. RIGHT: full-body back view.
All three panels show the EXACT SAME MAN in the EXACT SAME COSTUME.
PHOTOGRAPHY: Neutral medium-grey seamless studio background, soft diffused lighting, natural skin texture.
STRICTLY PHOTOREALISTIC. No illustration, no text, no labels, no other people.
```

**The Robot** (kept; it came out toy-sized, about knee height, so the script treats it as a small robot that stands on the table)

```
Photorealistic character reference sheet for THE ROBOT: an adult wearing an obviously homemade cardboard robot costume.
COSTUME: Square cardboard box head and rectangular cardboard box body, both spray-painted silver with visible tape seams. Two round yellow lamp eyes, a flat rectangular mouth slot, one short wire antenna. Flexible silver dryer-hose arms and legs, grey gloves, grey boots. One round unlit lamp in the centre of the chest. No logos, no text.
LAYOUT: Single wide 16:9 image divided into THREE VERTICAL PANELS with thin white dividing lines. LEFT: close-up of the head. CENTER: full-body front view. RIGHT: full-body back view.
All three panels show the EXACT SAME COSTUME.
PHOTOGRAPHY: Neutral medium-grey seamless studio background, soft diffused lighting.
STRICTLY PHOTOREALISTIC. Looks handmade and slightly clumsy, not a real machine. No illustration, no text, no labels, no other people.
```

## Step 4. The set (done)

```
[paste THE LOOK]
Empty TV infomercial studio set. A long white laminate demonstration table runs across the frame and fills the lower 40% of the image; its front edge is clean and empty. Behind it, a pale cream seamless backdrop. On the far right, a grey metal shelf with a few plain coloured plastic tubs. One blank wall socket is mounted on the right end of the table top.
MEDIUM WIDE SHOT, camera at chest height, straight on, locked off.
No people. No text, no signs, no logos.
```

## Step 5. Keyframes (one still per shot, before any video)

Work inside the Quiet Mike chat so Grok has his sheet as context. Pattern:

```
[paste THE LOOK]
Use the EXACT SAME MAN and COSTUME from the reference sheet. Same set, same camera position.
MEDIUM SHOT, camera straight on and level. Quiet Mike stands behind the white table, centred, facing camera. [what is on the table and what he is holding at the START of the shot]
The white table top fills the lower 40% of the frame and its front is empty. No text anywhere.
```

Start-of-shot details to fill in:

| # | What the still must show |
|---|---|
| 1 | Mike alone, hands at his sides, empty table |
| 2 | Mike holding a grey plastic bucket tilted over the table, a few keys just spilling |
| 3 | A heap of metal keys and brown leather wallets on the table, Mike's right arm raised at the left end of the heap |
| 4 | Empty table. Mike holds a tablet in both hands at chest height, screen facing the camera, screen blank and softly glowing white |
| 5 | Same as 4, but the tablet is in his left hand and his right index finger touches the blank screen |
| 6 | Mike holds the small cardboard Robot in both hands just above the table top, looking at it |
| 7 | The small Robot stands on the table to the right of centre, facing camera. Mike holds an oversized grey plug with a thick cable |
| 8 | The Robot on the table with its chest lamp glowing green. Mike holds a blank white round sticker the size of his palm |
| 9 | A glass jar full of gold coins on the table next to the Robot; the Robot's arm is half raised toward it |
| 10 | Mike pointing straight at camera; the Robot stands on the table beside him |

For shot 7, also make an **end frame** (plug in the socket, chest lamp green) and use it as the last keyframe, so the model knows where the action has to finish.

## Step 6. Video prompts

Each prompt starts with the camera lock, then the look, then short blocks, then the shared constraints. Shot 1 is written out in full; the rest give only the blocks that change.

**Camera lock (first line of every video prompt)**

```
STATIC CAMERA ON A TRIPOD. The framing never changes. No zoom, no push-in, no pan, no tilt.
```

**Shared constraints (paste at the bottom of every video prompt)**

```
[Constraints]
ONE CONTINUOUS SHOT. NO CUTS.
The image is the EXACT starting frame. Same man, same costume, same set throughout.
The white table stays in the lower part of the frame for the whole shot and its front stays empty.
NO ON-SCREEN TEXT, NO CAPTIONS, NO LOGOS, NO SUBTITLES.
NO MUSIC.
```

**Shot 1**

```
[paste CAMERA LOCK]
[paste THE LOOK]
[Action] Quiet Mike raises both hands and waves at the camera with a big smile, then drops his hands to the table.
[Audio] Mike says, loud and cheerful, in an American TV salesman voice: "Hi, Quiet Mike here!"
[SFX] Faint studio room tone.
[paste SHARED CONSTRAINTS]
```

**Shot 2**

```
[Action] Mike tips the grey bucket and a pile of metal keys and brown leather wallets pours onto the middle of the table. He looks at the camera and shrugs.
[Physics] Keys bounce and scatter slightly, wallets land flat, nothing falls off the table.
[Audio] Mike says, puzzled: "A wallet for every chain?"
[SFX] Loud clatter of metal keys on a hard table.
```

**Shot 3**

```
[Action] In one fast motion Mike sweeps his right arm across the table from frame left to frame right, pushing every key and wallet off the right end. The table is left completely empty. He grins at the camera.
[Physics] Objects slide and fall out of frame to the right.
[Audio] Mike shouts happily: "No new wallet!"
[SFX] Scraping sweep, then a crash of keys hitting the floor off screen.
```

**Shot 4**

```
[Action] Mike holds the tablet up toward the camera and taps the blank screen three times with one finger, nodding as he talks.
[Physics] The tablet screen stays blank white the whole time.
[Audio] Mike says, fast and cheerful: "One NEAR account. Pick who, pick how much, send!"
[SFX] Three soft taps on glass.
```

**Shot 5**

```
[Action] Mike swipes one finger across the blank tablet screen from right to left, then throws his free hand up in the air and laughs.
[Physics] The tablet screen stays blank white the whole time.
[Audio] Mike says, excited: "ETH bro? Solangel? Send. Hide who you paid. Go nuts, man!"
[SFX] One soft swipe on glass.
```

**Shot 6**

```
[Action] Mike sets the small cardboard Robot down on the table, standing upright and facing the camera, then takes his hands away. The Robot's head turns slightly toward Mike. Mike looks at it, surprised.
[Physics] The Robot is light and wobbles a little when set down. Its lamp eyes glow yellow.
[Audio] The Robot says in a flat, monotone, mechanical voice: "Hello. I am a robot. How can I do it?"
[SFX] A soft cardboard thud, then one electronic beep.
```

**Shot 7** (use the start frame and the end frame)

```
[Action] Mike pushes the oversized grey plug into the socket on the right end of the table. The round lamp on the Robot's chest switches on and glows green. Mike gives the camera a thumbs up.
[Physics] The thick cable hangs and sways with weight.
[Audio] Mike says: "Hey, agent! Just plug in with MCP!"
[SFX] A solid plastic click, then a rising electronic power-up hum.
```

**Shot 8**

```
[Action] Mike presses the blank white round sticker firmly onto the centre of the Robot's chest with two fingers, then gives it one extra pat. The Robot looks down at the sticker.
[Audio] Mike says quickly: "Set your limits! One a transfer, three a day!"
[SFX] A flat tap on cardboard.
```

**Shot 9**

```
[Action] The Robot slowly reaches one arm toward the glass jar of gold coins. Mike calmly places his hand flat on top of the jar. The Robot stops and lowers its arm. Mike smiles at the camera.
[Audio] The Robot says in a flat monotone: "I would like to send two." Then Mike says, friendly: "Over the limit? It waits for you!"
[SFX] One short game-show wrong-answer buzzer when Mike's hand lands on the jar.
```

If the two voices get mixed up, split this into two shots: the Robot's line, then Mike's.

**Shot 10**

```
[Action] Mike points straight at the camera with his right hand and holds the pose with a big grin. The Robot on the table slowly raises one arm.
[Audio] Mike says, loud and fast: "It's on testnet. No one got hurt in this stunt. Do try this at home!"
[SFX] Soft servo whirr as the Robot's arm rises.
```

## Step 7. The edit (CapCut or DaVinci Resolve)

1. **Assemble** the ten clips in order. Trim each to its line; cut hard, with no fades. Target 45 to 50 seconds.
2. **Fit to 16:9.** If Grok still gives 3:2 clips, scale each one up to fill a 16:9 frame and slide it so the table stays in view.
3. **App footage for shots 4 and 5.** Record `docs/mocks/02-landing.html` in a browser at 16:9. After the first second of each shot, cover the picture with the recording and keep Mike's audio underneath.
   - Shot 4: the form being filled in, then the "Sent" receipt.
   - Shot 5: the Hide recipient switch being turned on, then the receipt with the recipient marked HIDDEN.
4. **Captions.** Add each caption from the script table as it is spoken. Use a heavy italic sans font (Anton, Impact or Bangers), white fill with a thick blue outline, popping in at 110% then settling to 100%. Keep them in the top two thirds of the frame.
5. **Fine-print crawl** on shot 5: tiny white text scrolling right to left along the bottom at high speed.
7. **Labels on props.** Add "MCP" on the plug (shot 7) as tracked text if it reads cleanly, or leave it and let the caption carry it. Leave the sticker blank — the caption carries the numbers. If any limit figure is burned in, it must be **1 MAX · 3 A DAY**, the values the deployed contract enforces. Never "20 MAX" or "100 A DAY".
8. **Sound.** Add a cheap upbeat stock music bed under everything, and the buzzer in shot 9 if the model's own is weak. If any spoken line is garbled, replace it with a recorded or generated voiceover for that shot.
9. **Grade.** Slightly raise saturation, soften the image a touch, and optionally round the corners to suggest an old TV.
10. **Export two files** for the landing page:
    - `ad.mp4`: 1080p, H.264, with sound, for when the viewer unmutes.
    - `ad-poster.jpg`: one clean frame of Mike at the table (shot 1), shown before the video loads.

## What the landing page needs from the video

- It plays **muted and looping** by default, because browsers block sound on autoplay. The burned-in captions therefore have to tell the whole story on their own.
- The headline "No new wallet" and the Send USDC button sit over the **bottom 40%** of the frame, on the empty table top.
- A small sound button lets the viewer turn the voices on.

## Honest notes

- **Agent, policy and MCP work on testnet.** Shots 6 to 9 advertise them as working, with no "coming soon" tag. `mcp/server.ts` is the agent front door; the policy contract is deployed at `policy.bibhu-usdc.testnet` and enforces **1 USDC per transfer, 3 a day, 5 hard cap** (live values, read from `get_policy`). Over the per-transfer or daily limit the contract holds the send for human approval; over the hard cap it refuses outright. Shot 9 shows the hold, which is why the robot asks for two and not a larger number. An interim pass on 13 Nov removed these claims after auditing only one branch — that was wrong, and the shots are restored. Use the real numbers; do not invent limits.
- **What the shot 1 test showed (13 Nov 2026).** Grok made a 6-second clip with sound from a chat prompt. Mike's face and costume held for the whole clip, the wave worked, and Bibhu judged the voice good. Three problems:
  - Output is 3:2 (stills 768x515, video 672x448). Asking for 16:9 in the prompt is ignored, and the chat has no aspect-ratio control.
  - The camera drifted in slowly even though the prompt said locked off. By the end the table had almost left the frame.
  - Grok did not use the still as the first frame. It generated a new, similar one.
- **Expect several takes per shot.** Shots 3 and 9 involve fast motion or two speakers and are the most likely to need retries.
- **Quiet Mike is an original character.** Do not prompt with the name of any real pitchman or actor.
