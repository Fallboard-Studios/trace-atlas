// ========================================
// IMPORTS
// ========================================
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../stores/attenuationStyleStore';
import { useLocaleStore } from '../stores/localeStore';
import { useUIStore } from '../stores/uiStore';
import { useAudioStore } from '../stores/audioStore';
import { placeFactories, recolorFactoriesForAttenuationStyle } from './factoryPlacementSystem';
import { spawnInitialRoster, spawnInitialCompanies } from './spawnSystem';
import { startRobotLifecycle, stopRobotLifecycle, assignJob } from './robotSystems';
import { startAudioSwells, stopAudioSwells } from './audioSwells';
import { DockingState } from '../types/Robot';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { DAY_DURATION_MS } from '../constants/time';
import type { AttenuationStyle } from '../types/attenuationStyle';
import type { Locale } from '../types/locale';
import { generateUUID } from '../utils/randomId';

// ========================================
// TYPES
// ========================================

export interface RetransmitInput {
  /** Present only if the user edited the Attenuation Style name field. */
  attenuationStyleName?: string;
  /** Present only if the user edited the X/Y fields (already rounded to
   *  integers by CoordsInput). */
  coordinates?: { x: number; y: number };
}

// ========================================
// CONSTRUCTION HELPERS
// ========================================

/** Construct a fresh AttenuationStyle. No dayStartTimestamp/size/currentHour anymore —
 *  dayStartTimestamp moved to Locale (buildLocale below), the rest were
 *  deleted outright. See docs/specs/ATTENUATION_STYLE.md §1.1. */
function buildAttenuationStyle(name: string): AttenuationStyle {
  return {
    id: generateUUID(),
    name,
    locales: [],
  };
}

/** Construct a fresh, empty Locale at the given coordinates — robots/actors
 *  populate via initializeLocale, not here. dayStartTimestamp is computed
 *  here, once, directly from x — no seed, no shared clock. This is the ONLY
 *  place a fresh dayStartTimestamp gets produced; retransmitAttenuationStyleOnly
 *  deliberately never calls this for its preserved locale (the inversion
 *  this phase's spec flags as easiest to get backwards — see
 *  docs/specs/ATTENUATION_STYLE.md §1.1/§3). */
function buildLocale(attenuationStyleId: string, coordinates: { x: number; y: number }): Locale {
  return {
    id: generateUUID(),
    attenuationStyleId,
    name: `Plot ${coordinates.x}, ${coordinates.y}`,
    coordinates,
    dayStartTimestamp: Date.now() - (Math.abs(coordinates.x % 24) / 24) * DAY_DURATION_MS,
    robots: [],
    actors: [],
    companies: [],
    currentMeasure: 0,
  };
}

// ========================================
// EXPORTS
// ========================================

/**
 * Bring a locale online: guarded factory placement + fixed 12-robot roster +
 * robot-lifecycle restart + Audio Swells restart. Idempotent on
 * factories/robots — safe to call on an already-populated locale (matches
 * the double-spawn guard OceanScene's own mount effect already had for
 * factories; extended here to robots too) — but always restarts both
 * lifecycle ticks, since `startRobotLifecycle`'s/`startAudioSwells`'s own
 * module-singleton guards mean a caller switching locales must stop the old
 * tick before starting the new one regardless of whether robots/actors
 * needed regenerating; `stopAudioSwells` also clears any in-flight swells
 * from the prior locale, so none survive into the new one. This is also
 * what makes a power cycle work: BeatClock resets (and silently drops every
 * `subscribeToMeasure` listener) whenever `AudioEngine.killAll()` runs, so
 * the unconditional stop+start pairs below are what re-subscribe the ticks,
 * not just what handles a locale swap.
 *
 * Job assignment for the roster's initially-Active robots happens here, not
 * inside `spawnInitialRoster` itself — see
 * docs/specs/ROBOT_SYSTEMS_ENGINE.md's Architecture Decisions on avoiding an
 * import cycle between spawnSystem.ts and robotSystems.ts.
 *
 * Shared by OceanScene's mount effect and worldTransition so "what does
 * bringing a locale online mean" has exactly one implementation. A future
 * caller passing a partially-populated locale will skip the setup it thinks
 * is already done — pass a genuinely empty locale if you want it to run.
 */
