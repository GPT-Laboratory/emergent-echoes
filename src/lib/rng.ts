/** Deterministic PRNG utilities so task instances are reproducible from a seed. */

export type Rng = () => number;

/** mulberry32 — small, fast, good enough for task generation. */
export function makeRng(seed: number): Rng {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combine a parent seed with an index into a new, well-spread seed. */
export function deriveSeed(parent: number, index: number): number {
  let h = (parent >>> 0) ^ Math.imul(index + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A fresh random base seed, always recorded in the run config. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) >>> 0;
}
