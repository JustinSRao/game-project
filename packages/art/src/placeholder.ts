import type { ArtRequest, StyleBible } from "@unwritten/schema";
import { createImage, getPixel, hexToRgba, setPixel, type RawImage, type RGBA } from "./image.js";
import { hashOf, seedFromHex } from "./hash.js";
import { mulberry32, type Rng } from "./random.js";
import type { ImageProvider } from "./provider.js";

/**
 * sizeClass -> logical canvas resolution the placeholder is drawn at.
 *
 * These numbers intentionally share their domain with StyleBible.gridSize
 * (16/32/48), but the two are independent knobs: sizeClass says how big
 * *this* asset's raw canvas is before post-processing; style.gridSize is
 * what `pixelize` (pipeline.ts) normalizes every asset to afterwards,
 * regardless of provider or sizeClass. Since the placeholder provider draws
 * pixel-native shapes directly (no photographic detail to preserve), the
 * raw canvas and the post-pixelize output are usually close in size, but a
 * "small" item in a "large"-grid style still ends up correctly upscaled to
 * that style's grid by pixelize — sizeClass affects composition (how much
 * detail the placeholder attempts), gridSize is the final, universe-wide
 * word on resolution. Backgrounds use a 2:1 landscape canvas
 * (width = px * 2, height = px) so horizon bands read as a scene rather
 * than a square tile.
 */
const SIZE_CLASS_PX: Record<ArtRequest["sizeClass"], number> = {
  small: 16,
  medium: 32,
  large: 48,
};

/**
 * Deterministic seeded placeholder art. Same request + same style bible
 * always produces byte-identical pixels: the seed is derived from a hash of
 * (request, style) alone (hash.ts), fed into a mulberry32 PRNG (random.ts).
 * No network, no Math.random(), fully unit-testable.
 *
 * This is the "placeholder-first" half of the pixel-art skill: it renders
 * instantly so no gameplay path ever blocks on a real image model. Its
 * output goes through the exact same mandatory post-processing
 * (`processArt`, pipeline.ts) as any other `ImageProvider`'s output — the
 * placeholder provider does not special-case the pipeline.
 */
export class ProceduralPlaceholderProvider implements ImageProvider {
  generate(request: ArtRequest, style: StyleBible): Promise<RawImage> {
    const seed = seedFromHex(hashOf({ request, style }));
    const rng = mulberry32(seed);
    const img = drawPlaceholder(request, style, rng);
    return Promise.resolve(img);
  }
}

function drawPlaceholder(request: ArtRequest, style: StyleBible, rng: Rng): RawImage {
  const px = SIZE_CLASS_PX[request.sizeClass];
  switch (request.kind) {
    case "background":
      return drawBackground(px, style, rng);
    case "sprite":
    case "portrait":
      return drawSilhouette(px, style, rng, request.kind);
    case "item":
      return drawItemGlyph(px, style, rng);
  }
}

// ---------------------------------------------------------------------------
// background: layered horizon bands + scattered shapes
// ---------------------------------------------------------------------------

function drawBackground(px: number, style: StyleBible, rng: Rng): RawImage {
  const width = px * 2;
  const height = px;
  const img = createImage(width, height);

  const bandColors = pickDistinct(style.colors, clamp(3 + rng.nextInt(3), 2, style.colors.length), rng)
    .map(hexToRgba)
    .sort((a, b) => luminance(b) - luminance(a)); // lightest ("sky") first, darkest ("ground") last

  // Row boundaries: base = equal split, jittered +/-20% but monotonic.
  const boundaries: number[] = [0];
  for (let i = 1; i < bandColors.length; i++) {
    const base = Math.round((height * i) / bandColors.length);
    const jitter = Math.round((rng.next() - 0.5) * 0.4 * (height / bandColors.length));
    const prev = boundaries[i - 1] as number;
    boundaries.push(clamp(base + jitter, prev + 1, height - (bandColors.length - i)));
  }
  boundaries.push(height);

  for (let b = 0; b < bandColors.length; b++) {
    const from = boundaries[b] as number;
    const to = boundaries[b + 1] as number;
    const color = bandColors[b] as RGBA;
    for (let y = from; y < to; y++) {
      for (let x = 0; x < width; x++) {
        setPixel(img, x, y, { ...color, a: 255 });
      }
    }
  }

  // Scattered shapes (stars, rocks, trees — whatever the eye wants them to
  // be): small 1x1/2x2 blocks in a palette color, placed deterministically.
  const scatterCount = 4 + rng.nextInt(5);
  for (let i = 0; i < scatterCount; i++) {
    const color = hexToRgba(rng.pick(style.colors));
    const size = rng.chance(0.6) ? 1 : 2;
    const x0 = rng.nextInt(Math.max(1, width - size + 1));
    const y0 = rng.nextInt(Math.max(1, height - size + 1));
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (x0 + dx < width && y0 + dy < height) {
          setPixel(img, x0 + dx, y0 + dy, { ...color, a: 255 });
        }
      }
    }
  }

  return img;
}

// ---------------------------------------------------------------------------
// sprite / portrait: mirrored blocky silhouette on transparent background
// ---------------------------------------------------------------------------

