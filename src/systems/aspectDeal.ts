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
import type { SwellRobotAttributeId } from '../types/audioSwell';
import { getLocaleNoiseMap } from '../utils/noiseMaps';

/*
 * The deal (docs/specs/OFF_SCREEN.md assumptions 21, 22 and 24): the loading's aspect picks seated over a roster - on a
 * baseline (applyDealToBaselines, generateDealtRosterBaseline), on the live roster when a world is built
 * (applyAspectDeal), and in place when only the aspects change (redealAspects) - each family's fields re-derived through
 * robotFieldDerivation.ts and pushed to the engine the way a hand edit is. Moved out of spawnSystem.ts unchanged
 * (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R13).
 */

// ========================================
// THE DEAL (docs/specs/OFF_SCREEN.md assumptions 21, 22 and 24)
// ========================================

/** The identity the deal reads: the theme the fleet was built under and the picks to seat. */
type DealIdentity = Pick<LoadingIdentity, 'theme' | 'aspects'>;

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
  identity: DealIdentity,
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
  identity: DealIdentity,
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

/** One family's fields as `source` holds them, over `robot`'s own audio attributes: the counterpart of
 *  deriveFamilyFields, key for key, reading a robot already drawn instead of drawing one. A switch, so a new family is
 *  a compile error until it has its case. */
function familyFieldsOf(
  family: AspectFamilyId,
  source: RobotAudioBaseline,
  robot: Pick<RobotAudioBaseline, 'audioAttributes'>,
): DealtFields {
  switch (family) {
    case 'melody': {
      const { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat } = source;
      return { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat };
    }
    case 'envelope':
      return { audioAttributes: { ...robot.audioAttributes, adsr: source.audioAttributes.adsr } };
    case 'distance': {
      const { reverbSend, delaySend, gritSend, shimmerSend, doubleSend } = source;
      return { reverbSend, delaySend, gritSend, shimmerSend, doubleSend };
    }
    case 'voice': {
      const { filterFreq, filterQ, filterType, waveform, layers } = source.audioAttributes;
      return { audioAttributes: { ...robot.audioAttributes, filterFreq, filterQ, filterType, waveform, layers } };
    }
  }
}

/** The swellable attributes inside each family's fields (SWELL_ROBOT_ATTRIBUTE_IDS): the swells an in-place re-deal
 *  drops, as a hand edit of a field drops the swell riding it (RobotScreen.tsx), so none returns a re-derived field to
 *  its old base or hands that base to Keep (sessionDiff.ts saves a swelling field's base). Melody's fields never
 *  swell. A Record, so a new family is a compile error until it has its list. */
const FAMILY_SWELL_ATTRIBUTES: Record<AspectFamilyId, readonly SwellRobotAttributeId[]> = {
  melody: [],
  envelope: ['adsr.attack', 'adsr.decay', 'adsr.sustain', 'adsr.release'],
  distance: ROBOT_SEND_FIELDS,
  voice: ['layer0.gain', 'layer0.detune', 'layer1.gain', 'layer1.detune', 'layer2.gain', 'layer2.detune'],
};

/**
 * An aspect change on the live roster, in place (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33; Crawford: refresh the
 * world only when necessary). Aspects are robot-side (spec §3), so the world stands - positions, batteries, jobs, the
 * companies, the global half - and only the deal moves. The loading store's picks are dealt over the locale's own
 * companies and robots, as applyAspectDeal deals them, onto the roster a rebuild would spawn (the theme's own draws,
 * generateRobotRosterBaseline); then each robot takes, for just the families whose dealt aspect moved from its
 * `loadedUnder`, what that rebuild gives it: the aspect's re-derivation from its own index for a family still dealt,
 * the theme's own draw for one no longer dealt (a copied robot's being its source's, as at spawn). A tweak on any other
 * field stays; a tweak on a re-derived one goes, as any re-derivation takes it. The swells riding the re-derived fields
 * are dropped first (FAMILY_SWELL_ATTRIBUTES, through `dropSwell`), the fields and the new `loadedUnder` go through
 * updateRobot, and each moved family reaches the engine through pushFamilyToEngine. A robot nothing moved for is not
 * written. `dropSwell` is audioSwells' cancelSwellForRobotAttribute, handed in by the caller (retransmitWorld) so this
 * module stays out of the swell system's imports: they load the audio store, whose module-load style-sync every test
 * that imports this module - through worldTransition or sessionDiff, too - would then run.
 */
export function redealAspects(localeId: string, dropSwell: (robotId: string, attribute: SwellRobotAttributeId) => void): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const { theme, aspects } = useLoadingStore.getState();
  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const ids = locale.robots.map((robot) => robot.id);
  const rebuilt = applyDealToBaselines(generateRobotRosterBaseline(noiseMap, ids.length), ids, locale.companies, { theme, aspects }, noiseMap);
  locale.robots.forEach((robot, i) => {
    const loadedUnder = rebuilt[i].loadedUnder;
    const moved = ASPECT_FAMILY_IDS.filter((family) => loadedUnder?.[family] !== robot.loadedUnder?.[family]);
    if (moved.length === 0) return;
    let fields: DealtFields = {};
    for (const family of moved) {
      for (const attribute of FAMILY_SWELL_ATTRIBUTES[family]) dropSwell(robot.id, attribute);
      fields = { ...fields, ...familyFieldsOf(family, rebuilt[i], { ...robot, ...fields }) };
    }
    useLocaleStore.getState().updateRobot(localeId, robot.id, { ...fields, loadedUnder });
    const updated = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
    if (!updated) return;
    for (const family of moved) pushFamilyToEngine(family, updated, localeId);
  });
}
