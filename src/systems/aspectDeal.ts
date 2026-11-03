// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';
import type { AudioAttributes, Robot } from '../types/Robot';
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
import {
  deriveEnvelopeFields,
  deriveMelodyFields,
  deriveMotionFields,
  derivePerformanceFields,
  deriveSendFields,
  deriveVoiceFields,
  type MelodyFields,
  type PerformanceFields,
} from './robotFieldDerivation';
import {
  generateCompanyRosterBaseline,
  generateRobotRosterBaseline,
  type CompanyRosterBaseline,
  type RobotAudioBaseline,
} from './spawnSystem';
import { SWELL_ROBOT_ATTRIBUTE_IDS, type SwellRobotAttributeId } from '../types/audioSwell';
import type { OscillatorLayer } from '../types/layeredAudio';
import { ROBOT_LFO_TARGET_IDS, type LfoLaneId, type LfoLink } from '../types/lfo';
import { tallyLanes } from '../utils/lfoLaneDraw';
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

/** What the deal re-derives on a robot: the Melody fields, the audio attributes (Envelope's adsr, Voice's filter and
 *  layers, Motion's glide inside them), the five sends, Motion's links and the three Performance fields. */
type DealtFields = Partial<
  MelodyFields & PerformanceFields & Pick<RobotAudioBaseline, 'audioAttributes' | 'lfoLinks' | RobotSendField>
>;

/** The lane tally of the robots before a robot, as the roster spawned them: what a Motion deal re-derives its links
 *  against (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b). Asked for only when Motion is dealt. */
type PriorLanes = () => Readonly<Record<LfoLaneId, number>>;

/** The lane tally of `roster`'s robots before index `i`, as a PriorLanes. */
function priorLanesOf(roster: readonly { lfoLinks?: Record<string, LfoLink> }[], i: number): PriorLanes {
  return () => tallyLanes(roster.slice(0, i).flatMap((robot) => Object.values(robot.lfoLinks ?? {})));
}

/** One family's re-derivation for one robot at `spawnIndex` under `bands` (resolveBands(theme, { [family]: aspect })):
 *  Melody its four fields, Envelope the robot's `adsr` inside its own audio attributes, Distance its five sends, Voice
 *  its filter, waveform and layers inside its audio attributes, Motion its glide there and its links (against the lane
 *  tally of the roster before it as spawned), Performance its three fields. `robot` is the robot as dealt so far, so
 *  Envelope, Voice and Motion all land in one set of audio attributes. A switch, so a new family is a compile error until
 *  it has its case. */
function deriveFamilyFields(
  family: AspectFamilyId,
  noiseMap: NoiseFunction2D,
  spawnIndex: number,
  bands: BandTable,
  robot: Pick<RobotAudioBaseline, 'audioAttributes'>,
  priorLanes: PriorLanes,
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
    case 'motion': {
      const { portamento, lfoLinks } = deriveMotionFields(noiseMap, spawnIndex, bands, priorLanes());
      return { audioAttributes: { ...robot.audioAttributes, portamento }, lfoLinks };
    }
    case 'performance':
      return derivePerformanceFields(noiseMap, spawnIndex, bands);
  }
}

/** A dealt robot's re-derived fields (assumption 22; per family since docs/tasks/OFF_SCREEN_REVISIONS.md Task 8): for each
 *  dealt family in family order, its keys from the robot's own index under resolveBands(theme, { [family]: aspect }) -
 *  the same draws as at spawn, into the aspect's bands - so a dealt robot is what it would have been had it spawned
 *  under the aspect. A family not dealt keeps its fields. `priorLanes` is the lane tally Motion's links draw against:
 *  the robots before this one as the roster spawned them, so the baseline, the live deal and a re-derive agree without
 *  waiting on each other's deals. */
