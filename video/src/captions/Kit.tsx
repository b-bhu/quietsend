import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadVT } from "@remotion/google-fonts/VT323";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// 90s infomercial word-art kit. Every piece animates from its own local frame 0,
// so wrap each one in a <Sequence from={...}> on the main timeline.

const { fontFamily: anton } = loadAnton("normal", { weights: ["400"], subsets: ["latin"] });
const { fontFamily: lcd } = loadVT("normal", { weights: ["400"], subsets: ["latin"] });
const { fontFamily: mono } = loadMono("normal", { weights: ["500"], subsets: ["latin"] });

export const C = {
  white: "#ffffff",
  blue: "#1f3fbf",
  navy: "#0d1a5c",
  yellow: "#ffd23f",
  red: "#e3262f",
  green: "#8fd3b6",
  shadow: "rgba(10, 16, 60, 0.85)",
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const overshoot = Easing.bezier(0.34, 1.56, 0.64, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);

// fades a piece out over its last `fade` frames
const useExit = (dur: number, fade = 5) => {
  const f = useCurrentFrame();
  return interpolate(f, [dur - fade, dur], [1, 0], clamp);
};

type Pos = { x: number; y: number; rotate?: number };

// ---------- WordArt: big outlined Anton text ----------
export type Entrance = "pop" | "slam" | "drop" | "whip" | "rise";

export const WordArt: React.FC<
  Pos & {
    text: string;
    size: number;
    dur: number;
    entrance?: Entrance;
    fill?: string;
    stroke?: string;
    delay?: number;
    align?: "left" | "center" | "right";
  }
> = ({ text, x, y, rotate = 0, size, dur, entrance = "pop", fill = C.white, stroke = C.blue, delay = 0, align = "left" }) => {
  const f = useCurrentFrame() - delay;
  const exit = useExit(dur - delay);
  const anim = {
    pop: {
      scale: interpolate(f, [0, 5, 9], [0.2, 1.1, 1], clamp),
      opacity: interpolate(f, [0, 2], [0, 1], clamp),
      dx: 0,
      dy: 0,
    },
    slam: {
      scale: interpolate(f, [0, 4, 7], [2.6, 0.94, 1], { ...clamp, easing: out }),
      opacity: interpolate(f, [0, 2], [0, 1], clamp),
      dx: 0,
      dy: 0,
    },
    drop: {
      scale: 1,
      opacity: interpolate(f, [0, 2], [0, 1], clamp),
      dx: 0,
      dy: interpolate(f, [0, 7], [-260, 0], { ...clamp, easing: overshoot }),
    },
    whip: {
      scale: 1,
      opacity: interpolate(f, [0, 2], [0, 1], clamp),
      dx: interpolate(f, [0, 6], [-900, 0], { ...clamp, easing: out }),
      dy: 0,
    },
    rise: {
      scale: 1,
      opacity: interpolate(f, [0, 6], [0, 1], clamp),
      dx: 0,
      dy: interpolate(f, [0, 8], [40, 0], { ...clamp, easing: out }),
    },
  }[entrance];
  // motion smear for the whip, like a fast 90s DVE move
  const smear = entrance === "whip" ? interpolate(f, [0, 6], [14, 0], clamp) : 0;
  if (f < 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transformOrigin: align === "center" ? "50% 50%" : align === "right" ? "100% 50%" : "0% 50%",
        translate: `${anim.dx}px ${anim.dy}px`,
        rotate: `${rotate}deg`,
        scale: String(anim.scale),
        opacity: anim.opacity * exit,
        fontFamily: anton,
        fontSize: size,
        lineHeight: 0.92,
        letterSpacing: "0.01em",
        textTransform: "uppercase",
        color: fill,
        WebkitTextStroke: `${Math.max(6, size * 0.075)}px ${stroke}`,
        paintOrder: "stroke fill",
        textShadow: `${size * 0.05}px ${size * 0.06}px 0 ${C.shadow}`,
        whiteSpace: "pre",
        textAlign: align,
        filter: smear ? `blur(${smear / 3}px)` : undefined,
      }}
    >
      {text}
    </div>
  );
};

