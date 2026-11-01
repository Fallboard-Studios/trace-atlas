// ========================================
// IMPORTS
// ========================================
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../stores/attenuationStyleStore';
import { useLocaleStore } from '../stores/localeStore';
import { useUIStore } from '../stores/uiStore';
// audioStore registers the useAttenuationStyleStore subscription that reseeds bpm/globalAudio/lfoBank/globalLfoLinks on
// a style change (finalizeAttenuationStyleTransition relies on it), so it must be loaded wherever a retransmit can run;
// a loading change under an unchanged style calls the same four regenerators and the same push itself
// (regenerateGlobalHalfFromSeed).
import { useAudioStore, pushLfoBankAndLinksToEngine } from '../stores/audioStore';
import { useLoadingStore } from '../stores/loadingStore';
import { recolorActorsForAttenuationStyle } from './factoryPlacementSystem';
import { placeDistrict } from './districts';
import { spawnInitialRoster, spawnInitialCompanies } from './spawnSystem';
import { applyAspectDeal, rederiveLoading } from './aspectDeal';
import { startRobotLifecycle, stopRobotLifecycle } from './robotSystems';
import { startWorkLoop, stopWorkLoop } from './workLoop';
import { startAudioSwells, stopAudioSwells, cancelGlobalSwellsMovedBy, cancelSwellForRobotAttribute } from './audioSwells';
import { generateGlobalAudioSettings } from '../utils/globalAudioSeed';
import { getWorldState, setWorldState } from './worldState';
import { AudioEngine } from '../engine/AudioEngine';
import { getCurrentMeasure } from '../engine/beatClock';
import { resumeWorldTimelines } from '../animation/timelineMap';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { generateRandomAttenuationStyleName, randomCoordinate } from '../utils/seedUtils';
import { mirrorWorldToUrl } from '../utils/sessionShareUtils';
import { currentWorldIdentity } from '../utils/worldIdentity';
import { deepEqual } from '../utils/math';
import { canonicalAspects, type FamilyPicks } from '../data/bands/aspects';
import type { ThemeId } from '../data/bands/themes';
import type { LoadingIdentity } from '../data/bands/loadingIdentity';
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
  /** The loading (docs/specs/OFF_SCREEN.md assumption 10; band-table T25): present when the off screen's theme row or
   *  an aspect family row picked, or when a payload carries them (applySessionPayload passes both). Read against the
   *  loading store: the loaded theme again, or an equal pick set, is no change at all. */
  theme?: ThemeId;
  aspects?: FamilyPicks;
}

// ========================================
// CONSTRUCTION HELPERS
// ========================================

/** Construct a fresh AttenuationStyle. No dayStartTimestamp/size/currentHour anymore —
 *  dayStartTimestamp moved to Locale (buildLocale below), the rest were
 *  deleted outright. See docs/specs/archive/ATTENUATION_STYLE.md §1.1. */
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
 *  docs/specs/archive/ATTENUATION_STYLE.md §1.1/§3). A locale rebuilt at its
 *  own plot hands its `dayStartTimestamp` in, so the plot keeps its hour
 *  (rebuildCurrentLocaleInPlace; docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R22). */
function buildLocale(attenuationStyleId: string, coordinates: { x: number; y: number }, dayStartTimestamp?: number): Locale {
  return {
    id: generateUUID(),
    attenuationStyleId,
    name: `Plot ${coordinates.x}, ${coordinates.y}`,
    coordinates,
    dayStartTimestamp: dayStartTimestamp ?? Date.now() - (Math.abs(coordinates.x % 24) / 24) * DAY_DURATION_MS,
    createdAtMeasure: getCurrentMeasure(),
    robots: [],
    actors: [],
    companies: [],
  };
}

// ========================================
// EXPORTS
// ========================================

