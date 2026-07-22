import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AreaAction, AreaGameState, AreaSpec } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

function fixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(here, "../fixtures/area-example.json"), "utf8"),
  ) as Record<string, unknown>;
}

describe("AreaSpec", () => {
  it("accepts the golden fixture", () => {
    const parsed = AreaSpec.parse(fixture());
    expect(parsed.id).toBe("moonwell-clearing");
    expect(parsed.path).toBe("her");
    expect(parsed.tiles).toHaveLength(4);
    expect(parsed.entities).toHaveLength(2);
    expect(parsed.ground).toHaveLength(parsed.height);
  });

  it("rejects a wrong dslVersion", () => {
    const raw = fixture();
    raw.dslVersion = 0;
    expect(() => AreaSpec.parse(raw)).toThrow();
  });

  it("rejects bad hex colors", () => {
    const raw = fixture();
    (raw.tiles as Array<{ color: string }>)[0]!.color = "green";
    expect(() => AreaSpec.parse(raw)).toThrow();
  });

  it("rejects non-integer tile indices", () => {
    const raw = fixture();
    (raw.ground as number[][])[1]![1] = 1.5;
    expect(() => AreaSpec.parse(raw)).toThrow();
  });

  it("rejects out-of-range grid positions", () => {
    const raw = fixture();
    (raw.playerSpawn as { x: number }).x = 64;
    expect(() => AreaSpec.parse(raw)).toThrow();
  });

  it("requires at least one portal", () => {
    const raw = fixture();
    raw.portals = [];
    expect(() => AreaSpec.parse(raw)).toThrow();
  });

  it("caps free-form strings", () => {
    const raw = fixture();
    raw.description = "x".repeat(2001);
    expect(() => AreaSpec.parse(raw)).toThrow();
  });
});

describe("AreaGameState / AreaAction", () => {
  it("round-trips a state", () => {
    const state = AreaGameState.parse({
      currentAreaId: "moonwell-clearing",
      pos: { x: 5, y: 1 },
      facing: "down",
      flags: { "learned-of-wounded": true },
      inventory: [{ item: "moonherb", name: "Moonherb" }],
      visitedAreaIds: ["moonwell-clearing"],
      usedInteractions: ["moonwell-clearing/moonherb"],
    });
    expect(state.pos).toEqual({ x: 5, y: 1 });
  });

  it("parses each action variant and rejects unknown types", () => {
    expect(AreaAction.parse({ type: "interact", entityId: "herbalist-shizuku" }).type).toBe("interact");
    expect(
      AreaAction.parse({ type: "convoChoice", entityId: "herbalist-shizuku", choiceId: "ask-about-herbs" }).type,
    ).toBe("convoChoice");
    expect(AreaAction.parse({ type: "portal", portalId: "deer-track-south" }).type).toBe("portal");
    expect(AreaAction.parse({ type: "freeText", text: "look in the pond" }).type).toBe("freeText");
    expect(() => AreaAction.parse({ type: "teleport", x: 0, y: 0 })).toThrow();
  });
});
