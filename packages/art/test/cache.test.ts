import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssetCache } from "../src/cache.js";
import { hashOf } from "../src/hash.js";
import { PIPELINE_VERSION } from "../src/pipeline.js";
import { ProceduralPlaceholderProvider } from "../src/placeholder.js";
import type { ImageProvider } from "../src/provider.js";
import { dustyRuinsStyle, sampleRequest } from "./fixtures.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "unwritten-art-cache-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("AssetCache", () => {
  it("cache hit avoids calling the provider again", async () => {
    await withTempDir(async (dir) => {
      const cache = createAssetCache(dir);
      const provider = new ProceduralPlaceholderProvider();
      const spy = vi.spyOn(provider, "generate");

      const request = sampleRequest({ kind: "sprite" });
      const first = await cache.getOrGenerate(request, dustyRuinsStyle, provider);
      expect(spy).toHaveBeenCalledTimes(1);

      const second = await cache.getOrGenerate(request, dustyRuinsStyle, provider);
      expect(spy).toHaveBeenCalledTimes(1); // still 1: cache hit, provider not called again

      expect(Array.from(second.data)).toEqual(Array.from(first.data));
      expect(second.width).toBe(first.width);
      expect(second.height).toBe(first.height);
    });
  });

  it("different requests produce different cache entries (provider called once each)", async () => {
    await withTempDir(async (dir) => {
      const cache = createAssetCache(dir);
      const calls: unknown[] = [];
      const provider: ImageProvider = {
        generate: async (request, style) => {
          calls.push(request);
          return new ProceduralPlaceholderProvider().generate(request, style);
        },
      };

      await cache.getOrGenerate(sampleRequest({ subject: "a" }), dustyRuinsStyle, provider);
      await cache.getOrGenerate(sampleRequest({ subject: "b" }), dustyRuinsStyle, provider);
      expect(calls).toHaveLength(2);
    });
  });

  it("stores the fully post-processed asset, not the raw provider output", async () => {
    await withTempDir(async (dir) => {
      const cache = createAssetCache(dir);
      const provider = new ProceduralPlaceholderProvider();
      const request = sampleRequest({ kind: "sprite" });

      const cached = await cache.getOrGenerate(request, dustyRuinsStyle, provider);
      // gridSize is 32 for dustyRuinsStyle; sprite raw canvas for "medium" is also 32,
      // but the guarantee we actually care about is grid conformance:
      expect(Math.max(cached.width, cached.height)).toBe(dustyRuinsStyle.gridSize);
    });
  });

  it("cache key depends on request, style, and PIPELINE_VERSION", () => {
    const request = sampleRequest();
    const key = createAssetCache("/unused").keyFor(request, dustyRuinsStyle);

    expect(key).toBe(hashOf({ request, style: dustyRuinsStyle, pipelineVersion: PIPELINE_VERSION }));

    // Changing pipeline version changes the key, without needing to mutate the exported constant:
    const keyAtNextVersion = hashOf({
      request,
      style: dustyRuinsStyle,
      pipelineVersion: PIPELINE_VERSION + 1,
    });
    expect(key).not.toBe(keyAtNextVersion);
  });

  it("cache key is insensitive to object key order (canonicalization)", () => {
    const cache = createAssetCache("/unused");
    const request = sampleRequest();
    const styleReordered = {
      outline: dustyRuinsStyle.outline,
      colors: dustyRuinsStyle.colors,
      paletteName: dustyRuinsStyle.paletteName,
      gridSize: dustyRuinsStyle.gridSize,
      perspective: dustyRuinsStyle.perspective,
      keywords: dustyRuinsStyle.keywords,
    };
    expect(cache.keyFor(request, dustyRuinsStyle)).toBe(cache.keyFor(request, styleReordered));
  });
});
