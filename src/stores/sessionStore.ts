// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';
import { generateCompanyName } from '../systems/spawnSystem';
import { buildSessionPayload } from '../utils/sessionDiff';
import { listSessions, loadSession, saveNamedSession } from '../utils/sessionStorageEngine';
import { deepEqual } from '../utils/math';
import type { SessionPayload } from '../types/session';

// ========================================
// FUNCTIONS
// ========================================

/**
 * A fresh "Adjective Noun" suggestion for the Session Name input's default value — reuses
 * generateCompanyName's exact word-list logic fed by Math.random() instead of a seeded noise
 * map, the same live-UI-suggestion precedent CompanyCrudControls.tsx's own suggestCompanyName
 * already establishes (not reproducible world generation, so no seed is needed or used).
 */
function suggestSessionName(): string {
  return generateCompanyName(() => Math.random() * 2 - 1, 0);
}

/** How many fresh suggestions a new save's name draws before one is numbered instead: the word lists make 80 names
 *  (10 adjectives x 8 nouns), so a handful of saves rarely costs a second draw. */
const FRESH_NAME_DRAWS = 20;

/**
 * A name for a new save that no save already has (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R6): `preferred` when it is
 * set and free, else fresh suggestions until one is free, and past FRESH_NAME_DRAWS the last of them numbered " 2",
 * " 3"... Storage keys a save by its exact name (sessionStorageEngine.ts), so that is what free means.
 */
function unusedSessionName(preferred: string): string {
  const taken = new Set(listSessions().map((save) => save.name));
  if (preferred && !taken.has(preferred)) return preferred;
  let name = suggestSessionName();
  for (let draw = 1; draw < FRESH_NAME_DRAWS && taken.has(name); draw++) name = suggestSessionName();
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

/** A payload as storage holds it: through JSON, so an `undefined` field and a missing one compare equal, on top of
 *  the quantised numbers buildSessionPayload already writes (sessionCapture.ts). Both sides of Keep's dirty test pass
 *  through this, so an untouched reload reads clean (docs/tasks/OFF_SCREEN.md, risk table). */
function asStored(payload: SessionPayload): SessionPayload {
  return JSON.parse(JSON.stringify(payload)) as SessionPayload;
}

// ========================================
// TYPES
// ========================================

export interface SessionStore {
  /** The Session Name input's live value — starts as a generated suggestion the user can accept
   *  or overwrite before clicking Save Session. */
  currentSessionName: string;
  /** Which named session, if any, is currently loaded — drives SessionListItem.tsx's Load-button
   *  wiring. Defaults to null on every fresh store creation: nothing ever auto-loads a session on
   *  boot (docs/specs/SESSION_STORAGE.md §1, §5.3 criterion 5), and this store's own default is
   *  part of what keeps that true. */
  currentLoadedSessionName: string | null;
  setCurrentSessionName: (name: string) => void;
  setCurrentLoadedSessionName: (name: string | null) => void;
  /**
   * Keep (docs/specs/OFF_SCREEN.md assumption 14): save the live world with no name field — under the loaded save's
   * name when one is loaded (overwriting that row, as Comms' Save would), else under the suggestion Comms' Save already
   * proposes — then name the session after it, as a Load does, so a later Save overwrites the same row. A blank
   * suggestion (emptied in Comms) falls back to a fresh generated one: Keep never writes an unnamed row. With nothing
   * loaded Keep writes a new row, never over another save: a suggestion some save already has gives way to a fresh one
   * (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R6). Returns the name the world was kept under.
   */
  keepCurrentWorld: () => string;
  /**
   * Keep with a snapshot (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.4): save `payload` under
   * `loadedName`, overwriting that save, or under a name no save has when it is null or blank. Returns the name. Touches
   * no session field: those describe the live world, and the off screen's Current is a world the listener has left.
   */
  keepWorld: (payload: SessionPayload, loadedName: string | null) => string;
  /**
   * The loaded save is no longer the world (the off screen's preset or New Transmission pick, or a Scan): forget it, and if the name
   * input still carries that save's name (a Load or a save pick put it there so Save would overwrite the row), suggest
   * afresh, a name no save has (R6) — so the next Keep or Save writes a new row instead of overwriting a save with a
   * different world. A name the user typed is left alone. A no-op when nothing is loaded.
   */
  detachLoadedSession: () => void;
}

// ========================================
// STORE
// ========================================
export const useSessionStore = create<SessionStore>((set, get) => ({
  currentSessionName: suggestSessionName(),
  currentLoadedSessionName: null,

  setCurrentSessionName: (name) => set({ currentSessionName: name }),
  setCurrentLoadedSessionName: (name) => set({ currentLoadedSessionName: name }),

  keepCurrentWorld: () => {
    const { currentLoadedSessionName, currentSessionName } = get();
    const name =
      currentLoadedSessionName !== null
        ? currentLoadedSessionName.trim() || suggestSessionName()
        : unusedSessionName(currentSessionName.trim());
    saveNamedSession(name, buildSessionPayload());
    set({ currentLoadedSessionName: name, currentSessionName: name });
    return name;
  },

  keepWorld: (payload, loadedName) => {
    const name = loadedName?.trim() || unusedSessionName('');
    saveNamedSession(name, payload);
    return name;
  },

  detachLoadedSession: () => {
    const { currentLoadedSessionName, currentSessionName } = get();
    if (currentLoadedSessionName === null) return;
    set({
      currentLoadedSessionName: null,
      currentSessionName: currentSessionName === currentLoadedSessionName ? unusedSessionName('') : currentSessionName,
    });
  },
}));

// ========================================
// QUERIES
// ========================================

/**
 * Is there something to keep? True unless the loaded save's stored payload equals the live world now — so a world
 * that came from a seed, a preset or a link (nothing loaded), a loaded save edited since, or a loaded name that is
 * no longer in storage all read dirty. What dims Keep (docs/specs/OFF_SCREEN.md assumption 14; the dim-controls
 * rule). Builds the live payload, so callers compute it at the moments that matter — mount, a pick, a Keep — never
 * per render.
 */
export function isWorldDirty(): boolean {
  return isPayloadDirty(buildSessionPayload(), useSessionStore.getState().currentLoadedSessionName);
}

/** isWorldDirty for any payload and name: true unless `loadedName` names a stored save equal to `payload`. The off
 *  screen reads it for its Current snapshot (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.4). */
export function isPayloadDirty(payload: SessionPayload, loadedName: string | null): boolean {
  if (loadedName === null) return true;
  const stored = loadSession(loadedName);
  if (!stored) return true;
  return !deepEqual(asStored(payload), stored);
}
