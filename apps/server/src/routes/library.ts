import type { FastifyInstance } from "fastify";
import { listBundles } from "@howeverfar/library";

export function registerLibraryRoutes(app: FastifyInstance): void {
  app.get("/api/library", async () => listBundles());
}
