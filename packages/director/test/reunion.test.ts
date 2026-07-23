import { describe, expect, it } from "vitest";
import type {
  AreaSessionSave,
  PlaythroughExport,
  ReunionEnding,
} from "@howeverfar/schema";
import {
  checkReunionEnding,
  exportPlaythrough,
  mergeCanon,
  mergeCharacters,
  ReunionFailedError,
} from "../src/reunion.js";
import { ReunionDirector } from "../src/reunionDirector.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

function playthrough(path: "her" | "his"): PlaythroughExport {
  return {
    formatVersion: 1,
    sessionId: `world-${path}`,
    path,
    playerName: path === "her" ? "Rin" : "Kaito",
    completedAt: "2026-07-22T12:00:00.000Z",
    profile: makeProfile(),
    arc: makeArc({ finalAct: true }),
    canon: [
      { id: "fact-1", statement: `A thing that is true on ${path} side.`, entities: [], sceneId: "somewhere" },
      {
        id: "fact-2",
        statement: `A later truth on ${path} side.`,
        entities: [],
        sceneId: "elsewhere",
        supersedes: "fact-1",
      },
    ],
    characters: [
      {
        id: path === "her" ? "ally" : "witness",
        name: path === "her" ? "Shizuku Amanome" : "Kanae Furukawa",
        appearance: "Someone who was there.",
        firstAreaId: "somewhere",
      },
      // Both playthroughs met Maru. First appearance must win.
      {
        id: "maru",
        name: "Maru",
        appearance: `The neighbourhood cat, as ${path} side saw him.`,
        firstAreaId: "somewhere",
      },
    ],
    sheet: {
      attributes: { might: 2, wits: 2, heart: 3 },
      resources: { vigor: { current: 4, max: 5 }, focus: { current: 3, max: 4 } },
      standings: {},
    },
    ending: {
      title: "An ending",
      closingText: "x".repeat(250),
      threshold: path === "her" ? "The gate needs a hand from across." : "He cannot reach her.",
      tone: "bittersweet",
      reunionSeeds: [
        // Deliberately the SAME id on both sides: two playthroughs pick their
        // own ids and really can collide.
        { id: "seed-one", statement: `What ${path} side carries.` },
      ],
    },
    road: [],
  };
}

const ending = (paidOffSeedIds: string[], closingText = "y".repeat(400)): ReunionEnding => ({
  title: "Together",
  closingText,
  tone: "triumphant",
  paidOffSeedIds,
});

