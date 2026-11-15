import { Suspense, lazy, useEffect, useState } from "react";
import Landing from "./components/Landing";

// The landing is the first thing most visitors load, on any phone, so it ships alone: React,
// the landing and the stylesheet. The app (wallets, Solana, NEAR, docs) is a separate chunk,
// fetched once the landing has painted and loaded, so Send is ready by the time it's tapped.
// Once the app has loaded it owns every route, the landing included, exactly as before.
const loadApp = () => import("./App");
const App = lazy(loadApp);

const isLanding = () => !location.hash.slice(2);

export default function Root() {
  const [needsApp, setNeedsApp] = useState(() => !isLanding());
  useEffect(() => {
    if (needsApp) return;
    const f = () => !isLanding() && setNeedsApp(true);
    window.addEventListener("hashchange", f);
    const warm = () => setTimeout(() => void loadApp(), 0);
    if (document.readyState === "complete") warm();
    else window.addEventListener("load", warm, { once: true });
    return () => {
      window.removeEventListener("hashchange", f);
      window.removeEventListener("load", warm);
    };
  }, [needsApp]);

  if (!needsApp) return <Landing onEnter={() => (location.hash = "#/send")} />;
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
