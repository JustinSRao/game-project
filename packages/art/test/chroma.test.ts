import { describe, expect, it } from "vitest";
import { chromaKey, createImage, dominantBorderColor, getPixel, setPixel } from "../src/index.js";

const BG = { r: 0x00, g: 0xff, b: 0x00, a: 255 };
const FG = { r: 0xb1, g: 0x3e, b: 0x53, a: 255 };

/** A 5x5 field of BG with a 3x3 FG block in the middle. */
function subjectOnField() {
  const img = createImage(5, 5);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      setPixel(img, x, y, x >= 1 && x <= 3 && y >= 1 && y <= 3 ? FG : BG);
    }
  }
  return img;
}

describe("dominantBorderColor", () => {
  it("finds the flat background from the border", () => {
    expect(dominantBorderColor(subjectOnField())).toEqual(BG);
  });
});

describe("chromaKey", () => {
  it("clears the background and keeps the subject", () => {
    const out = chromaKey(subjectOnField());
    expect(getPixel(out, 0, 0).a).toBe(0);
    expect(getPixel(out, 4, 4).a).toBe(0);
    expect(getPixel(out, 2, 2)).toEqual(FG);
  });

  it("keeps an interior hole that matches the background color", () => {
    const img = subjectOnField();
    setPixel(img, 2, 2, BG); // a background-colored pixel enclosed by the subject
    const out = chromaKey(img);
    expect(getPixel(out, 2, 2)).toEqual(BG);
    expect(getPixel(out, 0, 0).a).toBe(0);
  });

  it("keeps subject pixels that happen to match the background", () => {
    const img = createImage(4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) setPixel(img, x, y, BG);
    }
    // A subject touching the border in BG's own color is indistinguishable —
    // but a subject enclosed in FG protects its BG-colored interior.
    setPixel(img, 1, 1, FG);
    setPixel(img, 2, 1, FG);
    setPixel(img, 1, 2, FG);
    setPixel(img, 2, 2, FG);
    const out = chromaKey(img);
    expect(getPixel(out, 1, 1)).toEqual(FG);
    expect(getPixel(out, 0, 0).a).toBe(0);
  });

  it("honors an explicit key and tolerance", () => {
    const img = subjectOnField();
    // Nudge one border pixel slightly off-color; a wide tolerance still clears it.
    setPixel(img, 0, 0, { r: 0x02, g: 0xfd, b: 0x03, a: 255 });
    const out = chromaKey(img, { key: BG, tolerance: 64 });
    expect(getPixel(out, 0, 0).a).toBe(0);
  });

  it("leaves already-transparent pixels transparent", () => {
    const img = createImage(3, 3);
    const out = chromaKey(img);
    expect(getPixel(out, 1, 1).a).toBe(0);
  });
});
