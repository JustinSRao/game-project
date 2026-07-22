import type { StyleBible } from "@howeverfar/schema";
import { createImage, getPixel, hexToRgba, setPixel, type RawImage, type RGBA } from "./image.js";

/**
 * Bump this whenever pixelize/quantize/outline/processArt (or anything that
 * changes pipeline *output bytes* for the same request+style) changes. It is
 * folded into the asset cache key (cache.ts), so bumping it invalidates
 * every cached asset globally — "same character, same art, forever" only
 * holds within one pipeline version (pixel-art skill).
 */
export const PIPELINE_VERSION = 1;

const TRANSPARENT_ALPHA = 0;

function isTransparent(a: number): boolean {
  return a === TRANSPARENT_ALPHA;
}

/**
 * Nearest-neighbor resample `img` so its larger dimension equals `gridSize`,
 * preserving aspect ratio. This is the step that normalizes every asset —
 * regardless of provider or the request's sizeClass — onto the universe's
 * locked grid (StyleBible.gridSize). Works both directions (down- or
 * upscaling) with the same sampling logic: for every target pixel, sample
 * the source pixel whose center is closest, so output is always composed of
 * whole blocks of source pixels (or vice versa) — no blending, no new
 * colors introduced (important: quantize relies on this).
 */
export function pixelize(img: RawImage, gridSize: number): RawImage {
  if (gridSize <= 0) throw new RangeError("gridSize must be > 0");
  const scale = gridSize / Math.max(img.width, img.height);
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const out = createImage(targetWidth, targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const srcY = Math.min(img.height - 1, Math.floor((y + 0.5) * (img.height / targetHeight)));
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(img.width - 1, Math.floor((x + 0.5) * (img.width / targetWidth)));
      setPixel(out, x, y, getPixel(img, srcX, srcY));
    }
  }
  return out;
}

/**
 * Map every non-transparent pixel's RGB to the nearest color in `palette`
 * (Euclidean distance in RGB space), leaving alpha untouched. Fully
 * transparent pixels (alpha === 0) pass through unchanged — quantization
 * only touches visible pixels. This is what makes independently generated
 * art cohere: after this step, every visible pixel in every asset in the
 * universe is one of the same <=32 colors.
 */
export function quantize(img: RawImage, palette: readonly string[]): RawImage {
  if (palette.length === 0) throw new RangeError("palette must not be empty");
  const paletteRgba = palette.map(hexToRgba);

  const out = createImage(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const p = getPixel(img, x, y);
      if (isTransparent(p.a)) {
        setPixel(out, x, y, p);
        continue;
      }
      setPixel(out, x, y, { ...nearestColor(p, paletteRgba), a: p.a });
    }
  }
  return out;
}

function nearestColor(p: RGBA, palette: readonly RGBA[]): RGBA {
  let best = palette[0] as RGBA;
  let bestDist = Infinity;
  for (const c of palette) {
    const dr = p.r - c.r;
    const dg = p.g - c.g;
    const db = p.b - c.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/** Perceptual luminance, used to pick a "dark" outline color from the palette. */
function luminance(c: RGBA): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/**
 * Add a 1px outline around non-transparent regions, using the darkest color
 * in the style's own palette (so the outline stays within the universe's
 * locked color set — StyleBible.colors documents that "all art is quantized
 * to exactly these"). Only previously-transparent pixels are ever changed;
 * existing opaque pixels are left exactly as quantize produced them.
 *
 * - "none": no-op, returns `img` unchanged (by value; same pixels).
 * - "dark": every transparent pixel 4-adjacent to an opaque pixel becomes an
 *   opaque outline pixel — including transparent pixels fully enclosed by
 *   the subject (holes), so e.g. a ring shape gets an outline on its inner
 *   edge too.
 * - "selective": only the *exterior* silhouette is outlined. Exterior
 *   transparent pixels are found by flood-filling transparency inward from
 *   the image border; a transparent pixel not reachable from the border
 *   (an interior hole, e.g. eyes cut into a silhouette) is left alone. This
 *   is the common pixel-art trick of framing a subject without boxing in
 *   its interior details.
 */
export function outline(img: RawImage, mode: StyleBible["outline"]): RawImage {
  if (mode === "none") return img;

  const paletteHint = darkestNonTransparentColor(img);
  const outlineColor: RGBA = paletteHint ?? { r: 0, g: 0, b: 0, a: 255 };

  const exteriorTransparent =
    mode === "selective" ? floodFillExteriorTransparent(img) : null;

  const out = createImage(img.width, img.height);
  out.data.set(img.data);

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const p = getPixel(img, x, y);
      if (!isTransparent(p.a)) continue; // opaque pixels are copied as-is above
      if (mode === "selective" && exteriorTransparent && !exteriorTransparent.has(y * img.width + x)) {
        continue; // interior hole: leave transparent
      }
      if (isAdjacentToOpaque(img, x, y)) {
        setPixel(out, x, y, { ...outlineColor, a: 255 });
      }
    }
  }
  return out;
}

function darkestNonTransparentColor(img: RawImage): RGBA | null {
  let best: RGBA | null = null;
  let bestLum = Infinity;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const p = getPixel(img, x, y);
      if (isTransparent(p.a)) continue;
      const lum = luminance(p);
      if (lum < bestLum) {
        bestLum = lum;
        best = p;
      }
    }
  }
  return best;
}

const NEIGHBORS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function isAdjacentToOpaque(img: RawImage, x: number, y: number): boolean {
  for (const [dx, dy] of NEIGHBORS_4) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
    if (!isTransparent(getPixel(img, nx, ny).a)) return true;
  }
  return false;
}

/** BFS from every transparent border pixel through 4-connected transparent pixels. */
function floodFillExteriorTransparent(img: RawImage): Set<number> {
  const visited = new Set<number>();
  const queue: number[] = [];

  const tryEnqueue = (x: number, y: number): void => {
    const idx = y * img.width + x;
    if (visited.has(idx)) return;
    if (!isTransparent(getPixel(img, x, y).a)) return;
    visited.add(idx);
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
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
      tryEnqueue(nx, ny);
    }
  }
  return visited;
}

/**
 * The mandatory post-processing pipeline (pixel-art skill: "Post-processing
 * is mandatory and deterministic"). Applied to every provider's output —
 * placeholder or real image model alike — in exactly this order:
 * downscale/upscale to the style's grid, quantize to the locked palette,
 * then optional outline. Raw model output never reaches the client.
 */
export function processArt(raw: RawImage, style: StyleBible): RawImage {
  const gridded = pixelize(raw, style.gridSize);
  const quantized = quantize(gridded, style.colors);
  return outline(quantized, style.outline);
}
