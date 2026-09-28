// ========================================
// IMPORTS
// ========================================
import { useSessionStore } from '../stores/sessionStore';
import { buildSessionPayload } from '../utils/sessionDiff';
import { saveAutosaveSlot } from '../utils/sessionStorageEngine';

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
  const mode = useSessionStore.getState().currentLoadedSessionName === null ? 'rotating' : 'draft';
  saveAutosaveSlot(mode, payload);
}

// ========================================
// FUNCTIONS
// ========================================

/**
 * Starts the 5-minute background autosave tick — idempotent, module-singleton, mirroring
 * startAudioBudget()'s shape. Every tick: with no session currently loaded
 * (sessionStore.currentLoadedSessionName === null), writes to the 5-slot rotating FIFO; with one
 * loaded, writes to the single draft slot instead, never touching the named entry itself
 * (docs/specs/SESSION_STORAGE.md §1, §4.4).
 */
export function startSessionAutosave(): void {
  if (intervalId !== null) return;
  intervalId = setInterval(tick, SESSION_AUTOSAVE_INTERVAL_MS);
}

/** Stops the autosave tick. Safe to call even if never started. */
export function stopSessionAutosave(): void {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}
