/**
 * Visual eval: renders a grid of procedural placeholders — every art
 * kind x sizeClass, for two deliberately contrasting StyleBibles — and
 * writes each as a PNG plus one composed contact sheet per style under
 * packages/art/eval-output/ (gitignored; test-only, not part of the
 * package's public surface or CI).
 *
 * Run with: npm run eval -w @howeverfar/art
 *
 * Cohesion is judged by eyes (pixel-art skill: "keep a visual eval page ...
 * make the eyes' job easy") — this script is that eval page, rendered to
 * PNG instead of HTML since the pipeline has no browser dependency.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtRequest, StyleBible } from "@howeverfar/schema";
import { createImage, encodePng, hexToRgba, setPixel, type RawImage } from "../src/image.js";
import { processArt } from "../src/pipeline.js";
import { ProceduralPlaceholderProvider } from "../src/placeholder.js";
import { dustyRuinsStyle, neonTideStyle } from "../test/fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "eval-output");

const KINDS: ArtRequest["kind"][] = ["background", "sprite", "portrait", "item"];
const SIZE_CLASSES: ArtRequest["sizeClass"][] = ["small", "medium", "large"];

const SUBJECTS: Record<ArtRequest["kind"], string> = {
  background: "a windswept overlook at the edge of the map",
  sprite: "a weary courier in a patched coat",
  portrait: "a guarded innkeeper with an old scar",
  item: "a dented brass compass",
};

const CELL_PADDING = 4;
const LABEL_ROW_HEIGHT = 0; // labels are encoded via filenames, not pixels — keep the sheet pixel-pure

async function renderStyleSheet(style: StyleBible, label: string): Promise<void> {
  const provider = new ProceduralPlaceholderProvider();
  const styleDir = join(outDir, label);
  await mkdir(styleDir, { recursive: true });

  const cells: { request: ArtRequest; asset: RawImage }[] = [];

  for (const kind of KINDS) {
    for (const sizeClass of SIZE_CLASSES) {
      const request: ArtRequest = {
        kind,
        subject: SUBJECTS[kind],
        mood: "wary, low light",
        sizeClass,
      };
      const raw = await provider.generate(request, style);
      const asset = processArt(raw, style);
      cells.push({ request, asset });

      const fileName = `${kind}-${sizeClass}.png`;
      await writeFile(join(styleDir, fileName), Buffer.from(encodePng(asset)));
    }
  }

  const sheet = composeContactSheet(cells.map((c) => c.asset), style);
  await writeFile(join(outDir, `${label}-contact-sheet.png`), Buffer.from(encodePng(sheet)));

  console.log(`[eval] ${label}: wrote ${cells.length} assets + contact sheet to ${styleDir}`);
}

/** Lay every asset out on a simple grid, on a mid-gray backdrop so transparent sprites are visible. */
function composeContactSheet(assets: RawImage[], style: StyleBible): RawImage {
  const cols = SIZE_CLASSES.length;
  const rows = KINDS.length;
  const cellSize = Math.max(...assets.map((a) => Math.max(a.width, a.height))) + CELL_PADDING * 2;

  const sheetWidth = cols * cellSize;
  const sheetHeight = rows * (cellSize + LABEL_ROW_HEIGHT);
  const sheet = createImage(sheetWidth, sheetHeight);

  const backdrop = midGray();
  for (let y = 0; y < sheet.height; y++) {
    for (let x = 0; x < sheet.width; x++) {
      setPixel(sheet, x, y, backdrop);
    }
  }

  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const asset = assets[i];
      i++;
      if (!asset) continue;
      const originX = col * cellSize + Math.floor((cellSize - asset.width) / 2);
      const originY = row * (cellSize + LABEL_ROW_HEIGHT) + Math.floor((cellSize - asset.height) / 2);
      blit(sheet, asset, originX, originY);
    }
  }

  // Frame the sheet in the style's own darkest palette color, so each
  // style's contact sheet is visually branded by its own StyleBible.
  const frameColor = darkestColor(style);
  for (let x = 0; x < sheet.width; x++) {
    setPixel(sheet, x, 0, frameColor);
    setPixel(sheet, x, sheet.height - 1, frameColor);
  }
  for (let y = 0; y < sheet.height; y++) {
    setPixel(sheet, 0, y, frameColor);
    setPixel(sheet, sheet.width - 1, y, frameColor);
  }

  return sheet;
}

function darkestColor(style: StyleBible): { r: number; g: number; b: number; a: number } {
  let best = hexToRgba(style.colors[0] as string);
  let bestLum = Infinity;
  for (const hex of style.colors) {
    const c = hexToRgba(hex);
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    if (lum < bestLum) {
      bestLum = lum;
      best = c;
    }
  }
  return best;
}

function midGray(): { r: number; g: number; b: number; a: number } {
  return { r: 128, g: 128, b: 128, a: 255 };
}

function blit(dest: RawImage, src: RawImage, originX: number, originY: number): void {
  for (let y = 0; y < src.height; y++) {
    const dy = originY + y;
    if (dy < 0 || dy >= dest.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = originX + x;
      if (dx < 0 || dx >= dest.width) continue;
      const srcOffset = (y * src.width + x) * 4;
      const a = src.data[srcOffset + 3] as number;
      if (a === 0) continue; // let the backdrop show through transparent pixels
      setPixel(dest, dx, dy, {
        r: src.data[srcOffset] as number,
        g: src.data[srcOffset + 1] as number,
        b: src.data[srcOffset + 2] as number,
        a,
      });
    }
  }
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await renderStyleSheet(dustyRuinsStyle, "dusty-ruins");
  await renderStyleSheet(neonTideStyle, "neon-tide");
  console.log(`[eval] done. Open ${outDir} to compare styles by eye.`);
}

await main();
