import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The OfferReady API (../api, Vercel Functions) only allows CORS from one
// origin (ALLOWED_ORIGIN). So in development we don't call it cross-origin:
// the browser talks to /api on the Vite dev server, and Vite proxies it to the
// deployed backend server-side. In production (GitHub Pages) the build sets
// VITE_API_BASE to the Vercel API, which already allows the
// https://klnjoy.github.io origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_PROXY_TARGET || "https://offerready-beta.vercel.app";
  return {
    // "/" locally; "/offerready-app/" when built for GitHub Pages (set in CI).
    base: env.VITE_BASE || "/",
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target, changeOrigin: true, secure: true },
      },
    },
  };
});