// ---------- Starburst: the 90s "NEW!" burst ----------
export const Starburst: React.FC<Pos & { text: string; size: number; dur: number; fill?: string; ink?: string }> = ({
  text,
  x,
  y,
  rotate = -12,
  size,
  dur,
  fill = C.yellow,
  ink = C.red,
}) => {
  const f = useCurrentFrame();
  const exit = useExit(dur);
  const points = Array.from({ length: 32 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : 36;
    const a = (i / 32) * Math.PI * 2;
    return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
  }).join(" ");
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        rotate: `${rotate + f * 0.6}deg`,
        scale: String(interpolate(f, [0, 5, 9], [0, 1.15, 1], clamp)),
        opacity: exit,
      }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: "absolute", inset: 0, filter: `drop-shadow(6px 8px 0 ${C.shadow})` }}>
        <polygon points={points} fill={fill} stroke={ink} strokeWidth={2.5} />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          rotate: `${-(f * 0.6)}deg`,
          fontFamily: anton,
          fontSize: size * 0.26,
          color: ink,
          textTransform: "uppercase",
          lineHeight: 0.9,
          textAlign: "center",
          whiteSpace: "pre",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ---------- Stamp: rubber-stamp box that thumps down ----------
export const Stamp: React.FC<Pos & { text: string; size: number; dur: number; ink?: string }> = ({ text, x, y, rotate = -8, size, dur, ink = C.red }) => {
  const f = useCurrentFrame();
  const exit = useExit(dur);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        rotate: `${rotate}deg`,
        scale: String(interpolate(f, [0, 4, 6], [1.9, 0.96, 1], { ...clamp, easing: out })),
        opacity: interpolate(f, [0, 2], [0, 0.92], clamp) * exit,
        border: `${size * 0.09}px solid ${ink}`,
        borderRadius: size * 0.14,
        padding: `${size * 0.08}px ${size * 0.3}px`,
        fontFamily: anton,
        fontSize: size,
        lineHeight: 1,
        color: ink,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        mixBlendMode: "multiply",
        whiteSpace: "pre",
      }}
    >
      {text}
    </div>
  );
};

// ---------- HiddenWords: words inside the app's green "hidden" stripes ----------
export const HiddenWords: React.FC<Pos & { lead: string; hidden: string; size: number; dur: number }> = ({ lead, hidden, x, y, rotate = -4, size, dur }) => {
  const f = useCurrentFrame();
  const exit = useExit(dur);
  const reveal = interpolate(f, [8, 16], [0, 100], { ...clamp, easing: out });
  return (
    <div style={{ position: "absolute", left: x, top: y, rotate: `${rotate}deg`, opacity: exit }}>
      <WordArt text={lead} x={0} y={0} size={size} dur={dur} entrance="pop" />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: size * 0.98,
          padding: `${size * 0.06}px ${size * 0.16}px`,
          borderRadius: size * 0.16,
          background: `repeating-linear-gradient(135deg, rgba(143,211,182,0.95) 0 ${size * 0.12}px, rgba(40,110,85,0.95) ${size * 0.12}px ${size * 0.24}px)`,
          boxShadow: `${size * 0.05}px ${size * 0.06}px 0 ${C.shadow}`,
          clipPath: `inset(0 ${100 - reveal}% 0 0)`,
        }}
      >
        <span
          style={{
            fontFamily: anton,
            fontSize: size,
            lineHeight: 1,
            color: C.white,
            textTransform: "uppercase",
            WebkitTextStroke: `${size * 0.07}px #0f3b2c`,
            paintOrder: "stroke fill",
            whiteSpace: "pre",
          }}
        >
          {hidden}
        </span>
      </div>
    </div>
  );
};

