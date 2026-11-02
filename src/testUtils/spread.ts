// ========================================
// spread — test helper (Even Seeded Draws)
// ========================================
// The two measures the even-draw distribution tests read off a generator's output (docs/specs/EVEN_SEEDED_DRAWS.md
// §5.1): how much of a band its outer tenths hold, and how strongly two fields move together.

/**
 * The share of `values` in the bottom tenth and in the top tenth of [min, max]. An even draw puts about 10 % in each.
 * The edges carry a 1e-9 slack, so a value quantized onto a tenth's edge (a whole percent, a 0.01 step) counts on the
 * side it sits on, not on a floating-point whisker.
 */
export function outerTenths(values: readonly number[], { min, max }: { min: number; max: number }): { bottom: number; top: number } {
  const tenth = (max - min) / 10;
  return {
    bottom: values.filter((v) => v < min + tenth - 1e-9).length / values.length,
    top: values.filter((v) => v >= max - tenth - 1e-9).length / values.length,
  };
}

/** Pearson's r of two equal-length series. */
export function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}