/**
 * Bring a locale online: guarded factory placement + fixed 12-robot roster +
 * robot-lifecycle, work-loop and Audio Swells restarts. Idempotent on
 * factories/robots — safe to call on an already-populated locale (matches
 * the double-spawn guard OceanScene's own mount effect already had for
 * factories; extended here to robots too) — but always restarts both
 * lifecycle ticks, since `startRobotLifecycle`'s/`startAudioSwells`'s own
 * module-singleton guards mean a caller switching locales must stop the old
 * tick before starting the new one regardless of whether robots/actors
 * needed regenerating; `stopAudioSwells` also clears any in-flight swells
 * from the prior locale, so none survive into the new one. This is also
 * what lets a replaced paused world start again: BeatClock resets (and
 * silently drops every `subscribeToMeasure` listener) whenever
 * `AudioEngine.killAll()` runs, which tearDownPausedWorld (below) does, so
 * the unconditional stop+start pairs below are what re-subscribe the ticks,
 * not just what handles a locale swap. A plain power-off is a pause and
 * runs no killAll.
 *
 * Two halves (docs/specs/LAYOUT_REWORK.md §1.9). The BUILD half (district,
 * roster, companies) always runs. The START half (startLocaleSystems below)
 * runs only when `startSystems` is true, the default: a world built while the
 * tablet is off is a still frame (no lifecycle tick, no work loop, no swells)
 * until powerController.powerOnSequence() calls startLocaleSystems for it.
 * A powered-off boot or retransmit passes `startSystems: false`.
 *
 * No job is assigned here: the work loop (restarted below, like the ticks)
 * picks each robot's first job at its first site (Phase 43, spec §1.1).
 *
 * Shared by OceanScene's mount effect and worldTransition so "what does
 * bringing a locale online mean" has exactly one implementation. A future
 * caller passing a partially-populated locale will skip the setup it thinks
 * is already done — pass a genuinely empty locale if you want it to run.
 */
export function initializeLocale(localeId: string, { startSystems = true }: { startSystems?: boolean } = {}): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;

  if (locale.actors.length === 0) placeDistrict(localeId);
  if (locale.robots.length === 0) {
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId); // Roadmap Phase 10 — same guard as the roster it depends on
    // The deal (docs/specs/OFF_SCREEN.md assumption 22; band-table T27): the loaded picks dealt over the companies just
    // formed, each dealt robot's Melody fields re-derived under its aspect's bands. A no-op with nothing picked.
    applyAspectDeal(localeId);
  }

  // The world's run state follows this call (docs/specs/OFF_SCREEN.md assumption 5, docs/tasks/OFF_SCREEN.md Task 8):
  // systems held — a fresh page's still frame, or a world rebuilt by a pick while the tablet is off — is a cold world
  // the next flip starts; systems started (below) is a running one. The Attenuation-Style-only, the theme-only and the
  // aspects-only retransmits never reach here, rebuild nothing, and leave the state as they found it.
  if (startSystems) startLocaleSystems(localeId);
  else setWorldState('cold');
}

/**
 * The START half of bringing a locale online: the robot-lifecycle tick, the
 * work loop and the Audio Swells tick, each as an unconditional stop+start
 * pair so a repeat call (a second power-on, a retransmit) never double-starts
 * and BeatClock's post-killAll empty listener table is re-subscribed. Builds
 * nothing: the world and roster must already exist (the work loop reads the
 * world's sites and stations once at start). Called by initializeLocale when
 * its `startSystems` is true and by powerController.powerOnSequence() for a
 * world that was built while the tablet was off.
 */
export function startLocaleSystems(localeId: string): void {
  stopRobotLifecycle();
  startRobotLifecycle(localeId);
  // After the world and roster exist: the loop reads the world's sites and stations once at start,
  // and adopts any robot already mounted (WorldView mounts before power-on now, so it always has).
  stopWorkLoop();
  startWorkLoop(localeId);
  stopAudioSwells();
  startAudioSwells(localeId);
  setWorldState('running');
}

