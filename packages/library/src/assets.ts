import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { AssetRecord, type AssetHash, type AssetKind, type AssetSource, type StoryPath } from "@howeverfar/schema";
import { storeRoot } from "./store.js";

/**
 * The asset database (ADR-0011, Phase 5): content-addressed blob storage plus
 * a queryable catalog, in the same deliberately boring file-per-record shape
 * as the rest of persistence (ADR-0007). Layout under the DB root:
 *
 *   blobs/<sha256>.png     gated PNG bytes, named by their own hash
 *   catalog/<id>.json      one validated AssetRecord per asset
 *
 * The default root lives under HOWEVERFAR_HOME; every function takes an
 * explicit root override so the Studio CLI can operate a repo-checked-in DB
 * with --db. Only gate-passed PNGs belong here — the Asset Studio is the
 * sole writer (CLAUDE.md invariant 8).
 */

export function assetDbRoot(): string {
  return join(storeRoot(), "assets");
}

function blobsDir(root: string): string {
  const d = join(root, "blobs");
  mkdirSync(d, { recursive: true });
  return d;
}

function catalogDir(root: string): string {
  const d = join(root, "catalog");
  mkdirSync(d, { recursive: true });
  return d;
}

export function sha256OfBytes(bytes: Uint8Array): AssetHash {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Write PNG bytes as a blob, returning their content hash. Idempotent. */
export function putBlob(bytes: Uint8Array, root = assetDbRoot()): AssetHash {
  const hash = sha256OfBytes(bytes);
  const file = join(blobsDir(root), `${hash}.png`);
  if (!existsSync(file)) writeFileSync(file, bytes);
  return hash;
}

export function readBlob(hash: AssetHash, root = assetDbRoot()): Uint8Array {
  return new Uint8Array(readFileSync(join(blobsDir(root), `${hash}.png`)));
}

export function getAssetRecord(id: AssetHash, root = assetDbRoot()): AssetRecord {
  return AssetRecord.parse(
    JSON.parse(readFileSync(join(catalogDir(root), `${id}.json`), "utf8")),
  );
}

export interface AssetQuery {
  kind?: AssetKind;
  path?: StoryPath;
  /** Matches assets carrying this tag (exact string). */
  tag?: string;
  name?: string;
  sourceType?: AssetSource["type"];
}

export function listAssets(query: AssetQuery = {}, root = assetDbRoot()): AssetRecord[] {
  const out: AssetRecord[] = [];
  for (const f of readdirSync(catalogDir(root))) {
    if (!f.endsWith(".json")) continue;
    let record: AssetRecord;
    try {
      record = AssetRecord.parse(
        JSON.parse(readFileSync(join(catalogDir(root), f), "utf8")),
      );
    } catch {
      continue; // an unreadable record never breaks the catalog
    }
    if (query.kind && record.kind !== query.kind) continue;
    if (query.path && record.path !== query.path) continue;
    if (query.tag && !record.tags.includes(query.tag)) continue;
    if (query.name && record.name !== query.name) continue;
    if (query.sourceType && record.source.type !== query.sourceType) continue;
    out.push(record);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export interface PutAssetInput {
  name: AssetRecord["name"];
  kind: AssetKind;
  path: StoryPath;
  styleName: string;
  tags: readonly string[];
  /** Gated PNG bytes, one per frame, in playback order. */
  frames: readonly Uint8Array[];
  frameMs?: number;
  source: AssetSource;
  /** Replace an existing same-name asset instead of refusing. */
  replace?: boolean;
}

export class DuplicateAssetError extends Error {
  constructor(readonly existing: AssetRecord) {
    super(
      `asset "${existing.name}" (${existing.kind}, ${existing.path}) already exists with id ${existing.id.slice(0, 12)}… — pick another name or pass replace`,
    );
    this.name = "DuplicateAssetError";
  }
}

/**
 * Store a gated asset: blobs for every frame, then a validated catalog
 * record identified by the first frame's hash. `name` is unique per
 * (path, kind); re-putting identical content is a no-op, a same-name
 * different-content put throws unless `replace` is set.
 */
export function putAsset(
  input: PutAssetInput,
  root = assetDbRoot(),
): { record: AssetRecord; replaced: boolean } {
  const first = input.frames[0];
  if (!first) throw new Error("putAsset needs at least one frame");
  const { width, height } = pngSize(first);

  const id = sha256OfBytes(first);
  const clash = listAssets(
    { name: input.name, kind: input.kind, path: input.path },
    root,
  ).find((r) => r.id !== id);
  if (clash && !input.replace) throw new DuplicateAssetError(clash);

  const frames = input.frames.map((bytes) => putBlob(bytes, root));
  const record = AssetRecord.parse({
    recordVersion: 1,
    id,
    name: input.name,
    kind: input.kind,
    path: input.path,
    styleName: input.styleName,
    width,
    height,
    tags: input.tags,
    frames,
    ...(input.frameMs !== undefined ? { frameMs: input.frameMs } : {}),
    source: input.source,
    createdAt: new Date().toISOString(),
  });

  if (clash) rmSync(join(catalogDir(root), `${clash.id}.json`), { force: true });
  writeFileSync(
    join(catalogDir(root), `${id}.json`),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  return { record, replaced: Boolean(clash) };
}

/** Width/height straight from the PNG IHDR chunk (bytes 16–23). */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    throw new Error("not a PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
