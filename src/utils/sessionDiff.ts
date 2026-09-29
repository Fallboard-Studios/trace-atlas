// ========================================
// IMPORTS
// ========================================
import type { Robot } from '../types/Robot';
import type { Company } from '../types/Company';
import { generateRobotRosterBaseline, generateCompanyRosterBaseline, type RobotAudioBaseline } from '../systems/spawnSystem';
import type { RobotAudioOverrideDiff, CompanyDiff, SessionPayload } from '../types/session';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId, type LfoSettings } from '../types/lfo';
import type { SwellRobotAttributeId } from '../types/audioSwell';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../stores/attenuationStyleStore';
import { useLocaleStore } from '../stores/localeStore';
import { useAudioStore, applyGlobalAudioToEngine } from '../stores/audioStore';
import { getLocaleNoiseMap } from './noiseMaps';
import { quantizeToStep } from './math';
import { GLOBAL_AUDIO_SEED_RANGES } from '../data/globalAudioSeedRanges';
import { retransmitWorld } from '../systems/worldTransition';
import { regenerateMelody } from '../engine/regenerateMelody';
import { getActiveSwellSnapshot } from '../systems/audioSwells';

// ========================================
// FUNCTIONS
// ========================================

/** Structural equality over plain JSON-shaped values (numbers, strings, booleans, arrays, plain
 *  objects) — every field this module compares is one of those. Not a general-purpose deep-equal
 *  (no Date/Map/Set handling), since nothing in Robot/RobotAudioBaseline's audio-relevant fields
 *  needs it (CLAUDE.md requires state stay JSON-serializable in the first place). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** If a swell is currently active on this (robotId, attribute) pair, return its baseValue for
 *  that member. Otherwise return undefined. Used to capture the normalized base value instead of
 *  the mid-ramp interpolated value when saving a session while swells are in flight.  */
function extractSwellBaseValueIfActive(robotId: string, attribute: SwellRobotAttributeId): number | undefined {
  const swells = getActiveSwellSnapshot('robot');
  for (const swell of swells) {
    if (swell.robotAttribute === attribute && swell.members) {
      const member = swell.members.find((m) => m.robotId === robotId);
      if (member) return member.baseValue;
    }
  }
  return undefined;
}

/** If a swell is currently active on this global target, return its baseValue.
 *  Otherwise return undefined. Used to capture the normalized base value instead of
 *  the mid-ramp interpolated value when saving global audio while swells are in flight. */
function extractGlobalSwellBaseValueIfActive(target: string): number | undefined {
  const swells = getActiveSwellSnapshot('global');
  for (const swell of swells) {
    if (swell.globalTarget === target && swell.baseValue !== undefined) {
      return swell.baseValue;
    }
  }
  return undefined;
}

/** Clean up floating-point representation errors by rounding to the appropriate number
 *  of decimal places. E.g., -0.42000000000000004 → -0.42. For 2 decimal places: round to
 *  nearest 0.01 by shifting, rounding, and shifting back. */
function cleanupFloatingPoint(value: number, decimalPlaces: number): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}

/** Apply swell base values to globalAudio fields if swells are active, so persisted
 *  global audio always contains normalized data regardless of swell phase. */
