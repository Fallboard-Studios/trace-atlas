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
  /** Which named session, if any, is currently loaded — drives SessionListItem.tsx's Load-button
   *  wiring. Defaults to null on every fresh store creation: nothing ever auto-loads a session on
   *  boot (docs/specs/SESSION_STORAGE.md §1, §5.3 criterion 5), and this store's own default is
   *  part of what keeps that true. */
  currentLoadedSessionName: string | null;
  setCurrentSessionName: (name: string) => void;
  setCurrentLoadedSessionName: (name: string | null) => void;
}

// ========================================
// STORE
// ========================================
export const useSessionStore = create<SessionStore>((set) => ({
  currentSessionName: suggestSessionName(),
  currentLoadedSessionName: null,

  setCurrentSessionName: (name) => set({ currentSessionName: name }),
  setCurrentLoadedSessionName: (name) => set({ currentLoadedSessionName: name }),
}));
