import { z } from "zod";
import { Slug } from "./scene.js";

/** 0 = no appetite, 1 = strong appetite. */
const Appetite = z.number().min(0).max(1);

/**
 * The Player Profile — what the game has learned about who it's for.
 * Built by the Profiler from play signals; updated continuously.
 * The player never sees this; the game simply becomes it.
 */
export const PlayerProfile = z.object({
  genre: z.object({
    primary: z.string().min(1).max(60),
    secondary: z.string().min(1).max(60).optional(),
    confidence: z.number().min(0).max(1),
  }),
  /** Prose description of the tone the player is asking for. */
  tone: z.string().min(1).max(300),
  pacing: z.enum(["fast", "measured", "slow-burn"]),
  appetites: z.object({
    combat: Appetite,
    dialogue: Appetite,
    exploration: Appetite,
    puzzle: Appetite,
    romance: Appetite,
  }),
  moralLean: z.enum(["heroic", "pragmatic", "selfish", "chaotic", "unclear"]),
  humor: Appetite,
  /** Free observations worth keeping ("names things", "tests boundaries"). */
  notes: z.array(z.string().min(1).max(300)).max(10).default([]),
});
export type PlayerProfile = z.infer<typeof PlayerProfile>;

/** One observed player behavior — the Profiler's raw material. */
export const PlaySignal = z.object({
  /** The scene (DSL v0) or area (DSL v1) the behavior happened in. */
  sceneId: Slug,
  /** "interact" and "portal" are area-era kinds (DSL v1) — additive. */
  kind: z.enum(["choice", "freeText", "interact", "portal"]),
  /** The choice label as shown, or the player's typed text verbatim. */
  action: z.string().min(1).max(600),
});
export type PlaySignal = z.infer<typeof PlaySignal>;
