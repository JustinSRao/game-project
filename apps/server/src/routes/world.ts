import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AreaAction, type TurnEvent } from "@howeverfar/schema";
import { NO_KEY_MESSAGE } from "@howeverfar/director";
import { listWorldSessions } from "@howeverfar/library";
import { ModelUnavailableError, NotFoundError } from "../sessionManager.js";
import type { WorldSessionManager } from "../worldSessionManager.js";

const NO_KEY_RESPONSE = `${NO_KEY_MESSAGE} The prologue plays without one; choosing a path does not.`;

const CreateWorldSessionBody = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("new") }),
  z.object({ mode: z.literal("resume"), id: z.string().min(1) }),
]);

function issuesMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

/** HTTP surface for RPG sessions (Area DSL v1) — the area-era twin of sessions.ts. */
export function registerWorldRoutes(
  app: FastifyInstance,
  sessions: WorldSessionManager,
): void {
  app.get("/api/world-sessions", async () => listWorldSessions());

  app.post("/api/world-sessions", async (req, reply) => {
    if (!sessions.available) {
      return reply.code(503).send({ error: NO_KEY_RESPONSE });
    }
    const parsed = CreateWorldSessionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: issuesMessage(parsed.error) });
    }
    try {
      const director =
        parsed.data.mode === "new" ? sessions.createNew() : sessions.get(parsed.data.id);
      const session = director.getSession();
      return {
        sessionId: session.id,
        phase: session.phase,
        path: session.path,
        area: director.currentArea(),
        state: session.state,
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof ModelUnavailableError) {
        return reply.code(503).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(502).send({ error: "Could not start the session — try again." });
    }
  });

  /**
   * The same turn as the route below, streamed (Phase 6 latency). Emits
   * `stage` events as the Director works and `chunk` events for prose arriving
   * as it is written, then exactly one terminal `result` or `error`.
   *
   * Server-sent events rather than a WebSocket: a turn is one request with one
   * answer and a running commentary, which is precisely the shape SSE has, and
   * it needs no protocol on the client beyond fetch. (The Reunion is the other
   * shape — two players, both talking — and that one is a socket.)
   */
  app.post("/api/world-sessions/:id/action/stream", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsedAction = AreaAction.safeParse(req.body);
    if (!parsedAction.success) {
      return reply.code(400).send({ error: issuesMessage(parsedAction.error) });
    }

    let director;
    try {
      director = sessions.get(id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof ModelUnavailableError) {
        return reply.code(503).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(502).send({ error: "Could not load the session — try again." });
    }

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Proxies that buffer would defeat the entire point of this route.
      "x-accel-buffering": "no",
    });

    const send = (event: TurnEvent): void => {
      if (reply.raw.writableEnded) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await director.handleAction(parsedAction.data, {
        stage: (stage) => send({ type: "stage", stage }),
        chunk: (text) => send({ type: "chunk", text }),
      });
      sessions.persist(director);
      send({ type: "result", result });
    } catch (err) {
      req.log.error(err);
      send({
        type: "error",
        message: "The world resisted being written just now — try again.",
      });
    } finally {
      reply.raw.end();
    }
    // The raw socket owns the response from here; Fastify must not also reply.
    return reply;
  });

  app.post("/api/world-sessions/:id/action", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsedAction = AreaAction.safeParse(req.body);
    if (!parsedAction.success) {
      return reply.code(400).send({ error: issuesMessage(parsedAction.error) });
    }

    let director;
    try {
      director = sessions.get(id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof ModelUnavailableError) {
        return reply.code(503).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(502).send({ error: "Could not load the session — try again." });
    }

    try {
      const result = await director.handleAction(parsedAction.data);
      sessions.persist(director);
      return result;
    } catch (err) {
      req.log.error(err);
      return reply
        .code(502)
        .send({ error: "The world resisted being written just now — try again." });
    }
  });
}
