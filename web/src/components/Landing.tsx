import { useEffect, useRef, useState } from "react";
import { Arrow } from "./icons";

/**
 * The marketing screen. The video sells; this page states what the product is.
 * Drop the ad at public/ad.mp4 (poster at public/ad-poster.jpg) and it plays automatically;
 * until then the poster frame alone is shown.
 */
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

  return (
    <main className="landing">
      <section className="hero">
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
        </div>
        <div className="scrim" />

        <header className="top">
          <span className="logo">quietsend</span>
          <span className="net">Test networks only</span>
        </header>

        <div className="over">
          <div className="pitch">
            <h1>No new wallet</h1>
            <p>Your NEAR account can already send on Solana. One login, no seed phrase, no bridge.</p>
            <div className="cta">
              <button className="btn" onClick={onEnter}>
                Send USDC <Arrow />
              </button>
              <span className="cta-note">Testnet. No real money.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <ul className="points">
          <li>
            <b>One account</b>
            <span>Sign in with NEAR. We derive your Solana address from it. No seed phrase to keep.</span>
          </li>
          <li>
            <b>Hide the recipient</b>
            <span>Send so that no single transaction names you and the recipient together.</span>
          </li>
          <li>
            <b>Agent ready, with limits</b>
            <span>
              Plug an agent in over MCP. A NEAR contract caps what it can spend per transfer and per day,
              and holds anything over that for you to approve.{" "}
              <a className="link" href="/docs/INTEGRATING.md" target="_blank" rel="noreferrer">
                Docs for agents
              </a>
            </span>
          </li>
        </ul>
      </section>
    </main>
  );
}
