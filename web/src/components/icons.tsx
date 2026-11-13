/** Inline icons, ported from the mock's <symbol> sprite. */
const s = { width: "1em", height: "1em", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const Arrow = () => (
  <svg {...s}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);
export const Back = () => (
  <svg {...s}><path d="M13 8H3M7 4 3 8l4 4" /></svg>
);
export const Eye = () => (
  <svg {...s} strokeWidth={1.5}><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></svg>
);
export const EyeOff = () => (
  <svg {...s} strokeWidth={1.5}><path d="M6.5 4.1A6.3 6.3 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a12 12 0 0 1-2 2.6M3.9 5.2A12.5 12.5 0 0 0 1.5 8S4 12.5 8 12.5c.9 0 1.7-.2 2.4-.5M2 2l12 12" /></svg>
);
export const Copy = () => (
  <svg {...s} strokeWidth={1.5}><rect x="5.5" y="5.5" width="8" height="8" rx="2" /><path d="M10.5 3.5h-6a2 2 0 0 0-2 2v6" /></svg>
);
export const Out = () => (
  <svg {...s} strokeWidth={1.5}><path d="M9 3h4v4M13 3 7.5 8.5M12 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2.5" /></svg>
);
