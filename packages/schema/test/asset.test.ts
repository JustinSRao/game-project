import { describe, expect, it } from "vitest";
import { AssetRecord, SpriteData } from "../src/index.js";

const HASH = "a".repeat(64);

function record(): Record<string, unknown> {
  return {
    recordVersion: 1,
    id: HASH,
    name: "moss-tile",
    kind: "tile",
    path: "her",
    styleName: "her-world-draft",
    width: 32,
    height: 32,
    tags: ["ground", "forest"],
    frames: [HASH],
    source: {
      type: "cc0",
      pack: "Tiny Town",
      author: "Kenney",
      url: "https://kenney.nl/assets/tiny-town",
      license: "CC0-1.0",
    },
    createdAt: "2026-07-22T00:00:00.000Z",
  };
}

describe("AssetRecord", () => {
  it("accepts a full CC0 record", () => {
    const parsed = AssetRecord.parse(record());
    expect(parsed.frames).toHaveLength(1);
    expect(parsed.source.type).toBe("cc0");
  });

  it("rejects a non-sha256 id", () => {
    expect(() => AssetRecord.parse({ ...record(), id: "not-a-hash" })).toThrow();
  });

  it("rejects an empty frame list", () => {
    expect(() => AssetRecord.parse({ ...record(), frames: [] })).toThrow();
  });

  it("requires attribution fields on cc0 sources", () => {
    expect(() =>
      AssetRecord.parse({ ...record(), source: { type: "cc0", pack: "Tiny Town" } }),
    ).toThrow();
  });

  it("accepts an animation with frameMs", () => {
    const parsed = AssetRecord.parse({
      ...record(),
      kind: "sprite",
      frames: [HASH, "b".repeat(64), "c".repeat(64)],
      frameMs: 120,
      source: { type: "sprite-data", emittedBy: "hand" },
    });
    expect(parsed.frames).toHaveLength(3);
    expect(parsed.frameMs).toBe(120);
  });
});

describe("SpriteData", () => {
  const sprite = {
    version: 1,
    name: "tiny-bell",
    palette: ["#1a1c2c", "#ffcd75", "#f4f4f4"],
    rows: [".11.", "1221", "1221", ".00."],
  };

  it("accepts a valid grid", () => {
    const parsed = SpriteData.parse(sprite);
    expect(parsed.rows).toHaveLength(4);
  });

  it("rejects ragged rows", () => {
    expect(() => SpriteData.parse({ ...sprite, rows: [".11.", "121"] })).toThrow(
      /expected/,
    );
  });

  it("rejects out-of-palette indices", () => {
    expect(() => SpriteData.parse({ ...sprite, rows: [".33.", "....", "....", "...."] })).toThrow(
      /palette has 3/,
    );
  });

  it("rejects invalid pixel characters", () => {
    expect(() => SpriteData.parse({ ...sprite, rows: [".1X.", "....", "....", "...."] })).toThrow();
  });

  it("reads base-32 indices above 9", () => {
    const wide = {
      version: 1,
      name: "many-colors",
      palette: Array.from({ length: 12 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`),
      rows: ["ab", "ba"],
    };
    expect(SpriteData.parse(wide).palette).toHaveLength(12);
  });
});
