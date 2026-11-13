import { Composition, staticFile, AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { TabletClip } from "./tablet/TabletClip";
import { ScreenA, ScreenB, ScreenC, SCREEN_A, SCREEN_B, SCREEN_C } from "./tablet/AppScreens";
import { TvLook } from "./look/TvLook";
import { Settle } from "./look/Settle";

// Source: Grok raw cut (nine 6-second clips back to back), 1920x1080 @ 24fps.
// Pass 1: trim each clip to its spoken line. Nothing is cut out; every clip stays,
// only the dead air at the head and tail of each clip is removed.
// trimBefore = source frame where the clip starts, durationInFrames = how long it plays.
const RAW = staticFile("raw/quietsend-cut-v2-clean.mp4");

export const QuietsendAd: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Pass 3: the 1990s TV look over everything (see src/look/TvLook.tsx). */}
      <TvLook>
      <TransitionSeries name="Ad timeline">
        {/* 1 Intro: "Hi, Quiet Mike here..." (src 0.00-5.30s) */}
        <TransitionSeries.Sequence name="01 Intro" durationInFrames={127}>
          <Video src={RAW} trimBefore={0} />
        </TransitionSeries.Sequence>
        {/* 2 Bucket dump: "A wallet for every chain?" (src 6.33-10.63s) */}
        {/* Pass 4: Settle starts the clip framed like the end of the clip before it
            (Grok's camera crept in there) and eases back. Numbers measured from the table
            corner and shelf post. */}
        <TransitionSeries.Sequence name="02 Bucket" durationInFrames={103}>
          <Settle scale={1.135} x={3} y={79}>
            <Video src={RAW} trimBefore={152} />
          </Settle>
        </TransitionSeries.Sequence>
        {/* 3 Sweep: "No new wallet!" + grin (src 12.17-16.92s) */}
        <TransitionSeries.Sequence name="03 Sweep" durationInFrames={114}>
          <Video src={RAW} trimBefore={292} />
        </TransitionSeries.Sequence>
        {/* Pass 2: the blank tablet screens carry the app UI (tracked + keyed, see src/tablet). */}
        {/* 4 Tablet A: send form fills in, then "Sent" (src 18.17-21.88s) */}
        <TransitionSeries.Sequence name="04 Tablet A" durationInFrames={89}>
          <TabletClip src={RAW} trimBefore={436} screen={SCREEN_A} Screen={ScreenA} />
        </TransitionSeries.Sequence>
        {/* 5 Tablet B: Hide recipient switch, then receipt with recipient HIDDEN (src 24.17-29.08s) */}
        <TransitionSeries.Sequence name="05 Tablet B" durationInFrames={118}>
          <Settle scale={1.096} x={0} y={58}>
            <TabletClip src={RAW} trimBefore={580} screen={SCREEN_B} Screen={ScreenB} />
          </Settle>
        </TransitionSeries.Sequence>
        {/* 6 Tablet C: two-step hidden receipt (src 30.54-35.38s) */}
        <TransitionSeries.Sequence name="06 Tablet C" durationInFrames={116}>
          <Settle scale={1.162} x={-6} y={94}>
            <TabletClip src={RAW} trimBefore={733} screen={SCREEN_C} Screen={ScreenC} />
          </Settle>
        </TransitionSeries.Sequence>
        {/* 7 Robot arrives: "Hello. I am a robot..." (src 37.67-40.88s) */}
        <TransitionSeries.Sequence name="07 Robot" durationInFrames={77}>
          <Settle scale={1.212} x={-12} y={121}>
            <Video src={RAW} trimBefore={904} />
          </Settle>
        </TransitionSeries.Sequence>
        {/* 8 Agent plugged in, chest goes green, thumbs up (src 42.71-48.25s) */}
        {/* Caption for this clip: PLUG IN YOUR AGENT. Do NOT caption it "MCP" —
            there is no MCP integration in the code. See docs/ad/grokbot-brief.v2.md. */}
        <TransitionSeries.Sequence name="08 Plug" durationInFrames={133}>
          <Video src={RAW} trimBefore={1025} />
        </TransitionSeries.Sequence>
        {/* 9 Close: point at camera, robot waves (src 48.67-54.13s) */}
        <TransitionSeries.Sequence name="09 Close" durationInFrames={131}>
          <Video src={RAW} trimBefore={1168} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      </TvLook>
    </AbsoluteFill>
  );
};

// 127+103+114+89+118+116+77+133+131 = 1008 frames = 42.0s
export const MyComposition = () => {
  return (
    <Composition
      id="QuietsendAd"
      component={QuietsendAd}
      durationInFrames={1008}
      fps={24}
      width={1920}
      height={1080}
    />
  );
};
