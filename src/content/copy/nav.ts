import type { ContentEntry } from '../types';

/** Nav chrome only — the toggle, the home button, the breadcrumb landmark and the status block.
 *  Tree rows that open a concept read that concept's own entry (fleet.*, probe.*, …), never a
 *  nav.* key. Transcribed verbatim on 2026-09-30 (Task 5) from NavPanel.tsx, NavToggleButton.tsx,
 *  NavBreadcrumb.tsx and NavStatusBlock.tsx. */
export const nav = {
  'nav.home': { human: 'Deck', lore: 'Monitor' },
  'nav.toggle': { human: 'Navigation' },
  'nav.breadcrumb': { human: 'Breadcrumb' },
  'nav.expand': { human: 'Expand', template: 'Expand {name}' },
  'nav.collapse': { human: 'Collapse', template: 'Collapse {name}' },
  'nav.status.probesActive': { human: 'Probes active.', template: '{emitting} of {max} Probes active.' },
  'nav.status.viewing': { human: 'Viewing', template: 'Viewing {name} @ ({x}, {y}).' },
  'nav.status.unknownName': { human: 'CORRUPT NAME' },
  'nav.status.noTemperature': { human: 'NO TEMP' },
} as const satisfies Record<string, ContentEntry>;
