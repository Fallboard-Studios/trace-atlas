// ========================================
// IMPORTS
// ========================================
import type { ButtonSchema } from '../types/controls';
import { labels } from '@/content';

// ========================================
// SESSIONS (save/load, Roadmap Phase 20)
// ========================================

/** The off screen's Factory Reset (docs/tasks/OFF_SCREEN_CONSOLE.md Task 3) — wipes ALL of localStorage (not just the
 *  sessions key), behind an AlertDialog confirm like CompanyCrudControls.tsx's own delete confirmation. The button reads
 *  the action, "Reset to Factory Settings"; the label row over it is session.clearStorage (the sketch's copy,
 *  docs/tasks/LAYOUT_REWORK.md Task 17 follow-up). The Save & Share tab's other schemas went with it
 *  (docs/tasks/OFF_SCREEN_CONSOLE.md Task 15). */
export const CLEAR_STORAGE_SCHEMA: ButtonSchema = {
  id: 'session.clearStorage',
  type: 'button',
  ...labels('session.clearStorage.action'),
};