function applyGlobalSwellBasesToAudio(globalAudio: ReturnType<typeof useAudioStore.getState>['globalAudio']) {
  const toCapture = { ...globalAudio };

  // EQ bands
  const eqSwellLow = extractGlobalSwellBaseValueIfActive('eq3.low');
  const eqSwellMid = extractGlobalSwellBaseValueIfActive('eq3.mid');
  const eqSwellHigh = extractGlobalSwellBaseValueIfActive('eq3.high');
  if (eqSwellLow !== undefined || eqSwellMid !== undefined || eqSwellHigh !== undefined) {
    toCapture.eq3 = {
      ...toCapture.eq3,
      ...(eqSwellLow !== undefined ? { low: eqSwellLow } : {}),
      ...(eqSwellMid !== undefined ? { mid: eqSwellMid } : {}),
      ...(eqSwellHigh !== undefined ? { high: eqSwellHigh } : {}),
    };
  }

  // LPF
  const lpfFreqSwell = extractGlobalSwellBaseValueIfActive('lpf.frequency');
  const lpfQSwell = extractGlobalSwellBaseValueIfActive('lpf.Q');
  if (lpfFreqSwell !== undefined || lpfQSwell !== undefined) {
    toCapture.filterLPF = {
      ...toCapture.filterLPF,
      ...(lpfFreqSwell !== undefined ? { frequency: lpfFreqSwell } : {}),
      ...(lpfQSwell !== undefined ? { Q: lpfQSwell } : {}),
    };
  }

  // HPF
  const hpfFreqSwell = extractGlobalSwellBaseValueIfActive('hpf.frequency');
  const hpfQSwell = extractGlobalSwellBaseValueIfActive('hpf.Q');
  if (hpfFreqSwell !== undefined || hpfQSwell !== undefined) {
    toCapture.filterHPF = {
      ...toCapture.filterHPF,
      ...(hpfFreqSwell !== undefined ? { frequency: hpfFreqSwell } : {}),
      ...(hpfQSwell !== undefined ? { Q: hpfQSwell } : {}),
    };
  }

  // Delay
  const delayWetSwell = extractGlobalSwellBaseValueIfActive('delay.wet');
  if (delayWetSwell !== undefined) {
    toCapture.delay = { ...toCapture.delay, wet: delayWetSwell };
  }

  // Reverb
  const reverbWetSwell = extractGlobalSwellBaseValueIfActive('reverb.wet');
  if (reverbWetSwell !== undefined) {
    toCapture.reverb = { ...toCapture.reverb, wet: reverbWetSwell };
  }

  // Quantize all fields to eliminate floating-point rounding errors and clean up representation artifacts
  toCapture.compressor = {
    threshold: cleanupFloatingPoint(quantizeToStep(toCapture.compressor.threshold, GLOBAL_AUDIO_SEED_RANGES['compressor.threshold'].min, 1), 0),
    ratio: cleanupFloatingPoint(quantizeToStep(toCapture.compressor.ratio, GLOBAL_AUDIO_SEED_RANGES['compressor.ratio'].min, 1), 0),
    attack: cleanupFloatingPoint(quantizeToStep(toCapture.compressor.attack, GLOBAL_AUDIO_SEED_RANGES['compressor.attack'].min, 0.001), 3),
    release: cleanupFloatingPoint(quantizeToStep(toCapture.compressor.release, GLOBAL_AUDIO_SEED_RANGES['compressor.release'].min, 0.001), 3),
    knee: cleanupFloatingPoint(quantizeToStep(toCapture.compressor.knee, GLOBAL_AUDIO_SEED_RANGES['compressor.knee'].min, 1), 0),
  };
  toCapture.eq3 = {
    low: cleanupFloatingPoint(quantizeToStep(toCapture.eq3.low, GLOBAL_AUDIO_SEED_RANGES['eq3.low'].min, 0.5), 1),
    mid: cleanupFloatingPoint(quantizeToStep(toCapture.eq3.mid, GLOBAL_AUDIO_SEED_RANGES['eq3.mid'].min, 0.5), 1),
    high: cleanupFloatingPoint(quantizeToStep(toCapture.eq3.high, GLOBAL_AUDIO_SEED_RANGES['eq3.high'].min, 0.5), 1),
  };
  toCapture.filterLPF = {
    ...toCapture.filterLPF,
    frequency: cleanupFloatingPoint(quantizeToStep(toCapture.filterLPF.frequency, GLOBAL_AUDIO_SEED_RANGES['filterLPF.frequency'].min, 1), 0),
    Q: cleanupFloatingPoint(quantizeToStep(toCapture.filterLPF.Q, GLOBAL_AUDIO_SEED_RANGES['filterLPF.Q'].min, 0.01), 2),
  };
  toCapture.filterHPF = {
    ...toCapture.filterHPF,
    frequency: cleanupFloatingPoint(quantizeToStep(toCapture.filterHPF.frequency, GLOBAL_AUDIO_SEED_RANGES['filterHPF.frequency'].min, 1), 0),
    Q: cleanupFloatingPoint(quantizeToStep(toCapture.filterHPF.Q, GLOBAL_AUDIO_SEED_RANGES['filterHPF.Q'].min, 0.01), 2),
  };
  toCapture.delay = {
    ...toCapture.delay,
    delayTime: cleanupFloatingPoint(quantizeToStep(toCapture.delay.delayTime, GLOBAL_AUDIO_SEED_RANGES['delay.delayTime'].min, 0.001), 3),
    feedback: cleanupFloatingPoint(quantizeToStep(toCapture.delay.feedback, GLOBAL_AUDIO_SEED_RANGES['delay.feedback'].min, 0.01), 2),
    wet: cleanupFloatingPoint(quantizeToStep(toCapture.delay.wet, GLOBAL_AUDIO_SEED_RANGES['delay.wet'].min, 0.01), 2),
  };
  toCapture.reverb = {
    ...toCapture.reverb,
    decay: cleanupFloatingPoint(quantizeToStep(toCapture.reverb.decay, GLOBAL_AUDIO_SEED_RANGES['reverb.decay'].min, 0.01), 2),
    preDelay: cleanupFloatingPoint(quantizeToStep(toCapture.reverb.preDelay, GLOBAL_AUDIO_SEED_RANGES['reverb.preDelay'].min, 0.01), 2),
    wet: cleanupFloatingPoint(quantizeToStep(toCapture.reverb.wet, GLOBAL_AUDIO_SEED_RANGES['reverb.wet'].min, 0.01), 2),
  };
  toCapture.limiter = {
    threshold: cleanupFloatingPoint(quantizeToStep(toCapture.limiter.threshold, GLOBAL_AUDIO_SEED_RANGES['limiter.threshold'].min, 1), 0),
  };

  // Quantize lfoDrift fields to 0.01 (1% precision in -1..1 range) and clean up floating-point noise
  toCapture.lfoDrift = {
    eq3: {
      rateDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.eq3.rateDrift, -1, 0.01), 2),
      depthDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.eq3.depthDrift, -1, 0.01), 2),
    },
    filterLPF: {
      rateDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.filterLPF.rateDrift, -1, 0.01), 2),
      depthDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.filterLPF.depthDrift, -1, 0.01), 2),
    },
    filterHPF: {
      rateDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.filterHPF.rateDrift, -1, 0.01), 2),
      depthDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.filterHPF.depthDrift, -1, 0.01), 2),
    },
    robots: {
      rateDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.robots.rateDrift, -1, 0.01), 2),
      depthDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.robots.depthDrift, -1, 0.01), 2),
    },
  };

  return toCapture;
}

