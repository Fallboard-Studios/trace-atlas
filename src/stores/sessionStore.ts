// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';
import { generateCompanyName } from '../systems/spawnSystem';

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

// ========================================
// TYPES
// ========================================

export interface SessionStore {
  /** The Session Name input's live value — starts as a generated suggestion the user can accept
   *  or overwrite before clicking Save Session. */
  currentSessionName: string;
  /** Which named session, if any, is currently loaded — null means "no named session is active,"
   *  which drives sessionAutosave.ts's choice between the 5 rotating slots and the single draft
   *  slot. Defaults to null on every fresh store creation: nothing ever auto-loads a session on
   *  boot (docs/specs/SESSION_STORAGE.md §1, §5.3 criterion 5), and this store's own default is
   *  part of what keeps that true. */
  currentLoadedSessionName: string | null;
  /** True only once the single "last unsaved session" row has been Loaded this browsing session
   *  (docs/specs/SESSION_AUTOSAVE_HISTORY.md §4.1) — purely a display flag for that row's own
   *  subrow visibility, never read by sessionAutosave.ts (autosave mode is decided by
   *  currentLoadedSessionName alone). Mutually exclusive with currentLoadedSessionName being
   *  non-null: setting one clears the other. Defaults to false on every fresh store creation. */
  viewingUnsavedHistory: boolean;
  setCurrentSessionName: (name: string) => void;
  setCurrentLoadedSessionName: (name: string | null) => void;
  setViewingUnsavedHistory: (viewing: boolean) => void;
}

// ========================================
// STORE
// ========================================
export const useSessionStore = create<SessionStore>((set) => ({
  currentSessionName: suggestSessionName(),
  currentLoadedSessionName: null,
  viewingUnsavedHistory: false,

  setCurrentSessionName: (name) => set({ currentSessionName: name }),
  setCurrentLoadedSessionName: (name) => set(name === null ? { currentLoadedSessionName: name } : { currentLoadedSessionName: name, viewingUnsavedHistory: false }),
  setViewingUnsavedHistory: (viewing) => set(viewing ? { viewingUnsavedHistory: true, currentLoadedSessionName: null } : { viewingUnsavedHistory: false }),
}));