export function initializeLocale(localeId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;

  if (locale.actors.length === 0) placeFactories(localeId);
  if (locale.robots.length === 0) {
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId); // Roadmap Phase 10 — same guard as the roster it depends on
    const freshRobots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
    freshRobots
      .filter((r) => r.docking === DockingState.Active)
      .forEach((r) => assignJob(localeId, r.id));
  }

  stopRobotLifecycle();
  startRobotLifecycle(localeId);
  stopAudioSwells();
  startAudioSwells(localeId);
}

/**
 * The four things a retransmit can mean, resolved once up front rather than
 * re-derived via scattered `if`s through the function body. Each variant
 * carries exactly the fields its branch needs — no non-null assertions
 * needed at the dispatch site, only inside this one resolution function
 * where the exhaustiveness is actually being established.
 */
type RetransmitAction =
  | { mode: 'noop' }
  | { mode: 'coordsOnly'; coordinates: { x: number; y: number } }
  | { mode: 'attenuationStyleOnly'; attenuationStyleName: string }
  | { mode: 'both'; attenuationStyleName: string; coordinates: { x: number; y: number } };

function resolveRetransmitAction(input: RetransmitInput): RetransmitAction {
  const { attenuationStyleName, coordinates } = input;
  if (!attenuationStyleName && !coordinates) return { mode: 'noop' };
  if (coordinates && !attenuationStyleName) return { mode: 'coordsOnly', coordinates };
  if (attenuationStyleName && !coordinates) return { mode: 'attenuationStyleOnly', attenuationStyleName };
  return { mode: 'both', attenuationStyleName: attenuationStyleName!, coordinates: coordinates! };
}

/** Coordinates changed, Attenuation Style preserved: never touch
 *  currentAttenuationStyleId, so audioStore's AS-sync subscription never
 *  fires — any Audio Rig/LFO edits on the current Attenuation Style survive
 *  untouched, with no new code needed. */
function retransmitCoordsOnly(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, coordinates: { x: number; y: number }): void {
  const newLocale = buildLocale(oldAttenuationStyle.id, coordinates);
  useLocaleStore.getState().addLocale(oldAttenuationStyle.id, newLocale);
  initializeLocale(newLocale.id);
  useAttenuationStyleStore.getState().setCurrentLocale(oldAttenuationStyle.id, newLocale.id);
  // Reseed the AUDIO bpm from the new locale's own coordinates, discarding
  // whatever the operator had manually dialed in — docs/specs/BPM_CONTROL.md
  // §1.3. Deliberately NOT called from retransmitAttenuationStyleOnly, which
  // preserves the existing locale untouched.
  useAudioStore.getState().regenerateBpmFromSeed(newLocale.id, coordinates);
  if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);
}

/** Build a new AttenuationStyle and switch the store to it (add only — the
 *  caller finalizes with finalizeAttenuationStyleTransition once its own
 *  branch-specific work is done). Shared by the two modes that create a new
 *  Attenuation Style. */
function createNewAttenuationStyle(attenuationStyleName: string): AttenuationStyle {
  const newAttenuationStyle = buildAttenuationStyle(attenuationStyleName);
  useAttenuationStyleStore.getState().addAttenuationStyle(newAttenuationStyle);
  return newAttenuationStyle;
}

/** Switch currentAttenuationStyleId to the new Attenuation Style and discard
 *  the old one. Shared tail step for both Attenuation-Style-creating modes. */
function finalizeAttenuationStyleTransition(newAttenuationStyle: AttenuationStyle, oldAttenuationStyle: AttenuationStyle): void {
  // Triggers audioStore's existing useAttenuationStyleStore.subscribe —
  // reseeds globalAudio/globalLfo from the new Attenuation Style's own seed.
  // Do not call regenerateGlobalAudioFromSeed/regenerateGlobalLfoFromSeed
  // directly here.
  useAttenuationStyleStore.getState().setCurrentAttenuationStyleId(newAttenuationStyle.id);
  useAttenuationStyleStore.getState().removeAttenuationStyle(oldAttenuationStyle.id);
}