/**
 * The STOP half, for a paused world that a world change replaces (docs/specs/OFF_SCREEN.md §1.2,
 * docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R1): the lifecycle tick, the work loop and the swells stop, killAll
 * rewinds the transport and resets the BeatClock, and the paused span ends. Runs before the old locale is removed,
 * while it still exists, as main's power-off shutdown() did; the new world then builds held and initializeLocale
 * leaves it cold. The lifecycle stops before killAll because killAll's resetBeatClock silently drops every measure
 * listener (startLocaleSystems' own comment). killAll also clears the engine's `initialized`, so the next power-on is
 * a full start: the transport and the BeatClock from 0, every voice re-registered, every global link relinked from
 * the store. Ending the span lets the new world's timelines play behind the veil, as a fresh page's cold world's do.
 */
function tearDownPausedWorld(): void {
  stopRobotLifecycle();
  stopWorkLoop();
  stopAudioSwells();
  AudioEngine.killAll();
  resumeWorldTimelines();
}

/**
 * The six things a retransmit can mean, resolved once up front rather than
 * re-derived via scattered `if`s through the function body. Each variant
 * carries exactly the fields its branch needs — no non-null assertions
 * needed at the dispatch site, only inside this one resolution function
 * where the exhaustiveness is actually being established. `loading` is the
 * canonical loading to install when the input changes it (band-table T25,
 * docs/specs/OFF_SCREEN.md assumption 10); on its own it is the loadingOnly mode, or the aspectsOnly one when the
 * theme stays (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33). Neither rebuilds: the aspectsOnly mode re-deals in place,
 * the loadingOnly one re-derives in place (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7).
 */
type RetransmitAction =
  | { mode: 'noop' }
  | { mode: 'aspectsOnly'; loading: LoadingIdentity }
  | { mode: 'loadingOnly'; loading: LoadingIdentity }
  | { mode: 'coordsOnly'; coordinates: { x: number; y: number }; loading?: LoadingIdentity }
  | { mode: 'attenuationStyleOnly'; attenuationStyleName: string; loading?: LoadingIdentity }
  | { mode: 'both'; attenuationStyleName: string; coordinates: { x: number; y: number }; loading?: LoadingIdentity };

/** The loading an input asks for, canonical, when it differs from the loaded world's; undefined when the input names
 *  none, or names what is already loaded (the loaded theme again and an equal pick set are no change at all). */
function resolveLoadingChange(input: RetransmitInput): LoadingIdentity | undefined {
  if (input.theme === undefined && input.aspects === undefined) return undefined;
  const current = useLoadingStore.getState();
  const next: LoadingIdentity = {
    theme: input.theme ?? current.theme,
    aspects: canonicalAspects(input.aspects ?? current.aspects),
  };
  return next.theme === current.theme && deepEqual(next.aspects, current.aspects) ? undefined : next;
}

function resolveRetransmitAction(input: RetransmitInput): RetransmitAction {
  const { attenuationStyleName, coordinates } = input;
  const loading = resolveLoadingChange(input);
  if (!attenuationStyleName && !coordinates) {
    if (!loading) return { mode: 'noop' };
    // Picks alone are robot-side (spec §3) and re-deal in place; a theme moves the global half and every robot's theme
    // bands but nothing physical, so it re-derives both in place, picks riding on it or not (final fixes F7).
    return loading.theme === useLoadingStore.getState().theme ? { mode: 'aspectsOnly', loading } : { mode: 'loadingOnly', loading };
  }
  if (coordinates && !attenuationStyleName) return { mode: 'coordsOnly', coordinates, loading };
  if (attenuationStyleName && !coordinates) return { mode: 'attenuationStyleOnly', attenuationStyleName, loading };
  return { mode: 'both', attenuationStyleName: attenuationStyleName!, coordinates: coordinates!, loading };
}

/** Whether `input` changes the world at all: false for exactly the inputs retransmitWorld treats as a no-op (nothing
 *  named, an emptied name, the loaded theme again, an equal pick set). Asks only - it writes nothing. A caller that must
 *  know before asking for a world change, as Foundry's Retransmit does to raise no wash over a no-op
 *  (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R16), reads the rule here instead of keeping a copy. */
