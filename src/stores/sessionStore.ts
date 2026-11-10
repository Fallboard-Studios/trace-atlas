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
 * A fresh "Adjective Noun" name for a new save — reuses generateCompanyName's exact word-list logic fed by
 * Math.random() instead of a seeded noise map, the same live-UI-suggestion precedent CompanyCrudControls.tsx's own
 * suggestCompanyName already establishes (not reproducible world generation, so no seed is needed or used).
 */
function suggestSessionName(): string {
  return generateCompanyName(() => Math.random() * 2 - 1, 0);
}

/** How many fresh suggestions a new save's name draws before one is numbered instead: the word lists make 80 names
 *  (10 adjectives x 8 nouns), so a handful of saves rarely costs a second draw. */
const FRESH_NAME_DRAWS = 20;

/**
 * A name for a new save that no save already has (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R6): fresh suggestions until
 * one is free, and past FRESH_NAME_DRAWS the last of them numbered " 2", " 3"... Storage keys a save by its exact name
 * (sessionStorageEngine.ts), so that is what free means.
 */
function unusedSessionName(): string {
  const taken = new Set(listSessions().map((save) => save.name));
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
  /** Which named session, if any, is currently loaded — the off screen's list reads it, and Save writes over it. Null
   *  when the world is no save's (an editor commit, a Scan, or a Delete of that save sets it so). Defaults to null on
   *  every fresh store creation: nothing ever auto-loads a session on boot (docs/specs/SESSION_STORAGE.md §1,
   *  §5.3 criterion 5), and this store's own default is part of what keeps that true. */
  currentLoadedSessionName: string | null;
  setCurrentLoadedSessionName: (name: string | null) => void;
  /**
   * The off screen's Save (docs/specs/OFF_SCREEN_CONSOLE.md §1.5): save the live world under `name` — nextSaveName()'s,
   * read by the caller first so a refused write can name the save it tried — and mark it loaded, so a later Save
   * overwrites the same row. Throws what the storage throws (a full quota), leaving the loaded name as it was.
   */
  keepCurrentWorld: (name: string) => void;
}

// ========================================
// STORE
// ========================================
export const useSessionStore = create<SessionStore>((set) => ({
  currentLoadedSessionName: null,

  setCurrentLoadedSessionName: (name) => set({ currentLoadedSessionName: name }),

  keepCurrentWorld: (name) => {
    saveNamedSession(name, buildSessionPayload());
    set({ currentLoadedSessionName: name });
  },
}));

/**
 * The name the off screen's Save writes: the loaded save's (trimmed), overwriting that row, else a fresh one no save has,
 * so a world that is no save's never overwrites another (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R6). Never blank.
 */
export function nextSaveName(): string {
  return useSessionStore.getState().currentLoadedSessionName?.trim() || unusedSessionName();
}

// ========================================
// QUERIES
// ========================================

/**
 * Is there something to keep? True unless the loaded save's stored payload equals the live world now — so a world
 * that came from a seed or a link (nothing loaded), a loaded save edited since, or a loaded name that is
 * no longer in storage all read dirty. What dims the off screen's Save and marks Current "unsaved"
 * (docs/specs/OFF_SCREEN_CONSOLE.md §1.3, §1.5; the dim-controls rule). Builds the live payload, so callers compute it
 * at the moments that matter — mount, a pick, a Save — never
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
