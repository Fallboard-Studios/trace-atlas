// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';
import type { Robot } from '../types/Robot';
import { AudioEngine } from '../engine/AudioEngine';
import type { Company } from '../types/Company';
import { DEV_TUNING } from '../constants';
import { ROBOT_SEND_FIELDS, robotSendLevels, type RobotSendField } from '../data/robotSends';
import { resolveBands } from '../data/bands/resolveBands';
import { dealAspects, type RobotAspects } from '../data/bands/dealAspects';
import type { BandTable } from '../data/bands/bandKeys';
import { ASPECT_FAMILY_IDS, type AspectFamilyId } from '../data/bands/aspects';
import type { ThemeId } from '../data/bands/themes';
import type { LoadingIdentity } from '../data/bands/loadingIdentity';
import { useLoadingStore } from '../stores/loadingStore';
import { regenerateMelody } from '../engine/regenerateMelody';
import useLocaleStore from '../stores/localeStore';
import { primeRobotLinks } from './robotLfoLinks';
import { deriveEnvelopeFields, deriveMelodyFields, deriveSendFields, deriveVoiceFields, type MelodyFields } from './robotFieldDerivation';
import {
  generateCompanyRosterBaseline,
  generateRobotRosterBaseline,
  type CompanyRosterBaseline,
  type RobotAudioBaseline,
} from './spawnSystem';
import { SWELL_ROBOT_ATTRIBUTE_IDS, type SwellRobotAttributeId } from '../types/audioSwell';
import type { OscillatorLayer } from '../types/layeredAudio';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { withLoading } from '../data/bands/loadingContext';
import { deepEqual } from '../utils/math';

/*
 * The deal (docs/specs/OFF_SCREEN.md assumptions 21, 22 and 24): the loading's aspect picks seated over a roster - on a
 * baseline (applyDealToBaselines, generateDealtRosterBaseline), on the live roster when a world is built
 * (applyAspectDeal), and in place when the theme or the aspects change (rederiveLoading, field by field since
 * docs/tasks/OFF_SCREEN_FINAL_FIXES.md F16) - each family's fields re-derived through robotFieldDerivation.ts and pushed
 * to the engine the way a hand edit is. Moved out of spawnSystem.ts unchanged (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md
 * R13).
 */

// ========================================
// THE DEAL (docs/specs/OFF_SCREEN.md assumptions 21, 22 and 24)
// ========================================

/** What the deal re-derives on a robot: the Melody fields, the audio attributes (Envelope's adsr inside them) and the
 *  five sends. */
type DealtFields = Partial<MelodyFields & Pick<RobotAudioBaseline, 'audioAttributes' | RobotSendField>>;

/** One family's re-derivation for one robot at `spawnIndex` under `bands` (resolveBands(theme, { [family]: aspect })):
 *  Melody its four fields, Envelope the robot's `adsr` inside its own audio attributes, Distance its five sends, Voice
 *  its filter, waveform and layers inside its audio attributes. `robot` is the robot as dealt so far, so Envelope and
 *  Voice both land in one set of audio attributes. A switch, so a new family is a compile error until it has its case. */
function deriveFamilyFields(
  family: AspectFamilyId,
  noiseMap: NoiseFunction2D,
  spawnIndex: number,
  bands: BandTable,
  robot: Pick<RobotAudioBaseline, 'audioAttributes'>,
): DealtFields {
  switch (family) {
    case 'melody':
      return deriveMelodyFields(noiseMap, spawnIndex, bands);
    case 'envelope':
      return { audioAttributes: { ...robot.audioAttributes, adsr: deriveEnvelopeFields(noiseMap, spawnIndex, bands) } };
    case 'distance':
      return deriveSendFields(noiseMap, spawnIndex, bands);
    case 'voice':
      return { audioAttributes: { ...robot.audioAttributes, ...deriveVoiceFields(noiseMap, spawnIndex, bands) } };
  }
}