function dealtFields(
  noiseMap: NoiseFunction2D,
  spawnIndex: number,
  theme: ThemeId,
  aspects: RobotAspects,
  robot: Pick<RobotAudioBaseline, 'audioAttributes'>,
  priorLanes: PriorLanes,
): DealtFields {
  let fields: DealtFields = {};
  for (const family of ASPECT_FAMILY_IDS) {
    const aspect = aspects[family];
    if (aspect === undefined) continue;
    const bands = resolveBands(theme, { [family]: aspect });
    fields = { ...fields, ...deriveFamilyFields(family, noiseMap, spawnIndex, bands, { ...robot, ...fields }, priorLanes) };
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
    return { ...baseline, ...dealtFields(noiseMap, i, identity.theme, aspects, baseline, priorLanesOf(baselines, i)), loadedUnder: aspects };
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
 * robotOptionsActions.ts: reReserveVoice disposes the nodes the links were wired to; revisions Task 10), Motion writes
 * the glide live (applyPortamento's updateVoicePortamento, no rebuild) and re-primes the links, Performance regenerates
 * the melody, which bakes in the rests and accents (applyRests' path; docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b). The robot is
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
      case 'motion':
        AudioEngine.updateVoicePortamento(robot.id, robot.audioAttributes.portamento ?? 0);
        primeRobotLinks(robot);
        break;
      case 'performance':
        regenerateMelody(robot, localeId);
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

/** Each family in `families` to the engine, in family order, each push once: Performance's push is Melody's (one
 *  regenerateMelody reads every field the melody bakes in), so it is skipped when Melody's runs
 *  (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b). */
function pushFamilies(families: ReadonlySet<AspectFamilyId>, robot: Robot, localeId: string): void {
  for (const family of ASPECT_FAMILY_IDS) {
    if (!families.has(family)) continue;
    if (family === 'performance' && families.has('melody')) continue;
    pushFamilyToEngine(family, robot, localeId);
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
    const fields = dealtFields(noiseMap, i, theme, robotAspects, robot, priorLanesOf(locale.robots, i));
    useLocaleStore.getState().updateRobot(localeId, robot.id, { ...fields, loadedUnder: robotAspects });
    const updated = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
    if (!updated) return;
    pushFamilies(new Set(ASPECT_FAMILY_IDS.filter((family) => robotAspects[family] !== undefined)), updated, localeId);
  });
}

/**
 * The top-level seeded fields compared one by one, each with the family whose push carries it to the engine, or null
 * for a field no engine call needs. Melody's four; `rests`, `accents` and the register, which the melody bakes in
 * (regenerateMelody reads them, as a hand edit of Rests, Accents or the octaves regenerates); `dynamics`, a playback
 * scale read on every note, so the write is all (the Dynamics edit makes no engine call); `masterVolume`, filed under
 * Voice, whose rebuild reserves the voice at the robot's volume (reReserveVoice); and the five sends. The four after
 * `pitchRepeat` and the master volume joined at docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6, so a theme column may
 * name them; T7b refiles the Performance fields under their own family.
 */
const TOP_LEVEL_FIELDS = [
  ['rhythmicDensity', 'melody'],
  ['rhythmicMotifLength', 'melody'],
  ['noteVariance', 'melody'],
  ['pitchRepeat', 'melody'],
  ['rests', 'performance'],
  ['accents', 'performance'],
  ['octaveRange', 'melody'],
  ['dynamics', null],
  ['masterVolume', 'voice'],
  ...ROBOT_SEND_FIELDS.map((field) => [field, 'distance'] as const),
] as const satisfies readonly (readonly [keyof RobotAudioBaseline, AspectFamilyId | null])[];

/** The swell riding a field where its attribute id is not the field's own name. */
const SWELL_ID_OF: Partial<Record<keyof RobotAudioBaseline, SwellRobotAttributeId>> = { masterVolume: 'volume' };

/**
 * The fields inside the audio attributes compared one by one, each with the family whose push carries it: Voice's four;
 * the glide, under Envelope, whose push writes it live as the Portamento edit does (updateVoicePortamento, no rebuild;
 * the Envelope drawer's glide row); and the register the body scale reads, which needs no push of its own: the
 * top-level `octaveRange` beside it moves with it and carries Melody's (T6). The layers are compared apart, per layer
 * and key.
 */
const ATTRIBUTE_FIELDS = [
  ['filterFreq', 'voice'],
  ['filterQ', 'voice'],
  ['filterType', 'voice'],
  ['waveform', 'voice'],
  ['portamento', 'motion'],
  ['octaveRange', null],
] as const satisfies readonly (readonly [keyof AudioAttributes, AspectFamilyId | null])[];

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
    if (family) families.add(family);
    const swell = SWELL_ID_OF[field] ?? field;
    if (isSwellable(swell)) swells.push(swell);
  }

  // The links per target (T6), as the layers are compared per key: only a moved target takes the new link, so a hand
  // edit on another target stands. Motion's push re-primes the links (primeRobotLinks), since T7b.
  let lfoLinks = robot.lfoLinks;
  for (const target of ROBOT_LFO_TARGET_IDS) {
    if (deepEqual(from.lfoLinks[target], to.lfoLinks[target])) continue;
    lfoLinks = { ...(lfoLinks ?? to.lfoLinks), [target]: to.lfoLinks[target] };
    families.add('motion');
  }
  if (lfoLinks !== robot.lfoLinks) fields.lfoLinks = lfoLinks;

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
  for (const [key, family] of ATTRIBUTE_FIELDS) {
    if (deepEqual(from.audioAttributes[key], to.audioAttributes[key])) continue;
    audioAttributes = { ...audioAttributes, [key]: to.audioAttributes[key] };
    if (family) families.add(family);
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
 * under the new loading spawns, and diffs to nothing against its own seed. Under the real theme columns that is every
 * robot field the two themes' columns name (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T8); an aspect change riding
 * on the theme moves its families' fields and `loadedUnder` the same way. The swells riding the moved fields are
 * dropped first, the fields go through updateRobot, and each moved family reaches the engine through
 * pushFamilyToEngine; a robot nothing moved for is not written. The comparison covers the four families' fields,
 * `rests`, and since docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6 every robot field a band seeds: `accents`,
 * `dynamics`, the register, the master volume, the glide and the LFO links per target. A theme column may name any key
 * of the band table (docs/specs/THEME_AND_ASPECTS_REFINEMENT.md §1.5); a robot key's field must be compared here and
 * pushed by pushFamilyToEngine, or a theme change would leave the live robots stale on it.
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
  const drawn = (
    theme: ThemeId,
    i: number,
    roster: readonly RobotAudioBaseline[],
    dealt: RobotAspects | undefined,
  ): RobotAudioBaseline =>
    dealt ? { ...roster[i], ...dealtFields(noiseMap, i, theme, dealt, roster[i], priorLanesOf(roster, i)), loadedUnder: dealt } : roster[i];
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
    generateRobotRosterBaseline(noiseMap, ids.length).map((_, i, roster) => drawn(from.theme, i, roster, locale.robots[i].loadedUnder)),
  );
  const after = withLoading(to, () =>
    generateRobotRosterBaseline(noiseMap, ids.length).map((_, i, roster) => drawn(to.theme, i, roster, aspectsAfter(locale.robots[i]))),
  );
  locale.robots.forEach((robot, i) => {
    const { fields, families, swells } = movedFields(robot, before[i], after[i]);
    if (Object.keys(fields).length === 0) return;
    for (const attribute of swells) dropSwell(robot.id, attribute);
    useLocaleStore.getState().updateRobot(localeId, robot.id, fields);
    const updated = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
    if (!updated) return;
    pushFamilies(families, updated, localeId);
  });
}
