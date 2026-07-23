import { describe, expect, it } from "vitest";
import { characterArtRequest } from "@howeverfar/art";
import { buildWorldWriterUser } from "../src/worldPrompts.js";
import { WorldDirector } from "../src/worldDirector.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

/**
 * Recurring characters (Phase 6): someone met once must stay themselves —
 * same name, same look, and therefore the same cached art — every time they
 * walk back on screen.
 */
function areaWith(id: string, characters: unknown[]): unknown {
  return {
    area: {
      dslVersion: 1,
      id,
      name: `Area ${id}`,
      description:
        "A courtyard of cracked flagstones where someone has set out water for animals that no longer come.",
      path: "her",
      width: 6,
      height: 5,
      tiles: [
        { id: "wall", name: "wall", walkable: false, color: "#332f45" },
        { id: "floor", name: "floor", walkable: true, color: "#97a1b3" },
      ],
      ground: [
        [0, 0, 0, 0, 0, 0],
        [0, 1, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0],
      ],
      playerSpawn: { x: 1, y: 1 },
      entities: characters,
      portals: [
        {
          id: "onward",
          pos: { x: 4, y: 3 },
          label: "onward",
          transition: { type: "generate", hint: "Further in." },
        },
      ],
      onEnterEffects: [],
    },
  };
}

const kaede = {
  id: "kaede-arisugawa",
  name: "Arisugawa Kaede",
  description:
    "A knight out of armour, sleeves rolled, forearms scarred pale from wrist to elbow; she keeps her sword hand free even holding a teacup.",
  role: "character",
  pos: { x: 2, y: 2 },
  nameMeaning: "有栖川 楓 (Arisugawa Kaede) — 'river where the nest is' + 'maple'",
};

async function sessionAt(model: FakeModelClient) {
  const seed = new WorldDirector({ model }).getSession();
  seed.phase = "generated";
  seed.path = "her";
  seed.profile = makeProfile();
  seed.arc = makeArc();
  const first = areaWith("courtyard", [kaede]) as { area: { id: string } };
  seed.areas["courtyard"] = first.area as never;
  seed.state = { ...seed.state, currentAreaId: "courtyard", pos: { x: 4, y: 3 } };
  return new WorldDirector({ model }, seed);
}

describe("character registry", () => {
  it("remembers a character the first time they appear", async () => {
    const model = new FakeModelClient();
    model.push(areaWith("hall", [kaede]), { facts: [] });
    const director = await sessionAt(model);

    await director.handleAction({ type: "portal", portalId: "onward" });
    const registry = director.getSession().characters;
    expect(registry["kaede-arisugawa"]).toMatchObject({
      name: "Arisugawa Kaede",
      appearance: kaede.description,
      firstAreaId: "hall",
    });
  });

  it("never overwrites an appearance once it is set", async () => {
    const model = new FakeModelClient();
    model.push(areaWith("hall", [kaede]), { facts: [] });
    const repainted = { ...kaede, description: "Now in full plate with a red plume." };
    model.push(areaWith("solar", [repainted]), { facts: [] });
    const director = await sessionAt(model);

    await director.handleAction({ type: "portal", portalId: "onward" });
    // The new area re-spawns the player, so walk to its portal like a client would.
    await director.handleAction({ type: "moveTo", pos: { x: 4, y: 3 } });
    await director.handleAction({ type: "portal", portalId: "onward" });

    // First appearance wins: the asset cache keys on this string, so letting
    // a later area rewrite it would repaint someone the player already knows.
    expect(director.getSession().characters["kaede-arisugawa"]?.appearance).toBe(
      kaede.description,
    );
  });

  it("hands the registry to the writer so it can reuse them", () => {
    const user = buildWorldWriterUser({
      path: "her",
      profile: makeProfile(),
      arc: makeArc(),
      facts: [],
      state: new WorldDirector({ model: new FakeModelClient() }).getSession().state,
      recentAreas: [],
      hint: "Somewhere new.",
      existingAreaIds: [],
      characters: [
        {
          id: "kaede-arisugawa",
          name: "Arisugawa Kaede",
          appearance: kaede.description,
          firstAreaId: "courtyard",
        },
      ],
    });
    expect(user).toContain("Characters already met");
    expect(user).toContain("Arisugawa Kaede");
    expect(user).toContain("sword hand free");
  });

  it("says so plainly when nobody has been met yet", () => {
    const user = buildWorldWriterUser({
      path: "his",
      profile: makeProfile(),
      arc: makeArc(),
      facts: [],
      state: new WorldDirector({ model: new FakeModelClient() }).getSession().state,
      recentAreas: [],
      hint: "Somewhere new.",
      existingAreaIds: [],
    });
    expect(user).toContain("(nobody yet)");
  });
});

describe("characterArtRequest", () => {
  it("is stable for the same character, so the asset cache hits", () => {
    const record = { name: "Arisugawa Kaede", appearance: kaede.description };
    expect(characterArtRequest(record)).toEqual(characterArtRequest(record));
  });

  it("carries the frozen appearance and nothing volatile", () => {
    const request = characterArtRequest({
      name: "Arisugawa Kaede",
      appearance: kaede.description,
    });
    expect(request.subject).toContain("Arisugawa Kaede");
    expect(request.subject).toContain("sword hand free");
    // Constant mood: a scene's feeling must not leak into a character's look.
    expect(request.mood).toBe("neutral, canonical reference");
  });

  it("differs between two different characters", () => {
    const a = characterArtRequest({ name: "A", appearance: "tall" });
    const b = characterArtRequest({ name: "B", appearance: "short" });
    expect(a.subject).not.toBe(b.subject);
  });
});
