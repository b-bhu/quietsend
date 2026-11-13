import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { rectToQuadMatrix3d, type Quad } from "./homography";
import { screenKey } from "./screenKey";
import track from "../data/screen-track.json";

// Per source frame (24fps), the four corners (TL, TR, BR, BL) of the blank white
// tablet screen in the 1920x1080 raw cut. Made by tracking the white screen inside
// its black bezel; median-smoothed and pushed out a few px to cover the rim.
const TRACK = track as unknown as Record<string, Quad>;

// Tracked on public/raw/quietsend-cut-v2-clean.mp4: the Grok file re-encoded with no
// B-frames, a keyframe every 6 frames and no edit-list offset, so the tracker, both
// <Video> layers and Remotion all agree on which frame is which. Keep it at 0 unless
// the source file changes.
const TRACK_OFFSET = 0;

const nearestQuad = (srcFrame: number): Quad | null => {
  for (let d = 0; d < 6; d++) {
    const q = TRACK[srcFrame - d] ?? TRACK[srcFrame + d];
    if (q) return q;
  }
  return null;
};

type Props = {
  src: string;
  trimBefore: number;
  screen: { w: number; h: number };
  Screen: React.FC<{ f: number }>;
};

// Three layers:
// 1. the clip as shot (carries the audio)
// 2. the app UI, pinned onto the tracked screen with a perspective transform
// 3. the same clip again, muted, with the white screen keyed out, so Mike's
//    fingers and the bezel stay in front of the UI
export const TabletClip: React.FC<Props> = ({ src, trimBefore, screen, Screen }) => {
  const frame = useCurrentFrame();
  const quad = nearestQuad(trimBefore + frame + TRACK_OFFSET);
  return (
    <AbsoluteFill>
      <Video src={src} trimBefore={trimBefore} />
      {quad ? (
        <AbsoluteFill>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: screen.w,
              height: screen.h,
              transformOrigin: "0 0",
              transform: rectToQuadMatrix3d(screen.w, screen.h, quad),
            }}
          >
            <Screen f={frame} />
            {/* a little screen glow, so it sits in the shot instead of on top of it */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 45%)",
              }}
            />
          </div>
        </AbsoluteFill>
      ) : null}
      <Video src={src} trimBefore={trimBefore} muted effects={[screenKey()]} />
    </AbsoluteFill>
  );
};
