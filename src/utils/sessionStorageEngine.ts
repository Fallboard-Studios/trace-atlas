// ========================================
// IMPORTS
// ========================================
import type { SessionEntry, SessionPayload } from '../types/session';
import { devWarn } from './helpers';

// ========================================
// TYPES
// ========================================

interface SessionsStorageShape {
  named: Record<string, SessionEntry>;
}

// ========================================
// CONSTANTS
// ========================================

export const STORAGE_KEY = 'trace-atlas.sessions.v1';

function emptyStorage(): SessionsStorageShape {
  return { named: {} };
}

// ========================================
// PRIVATE HELPERS
// ========================================

/** Fails soft on missing/corrupted data — malformed JSON or a shape that doesn't look like
 *  SessionsStorageShape both fall back to a fresh empty store, never throwing into a caller.
 *  Extra keys from an earlier storage shape (this phase's own now-cut namedAutosaves/
 *  unsavedCurrent/unsavedLast, or the older pre-Phase-20 autosave/nextRotatingIndex pair) are
 *  simply ignored here, not migrated — they're dropped from storage entirely the next time
 *  anything below calls writeStorage. */
function readStorage(): SessionsStorageShape {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyStorage();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.named !== 'object') {
      return emptyStorage();
    }
    return { named: parsed.named ?? {} };
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

/** Removes the named entry. */
export function deleteNamedSession(name: string): void {
  const data = readStorage();
  delete data.named[name];
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