/**
 * Only the fields that differ from the seed baseline — an untouched robot diffs to `{}`.
 * Deliberately never inspects audioMode, masterVolume, job, docking, or batteryLevel: those
 * aren't part of RobotAudioBaseline at all, so they can't leak into the result (docs/specs/
 * SESSION_STORAGE.md §1.2/§7).
 *
 * When a swell is active at save time, replaces the mid-ramp interpolated value with the
 * captured baseValue, so persisted overrides always contain normalized data regardless of
 * swell phase.
 */
export function computeRobotAudioOverrideDiff(live: Robot, baseline: RobotAudioBaseline): RobotAudioOverrideDiff {
  const diff: RobotAudioOverrideDiff = {};

  // Apply swell base values to adsr fields if swells are active
  const adsrToCapture = { ...live.audioAttributes.adsr };
  for (const field of ['attack', 'decay', 'sustain', 'release'] as const) {
    const swellBase = extractSwellBaseValueIfActive(live.id, `adsr.${field}`);
    if (swellBase !== undefined) adsrToCapture[field] = swellBase;
  }
  if (!deepEqual(adsrToCapture, baseline.audioAttributes.adsr)) diff.adsr = adsrToCapture;

  // Apply swell base values to layer fields if swells are active, with floating-point cleanup.
  // Normalize baseline layers the same way for fair comparison.
  const baselineLayersNormalized = baseline.audioAttributes.layers?.map((layer) => ({
    type: layer.type,
    gain: cleanupFloatingPoint(layer.gain, 2),
    detune: layer.detune,
    phase: layer.phase,
    pulseWidth: layer.pulseWidth,
  }));
  const layersToCapture = live.audioAttributes.layers?.map((layer, layerIndex) => ({
    type: layer.type,
    gain: cleanupFloatingPoint(extractSwellBaseValueIfActive(live.id, `layer${layerIndex}.gain` as SwellRobotAttributeId) ?? layer.gain, 2),
    detune: extractSwellBaseValueIfActive(live.id, `layer${layerIndex}.detune` as SwellRobotAttributeId) ?? layer.detune,
    phase: extractSwellBaseValueIfActive(live.id, `layer${layerIndex}.phase` as SwellRobotAttributeId) ?? layer.phase,
    pulseWidth: extractSwellBaseValueIfActive(live.id, `layer${layerIndex}.pulseWidth` as SwellRobotAttributeId) ?? layer.pulseWidth,
  }));
  if (!deepEqual(layersToCapture, baselineLayersNormalized)) diff.layers = layersToCapture;

  if (!deepEqual(live.audioAttributes.filterFreq, baseline.audioAttributes.filterFreq)) diff.filterFreq = live.audioAttributes.filterFreq;
  if (!deepEqual(live.octaveRange, baseline.octaveRange)) diff.octaveRange = live.octaveRange;
  if (!deepEqual(live.rhythmicDensity, baseline.rhythmicDensity)) diff.rhythmicDensity = live.rhythmicDensity;
  if (!deepEqual(live.rhythmicMotifLength, baseline.rhythmicMotifLength)) diff.rhythmicMotifLength = live.rhythmicMotifLength;
  if (!deepEqual(live.noteVariance, baseline.noteVariance)) diff.noteVariance = live.noteVariance;
  if (!deepEqual(live.pitchRepeat, baseline.pitchRepeat)) diff.pitchRepeat = live.pitchRepeat;
  if (!deepEqual(live.name, baseline.name)) diff.name = live.name;

  const lfoDiff: RobotAudioOverrideDiff['lfoSettings'] = {};
  for (const target of ROBOT_LFO_TARGET_IDS) {
    const liveSetting = live.lfoSettings?.[target];
    const baselineSetting = baseline.lfoSettings[target];
    if (!deepEqual(liveSetting, baselineSetting)) lfoDiff[target] = liveSetting;
  }
  if (Object.keys(lfoDiff).length > 0) diff.lfoSettings = lfoDiff;

  return diff;
}