function drawSilhouette(
  px: number,
  style: StyleBible,
  rng: Rng,
  kind: "sprite" | "portrait",
): RawImage {
  const width = px;
  const height = px;
  const img = createImage(width, height);
  const leftHalfWidth = Math.ceil(width / 2);

  const primary = hexToRgba(rng.pick(style.colors));
  const accent = hexToRgba(rng.pick(style.colors));

  for (let y = 0; y < height; y++) {
    const rowFraction = (y + 0.5) / height;
    const halfWidthFraction = kind === "portrait"
      ? portraitProfile(rowFraction)
      : spriteProfile(rowFraction);

    let halfWidthPixels = Math.round(halfWidthFraction * leftHalfWidth);
    halfWidthPixels += rng.nextInt(3) - 1; // +/-1 pixel jitter for organic edges
    halfWidthPixels = clamp(halfWidthPixels, 0, leftHalfWidth);

    const legGap = kind === "sprite" && rowFraction > 0.62 ? Math.round(leftHalfWidth * 0.35) : 0;
    const start = clamp(leftHalfWidth - halfWidthPixels, 0, leftHalfWidth);

    for (let x = start; x < leftHalfWidth; x++) {
      if (legGap > 0 && x < leftHalfWidth - halfWidthPixels + legGap) continue; // leg separation gap
      // Solid primary fill with a 1px accent rim at the outer edge (classic
      // pixel-art shading trick) — reads as a clean silhouette rather than
      // noise, unlike per-pixel random dithering.
      const color = x === start ? accent : primary;
      setPixel(img, x, y, { ...color, a: 255 });
    }
  }

  mirrorHorizontal(img, leftHalfWidth);
  return img;
}

/** Rounded head/bust: widest in the middle, tapering top and bottom (circle-ish). */
function portraitProfile(rowFraction: number): number {
  const centered = (rowFraction - 0.5) * 2; // -1..1
  const circle = Math.sqrt(Math.max(0, 1 - centered * centered));
  const shoulderFlare = rowFraction > 0.75 ? 0.15 : 0;
  return clamp(circle * 0.85 + shoulderFlare, 0, 1);
}

/** Humanoid: narrow rounded head, wide torso/shoulders, two-legged base. */
function spriteProfile(rowFraction: number): number {
  if (rowFraction < 0.22) {
    // head: ramps up from narrow to rounded
    const t = rowFraction / 0.22;
    return 0.3 + 0.35 * Math.sin(t * Math.PI * 0.5);
  }
  if (rowFraction < 0.62) {
    // torso/shoulders: fairly constant, slight taper toward the waist
    const t = (rowFraction - 0.22) / 0.4;
    return 0.85 - 0.15 * Math.sin(t * Math.PI);
  }
  // legs: the actual leg/gap split happens in drawSilhouette via legGap
  return 0.9;
}

// ---------------------------------------------------------------------------
// item: small centered symmetric glyph on transparent background
// ---------------------------------------------------------------------------

function drawItemGlyph(px: number, style: StyleBible, rng: Rng): RawImage {
  const width = px;
  const height = px;
  const img = createImage(width, height);
  const leftHalfWidth = Math.ceil(width / 2);

  const color = hexToRgba(rng.pick(style.colors));
  const accent = hexToRgba(rng.pick(style.colors));

  // Glyph occupies a centered inset region (60% of the canvas) so it reads
  // as "small, centered" rather than filling edge-to-edge like a sprite.
  const marginFraction = 0.2;

  for (let y = 0; y < height; y++) {
    const rowFraction = (y + 0.5) / height;
    if (rowFraction < marginFraction || rowFraction > 1 - marginFraction) continue;
    const t = (rowFraction - marginFraction) / (1 - 2 * marginFraction); // 0..1 within the glyph band
    const diamondFraction = 1 - Math.abs(t - 0.5) * 2; // triangle wave: 0 -> 1 -> 0

    let halfWidthPixels = Math.round(diamondFraction * leftHalfWidth * 0.8);
    halfWidthPixels = clamp(halfWidthPixels, 0, leftHalfWidth);
    const start = leftHalfWidth - halfWidthPixels;

    for (let x = start; x < leftHalfWidth; x++) {
      const isRim = x === start;
      setPixel(img, x, y, { ...(isRim ? accent : color), a: 255 });
    }
  }

  mirrorHorizontal(img, leftHalfWidth);
  return img;
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

/** Mirror columns [0, leftHalfWidth) onto the right half of the image (classic sprite trick). */
function mirrorHorizontal(img: RawImage, leftHalfWidth: number): void {
  for (let x = 0; x < leftHalfWidth; x++) {
    const mirroredX = img.width - 1 - x;
    if (mirroredX === x) continue;
    for (let y = 0; y < img.height; y++) {
      setPixel(img, mirroredX, y, getPixel(img, x, y));
    }
  }
}

function luminance(c: RGBA): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Deterministically pick `count` distinct colors from `colors` using `rng` (Fisher-Yates prefix). */
function pickDistinct(colors: readonly string[], count: number, rng: Rng): string[] {
  const pool = [...colors];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = pool[i] as string;
    pool[i] = pool[j] as string;
    pool[j] = tmp;
  }
  return pool.slice(0, Math.min(count, pool.length));
}
