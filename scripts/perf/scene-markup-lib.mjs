/**
 * Pure helpers for `npm run perf:idle` (scripts/perf/idle-paint.mjs) — how the harness finds the
 * scene's parts in the page. The harness is run against the branch under test and against a `main`
 * build in one session (the A/B method in docs/PERFORMANCE.md), so every selector here reads both
 * markups: the stage's `data-scene-slot` / `.ocean-scene__sheet` (roadmap Phase 53) and the
 * `data-scene-layer` / `.ocean-scene__layer` the scene had before it. Node built-ins only; no I/O.
 * Unit-tested in scene-markup-lib.test.mjs; the Chrome/CDP plumbing lives in idle-paint.mjs.
 */

// ========================================
// SLOTS
// ========================================

/**
 * The scene's stack, back to front, as `data-scene-slot` names it — sceneStack.ts's `SCENE_SLOTS`
 * (the test checks they agree). A slot the build under test does not have reads "absent": `stations`
 * and `dissolve` are new, and the sheets before them were called layers.
 */
export const SCENE_SLOT_NAMES = [
  'back',
  'robots-back',
  'mid',
  'bubbles',
  'stations',
  'robots',
  'dissolve',
  'front',
  'marker',
];

/**
 * Every node of one slot, in either markup. Sheets and (from the movers task on) movers wear the
 * same attribute, so a slot can name many nodes; callers count across all of them.
 */
export const sceneSlotSelector = (name) => `[data-scene-slot="${name}"], [data-scene-layer="${name}"]`;

/** The scene's sheets (the full-size `<svg>`s), in either markup — not the stage, and not a mover. */
export const SHEET_SELECTOR = '.ocean-scene__sheet, .ocean-scene__layer';

/**
 * The bubble circles: in their own sheet since the 17.2.5 layer split, and inside the factory
 * groups before it (so one name ablates both builds).
 */
export const BUBBLE_CIRCLES = [
  'svg[data-scene-slot="bubbles"] circle',
  'svg[data-scene-layer="bubbles"] circle',
  '#factory-background-layer circle',
  '#factory-midground-layer circle',
  '#factory-foreground-layer circle',
].join(', ');

// ========================================
// CDP
// ========================================

/**
 * Whether a node is a mover (the small per-mover wrapper of roadmap Phase 53, class `mover`) rather
 * than a sheet, from the same flat attribute list. Reads whole class tokens; a build without movers
 * has none, so the harness's mover line reads 0 there.
 * @param {string[] | undefined} attributes
 * @returns {boolean}
 */
export function isMoverNode(attributes) {
  for (let i = 0; i + 1 < (attributes?.length ?? 0); i += 2) {
    if (attributes[i] === 'class') return attributes[i + 1].split(/\s+/).includes('mover');
  }
  return false;
}

/**
 * A node's slot name from the flat `[name, value, name, value, …]` attribute list `DOM.describeNode`
 * returns, or null if it is not one of the scene's slots. The slot attribute wins over the old
 * layer attribute; names match exactly.
 * @param {string[] | undefined} attributes
 * @returns {string | null}
 */
export function slotNameOf(attributes) {
  let layer = null;
  for (let i = 0; i + 1 < (attributes?.length ?? 0); i += 2) {
    if (attributes[i] === 'data-scene-slot') return attributes[i + 1];
    if (attributes[i] === 'data-scene-layer') layer = attributes[i + 1];
  }
  return layer;
}
