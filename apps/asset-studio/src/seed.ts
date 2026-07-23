import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SpriteData, StoryPath, StyleBible } from "@howeverfar/schema";
import { encodePng, processArt, renderSpriteData } from "@howeverfar/art";
import { putAsset } from "@howeverfar/library";
import { validateAsset, type AssetKind } from "./checks.js";

/**
 * Rebuild the asset database from the sprite-as-data specs committed in
 * `sprites/` — the checked-in art is the source of truth, the database is a
 * derived artifact anyone can regenerate:
 *
 *   npm run seed -w @howeverfar/asset-studio
 *
 * Layout encodes the metadata, so a spec needs no sidecar file:
 *
 *   sprites/<path>-world/<kind>s/<name>.json
 *   e.g. sprites/his-world/tiles/sidewalk-his.json  ->  path "his", kind "tile"
 *
 * Everything goes through the same gate as any other source (ADR-0011): no
 * shortcut for our own art.
 */

const here = dirname(fileURLToPath(import.meta.url));
const spritesDir = join(here, "..", "sprites");
const stylesDir = join(here, "..", "styles");

const KIND_FOR_DIR: Record<string, AssetKind> = {
  tiles: "tile",
  sprites: "sprite",
  portraits: "portrait",
  items: "item",
};

function loadStyle(path: StoryPath): StyleBible {
  return StyleBible.parse(
    JSON.parse(readFileSync(join(stylesDir, `${path}-world.draft.json`), "utf8")),
  );
}

function directories(root: string): string[] {
  try {
    return readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory());
  } catch {
    return [];
  }
}

let stored = 0;
let failed = 0;

for (const worldDir of directories(spritesDir)) {
  const parsedPath = StoryPath.safeParse(worldDir.replace(/-world$/, ""));
  if (!parsedPath.success) {
    console.error(`skipping "${worldDir}" — expected <shared|her|his>-world`);
    continue;
  }
  const path = parsedPath.data;
  const style = loadStyle(path);

  for (const kindDir of directories(join(spritesDir, worldDir))) {
    const kind = KIND_FOR_DIR[kindDir];
    if (!kind) {
      console.error(`skipping "${worldDir}/${kindDir}" — expected one of ${Object.keys(KIND_FOR_DIR).join(", ")}`);
      continue;
    }
    const dir = join(spritesDir, worldDir, kindDir);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const spec = SpriteData.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
      const gated = processArt(renderSpriteData(spec), style);
      const findings = validateAsset(gated, style, kind);
      const errors = findings.filter((f) => f.level === "error");
      if (errors.length > 0) {
        failed++;
        console.error(`FAIL  ${worldDir}/${kindDir}/${file}`);
        for (const f of errors) console.error(`        ${f.check}: ${f.message}`);
        continue;
      }
      const { record, replaced } = putAsset({
        name: spec.name,
        kind,
        path,
        styleName: style.paletteName,
        tags: ["seed", kindDir],
        frames: [encodePng(gated)],
        source: { type: "sprite-data", emittedBy: "hand" },
        replace: true,
      });
      stored++;
      console.log(`${replaced ? "UPDATED" : "STORED "}  ${record.name} (${kind}, ${path})`);
    }
  }
}

console.log(`\n${stored} asset(s) in the database${failed > 0 ? `, ${failed} failed the gate` : ""}.`);
process.exit(failed > 0 ? 1 : 0);
