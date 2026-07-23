import { describe, expect, it } from "vitest";
import { SpriteData } from "@howeverfar/schema";
import { encodePng, getPixel, renderSpriteData, upscale } from "../src/index.js";

const sprite = SpriteData.parse({
  version: 1,
  name: "tiny-bell",
  palette: ["#1a1c2c", "#ffcd75"],
  rows: [".11.", "1001", ".11."],
});

describe("renderSpriteData", () => {
  it("renders indices to palette colors and dots to transparency", () => {
    const img = renderSpriteData(sprite);
    expect(img.width).toBe(4);
    expect(img.height).toBe(3);
    expect(getPixel(img, 0, 0).a).toBe(0); // "."
    expect(getPixel(img, 1, 0)).toEqual({ r: 0xff, g: 0xcd, b: 0x75, a: 255 }); // "1"
    expect(getPixel(img, 1, 1)).toEqual({ r: 0x1a, g: 0x1c, b: 0x2c, a: 255 }); // "0"
  });

  it("is deterministic to the byte", () => {
    const a = encodePng(renderSpriteData(sprite));
    const b = encodePng(renderSpriteData(sprite));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("reads base-32 indices above 9", () => {
    const wide = SpriteData.parse({
      version: 1,
      name: "wide",
      palette: Array.from({ length: 11 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`),
      rows: ["a"],
    });
    expect(getPixel(renderSpriteData(wide), 0, 0).b).toBe(10);
  });
});

describe("upscale", () => {
  it("scales each pixel into a factor x factor block", () => {
    const img = renderSpriteData(sprite);
    const big = upscale(img, 3);
    expect(big.width).toBe(12);
    expect(big.height).toBe(9);
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(getPixel(big, 3 + dx, dy)).toEqual(getPixel(img, 1, 0));
      }
    }
  });

  it("returns the image unchanged at factor 1", () => {
    const img = renderSpriteData(sprite);
    expect(upscale(img, 1)).toBe(img);
  });

  it("rejects non-integer factors", () => {
    expect(() => upscale(renderSpriteData(sprite), 1.5)).toThrow(RangeError);
  });
});
