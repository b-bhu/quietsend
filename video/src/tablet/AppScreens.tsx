import React from "react";
import { interpolate, Easing } from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadSans } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// The quietsend app UI (tokens from docs/mocks/02-landing.html), simplified and
// scaled up so it still reads when the tablet is only ~200px wide in the frame.
const { fontFamily: serif } = loadSerif("normal", { weights: ["400"], subsets: ["latin"] });
const { fontFamily: sans } = loadSans("normal", { weights: ["500", "600"], subsets: ["latin"] });
const { fontFamily: mono } = loadMono("normal", { weights: ["500"], subsets: ["latin"] });

const T = {
  bg: "#101216",
  surface: "#181a20",
  surface2: "#2a2e38",
  line: "rgba(222,210,241,0.22)",
  text: "#ffffff",
  text2: "rgba(255,255,255,0.66)",
  text3: "rgba(255,255,255,0.4)",
  public: "#f2b866",
  publicBg: "rgba(242,184,102,0.16)",
  hidden: "#8fd3b6",
  hiddenBg: "rgba(143,211,182,0.16)",
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

// characters of `text` visible at frame f, typing from `start` at `perFrame` chars per frame
const typed = (text: string, f: number, start: number, perFrame = 0.7) =>
  text.slice(0, Math.max(0, Math.floor((f - start) * perFrame)));

const RECIPIENT = "9xQe…f3Kp";

// ---------- shared pieces ----------

const Shell: React.FC<{ w: number; h: number; children: React.ReactNode }> = ({ w, h, children }) => (
  <div
    style={{
      width: w,
      height: h,
      background: T.bg,
      color: T.text,
      fontFamily: sans,
      fontWeight: 500,
      letterSpacing: "-0.01em",
      overflow: "hidden",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      padding: 40,
      boxSizing: "border-box",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontFamily: serif, fontSize: 44 }}>quietsend</span>
      <span
        style={{
          fontSize: 22,
          color: T.text2,
          border: `2px solid ${T.line}`,
          borderRadius: 999,
          padding: "6px 16px",
        }}
      >
        Testnet
      </span>
    </div>
    {children}
  </div>
);

const Field: React.FC<{ value: string; placeholder: string; suffix?: string; monoText?: boolean; caret?: boolean }> = ({
  value,
  placeholder,
  suffix,
  monoText,
  caret,
}) => (
  <div
    style={{
      height: 84,
      borderRadius: 22,
      background: T.surface,
      border: `3px solid ${caret ? T.text : T.line}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 26px",
      fontSize: 34,
      fontFamily: value && monoText ? mono : sans,
      color: value ? T.text : T.text3,
    }}
  >
    <span>
      {value || placeholder}
      {caret ? <span style={{ color: T.text }}>|</span> : null}
    </span>
    {suffix ? <span style={{ color: T.text3, fontFamily: sans, fontSize: 28 }}>{suffix}</span> : null}
  </div>
);

const Button: React.FC<{ label: string; pressed: number }> = ({ label, pressed }) => (
  <div
    style={{
      height: 92,
      borderRadius: 999,
      background: T.text,
      color: T.bg,
      fontWeight: 600,
      fontSize: 36,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      scale: String(1 - 0.06 * pressed),
    }}
  >
    {label}
  </div>
);

const Tag: React.FC<{ hidden: boolean; big?: boolean }> = ({ hidden, big }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      height: big ? 56 : 44,
      padding: big ? "0 24px" : "0 18px",
      borderRadius: 999,
      fontSize: big ? 28 : 22,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: hidden ? T.hidden : T.public,
      background: hidden ? T.hiddenBg : T.publicBg,
      flex: "none",
    }}
  >
    {hidden ? "Hidden" : "Public"}
  </span>
);

const Check: React.FC<{ f: number; size: number }> = ({ f, size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: T.hiddenBg,
      border: `4px solid ${T.hidden}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: T.hidden,
      fontSize: size * 0.55,
      fontWeight: 600,
      scale: String(interpolate(f, [0, 8], [0.4, 1], { ...clamp, easing: Easing.bezier(0.34, 1.56, 0.64, 1) })),
    }}
  >
    ✓
  </div>
);

const Row: React.FC<{ k: string; v: string; hidden: boolean; o: number }> = ({ k, v, hidden, o }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: "16px 20px",
      borderRadius: 18,
      background: hidden
        ? "repeating-linear-gradient(135deg, rgba(143,211,182,0.12) 0 10px, transparent 10px 20px)"
        : T.surface,
      opacity: o,
      translate: `0px ${(1 - o) * 14}px`,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 22, color: T.text3 }}>{k}</span>
      <span style={{ fontSize: 28, fontFamily: mono, color: hidden ? T.text2 : T.text }}>{v}</span>
    </div>
    <Tag hidden={hidden} />
  </div>
);