/** A dealt robot's re-derived fields (assumption 22; per family since docs/tasks/OFF_SCREEN_REVISIONS.md Task 8): for each
 *  dealt family in family order, its keys from the robot's own index under resolveBands(theme, { [family]: aspect }) -
 *  the same draws as at spawn, into the aspect's bands - so a dealt robot is what it would have been had it spawned
 *  under the aspect. A family not dealt keeps its fields. */
function dealtFields(
  noiseMap: NoiseFunction2D,
  spawnIndex: number,
  theme: ThemeId,
  aspects: RobotAspects,
  robot: Pick<RobotAudioBaseline, 'audioAttributes'>,
): DealtFields {
  let fields: DealtFields = {};
  for (const family of ASPECT_FAMILY_IDS) {
    const aspect = aspects[family];
    if (aspect === undefined) continue;
    const bands = resolveBands(theme, { [family]: aspect });
    fields = { ...fields, ...deriveFamilyFields(family, noiseMap, spawnIndex, bands, { ...robot, ...fields }) };
  }
  return fields;
}

/**
 * The deal pass over a regenerated roster baseline, pure (assumption 22 as amended at planning): dealAspects over the
 * companies and the robot ids (spawn order), then for every robot dealt an aspect its family's fields re-derived from
 * its own index - a copied-baseline robot included, which so leaves its source's values behind - and `loadedUnder`
 * set; every other robot is the very same object, and with nothing dealt the input array comes back. Run inside
 * generateDealtRosterBaseline for buildSessionPayload's diff and mirrored live by applyAspectDeal from the same noise
 * map, so an untweaked dealt world diffs to nothing against its own seed.
 */
export function applyDealToBaselines(
  baselines: RobotAudioBaseline[],
  robotIds: readonly string[],
  companies: readonly Pick<Company, 'robotIds'>[],
  identity: LoadingIdentity,
  noiseMap: NoiseFunction2D,
): RobotAudioBaseline[] {
  const dealt = dealAspects(identity, companies, robotIds.map((id) => ({ id })), noiseMap);
  if (dealt.size === 0) return baselines;
  return baselines.map((baseline, i) => {
    const aspects = dealt.get(robotIds[i]);
    if (!aspects) return baseline;
    return { ...baseline, ...dealtFields(noiseMap, i, identity.theme, aspects, baseline), loadedUnder: aspects };
  });
}

/**
 * The roster and company baselines a saved world is diffed against (sessionDiff.ts's buildSessionPayload): the roster
 * replayed from the noise map, the companies from the live robot ids in spawn order, and the deal applied to the roster
 * under the loaded identity, so the baseline is what the live spawn produced.
 */
export function generateDealtRosterBaseline(
  noiseMap: NoiseFunction2D,
  robotIds: readonly string[],
  identity: LoadingIdentity,
): { robots: RobotAudioBaseline[]; companies: CompanyRosterBaseline[] } {
  const companies = generateCompanyRosterBaseline(noiseMap, robotIds);
  const robots = applyDealToBaselines(generateRobotRosterBaseline(noiseMap, robotIds.length), robotIds, companies, identity, noiseMap);
  return { robots, companies };
}

/**
 * One family's fields, already in the store, to the running engine, the way a hand edit of those fields reaches it
 * (docs/tasks/OFF_SCREEN_REVISIONS.md Task 8): Melody regenerates the melody (regenerateMelody re-registers it,
 * applyDensity's path), Envelope hands the adsr to updateVoiceEnvelope (applyAdsr's path: a live write, curves included,
 * no rebuild), Distance hands all five sends to updateRobotSends (applySendValue's call, the prime every reservation
 * makes), Voice rebuilds the voice from the robot and re-primes its LFO links (the structural edit's rebuildVoice,
 * robotOptionsActions.ts: reReserveVoice disposes the nodes the links were wired to; revisions Task 10). The robot is
 * handed to reReserveVoice because a rebuild deals before its locale is current, where the engine's own lookup finds
 * nothing (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R4). `robot` is the store's robot after the write. Guarded as
 * spawnRobot's reservation is, so a push that throws costs only itself, never the rest of the deal
 * (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R14). A switch with a never check, as deriveFamilyFields is a switch: a new
 * family is a compile error until it has its push.
 */