// ---------- Crawl: tiny fast fine print along the bottom ----------
export const Crawl: React.FC<{ text: string; dur: number; y?: number }> = ({ text, dur, y = 1018 }) => {
  const f = useCurrentFrame();
  const exit = useExit(dur, 4);
  return (
    <AbsoluteFill style={{ opacity: exit }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: y, height: 44, background: "rgba(13,26,92,0.82)" }} />
      <div
        style={{
          position: "absolute",
          top: y + 6,
          left: interpolate(f, [0, dur], [1920, -1900]),
          fontFamily: mono,
          fontSize: 26,
          color: C.white,
          whiteSpace: "pre",
          letterSpacing: "0.02em",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ---------- Bubble: robot speech, typed on an LCD ----------
export const Bubble: React.FC<Pos & { lines: string[]; dur: number; width: number; tail?: "left" | "right" }> = ({ lines, x, y, width, dur, tail = "left" }) => {
  const f = useCurrentFrame();
  const exit = useExit(dur);
  const full = lines.join("\n");
  const shown = full.slice(0, Math.max(0, Math.floor((f - 4) * 1.6)));
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        scale: String(interpolate(f, [0, 5], [0.6, 1], { ...clamp, easing: overshoot })),
        transformOrigin: tail === "left" ? "0% 100%" : "100% 100%",
        opacity: interpolate(f, [0, 3], [0, 1], clamp) * exit,
      }}
    >
      <div
        style={{
          background: "#0b130e",
          border: `6px solid ${C.white}`,
          borderRadius: 18,
          padding: "16px 24px",
          boxShadow: `8px 10px 0 ${C.shadow}`,
          fontFamily: lcd,
          fontSize: 54,
          lineHeight: 1,
          color: "#7dff9a",
          textShadow: "0 0 10px rgba(125,255,154,0.7)",
          whiteSpace: "pre-wrap",
          minHeight: 54 * lines.length + 32,
        }}
      >
        {shown}
        <span style={{ opacity: Math.floor(f / 6) % 2 ? 1 : 0 }}>█</span>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: -26,
          [tail]: 40,
          width: 0,
          height: 0,
          borderLeft: "18px solid transparent",
          borderRight: "18px solid transparent",
          borderTop: `28px solid ${C.white}`,
        }}
      />
    </div>
  );
};

// ---------- DocsCard: a window showing real lines from docs/INTEGRATING.md ----------
export type DocLine = { t: string; kind?: "cmd" | "comment" | "key" | "plain" };

