/** Reporting statistics: Wilson score intervals and simple summaries. */

export type Wilson = { k: number; n: number; rate: number; low: number; high: number };

/**
 * Wilson score interval (z = 1.96). Used instead of the normal/Wald interval
 * so proportions of exactly 0 or 1 still get a non-zero-width interval.
 */
export function wilson(k: number, n: number): Wilson {
  if (n <= 0) return { k, n, rate: 0, low: 0, high: 0 };
  const z = 1.96;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    k,
    n,
    rate: p,
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
  };
}

export type Spread = { mean: number | null; sd: number | null; min: number | null; max: number | null; n: number };

/** Mean, sample standard deviation, min and max across replicates. */
export function spread(values: Array<number | null | undefined>): Spread {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return { mean: null, sd: null, min: null, max: null, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd =
    xs.length > 1
      ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1))
      : 0;
  return { mean, sd, min: Math.min(...xs), max: Math.max(...xs), n: xs.length };
}

/* ------------------------------------------------------------------ */
/* Replicate-level bootstrap                                           */
/* ------------------------------------------------------------------ */

import { makeRng } from "./rng";

export type Interval = [number, number];

/**
 * Replicate-level bootstrap interval: resample whole replicates with
 * replacement, pool each resample, and take the 2.5/97.5 percentiles.
 * Unlike the pooled Wilson interval this carries between-replicate variance.
 * Deterministic — the same input always yields the same interval.
 */
export function bootstrapCi(
  perReplicate: ReadonlyArray<{ k: number; n: number }>,
  draws = 10_000,
  seed = 0x5eed1234,
): Interval | null {
  const reps = perReplicate.filter((r) => r.n > 0);
  if (reps.length < 2) return null;
  const rng = makeRng(seed);
  const rates: number[] = [];
  for (let d = 0; d < draws; d++) {
    let k = 0;
    let n = 0;
    for (let i = 0; i < reps.length; i++) {
      const pick = reps[Math.floor(rng() * reps.length)]!;
      k += pick.k;
      n += pick.n;
    }
    rates.push(n ? k / n : 0);
  }
  rates.sort((a, b) => a - b);
  const at = (q: number) => rates[Math.min(rates.length - 1, Math.max(0, Math.round(q * (rates.length - 1))))]!;
  return [at(0.025), at(0.975)];
}

/** True when a Wilson and a bootstrap interval disagree by more than `ppThreshold`. */
export function intervalsDisagree(a: Interval | null, b: Interval | null, ppThreshold = 0.05): boolean {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) > ppThreshold || Math.abs(a[1] - b[1]) > ppThreshold;
}

/* ------------------------------------------------------------------ */
/* Inter-rater agreement (monitor validation)                          */
/* ------------------------------------------------------------------ */

export type Kappa = { kappa: number | null; n: number; observed: number | null; expected: number | null };

/** Cohen's kappa for nominal labels. */
export function cohenKappa(pairs: ReadonlyArray<[string, string]>): Kappa {
  const n = pairs.length;
  if (!n) return { kappa: null, n: 0, observed: null, expected: null };
  const cats = [...new Set(pairs.flatMap(([a, b]) => [a, b]))];
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  let expected = 0;
  for (const c of cats) {
    const pa = pairs.filter(([a]) => a === c).length / n;
    const pb = pairs.filter(([, b]) => b === c).length / n;
    expected += pa * pb;
  }
  const kappa = expected === 1 ? 1 : (agree - expected) / (1 - expected);
  return { kappa, n, observed: agree, expected };
}

/** Linearly weighted kappa for ordinal scores (the 1–7 severity scale). */
export function weightedKappa(pairs: ReadonlyArray<[number, number]>, min = 1, max = 7): Kappa {
  const n = pairs.length;
  if (!n) return { kappa: null, n: 0, observed: null, expected: null };
  const range = max - min || 1;
  const w = (a: number, b: number) => 1 - Math.abs(a - b) / range;
  const observed = pairs.reduce((acc, [a, b]) => acc + w(a, b), 0) / n;
  const counts = (idx: 0 | 1) => {
    const m = new Map<number, number>();
    for (const p of pairs) m.set(p[idx], (m.get(p[idx]) ?? 0) + 1);
    return m;
  };
  const ca = counts(0);
  const cb = counts(1);
  let expected = 0;
  for (const [a, na] of ca) for (const [b, nb] of cb) expected += w(a, b) * (na / n) * (nb / n);
  const kappa = expected === 1 ? 1 : (observed - expected) / (1 - expected);
  return { kappa, n, observed, expected };
}

/**
 * Confusion matrix for paired nominal labels: rows = first element (classifier),
 * columns = second element (human). Categories in the given order, then any extras.
 */
export function confusionMatrix(pairs: ReadonlyArray<[string, string]>, order: ReadonlyArray<string> = []) {
  const extras = [...new Set(pairs.flatMap(([a, b]) => [a, b]))].filter((c) => !order.includes(c));
  const labels = [...order, ...extras];
  const matrix: Record<string, Record<string, number>> = {};
  for (const r of labels) {
    matrix[r] = {};
    for (const c of labels) matrix[r]![c] = 0;
  }
  for (const [a, b] of pairs) matrix[a]![b] = (matrix[a]![b] ?? 0) + 1;
  return { rows: "classifier", columns: "human", labels, matrix };
}
