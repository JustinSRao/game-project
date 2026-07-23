import type { ArtRequest } from "@howeverfar/schema";
import type { StyleBible } from "@howeverfar/schema";
import type { RawImage } from "./image.js";

/**
 * The seam where a real image model plugs in.
 *
 * `ImageProvider` is the entire contract between the art pipeline and
 * whatever produces raw pixels: today that's `ProceduralPlaceholderProvider`
 * (see placeholder.ts), later it's a server-side adapter that calls an
 * actual image-generation model (per docs/ARCHITECTURE.md §4 and the
 * pixel-art skill: "Image model choice is config, not code; the
 * post-processing step is what owns the look").
 *
 * To add a real provider:
 *   1. Implement this interface. `generate` receives the Director's
 *      `ArtRequest` (kind/subject/mood/sizeClass — never a raw image-model
 *      prompt) plus the universe's locked `StyleBible`. Deterministic prompt
 *      construction from request+style is the provider's job, e.g.
 *      `buildPrompt(request, style)` composing subject/mood/keywords/
 *      perspective into whatever string or param shape the target model
 *      wants.
 *   2. Call the model (network I/O is fine here — this is the one place in
 *      the pipeline allowed to be non-deterministic and non-local).
 *   3. Decode the model's output into a `RawImage` (see image.ts /
 *      decodePng for the PNG case) and return it.
 *   4. Do NOT post-process (pixelize/quantize/outline) inside the provider —
 *      `processArt` (pipeline.ts) is applied uniformly to every provider's
 *      output by `AssetCache.getOrGenerate`, so the style is enforced in
 *      exactly one place regardless of which model produced the raw image.
 *   5. For sprites/portraits/items, request an isolated subject on a flat
 *      background from the model and chroma-key/alpha it out before
 *      returning (per the pixel-art skill's "Practical notes") — the
 *      pipeline's quantize/outline steps assume transparency already means
 *      "not part of the subject".
 *
 * Swapping providers is a config change (which `ImageProvider` instance
 * `AssetCache.getOrGenerate` is called with), never a code change to the
 * pipeline, cache, or callers.
 */
export interface ImageProvider {
  generate(request: ArtRequest, style: StyleBible): Promise<RawImage>;
}

/**
 * Build the art request for a recurring character (Phase 6).
 *
 * Deliberately a pure function of the character's frozen `appearance`: the
 * asset cache keys on the request, so as long as the registry entry does not
 * change, the same character resolves to byte-identical art every time they
 * walk on screen. Passing anything volatile here (mood of the scene, what
 * they are doing today) would silently repaint them.
 */
export function characterArtRequest(character: {
  name: string;
  appearance: string;
}): { kind: "portrait"; subject: string; mood: string; sizeClass: "medium" } {
  return {
    kind: "portrait",
    subject: `${character.name}: ${character.appearance}`,
    // Constant on purpose — see above.
    mood: "neutral, canonical reference",
    sizeClass: "medium",
  };
}