export const DocsCard: React.FC<Pos & { title: string; heading: string; lines: DocLine[]; dur: number; width: number }> = ({
  title,
  heading,
  lines,
  x,
  y,
  rotate = -2,
  dur,
  width,
}) => {
  const f = useCurrentFrame();
  const exit = useExit(dur, 6);
  const slide = interpolate(f, [0, 10], [-width - 120, 0], { ...clamp, easing: out });
  const color = (k?: DocLine["kind"]) =>
    k === "cmd" ? "#ffd23f" : k === "comment" ? "rgba(255,255,255,0.5)" : k === "key" ? C.green : "#ffffff";
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        translate: `${slide}px 0px`,
        rotate: `${rotate}deg`,
        opacity: exit,
        background: "#101216",
        borderRadius: 16,
        border: "4px solid #e8e8ee",
        boxShadow: `12px 14px 0 ${C.shadow}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 50,
          background: "#d9d9df",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 16px",
          fontFamily: mono,
          fontSize: 22,
          color: "#222",
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: 8, background: C.red }} />
        <span style={{ width: 16, height: 16, borderRadius: 8, background: C.yellow }} />
        <span style={{ width: 16, height: 16, borderRadius: 8, background: "#3bb54a" }} />
        <span style={{ marginLeft: 10 }}>{title}</span>
      </div>
      <div style={{ padding: "18px 24px 22px" }}>
        <div style={{ fontFamily: anton, fontSize: 40, color: C.white, textTransform: "uppercase", marginBottom: 10 }}>{heading}</div>
        {lines.map((l, i) => {
          const at = 12 + i * 7;
          return (
            <div
              key={i}
              style={{
                fontFamily: mono,
                fontSize: 24,
                lineHeight: 1.45,
                color: color(l.kind),
                whiteSpace: "pre",
                opacity: interpolate(f, [at, at + 3], [0, 1], clamp),
                translate: `${interpolate(f, [at, at + 5], [16, 0], { ...clamp, easing: out })}px 0px`,
              }}
            >
              {l.t}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- Brand chips: NEAR and Solana, in their own colours ----------
// Text badges in each network's brand colours (not their logo marks): NEAR is
// black/white with its green accent, Solana is its purple-to-green gradient.
export type Chip = { brand: "near" | "solana"; label: string };

const chipStyle = (brand: Chip["brand"]): React.CSSProperties =>
  brand === "near"
    ? { background: "#000000", color: "#ffffff", border: "4px solid #00ec97" }
    : { background: "linear-gradient(90deg, #9945ff, #14f195)", color: "#ffffff", border: "4px solid #ffffff" };

export const BrandRow: React.FC<Pos & { chips: Chip[]; size: number; dur: number; joiner?: string }> = ({
  chips,
  x,
  y,
  rotate = -3,
  size,
  dur,
  joiner = "→",
}) => {
  const f = useCurrentFrame();
  const exit = useExit(dur);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        rotate: `${rotate}deg`,
        display: "flex",
        alignItems: "center",
        gap: size * 0.35,
        opacity: exit,
      }}
    >
      {chips.map((c, i) => {
        const at = i * 5;
        return (
          <React.Fragment key={i}>
            {i > 0 ? (
              <span
                style={{
                  fontFamily: anton,
                  fontSize: size * 1.1,
                  color: C.white,
                  WebkitTextStroke: `${size * 0.08}px ${C.navy}`,
                  paintOrder: "stroke fill",
                  opacity: interpolate(f, [at - 2, at], [0, 1], clamp),
                }}
              >
                {joiner}
              </span>
            ) : null}
            <span
              style={{
                ...chipStyle(c.brand),
                fontFamily: anton,
                fontSize: size,
                lineHeight: 1,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: `${size * 0.18}px ${size * 0.4}px`,
                borderRadius: size * 0.3,
                boxShadow: `${size * 0.08}px ${size * 0.1}px 0 ${C.shadow}`,
                whiteSpace: "pre",
                scale: String(interpolate(f - at, [0, 4, 7], [0.3, 1.1, 1], clamp)),
                opacity: interpolate(f - at, [0, 2], [0, 1], clamp),
              }}
            >
              {c.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ---------- ScreenInset: a big, readable copy of the app screen on the tablet ----------
// The tablet is ~200px wide in the frame, so muted on the landing page the UI can't be
// read. This shows the same screen component at the same frame, magnified in a framed
// "ACTUAL SCREEN" insert, like a 90s infomercial picture-in-picture.
export const ScreenInset: React.FC<
  Pos & {
    Screen: React.FC<{ f: number }>;
    screen: { w: number; h: number };
    width: number;
    dur: number;
    offset?: number; // clip-local frame at which this inset starts
  }
> = ({ Screen, screen, width, x, y, rotate = 2, dur, offset = 0 }) => {
  const f = useCurrentFrame();
  const exit = useExit(dur, 5);
  const k = width / screen.w;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        rotate: `${rotate}deg`,
        scale: String(interpolate(f, [0, 6], [0.3, 1], { ...clamp, easing: overshoot })),
        transformOrigin: "0% 50%",
        opacity: interpolate(f, [0, 3], [0, 1], clamp) * exit,
      }}
    >
      <div
        style={{
          width,
          height: screen.h * k,
          border: "8px solid #f4f4f6",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: `12px 14px 0 ${C.shadow}`,
          background: "#101216",
        }}
      >
        <div style={{ width: screen.w, height: screen.h, scale: String(k), transformOrigin: "0 0" }}>
          <Screen f={f + offset} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: -14,
          top: -30,
          rotate: "-4deg",
          background: C.red,
          color: C.white,
          fontFamily: anton,
          fontSize: 30,
          letterSpacing: "0.06em",
          padding: "4px 14px",
          boxShadow: `5px 6px 0 ${C.shadow}`,
        }}
      >
        ACTUAL SCREEN
      </div>
    </div>
  );
};

// ---------- Arrow: a hand-drawn-ish pointer ----------
export const Arrow: React.FC<Pos & { length: number; dur: number; color?: string }> = ({ x, y, rotate = 0, length, dur, color = C.yellow }) => {
  const f = useCurrentFrame();
  const exit = useExit(dur);
  const grow = interpolate(f, [0, 8], [0, 1], { ...clamp, easing: out });
  return (
    <svg
      width={length + 60}
      height={120}
      style={{ position: "absolute", left: x, top: y, rotate: `${rotate}deg`, transformOrigin: "0% 50%", opacity: exit, overflow: "visible" }}
    >
      <g style={{ filter: `drop-shadow(5px 6px 0 ${C.shadow})` }}>
        <path
          d={`M 0 60 Q ${length * 0.5} 20 ${length * grow} 60`}
          stroke={color}
          strokeWidth={16}
          fill="none"
          strokeLinecap="round"
        />
        {grow > 0.95 ? (
          <polygon points={`${length + 40},60 ${length - 10},22 ${length - 10},98`} fill={color} />
        ) : null}
      </g>
    </svg>
  );
};
