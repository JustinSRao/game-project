import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { StyleBible } from "@howeverfar/schema";
import {
  ProceduralPlaceholderProvider,
  characterArtRequest,
  createAssetCache,
  encodePng,
  type ImageProvider,
} from "@howeverfar/art";
import { GptImageProvider, readCostLedger } from "@howeverfar/director";
import { storeRoot } from "@howeverfar/library";

/**
 * Character portraits for the dialogue box (ADR-0011 source #3, owner-approved
 * capped gpt-image spend 2026-07-23).
 *
 * Keyed by path, not by session: a portrait depends only on WHO is speaking
 * and WHICH world's palette they live in, so it is generated once, quantized
 * to that path's locked ramp by the art pipeline, and content-hash cached on
 * disk forever. A repeat request — same character, same path — is a file read
 * and never re-runs the model.
 *
 * Spend is capped per server run: gpt-image is used until portrait spend this
 * run crosses HOWEVERFAR_PORTRAIT_BUDGET_USD (default $2), after which new
 * faces fall back to the free procedural placeholder. Set HOWEVERFAR_PORTRAITS=off
 * to never spend. The always-something-on-screen rule wins over the budget:
 * any failure or cap falls back rather than 500s.
 */

const PORTRAIT_PERSPECTIVE = "front-facing head-and-shoulders character portrait, bust framing";

/** The three path palettes (mirror apps/asset-studio/styles/*.draft.json). */
const HER_STYLE: StyleBible = {
  paletteName: "her-world-draft",
  colors: [
    "#0d0b13", "#1e1a2b", "#332f45", "#5a5570", "#f2ece4",
    "#2e1d15", "#4d2f20", "#7a4f31", "#b5854f",
    "#122b1e", "#1f4d30", "#3d7d43", "#7bb05a",
    "#3f4652", "#6b7486", "#97a1b3", "#c6cddb",
    "#3d0e1a", "#7a1228", "#b52a3a", "#e05a3c",
    "#8a5a1c", "#d9a02c", "#f5da7a",
    "#2b1240", "#54227a", "#8f3bb0", "#cf7ad4",
    "#111f3d", "#1f3f75", "#3a7cc4", "#8fd4e8",
  ],
  gridSize: 32,
  outline: "selective",
  perspective: PORTRAIT_PERSPECTIVE,
  keywords: ["anime isekai", "high fantasy", "saturated", "dramatic lighting", "ornate detail"],
};

const HIS_STYLE: StyleBible = {
  paletteName: "his-world-draft",
  colors: [
    "#0b0c10", "#1c1e24", "#3a3d45", "#6e727c", "#f0efec",
    "#26282e", "#3f434a", "#8a8d92", "#bcbfc2",
    "#3a281c", "#5e422a", "#96703f", "#d9c9a8",
    "#8a5a42", "#c08f6a", "#eac6a2",
    "#16301f", "#274d2c", "#43793c", "#7aa84e",
    "#22304f", "#3f5f8c", "#6d9ac4", "#b8d6e8",
    "#a9631f", "#e0a33f", "#f6dfa8",
    "#1a2340", "#39456b", "#8f9bb5",
    "#6e1520", "#b32b2f",
  ],
  gridSize: 32,
  outline: "selective",
  perspective: PORTRAIT_PERSPECTIVE,
  keywords: ["contemporary japan", "grounded realism", "naturalistic light", "clean lines", "lived-in detail"],
};

const REUNION_STYLE: StyleBible = {
  paletteName: "reunion-seam-draft",
  colors: [
    "#0b0c10", "#1a1d24", "#2e323b", "#4a4f5a", "#6e727c", "#b8bcc2", "#f0efec",
    "#3a281c", "#5e422a", "#96703f", "#d9c9a8",
    "#241a33", "#3d2a52", "#5b3f6e",
    "#22304f", "#3f5f8c", "#6d9ac4",
    "#54227a", "#8f3bb0", "#cf7ad4",
    "#1f4d30", "#3d7d43", "#7bb05a",
    "#8a5a1c", "#d9a02c", "#f5da7a",
    "#3a7cc4", "#8fd4e8",
    "#b52a3a", "#e05a3c",
  ],
  gridSize: 32,
  outline: "selective",
  perspective: PORTRAIT_PERSPECTIVE,
  keywords: ["two worlds meeting", "cold concrete and arcane light", "twilight seam"],
};

/** shared (prologue) is the real world, so it borrows his ramp. */
function styleForPath(path: string): StyleBible {
  if (path === "her") return HER_STYLE;
  if (path === "reunion") return REUNION_STYLE;
  return HIS_STYLE;
}

const PortraitQuery = z.object({
  path: z.enum(["her", "his", "reunion", "shared"]).default("shared"),
  name: z.string().min(1).max(80),
  appearance: z.string().min(1).max(500),
});

const CAP_USD = Number(process.env["HOWEVERFAR_PORTRAIT_BUDGET_USD"] ?? 2);
const MODE = process.env["HOWEVERFAR_PORTRAITS"] ?? "gpt";

function imageSpendUsd(): number {
  return readCostLedger()
    .filter((e) => e.kind === "image")
    .reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
}

export function registerPortraitRoutes(app: FastifyInstance): void {
  const placeholder = new ProceduralPlaceholderProvider();
  const cache = createAssetCache(join(storeRoot(), "portraits"));
  const keyAvailable = !!process.env["OPENAI_API_KEY"];
  const spendAtStart = imageSpendUsd();
  let gpt: GptImageProvider | undefined;

  const pickProvider = (): { provider: ImageProvider; isGpt: boolean } => {
    const spentThisRun = imageSpendUsd() - spendAtStart;
    if (MODE !== "off" && keyAvailable && spentThisRun < CAP_USD) {
      try {
        gpt ??= new GptImageProvider();
        return { provider: gpt, isGpt: true };
      } catch {
        // No usable key at construction — fall through to the free provider.
      }
    }
    return { provider: placeholder, isGpt: false };
  };

  app.get("/api/portrait", async (req, reply) => {
    const parsed = PortraitQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; "),
      });
    }
    const style = styleForPath(parsed.data.path);
    const request = characterArtRequest({
      name: parsed.data.name,
      appearance: parsed.data.appearance,
    });

    const serve = async (provider: ImageProvider): Promise<Buffer> => {
      const image = await cache.getOrGenerate(request, style, provider);
      return Buffer.from(encodePng(image));
    };

    const { provider, isGpt } = pickProvider();
    try {
      const png = await serve(provider);
      return reply
        .header("content-type", "image/png")
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(png);
    } catch (err) {
      // A paid provider can fail (billing, safety refusal, network). Never let
      // that be a broken portrait: fall back to the free one.
      if (isGpt) {
        try {
          const png = await serve(placeholder);
          return reply.header("content-type", "image/png").send(png);
        } catch {
          /* fall through */
        }
      }
      req.log.error(err);
      return reply.code(500).send({ error: "could not render this portrait" });
    }
  });
}
