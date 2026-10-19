import type { Robot } from '@/types/Robot';

// ========================================
// SCENE STACK
// docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.2 (roadmap Phase 53, Task 6)
// ========================================

/**
 * The scene's stacking order, back to front: the `data-scene-slot` of every child of the stage.
 * `OceanScene.css` gives each a `z-index` in this order. `back`, `mid`, `stations` and `front` are
 * static sheets; `robots-back`, `bubbles`, `robots`, `dissolve` and `marker` hold the movers.
 */
export const SCENE_SLOTS = [
  'back',
  'robots-back',
  'mid',
  'bubbles',
  'stations',
  'robots',
  'dissolve',
  'front',
  'marker',
] as const;

export type SceneSlot = (typeof SCENE_SLOTS)[number];

/** The slot a robot's mover sits in: the back row under the midground, every other robot above the bubbles. */
export function slotForLayer(layer?: Robot['layer']): SceneSlot {
  return layer === 'background' ? 'robots-back' : 'robots';
}
