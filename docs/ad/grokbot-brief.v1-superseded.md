> SUPERSEDED by `grokbot-brief.v2.md`. Kept for reference only. Do not hand this to the bot.

# Brief for the Grok bot: quietsend infomercial ad (v1)

You are making a 49-second parody 1990s TV infomercial. Ten shots, one set, two
characters. It plays muted and looping on a website landing page, so the picture
has to tell the story on its own.

Work in the order below. Do not skip a step. Each step's output is the input to
the next one.

## The hard rules

1. **Keyframe first, always.** Never ask for a video from words alone. Make a
   still image, get it approved, then animate that exact image. The video prompt
   describes only the MOTION, never the framing or the set.
2. **One set, one camera.** Every shot is the same white table in the same
   studio. Static tripod camera. No zoom, no push-in, no pan, no tilt.
3. **The bottom 40% of the frame is the white table top, empty.** The website
   puts its headline and button there. If the table is a thin strip at the
   bottom, the shot is unusable.
4. **No text in the generated image.** The model garbles lettering. Every
   caption, label and sticker is added later in the edit. All props are blank.
5. **One action per shot.** Two things happening means two shots.
6. **Twelve words or fewer per spoken line**, so the lips have a chance of
   matching.
7. **If a prompt fails, make it shorter.** Cut words, don't add them.
8. **The generator outputs ~3:2, not 16:9.** This is known and cannot be
   changed. So frame every still LOOSE: leave empty cream wall above the head
   and empty table below, because the top and bottom will be cropped away to
   make 16:9. Mike and the table must still work after that crop.

## The look (put this at the top of every image prompt)

```
1990s American TV infomercial, shot on a broadcast studio video camera. Flat,
bright, even studio lighting, slightly soft image, mild VHS colour bleed.
Seamless pale cream studio backdrop. Photorealistic, live action.
```

## The two characters

Both reference sheets already exist. Use them as image references so the same
man and the same costume appear in every single shot.

**QUIET MIKE** — stocky cheerful man, mid 40s, round face, short neat brown
hair, thick black-framed rectangular glasses, clean shaven, big confident smile.
Mustard-yellow short-sleeved button-down shirt, navy blue tie, grey trousers,
black belt. No logos.

**THE ROBOT** — a small homemade cardboard robot, about knee height, that stands
on the table. Silver spray-painted boxes for head and body with visible tape
seams, two round yellow lamp eyes, a rectangular mouth slot, one wire antenna,
silver dryer-hose arms. One round lamp in the centre of its chest, unlit at
first, glowing green later. Looks handmade and clumsy, not a real machine.

## The set

```
Empty TV infomercial studio. A long white laminate demonstration table runs
across the frame and fills the lower 40% of the image; its surface is clean and
empty. Behind it, a pale cream seamless backdrop. On the far right, a grey metal
shelf holding plain blue, red and yellow plastic tubs. One blank white wall
socket is mounted on the right end of the table top.
MEDIUM WIDE SHOT, camera at chest height, straight on, locked off.
No people. No text, no signs, no logos.
```

## Step A: make ten keyframe stills

One still per shot. Pattern for every one:

```
[paste THE LOOK]
Use the QUIET MIKE reference and the SET reference. Same man, same costume,
same set, same camera position.
MEDIUM WIDE SHOT, camera straight on and level.
Quiet Mike stands behind the white table, centred. [WHAT IS ON THE TABLE AND
WHAT HE IS HOLDING AT THE START OF THE SHOT]
The white table top fills the lower 40% of the frame and its surface is empty.
Empty cream wall above his head.
A single photorealistic image. No text anywhere.
```

Fill in the bracket from this table:

| # | What the still must show |
|---|---|
| 1 | Mike alone, hands at his sides, empty table |
| 2 | Mike holding a grey plastic bucket tilted over the table, a few keys just spilling out |
| 3 | A heap of metal keys and brown leather wallets on the table, Mike's right arm raised at the left end of the heap |
| 4 | Empty table. Mike holds a tablet in both hands at chest height, screen facing camera, screen blank and softly glowing white |
| 5 | Same as 4, but the tablet is in his left hand and his right index finger touches the blank screen |
| 6 | Mike holds the small cardboard Robot in both hands just above the table top, looking at it |
| 7 | The small Robot stands on the table right of centre facing camera; Mike holds an oversized grey plug with a thick cable |
| 8 | The Robot on the table, chest lamp glowing green; Mike holds a blank white round sticker the size of his palm |
| 9 | A glass jar full of gold coins on the table next to the Robot; the Robot's arm half raised toward it |
| 10 | Mike pointing straight at camera; the Robot standing on the table beside him |

Also make an END frame for shot 7: the plug pushed into the socket, the Robot's
chest lamp green. Use it as the last keyframe for that shot.

Do not move on from a still until the table fills the lower 40% and there is
empty wall above Mike's head.

## Step B: animate each approved still

Take the approved still and animate it. The prompt says only what MOVES:

