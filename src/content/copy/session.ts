import type { ContentEntry } from '../types';

/** Save/load/share. Transcribed verbatim on 2026-09-30 (Task 5) from sessionConfig.ts,
 *  SessionListItem.tsx and SessionsPanel.tsx. `template` carries each row button's dynamic
 *  accessible name (the slot is the session name — data) and the two status lines. */
export const session = {
  'session.name': {
    human: 'Session Name',
    lore: 'SESSION DESIGNATION',
    placeholder: 'Enter a session name…',
    help: { human: 'The name your save goes under in the list below. Saves are kept in this browser only; to hand a setup to someone else, use Share.' },
  },
  'session.save': { human: 'Save Session', lore: 'ARCHIVE STATE' },
  // The sketch's copy (docs/tasks/LAYOUT_REWORK.md Task 17 follow-up, Crawford 2026-10-10): the save row
  // shares the live state ("Share live"); a saved row shares its own save ("Share"). Two concepts.
  'session.shareLive': { human: 'Share live', lore: 'TRANSMIT COORDINATES' },
  'session.share': { human: 'Share', lore: 'TRANSMIT ARCHIVE [c]', template: 'Share {session}' },
  'session.load': { human: 'Load', lore: 'RESTORE STATE', template: 'Load {session}' },
  'session.delete': { human: 'Delete', lore: 'PURGE ARCHIVE', template: 'Delete {session}' },
  'session.saved': { human: 'Saved Sessions', lore: 'Stored Traces' },
  // The label row over the reset; the button reads the action (Crawford's 2026-09-28 pair, swapped as
  // the sketch draws it).
  'session.clearStorage': { human: 'Clear Local Storage', lore: 'Factory Reset' },
  'session.clearStorage.action': { human: 'Reset to Factory Settings' },
  'session.clearStorage.confirmTitle': { human: 'Clear Local Storage?' },
  'session.clearStorage.confirmBody': { human: 'Every saved and autosaved session is deleted. This can\'t be undone.' },
  'session.delete.confirmTitle': { human: 'Delete?', template: 'Delete {session}?' },
  'session.delete.confirmBody': { human: 'This can\'t be undone.' },
  'session.status.saved': { human: 'Saved', template: 'Saved {name} at {time}' },
  'session.status.saveFailed': { human: 'failed to save.', template: '{name} failed to save.' },
  'session.status.linkCopied': { human: 'Link copied' },
  'session.status.copyFailed': { human: 'Unable to copy' },
} as const satisfies Record<string, ContentEntry>;
