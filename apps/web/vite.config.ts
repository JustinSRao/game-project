import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The browser never talks to the Claude API (CLAUDE.md invariant 6) — every
 * /api request is proxied to the server (apps/server, port 3001), which owns
 * ANTHROPIC_API_KEY.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
