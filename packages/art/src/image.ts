import { PNG } from "pngjs";

/**
 * A decoded raster image: straight (non-premultiplied) RGBA, 8 bits per
 * channel, row-major, top-to-bottom. `data.length === width * height * 4`.
 *
 * This is the only image representation the art pipeline operates on. Every
 * provider, post-processing step, and cache entry passes `RawImage` around;
 * PNG is purely an on-disk encoding at the edges (cache read/write, eval
 * output). Zero native dependencies: encode/decode goes through `pngjs`,
 * a pure-JS PNG implementation, so this package never needs a native build.
 */
export interface RawImage {
  readonly width: number;
  readonly height: number;
  /** RGBA8, length === width * height * 4. */
  readonly data: Uint8Array;
}

/** Create a fully-transparent RawImage of the given size. */
export function createImage(width: number, height: number): RawImage {
  if (width <= 0 || height <= 0) {
    throw new RangeError(`invalid image size ${width}x${height}`);
  }
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Index into `data` for pixel (x, y). Throws on out-of-bounds access. */
export function pixelOffset(img: RawImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
    throw new RangeError(`pixel (${x}, ${y}) out of bounds for ${img.width}x${img.height} image`);
  }
  return (y * img.width + x) * 4;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function getPixel(img: RawImage, x: number, y: number): RGBA {
  const o = pixelOffset(img, x, y);
  const d = img.data;
  return { r: d[o] as number, g: d[o + 1] as number, b: d[o + 2] as number, a: d[o + 3] as number };
}

export function setPixel(img: RawImage, x: number, y: number, rgba: RGBA): void {
  const o = pixelOffset(img, x, y);
  const d = img.data as Uint8Array;
  d[o] = rgba.r;
  d[o + 1] = rgba.g;
  d[o + 2] = rgba.b;
  d[o + 3] = rgba.a;
}

/** Parse a `#rrggbb` StyleBible color into RGBA (alpha forced opaque). */
export function hexToRgba(hex: string): RGBA {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`invalid hex color "${hex}"`);
  return {
    r: parseInt(m[1] as string, 16),
    g: parseInt(m[2] as string, 16),
    b: parseInt(m[3] as string, 16),
    a: 255,
  };
}

export function rgbaToHex(rgba: RGBA): string {
  const c = (n: number) => n.toString(16).padStart(2, "0");
  return `#${c(rgba.r)}${c(rgba.g)}${c(rgba.b)}`;
}

/** Encode a RawImage to PNG bytes. Deterministic for identical input. */
export function encodePng(img: RawImage): Uint8Array {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  // pngjs's sync writer is deterministic given identical pixel data and
  // options (no timestamps embedded in the IHDR/IDAT chunks it emits).
  return new Uint8Array(PNG.sync.write(png, { colorType: 6 }));
}

/** Decode PNG bytes to a RawImage (always normalized to RGBA). */
export function decodePng(bytes: Uint8Array): RawImage {
  const png = PNG.sync.read(Buffer.from(bytes));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}
