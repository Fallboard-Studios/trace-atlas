import type { ContentEntry } from '../types';

/** Nav chrome only — the toggle, the home button, the breadcrumb landmark and the status block.
 *  Tree rows that open a concept read that concept's own entry (fleet.*, probe.*, …), never a
 *  nav.* key. Transcribed verbatim on 2026-09-30 (Task 5) from NavPanel.tsx, NavToggleButton.tsx,
 *  NavBreadcrumb.tsx and NavStatusBlock.tsx.
 *  The panel's entity list (docs/specs/LAYOUT_REWORK.md §1.2) followed the same rule until it went
 *  (docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 13); its one action, New Company, had already moved to
 *  the roster board in Task 18 of docs/tasks/OFF_SCREEN_CONSOLE.md (`company.new`). The world line kept nav.status.*
 *  when it moved from NavStatusBlock to the meta box (MetaBox.tsx, Task 8): no separate field names
 *  exist to add. `nav.expand` / `nav.collapse` (the tree rows' +/- buttons) went with the tree (Task 9).
 *  `nav.back` / `nav.close` are the row on every open screen (ScreenExitRow.tsx; docs/specs/NAVIGATION_CLOSE_AND_BACK.md
 *  §1.8): plain words, no lore, and Back never names where it goes (Gate 2, 2026-11-15). */
export const nav = {
  'nav.home': { human: 'Deck', lore: 'Monitor' },
  'nav.back': { human: 'Back' },
  'nav.close': { human: 'Close' },
  'nav.toggle': { human: 'Navigation' },
  'nav.breadcrumb': { human: 'Breadcrumb' },
  'nav.root': { human: 'Root' },
  'nav.status.probesActive': { human: 'Probes active.', template: '{emitting} of {max} Probes active.' },
  'nav.status.viewing': { human: 'Viewing', template: 'Viewing {name} @ ({x}, {y}).' },
  'nav.status.unknownName': { human: 'CORRUPT NAME' },
  'nav.status.noTemperature': { human: 'NO TEMP' },
} as const satisfies Record<string, ContentEntry>;
