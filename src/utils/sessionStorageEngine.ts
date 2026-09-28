// ========================================
// IMPORTS
// ========================================
import { AUTOSAVE_ROTATING_SLOT_IDS, type SessionEntry, type SessionPayload, type AutosaveSlotId } from '../types/session';
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
}

// ========================================
// CONSTANTS
// ========================================

export const STORAGE_KEY = 'trace-atlas.sessions.v1';

function emptyStorage(): SessionsStorageShape {
  return { named: {}, autosave: {}, nextRotatingIndex: 0 };
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

/** Removes only the named entry — never an autosave slot, even one that happens to share the
 *  same string (a user naming a session "draft" is a distinct entry from the draft slot). */
export function deleteNamedSession(name: string): void {
  const data = readStorage();
  delete data.named[name];
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
