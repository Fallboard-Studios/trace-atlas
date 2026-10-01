import type { ContentEntry } from '../types';

/** Save/load/share. Transcribed verbatim on 2026-09-30 (Task 5) from sessionConfig.ts,
 *  SessionListItem.tsx and SessionsPanel.tsx. `template` carries each row button's dynamic
 *  accessible name (the slot is the session name — data) and the two status lines. */
export const session = {
  'session.name': { human: 'Session Name', lore: 'SESSION DESIGNATION', placeholder: 'Enter a session name…' },
  'session.save': { human: 'Save Session', lore: 'ARCHIVE STATE' },
  'session.share': { human: 'Share Session', lore: 'TRANSMIT COORDINATES', template: 'Share Session {session}' },
  'session.load': { human: 'Load', lore: 'RESTORE STATE', template: 'Load {session}' },
  'session.delete': { human: 'Delete', lore: 'PURGE ARCHIVE', template: 'Delete {session}' },
  'session.clearStorage': { human: 'Clear Local Storage', lore: 'Reset to Factory Settings' },
  'session.clearStorage.confirmTitle': { human: 'Clear Local Storage?' },
  'session.clearStorage.confirmBody': { human: 'Every saved and autosaved session is deleted. This can\'t be undone.' },
  'session.delete.confirmTitle': { human: 'Delete?', template: 'Delete {session}?' },
  'session.delete.confirmBody': { human: 'This can\'t be undone.' },
  'session.status.saved': { human: 'Saved', template: 'Saved {name} at {time}' },
  'session.status.saveFailed': { human: 'failed to save.', template: '{name} failed to save.' },
  'session.status.linkCopied': { human: 'Link copied' },
  'session.status.copyFailed': { human: 'Unable to copy' },
} as const satisfies Record<string, ContentEntry>;
