/**
 * The per-field merge (Roadmap Phase 10) that makes "revert to the last state it was in when
 * last editing, or the first member robot's options if unused" true without a special-cased
 * first-edit branch: an untouched field falls back live to the first member's current value;
 * a field that HAS been edited reads from its own recorded snapshot instead. See
 * docs/specs/COMPANIES.md §7.1 for why this is a deliberate simplification over literally
 * cloning the first member's values into the snapshot at first-edit time — functionally
 * identical from the user's perspective, without ever storing a stale duplicate of a field that
 * was never actually edited.
 *
 * Takes the snapshot directly (`Company.lastEditedOptions`, or, for the "All" selection —
 * highlighting every robot regardless of company, CompanyButtonRow's All button —
 * `Locale.allRobotsLastEditedOptions`) rather than a whole `Company`, since that's genuinely all
 * this function ever reads; both CompanyOptionsSection call sites share this one resolver.
 */
import { DEFAULT_RHYTHMIC_DENSITY, DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE, DEFAULT_PITCH_REPEAT } from '@/engine/melodyGenerator';
import type { CompanyOptionsSnapshot } from '@/types/Company';
import type { Robot } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';

// Stable fallback references (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md follow-up, 2026-09-15)
// — `resolveCompanyOptions` is called on every render of `CompanyOptionsSection` (via a `useMemo`
// keyed on its own real inputs), so a fallback that constructs a fresh object/array literal every
// call defeats that memoization even when the underlying robot data hasn't changed. Only `layers`
// (previously `[]`) and `lfoSettings` (previously `{}`) had this (and the since-removed `volumeLfo`) — `rhythmicMotifLength`/`noteVariance` already returned their shared
// default reference directly, unspread. Nothing downstream mutates a `CompanyOptionsSnapshot`
// field in place (every consumer spreads: `{ ...value, field }`), so returning these shared
// references directly, instead of defensive copies, is behavior-neutral.
const EMPTY_LAYERS: OscillatorLayer[] = [];
const EMPTY_LFO_SETTINGS: NonNullable<CompanyOptionsSnapshot['lfoSettings']> = {};
const EMPTY_LFO_LINKS: NonNullable<CompanyOptionsSnapshot['lfoLinks']> = {};

export function resolveCompanyOptions(lastEditedOptions: CompanyOptionsSnapshot | undefined, firstMember: Robot): Required<CompanyOptionsSnapshot> {
  const fromRobot: Required<CompanyOptionsSnapshot> = {
    audioMode: firstMember.audioMode ?? 'none',
    masterVolume: firstMember.masterVolume,
    rhythmicDensity: firstMember.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY,
    rhythmicMotifLength: firstMember.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
    noteVariance: firstMember.noteVariance ?? DEFAULT_NOTE_VARIANCE,
    octaveRange: firstMember.octaveRange,
    adsr: firstMember.audioAttributes.adsr,
    layers: firstMember.audioAttributes.layers ?? EMPTY_LAYERS,
    lfoSettings: firstMember.lfoSettings ?? EMPTY_LFO_SETTINGS,
    lfoLinks: firstMember.lfoLinks ?? EMPTY_LFO_LINKS,
    clickTrackActive: firstMember.clickTrackActive ?? false,
    pitchRepeat: firstMember.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
  };
  return { ...fromRobot, ...lastEditedOptions };
}

/**
 * Diffs two versions of the same compound control value (an ADSREnvelope, an LfoValue, a
 * StepperWithToggleValue, one OscillatorLayer) and returns a patch containing only the one field
 * that actually changed. Every compound control in this codebase (Lfo, PingContourDrawer,
 * StepperWithToggle, SignatureArrayDrawer's per-layer edits) builds its onChange payload as
 * `{ ...currentValue, oneField: newValue }` — the *whole* object, with the touched value's shared
 * baseline (CompanyOptionsSection's `resolved`) spread across every other field. Broadcasting that
 * whole object to every member would silently overwrite each member's own untouched sub-fields
 * with whatever the panel's baseline happened to hold, rather than leaving them alone. Callers
 * diff `resolved`'s old value against the new one to find the single changed key, then merge just
 * that key onto each member's own current value before broadcasting — see
 * CompanyOptionsSection.tsx and docs/COMPANIES.md "Editing Semantics: Broadcast, Not Link".
 */
export function diffCompoundField<T extends object>(prev: T, next: T): Partial<T> {
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (!Object.is(prev[key], next[key])) return { [key]: next[key] } as Partial<T>;
  }
  return {};
}

/** Same idea as diffCompoundField, but for the 3-slot Signature Array `layers` list — finds which
 *  one layer index changed and, within it, which one field, so a broadcast can patch just that
 *  field onto each member's own layer instead of overwriting all 3 layers wholesale. Returns null
 *  if no field differs anywhere (defensive; every real edit changes exactly one). */
export function diffLayerField(
  prev: OscillatorLayer[],
  next: OscillatorLayer[]
): { idx: number; patch: Partial<OscillatorLayer> } | null {
  for (let i = 0; i < next.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (!p || !n) continue;
    const patch = diffCompoundField(p, n);
    if (Object.keys(patch).length > 0) return { idx: i, patch };
  }
  return null;
}
