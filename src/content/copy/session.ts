import type { ContentEntry } from '../types';

/** Save/load/share. Transcribed verbatim on 2026-09-30 (Task 5) from the Save & Share tab, which went with
 *  docs/tasks/OFF_SCREEN_CONSOLE.md Task 15; what is left is the off screen's: Factory Reset, Delete's confirm and
 *  the status slot's lines. `template` carries a dynamic name (the slot is the session name — data). */
export const session = {
  // The label row over the reset; the button reads the action (Crawford's 2026-09-28 pair, swapped as
  // the sketch draws it).
  'session.clearStorage': { human: 'Clear Local Storage', lore: 'Factory Reset' },
  'session.clearStorage.action': { human: 'Reset to Factory Settings' },
  'session.clearStorage.confirmTitle': { human: 'Clear Local Storage?' },
  // Autosave is gone (docs/specs/SESSION_STORAGE.md), and the reset also clears the device's heard-a-world flag
  // (docs/specs/OFF_SCREEN.md assumption 7), so the next visit is a first one. Stand-in until Crawford's words
  // (docs/tasks/OFF_SCREEN.md Task 17).
  'session.clearStorage.confirmBody': {
    human: 'Every saved session is deleted, and this device forgets it has heard a world: the next visit starts as a first one. This can\'t be undone.',
  },
  'session.delete.confirmTitle': { human: 'Delete?', template: 'Delete {session}?' },
  'session.delete.confirmBody': { human: 'This can\'t be undone.' },
  'session.status.saveFailed': { human: 'failed to save.', template: '{name} failed to save.' },
  'session.status.linkCopied': { human: 'Link copied' },
  'session.status.copyFailed': { human: 'Unable to copy' },
} as const satisfies Record<string, ContentEntry>;