export function retransmitChangesWorld(input: RetransmitInput): boolean {
  return resolveRetransmitAction(input).mode !== 'noop';
}

/** Whether an action rebuilds the loaded locale: every mode but three. The aspects-only one re-deals the live roster in
 *  place, the loading-only one (a theme, picks riding on it or not) re-derives it in place
 *  (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7), and the Attenuation-Style-only one re-parents the locale untouched unless
 *  a loading change rides on it. */
function rebuildsLocale(action: Exclude<RetransmitAction, { mode: 'noop' }>): boolean {
  if (action.mode === 'aspectsOnly' || action.mode === 'loadingOnly') return false;
  return action.mode !== 'attenuationStyleOnly' || action.loading !== undefined;
}

/** Coordinates changed, Attenuation Style preserved: never touch
 *  currentAttenuationStyleId, so audioStore's AS-sync subscription never
 *  fires — any Audio Rig/LFO edits on the current Attenuation Style survive
 *  untouched, with no new code needed.
 *
 *  Removes the old locale BEFORE initializing the new one — robot ids are a
 *  deterministic function of (x, y) alone (generateRobotId, keyed off the
 *  noise map), so reloading at unchanged coordinates (e.g. Session Storage's
 *  Load button on the currently-active session) regenerates robots with the
 *  EXACT SAME ids as the ones still live in the old locale. removeLocale's
 *  per-robot AudioEngine.releaseVoice(robotId) cleanup deletes by id — doing
 *  that AFTER initializeLocale's AudioEngine.reserveVoice(robotId) calls would
 *  silently delete the new, live robots' just-reserved composite voices
 *  (same id, same Map key), leaving every robot voiceless with no error,
 *  only a stream of "no composite reserved" warnings from anything that
 *  later tries to write to it (audio swells, note scheduling). Reordered
 *  2026-09-28 — see docs/todo/backlog.md for the bug this fixes. */
function retransmitCoordsOnly(
  oldAttenuationStyle: AttenuationStyle,
  oldLocaleId: string | undefined,
  coordinates: { x: number; y: number },
  dayStartTimestamp?: number,
): void {
  if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);
  const newLocale = buildLocale(oldAttenuationStyle.id, coordinates, dayStartTimestamp);
  useLocaleStore.getState().addLocale(oldAttenuationStyle.id, newLocale);
  initializeLocale(newLocale.id, { startSystems: useUIStore.getState().isPoweredOn });
  useAttenuationStyleStore.getState().setCurrentLocale(oldAttenuationStyle.id, newLocale.id);
}

/**
 * The global half from seed under the bands now installed - bpm, the Audio Rig, the LFO Bank, the global links, in the
 * style-sync subscription's order (audioStore.ts) - for a loading change under an unchanged Attenuation Style, where
 * that subscription does not fire (docs/specs/OFF_SCREEN.md assumption 10; band-table T25). The seed-once fields (ping
 * variance, the swells, humanize) carry forward, as on a style switch. It ends as the subscription does, with the new
 * bank and links pushed to a primed engine (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R2): a theme picked while the
 * tablet is paused must still reach the lanes, because a primed bank is never primed again (the next start's
 * primeLfoBank is a no-op).
 */
function regenerateGlobalHalfFromSeed(attenuationStyle: AttenuationStyle): void {
  const audio = useAudioStore.getState();
  audio.regenerateBpmFromSeed(attenuationStyle.id, attenuationStyle.name);
  audio.regenerateGlobalAudioFromSeed(attenuationStyle.id, attenuationStyle.name);
  audio.regenerateLfoBankFromSeed(attenuationStyle.id, attenuationStyle.name);
  audio.regenerateGlobalLfoLinksFromSeed(attenuationStyle.id, attenuationStyle.name);
  pushLfoBankAndLinksToEngine();
}

