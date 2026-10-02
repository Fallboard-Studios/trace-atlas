/**
 * Session Storage (Roadmap Phase 20, docs/specs/SESSION_STORAGE.md) — local save/load payload
 * shapes. A saved session is a diff on top of a freshly regenerated world, never a full snapshot:
 * see docs/specs/SESSION_STORAGE.md §1.2 for exactly which fields are (and are not) persisted.
 */
import type { ADSREnvelope } from './Robot';
import type { OscillatorLayer } from './layeredAudio';
import type { Company } from './Company';
import type { GlobalAudioSettings } from './globalAudio';
import type { RobotLfoTargetId, GlobalLfoTargetId, LfoLaneId, LfoLink, BankLfoSettings } from './lfo';

/**
 * Only the audio-relevant fields a robot's Robot Options can override — never job assignment,
 * docking state, battery level, audioMode, or masterVolume (explicitly excluded, spec §1.2/§7).
 * Every field optional: an untouched field is simply absent, not present-with-a-default value.
 */
export interface RobotAudioOverrideDiff {
  adsr?: ADSREnvelope;
  layers?: OscillatorLayer[];
  /** AudioAttributes.filterFreq — the robot's seeded bus low-pass cutoff (Hz). Seeded only, no UI
   *  control today; "Transducer Pressure" is the Volume slider's lore label, not this field's. */
  filterFreq?: number;
  rhythmicDensity?: number;
  rhythmicMotifLength?: { active: boolean; value: number };
  noteVariance?: { active: boolean; value: number };
  pitchRepeat?: number;
  octaveRange?: [number, number];
  name?: string;
  /** Only the targets whose link differs from the spawn seed baseline (LFO Bank, docs/tasks/
   *  LFO_BANK.md Task 18) — an untouched target has no key here, same "absent means untouched"
   *  contract every other field on this interface already follows. */
  lfoLinks?: Partial<Record<RobotLfoTargetId, LfoLink>>;
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
export type SessionPayloadVersion = 1 | 2;

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
  /** The LFO Bank's 4 lanes and the 7 global-chain links (docs/tasks/LFO_BANK.md Task 18) —
   *  always captured whole (never diffed, same treatment as globalAudio itself: there's no
   *  meaningful "untouched" baseline for a world-level lane/link set). Optional only so a payload
   *  saved before this field existed (version 1) still decodes — applySessionPayload leaves the
   *  freshly-seeded value untouched when absent, same convention as the pacing fields below. */
  lfoBank?: Record<LfoLaneId, BankLfoSettings>;
  globalLfoLinks?: Record<GlobalLfoTargetId, LfoLink>;
  /** Pacing section fields — audioStore state, not part of GlobalAudioSettings. Freely
   *  user-editable and (bpm aside) carried forward across Attenuation Style switches, so they
   *  can't be re-derived from attenuationStyleName/coordinates alone and must be captured
   *  explicitly. Optional so an older payload (pre this field) still decodes: applySessionPayload
   *  leaves whatever retransmitWorld/regenerateGlobalAudioFromSeed already produced untouched
   *  when a field is absent, rather than defaulting to 0. */
  bpm?: number;
  swellFrequency?: number;
  swellDuration?: number;
  pingVarianceAutomation?: number;
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
