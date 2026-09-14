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
