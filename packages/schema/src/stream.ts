import { z } from "zod";

/**
 * The streaming turn protocol (Phase 6 latency).
 *
 * A turn that has to wait on the model — the crossing, a generate-portal, a
 * free-text action — can take minutes. The plain request/response route still
 * works and still returns exactly the same result; this is what a client uses
 * when it would rather show the wait than hide it.
 *
 * Two kinds of event carry that: `stage` says what the work is doing now, in
 * terms a client can dress as fiction rather than as a progress bar, and
 * `chunk` is prose arriving as it is written.
 */
export const TurnStage = z.enum([
  /** Reading how the player played the prologue. */
  "profiling",
  /** The Architect planning this player's side of the story. */
  "planning",
  /** The World Writer authoring the area beyond the door. */
  "writing",
  /** The area exists; canon and arc bookkeeping is finishing. */
  "arriving",
  /** Narrating something the player did in their own words. */
  "improvising",
  /** The Threshold Writer authoring the finale. */
  "closing",
]);
export type TurnStage = z.infer<typeof TurnStage>;

/**
 * One server-sent event on a streaming turn. `result` carries the same
 * WorldTurnResult the non-streaming route returns and is always last unless
 * `error` is — every stream ends with exactly one of the two.
 */
export const TurnEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stage"), stage: TurnStage }),
  z.object({ type: z.literal("chunk"), text: z.string() }),
  z.object({ type: z.literal("result"), result: z.unknown() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type TurnEvent = z.infer<typeof TurnEvent>;
