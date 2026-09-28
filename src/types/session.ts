/**
 * Session Storage (Roadmap Phase 20, docs/specs/SESSION_STORAGE.md) — local save/load payload
 * shapes. A saved session is a diff on top of a freshly regenerated world, never a full snapshot:
 * see docs/specs/SESSION_STORAGE.md §1.2 for exactly which fields are (and are not) persisted.
 */
import type { ADSREnvelope } from './Robot';
import type { OscillatorLayer } from './layeredAudio';
import type { RobotLfoTargetId, LfoSettings } from './lfo';
import type { Company } from './Company';
import type { GlobalAudioSettings } from './globalAudio';

/**
 * Only the audio-relevant fields a robot's Robot Options can override — never job assignment,
 * docking state, battery level, audioMode, or masterVolume (explicitly excluded, spec §1.2/§7).
 * Every field optional: an untouched field is simply absent, not present-with-a-default value.
 */
export interface RobotAudioOverrideDiff {
  adsr?: ADSREnvelope;
  layers?: OscillatorLayer[];
  /** AudioAttributes.filterFreq — "transducer pressure ratio" in UI lore copy. */
  filterFreq?: number;
  rhythmicDensity?: number;
  rhythmicMotifLength?: { active: boolean; value: number };
  noteVariance?: { active: boolean; value: number };
  pitchRepeat?: number;
  octaveRange?: [number, number];
  lfoSettings?: Partial<Record<RobotLfoTargetId, LfoSettings>>;
  name?: string;
}

/** A spawn-generated company's diff — membership and/or a rename. User-created companies (no
 *  seed to regenerate from) are never represented this way; see SessionPayload.userCreatedCompanies. */
export interface CompanyDiff {
  name?: string;
  robotIds?: string[];
}

/** Payload schema version, independent of sessionStorageEngine.ts's own storage-key version
 *  (which only versions the local blob). This field travels WITH the payload — the only version
 *  marker still present once a payload is exported/imported outside this browser (roadmap Phase
 *  21, which depends on this phase). Unused by this phase's own code; it exists purely so a
 *  future importer can distinguish payload shapes, which isn't retrofittable after sessions
 *  already exist without it. */
export type SessionPayloadVersion = 1;

export interface SessionPayload {
  version: SessionPayloadVersion;
  /** This codebase has no literal "seed" field. Locale/robot generation keys off {x, y} alone
   *  (noiseMaps.ts's getLocaleNoiseMap); Audio Rig/global-LFO generation keys off the
   *  Attenuation Style's NAME alone (deriveAttenuationStyleSeed) — its id is a random bookkeeping
   *  value, never a seed input. Maps directly onto worldTransition.ts's existing
   *  retransmitWorld({ attenuationStyleName, coordinates }) entry point. */
  attenuationStyleName: string;
  coordinates: { x: number; y: number };
  globalAudio: GlobalAudioSettings;
  /** Keyed by robot id. An untouched robot has no entry (not an entry equal to {}). */
  robotOverrides: Record<string, RobotAudioOverrideDiff>;
  /** Keyed by the company's deterministic spawn-generated id. */
  companyDiffs: Record<string, CompanyDiff>;
  /** User-created companies (crypto.randomUUID() ids) persist as full objects — no seed to
   *  regenerate them from, per docs/SESSION_STORAGE.md's original treatment. */
  userCreatedCompanies: Company[];
}

export interface SessionEntry {
  /** The storage key for a named session — saving under an existing name overwrites this entry. */
  name: string;
  savedAt: number;
  payload: SessionPayload;
}

/**
 * Session Autosave History (docs/specs/SESSION_AUTOSAVE_HISTORY.md) — supersedes the old 6-slot
 * scheme (5 rotating "Unsaved Session" slots plus 1 shared draft slot, formerly AutosaveSlotId/
 * AUTOSAVE_ROTATING_SLOT_IDS/isAutosaveSlotName here), removed once sessionAutosave.ts and
 * SessionListItem.tsx — its only consumers — both migrated off it.
 */

/** Every autosave history bucket (a named session's own, or one of the two unsaved buckets)
 *  holds at most this many entries — a 4th write evicts the oldest. */
export const MAX_AUTOSAVES_PER_SESSION = 3;

/** 0 to MAX_AUTOSAVES_PER_SESSION entries. Storage order is not meaningful — always sort by
 *  savedAt (descending) for display. */
export type AutosaveHistory = SessionEntry[];

/** Stable identifier for the single visible unsaved-history row — it has no user-given name
 *  (unlike a named session) so needs a sentinel distinct from any real session name. Never
 *  written to localStorage as a key into `named`. */
export const LAST_UNSAVED_SESSION_KEY = '__last-unsaved-session__';