/** Only the fields that differ from a spawn-generated company's defaults — an untouched company
 *  diffs to `{}`. Never called for user-created companies (spec §1.2 — those persist in full). */
export function computeCompanyDiff(live: Company, spawnDefault: Pick<Company, 'name' | 'robotIds'>): CompanyDiff {
  const diff: CompanyDiff = {};
  if (!deepEqual(live.name, spawnDefault.name)) diff.name = live.name;
  if (!deepEqual(live.robotIds, spawnDefault.robotIds)) diff.robotIds = live.robotIds;
  return diff;
}

/**
 * Assembles a SessionPayload from the currently active Attenuation Style/locale — the diff-on-a-
 * regenerated-roster shape docs/specs/SESSION_STORAGE.md §1.2 describes. An untouched robot or
 * spawn-generated company gets NO key in robotOverrides/companyDiffs (not a key mapping to `{}`),
 * keeping the payload small. A company whose id has no match in the regenerated baseline set is
 * treated as user-created and persisted in full instead of diffed.
 */
export function buildSessionPayload(): SessionPayload {
  const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  const locale = attenuationStyle?.currentLocaleId
    ? useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId)
    : undefined;
  if (!attenuationStyle || !locale) {
    throw new Error('buildSessionPayload: no active Attenuation Style/locale to save a session from');
  }

  const noiseMap = getLocaleNoiseMap(locale.id, locale.coordinates.x, locale.coordinates.y);

  const robotBaselines = generateRobotRosterBaseline(noiseMap, locale.robots.length);
  const robotOverrides: Record<string, RobotAudioOverrideDiff> = {};
  locale.robots.forEach((robot, i) => {
    const diff = computeRobotAudioOverrideDiff(robot, robotBaselines[i]);
    if (Object.keys(diff).length > 0) robotOverrides[robot.id] = diff;
  });

  const robotIdsInSpawnOrder = locale.robots.map((r) => r.id);
  const companyBaselineById = new Map(
    generateCompanyRosterBaseline(noiseMap, robotIdsInSpawnOrder).map((c) => [c.id, c]),
  );

  const companyDiffs: Record<string, CompanyDiff> = {};
  const userCreatedCompanies: Company[] = [];
  for (const company of locale.companies) {
    const baseline = companyBaselineById.get(company.id);
    if (!baseline) {
      userCreatedCompanies.push(company);
      continue;
    }
    const diff = computeCompanyDiff(company, baseline);
    if (Object.keys(diff).length > 0) companyDiffs[company.id] = diff;
  }

  return {
    version: 1,
    attenuationStyleName: attenuationStyle.name,
    coordinates: locale.coordinates,
    globalAudio: applyGlobalSwellBasesToAudio(useAudioStore.getState().globalAudio),
    robotOverrides,
    companyDiffs,
    userCreatedCompanies,
  };
}

