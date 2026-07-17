import { z } from "zod";
import { Slug } from "./scene.js";

/**
 * The Canon Ledger — append-only facts committed as true (ADR-0004).
 * Facts are atomic and entity-tagged; in-world change is a new fact that
 * `supersedes` an old one. Nothing is ever edited or deleted.
 */
export const CanonFact = z.object({
  id: Slug,
  statement: z.string().min(1).max(300),
  entities: z.array(Slug).max(8).default([]),
  /** The scene whose acceptance established this fact. */
  sceneId: Slug,
  /** Id of a fact this one supersedes (the old fact stays in the ledger). */
  supersedes: Slug.optional(),
});
export type CanonFact = z.infer<typeof CanonFact>;

/** What the extraction model emits — the server assigns id and sceneId. */
export const NewFact = z.object({
  statement: z.string().min(1).max(300),
  entities: z.array(Slug).max(8).default([]),
  supersedes: Slug.optional(),
});
export const FactExtraction = z.object({
  facts: z.array(NewFact).max(12),
});
export type FactExtraction = z.infer<typeof FactExtraction>;

/** The Continuity Checker's structured verdict — never free prose. */
export const CheckerVerdict = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    violations: z
      .array(
        z.object({
          factId: Slug,
          explanation: z.string().min(1).max(400),
        }),
      )
      .min(1)
      .max(10),
  }),
]);
export type CheckerVerdict = z.infer<typeof CheckerVerdict>;
