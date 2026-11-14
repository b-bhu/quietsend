import { Composition, staticFile, AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { TvLook } from "./look/TvLook";
import { Captions } from "./captions/Captions";
import { Sfx } from "./captions/Sfx";

// Source: Grok master v3 (nine 6.04 s clips back to back), 1920x1080 @ 24fps.
// v3 is re-generated: grey desk, tighter framing, and the app is already on the tablet
// screens, so the tablet key (src/tablet/TabletClip) and the Settle framing fixes used for
// v2 are not needed. Each clip is trimmed to its spoken line plus the action around it
// (bucket tip, sweep, robot walking in). Nothing is cut out of a line.
// trimBefore = source frame where the clip starts, durationInFrames = how long it plays.
const RAW = staticFile("raw/quietsend-v3-clean.mp4");

const CLIPS: { name: string; trimBefore: number; durationInFrames: number }[] = [
  { name: "01 Intro", trimBefore: 0, durationInFrames: 108 }, //   0.00- 4.50s "Hi, Quiet Mike here..."
  { name: "02 Bucket", trimBefore: 146, durationInFrames: 118 }, //  6.08-11.00s tip the bucket, "A wallet for every chain?"
  { name: "03 Sweep", trimBefore: 298, durationInFrames: 96 }, //  12.42-16.40s sweep, "No new wallet!"
  { name: "04 Tablet A", trimBefore: 436, durationInFrames: 102 }, // 18.17-22.40s send form
  { name: "05 Tablet B", trimBefore: 581, durationInFrames: 113 }, // 24.21-28.90s hide recipient
  { name: "06 Tablet C", trimBefore: 726, durationInFrames: 124 }, // 30.25-35.40s two-step receipt
  { name: "07 Robot", trimBefore: 876, durationInFrames: 101 }, //   36.50-40.70s robot walks in, "Hello. I am a robot..."
  { name: "08 Plug", trimBefore: 1016, durationInFrames: 117 }, //   42.33-47.20s plug in with MCP, chest goes green
  { name: "09 Close", trimBefore: 1164, durationInFrames: 139 }, //  48.50-54.29s point at camera, robot waves
];
export const AD_FRAMES = CLIPS.reduce((n, c) => n + c.durationInFrames, 0); // 1018 = 42.4s

export const QuietsendAd: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* The 1990s TV look over everything (see src/look/TvLook.tsx). */}
      <TvLook>
      <TransitionSeries name="Ad timeline">
        {CLIPS.map((c) => (
          <TransitionSeries.Sequence key={c.name} name={c.name} durationInFrames={c.durationInFrames}>
            <Video src={RAW} trimBefore={c.trimBefore} />
          </TransitionSeries.Sequence>
        ))}
      </TransitionSeries>
      {/* Pass 5: word-art captions and the docs card (see src/captions). Inside the
          TV look so they get the same scanlines and bleed, like broadcast graphics. */}
      <Captions />
      </TvLook>
      <Sfx />
    </AbsoluteFill>
  );
};

export const MyComposition = () => {
  return (
    <Composition
      id="QuietsendAd"
      component={QuietsendAd}
      durationInFrames={AD_FRAMES}
      fps={24}
      width={1920}
      height={1080}
    />
  );
};
