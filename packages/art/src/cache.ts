import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArtRequest, StyleBible } from "@unwritten/schema";
import { decodePng, encodePng, type RawImage } from "./image.js";
import { hashOf } from "./hash.js";
import { PIPELINE_VERSION, processArt } from "./pipeline.js";
import type { ImageProvider } from "./provider.js";

/**
 * Content-hash asset cache (pixel-art skill: "Cache key = hash(canonicalized
 * request + style bible + pipeline version). Same character, same art,
 * forever. Bump pipeline version to invalidate globally.").
 *
 * File-backed: one PNG per cache entry, named by its hash, under a
 * caller-supplied directory (e.g. a session's asset dir, or the assets/
 * directory embedded in an exported Universe Bundle per
 * docs/ARCHITECTURE.md §5). No database, no in-memory index — the
 * filesystem *is* the index, so published bundles can ship their cache
 * directory as-is and replays are cheap and visually identical.
 */
export interface AssetCache {
  /** The hash key that `getOrGenerate` would use for this request+style, without generating anything. */
  keyFor(request: ArtRequest, style: StyleBible): string;
  /**
   * Return the cached, fully post-processed asset for (request, style),
   * generating (via `provider`) and post-processing (via `processArt`) only
   * on a cache miss. On a hit, `provider.generate` is never called.
   */
  getOrGenerate(
    request: ArtRequest,
    style: StyleBible,
    provider: ImageProvider,
  ): Promise<RawImage>;
}

export function createAssetCache(cacheDir: string): AssetCache {
  const pathFor = (key: string): string => join(cacheDir, `${key}.png`);

  const keyFor = (request: ArtRequest, style: StyleBible): string =>
    hashOf({ request, style, pipelineVersion: PIPELINE_VERSION });

  return {
    keyFor,
    async getOrGenerate(request, style, provider) {
      const key = keyFor(request, style);
      const filePath = pathFor(key);

      const cached = await tryReadPng(filePath);
      if (cached) return cached;

      const raw = await provider.generate(request, style);
      const processed = processArt(raw, style);

      await mkdir(cacheDir, { recursive: true });
      await writeFile(filePath, Buffer.from(encodePng(processed)));

      return processed;
    },
  };
}

async function tryReadPng(filePath: string): Promise<RawImage | null> {
  try {
    const bytes = await readFile(filePath);
    return decodePng(new Uint8Array(bytes));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
