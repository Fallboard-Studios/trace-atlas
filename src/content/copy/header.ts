import type { ContentEntry } from '../types';

/** The top bar. Transcribed verbatim on 2026-09-30 (Task 5) from Header.tsx. */
export const header = {
  'header.mute': { human: 'Mute', lore: 'SIGNAL SUPPRESSION' },
  'header.volume': { human: 'Volume', lore: 'Master Output', unit: '%' },
} as const satisfies Record<string, ContentEntry>;
