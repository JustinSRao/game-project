import { PlaythroughExport } from "@howeverfar/schema";
import { validateAreaIntegrity, validateReunionArea } from "@howeverfar/engine";
import { readCostLedger } from "../src/costs.js";
import { createModelClient, loadEnv } from "../src/createModelClient.js";
import { ReunionDirector } from "../src/reunionDirector.js";
import { writeReunionFinale } from "../src/reunion.js";

/**
 * Live Reunion smoke (real API — costs real tokens, a few cents to a couple
 * of dollars depending on model). It exercises the three Reunion prompts end
 * to end without grinding two full playthroughs first: two synthetic finished
 * exports go in, and out come the shared arc, the seam area (the one place
 * both worlds' palettes meet — ADR-0020 / the reunion art pass), and the only
 * ending in the game that resolves.
 *
 *   npm run reunion:smoke -w @howeverfar/director
 *
 * What it proves: the live Director plans a braided finale, writes a valid,
 * integrity-clean shared area whose placeholder tiles read as the seam, and
 * lands an ending that pays off BOTH sides' seeds. The full two-player
 * browser test (docs/REUNION.md) is still the real thing; this is the cheap
 * gate before it.
 */

/** A finished her-side playthrough, with allies and a seed the finale must use. */
const HER: PlaythroughExport = PlaythroughExport.parse({
  formatVersion: 1,
  sessionId: "smoke-her",
  path: "her",
  playerName: "Rin",
  completedAt: "2026-07-22T12:00:00.000Z",
  profile: {
    genre: { primary: "portal fantasy", confidence: 0.85 },
    tone: "earnest, intimate, quietly brave",
    pacing: "measured",
    appetites: { combat: 0.5, dialogue: 0.7, exploration: 0.8, puzzle: 0.4, romance: 0.4 },
    moralLean: "heroic",
    humor: 0.2,
    notes: ["binds bonds into force", "never settles, always aimed home"],
  },
  arc: {
    premise: "Suzune crosses a fantasy world toward a way home the Villainess guards.",
    theme: "the pull home is the spine of her",
    acts: [
      {
        id: "act-one",
        title: "The Summoning",
        summary: "She wakes in the other world and learns her power binds bonds into force.",
        beats: [{ id: "beat-vow", summary: "She learns vowthread.", status: "done" }],
      },
      {
        id: "act-two",
        title: "The Gate at Low Tide",
        summary: "She reaches the gate home and finds it needs a hand on the far side.",
        beats: [{ id: "beat-gate", summary: "She reaches the gate.", status: "done" }],
      },
    ],
    currentActId: "act-two",
    setups: [],
    plannedEnding: {
      tone: "bittersweet",
      summary: "The gate opens only from both sides; there is nobody across.",
    },
  },
  canon: [
    { id: "fact-1", statement: "Suzune's power, vowthread, binds bonds into force.", entities: ["suzune"], sceneId: "shrine" },
    { id: "fact-2", statement: "Shizuku Amanome, a hedge-witch, taught her to hold a promise like a rope.", entities: ["shizuku", "suzune"], sceneId: "fen" },
    { id: "fact-3", statement: "The gate home at low tide needs a hand on the far side to open.", entities: ["the-gate"], sceneId: "gate" },
  ],
  characters: [
    { id: "shizuku", name: "Shizuku Amanome", appearance: "A hedge-witch in a rain-grey shawl, hands stained with fen-mud.", firstAreaId: "fen" },
    { id: "maru", name: "Maru", appearance: "The neighbourhood cat, somehow here too, tail like a question mark.", firstAreaId: "shrine" },
  ],
  sheet: {
    attributes: { might: 2, wits: 3, heart: 4 },
    resources: { vigor: { current: 5, max: 6 }, focus: { current: 4, max: 5 } },
    standings: {},
  },
  ending: {
    title: "The Gate at Low Tide",
    closingText: "x".repeat(300),
    threshold: "The gate needs a hand on the far side, and there is nobody standing there.",
    tone: "bittersweet",
    reunionSeeds: [
      { id: "seed-vowthread", statement: "She can bind two bonds into one force, if there is a second bond to bind to." },
    ],
  },
  road: [
    { id: "shrine", name: "Ruined Moon Shrine", description: "Where she woke." },
    { id: "fen", name: "The Hedge-Witch's Fen", description: "Where she learned the rope." },
    { id: "gate", name: "The Gate at Low Tide", description: "Where the road home stops." },
  ],
});