/**
 * Rebuild the loaded locale at its own plot under the current Attenuation Style - the coordsOnly rebuild - so the
 * robots, the companies and the deal regenerate under the bands now installed (assumption 10). The robot ids are a
 * function of the plot alone, so the same robots come back, drawn afresh. The plot keeps its hour: the old locale's
 * dayStartTimestamp carries into the new one, so a name change carrying a theme never snaps the sky back to the plot's
 * arrival hour (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R22; Crawford, Open Question 4). A theme on its own no longer
 * comes here: it re-derives in place (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7).
 */
function rebuildCurrentLocaleInPlace(): void {
  const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  const localeId = attenuationStyle?.currentLocaleId;
  const locale = localeId ? useLocaleStore.getState().getLocaleById(localeId) : undefined;
  if (!attenuationStyle || !locale) return;
  retransmitCoordsOnly(attenuationStyle, localeId, locale.coordinates, locale.dayStartTimestamp);
}

/**
 * Build a new AttenuationStyle and switch the store to it (add only — the
 * caller finalizes with finalizeAttenuationStyleTransition once its own
 * branch-specific work is done). Shared by the two modes that create a new
 * Attenuation Style.
 *
 * addAttenuationStyle refuses (returns false, logs a devWarn, does not append)
 * on a case-insensitive name collision against any existing entry — including
 * the currently-active one being replaced this same call, since it's still in
 * the array at this point. The old code here ignored that return value and
 * proceeded as if the phantom, never-added `newAttenuationStyle` object had
 * really been added: `finalizeAttenuationStyleTransition` then pointed
 * `currentAttenuationStyleId` at an id matching nothing in `attenuationStyles`
 * and discarded the one real entry that still mattered, leaving
 * `selectCurrentAttenuationStyle` dangling to `undefined` from then on
 * (backlog.md #16). On a collision, this now looks up and returns the real
 * existing entry instead — guaranteed to exist, since addAttenuationStyle's
 * own refusal condition is exactly this same case-insensitive name match.
 */
function createNewAttenuationStyle(attenuationStyleName: string): AttenuationStyle {
  const newAttenuationStyle = buildAttenuationStyle(attenuationStyleName);
  const added = useAttenuationStyleStore.getState().addAttenuationStyle(newAttenuationStyle);
  if (added) return newAttenuationStyle;
  return useAttenuationStyleStore.getState().attenuationStyles.find(
    (p) => p.name.toLowerCase() === attenuationStyleName.toLowerCase()
  )!;
}

/**
 * Switch currentAttenuationStyleId to the new Attenuation Style and discard
 * the old one. Shared tail step for both Attenuation-Style-creating modes.
 *
 * `newAttenuationStyle` and `oldAttenuationStyle` can be THE SAME entry —
 * createNewAttenuationStyle's own collision handling (above) reuses the
 * existing entry on a name collision, and the currently-active
 * `oldAttenuationStyle` is itself a valid (if usually unintended) collision
 * target when a caller resubmits its own current name. Discarding it in that
 * case would delete the very entry this function just finished "finalizing"
 * onto — guarded here rather than relying on every caller to avoid ever
 * resubmitting the active name (backlog.md #16's prior workaround lived at
 * one specific caller, sessionDiff.ts, not here).
 */
function finalizeAttenuationStyleTransition(newAttenuationStyle: AttenuationStyle, oldAttenuationStyle: AttenuationStyle): void {
  // Triggers audioStore's existing useAttenuationStyleStore.subscribe — reseeds
  // globalAudio/lfoBank/globalLfoLinks from the new Attenuation Style's own seed. Do not call
  // regenerateGlobalAudioFromSeed/regenerateLfoBankFromSeed/regenerateGlobalLfoLinksFromSeed
  // directly here. A no-op reseed when the id is unchanged (the self-collision case below): that
  // subscription itself guards on the id actually differing.
  useAttenuationStyleStore.getState().setCurrentAttenuationStyleId(newAttenuationStyle.id);
  if (newAttenuationStyle.id === oldAttenuationStyle.id) return;
  useAttenuationStyleStore.getState().removeAttenuationStyle(oldAttenuationStyle.id);
}

