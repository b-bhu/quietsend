import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrandRow, Bubble, C, Crawl, DocsCard, HiddenWords, ScreenInset, Stamp, Starburst, WordArt } from "./Kit";
import { ScreenA, ScreenB, ScreenC, SCREEN_A, SCREEN_B, SCREEN_C } from "../tablet/AppScreens";

// Pass 5: captions as 90s infomercial word art placed around the set, not subtitles.
// Only the punches get words. Frames are timeline frames @24fps; clip starts:
// 1 Intro 0 · 2 Bucket 127 · 3 Sweep 230 · 4 Tablet A 344 · 5 Tablet B 433 ·
// 6 Tablet C 551 · 7 Robot 667 · 8 Plug 744 · 9 Close 877 · end 1008.
// Positions are in the 1920x1080 frame. The left wall (x < ~640, y < ~520) is empty in
// every clip; Mike stands centre; the shelf is on the right; the table is the bottom 45%.
export const Captions: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* ---- 1 Intro: "Hi, Quiet Mike here with quietsend!" ---- */}
      <Sequence name="QUIET MIKE" from={10} durationInFrames={98} layout="none">
        <WordArt text={"QUIET\nMIKE"} x={110} y={150} rotate={-7} size={190} dur={98} entrance="pop" />
      </Sequence>
      <Sequence name="with quietsend" from={57} durationInFrames={51} layout="none">
        <WordArt text="with quietsend" x={150} y={530} rotate={-7} size={70} dur={51} entrance="rise" fill={C.yellow} stroke={C.navy} />
      </Sequence>
      <Sequence name="brand: NEAR testnet -> Solana devnet" from={67} durationInFrames={41} layout="none">
        <BrandRow chips={[{ brand: "near", label: "NEAR testnet" }, { brand: "solana", label: "Solana devnet" }]} x={60} y={905} size={42} dur={41} />
      </Sequence>

      {/* ---- 2 Bucket: "A wallet for every chain?" words fall in with the pour ---- */}
      <Sequence name="A WALLET" from={135} durationInFrames={91} layout="none">
        <WordArt text="A WALLET" x={90} y={110} rotate={-9} size={130} dur={91} entrance="drop" />
      </Sequence>
      <Sequence name="FOR EVERY" from={147} durationInFrames={79} layout="none">
        <WordArt text="FOR EVERY" x={170} y={255} rotate={5} size={110} dur={79} entrance="drop" />
      </Sequence>
      <Sequence name="CHAIN?" from={161} durationInFrames={65} layout="none">
        <WordArt text="CHAIN?" x={110} y={420} rotate={-4} size={170} dur={65} entrance="drop" fill={C.yellow} stroke={C.red} />
      </Sequence>

      {/* ---- 3 Sweep: "No new wallet!" whips in with the arm sweep ---- */}
      <Sequence name="NO NEW WALLET" from={250} durationInFrames={72} layout="none">
        <WordArt text={"NO NEW\nWALLET!"} x={70} y={110} rotate={-6} size={170} dur={72} entrance="whip" />
      </Sequence>
      <Sequence name="brand: NEAR account sends on Solana" from={270} durationInFrames={52} layout="none">
        <BrandRow chips={[{ brand: "near", label: "NEAR account" }, { brand: "solana", label: "sends on Solana" }]} x={60} y={905} size={42} dur={52} />
      </Sequence>

      {/* ---- 4 Tablet A: "One NEAR account. Pick who, pick how much, send!" ---- */}
      <Sequence name="ONE NEAR ACCOUNT" from={326} durationInFrames={98} layout="none">
        <WordArt text={"ONE NEAR\nACCOUNT"} x={90} y={170} rotate={-5} size={150} dur={98} entrance="pop" />
      </Sequence>
      <Sequence name="brand: NEAR -> USDC on Solana" from={340} durationInFrames={84} layout="none">
        <BrandRow chips={[{ brand: "near", label: "NEAR" }, { brand: "solana", label: "USDC on Solana" }]} x={60} y={905} size={42} dur={84} />
      </Sequence>
      <Sequence name="inset A" from={326} durationInFrames={98} layout="none">
        <ScreenInset Screen={ScreenA} screen={SCREEN_A} width={560} x={1300} y={300} dur={98} offset={4} />
      </Sequence>
      <Sequence name="SENT burst" from={380} durationInFrames={44} layout="none">
        <Starburst text={"SENT!"} x={1680} y={190} size={220} dur={44} />
      </Sequence>

      {/* ---- 5 Tablet B: "Solangel? Send. Hide who you paid. Go nuts, man!" ---- */}
      <Sequence name="HIDE WHO YOU PAID" from={450} durationInFrames={87} layout="none">
        <HiddenWords lead="HIDE" hidden="WHO YOU PAID" x={60} y={40} size={110} dur={87} />
      </Sequence>
      <Sequence name="inset B" from={428} durationInFrames={109} layout="none">
        <ScreenInset Screen={ScreenB} screen={SCREEN_B} width={400} x={1440} y={150} dur={109} offset={5} />
      </Sequence>
      <Sequence name="GO NUTS" from={508} durationInFrames={29} layout="none">
        <Starburst text={"GO\nNUTS!"} x={1150} y={40} size={220} dur={29} rotate={10} fill={C.white} ink={C.blue} />
      </Sequence>
      <Sequence name="fine print" from={460} durationInFrames={77} layout="none">
        <Crawl
          dur={77}
          text="* Hides WHO you paid, not THAT you paid. Amount and timing are still public. A patient observer could guess. Solana devnet only. Devnet USDC has no value."
        />
      </Sequence>

      {/* ---- 6 Tablet C: the two-step receipt, explained as a chain ---- */}
      <Sequence name="YOU" from={539} durationInFrames={122} layout="none">
        <WordArt text="YOU" x={90} y={150} rotate={-4} size={120} dur={122} entrance="pop" />
      </Sequence>
      <Sequence name="-> VAULT" from={569} durationInFrames={92} layout="none">
        <WordArt text="→ VAULT" x={110} y={290} rotate={-4} size={120} dur={92} entrance="pop" fill={C.green} stroke={C.navy} />
      </Sequence>
      <Sequence name="-> THEM" from={587} durationInFrames={74} layout="none">
        <WordArt text="→ THEM" x={130} y={430} rotate={-4} size={120} dur={74} entrance="pop" />
      </Sequence>
      <Sequence name="no tx names both" from={603} durationInFrames={58} layout="none">
        <WordArt text={"No transaction names\nyou and them together.\nAmount + timing still public."} x={140} y={590} rotate={-4} size={38} dur={58} entrance="rise" fill={C.white} stroke={C.navy} />
      </Sequence>

      <Sequence name="inset C" from={539} durationInFrames={122} layout="none">
        <ScreenInset Screen={ScreenC} screen={SCREEN_C} width={560} x={1300} y={300} dur={122} offset={5} />
      </Sequence>

      {/* ---- 7 Robot: "Hello. I am a robot. How can I help?" ---- */}
      <Sequence name="robot bubble" from={685} durationInFrames={77} layout="none">
        <Bubble lines={["HELLO. I AM A ROBOT.", "HOW CAN I HELP?"]} x={1340} y={40} width={540} dur={77} tail="left" />
      </Sequence>

      {/* ---- 8 Plug: "Hey, agent! Just plug in with MCP!" + the real docs ---- */}
      <Sequence name="HEY AGENT" from={763} durationInFrames={44} layout="none">
        <WordArt text="HEY, AGENT!" x={1080} y={30} rotate={6} size={110} dur={44} entrance="pop" fill={C.yellow} stroke={C.navy} />
      </Sequence>
      <Sequence name="JUST PLUG IN WITH MCP" from={805} durationInFrames={74} layout="none">
        {/* kept above y≈860: the landing page's Send USDC button sits on the film's bottom-centre */}
        <WordArt text={"JUST PLUG IN\nWITH MCP"} x={440} y={545} rotate={-3} size={160} dur={74} entrance="slam" />
      </Sequence>
      <Sequence name="docs card" from={815} durationInFrames={150} layout="none">
        <DocsCard
          x={40}
          y={60}
          width={570}
          dur={150}
          title="docs/INTEGRATING.md"
          heading="Agents: plug in"
          lines={[
            { t: "$ npm run mcp", kind: "cmd" },
            { t: "# an agent connects over stdio", kind: "comment" },
            { t: "policy.quietsend.testnet", kind: "key" },
            { t: "  per_transfer  1 USDC" },
            { t: "  daily         3 USDC" },
            { t: "over a limit? held until" },
            { t: "  approve_intent(id)", kind: "key" },
          ]}
        />
      </Sequence>

      {/* ---- 9 Close: "It's on testnet. Nobody got hurt. Try this at home!" ---- */}
      {/* stamp sits on the empty left wall under the closing line, clear of Mike's point */}
      <Sequence name="TESTNET ONLY stamp" from={888} durationInFrames={130} layout="none">
        <Stamp text="TESTNET ONLY" x={80} y={600} rotate={-8} size={64} dur={130} />
      </Sequence>
      <Sequence name="brand: NEAR testnet -> Solana devnet (close)" from={906} durationInFrames={112} layout="none">
        <BrandRow chips={[{ brand: "near", label: "NEAR testnet" }, { brand: "solana", label: "Solana devnet" }]} x={60} y={905} size={42} dur={112} />
      </Sequence>
      <Sequence name="TRY THIS AT HOME" from={966} durationInFrames={52} layout="none">
        <WordArt text={"TRY THIS\nAT HOME!"} x={60} y={140} rotate={-6} size={140} dur={52} entrance="slam" />
      </Sequence>
    </AbsoluteFill>
  );
};
