import { useEffect, useRef, useState } from "react";
import { Arrow } from "./icons";

/**
 * The marketing screen. The video sells; this page states what the product is.
 * Drop the ad at public/ad.mp4 (poster at public/ad-poster.jpg) and it plays automatically;
 * until then the poster frame alone is shown.
 */
const GITHUB_URL = "https://github.com/b-bhu/quietsend";

// Bump when web/public/ad.mp4 or ad-poster.jpg changes, so browsers fetch the new file
// instead of replaying a cached one from the same URL.
// The poster preload in index.html repeats these URLs: bump it there too.
const AD_VERSION = "v3";

// The button follows the ad. Times are seconds into ad.mp4 (42.4 s, loops); each cue
// lasts until the next one. Labels track what Mike is saying on screen at that moment.
type Tone = "plain" | "near" | "private";
const CUES: { t: number; label: string; tone: Tone }[] = [
  { t: 0, label: "Send USDC", tone: "plain" }, // intro, "a wallet for every chain?"
  { t: 9.42, label: "One NEAR account", tone: "near" }, // "No new wallet!"
  { t: 13.42, label: "Send USDC on Solana", tone: "near" }, // the send form on the tablet
  { t: 15.83, label: "Sent \u2713", tone: "near" }, // "SENT!"
  { t: 17.67, label: "Hide who you paid", tone: "private" }, // hide recipient, you -> vault -> them
  { t: 27.54, label: "Plug in your agent", tone: "near" }, // robot arrives, "plug in with MCP"
  { t: 36.62, label: "Try it on testnet", tone: "near" }, // "Try this at home!"
];
const cueAt = (t: number) => {
  let i = 0;
  while (i + 1 < CUES.length && t >= CUES[i + 1].t) i++;
  return i;
};
const X_URL = "https://x.com/bivhu_";

export default function Landing({ onEnter }: { onEnter: () => void }) {
  // The ad is optional: show it only once a real video file actually decodes.
  // (Vite's dev server answers unknown paths with index.html, so a missing ad.mp4
  // arrives as a 200 of HTML and must not be mistaken for a video.)
  const [adReady, setAdReady] = useState(false);
  const [posterReady, setPosterReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const ok = () => setAdReady(true);
    const bad = () => setAdReady(false);
    v.addEventListener("loadeddata", ok);
    v.addEventListener("error", bad);
    return () => {
      v.removeEventListener("loadeddata", ok);
      v.removeEventListener("error", bad);
    };
  }, []);

  // Follow the ad's playhead. Before the film can play, the button keeps its plain label.
  const [cue, setCue] = useState(0);
  useEffect(() => {
    const v = video.current;
    if (!v || !adReady) {
      setCue(0);
      return;
    }
    // Every frame while visible, plus the video's own events, which still fire when
    // animation frames are throttled (background tabs, low-power mode) and on seek or loop.
    const sync = () => {
      const i = cueAt(v.currentTime);
      setCue((prev) => (prev === i ? prev : i));
    };
    let raf = 0;
    const tick = () => {
      sync();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const events = ["timeupdate", "seeked", "play"] as const;
    events.forEach((e) => v.addEventListener(e, sync));
    return () => {
      cancelAnimationFrame(raf);
      events.forEach((e) => v.removeEventListener(e, sync));
    };
  }, [adReady]);
  const current = CUES[cue];

  // Autoplay must start muted; the viewer can turn the voices on.
  const [muted, setMuted] = useState(true);
  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) void v.play();
    setMuted(v.muted);
  };

  // The ad carries the whole pitch in its own captions, so on a desktop the page is just a
  // header, the full uncropped 16:9 film, and one Send USDC button on the film's lower edge.
  // On a phone the film can't fill the screen without cropping off its captions, so it sits
  // under the header, the pitch is written out below it, and the button drops to thumb reach.
  return (
    <main className="landing">
      <section className="hero">
        <header className="top">
          <span className="logo">quietsend</span>
          <nav className="top-links">
            <a className="link" href="#/docs">Docs</a>
            <a className="link" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
            <a className="link" href={X_URL} target="_blank" rel="noreferrer">X</a>
          </nav>
        </header>

        <div className="stage">
          <div className="film">
            {/* The poster frame paints first (preloaded from index.html); the ad covers it once
                it decodes. The film itself only starts downloading after the poster has
                landed, so on a slow phone the 23 MB file doesn't starve the first paint. */}
            {/* Phones get the 960 px frame at any pixel density (it is only on screen until
                the film starts); keep these URLs in step with the preload in index.html. */}
            <picture>
              <source media="(max-width: 760px)" srcSet={`/ad-poster-960.jpg?${AD_VERSION}`} />
              <img
                className="plate"
                src={`/ad-poster.jpg?${AD_VERSION}`}
                fetchPriority="high"
                onLoad={() => setPosterReady(true)}
                onError={() => setPosterReady(true)}
                alt=""
                aria-hidden="true"
              />
            </picture>
            <video
              ref={video}
              className={"plate film-video" + (adReady ? " ready" : "")}
              src={posterReady ? `/ad.mp4?${AD_VERSION}` : undefined}
              autoPlay
              muted
              loop
              playsInline
              aria-hidden="true"
            />
            {adReady ? (
              <button className="ghost sound" aria-pressed={!muted} onClick={toggleSound}>
                {muted ? "Sound off" : "Sound on"}
              </button>
            ) : null}
          </div>

          {/* Phone only; on a desktop the film's captions say this and it stays for screen readers. */}
          <div className="pitch">
            <h1>Send USDC on Solana from one NEAR account.</h1>
            <p>No new wallet. Hide who you paid, or let your AI agent send within limits. Try it on testnet.</p>
          </div>

          {/* Desktop: centred, 10% up from the bottom of the film. Phone: under the pitch. */}
          <button className={"btn film-cta tone-" + current.tone} onClick={onEnter} aria-label="Send USDC">
            <span key={cue} className="cta-label" aria-hidden="true">
              {current.label} <Arrow />
            </span>
          </button>
        </div>
      </section>
    </main>
  );
}
