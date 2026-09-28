// ========================================
// IMPORTS
// ========================================
import {
  AUTOSAVE_ROTATING_SLOT_IDS,
  MAX_AUTOSAVES_PER_SESSION,
  LAST_UNSAVED_SESSION_KEY,
  type SessionEntry,
  type SessionPayload,
  type AutosaveSlotId,
  type AutosaveHistory,
} from '../types/session';
import { devWarn } from './helpers';

// ========================================
// TYPES
// ========================================

/** The autosave write request Task 7 (sessionAutosave.ts) makes — 'rotating' resolves internally
 *  to whichever of the 5 unsaved-N slots is next in the FIFO cursor; 'draft' always targets the
 *  single dedicated draft slot. Callers never name a specific unsaved-N slot directly — that
 *  bookkeeping belongs entirely to this module (docs/specs/SESSION_STORAGE.md §7 item 4: the
 *  spec's original saveAutosaveSlot(slotId, ...) signature was a first-pass proposal, not
 *  load-bearing; this shape keeps the rotation cursor fully encapsulated here). */
export type AutosaveWriteMode = 'rotating' | 'draft';

interface SessionsStorageShape {
  named: Record<string, SessionEntry>;
  autosave: Partial<Record<AutosaveSlotId, SessionEntry>>;
  /** FIFO write cursor for the 5 rotating slots — index into AUTOSAVE_ROTATING_SLOT_IDS. */
  nextRotatingIndex: number;
  /** Session Autosave History (docs/specs/SESSION_AUTOSAVE_HISTORY.md) — supersedes `autosave`/
   *  `nextRotatingIndex` above, which are kept temporarily until sessionAutosave.ts and
   *  SessionListItem.tsx migrate off them. Keyed by session name; cascade-deleted with the
   *  session in deleteNamedSession. */
  namedAutosaves: Record<string, AutosaveHistory>;
  /** Written to on every autosave tick while no named session is loaded. Never surfaced to the
   *  UI directly — only promoted into unsavedLast at boot. */
  unsavedCurrent: AutosaveHistory;
  /** A frozen copy of whatever unsavedCurrent held as of the previous app boot — the one bucket
   *  listUnsavedLastAutosaves() surfaces as a row. */
  unsavedLast: AutosaveHistory;
}

// ========================================
// CONSTANTS
// ========================================

export const STORAGE_KEY = 'trace-atlas.sessions.v1';

function emptyStorage(): SessionsStorageShape {
  return { named: {}, autosave: {}, nextRotatingIndex: 0, namedAutosaves: {}, unsavedCurrent: [], unsavedLast: [] };
}

// ========================================
// PRIVATE HELPERS
// ========================================

/** Fails soft on missing/corrupted data — malformed JSON or a shape that doesn't look like
 *  SessionsStorageShape both fall back to a fresh empty store, never throwing into a caller. */
function readStorage(): SessionsStorageShape {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyStorage();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.named !== 'object' || typeof parsed.autosave !== 'object') {
      return emptyStorage();
    }
    return {
      named: parsed.named ?? {},
      autosave: parsed.autosave ?? {},
      nextRotatingIndex: typeof parsed.nextRotatingIndex === 'number' ? parsed.nextRotatingIndex : 0,
      namedAutosaves: parsed.namedAutosaves ?? {},
      unsavedCurrent: Array.isArray(parsed.unsavedCurrent) ? parsed.unsavedCurrent : [],
      unsavedLast: Array.isArray(parsed.unsavedLast) ? parsed.unsavedLast : [],
    };
  } catch (err) {
    devWarn('[sessionStorageEngine] corrupted session storage, starting fresh', err);
    return emptyStorage();
  }
}

function writeStorage(data: SessionsStorageShape): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ========================================
// FUNCTIONS
// ========================================

/** Overwrites the entry named `name` in place if it already exists (name is the storage key,
 *  not a separate id — docs/specs/SESSION_STORAGE.md §1); otherwise creates a new one. */
export function saveNamedSession(name: string, payload: SessionPayload): void {
  const data = readStorage();
  data.named[name] = { name, savedAt: Date.now(), payload };
  writeStorage(data);
}

/** 'rotating' writes to the next of the 5 unsaved-N slots in FIFO order (wrapping back to slot 0
 *  after slot 4); 'draft' always writes the single dedicated draft slot. Neither mode ever
 *  touches `named`. */
export function saveAutosaveSlot(mode: AutosaveWriteMode, payload: SessionPayload): void {
  const data = readStorage();
  if (mode === 'draft') {
    data.autosave.draft = { name: 'draft', savedAt: Date.now(), payload };
  } else {
    const slotId = AUTOSAVE_ROTATING_SLOT_IDS[data.nextRotatingIndex];
    data.autosave[slotId] = { name: slotId, savedAt: Date.now(), payload };
    data.nextRotatingIndex = (data.nextRotatingIndex + 1) % AUTOSAVE_ROTATING_SLOT_IDS.length;
  }
  writeStorage(data);
}

