/**
 * A tiny deterministic PRNG (mulberry32). Given the same 32-bit seed it
 * produces the exact same sequence on every platform/Node version — no
 * `Math.random()` anywhere in the art pipeline, matching the engine's
 * determinism invariant.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** True with probability `p` (default 0.5). */
  chance(p?: number): boolean;
  /** Pick a uniformly random element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
}

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;

  const nextRaw = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next: nextRaw,
    nextInt(maxExclusive: number): number {
      if (maxExclusive <= 0) throw new RangeError("maxExclusive must be > 0");
      return Math.floor(nextRaw() * maxExclusive);
    },
    chance(p = 0.5): boolean {
      return nextRaw() < p;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("cannot pick from an empty array");
      return items[Math.floor(nextRaw() * items.length)] as T;
    },
  };
}
