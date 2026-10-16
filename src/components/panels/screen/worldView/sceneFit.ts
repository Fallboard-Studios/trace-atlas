import { WORLD_BOUNDS } from '@/constants/sceneDepth';

// ========================================
// SCENE FIT
// docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.1 (roadmap Phase 53, Task 5)
// ========================================

/** The one CSS scale-and-offset that fits the stage into the scene box. */
export interface StageFit {
  scale: number;
  x: number;
  y: number;
}

/**
 * `preserveAspectRatio="xMidYMax slice"` as arithmetic: scale by whichever of the two axis ratios
 * is larger (so the box is covered, never letterboxed), centre horizontally, pin the stage's
 * bottom to the box's bottom. A box wider than 16:9 therefore loses the top of the world, never
 * the ground. Pure; a 0 x 0 box returns scale 0 — `useStageFit` decides to skip it, not this.
 */
export function sceneFit(
  box: { width: number; height: number },
  stage: { width: number; height: number } = WORLD_BOUNDS
): StageFit {
  const scale = Math.max(box.width / stage.width, box.height / stage.height);
  return {
    scale,
    x: (box.width - stage.width * scale) / 2,
    y: box.height - stage.height * scale,
  };
}
