import {
  ThresholdEnding,
  type CanonFact,
  type PlayerProfile,
  type StoryArc,
  type SoloPath,
} from "@howeverfar/schema";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient } from "./modelClient.js";

/**
 * The Threshold Writer (Phase 6) — the finale of a solo path.
 *
 * STORY.md is unusually strict here, and the strictness is the point: a solo
 * playthrough earns a real climax, then stops at a **threshold, not a
 * resolution**. Suzune reaches the way home and cannot cross alone; Itsuki
 * learns the truth and cannot reach her alone. Only the Reunion (Phase 7),
 * pairing one completed playthrough of each path, resolves it.
 *
 * Before this existed an ending was just the portal's one-line hint echoed
 * back at the player, which is not a finale.
 */

const THRESHOLD_RULES = `You write the FINAL moments of one side of a two-sided story.

The hardest rule, and the reason this scene exists: this is a THRESHOLD, NOT A RESOLUTION. The player has earned a real climax and must feel the arc close — but the story does not end here, and you must not end it.

- Path A (Suzune): she reaches the way home. She CANNOT CROSS ALONE. Something about the crossing needs a hand from the other side.
- Path B (Itsuki): he learns what happened to her. He CANNOT REACH HER ALONE. Knowing where she is turns out not to be the same as being able to get there.

Forbidden, absolutely: reuniting them, bringing her home, him crossing over, her being rescued, either of them dying, either of them giving up or moving on, or any line implying the wait is over. The ache stays open. That is what the player is meant to carry out of the game.

Required:
- "closingText" is the climax and the threshold together, 200-500 words: second person, present tense, concrete and sensory. It should be the best prose in the playthrough. Pay off what this specific player actually did — the allies they made, the choices they took, what it cost them. No headings, no meta-commentary, never mention profiles, arcs, or that anything was generated.
- "threshold" names the obstacle SPECIFICALLY. Not "she needs help" — say what the crossing requires and who is not there to give it.
- "reunionSeeds" are the durable facts this playthrough hands forward to a future Reunion: who they met who matters, what they carry, what they learned, what they gave up. Write them as flat statements of fact, each one true forever after this playthrough. These are the only thing that survives into the shared finale, so choose what mattered.
- "tone" should match how this playthrough actually felt, not a default.`;

export const THRESHOLD_SYSTEM = `You are the Director of a game authored in real time for one specific player — a top-down 2D RPG on a fixed story: two high-school sweethearts, next-door neighbors; the girl vanished in the railway underpass; the player has lived one side of what followed. You are writing the last thing they will read on this side.

${THRESHOLD_RULES}

Output an object matching the provided schema.`;

export interface ThresholdContext {
  path: SoloPath;
  profile: PlayerProfile;
  arc: StoryArc;
  facts: readonly CanonFact[];
  /** The hint on the portal the player stepped through to get here. */
  hint: string;
  /** Area ids in the order they were played, for callbacks. */
  visitedAreaIds: readonly string[];
}

function factsBlock(facts: readonly CanonFact[]): string {
  if (facts.length === 0) return "(no facts established)";
  return facts.map((f) => `- ${f.statement}`).join("\n");
}

export function buildThresholdUser(ctx: ThresholdContext): string {
  const side =
    ctx.path === "her"
      ? "Path A — Suzune. She reaches the way home and cannot cross alone."
      : "Path B — Itsuki. He learns what happened and cannot reach her alone.";
  return [
    `Side: ${side}`,
    ``,
    `Premise: ${ctx.arc.premise}`,
    `Theme: ${ctx.arc.theme}`,
    `Planned ending (${ctx.arc.plannedEnding.tone}): ${ctx.arc.plannedEnding.summary}`,
    ``,
    `Everything true in this playthrough:`,
    factsBlock(ctx.facts),
    ``,
    `How this player played: ${ctx.profile.tone} (${ctx.profile.genre.primary}, ${ctx.profile.pacing}, ${ctx.profile.moralLean})`,
    ...(ctx.profile.notes.length > 0
      ? [`What stood out about them: ${ctx.profile.notes.join(" · ")}`]
      : []),
    ``,
    `Areas they moved through, in order: ${ctx.visitedAreaIds.join(" -> ")}`,
    ``,
    `They stepped through toward: ${ctx.hint}`,
    ``,
    `Write their threshold.`,
  ].join("\n");
}

export class ThresholdFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThresholdFailedError";
  }
}

/**
 * Write the path's finale, with bounded retries on the one failure that
 * matters: an ending that resolves. A degraded fallback still closes the
 * playthrough — a player who reached the end must always get an ending
 * (the always-playable invariant), even a plain one.
 */
export async function writeThreshold(
  model: ModelClient,
  ctx: ThresholdContext,
  opts: { log?: (msg: string) => void } = {},
): Promise<ThresholdEnding> {
  const log = opts.log ?? (() => {});
  const feedback: string[] = [];

  for (let attempt = 0; attempt <= DIRECTOR_CONFIG.maxRetries; attempt++) {
    const ending = await model.generateStructured({
      role: DIRECTOR_CONFIG.writer,
      schema: ThresholdEnding,
      system: THRESHOLD_SYSTEM,
      user: buildThresholdUser(ctx),
      feedback: [...feedback],
    });

    const problems = checkThreshold(ending, ctx.path);
    if (problems.length === 0) return ending;

    log(`threshold rejected: ${problems.join("; ")}`);
    feedback.push(
      `Your ending was rejected: ${problems.join("; ")}. Rewrite it. The story must NOT resolve — they do not reunite here.`,
    );
    if (attempt === DIRECTOR_CONFIG.maxRetries) {
      log("threshold: retries exhausted, accepting last candidate");
      return ending;
    }
  }
  throw new ThresholdFailedError("threshold writer exhausted retries");
}

/**
 * Structural guards on a finale. Prose can resolve a story in ways no checker
 * catches, so this only pins what is mechanically checkable — the model is
 * told the rest, and the Continuity Checker sees the facts.
 */
export function checkThreshold(
  ending: ThresholdEnding,
  path: SoloPath,
): string[] {
  const problems: string[] = [];

  if (ending.reunionSeeds.length === 0) {
    problems.push("no reunionSeeds — the Reunion needs what this playthrough carries forward");
  }
  const seedIds = new Set(ending.reunionSeeds.map((s) => s.id));
  if (seedIds.size !== ending.reunionSeeds.length) {
    problems.push("duplicate reunionSeed ids");
  }

  // The threshold must name an obstacle, not gesture at one.
  const vague = /^(she|he) (just )?needs help\.?$/i;
  if (vague.test(ending.threshold.trim())) {
    problems.push('"threshold" is vague — name what the crossing actually requires');
  }

  // Cheap tripwire for the one forbidden outcome, worded the way a model
  // actually writes it when it forgets the rule.
  const resolved =
    /\b(reunited|reunion at last|together again|she is home|he found her at last|takes her home|brought her home)\b/i;
  if (resolved.test(ending.closingText)) {
    problems.push(
      "closingText reads as a resolution — they must not reunite here; this is a threshold",
    );
  }

  const expects = path === "her" ? /cross|home|way back|gate|door/i : /reach|find|cross|get to/i;
  if (!expects.test(ending.threshold)) {
    problems.push(
      path === "her"
        ? '"threshold" should be about the crossing she cannot make alone'
        : '"threshold" should be about his inability to reach her',
    );
  }

  return problems;
}