function pushFamilyToEngine(family: AspectFamilyId, robot: Robot, localeId: string): void {
  try {
    switch (family) {
      case 'melody':
        regenerateMelody(robot, localeId);
        break;
      case 'envelope':
        AudioEngine.updateVoiceEnvelope(robot.id, robot.audioAttributes.adsr);
        break;
      case 'distance':
        AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot));
        break;
      case 'voice':
        AudioEngine.reReserveVoice(robot.id, robot);
        primeRobotLinks(robot);
        break;
      default: {
        const unpushed: never = family;
        throw new Error(`no engine push for the ${String(unpushed)} family`);
      }
    }
  } catch (err) {
    if (DEV_TUNING) console.warn('[SpawnSystem] the deal could not push', family, 'for', robot.id, err);
  }
}

/**
 * The deal pass on the live roster (assumption 22): after spawnInitialCompanies, in initializeLocale
 * (worldTransition.ts). Reads the loading store's theme and picks, deals over the locale's companies and robots, and for
 * every dealt robot writes its re-derived fields and `loadedUnder` through updateRobot (the roster position is the spawn
 * index: the initial roster spawns in order from 0). Then each dealt family, in family order, reaches the running engine
 * through pushFamilyToEngine. Before the engine starts - the off screen - those engine calls are the same no-ops they are
 * at spawn. With nothing dealt, nothing is written. The baseline runs applyDealToBaselines from the same noise map, so
 * the two agree field for field.
 */
export function applyAspectDeal(localeId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const { theme, aspects } = useLoadingStore.getState();
  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const dealt = dealAspects({ aspects }, locale.companies, locale.robots, noiseMap);
  locale.robots.forEach((robot, i) => {
    const robotAspects = dealt.get(robot.id);
    if (!robotAspects) return;
    useLocaleStore.getState().updateRobot(localeId, robot.id, { ...dealtFields(noiseMap, i, theme, robotAspects, robot), loadedUnder: robotAspects });
    const updated = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
    if (!updated) return;
    for (const family of ASPECT_FAMILY_IDS) {
      if (robotAspects[family] !== undefined) pushFamilyToEngine(family, updated, localeId);
    }
  });
}

/** The top-level seeded fields compared one by one, each with the family whose push carries it to the engine: Melody's
 *  four and `rests`, which the melody bakes in (regenerateMelody reads it, as a hand edit of Rests regenerates), and
 *  the five sends. */
const TOP_LEVEL_FIELDS = [
  ['rhythmicDensity', 'melody'],
  ['rhythmicMotifLength', 'melody'],
  ['noteVariance', 'melody'],
  ['pitchRepeat', 'melody'],
  ['rests', 'melody'],
  ...ROBOT_SEND_FIELDS.map((field) => [field, 'distance'] as const),
] as const satisfies readonly (readonly [keyof RobotAudioBaseline, AspectFamilyId])[];

/** Voice's fields inside the audio attributes, compared one by one; the layers are compared apart, per layer and key. */
const VOICE_FIELDS = ['filterFreq', 'filterQ', 'filterType', 'waveform'] as const;

/** A layer's seeded keys, compared one by one (deriveVoiceFields draws each; `pulseWidth` is never seeded). Only a moved
 *  key is written into the robot's own layer, and only a moved gain or detune drops its swell (`layer<i>.<key>`). */
const LAYER_KEYS = ['type', 'gain', 'detune', 'phase'] as const satisfies readonly (keyof OscillatorLayer)[];

/** One robot's fields that moved between the `from` and `to` baselines, as `robot` takes them: each moved field the
 *  new value, inside its own audio attributes, adsr and layer where it lives there, every other field the robot's own
 *  (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F16: a theme or aspect change writes only what it moves). With the families to
 *  push and the swells to drop, the swellable moved fields (SWELL_ROBOT_ATTRIBUTE_IDS). */