// ---------- Screen A: "One NEAR account. Pick who, pick how much, send!" (landscape, 89 frames) ----------
export const SCREEN_A = { w: 900, h: 600 };
export const ScreenA: React.FC<{ f: number }> = ({ f }) => {
  const to = typed(RECIPIENT, f, 6, 0.6);
  const amt = typed("20", f, 30, 0.25);
  const press = interpolate(f, [50, 53, 57], [0, 1, 0], clamp);
  const sent = f >= 58;
  if (sent) {
    return (
      <Shell w={SCREEN_A.w} h={SCREEN_A.h}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 44, paddingLeft: 30 }}>
          <Check f={f - 58} size={170} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: interpolate(f, [60, 68], [0, 1], clamp) }}>
            <span style={{ fontFamily: serif, fontSize: 130, lineHeight: 0.95 }}>Sent</span>
            <span style={{ fontSize: 34, color: T.text2 }}>
              20.00 USDC to <span style={{ fontFamily: mono, color: T.text }}>{RECIPIENT}</span>
            </span>
            <span style={{ fontSize: 26, color: T.text3 }}>from you.testnet</span>
          </div>
        </div>
      </Shell>
    );
  }
  return (
    <Shell w={SCREEN_A.w} h={SCREEN_A.h}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 18 }}>
        <span style={{ fontFamily: serif, fontSize: 84, lineHeight: 1 }}>Send USDC</span>
        <span style={{ fontSize: 26, color: T.text2 }}>
          you.testnet · <b style={{ color: T.text }}>140.50</b>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 26 }}>
        <Field value={to} placeholder="Recipient's Solana address" monoText caret={f >= 6 && f < 30} />
        <Field value={amt} placeholder="Amount" suffix="USDC" caret={f >= 30 && f < 50} />
        <Button label={amt === "20" ? "Send 20.00 USDC" : "Send"} pressed={press} />
      </div>
    </Shell>
  );
};

// ---------- Screen B: "Solangel? Send. Hide who you paid. Go nuts, man!" (portrait, 118 frames) ----------
export const SCREEN_B = { w: 600, h: 760 };
export const ScreenB: React.FC<{ f: number }> = ({ f }) => {
  const hide = interpolate(f, [22, 30], [0, 1], { ...clamp, easing: ease });
  const press = interpolate(f, [62, 65, 69], [0, 1, 0], clamp);
  const sent = f >= 70;
  if (sent) {
    const r = (s: number) => interpolate(f, [s, s + 8], [0, 1], clamp);
    return (
      <Shell w={SCREEN_B.w} h={SCREEN_B.h}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34 }}>
          <Check f={f - 70} size={96} />
          <span style={{ fontFamily: serif, fontSize: 104, lineHeight: 1 }}>Sent</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 30 }}>
          <Row k="Sender" v="you.testnet" hidden={false} o={r(74)} />
          <Row k="Recipient" v="Not in this tx" hidden o={r(80)} />
          <Row k="Amount" v="50.05 USDC" hidden={false} o={r(86)} />
        </div>
      </Shell>
    );
  }
  return (
    <Shell w={SCREEN_B.w} h={SCREEN_B.h}>
      <span style={{ fontFamily: serif, fontSize: 84, lineHeight: 1, marginTop: 26 }}>Send USDC</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
        <Field value="solangel.sol" placeholder="" monoText />
        <Field value="50" placeholder="Amount" suffix="USDC" />
        {/* Normal | Hide recipient switch */}
        <div
          style={{
            position: "relative",
            height: 84,
            borderRadius: 22,
            background: T.surface,
            border: `3px solid ${T.line}`,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 6,
              bottom: 6,
              left: 6,
              width: "calc(50% - 6px)",
              borderRadius: 16,
              background: T.surface2,
              translate: `${hide * 100}% 0px`,
            }}
          />
          <span style={{ zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: hide < 0.5 ? T.text : T.text3 }}>
            Normal
          </span>
          <span style={{ zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: hide >= 0.5 ? T.text : T.text3 }}>
            Hide recipient
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 56, fontSize: 24, color: T.text2 }}>
          <Tag hidden={hide >= 0.5} big />
          <span>{hide >= 0.5 ? "Who you paid" : "Who, how much, when"}</span>
        </div>
        <Button label="Send 50.00 USDC" pressed={press} />
      </div>
    </Shell>
  );
};

// ---------- Screen C: the hidden-recipient receipt, two steps (landscape, 116 frames) ----------
export const SCREEN_C = { w: 900, h: 600 };
export const ScreenC: React.FC<{ f: number }> = ({ f }) => {
  const step = (s: number) => interpolate(f, [s, s + 10], [0, 1], { ...clamp, easing: ease });
  const done = f >= 64;
  const Card: React.FC<{ where: string; title: string; o: number; children: React.ReactNode }> = ({ where, title, o, children }) => (
    <div
      style={{
        flex: 1,
        background: T.surface,
        border: `3px solid ${T.line}`,
        borderRadius: 28,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: 0.35 + 0.65 * o,
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.text3 }}>{where}</span>
      <span style={{ fontFamily: serif, fontSize: 44, lineHeight: 1 }}>{title}</span>
      {children}
    </div>
  );
  return (
    <Shell w={SCREEN_C.w} h={SCREEN_C.h}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 16 }}>
        {done ? <Check f={f - 64} size={74} /> : null}
        <span style={{ fontFamily: serif, fontSize: 84, lineHeight: 1 }}>{done ? "Sent" : "Sending"}</span>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 22, flex: 1 }}>
        <Card where="Step 1" title="You → vault" o={step(6)}>
          <Row k="Recipient" v="Not in tx" hidden o={step(14)} />
        </Card>
        <Card where="Step 2" title="Vault → them" o={step(36)}>
          <Row k="Sender" v="Not in tx" hidden o={step(44)} />
        </Card>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginTop: 18,
          fontSize: 26,
          color: T.text2,
          opacity: step(68),
        }}
      >
        <Tag hidden big />
        <span>No transaction names you and them together.</span>
      </div>
    </Shell>
  );
};
