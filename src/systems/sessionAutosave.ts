// ========================================
// IMPORTS
// ========================================
import { useSessionStore } from '../stores/sessionStore';
import { buildSessionPayload } from '../utils/sessionDiff';
import { saveNamedSessionAutosave, saveUnsavedAutosave, promoteUnsavedHistoryOnBoot } from '../utils/sessionStorageEngine';

// ========================================
// CONSTANTS
// ========================================

export const SESSION_AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

// ========================================
// MODULE STATE
// ========================================

let intervalId: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const payload = buildSessionPayload();
  const loadedName = useSessionStore.getState().currentLoadedSessionName;
  if (loadedName !== null) {
    saveNamedSessionAutosave(loadedName, payload);
  } else {
    saveUnsavedAutosave(payload);
  }
}

// ========================================
// FUNCTIONS
// ========================================

/**
 * Starts the 5-minute background autosave tick — idempotent, module-singleton, mirroring
 * startAudioBudget()'s shape. Every tick: with no session currently loaded
 * (sessionStore.currentLoadedSessionName === null), writes into the unsaved "current" bucket's
 * own rotating history; with one loaded, writes into that session's own rotating history instead,
 * never touching the named entry itself (docs/specs/SESSION_AUTOSAVE_HISTORY.md §4.4). Before the
 * first tick can ever fire, promotes whatever the unsaved "current" bucket held from the previous
 * boot into "last" -- this runs exactly once per real app boot, since the idempotency guard below
 * prevents a second start from doing anything at all, promotion included.
 */
export function startSessionAutosave(): void {
  if (intervalId !== null) return;
  promoteUnsavedHistoryOnBoot();
  intervalId = setInterval(tick, SESSION_AUTOSAVE_INTERVAL_MS);
}

/** Stops the autosave tick. Safe to call even if never started. */
export function stopSessionAutosave(): void {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}
