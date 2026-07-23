import OpenAI from "openai";
import type { ArtRequest, StyleBible } from "@howeverfar/schema";
import { chromaKey, decodePng, type ImageProvider, type RawImage } from "@howeverfar/art";
import { IMAGE_MODEL } from "./config.js";
import { recordUsage } from "./costs.js";

/**
 * The gpt-image-2 provider (ADR-0011 source #3): hero assets — key art,
 * portraits, unique monsters — behind the `ImageProvider` seam.
 *
 * Contract notes that are easy to get wrong (ARCHITECTURE.md, "Notes for the
 * gpt-image-2 provider"):
 *
 * - **No post-processing here.** `processArt` is applied uniformly by
 *   `AssetCache.getOrGenerate` / the Asset Studio gate, so the look is
 *   enforced in exactly one place. This provider returns raw pixels.
 * - **Isolated subject on transparency** for sprite/portrait/item: the prompt
 *   asks for a flat uniform background and `chromaKey` removes it, because
 *   quantize/outline both read transparent as "not the subject".
 * - **Every call lands in the cost ledger** (ADR-0018, CLAUDE.md invariant
 *   12) — this is a paid API path, so `recordUsage` is not optional.
 * - The prompt is built deterministically from request + style, so the same
 *   (request, style) hits the asset cache instead of paying twice.
 */

/** The flat background asked for and keyed out. Chosen to sit far from any style palette. */
const CHROMA_BACKGROUND = "pure magenta (#ff00ff)";

const SIZE_FOR: Record<ArtRequest["sizeClass"], "1024x1024" | "1536x1024"> = {
  small: "1024x1024",
  medium: "1024x1024",
  large: "1536x1024",
};

/** Kinds that must come back as an isolated subject rather than a filled scene. */
const ISOLATED_KINDS: ReadonlySet<ArtRequest["kind"]> = new Set([
  "sprite",
  "portrait",
  "item",
]);

/**
 * Compose the image prompt from the Director's `ArtRequest` and the locked
 * `StyleBible`. Pure and deterministic: no timestamps, no randomness, stable
 * key order — the same inputs must produce the same string, or the asset
 * cache stops working and the owner pays twice for the same picture.
 */
export function buildImagePrompt(request: ArtRequest, style: StyleBible): string {
  const parts = [
    `${request.kind === "background" ? "Pixel-art scene" : `Pixel-art ${request.kind}`}: ${request.subject}.`,
    `Mood: ${request.mood}.`,
    `Perspective: ${style.perspective}.`,
    `Style: ${style.keywords.join(", ")}.`,
    `Limited palette of ${style.colors.length} colors: ${style.colors.join(" ")}.`,
    `Crisp hard-edged pixels, no anti-aliasing, no gradients, no text, no watermark, no drop shadow.`,
  ];
  if (ISOLATED_KINDS.has(request.kind)) {
    parts.push(
      `A single isolated subject centered on a flat uniform ${CHROMA_BACKGROUND} background, filling most of the frame, with no ground plane, scenery, or border.`,
    );
  }
  return parts.join(" ");
}

/** The subset of the OpenAI images API this provider uses (keeps tests keyless). */
export interface ImagesApi {
  generate(params: {
    model: string;
    prompt: string;
    size: string;
    n: number;
  }): Promise<{
    data?: Array<{ b64_json?: string }> | undefined;
    usage?:
      | { input_tokens?: number; output_tokens?: number; total_tokens?: number }
      | undefined;
  }>;
}

export class ImageGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageGenerationError";
  }
}

export class GptImageProvider implements ImageProvider {
  private readonly images: ImagesApi;
  private readonly model: string;

  constructor(images?: ImagesApi, model: string = IMAGE_MODEL) {
    this.images = images ?? (new OpenAI().images as unknown as ImagesApi);
    this.model = model;
  }

  async generate(request: ArtRequest, style: StyleBible): Promise<RawImage> {
    const response = await this.images.generate({
      model: this.model,
      prompt: buildImagePrompt(request, style),
      size: SIZE_FOR[request.sizeClass],
      n: 1,
    });

    const b64 = response.data?.[0]?.b64_json;

    // Ledger first (ADR-0018): the call was billed whether or not it is
    // usable, so it is recorded before any failure path returns.
    recordUsage({
      provider: "openai",
      model: this.model,
      role: "image",
      kind: "image",
      images: response.data?.length ?? 1,
      inputTokens: response.usage?.input_tokens ?? 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    if (!b64) {
      throw new ImageGenerationError(
        `${this.model} returned no image data for "${request.subject}"`,
      );
    }

    const raw = decodePng(new Uint8Array(Buffer.from(b64, "base64")));
    return ISOLATED_KINDS.has(request.kind) ? chromaKey(raw) : raw;
  }
}
