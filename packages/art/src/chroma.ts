import { createImage, getPixel, setPixel, type RawImage, type RGBA } from "./image.js";

/**
 * Knock a flat background out to transparency.
 *
 * Image models return a filled rectangle; sprites, portraits and items need an
 * isolated subject on transparency before the gate (ARCHITECTURE.md, "Notes
 * for the gpt-image-2 provider"), because quantize/outline both read
 * "transparent" as "not the subject". This is that step: pure, deterministic,
 * no network — the provider calls it before returning, and `processArt` runs
 * afterwards, unchanged.
 *
 * Flood-fill from the border rather than a global color replace: a pixel is
 * only cleared if it matches the background AND is reachable from the edge
 * through other background pixels. A sky-blue cloak on a sky-blue background
 * keeps its color; only the surrounding field is removed.
 */

/** Squared RGB distance under which two colors count as the same background. */
const DEFAULT_TOLERANCE = 32;

const NEIGHBORS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function distanceSq(a: RGBA, b: RGBA): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * The most common color along the image border — what a "flat uniform
 * background" request actually produced. Ties break toward the first color
 * encountered in scan order, so the result is deterministic.
 */
export function dominantBorderColor(img: RawImage): RGBA {
  const counts = new Map<number, { color: RGBA; count: number; firstSeen: number }>();
  let seen = 0;
  const tally = (x: number, y: number): void => {
    const p = getPixel(img, x, y);
    if (p.a === 0) return;
    const key = (p.r << 16) | (p.g << 8) | p.b;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { color: p, count: 1, firstSeen: seen });
    seen++;
  };

  for (let x = 0; x < img.width; x++) {
    tally(x, 0);
    tally(x, img.height - 1);
  }
  for (let y = 0; y < img.height; y++) {
    tally(0, y);
    tally(img.width - 1, y);
  }

  let best: { color: RGBA; count: number; firstSeen: number } | undefined;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.firstSeen < best.firstSeen)) {
      best = entry;
    }
  }
  return best?.color ?? { r: 0, g: 0, b: 0, a: 255 };
}

export interface ChromaKeyOptions {
  /** Background color to remove. Defaults to the dominant border color. */
  key?: RGBA;
  /** Squared RGB distance tolerance. Larger clears more aggressively. */
  tolerance?: number;
}

/**
 * Return a copy of `img` with the border-connected background cleared to
 * transparency. Pixels already transparent stay transparent; interior pixels
 * matching the key but enclosed by the subject (an eye, a gap in a handle)
 * are left alone.
 */
export function chromaKey(img: RawImage, options: ChromaKeyOptions = {}): RawImage {
  const key = options.key ?? dominantBorderColor(img);
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  const out = createImage(img.width, img.height);
  out.data.set(img.data);

  const visited = new Uint8Array(img.width * img.height);
  const queue: number[] = [];

  const tryEnqueue = (x: number, y: number): void => {
    const idx = y * img.width + x;
    if (visited[idx] === 1) return;
    const p = getPixel(img, x, y);
    if (p.a !== 0 && distanceSq(p, key) > tolerance) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < img.width; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, img.height - 1);
  }
  for (let y = 0; y < img.height; y++) {
    tryEnqueue(0, y);
    tryEnqueue(img.width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop() as number;
    const x = idx % img.width;
    const y = Math.floor(idx / img.width);
    setPixel(out, x, y, { r: 0, g: 0, b: 0, a: 0 });
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
      tryEnqueue(nx, ny);
    }
  }
  return out;
}
