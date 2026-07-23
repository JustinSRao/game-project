import { describe, expect, it } from "vitest";
import { parseSource, parseTags, slugifyName } from "./cliHelpers.js";

const flags = (entries: Record<string, string | true>): Map<string, string | true> =>
  new Map(Object.entries(entries));

describe("slugifyName", () => {
  it("strips extensions and normalizes to a slug", () => {
    expect(slugifyName("Moss Tile 03.png")).toBe("moss-tile-03");
    expect(slugifyName("hero_walk.PNG.png")).toBe("hero-walk-png");
    expect(slugifyName("--weird--.png")).toBe("weird");
  });
});

describe("parseTags", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseTags(flags({ tags: "ground, forest ,,water" }))).toEqual([
      "ground",
      "forest",
      "water",
    ]);
    expect(parseTags(flags({}))).toEqual([]);
  });
});

describe("parseSource", () => {
  it("requires full attribution for cc0", () => {
    const missing = parseSource(flags({ source: "cc0", pack: "Tiny Town" }));
    expect(missing).toHaveProperty("error");
    const ok = parseSource(
      flags({ source: "cc0", pack: "Tiny Town", author: "Kenney", url: "https://kenney.nl" }),
    );
    expect(ok).toEqual({
      type: "cc0",
      pack: "Tiny Town",
      author: "Kenney",
      url: "https://kenney.nl",
      license: "CC0-1.0",
    });
  });

  it("defaults sprite-data emitter to hand", () => {
    expect(parseSource(flags({ source: "sprite-data" }))).toEqual({
      type: "sprite-data",
      emittedBy: "hand",
    });
  });

  it("requires --model for generated", () => {
    expect(parseSource(flags({ source: "generated" }))).toHaveProperty("error");
    expect(parseSource(flags({ source: "generated", model: "gpt-image-2" }))).toEqual({
      type: "generated",
      model: "gpt-image-2",
    });
  });

  it("rejects a missing or unknown source", () => {
    expect(parseSource(flags({}))).toHaveProperty("error");
    expect(parseSource(flags({ source: "found-on-a-forum" }))).toHaveProperty("error");
  });
});
