// ========================================
// IMPORTS
// ========================================
// (none — pure string parsing, read once from the URL at module load, same as seedUtils.ts)

// ========================================
// TYPES
// ========================================

/** The Web Audio `AudioContextLatencyCategory` values. */
export type LatencyHint = 'interactive' | 'balanced' | 'playback';

// ========================================
// FUNCTIONS
// ========================================

/**
 * Parse a `?latency=` URL param. Only the three standard latency categories are accepted
 * (case-insensitive); anything else returns `null`, i.e. "leave Tone on its default".
 */
export function parseLatencyParam(raw: string | null | undefined): LatencyHint | null {
  const value = raw?.toLowerCase();
  return value === 'interactive' || value === 'balanced' || value === 'playback' ? value : null;
}

/**
 * Parse a `?debug` URL param. Present (including the bare `?debug`, which arrives as an empty
 * string) means on; absent or an explicit `0`/`false`/`off` means off.
 */
export function parseDebugParam(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return false;
  const value = raw.toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off';
}

/**
 * Parse a `?notes=` URL param, the note cloud's A/B switch (ROBOT_NOTE_CLOUD.md §1.6, §7.2 A8).
 * Only an explicit `off`/`0`/`false` (case-insensitive) turns the cloud off; absent, a bare
 * `?notes` and anything else leave it on.
 */
export function parseNotesParam(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  const value = raw.toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off';
}

// ========================================
// BOOT-TIME URL READ (browser only)
// ========================================

let LATENCY_OVERRIDE: LatencyHint | null = null;
let DEBUG_ENABLED = false;
let NOTE_CLOUD_ENABLED = true;

if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  LATENCY_OVERRIDE = parseLatencyParam(params.get('latency'));
  DEBUG_ENABLED = parseDebugParam(params.get('debug'));
  NOTE_CLOUD_ENABLED = parseNotesParam(params.get('notes'));
}

/** The `?latency=` override, or `null` when none was given (or it was invalid). */
export function getLatencyOverride(): LatencyHint | null {
  return LATENCY_OVERRIDE;
}

/** Whether `?debug` asked for the on-screen audio diagnostics readout. */
export function isDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}

/** Whether the note cloud is drawn: false only under `?notes=off` (or `0`/`false`). */
export function isNoteCloudEnabled(): boolean {
  return NOTE_CLOUD_ENABLED;
}
