import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Stamps the build id into dist/sw.js (public/sw.js holds "__OR_RELEASE__"),
 * so every deploy ships a changed service worker: the browser installs it,
 * the app shows "Update available", and the old caches are cleaned up. */
function swRelease(release: string): Plugin {
  let outDir = "dist";
  return {
    name: "offerready-sw-release",
    apply: "build",
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const file = path.join(outDir, "sw.js");
      if (!fs.existsSync(file)) return;
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").split("__OR_RELEASE__").join(release));
    },
  };
}

// The OfferReady API (../api, Vercel Functions) only allows CORS from one
// origin (ALLOWED_ORIGIN). So in development we don't call it cross-origin:
// the browser talks to /api on the Vite dev server, and Vite proxies it to the
// deployed backend server-side. In production (GitHub Pages) the build sets
// VITE_API_BASE to the Vercel API, which already allows the
// https://klnjoy.github.io origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_PROXY_TARGET || "https://offerready-beta.vercel.app";
  // Build id: the commit in CI, else a timestamp. Exposed to the app as
  // import.meta.env.VITE_RELEASE (error reports) and stamped into sw.js.
  const release = (env.VITE_RELEASE || (process.env.GITHUB_SHA || "").slice(0, 12) || new Date().toISOString().replace(/\D/g, "").slice(0, 14)).trim();
  process.env.VITE_RELEASE = release;
  return {
    // "/" locally; "/offerready-app/" when built for GitHub Pages (set in CI).
    base: env.VITE_BASE || "/",
    plugins: [react(), swRelease(release)],
    server: {
      port: 5173,
      proxy: {
        "/api": { target, changeOrigin: true, secure: true },
      },
    },
  };
});
