import { z } from "zod";
import { EndingTone, Slug } from "./scene.js";

/**
 * The Story Arc — the Architect's living plan for the whole game.
 * Arc is intention (revisable); canon is history (append-only). See ADR-0004.
 */

export const Beat = z.object({
  id: Slug,
  summary: z.string().min(1).max(500),
  status: z.enum(["pending", "done", "dropped"]).default("pending"),
});
export type Beat = z.infer<typeof Beat>;

export const Act = z.object({
  id: Slug,
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(800),
  beats: z.array(Beat).min(1).max(8),
});
export type Act = z.infer<typeof Act>;

/** A planted setup that owes the player a payoff. */
export const Setup = z.object({
  id: Slug,
  description: z.string().min(1).max(400),
  status: z.enum(["planted", "paid-off", "dropped"]).default("planted"),
});
export type Setup = z.infer<typeof Setup>;

export const StoryArc = z.object({
  premise: z.string().min(1).max(1000),
  theme: z.string().min(1).max(300),
  acts: z.array(Act).min(2).max(5),
  /** Must be the id of one of `acts`. */
  currentActId: Slug,
  setups: z.array(Setup).max(20).default([]),
  plannedEnding: z.object({
    tone: EndingTone,
    summary: z.string().min(1).max(600),
  }),
});
export type StoryArc = z.infer<typeof StoryArc>;