/** Builds the Partial<Robot> update object for one robot's override diff — merging into the
 *  live audioAttributes/lfoSettings rather than replacing them wholesale, since a diff only ever
 *  carries the fields that actually changed. */
function buildRobotUpdates(robot: Robot, diff: RobotAudioOverrideDiff): Partial<Robot> {
  const updates: Partial<Robot> = {};
  if (diff.adsr !== undefined || diff.layers !== undefined || diff.filterFreq !== undefined) {
    updates.audioAttributes = {
      ...robot.audioAttributes,
      ...(diff.adsr !== undefined ? { adsr: diff.adsr } : {}),
      ...(diff.layers !== undefined ? { layers: diff.layers } : {}),
      ...(diff.filterFreq !== undefined ? { filterFreq: diff.filterFreq } : {}),
    };
  }
  if (diff.octaveRange !== undefined) updates.octaveRange = diff.octaveRange;
  if (diff.rhythmicDensity !== undefined) updates.rhythmicDensity = diff.rhythmicDensity;
  if (diff.rhythmicMotifLength !== undefined) updates.rhythmicMotifLength = diff.rhythmicMotifLength;
  if (diff.noteVariance !== undefined) updates.noteVariance = diff.noteVariance;
  if (diff.pitchRepeat !== undefined) updates.pitchRepeat = diff.pitchRepeat;
  if (diff.name !== undefined) updates.name = diff.name;
  if (diff.lfoSettings !== undefined) {
    updates.lfoSettings = { ...robot.lfoSettings, ...diff.lfoSettings } as Record<RobotLfoTargetId, LfoSettings>;
  }
  return updates;
}

/** Reapplies a company's target membership (diff.robotIds — the FULL final list, not a delta)
 *  onto the freshly-regenerated locale: removes every current member not in the target list
 *  (back to Freelance) and assigns every target member, via localeStore.assignRobotToCompany —
 *  never a direct robotIds write, which would leave member robots' own companyId out of sync
 *  (docs/specs/SESSION_STORAGE.md §7 item 8). */
function reapplyCompanyMembership(localeId: string, companyId: string, targetRobotIds: string[]): void {
  const currentMembers = useLocaleStore.getState().getLocaleById(localeId)?.companies.find((c) => c.id === companyId)?.robotIds ?? [];
  for (const robotId of currentMembers) {
    if (!targetRobotIds.includes(robotId)) useLocaleStore.getState().assignRobotToCompany(localeId, robotId, null);
  }
  for (const robotId of targetRobotIds) {
    useLocaleStore.getState().assignRobotToCompany(localeId, robotId, companyId);
  }
}

/**
 * Regenerates the world from payload.attenuationStyleName/coordinates via worldTransition.ts's
 * existing retransmitWorld — never a parallel regeneration path (spec §7 risk 7) — then overlays
 * globalAudio, every robot override, every company diff, and every user-created company on top.
 */
