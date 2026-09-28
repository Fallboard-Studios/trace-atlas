// ========================================
// IMPORTS
// ========================================
import type { Robot } from '../types/Robot';
import type { Company } from '../types/Company';
import { generateRobotRosterBaseline, generateCompanyRosterBaseline, type RobotAudioBaseline } from '../systems/spawnSystem';
import type { RobotAudioOverrideDiff, CompanyDiff, SessionPayload } from '../types/session';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId, type LfoSettings } from '../types/lfo';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../stores/attenuationStyleStore';
import { useLocaleStore } from '../stores/localeStore';
import { useAudioStore, applyGlobalAudioToEngine } from '../stores/audioStore';
import { getLocaleNoiseMap } from './noiseMaps';
import { retransmitWorld } from '../systems/worldTransition';

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

/**
 * Only the fields that differ from the seed baseline — an untouched robot diffs to `{}`.
 * Deliberately never inspects audioMode, masterVolume, job, docking, or batteryLevel: those
 * aren't part of RobotAudioBaseline at all, so they can't leak into the result (docs/specs/
 * SESSION_STORAGE.md §1.2/§7).
 */
export function computeRobotAudioOverrideDiff(live: Robot, baseline: RobotAudioBaseline): RobotAudioOverrideDiff {
  const diff: RobotAudioOverrideDiff = {};

  if (!deepEqual(live.audioAttributes.adsr, baseline.audioAttributes.adsr)) diff.adsr = live.audioAttributes.adsr;
  if (!deepEqual(live.audioAttributes.layers, baseline.audioAttributes.layers)) diff.layers = live.audioAttributes.layers;
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
    globalAudio: useAudioStore.getState().globalAudio,
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
export function applySessionPayload(payload: SessionPayload): void {
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
  const currentAttenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  const attenuationStyleUnchanged = currentAttenuationStyle?.name === payload.attenuationStyleName;
  retransmitWorld(
    attenuationStyleUnchanged
      ? { coordinates: payload.coordinates }
      : { attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates },
  );

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
    if (Object.keys(updates).length > 0) useLocaleStore.getState().updateRobot(localeId, robot.id, updates);
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