/** Attenuation Style changed, coordinates preserved: re-parent the EXISTING
 *  locale onto the new Attenuation Style unchanged — same
 *  robots/actors/edits/dayStartTimestamp, no regeneration. Locale Seed
 *  Decoupling is what makes this correct: the locale's generated content is
 *  a pure function of (x, y), independent of which Attenuation Style owns
 *  it, so there is genuinely nothing to regenerate. dayStartTimestamp is NOT
 *  recalculated here — inverted from the old Attenuation-Style-owned-time
 *  behavior, see docs/specs/archive/ATTENUATION_STYLE.md §1.1. Factory colors DO
 *  change — recolorActorsForAttenuationStyle is new coupling, not a
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
    recolorActorsForAttenuationStyle(oldLocaleId, newAttenuationStyle.id, newAttenuationStyle.name);
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

/** Both changed: full reset, nothing eligible for preservation.
 *
 *  Removes the old locale BEFORE initializing the new one — see
 *  retransmitCoordsOnly's own comment above for why (deterministic robot ids
 *  mean an unchanged-coordinates reload would otherwise silently delete the
 *  new, live robots' just-reserved composite voices via the old locale's
 *  by-id release cleanup). This branch always changes both Attenuation Style
 *  and coordinates, so a real id collision is unlikely here in practice —
 *  reordered anyway to keep both retransmit paths symmetric and equally
 *  correct, rather than relying on "this branch happens not to trigger it." */
function retransmitBoth(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, attenuationStyleName: string, coordinates: { x: number; y: number }): void {
  if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);

  const newAttenuationStyle = createNewAttenuationStyle(attenuationStyleName);

  const newLocale = buildLocale(newAttenuationStyle.id, coordinates);
  useLocaleStore.getState().addLocale(newAttenuationStyle.id, newLocale);
  initializeLocale(newLocale.id, { startSystems: useUIStore.getState().isPoweredOn });
  useAttenuationStyleStore.getState().setCurrentLocale(newAttenuationStyle.id, newLocale.id);

  finalizeAttenuationStyleTransition(newAttenuationStyle, oldAttenuationStyle);
}

/**
 * The Sector Settings retransmit action — four branches, per
 * docs/specs/archive/SECTOR_SETTINGS.md §1's preservation rules, and two
 * for the loading (band-table T25). `input`'s fields are each present only if
 * the user actually edited that panel; absence means "preserve as-is," not
 * "reset to default." A loading change (docs/specs/OFF_SCREEN.md assumption
 * 10) sets the loading store before anything regenerates. A theme reseeds the
 * global half under the new bands where no style switch would, and on its own
 * re-derives the live roster in place (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7;
 * Crawford: nothing physical changes on a theme change); riding on a plot or
 * name change, it rebuilds with them. Picks alone
 * (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33) re-deal the live roster in
 * place. Neither in-place mode rebuilds anything, so the selection, the power
 * state and every system running or paused stand.
 *
 * Every branch that changes the world ends by mirroring the new identity into
 * the address bar (docs/specs/OFF_SCREEN.md assumption 12) — a pick on the off
 * screen, a Load in Comms, Roll and Foundry's Retransmit all come through here,
 * so a reload brings back the world that was loaded, untweaked. The no-op
 * branch touches nothing, so a link arrival's URL stands until the world moves.
 */
