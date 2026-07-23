import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpriteData } from "@howeverfar/schema";
import { encodePng, renderSpriteData } from "@howeverfar/art";
import {
  DuplicateAssetError,
  getAssetRecord,
  listAssets,
  putAsset,
  putBlob,
  readBlob,
  sha256OfBytes,
} from "../src/index.js";

let db: string;
beforeAll(() => {
  db = mkdtempSync(join(tmpdir(), "howeverfar-assets-"));
});
afterAll(() => {
  rmSync(db, { recursive: true, force: true });
});

function png(seed: number): Uint8Array {
  return encodePng(
    renderSpriteData(
      SpriteData.parse({
        version: 1,
        name: "probe",
        palette: ["#1a1c2c", "#ffcd75"],
        rows: [seed % 2 === 0 ? ".1." : "1.1", "010", "1.1"],
      }),
    ),
  );
}

const source = { type: "sprite-data", emittedBy: "hand" } as const;

describe("asset blobs", () => {
  it("stores and reads content-addressed bytes", () => {
    const bytes = png(0);
    const hash = putBlob(bytes, db);
    expect(hash).toBe(sha256OfBytes(bytes));
    expect(Buffer.from(readBlob(hash, db)).equals(Buffer.from(bytes))).toBe(true);
  });
});

describe("putAsset + catalog", () => {
  it("stores an asset and finds it by query", () => {
    const { record } = putAsset(
      {
        name: "bell-item",
        kind: "item",
        path: "her",
        styleName: "her-world-draft",
        tags: ["quest", "sound"],
        frames: [png(0)],
        source,
      },
      db,
    );
    expect(record.width).toBe(3);
    expect(record.height).toBe(3);
    expect(getAssetRecord(record.id, db).name).toBe("bell-item");
    expect(listAssets({ tag: "sound" }, db)).toHaveLength(1);
    expect(listAssets({ kind: "tile" }, db)).toHaveLength(0);
    expect(listAssets({ sourceType: "sprite-data" }, db)).toHaveLength(1);
  });

  it("is idempotent for identical content", () => {
    const input = {
      name: "bell-item",
      kind: "item",
      path: "her",
      styleName: "her-world-draft",
      tags: ["quest"],
      frames: [png(0)],
      source,
    } as const;
    const again = putAsset({ ...input, tags: ["quest"] }, db);
    expect(again.replaced).toBe(false);
    expect(listAssets({ name: "bell-item" }, db)).toHaveLength(1);
  });

  it("refuses a same-name different-content asset without replace", () => {
    const input = {
      name: "bell-item",
      kind: "item",
      path: "her",
      styleName: "her-world-draft",
      tags: [],
      frames: [png(1)],
      source,
    } as const;
    expect(() => putAsset(input, db)).toThrow(DuplicateAssetError);
    const { replaced } = putAsset({ ...input, replace: true }, db);
    expect(replaced).toBe(true);
    expect(listAssets({ name: "bell-item" }, db)).toHaveLength(1);
  });

  it("allows the same name for a different path (two worlds, two entries)", () => {
    putAsset(
      {
        name: "bell-item",
        kind: "item",
        path: "his",
        styleName: "his-world-draft",
        tags: [],
        frames: [png(0)],
        source,
      },
      db,
    );
    expect(listAssets({ name: "bell-item" }, db)).toHaveLength(2);
  });

  it("stores animations as ordered frame hashes", () => {
    const frames = [png(0), png(1)];
    const { record } = putAsset(
      {
        name: "bell-swing",
        kind: "sprite",
        path: "her",
        styleName: "her-world-draft",
        tags: ["animation"],
        frames,
        frameMs: 140,
        source,
      },
      db,
    );
    expect(record.frames).toEqual(frames.map((f) => sha256OfBytes(f)));
    expect(record.frameMs).toBe(140);
    expect(record.id).toBe(record.frames[0]);
  });
});
