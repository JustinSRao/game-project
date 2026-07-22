import { describe, expect, it } from "vitest";
import type { ArtRequest } from "@howeverfar/schema";
import { ProceduralPlaceholderProvider } from "../src/placeholder.js";
import { processArt } from "../src/pipeline.js";
import { dustyRuinsStyle, neonTideStyle, sampleRequest } from "./fixtures.js";

const provider = new ProceduralPlaceholderProvider();
const kinds: ArtRequest["kind"][] = ["background", "sprite", "portrait", "item"];
const sizeClasses: ArtRequest["sizeClass"][] = ["small", "medium", "large"];

describe("ProceduralPlaceholderProvider determinism", () => {
  it("two runs with the same request+style produce byte-identical raw images", async () => {
    for (const kind of kinds) {
      const request = sampleRequest({ kind });
      const a = await provider.generate(request, dustyRuinsStyle);
      const b = await provider.generate(request, dustyRuinsStyle);
      expect(a.width).toBe(b.width);
      expect(a.height).toBe(b.height);
      expect(Array.from(a.data)).toEqual(Array.from(b.data));
    }
  });

  it("two runs through the full pipeline (raw + processArt) are byte-identical", async () => {
    const request = sampleRequest({ kind: "sprite" });
    const rawA = await provider.generate(request, neonTideStyle);
    const rawB = await provider.generate(request, neonTideStyle);
    const a = processArt(rawA, neonTideStyle);
    const b = processArt(rawB, neonTideStyle);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("different subjects produce different art (seed actually varies)", async () => {
    const a = await provider.generate(sampleRequest({ subject: "a courier" }), dustyRuinsStyle);
    const b = await provider.generate(sampleRequest({ subject: "a completely different subject" }), dustyRuinsStyle);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it("different style bibles produce different art for the same request", async () => {
    const request = sampleRequest({ kind: "portrait" });
    const a = await provider.generate(request, dustyRuinsStyle);
    const b = await provider.generate(request, neonTideStyle);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });
});

describe("ProceduralPlaceholderProvider sizing", () => {
  it("sizes background as a 2:1 landscape canvas per sizeClass", async () => {
    for (const sizeClass of sizeClasses) {
      const img = await provider.generate(sampleRequest({ kind: "background", sizeClass }), dustyRuinsStyle);
      expect(img.width).toBe(img.height * 2);
    }
  });

  it("sizes sprite/portrait/item as a square canvas per sizeClass", async () => {
    const expected: Record<ArtRequest["sizeClass"], number> = { small: 16, medium: 32, large: 48 };
    for (const kind of ["sprite", "portrait", "item"] as const) {
      for (const sizeClass of sizeClasses) {
        const img = await provider.generate(sampleRequest({ kind, sizeClass }), dustyRuinsStyle);
        expect(img.width).toBe(expected[sizeClass]);
        expect(img.height).toBe(expected[sizeClass]);
      }
    }
  });
});

describe("ProceduralPlaceholderProvider transparency", () => {
  it("background is fully opaque", async () => {
    const img = await provider.generate(sampleRequest({ kind: "background" }), dustyRuinsStyle);
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(255);
    }
  });

  it("sprite/portrait/item have some transparent pixels (not filling the whole canvas)", async () => {
    for (const kind of ["sprite", "portrait", "item"] as const) {
      const img = await provider.generate(sampleRequest({ kind }), dustyRuinsStyle);
      let transparentCount = 0;
      for (let i = 3; i < img.data.length; i += 4) {
        if (img.data[i] === 0) transparentCount++;
      }
      expect(transparentCount).toBeGreaterThan(0);
    }
  });

  it("sprite is left-right symmetric (mirrored)", async () => {
    const img = await provider.generate(sampleRequest({ kind: "sprite" }), dustyRuinsStyle);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const mirroredX = img.width - 1 - x;
        const o1 = (y * img.width + x) * 4;
        const o2 = (y * img.width + mirroredX) * 4;
        expect(img.data[o1]).toBe(img.data[o2]);
        expect(img.data[o1 + 1]).toBe(img.data[o2 + 1]);
        expect(img.data[o1 + 2]).toBe(img.data[o2 + 2]);
        expect(img.data[o1 + 3]).toBe(img.data[o2 + 3]);
      }
    }
  });
});
