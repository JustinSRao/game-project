import { CheckerVerdict, PlayerProfile } from "@unwritten/schema";
import { DIRECTOR_CONFIG, OPENAI_MODELS } from "../src/config.js";
import { createModelClient, resolveProvider } from "../src/createModelClient.js";

/**
 * Two live calls — one per tier — to prove the provider adapter works before
 * anything expensive runs. Deliberately exercises the two shapes most likely
 * to break under OpenAI strict mode: a root-level union (CheckerVerdict) and
 * an optional field (PlayerProfile.genre.secondary).
 *
 * Costs a fraction of a cent. Run: npm run smoke
 */
async function main(): Promise<void> {
  const model = createModelClient();
  if (!model) throw new Error("no provider key configured — see .env.example");
  console.log(
    `provider=${resolveProvider()}  strong=${OPENAI_MODELS.strong}  cheap=${OPENAI_MODELS.cheap}\n`,
  );

  console.log("[1/2] cheap tier · root-level union (CheckerVerdict)…");
  const verdict = await model.generateStructured({
    role: DIRECTOR_CONFIG.checker,
    system: 'You are a continuity checker. Respond {"ok":true} if nothing is contradicted.',
    user: "Facts: [fact-0001] Marlow is alive.\nScene: Marlow pours the tea.\nContradiction?",
    schema: CheckerVerdict,
  });
  console.log(`   -> ${JSON.stringify(verdict)}\n`);

  console.log("[2/2] strong tier · optional field (PlayerProfile.genre.secondary)…");
  const profile = await model.generateStructured({
    role: DIRECTOR_CONFIG.profiler,
    system: "You are the Profiler. Infer the player from their actions.",
    user: "The player shared their bread, asked Marlow about their family, and took the letter.",
    schema: PlayerProfile,
  });
  console.log(
    `   -> genre=${profile.genre.primary} · secondary=${profile.genre.secondary ?? "(none)"}`,
  );
  console.log(`   -> tone=${profile.tone}`);

  console.log("\nBoth tiers OK — structured output round-tripped through Zod validation.");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
