// ========================================
// REDUCED MOTION (lifted from BubbleStream.tsx, Phase 40 Task 8)
// ========================================
// Shared `prefers-reduced-motion` check — BubbleStream and useOrbiterMotion both read it once per
// effect run (purely decorative motion is exactly what this preference asks to drop).

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
