// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';
import { generateCompanyName } from '../systems/spawnSystem';
import { buildSessionPayload } from '../utils/sessionDiff';
import { loadSession, saveNamedSession } from '../utils/sessionStorageEngine';
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
   * suggestion (emptied in Comms) falls back to a fresh generated one: Keep never writes an unnamed row. Returns the
   * name the world was kept under.
   */
  keepCurrentWorld: () => string;
  /**
   * The loaded save is no longer the world (the off screen's Roll, or a preset pick): forget it, and if the name
   * input still carries that save's name (a Load or a save pick put it there so Save would overwrite the row), suggest
   * afresh — so the next Keep or Save writes a new row instead of overwriting a save with a different world. A name
   * the user typed is left alone. A no-op when nothing is loaded.
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
    const name = (currentLoadedSessionName ?? currentSessionName).trim() || suggestSessionName();
    saveNamedSession(name, buildSessionPayload());
    set({ currentLoadedSessionName: name, currentSessionName: name });
    return name;
  },

  detachLoadedSession: () => {
    const { currentLoadedSessionName, currentSessionName } = get();
    if (currentLoadedSessionName === null) return;
    set({
      currentLoadedSessionName: null,
      currentSessionName: currentSessionName === currentLoadedSessionName ? suggestSessionName() : currentSessionName,
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
  const { currentLoadedSessionName } = useSessionStore.getState();
  if (currentLoadedSessionName === null) return true;
  const stored = loadSession(currentLoadedSessionName);
  if (!stored) return true;
  return !deepEqual(asStored(buildSessionPayload()), stored);
}