describe("merging two playthroughs", () => {
  it("keeps both histories, side-keyed so ids cannot collide", () => {
    const facts = mergeCanon(playthrough("her"), playthrough("his"), [
      { statement: "The two paths are the same weeks from either side.", entities: [] },
    ]);
    const ids = facts.map((f) => f.id);
    expect(ids).toContain("reunion-seed-1");
    expect(ids).toContain("her-fact-1");
    expect(ids).toContain("his-fact-1");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("re-keys supersession within its own side, never across", () => {
    const facts = mergeCanon(playthrough("her"), playthrough("his"));
    expect(facts.find((f) => f.id === "her-fact-2")?.supersedes).toBe("her-fact-1");
    expect(facts.find((f) => f.id === "his-fact-2")?.supersedes).toBe("his-fact-1");
  });

  it("carries both endings' seeds in as facts of their own", () => {
    const facts = mergeCanon(playthrough("her"), playthrough("his"));
    expect(facts.map((f) => f.id)).toEqual(
      expect.arrayContaining(["her-seed-one", "his-seed-one"]),
    );
  });

  it("lets first appearance win when both players met the same person", () => {
    const people = mergeCharacters(playthrough("her"), playthrough("his"));
    expect(people["maru"]?.appearance).toContain("her side");
    expect(Object.keys(people).sort()).toEqual(["ally", "maru", "witness"]);
  });
});

describe("exporting a playthrough", () => {
  function save(overrides: Partial<AreaSessionSave> = {}): AreaSessionSave {
    const base = WorldDirectorSave();
    return { ...base, ...overrides } as AreaSessionSave;
  }

  function WorldDirectorSave(): AreaSessionSave {
    const arc = makeArc({ finalAct: true });
    return {
      id: "world-1",
      createdAt: "2026-07-22T10:00:00.000Z",
      updatedAt: "2026-07-22T12:00:00.000Z",
      phase: "ended",
      path: "her",
      state: {
        currentAreaId: "somewhere",
        pos: { x: 1, y: 1 },
        facing: "down",
        flags: {},
        inventory: [],
        visitedAreaIds: [],
        usedInteractions: [],
        sheet: {
          attributes: { might: 3, wits: 1, heart: 3 },
          resources: { vigor: { current: 2, max: 6 }, focus: { current: 1, max: 3 } },
          standings: {},
        },
        rng: { seed: 1, counter: 4 },
        quests: [],
        metaFx: [],
      },
      areas: {},
      signals: [],
      profile: makeProfile(),
      arc,
      canon: [],
      characters: {},
      spentUsd: 1.2,
      areasSinceBeatProgress: 0,
      ending: playthrough("her").ending,
    };
  }

  it("carries the sheet across — growth is not handed back at the door", () => {
    const exported = exportPlaythrough(save(), "Rin");
    expect(exported.sheet.attributes["might"]).toBe(3);
    expect(exported.playerName).toBe("Rin");
  });

  it("refuses a playthrough that has not reached its threshold", () => {
    expect(() => exportPlaythrough(save({ phase: "generated" }), "Rin")).toThrow(
      ReunionFailedError,
    );
  });
});

describe("the finale guard", () => {
  const her = playthrough("her");
  const his = playthrough("his");

  it("accepts an ending that pays off both sides", () => {
    expect(checkReunionEnding(ending(["her-seed-one", "his-seed-one"]), her, his)).toEqual(
      [],
    );
  });

  it("rejects one player's ending with a witness", () => {
    const problems = checkReunionEnding(ending(["her-seed-one"]), her, his);
    expect(problems.join(" ")).toContain("Itsuki's playthrough");
  });

  it("is not fooled by two playthroughs choosing the same seed id", () => {
    // Both sides named a seed "seed-one". Un-prefixed, one id would appear to
    // satisfy both — which would prove nothing about both being in the room.
    const problems = checkReunionEnding(ending(["seed-one", "seed-one"]), her, his);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("rejects a claim to pay off a seed that does not exist", () => {
    const problems = checkReunionEnding(
      ending(["her-seed-one", "his-seed-one", "her-seed-invented"]),
      her,
      his,
    );
    expect(problems.join(" ")).toContain("do not exist");
  });

  it("rejects an ending that is secretly another threshold", () => {
    const problems = checkReunionEnding(
      ending(
        ["her-seed-one", "his-seed-one"],
        `${"y".repeat(350)} and he still cannot reach her.`,
      ),
      her,
      his,
    );
    expect(problems.join(" ")).toContain("another threshold");
  });
});

describe("opening a shared world", () => {
  it("plans the finale once and writes nothing until they arrive", async () => {
    const model = new FakeModelClient();
    model.push(makeArc({ finalAct: true }));
    const director = await ReunionDirector.open(
      { model },
      playthrough("her"),
      playthrough("his"),
      {
        her: { name: "Rin", email: "rin@example.com" },
        his: { name: "Kaito", email: "kaito@example.com" },
      },
      "reunion-test",
    );
    const session = director.getSession();
    expect(session.phase).toBe("reunion");
    expect(Object.keys(session.areas)).toHaveLength(0);
    expect(director.needsOpening).toBe(true);
    // Both arrive as what their own path made of them.
    expect(session.state.her.sheet.attributes["heart"]).toBe(3);
    expect(session.contacts.his.email).toBe("kaito@example.com");
    // One call: the arc. The world itself is not written yet.
    expect(model.calls).toHaveLength(1);
  });

  it("refuses two playthroughs of the same side", async () => {
    const model = new FakeModelClient();
    await expect(
      ReunionDirector.open({ model }, playthrough("her"), playthrough("her") as never, {
        her: { name: "Rin", email: "rin@example.com" },
        his: { name: "Aki", email: "aki@example.com" },
      }),
    ).rejects.toThrow(ReunionFailedError);
  });
});