/** A finished his-side playthrough, with witnesses and its own seed. */
const HIS: PlaythroughExport = PlaythroughExport.parse({
  formatVersion: 1,
  sessionId: "smoke-his",
  path: "his",
  playerName: "Kaito",
  completedAt: "2026-07-22T12:00:00.000Z",
  profile: {
    genre: { primary: "grounded mystery", confidence: 0.85 },
    tone: "aching, stubborn, tender",
    pacing: "measured",
    appetites: { combat: 0.1, dialogue: 0.8, exploration: 0.6, puzzle: 0.7, romance: 0.4 },
    moralLean: "heroic",
    humor: 0.2,
    notes: ["insists on a person no one remembers", "keeps records the world erased"],
  },
  arc: {
    premise: "Itsuki proves a girl the world forgot was real, and learns where she went.",
    theme: "what we owe the things we forget",
    acts: [
      {
        id: "act-one",
        title: "The Erasure",
        summary: "He fights the seamless record that says Suzune never existed.",
        beats: [{ id: "beat-ribbon", summary: "He finds her ribbon, the one trace left.", status: "done" }],
      },
      {
        id: "act-two",
        title: "The Underpass, Again",
        summary: "He works out that the underpass is where she crossed, and cannot follow.",
        beats: [{ id: "beat-underpass", summary: "He reaches the underpass.", status: "done" }],
      },
    ],
    currentActId: "act-two",
    setups: [],
    plannedEnding: {
      tone: "bittersweet",
      summary: "He knows where she is and cannot reach her; knowing is not a door.",
    },
  },
  canon: [
    { id: "fact-1", statement: "The world reorganized so Suzune was never born; only Itsuki remembers her.", entities: ["suzune", "itsuki"], sceneId: "home" },
    { id: "fact-2", statement: "Kanae Furukawa, a records clerk, found one ledger the erasure missed.", entities: ["kanae", "itsuki"], sceneId: "archive" },
    { id: "fact-3", statement: "Her ribbon survived the erasure because Itsuki was holding it when she vanished.", entities: ["the-ribbon", "suzune"], sceneId: "underpass" },
  ],
  characters: [
    { id: "kanae", name: "Kanae Furukawa", appearance: "A records clerk with ink-cuffed sleeves and a careful, disbelieving face.", firstAreaId: "archive" },
    { id: "maru", name: "Maru", appearance: "The neighbourhood cat, the one creature that still comes when he calls her name.", firstAreaId: "home" },
  ],
  sheet: {
    attributes: { might: 2, wits: 4, heart: 3 },
    resources: { vigor: { current: 4, max: 5 }, focus: { current: 5, max: 6 } },
    standings: {},
  },
  ending: {
    title: "The Underpass, Again",
    closingText: "y".repeat(300),
    threshold: "He knows where she is and cannot reach her; knowing is not a door.",
    tone: "bittersweet",
    reunionSeeds: [
      { id: "seed-ribbon", statement: "The ribbon remembers her, and remembering is a bond that can be pulled from this side." },
    ],
  },
  road: [
    { id: "home", name: "The House With One Less Room", description: "Where she was erased from." },
    { id: "archive", name: "The Ward Records Office", description: "Where the one surviving ledger was." },
    { id: "underpass", name: "The Railway Underpass", description: "Where she crossed and he could not." },
  ],
});

function usdSince(before: number): { calls: number; usd: number } {
  const events = readCostLedger().slice(before);
  return { calls: events.length, usd: events.reduce((s, e) => s + (e.costUsd ?? 0), 0) };
}

async function main(): Promise<void> {
  loadEnv();
  const model = createModelClient();
  if (!model) {
    console.error("No model API key configured — set one in .env first.");
    process.exit(1);
  }
  const log = (msg: string) => console.log(`  [reunion] ${msg}`);
  const ledgerBefore = readCostLedger().length;

  console.log("Reunion live smoke — two finished playthroughs meet.\n");

  // 1. Plan the shared finale from both histories (REUNION_ARCHITECT).
  const contacts = {
    her: { name: "Rin", email: "rin@example.com" },
    his: { name: "Kaito", email: "kaito@example.com" },
  };
  const started = Date.now();
  const director = await ReunionDirector.open({ model, log }, HER, HIS, contacts);
  const arc = director.getSession().arc;
  console.log(`\nshared arc: ${arc.premise}`);
  console.log(`theme: ${arc.theme}`);
  console.log(`planned ending (${arc.plannedEnding.tone}): ${arc.plannedEnding.summary}`);
  console.log(`acts/beats: ${arc.acts.map((a) => `${a.title} [${a.beats.length}]`).join(" -> ")}`);

  // 2. Write the seam — the first shared area (REUNION_WRITER + the art pass).
  const seam = await director.openingArea();
  const problems = [...validateAreaIntegrity(seam), ...validateReunionArea(seam)];
  console.log(`\nseam area: "${seam.name}" (${seam.id}) — ${seam.width}x${seam.height}`);
  console.log(`  ${seam.description}`);
  console.log(`  tiles (the seam palette actually rendered):`);
  for (const t of seam.tiles) {
    console.log(`    ${t.color}  ${t.walkable ? "·" : "#"} ${t.name}${t.artTag ? `  <${t.artTag}>` : ""}`);
  }
  const chars = seam.entities.filter((e) => e.role === "character");
  for (const e of chars) console.log(`  character: ${e.name}${e.nameMeaning ? ` — ${e.nameMeaning}` : ""}`);
  console.log(`  integrity: ${problems.length === 0 ? "clean" : problems.join("; ")}`);

  // 3. Write the ending that resolves (REUNION_FINALE + the both-sides guard).
  const session = director.getSession();
  const finale = await writeReunionFinale(
    model,
    {
      arc: session.arc,
      facts: session.canon,
      her: HER,
      his: HIS,
      hint: "They work the crossing from both sides at once.",
      visitedAreaIds: [seam.id],
    },
    { log },
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nENDING — "${finale.title}" (${finale.tone})`);
  console.log(`  pays off: ${finale.paidOffSeedIds.join(", ")}`);
  console.log(`\n${finale.closingText}\n`);

  const cost = usdSince(ledgerBefore);
  console.log(`total: ${seconds}s · ${cost.calls} API calls · $${cost.usd.toFixed(4)} (npm run costs for the ledger)`);

  const paysHer = finale.paidOffSeedIds.some((id) => id === "her-seed-vowthread");
  const paysHis = finale.paidOffSeedIds.some((id) => id === "his-seed-ribbon");
  if (problems.length === 0 && paysHer && paysHis) {
    console.log("\nPASS — the seam holds, and the ending resolves from both sides.");
  } else {
    console.error(
      `\nFAIL — integrity:${problems.length === 0 ? "ok" : "bad"} her:${paysHer} his:${paysHis}`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
