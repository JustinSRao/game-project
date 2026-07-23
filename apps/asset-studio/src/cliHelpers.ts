import type { AssetSource } from "@howeverfar/schema";

/** Turn a filename ("Moss Tile 03.png") into a catalog slug ("moss-tile-03"). */
export function slugifyName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type Flags = ReadonlyMap<string, string | true>;

export function stringFlag(flags: Flags, name: string): string | undefined {
  const v = flags.get(name);
  return typeof v === "string" ? v : undefined;
}

export function parseTags(flags: Flags): string[] {
  const raw = stringFlag(flags, "tags");
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Build the catalog source record from CLI flags. CC0 imports must carry
 * full attribution (pack/author/url/license) — refusing here is the
 * "CC0 is not no-bookkeeping" rule made mechanical.
 */
export function parseSource(flags: Flags): AssetSource | { error: string } {
  const type = stringFlag(flags, "source");
  switch (type) {
    case "cc0": {
      const pack = stringFlag(flags, "pack");
      const author = stringFlag(flags, "author");
      const url = stringFlag(flags, "url");
      const license = stringFlag(flags, "license") ?? "CC0-1.0";
      if (!pack || !author || !url) {
        return {
          error: "--source cc0 requires --pack, --author and --url (attribution is mandatory)",
        };
      }
      return { type: "cc0", pack, author, url, license };
    }
    case "sprite-data":
      return { type: "sprite-data", emittedBy: stringFlag(flags, "emitted-by") ?? "hand" };
    case "generated": {
      const model = stringFlag(flags, "model");
      if (!model) return { error: "--source generated requires --model" };
      return { type: "generated", model };
    }
    case "hand": {
      const author = stringFlag(flags, "author");
      return { type: "hand", ...(author ? { author } : {}) };
    }
    case undefined:
      return { error: "--source <cc0|sprite-data|generated|hand> is required" };
    default:
      return { error: `unknown --source "${type}"` };
  }
}