/** Removes the named entry AND its own autosave history (docs/specs/SESSION_AUTOSAVE_HISTORY.md
 *  §7 item 1) — an orphaned namedAutosaves entry could never be reached once its parent row is
 *  gone. Never touches an old-scheme autosave slot, even one that happens to share the same
 *  string (a user naming a session "draft" is a distinct entry from the draft slot). */
export function deleteNamedSession(name: string): void {
  const data = readStorage();
  delete data.named[name];
  delete data.namedAutosaves[name];
  writeStorage(data);
}

/** Removes one autosave slot — a rotating slot or the draft slot — never a named entry, even one
 *  sharing the same string (e.g. a user naming a session "draft"). Deleting an empty slot is a
 *  harmless no-op. The FIFO cursor is untouched: a rotating slot that's been deleted simply stays
 *  absent until the cursor comes back around to it on a later write. */
export function deleteAutosaveSlot(slotId: AutosaveSlotId): void {
  const data = readStorage();
  delete data.autosave[slotId];
  writeStorage(data);
}

/** Every named entry plus every populated autosave slot, for the "Load Sessions" list. */
export function listSessions(): SessionEntry[] {
  const data = readStorage();
  return [...Object.values(data.named), ...Object.values(data.autosave)] as SessionEntry[];
}

/** Looks up a session's payload by its key — a saved name or an autosave slot id (`'draft'`,
 *  `'unsaved-0'`..`'unsaved-4'`). Returns `undefined` if nothing matches, never throws. */
export function loadSession(key: string): SessionPayload | undefined {
  const data = readStorage();
  return data.named[key]?.payload ?? data.autosave[key as AutosaveSlotId]?.payload;
}

// ========================================
// SESSION AUTOSAVE HISTORY (docs/specs/SESSION_AUTOSAVE_HISTORY.md)
// ========================================

/** Pushes a new entry onto a history array, capping it at MAX_AUTOSAVES_PER_SESSION by evicting
 *  the oldest (index 0) — shared by both the per-session and the unsaved-bucket write paths. */
function pushCapped(history: AutosaveHistory, entry: SessionEntry): AutosaveHistory {
  const next = [...history, entry];
  return next.length > MAX_AUTOSAVES_PER_SESSION ? next.slice(next.length - MAX_AUTOSAVES_PER_SESSION) : next;
}

/** Sorted newest-first by savedAt — the display convention every history list follows. */
function sortedDesc(history: AutosaveHistory): AutosaveHistory {
  return [...history].sort((a, b) => b.savedAt - a.savedAt);
}

/** Writes one autosave tick into a named session's own rotating history (up to
 *  MAX_AUTOSAVES_PER_SESSION entries) — never touches `named[name]` itself, and never any other
 *  session's history. */
export function saveNamedSessionAutosave(name: string, payload: SessionPayload): void {
  const data = readStorage();
  const existing = data.namedAutosaves[name] ?? [];
  data.namedAutosaves[name] = pushCapped(existing, { name, savedAt: Date.now(), payload });
  writeStorage(data);
}

/** A named session's own autosave history, newest first. `[]` if none exist — never throws. */
export function listNamedSessionAutosaves(name: string): SessionEntry[] {
  const data = readStorage();
  return sortedDesc(data.namedAutosaves[name] ?? []);
}

/** Writes one autosave tick into the unsaved "current" bucket — used whenever no named session
 *  is loaded. Never surfaced to the UI directly; only promoteUnsavedHistoryOnBoot() moves it
 *  somewhere visible. */
export function saveUnsavedAutosave(payload: SessionPayload): void {
  const data = readStorage();
  data.unsavedCurrent = pushCapped(data.unsavedCurrent, { name: LAST_UNSAVED_SESSION_KEY, savedAt: Date.now(), payload });
  writeStorage(data);
}

/** Moves the full contents of the unsaved "current" bucket into "last" (overwriting whatever
 *  "last" held, never merging), then empties "current". Intended to run exactly once per real app
 *  boot — see sessionAutosave.ts's startSessionAutosave(). */
export function promoteUnsavedHistoryOnBoot(): void {
  const data = readStorage();
  data.unsavedLast = data.unsavedCurrent;
  data.unsavedCurrent = [];
  writeStorage(data);
}

/** The unsaved "last" bucket's history, newest first. `[]` if nothing was ever promoted — never
 *  throws. An empty result means the unsaved-history row itself should not render. */
export function listUnsavedLastAutosaves(): SessionEntry[] {
  const data = readStorage();
  return sortedDesc(data.unsavedLast);
}