export function retransmitWorld(input: RetransmitInput): void {
  const action = resolveRetransmitAction(input);
  if (action.mode === 'noop') return;

  // A re-deal or re-derive in place keeps every robot and company id, so it keeps the selection too.
  if (action.mode !== 'aspectsOnly' && action.mode !== 'loadingOnly') {
    useUIStore.getState().selectRobot(null);
    // Companies are regenerated with fresh ids on a reseed — a selected company's id would dangle.
    useUIStore.getState().selectAllRobots();
  }
  const oldAttenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!oldAttenuationStyle) return;
  const oldLocaleId = oldAttenuationStyle.currentLocaleId;

  // A paused world that the change replaces is torn down first (docs/specs/OFF_SCREEN.md §1.2): left standing, its
  // frozen swells would feed Keep and the dirty read and its work loop would run under the new robots. A live change
  // stays running, a cold world has nothing to stop, and an Attenuation-Style-only, theme-only or aspects-only change
  // replaces no world.
  if (getWorldState() === 'paused' && rebuildsLocale(action)) tearDownPausedWorld();

  // The loading first (docs/specs/OFF_SCREEN.md assumption 10): the store, and through it the loading context, carry
  // the new theme before anything regenerates, so a rebuilt roster and a reseeded global half draw under its bands. The
  // loading it replaces is kept for the in-place re-derive, which compares the two.
  const { theme: previousTheme, aspects: previousAspects } = useLoadingStore.getState();
  if (action.loading) useLoadingStore.getState().setLoading(action.loading);

  switch (action.mode) {
    case 'aspectsOnly':
      // The picks alone: the live roster re-derived in place, only the seeded fields the picks move; the global half,
      // the companies and every robot's place stand (R33; field by field since final fixes F16).
      if (oldLocaleId) rederiveLoading(oldLocaleId, { theme: previousTheme, aspects: previousAspects }, cancelSwellForRobotAttribute);
      break;
    case 'loadingOnly':
      // The same style, the same plot: the global half from seed under the new bands (the style-sync does not fire
      // for an unchanged id), then the live roster re-derived in place - only the seeded fields the change moves, the
      // locale, the companies and every robot's place standing (final fixes F7). No stopAudioSwells runs here, so a
      // global swell on a field the theme moves is dropped before the new value is written, and the write is the last
      // one (final fixes F11).
      cancelGlobalSwellsMovedBy(generateGlobalAudioSettings(oldAttenuationStyle.id, oldAttenuationStyle.name));
      regenerateGlobalHalfFromSeed(oldAttenuationStyle);
      if (oldLocaleId) rederiveLoading(oldLocaleId, { theme: previousTheme, aspects: previousAspects }, cancelSwellForRobotAttribute);
      break;
    case 'coordsOnly':
      // A theme riding on a plot move moved the global bands too; a plain plot move leaves the global half alone.
      if (action.loading) regenerateGlobalHalfFromSeed(oldAttenuationStyle);
      retransmitCoordsOnly(oldAttenuationStyle, oldLocaleId, action.coordinates);
      break;
    case 'attenuationStyleOnly':
      retransmitAttenuationStyleOnly(oldAttenuationStyle, oldLocaleId, action.attenuationStyleName);
      // The style-sync reseeded the global half under the new loading; the preserved plot's robots were drawn under
      // the old bands, and a loading change is a world change, so they are drawn again.
      if (action.loading) rebuildCurrentLocaleInPlace();
      break;
    case 'both':
      retransmitBoth(oldAttenuationStyle, oldLocaleId, action.attenuationStyleName, action.coordinates);
      break;
  }

  const identity = currentWorldIdentity();
  if (identity) mirrorWorldToUrl(identity);
}

/**
 * Roll (docs/specs/OFF_SCREEN.md assumption 14): a fresh random Attenuation Style at a fresh random plot, through
 * retransmitWorld's full reset — the off screen's "another world, please". Nothing else moves: the loading store (the
 * theme and the aspects) rides along untouched, so the new world is drawn under the same bands and the bar keeps the
 * same loading params; the pick returns to Current on the screen; and like every retransmit it follows the power state
 * and leaves a paused world cold (Task 8).
 */
export function rollWorld(): void {
  retransmitWorld({
    attenuationStyleName: generateRandomAttenuationStyleName(),
    coordinates: { x: randomCoordinate(), y: randomCoordinate() },
  });
}
