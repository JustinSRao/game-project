import { defineConfig } from "vite";

/**
 * The game client is presentation + input only (ADR-0010). When the Director
 * arrives, every /api request proxies to apps/server (port 3001), which owns
 * the model API key — the browser never talks to a model API directly.
 */
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        // The Reunion plays over a WebSocket at /api/reunions/:id/play
        // (reunionClient.ts connects to ws://<vite host>/api/...), so the dev
        // proxy has to forward the upgrade too — without this the shared world
        // never connects in the browser, only in the server-direct tests.
        ws: true,
      },
    },
  },
});
