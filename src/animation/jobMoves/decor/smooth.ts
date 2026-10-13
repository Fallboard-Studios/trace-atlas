// ========================================
// smooth (docs/specs/JOB_DECORATION.md §1, the sketch's `smooth`)
// ========================================
// The easing every decoration's travel uses: 0 → 1 with a zero slope at both ends. Pure.

// ========================================
// EXPORTS
// ========================================
/** Smoothstep: `u² (3 - 2u)`. `u` is expected in [0, 1]. */
export function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}
