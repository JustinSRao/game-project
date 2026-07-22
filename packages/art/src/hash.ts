import { createHash } from "node:crypto";

/**
 * Deterministically stringify a JSON-serializable value with object keys
 * sorted recursively. Array order is preserved (it's meaningful). This is
 * the canonicalization used everywhere a stable hash of a request/style is
 * needed: two calls with the same logical value, regardless of key
 * insertion order, must produce byte-identical output.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Hex-encoded SHA-256 of a UTF-8 string. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * SHA-256 of the canonicalized JSON of `value`. Used both for the asset
 * cache key (request + style + pipeline version) and to derive a
 * placeholder-generation seed (request + style) — same canonicalization,
 * different inputs, so unrelated concerns can never collide by accident.
 */
export function hashOf(value: unknown): string {
  return sha256Hex(canonicalStringify(value));
}

/**
 * Turn a hex digest into a 32-bit unsigned integer seed for a PRNG. Uses the
 * first 8 hex chars (32 bits) of the digest — plenty of entropy for a
 * deterministic-but-varied placeholder generator, and stable across
 * platforms/Node versions since it's pure string/integer arithmetic.
 */
export function seedFromHex(hex: string): number {
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}
