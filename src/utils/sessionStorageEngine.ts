// ========================================
// IMPORTS
// ========================================
import { MAX_AUTOSAVES_PER_SESSION, LAST_UNSAVED_SESSION_KEY, type SessionEntry, type SessionPayload, type AutosaveHistory } from '../types/session';
import { devWarn } from './helpers';

// ========================================
// TYPES
// ========================================

interface SessionsStorageShape {
  named: Record<string, SessionEntry>;
  /** Session Autosave History (docs/specs/SESSION_AUTOSAVE_HISTORY.md) — supersedes the old
   *  5-rotating-slot-plus-1-draft-slot scheme. A pre-existing user's old `autosave`/
   *  `nextRotatingIndex` keys, if present in already-saved localStorage data, are simply ignored
   *  by every function below rather than migrated (spec §7 item 6) — they're dropped from storage
   *  entirely the next time anything here calls writeStorage. Keyed by session name;
   *  cascade-deleted with the session in deleteNamedSession. */
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
  return { named: {}, namedAutosaves: {}, unsavedCurrent: [], unsavedLast: [] };
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
    if (!parsed || typeof parsed !== 'object' || typeof parsed.named !== 'object') {
      return emptyStorage();
    }
    return {
      named: parsed.named ?? {},
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

/** Every named entry, for the "Load Sessions" list — autosave history is fetched separately per
 *  row (listNamedSessionAutosaves/listUnsavedLastAutosaves), never mixed into this flat list. */
export function listSessions(): SessionEntry[] {
  const data = readStorage();
  return Object.values(data.named);
}

/** Looks up a named session's payload by name. Returns `undefined` if nothing matches, never
 *  throws. */
export function loadSession(name: string): SessionPayload | undefined {
  const data = readStorage();
  return data.named[name]?.payload;
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

/** Sorted newest-first by savedAt — the display convention every history list follows. Reverses
 *  before the (stable) sort so that entries sharing the exact same millisecond still resolve by
 *  write order (most-recently-pushed first) rather than silently falling back to array order,
 *  which pushCapped always builds oldest-first. */
function sortedDesc(history: AutosaveHistory): AutosaveHistory {
  return [...history].reverse().sort((a, b) => b.savedAt - a.savedAt);
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

/** Clears the entire unsavedLast bucket — the unsaved-history row's own top-level Delete action.
 *  Never touches unsavedCurrent or any named session's own history. A harmless no-op when there's
 *  nothing to clear. */
export function deleteUnsavedHistory(): void {
  const data = readStorage();
  data.unsavedLast = [];
  writeStorage(data);
}