function movedFields(
  robot: Robot,
  from: RobotAudioBaseline,
  to: RobotAudioBaseline,
): { fields: Partial<Robot>; families: Set<AspectFamilyId>; swells: SwellRobotAttributeId[] } {
  const fields: Partial<Robot> = {};
  const families = new Set<AspectFamilyId>();
  const swells: SwellRobotAttributeId[] = [];
  const isSwellable = (attribute: string): attribute is SwellRobotAttributeId =>
    (SWELL_ROBOT_ATTRIBUTE_IDS as readonly string[]).includes(attribute);

  for (const [field, family] of TOP_LEVEL_FIELDS) {
    if (deepEqual(from[field], to[field])) continue;
    Object.assign(fields, { [field]: to[field] });
    families.add(family);
    if (isSwellable(field)) swells.push(field);
  }

  let audioAttributes = robot.audioAttributes;
  const fromAdsr = from.audioAttributes.adsr;
  const toAdsr = to.audioAttributes.adsr;
  const adsrKeys = new Set([...Object.keys(fromAdsr), ...Object.keys(toAdsr)] as (keyof typeof toAdsr)[]);
  for (const key of adsrKeys) {
    if (deepEqual(fromAdsr[key], toAdsr[key])) continue;
    audioAttributes = { ...audioAttributes, adsr: { ...audioAttributes.adsr, [key]: toAdsr[key] } };
    families.add('envelope');
    if (isSwellable(`adsr.${key}`)) swells.push(`adsr.${key}` as SwellRobotAttributeId);
  }
  for (const key of VOICE_FIELDS) {
    if (deepEqual(from.audioAttributes[key], to.audioAttributes[key])) continue;
    audioAttributes = { ...audioAttributes, [key]: to.audioAttributes[key] };
    families.add('voice');
  }
  const fromLayers = from.audioAttributes.layers ?? [];
  const toLayers = to.audioAttributes.layers ?? [];
  let layers: OscillatorLayer[] | undefined = robot.audioAttributes.layers;
  toLayers.forEach((toLayer, i) => {
    for (const key of LAYER_KEYS) {
      if (deepEqual(fromLayers[i]?.[key], toLayer[key])) continue;
      // A layer the robot lacks takes the new draw whole, its other keys included.
      const own = layers?.[i] ?? toLayer;
      const next = [...(layers ?? [])];
      next[i] = { ...own, [key]: toLayer[key] };
      layers = next;
      families.add('voice');
      if (isSwellable(`layer${i}.${key}`)) swells.push(`layer${i}.${key}` as SwellRobotAttributeId);
    }
  });
  if (layers !== robot.audioAttributes.layers) audioAttributes = { ...audioAttributes, layers };
  if (audioAttributes !== robot.audioAttributes) fields.audioAttributes = audioAttributes;
  if (!deepEqual(robot.loadedUnder, to.loadedUnder)) fields.loadedUnder = to.loadedUnder;
  return { fields, families, swells };
}

