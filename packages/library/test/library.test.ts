import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlayerProfile, SessionSave, StoryArc, StyleBible } from "@howeverfar/schema";
import {
  Director,
  type ModelClient,
  type StructuredRequest,
} from "@howeverfar/director";
import {
  exportBundle,
  listBundles,
  listSessions,
  loadSession,
  newReplaySession,
  prepareArcForReplay,
  readBundle,
  saveSession,
  writeBundle,
} from "../src/index.js";

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "unwritten-test-"));
  process.env["HOWEVERFAR_HOME"] = tmp;
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

class FakeModelClient implements ModelClient {
  queue: unknown[] = [];
  calls = 0;
  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    this.calls++;
    const next = this.queue.shift();
    if (next === undefined) throw new Error("fake queue empty");
    return req.schema.parse(next);
  }
}

const profile: PlayerProfile = {
  genre: { primary: "hardboiled mystery", confidence: 0.7 },
  tone: "terse, rain-soaked",
  pacing: "fast",
  appetites: { combat: 0.4, dialogue: 0.8, exploration: 0.5, puzzle: 0.9, romance: 0.2 },
  moralLean: "pragmatic",
  humor: 0.5,
  notes: [],
};

const arc: StoryArc = {
  premise: "The bell collects debts the road is owed.",
  theme: "memory as currency",
  acts: [
    {
      id: "act-one",
      title: "The Toll",
      summary: "The bell arrives.",
      beats: [{ id: "beat-toll", summary: "The toll is named.", status: "done" }],
    },
    {
      id: "act-two",
      title: "The Ledger",
      summary: "The debt comes due.",
      beats: [{ id: "beat-due", summary: "The debt is paid or broken.", status: "done" }],
    },
  ],
  currentActId: "act-two",
  setups: [{ id: "setup-box", description: "The box knew the player's name.", status: "paid-off" }],
  plannedEnding: { tone: "bittersweet", summary: "The player pays with a memory." },
};

const styleBible: StyleBible = {
  paletteName: "wet asphalt",
  colors: ["#0a0a0c", "#232733", "#4a5266", "#8a94a6", "#d6d9e0", "#b8543a"],
  gridSize: 32,
  outline: "dark",
  perspective: "side-on, eye level",
  keywords: ["rain-slick", "neon-smeared", "cigarette haze"],
};

function endedSession(): SessionSave {
  const base = Director.newSession("finished-run");
  return {
    ...base,
    phase: "ended",
    profile,
    arc,
    styleBible,
    canon: [
      {
        id: "fact-0001",
        statement: "The bell collects memories as tolls.",
        entities: ["the-bell"],
        sceneId: "anchor-box",
      },
    ],
    endingSummary: "The road forgot you, gently.",
  };
}

describe("session store", () => {
  it("round-trips sessions and lists them", () => {
    const s = endedSession();
    saveSession(s);
    const loaded = loadSession("finished-run");
    expect(loaded.arc?.premise).toBe(arc.premise);
    const infos = listSessions();
    expect(infos.some((i) => i.id === "finished-run" && i.phase === "ended")).toBe(true);
  });
});

describe("bundle export / import / replay", () => {
  it("exports a finished session and round-trips through disk", () => {
    const bundle = exportBundle(endedSession(), {
      title: "The Toll Road",
      description: "A hardboiled mystery about what roads remember.",
      creator: "test-player",
    });
    const path = writeBundle(bundle);
    const loaded = readBundle(path);
    expect(loaded.manifest.title).toBe("The Toll Road");
    expect(loaded.canon).toHaveLength(1);
    // The look is part of the universe's identity and must survive the trip.
    expect(loaded.styleBible?.paletteName).toBe("wet asphalt");
    expect(listBundles().some((b) => b.title === "The Toll Road")).toBe(true);
  });

  it("refuses to export unfinished sessions", () => {
    const s = { ...endedSession(), phase: "generated" as const };
    expect(() => exportBundle(s, { title: "Nope", description: "nope" })).toThrow();
  });

  it("prepareArcForReplay resets progress but not identity", () => {
    const replayArc = prepareArcForReplay(arc);
    expect(replayArc.currentActId).toBe("act-one");
    expect(replayArc.acts.every((a) => a.beats.every((b) => b.status === "pending"))).toBe(true);
    expect(replayArc.premise).toBe(arc.premise);
    expect(replayArc.setups[0]!.status).toBe("planted");
  });

  it("replay sessions skip profiling/arc-planning at anchor exit", async () => {
    const bundle = exportBundle(endedSession(), {
      title: "The Toll Road",
      description: "A hardboiled mystery.",
    });
    const session = newReplaySession(bundle, "replay-run");
    const fake = new FakeModelClient();
    const d = new Director({ model: fake }, session);

    await d.handleAction({ type: "choice", choiceId: "watch-quietly" });
    await d.handleAction({ type: "choice", choiceId: "press-smoke" });
    expect(fake.calls).toBe(0);

    // A replay inherits the creator's locked look — the stylist never reruns.
    expect(session.styleBible?.paletteName).toBe("wet asphalt");

    // Anchor exit on a replay: writer + checker + extractor only.
    fake.queue.push(
      {
        scene: {
          dslVersion: 0,
          id: "replay-first",
          title: "The Bell, Again",
          location: { id: "old-road", name: "The Old Road", description: "The same road, another traveler." },
          narration:
            "The bell crests the hill behind you, and though this story has been told before, it has never been told to you.",
          entities: [],
          dialogue: [],
          onEnterEffects: [],
          choices: [
            { id: "go-on", label: "Go on.", effects: [], transition: { type: "generate", hint: "continue" } },
          ],
          freeText: { enabled: true },
        },
      },
      { ok: true },
      { facts: [] },
    );
    const r = await d.handleAction({ type: "choice", choiceId: "take-key" });
    if (r.kind !== "scene") throw new Error("expected scene");
    expect(r.scene.id).toBe("replay-first");
    expect(fake.calls).toBe(3);

    const s = d.getSession();
    expect(s.profile?.genre.primary).toBe("hardboiled mystery");
    expect(s.arc?.premise).toBe(arc.premise);
    // bundle canon (1) + item fact (1); anchor facts skipped (ledger non-empty)
    expect(s.canon.length).toBe(2);
  });
});
