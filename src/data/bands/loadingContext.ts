// ========================================
// IMPORTS
// ========================================
import { CLASSIC } from './classic';
import { resolveBands } from './resolveBands';
import { THEMES, themeLights, type ThemeLight } from './themes';
import type { BandFor, BandKey, BandTable } from './bandKeys';
import type { LoadingIdentity } from './loadingIdentity';

// ========================================
// STATE
// ========================================

/** The table the loaded world's bands resolve from: Classic until a world installs its theme. Module state, not
 *  Zustand: it is derived from the loading store's theme, read synchronously by the generators at every draw, and never
 *  persisted. */
let current: BandTable = CLASSIC;

/** The pedals and colour nodes the installed theme lights in every world (themeLights, the lit rule): none under
 *  Classic. Installed and restored with `current`. */
let lights: ReadonlySet<ThemeLight> = new Set();

// ========================================
// FUNCTIONS
// ========================================

/** The band a generator draws from now (docs/specs/OFF_SCREEN.md assumption 15). Read at the point of the draw, never
 *  cached at module scope: the table changes per world. */
export function getBand<K extends BandKey>(key: K): BandFor<K> {
  return current[key];
}

/** Whether the installed theme lights this pedal or colour node in every world (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md
 *  T8): generateGlobalAudioSettings reads it at the lit roll, as it reads getBand at the draw. */
export function isLitByTheme(light: ThemeLight): boolean {
  return lights.has(light);
}

/**
 * Install the theme's table for the loaded world (assumption 15) - the world-change paths call it beside the loading
 * store's setLoading before anything regenerates. Only the theme is read: aspects never enter the context, they reach a
 * robot through the deal pass alone (assumptions 21-22), which passes resolveBands' result for that robot explicitly.
 */
export function setLoading(identity: LoadingIdentity): void {
  current = resolveBands(identity.theme, {});
  lights = themeLights(THEMES[identity.theme]);
}

/**
 * Install the identity's table for the duration of `fn`, then restore whatever was installed before - on a throw too.
 * How generateWorldSeedBaseline regenerates inside a saved or linked world's own bands without disturbing the loaded
 * world's (assumption 15): the generators are synchronous, so the swap is safe, and nested calls unwind in order.
 */
export function withLoading<T>(identity: LoadingIdentity, fn: () => T): T {
  const previous = current;
  const previousLights = lights;
  setLoading(identity);
  try {
    return fn();
  } finally {
    current = previous;
    lights = previousLights;
  }
}
