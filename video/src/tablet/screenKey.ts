import { createEffect, type InteractivitySchema } from "remotion";

// Keys out the blank Grok tablet screen. The screen is near pure white with bright
// green and blue (>= 245); the table, wall and skin all have G/B well below that.
// Pixels whose min(G, B) is between `low` and `high` fade out, above `high` they are gone.
type ScreenKeyParams = {
  readonly low?: number;
  readonly high?: number;
};

const schema = {
  low: { type: "number", min: 200, max: 255, step: 1, default: 236, description: "Fade start", hiddenFromList: false },
  high: { type: "number", min: 200, max: 255, step: 1, default: 246, description: "Fully keyed", hiddenFromList: false },
} as const satisfies InteractivitySchema;

type State = { ctx: CanvasRenderingContext2D };

export const screenKey = createEffect<ScreenKeyParams, State>({
  type: "dev.quietsend.screenKey",
  label: "screenKey()",
  documentationLink: null,
  backend: "2d",
  schema,
  calculateKey: (p) => `${p.low ?? 236}-${p.high ?? 246}`,
  validateParams: () => {},
  setup: (target) => ({ ctx: target.getContext("2d", { willReadFrequently: true })! }),
  apply: ({ source, state, params, width, height }) => {
    const low = params.low ?? 236;
    const high = params.high ?? 246;
    const { ctx } = state;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const img = ctx.getImageData(0, 0, width, height);
    const px = img.data;
    const span = Math.max(1, high - low);
    for (let i = 0; i < px.length; i += 4) {
      const m = px[i + 1] < px[i + 2] ? px[i + 1] : px[i + 2];
      if (m <= low) continue;
      const k = m >= high ? 1 : (m - low) / span;
      px[i + 3] = Math.round(px[i + 3] * (1 - k));
    }
    ctx.putImageData(img, 0, 0);
  },
  cleanup: () => {},
});
