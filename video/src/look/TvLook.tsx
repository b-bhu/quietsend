import React from "react";
import { AbsoluteFill, random, useCurrentFrame, interpolate } from "remotion";

// The 1990s broadcast / VHS look, applied over the whole edit.
// Grade:     slightly richer colour, a touch more contrast, warm lift (brief: "raise saturation, soften").
// Softness:  VHS is soft sideways more than up-down, so the blur is mostly horizontal.
// Bleed:     red drifts right and blue drifts left, the classic composite-video colour fringe.
// On top:    scanlines, per-frame grain, a faint flicker, a soft vignette and a
//            rare rolling tracking band.
// Every value is a named constant below so the look can be dialled up or down.
const LOOK = {
  saturate: 1.18,
  contrast: 1.06,
  brightness: 1.02,
  bleedRedPx: 2.5,
  bleedBluePx: -2,
  softX: 0.9,
  softY: 0.35,
  scanlineOpacity: 0.1,
  grainOpacity: 0.07,
  flicker: 0.012,
  vignette: 0.32,
  warmth: 0.05,
};

const FILTER_ID = "qs-vhs";

export const TvLook: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const flicker = 1 + (random(`flicker-${frame}`) - 0.5) * 2 * LOOK.flicker;
  // A tracking band rolls down the frame once every ~9 seconds, for about a second.
  const cycle = frame % 216;
  const bandY = interpolate(cycle, [0, 26], [-12, 112], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bandOn = cycle < 26;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id={FILTER_ID} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            {/* split the picture into R, G, B */}
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            {/* shift red and blue sideways, then add the channels back together */}
            <feOffset in="r" dx={LOOK.bleedRedPx} dy="0" result="r2" />
            <feOffset in="b" dx={LOOK.bleedBluePx} dy="0" result="b2" />
            <feBlend in="r2" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="b2" mode="screen" result="rgb" />
            {/* tape softness: more sideways than vertical */}
            <feGaussianBlur in="rgb" stdDeviation={`${LOOK.softX} ${LOOK.softY}`} />
          </filter>
        </defs>
      </svg>

      {/* the edit itself, graded and run through the tape filter. A 1% overscan pushes
          the colour-fringe edges (cyan left, red right) off the frame, like a CRT bezel. */}
      <AbsoluteFill
        style={{
          filter: `url(#${FILTER_ID}) saturate(${LOOK.saturate}) contrast(${LOOK.contrast}) brightness(${LOOK.brightness * flicker})`,
          scale: "1.01",
        }}
      >
        {children}
      </AbsoluteFill>

      {/* warm lift, like an old tube's white point */}
      <AbsoluteFill style={{ backgroundColor: `rgba(255, 200, 140, ${LOOK.warmth})`, mixBlendMode: "soft-light" }} />

      {/* scanlines */}
      <AbsoluteFill
        style={{
          backgroundImage: "repeating-linear-gradient(to bottom, rgba(0,0,0,1) 0px, rgba(0,0,0,1) 1px, transparent 1px, transparent 3px)",
          opacity: LOOK.scanlineOpacity,
          mixBlendMode: "multiply",
        }}
      />

      {/* grain: fresh noise every frame */}
      <AbsoluteFill style={{ opacity: LOOK.grainOpacity, mixBlendMode: "overlay" }}>
        <svg width="100%" height="100%">
          <filter id="qs-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(random(`grain-${frame}`) * 1000)} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#qs-grain)" />
        </svg>
      </AbsoluteFill>

      {/* rolling tracking band */}
      {bandOn ? (
        <AbsoluteFill
          style={{
            background: `linear-gradient(to bottom, transparent ${bandY - 3}%, rgba(255,255,255,0.07) ${bandY - 1}%, rgba(255,255,255,0.12) ${bandY}%, rgba(0,0,0,0.05) ${bandY + 1}%, transparent ${bandY + 3}%)`,
          }}
        />
      ) : null}

      {/* vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${LOOK.vignette}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