```
Animate this image. STATIC TRIPOD CAMERA. The framing never changes from the
first frame to the last. No zoom, no push-in, no pan, no tilt.
[Action] ...
[Physics] ...
[Audio] ...
[SFX] ...
ONE CONTINUOUS SHOT, no cuts. The table stays in the lower part of the frame the
whole time. No on-screen text, no captions, no subtitles. No music.
```

### The ten shots

**1 — 4 sec**
[Action] Mike raises both hands and waves at the camera with a big smile, then lowers his arms to his sides. He stays standing upright and does not lean forward.
[Audio] Loud and cheerful, American TV salesman voice: "Hi, Quiet Mike here!"
[SFX] Faint studio room tone.

**2 — 4 sec**
[Action] Mike tips the grey bucket and a pile of metal keys and brown leather wallets pours onto the middle of the table. He looks at the camera and shrugs.
[Physics] Keys bounce and scatter slightly, wallets land flat, nothing falls off the table.
[Audio] Puzzled: "A wallet for every chain?"
[SFX] Loud clatter of metal keys on a hard table.

**3 — 4 sec**
[Action] In one fast motion Mike sweeps his right arm across the table from left to right, pushing every key and wallet off the right end. The table is left completely empty. He grins at the camera.
[Physics] Objects slide and fall out of frame to the right.
[Audio] Shouts happily: "No new wallet!"
[SFX] Scraping sweep, then a crash of keys hitting the floor off screen.

**4 — 6 sec**
[Action] Mike holds the tablet up toward the camera and taps the blank screen three times with one finger, nodding as he talks.
[Physics] The tablet screen stays blank white the whole time.
[Audio] Fast and cheerful: "One NEAR account. Pick who, pick how much, send!"
[SFX] Three soft taps on glass.

**5 — 6 sec**
[Action] Mike swipes one finger across the blank tablet screen from right to left, then throws his free hand up in the air and laughs.
[Physics] The tablet screen stays blank white the whole time.
[Audio] Excited: "ETH bro? Solangel? Send. Hide who you paid. Go nuts, man!"
[SFX] One soft swipe on glass.

**6 — 5 sec**
[Action] Mike sets the small cardboard Robot down on the table, standing upright facing the camera, then takes his hands away. The Robot's head turns slightly toward Mike. Mike looks at it, surprised.
[Physics] The Robot is light and wobbles a little when set down. Its lamp eyes glow yellow.
[Audio] The Robot, flat monotone mechanical voice: "Hello. I am a robot. How can I do it?"
[SFX] A soft cardboard thud, then one electronic beep.

**7 — 5 sec** (use the start frame AND the end frame)
[Action] Mike pushes the oversized grey plug into the socket on the right end of the table. The round lamp on the Robot's chest switches on and glows green. Mike gives the camera a thumbs up.
[Physics] The thick cable hangs and sways with weight.
[Audio] Mike: "Hey, agent! Just plug in with MCP!"
[SFX] A solid plastic click, then a rising electronic power-up hum.

**8 — 5 sec**
[Action] Mike presses the blank white round sticker firmly onto the centre of the Robot's chest with two fingers, then gives it one extra pat. The Robot looks down at the sticker.
[Audio] Quickly: "Set a policy! Twenty a transfer, a hundred a day!"
[SFX] A flat tap on cardboard.

**9 — 5 sec**
[Action] The Robot slowly reaches one arm toward the glass jar of gold coins. Mike calmly places his hand flat on top of the jar. The Robot stops and lowers its arm. Mike smiles at the camera.
[Audio] The Robot, flat monotone: "I would like to send ten thousand." Then Mike, friendly: "Over the limit? It waits for you!"
[SFX] One short game-show wrong-answer buzzer when Mike's hand lands on the jar.
If the two voices get mixed up, split this into two separate shots.

**10 — 5 sec**
[Action] Mike points straight at the camera with his right hand and holds the pose with a big grin. The Robot on the table slowly raises one arm.
[Audio] Loud and fast: "It's on testnet. No one got hurt in this stunt. Do try this at home!"
[SFX] Soft servo whirr as the Robot's arm rises.

## Step C: hand back

Deliver the ten clips as separate files, named `shot-01.mp4` through
`shot-10.mp4`, plus the ten approved stills. Do not add captions, music or
titles — that happens in the edit.

## What gets added later in the edit (not your job, for context only)

Captions in heavy white type with a blue outline, one per shot: QUIET MIKE / A
WALLET FOR EVERY CHAIN? / NO NEW WALLET! / ONE ACCOUNT. SEND. / ETH BROS.
SOLANGELS. GO NUTS. / (none) / JUST PLUG IN WITH MCP / 20 MAX · 100 A DAY /
WAITING FOR HUMAN / DO TRY THIS AT HOME. Real app screen footage is laid over
the blank tablet in shots 4 and 5. A fast fine-print crawl runs along the bottom
of shot 5. 