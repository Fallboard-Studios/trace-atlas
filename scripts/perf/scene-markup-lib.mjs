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
 * The bubble circles: in a strip mover each since Phase 53 Task 17 (`div.mover.mover--bubbles`), in
 * their own sheet since the 17.2.5 layer split, and inside the factory groups before it (so one name
 * ablates all three builds).
 */
export const BUBBLE_CIRCLES = [
  '.mover--bubbles circle',
  'svg[data-scene-slot="bubbles"] circle',
  'svg[data-scene-layer="bubbles"] circle',
  '#factory-background-layer circle',
  '#factory-midground-layer circle',
  '#factory-foreground-layer circle',
].join(', ');

// ========================================
// ROBOTS
// ========================================
// A robot is a mover in the stage since Phase 53 Task 13 (`div.mover.mover--robot`, its row in
// `data-scene-slot`); before that, a `.robot` group inside `#robot-layer` (front) or, since Phase 43 J4,
// `#robot-back-layer` (behind the midground). Each selector below reads both.

/** What the `no-robots` ablation hides: the rows' groups on the old markup, the robots' movers on the new. */
export const ROBOT_CONTAINERS = '#robot-layer, #robot-back-layer, .mover--robot';

/** Every robot, counted by its `.robot` group (a dissolve copy is not one: it holds a `<use>`, no group). */
export const ROBOT_GROUPS = '#robot-layer .robot, #robot-back-layer .robot, .mover--robot .robot';

/**
 * What the sticky detach removes. On the old markup the groups (the rows stay as the empty sheets
 * they are); on the new the movers themselves, so no empty compositor layer is left behind to flatter
 * the number.
 */
export const ROBOT_DETACH = '#robot-layer .robot, #robot-back-layer .robot, .mover--robot';

/** The elements inside the front row's robots, for the stack line's element counts. */
export const FRONT_ROBOT_ELEMENTS = '#robot-layer *, .mover--robot[data-scene-slot="robots"] *';

/** The elements inside the back row's robots. */
export const BACK_ROBOT_ELEMENTS = '#robot-back-layer *, .mover--robot[data-scene-slot="robots-back"] *';

/** The back row's robots, counted by their `.robot` group. */
export const BACK_ROBOT_GROUPS = '#robot-back-layer .robot, .mover--robot[data-scene-slot="robots-back"] .robot';

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
