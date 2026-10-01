import type { ContentEntry } from '../types';

/** Strings owned by a shared control or primitive, not by one feature — including the shared
 *  LFO control (docs/specs/CONTENT_LAYER.md §1.2). Filled in Task 5; `ui.cancel` seeds the
 *  CONTENT merge so the key union is real from Task 1. */
export const ui = {
  'ui.cancel': { human: 'Cancel' },
} as const satisfies Record<string, ContentEntry>;
