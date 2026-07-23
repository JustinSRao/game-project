import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ArtRequest, StyleBible } from "@howeverfar/schema";
import { createImage, encodePng, getPixel, setPixel } from "@howeverfar/art";
import { readCostLedger } from "../src/costs.js";
import {
  buildImagePrompt,
  GptImageProvider,
  ImageGenerationError,
  type ImagesApi,
} from "../src/imageProvider.js";

let home: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "howeverfar-image-test-"));
  process.env["HOWEVERFAR_HOME"] = home;
});
afterAll(() => {
  delete process.env["HOWEVERFAR_HOME"];
  rmSync(home, { recursive: true, force: true });
});

const style: StyleBible = {
  paletteName: "her-world-draft",
  colors: ["#1a1c2c", "#b13e53", "#ffcd75", "#f4f4f4"],
  gridSize: 32,
  outline: "selective",
  perspective: "top-down 3/4 view",
  keywords: ["fantasy", "vivid"],
};

const request: ArtRequest = {
  kind: "sprite",
  subject: "a shrine bell wrapped in ribbon",
  mood: "quiet, expectant",
  sizeClass: "medium",
};

const MAGENTA = { r: 0xff, g: 0x00, b: 0xff, a: 255 };
const SUBJECT = { r: 0xb1, g: 0x3e, b: 0x53, a: 255 };

/** A 5x5 magenta field with a 3x3 subject block — what the prompt asks the model for. */
function fakeModelPng(): string {
  const img = createImage(5, 5);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      setPixel(img, x, y, x >= 1 && x <= 3 && y >= 1 && y <= 3 ? SUBJECT : MAGENTA);
    }
  }
  return Buffer.from(encodePng(img)).toString("base64");
}

function fakeImages(overrides: Partial<Awaited<ReturnType<ImagesApi["generate"]>>> = {}): {
  api: ImagesApi;
  calls: Parameters<ImagesApi["generate"]>[0][];
} {
  const calls: Parameters<ImagesApi["generate"]>[0][] = [];
  return {
    calls,
    api: {
      generate(params) {
        calls.push(params);
        return Promise.resolve({
          data: [{ b64_json: fakeModelPng() }],
          usage: { input_tokens: 120, output_tokens: 0 },
          ...overrides,
        });
      },
    },
  };
}

describe("buildImagePrompt", () => {
  it("is deterministic for the same request + style", () => {
    expect(buildImagePrompt(request, style)).toBe(buildImagePrompt(request, style));
  });

  it("carries subject, mood, perspective and the locked palette", () => {
    const prompt = buildImagePrompt(request, style);
    expect(prompt).toContain("a shrine bell wrapped in ribbon");
    expect(prompt).toContain("quiet, expectant");
    expect(prompt).toContain("top-down 3/4 view");
    expect(prompt).toContain("#ffcd75");
  });

  it("asks for an isolated subject on a keyable background for sprites, not for scenes", () => {
    expect(buildImagePrompt(request, style)).toContain("flat uniform pure magenta");
    const scene = buildImagePrompt({ ...request, kind: "background" }, style);
    expect(scene).not.toContain("isolated subject");
  });
});

describe("GptImageProvider", () => {
  it("returns the model's pixels with the flat background keyed out", async () => {
    const { api, calls } = fakeImages();
    const img = await new GptImageProvider(api, "gpt-image-2").generate(request, style);
    expect(calls[0]?.model).toBe("gpt-image-2");
    expect(calls[0]?.n).toBe(1);
    expect(getPixel(img, 0, 0).a).toBe(0); // background gone
    expect(getPixel(img, 2, 2)).toEqual(SUBJECT); // subject intact
  });

  it("leaves backgrounds unkeyed (a scene fills its frame)", async () => {
    const { api } = fakeImages();
    const img = await new GptImageProvider(api, "gpt-image-2").generate(
      { ...request, kind: "background" },
      style,
    );
    expect(getPixel(img, 0, 0)).toEqual(MAGENTA);
  });

  it("does not post-process — no palette quantization, no grid resize", async () => {
    const { api } = fakeImages();
    const img = await new GptImageProvider(api, "gpt-image-2").generate(request, style);
    // 5x5 in, 5x5 out: processArt (which would force gridSize 32) is the
    // caller's job, applied uniformly to every provider.
    expect(img.width).toBe(5);
    expect(img.height).toBe(5);
    // SUBJECT is not in the style palette, and it survives untouched.
    expect(style.colors).not.toContain("#b13e53".toUpperCase());
    expect(getPixel(img, 2, 2)).toEqual(SUBJECT);
  });

  it("records every call in the cost ledger (ADR-0018)", async () => {
    const before = readCostLedger().length;
    const { api } = fakeImages();
    await new GptImageProvider(api, "gpt-image-2").generate(request, style);
    const entries = readCostLedger();
    expect(entries).toHaveLength(before + 1);
    const last = entries[entries.length - 1];
    expect(last?.kind).toBe("image");
    expect(last?.model).toBe("gpt-image-2");
    expect(last?.images).toBe(1);
    expect(last?.costUsd).toBeGreaterThan(0);
  });

  it("records the call even when the model returns nothing usable", async () => {
    const before = readCostLedger().length;
    const { api } = fakeImages({ data: [] });
    await expect(
      new GptImageProvider(api, "gpt-image-2").generate(request, style),
    ).rejects.toBeInstanceOf(ImageGenerationError);
    expect(readCostLedger()).toHaveLength(before + 1);
  });
});
