import React from "react";
import { Sequence } from "remotion";
import { Audio } from "@remotion/media";
import { ding, mouseClick, uiSwitch, whip, whoosh } from "@remotion/sfx";

// A few quiet sound effects on the beats the captions and app hit. No music (client's call).
// Kept low so the voices stay on top. Frames are timeline frames @24fps.
const VOL = 0.3;

export const Sfx: React.FC = () => {
  return (
    <>
      {/* 3 Sweep: arm swipe */}
      <Sequence name="sfx whip (sweep)" from={248} durationInFrames={24} layout="none">
        <Audio src={whip} volume={VOL} />
      </Sequence>
      {/* 4 Tablet A: tap Send, then Sent */}
      <Sequence name="sfx click (send A)" from={394} durationInFrames={12} layout="none">
        <Audio src={mouseClick} volume={VOL} />
      </Sequence>
      <Sequence name="sfx ding (sent A)" from={402} durationInFrames={30} layout="none">
        <Audio src={ding} volume={VOL} />
      </Sequence>
      {/* 5 Tablet B: Hide recipient switch, then Sent */}
      <Sequence name="sfx switch (hide)" from={455} durationInFrames={12} layout="none">
        <Audio src={uiSwitch} volume={VOL} />
      </Sequence>
      <Sequence name="sfx ding (sent B)" from={503} durationInFrames={30} layout="none">
        <Audio src={ding} volume={VOL} />
      </Sequence>
      {/* 6 Tablet C: Sent */}
      <Sequence name="sfx ding (sent C)" from={615} durationInFrames={30} layout="none">
        <Audio src={ding} volume={VOL} />
      </Sequence>
      {/* 8 Plug: docs card slides in, chest lamp goes green */}
      <Sequence name="sfx whoosh (docs card)" from={800} durationInFrames={24} layout="none">
        <Audio src={whoosh} volume={VOL * 0.8} />
      </Sequence>
      <Sequence name="sfx ding (lamp green)" from={871} durationInFrames={30} layout="none">
        <Audio src={ding} volume={VOL} />
      </Sequence>
    </>
  );
};
