import { describe, expect, it } from "vitest";
import { createImage, decodePng, encodePng, hexToRgba, rgbaToHex, setPixel } from "../src/image.js";

describe("PNG round-trip", () => {
  it("decodes exactly what it encoded, including transparency", () => {
    const img = createImage(5, 3);
    setPixel(img, 0, 0, { r: 255, g: 0, b: 0, a: 255 });
    setPixel(img, 1, 0, { r: 0, g: 255, b: 0, a: 128 });
    setPixel(img, 4, 2, { r: 0, g: 0, b: 255, a: 0 });

    const bytes = encodePng(img);
    const decoded = decodePng(bytes);

    expect(decoded.width).toBe(img.width);
    expect(decoded.height).toBe(img.height);
    expect(Array.from(decoded.data)).toEqual(Array.from(img.data));
  });

  it("PNG bytes are byte-identical across repeated encodes of the same image", () => {
    const img = createImage(4, 4);
    setPixel(img, 2, 2, { r: 10, g: 20, b: 30, a: 255 });

    const a = encodePng(img);
    const b = encodePng(img);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe("hex color helpers", () => {
  it("round-trips hex <-> rgba", () => {
    expect(rgbaToHex(hexToRgba("#a1b2c3"))).toBe("#a1b2c3");
  });

  it("rejects malformed hex", () => {
    expect(() => hexToRgba("not-a-color")).toThrow();
  });
});
