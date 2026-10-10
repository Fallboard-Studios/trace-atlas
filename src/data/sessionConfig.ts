// ========================================
// IMPORTS
// ========================================
import type { ButtonSchema, TextInputSchema } from '../types/controls';
import { labels } from '@/content';

// ========================================
// SESSIONS (save/load, Roadmap Phase 20)
// ========================================

/** The Session Name input's base schema — SessionListItem builds a per-row Load/Delete label
 *  from LOAD_SESSION_SCHEMA/DELETE_SESSION_SCHEMA below, the same "clone with a dynamic
 *  humanLabel" pattern CompanyCrudControls.tsx's own deleteSchema/renameSchema already use. */
export const SESSION_NAME_INPUT_SCHEMA: TextInputSchema = {
  id: 'session.name',
  type: 'textInput',
  ...labels('session.name'),
  maxLength: 128,
};

export const SAVE_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.save',
  type: 'button',
  ...labels('session.save'),
};

/** A saved row's Share: shares that row's stored payload. */
export const SHARE_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.share',
  type: 'button',
  ...labels('session.share'),
};

/** The save row's Share live: shares the current live state, not a save. */
export const SHARE_LIVE_SCHEMA: ButtonSchema = {
  id: 'session.shareLive',
  type: 'button',
  ...labels('session.shareLive'),
};

export const LOAD_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.load',
  type: 'button',
  ...labels('session.load'),
};

export const DELETE_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.delete',
  type: 'button',
  ...labels('session.delete'),
};

/** Bottom-of-panel destructive action — wipes ALL of localStorage (not just the sessions key), behind
 *  an AlertDialog confirm like CompanyCrudControls.tsx's own delete confirmation. The button reads the
 *  action, "Reset to Factory Settings"; the label row over it is session.clearStorage (the sketch's
 *  copy, docs/tasks/LAYOUT_REWORK.md Task 17 follow-up). */
export const CLEAR_STORAGE_SCHEMA: ButtonSchema = {
  id: 'session.clearStorage',
  type: 'button',
  ...labels('session.clearStorage.action'),
};