/**
 * A loading change on the live roster, in place (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7; Crawford, answer 2b: nothing
 * about the physical world changes on a theme change). A theme moves only seeded bands, so the plot, the companies and
 * every robot's body, place, battery and job stand, and only the seeded fields the change moves are written. The
 * rebuild a change would make is drawn twice over the locale's own robots and companies - the roster baseline then the
 * deal, under `from` (the loading the change replaced) and under the loading store's now - and per robot, field by
 * field (movedFields), every field whose seeded value moved takes the new one. Every other field stands, a tweak
 * included; a tweak on a moved field goes, as any re-derivation takes it. So an untweaked world ends what a rebuild
 * under the new loading spawns, and diffs to nothing against its own seed. Under the real theme columns that is
 * rhythmicDensity, rests, the attack and release (curves too) and the Reverb and Delay sends; an aspect change riding
 * on the theme moves its families' fields and `loadedUnder` the same way. The swells riding the moved fields are
 * dropped first, the fields go through updateRobot, and each moved family reaches the engine through
 * pushFamilyToEngine; a robot nothing moved for is not written. The comparison covers the four families' fields and
 * `rests`, the robot rows a theme column may name (ThemeBandKey); widening that list is an "ask first" (spec §3), and
 * a widened row needs its field here.
 *
 * An aspects-only change comes here too, with `from` the loading it replaced (final fixes F16, which folded R33's
 * redealAspects in): its moved fields are what the two dealt baselines disagree on, so a tweak on an attribute the aspect
 * does not move stays, where the whole family used to go. `dropSwell` is audioSwells' cancelSwellForRobotAttribute,
 * handed in by the caller (retransmitWorld) so this module stays out of the swell system's imports: they load the audio
 * store, whose module-load style-sync every test that imports this module - through worldTransition or sessionDiff,
 * too - would then run.
 */
export function rederiveLoading(
  localeId: string,
  from: LoadingIdentity,
  dropSwell: (robotId: string, attribute: SwellRobotAttributeId) => void,
): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const { theme, aspects } = useLoadingStore.getState();
  const to: LoadingIdentity = { theme, aspects };
  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const ids = locale.robots.map((robot) => robot.id);
  // The deal runs over the companies as they stand, not the seeded ones a rebuild or the session baseline deals over,
  // under both loadings. A robot's aspects change only in the families whose deal the change moves for it; every other
  // family keeps the robot's own `loadedUnder`. So a robot moved to another company keeps what it rolled until a change
  // moves the pick its new company is dealt (final fixes F20; Crawford: "nothing about the robot should change unless
  // the robot itself or its new company gets updated"). For a world as built, `loadedUnder` is the old deal, so a robot
  // takes the new deal whole. A moved robot can differ from the seeded baseline; sessionDiff saves it as overrides.
  const oldDeal = dealAspects(from, locale.companies, locale.robots, noiseMap);
  const newDeal = dealAspects(to, locale.companies, locale.robots, noiseMap);
  /** A robot's baselines under `theme` and the given aspects, as a spawn under them would draw it. */
  const drawn = (theme: ThemeId, i: number, baseline: RobotAudioBaseline, dealt: RobotAspects | undefined): RobotAudioBaseline =>
    dealt ? { ...baseline, ...dealtFields(noiseMap, i, theme, dealt, baseline), loadedUnder: dealt } : baseline;
  const aspectsAfter = (robot: Robot): RobotAspects | undefined => {
    const next: RobotAspects = { ...robot.loadedUnder };
    for (const family of ASPECT_FAMILY_IDS) {
      const was = oldDeal.get(robot.id)?.[family];
      const now = newDeal.get(robot.id)?.[family];
      if (was === now) continue;
      if (now === undefined) delete next[family];
      else Object.assign(next, { [family]: now });
    }
    return Object.keys(next).length > 0 ? next : undefined;
  };
  // The old side is what each robot was dealt, its own `loadedUnder` under the old theme (final fixes F16).
  const before = withLoading(from, () =>
    generateRobotRosterBaseline(noiseMap, ids.length).map((baseline, i) => drawn(from.theme, i, baseline, locale.robots[i].loadedUnder)),
  );
  const after = withLoading(to, () =>
    generateRobotRosterBaseline(noiseMap, ids.length).map((baseline, i) => drawn(to.theme, i, baseline, aspectsAfter(locale.robots[i]))),
  );
  locale.robots.forEach((robot, i) => {
    const { fields, families, swells } = movedFields(robot, before[i], after[i]);
    if (Object.keys(fields).length === 0) return;
    for (const attribute of swells) dropSwell(robot.id, attribute);
    useLocaleStore.getState().updateRobot(localeId, robot.id, fields);
    const updated = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
    if (!updated) return;
    for (const family of ASPECT_FAMILY_IDS) if (families.has(family)) pushFamilyToEngine(family, updated, localeId);
  });
}
