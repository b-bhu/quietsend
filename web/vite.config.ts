import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
/**
 * Serve .md with an explicit UTF-8 charset. Without it the browser falls back to
 * Latin-1 and the docs at /docs/*.md render em dashes as mojibake.
 */
const markdownCharset = {
  name: "markdown-charset",
  configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
    server.middlewares.use((req: { url?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
      if (req.url?.endsWith(".md")) res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      next();
    });
  },
};

/**
 * index.html preloads the app chunk on any route but the landing (see the script there).
 * Its hashed filename and its imports only exist after bundling, so fill them in here.
 * In dev there is no bundle and the placeholder stays, which the script skips.
 */
const appChunkPreload = {
  name: "app-chunk-preload",
  transformIndexHtml: {
    order: "post" as const,
    handler(html: string, ctx: { bundle?: Record<string, { type: string; name?: string; isDynamicEntry?: boolean; fileName: string; imports?: string[] }> }) {
      if (!ctx.bundle) return html;
      const app = Object.values(ctx.bundle).find((c) => c.type === "chunk" && c.isDynamicEntry && c.name === "App");
      if (!app) throw new Error("app-chunk-preload: no App chunk in the bundle (main.tsx/Root.tsx changed?)");
      const files = [app.fileName, ...(app.imports ?? [])].map((f) => `"/${f}"`).join(", ");
      return html.replace('"__APP_CHUNKS__"', files);
    },
  },
};

export default defineConfig({
  plugins: [react(), markdownCharset, appChunkPreload],
  resolve: {
    alias: {
      "@quietsend/core": resolve(root, "../core/index.ts"),
    },
  },
  server: {
    fs: { allow: [resolve(root, "..")] },
  },
});
