import type { SpriteData } from "@howeverfar/schema";
import { createImage, hexToRgba, setPixel, type RawImage } from "./image.js";

/**
 * Render a validated SpriteData grid to pixels — deterministic, no IO, no
 * randomness: the same grid always produces byte-identical output. This is
 * ADR-0011 source #2 (model-emitted sprites); the result still passes
 * `processArt` + validation at the Asset Studio gate like every other
 * source — rendering is not the gate.
 */
export function renderSpriteData(sprite: SpriteData): RawImage {
  const height = sprite.rows.length;
  const width = sprite.rows[0]?.length ?? 0;
  const img = createImage(width, height);
  const palette = sprite.palette.map(hexToRgba);

  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] as string;
      if (ch === ".") continue; // createImage starts fully transparent
      const color = palette[parseInt(ch, 32)];
      if (!color) throw new Error(`sprite "${sprite.name}": palette index "${ch}" out of range`);
      setPixel(img, x, y, color);
    }
  });
  return img;
}

/**
 * Integer nearest-neighbor upscale, for human-facing previews only (the
 * catalog's `preview` command). Never part of the gate pipeline — gated
 * assets stay at grid size; this just makes 32px art visible to eyes.
 */
export function upscale(img: RawImage, factor: number): RawImage {
  if (!Number.isInteger(factor) || factor < 1) {
    throw new RangeError(`upscale factor must be a positive integer, got ${factor}`);
  }
  if (factor === 1) return img;
  const out = createImage(img.width * factor, img.height * factor);
  for (let y = 0; y < out.height; y++) {
    const srcY = Math.floor(y / factor);
    for (let x = 0; x < out.width; x++) {
      const srcX = Math.floor(x / factor);
      const o = (y * out.width + x) * 4;
      const s = (srcY * img.width + srcX) * 4;
      out.data[o] = img.data[s] as number;
      out.data[o + 1] = img.data[s + 1] as number;
      out.data[o + 2] = img.data[s + 2] as number;
      out.data[o + 3] = img.data[s + 3] as number;
    }
  }
  return out;
}
