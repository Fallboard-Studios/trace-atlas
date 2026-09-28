// ========================================
// IMPORTS
// ========================================
import type { ButtonSchema, TextInputSchema } from '../types/controls';

// ========================================
// SESSIONS (save/load, Roadmap Phase 20)
// ========================================

/** The Session Name input's base schema — SessionListItem builds a per-row Load/Delete label
 *  from LOAD_SESSION_SCHEMA/DELETE_SESSION_SCHEMA below, the same "clone with a dynamic
 *  humanLabel" pattern CompanyCrudControls.tsx's own deleteSchema/renameSchema already use. */
export const SESSION_NAME_INPUT_SCHEMA: TextInputSchema = {
  id: 'session.name',
  type: 'textInput',
  loreLabel: 'SESSION DESIGNATION',
  humanLabel: 'Session Name',
  placeholder: 'Enter a session name…',
  maxLength: 128,
};

export const SAVE_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.save',
  type: 'button',
  loreLabel: 'ARCHIVE STATE',
  humanLabel: 'Save Session',
};

export const LOAD_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.load',
  type: 'button',
  loreLabel: 'RESTORE STATE',
  humanLabel: 'Load',
};

export const DELETE_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.delete',
  type: 'button',
  loreLabel: 'PURGE ARCHIVE',
  humanLabel: 'Delete',
};

/** Shown instead of LOAD_SESSION_SCHEMA on whichever row is the currently-loaded named session —
 *  clicking it overwrites that same entry with the live state instead of reloading it. */
export const UPDATE_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.update',
  type: 'button',
  loreLabel: 'OVERWRITE ARCHIVE',
  humanLabel: 'Update',
};

/** Bottom-of-panel destructive action (Crawford's exact copy, 2026-09-28) — wipes ALL of
 *  localStorage (not just the sessions key), behind an AlertDialog confirm like
 *  CompanyCrudControls.tsx's own delete confirmation. */
export const CLEAR_STORAGE_SCHEMA: ButtonSchema = {
  id: 'session.clearStorage',
  type: 'button',
  loreLabel: 'Reset to Factory Settings',
  humanLabel: 'Clear Local Storage',
};
