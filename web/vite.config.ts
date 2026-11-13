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

export default defineConfig({
  plugins: [react(), markdownCharset],
  resolve: {
    alias: {
      "@quietsend/core": resolve(root, "../core/index.ts"),
    },
  },
  server: {
    fs: { allow: [resolve(root, "..")] },
  },
});