export function applySessionPayload(payload: SessionPayload, options?: { skipLocaleRebuild?: boolean }): void {
  // worldTransition.ts's createNewAttenuationStyle always tries to CREATE a new Attenuation
  // Style for a given name (never "reuse the existing one with this name") and doesn't check
  // whether that creation actually succeeded — attenuationStyleStore.addAttenuationStyle silently
  // refuses (returns false, does not append) when the name is already taken. Passing
  // attenuationStyleName whenever it's unchanged from the CURRENTLY active one — which is the
  // common case for loading a session, e.g. reloading your own recent save — would hit that
  // silent-refusal path and corrupt the store (currentAttenuationStyleId left dangling after the
  // old entry is removed). Omitting attenuationStyleName when it's unchanged routes through
  // retransmitWorld's coordsOnly branch instead, which explicitly preserves the current
  // Attenuation Style untouched — exactly correct for this case, and the one this codebase's own
  // UI already relies on (SectorSettingsDrawer only ever sends attenuationStyleName when the
  // field was actually edited). A payload naming a DIFFERENT Attenuation Style still uses the
  // normal path; the same collision risk could in principle recur if that different name happens
  // to already exist elsewhere in the store, which is not handled here (see docs/specs/
  // SESSION_STORAGE.md §7 item 8's follow-up note).
  //
  // skipLocaleRebuild: true (docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md §4.2/§7 item 2) skips
  // this whole retransmitWorld call -- used only by the shareable-link boot path, which has
  // already built the correct locale before this function runs (via the early
  // attenuationStyleName/coordinates override in attenuationStyleStore.ts/localeStore.ts), so
  // calling retransmitWorld here would unconditionally tear it down and rebuild it a second time
  // in the same boot (resolveRetransmitAction has no "already correct" short-circuit).
  if (!options?.skipLocaleRebuild) {
    const currentAttenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
    const attenuationStyleUnchanged = currentAttenuationStyle?.name === payload.attenuationStyleName;
    retransmitWorld(
      attenuationStyleUnchanged
        ? { coordinates: payload.coordinates }
        : { attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates },
    );
  }

  useAudioStore.setState({ globalAudio: payload.globalAudio });
  applyGlobalAudioToEngine(payload.globalAudio);

  const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  const localeId = attenuationStyle?.currentLocaleId;
  if (!localeId) return;
  const freshLocale = useLocaleStore.getState().getLocaleById(localeId);
  if (!freshLocale) return;

  for (const robot of freshLocale.robots) {
    const diff = payload.robotOverrides[robot.id];
    if (!diff) continue;
    const updates = buildRobotUpdates(robot, diff);
    if (Object.keys(updates).length === 0) continue;
    useLocaleStore.getState().updateRobot(localeId, robot.id, updates);
    // Deterministic Robot Melody Generation (Roadmap Phase 31): buildRobotUpdates only patches
    // plain attribute fields -- it never touches `melody` itself. Without regenerating here, a
    // restored robot's melody would still reflect the FRESH seed-baseline attributes retransmitWorld
    // just spawned it with, not the overridden ones applied above, even though compositionSeed
    // (never diffed, always re-derived identically from the seed) makes the regenerated result
    // exactly match what the robot sounded like at save time.
    // Re-reads from the store rather than spreading `{ ...robot, ...updates }` by hand: updateRobot
    // above normalizes several of these same fields (rhythmicDensity/pitchRepeat/rhythmicMotifLength/
    // noteVariance/octaveRange are all clamped or reshaped there) -- regenerating from the raw,
    // pre-normalization `updates` object could feed regenerateMelody a value that diverges from
    // what's actually persisted (code review follow-up, confirmed by a reproduction test with an
    // out-of-range diff value).
    const updatedRobot = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
    if (updatedRobot) regenerateMelody(updatedRobot, localeId);
  }

  for (const company of freshLocale.companies) {
    const diff = payload.companyDiffs[company.id];
    if (!diff) continue;
    if (diff.name !== undefined) useLocaleStore.getState().updateCompany(localeId, company.id, { name: diff.name });
    if (diff.robotIds !== undefined) reapplyCompanyMembership(localeId, company.id, diff.robotIds);
  }

  for (const company of payload.userCreatedCompanies) {
    useLocaleStore.getState().addCompany(localeId, company);
    reapplyCompanyMembership(localeId, company.id, company.robotIds);
  }
}
