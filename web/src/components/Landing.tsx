import { useEffect, useRef, useState } from "react";
import { Arrow } from "./icons";

/**
 * The marketing screen. The video sells; this page states what the product is.
 * Drop the ad at public/ad.mp4 (poster at public/ad-poster.jpg) and it plays automatically;
 * until then the poster frame alone is shown.
 */
const GITHUB_URL = "https://github.com/b-bhu/quietsend";
const X_URL = "https://x.com/bivhu_";

export default function Landing({ onEnter }: { onEnter: () => void }) {
  // The ad is optional: show it only once a real video file actually decodes.
  // (Vite's dev server answers unknown paths with index.html, so a missing ad.mp4
  // arrives as a 200 of HTML and must not be mistaken for a video.)
  const [adReady, setAdReady] = useState(false);
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

  // Autoplay must start muted; the viewer can turn the voices on.
  const [muted, setMuted] = useState(true);
  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) void v.play();
    setMuted(v.muted);
  };

  // The ad carries the whole pitch in its own captions, so the page is just a header,
  // the full uncropped 16:9 film, and one Send USDC button on the film's lower edge.
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

        <div className="film">
          {/* The poster frame always paints; the ad covers it once public/ad.mp4 exists. */}
          <img className="plate" src="/ad-poster.jpg" alt="" aria-hidden="true" />
          <video
            ref={video}
            className={"plate film-video" + (adReady ? " ready" : "")}
            src="/ad.mp4"
            poster="/ad-poster.jpg"
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
          {/* centred, 10% up from the bottom of the film */}
          <button className="btn film-cta" onClick={onEnter}>
            Send USDC <Arrow />
          </button>
        </div>
      </section>
    </main>
  );
}
