import { describe, expect, it } from "vitest";
import { createImage, getPixel, hexToRgba, rgbaToHex, setPixel } from "../src/image.js";
import { outline, pixelize, processArt, quantize } from "../src/pipeline.js";
import { dustyRuinsStyle, neonTideStyle } from "./fixtures.js";

describe("pixelize", () => {
  it("resizes so the larger dimension equals gridSize, preserving aspect ratio (downscale)", () => {
    const img = createImage(200, 100); // 2:1
    const out = pixelize(img, 32);
    expect(Math.max(out.width, out.height)).toBe(32);
    expect(out.width / out.height).toBeCloseTo(2, 1);
  });

  it("also handles upscaling a small canvas to the grid", () => {
    const img = createImage(16, 16);
    const out = pixelize(img, 48);
    expect(out.width).toBe(48);
    expect(out.height).toBe(48);
  });

  it("is deterministic", () => {
    const img = createImage(37, 21);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 7) % 256;
    const a = pixelize(img, 32);
    const b = pixelize(img, 32);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});

describe("quantize", () => {
  it("maps every non-transparent pixel to an exact palette color; leaves transparent pixels alone", () => {
    const img = createImage(4, 1);
    setPixel(img, 0, 0, { r: 250, g: 245, b: 240, a: 255 }); // near-white -> nearest palette color
    setPixel(img, 1, 0, { r: 10, g: 10, b: 10, a: 255 }); // near-black
    setPixel(img, 2, 0, { r: 100, g: 100, b: 100, a: 255 }); // mid-gray, ambiguous but must land on a palette color
    setPixel(img, 3, 0, { r: 5, g: 5, b: 5, a: 0 }); // transparent, must be untouched

    const out = quantize(img, dustyRuinsStyle.colors);
    const paletteSet = new Set(dustyRuinsStyle.colors);

    for (let x = 0; x < 3; x++) {
      const p = getPixel(out, x, 0);
      expect(p.a).toBe(255);
      expect(paletteSet.has(rgbaToHex(p))).toBe(true);
    }
    const transparentPixel = getPixel(out, 3, 0);
    expect(transparentPixel.a).toBe(0);
  });

  it("picks the closest color by Euclidean RGB distance", () => {
    const palette = ["#000000", "#ffffff", "#ff0000"];
    const img = createImage(1, 1);
    setPixel(img, 0, 0, { r: 200, g: 10, b: 10, a: 255 }); // closest to pure red
    const out = quantize(img, palette);
    expect(rgbaToHex(getPixel(out, 0, 0))).toBe("#ff0000");
  });
});

describe("outline", () => {
  function soloSquare(): ReturnType<typeof createImage> {
    // A 1x1 opaque square in the middle of a 5x5 transparent canvas.
    const img = createImage(5, 5);
    setPixel(img, 2, 2, { r: 255, g: 255, b: 255, a: 255 });
    return img;
  }

  it("'none' returns the image unchanged", () => {
    const img = soloSquare();
    const out = outline(img, "none");
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });

  it("'dark' only adds pixels 4-adjacent to opaque pixels; opaque pixels are unchanged", () => {
    const img = soloSquare();
    const out = outline(img, "dark");

    // original opaque pixel unchanged
    expect(getPixel(out, 2, 2)).toEqual({ r: 255, g: 255, b: 255, a: 255 });

    const expectedOutline = [
      [2, 1],
      [2, 3],
      [1, 2],
      [3, 2],
    ];
    for (const [x, y] of expectedOutline) {
      expect(getPixel(out, x as number, y as number).a).toBe(255);
    }

    // diagonal neighbor + far corner must remain transparent (not 4-adjacent)
    expect(getPixel(out, 1, 1).a).toBe(0);
    expect(getPixel(out, 0, 0).a).toBe(0);

    // exactly 1 (opaque) + 4 (outline) = 5 opaque pixels total
    let opaqueCount = 0;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        if (getPixel(out, x, y).a !== 0) opaqueCount++;
      }
    }
    expect(opaqueCount).toBe(5);
  });

  it("'selective' outlines the exterior but leaves interior holes transparent", () => {
    // A ring: opaque border, transparent 1px hole in the center.
    const img = createImage(5, 5);
    for (let y = 1; y < 4; y++) {
      for (let x = 1; x < 4; x++) {
        setPixel(img, x, y, { r: 255, g: 255, b: 255, a: 255 });
      }
    }
    setPixel(img, 2, 2, { r: 0, g: 0, b: 0, a: 0 }); // interior hole

    const selective = outline(img, "selective");
    const dark = outline(img, "dark");

    // selective: interior hole stays transparent
    expect(getPixel(selective, 2, 2).a).toBe(0);
    // dark: interior hole gets outlined
    expect(getPixel(dark, 2, 2).a).toBe(255);

    // both outline the exterior border
    expect(getPixel(selective, 0, 1).a).toBe(255);
    expect(getPixel(dark, 0, 1).a).toBe(255);
  });
});

describe("processArt", () => {
  it("composes pixelize -> quantize -> outline deterministically", () => {
    const img = createImage(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        setPixel(img, x, y, { r: (x * 4) % 256, g: (y * 4) % 256, b: 100, a: x > 10 && x < 50 ? 255 : 0 });
      }
    }

    const a = processArt(img, neonTideStyle);
    const b = processArt(img, neonTideStyle);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Math.max(a.width, a.height)).toBe(neonTideStyle.gridSize);

    const paletteSet = new Set(neonTideStyle.colors);
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const p = getPixel(a, x, y);
        if (p.a === 0) continue;
        expect(paletteSet.has(rgbaToHex(p))).toBe(true);
      }
    }
  });
});
