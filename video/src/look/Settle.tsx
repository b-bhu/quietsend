import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

// Grok's camera pushes in during some clips (1, 4, 5, 6) while the next clip always
// starts from the original wide framing, so those cuts jump. Settle starts the
// incoming clip framed exactly like the outgoing clip's last frame (measured from the
// table corner and the shelf post) and eases it back to its own framing, so the cut
// reads as one camera settling back instead of a jump.
//
// scale / x / y: the outgoing clip's end framing, as a zoom about the frame centre plus
// a shift in px. `frames`: how long the settle takes.
export const Settle: React.FC<{
  scale: number;
  x: number;
  y: number;
  frames?: number;
  children: React.ReactNode;
}> = ({ scale, x, y, frames = 20, children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.2, 1),
  });
  return (
    <AbsoluteFill
      style={{
        transformOrigin: "50% 50%",
        translate: `${x * (1 - t)}px ${y * (1 - t)}px`,
        scale: String(scale + (1 - scale) * t),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