/** Attenuation Style changed, coordinates preserved: re-parent the EXISTING
 *  locale onto the new Attenuation Style unchanged — same
 *  robots/actors/edits/dayStartTimestamp, no regeneration. Locale Seed
 *  Decoupling is what makes this correct: the locale's generated content is
 *  a pure function of (x, y), independent of which Attenuation Style owns
 *  it, so there is genuinely nothing to regenerate. dayStartTimestamp is NOT
 *  recalculated here — inverted from the old Attenuation-Style-owned-time
 *  behavior, see docs/specs/ATTENUATION_STYLE.md §1.1. Factory colors DO
 *  change — recolorFactoriesForAttenuationStyle is new coupling, not a
 *  preservation exception; see §1.2. */
function retransmitAttenuationStyleOnly(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, attenuationStyleName: string): void {
  const newAttenuationStyle = createNewAttenuationStyle(attenuationStyleName);
  let preservedCoords: { x: number; y: number } | undefined;

  if (oldLocaleId) {
    preservedCoords = useLocaleStore.getState().getLocaleById(oldLocaleId)?.coordinates;
    // Partial patch — only touches attenuationStyleId, can't touch
    // dayStartTimestamp even indirectly, since it isn't mentioned.
    useLocaleStore.getState().setLocaleData(oldLocaleId, { attenuationStyleId: newAttenuationStyle.id });
    useAttenuationStyleStore.getState().setCurrentLocale(newAttenuationStyle.id, oldLocaleId);
    recolorFactoriesForAttenuationStyle(oldLocaleId, newAttenuationStyle.id, newAttenuationStyle.name);
  }

  // finalizeAttenuationStyleTransition's removeAttenuationStyle(oldAttenuationStyle)
  // evicts noise maps for every locale oldAttenuationStyle.locales still lists
  // as its own — this preserved locale included, since nothing here (or in
  // addAttenuationStyle) ever updates that array. Re-warm AFTER that call
  // (order matters — re-warming first would just get evicted again by
  // removeAttenuationStyle) so AudioEngine's non-throwing tryGetLocaleNoiseMap
  // lookup never sees a gap, rather than relying on the next scheduled spawn
  // tick to rebuild it.
  finalizeAttenuationStyleTransition(newAttenuationStyle, oldAttenuationStyle);
  if (oldLocaleId && preservedCoords) getLocaleNoiseMap(oldLocaleId, preservedCoords.x, preservedCoords.y);
}

/** Both changed: full reset, nothing eligible for preservation. */
function retransmitBoth(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, attenuationStyleName: string, coordinates: { x: number; y: number }): void {
  const newAttenuationStyle = createNewAttenuationStyle(attenuationStyleName);

  const newLocale = buildLocale(newAttenuationStyle.id, coordinates);
  useLocaleStore.getState().addLocale(newAttenuationStyle.id, newLocale);
  initializeLocale(newLocale.id);
  useAttenuationStyleStore.getState().setCurrentLocale(newAttenuationStyle.id, newLocale.id);
  // Reseed the AUDIO bpm from the new locale's own coordinates — docs/specs/
  // BPM_CONTROL.md §1.3, same as retransmitCoordsOnly above.
  useAudioStore.getState().regenerateBpmFromSeed(newLocale.id, coordinates);
  if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);

  finalizeAttenuationStyleTransition(newAttenuationStyle, oldAttenuationStyle);
}

/**
 * The Sector Settings retransmit action — four branches, per
 * docs/specs/SECTOR_SETTINGS.md §1's preservation rules. `input`'s two
 * fields are each present only if the user actually edited that panel;
 * absence means "preserve as-is," not "reset to default."
 */
export function retransmitWorld(input: RetransmitInput): void {
  const action = resolveRetransmitAction(input);
  if (action.mode === 'noop') return;

  useUIStore.getState().selectRobot(null);
  // Companies are regenerated with fresh ids on a reseed — a selected company's id would dangle.
  useUIStore.getState().selectAllRobots();
  const oldAttenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!oldAttenuationStyle) return;
  const oldLocaleId = oldAttenuationStyle.currentLocaleId;

  switch (action.mode) {
    case 'coordsOnly':
      retransmitCoordsOnly(oldAttenuationStyle, oldLocaleId, action.coordinates);
      break;
    case 'attenuationStyleOnly':
      retransmitAttenuationStyleOnly(oldAttenuationStyle, oldLocaleId, action.attenuationStyleName);
      break;
    case 'both':
      retransmitBoth(oldAttenuationStyle, oldLocaleId, action.attenuationStyleName, action.coordinates);
      break;
  }
}
