# Swapping in a new master video

Everything in the edit is drawn by Remotion on top of `public/raw/`. Nothing is baked in.
To use a regenerated Grok master, replace the file and re-measure the parts that depend
on the footage. macOS only (Swift + AVFoundation); ffmpeg comes with Remotion.

| What depends on the footage | Where it lives | How to re-measure |
|---|---|---|
| Clip trims (`trimBefore`, `durationInFrames`) | `src/Composition.tsx` | `find-cuts.swift` (clip boundaries) + `audio-levels.swift` (speech start/end) |
| Tablet screen corners | `src/data/screen-track.json` | `track-screen.swift`, then `export-track.py` |
| Framing match at cuts (`<Settle>` values) | `src/Composition.tsx` | `set-landmarks.swift` (table corner + shelf post) |
| Caption / SFX timings | `src/captions/Captions.tsx`, `Sfx.tsx` | follow the new clip start frames |
| Caption positions | `src/captions/Captions.tsx` | only if the set layout moves (they sit on the empty left wall and table) |

Steps:

1. Put the new file in `public/raw/` and re-encode it so every tool agrees on frame numbers
   (no B-frames, no edit-list offset):
   `npx remotion ffmpeg -i public/raw/NEW.mp4 -c:v libx264 -preset slow -crf 15 -g 6 -bf 0 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart public/raw/quietsend-cut-v2-clean.mp4`
   (`timestamps.swift <file>` should print `edit 0.0 0.0` and first pts `0.0`.)
2. `swift tools/find-cuts.swift <clean.mp4>`: hard cuts between the generated clips.
3. `swift tools/audio-levels.swift <clean.mp4> <outdir> 2`: loudness per window; trim each clip
   to its spoken line.
4. Tablet clips: `swift tools/track-screen.swift <clean.mp4> out.json A-B C-D ...` (source frame
   ranges), then `python3 -I tools/export-track.py out.json src/data/screen-track.json 1 12`.
   Needs the tablet screen to be blank pure white inside a black bezel.
5. Drifting clips: `swiftc -O -o /tmp/lm tools/set-landmarks.swift && /tmp/lm <clean.mp4> <frames...>`;
   the incoming clip's `<Settle>` = the outgoing clip's last-frame scale/shift.
6. `swift tools/frames-at.swift <video> <outdir> <seconds...>` to eyeball any frame.
7. Shift caption/SFX `from` frames to the new clip starts, check stills
   (`npx remotion still QuietsendAd out/x.png --frame=N --scale=0.5`), render.
