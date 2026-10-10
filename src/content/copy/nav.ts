import type { ContentEntry } from '../types';

/** Nav chrome only — the toggle, the home button, the breadcrumb landmark and the status block.
 *  Tree rows that open a concept read that concept's own entry (fleet.*, probe.*, …), never a
 *  nav.* key. Transcribed verbatim on 2026-09-30 (Task 5) from NavPanel.tsx, NavToggleButton.tsx,
 *  NavBreadcrumb.tsx and NavStatusBlock.tsx.
 *  Layout rework (docs/specs/LAYOUT_REWORK.md §1.2): the panel's entity list follows the same rule —
 *  "All Probes" reads probe.all, robots and companies show their own names (data) — so the only new
 *  nav key is the one action the panel owns, `nav.entity.newCompany`. The world line kept nav.status.*
 *  when it moved from NavStatusBlock to the meta box (MetaBox.tsx, Task 8): no separate field names
 *  exist to add. `nav.expand` / `nav.collapse` (the tree rows' +/- buttons) went with the tree (Task 9). */
export const nav = {
  'nav.home': { human: 'Deck', lore: 'Monitor' },
  'nav.toggle': { human: 'Navigation' },
  'nav.breadcrumb': { human: 'Breadcrumb' },
  'nav.root': { human: 'Root' },
  'nav.status.probesActive': { human: 'Probes active.', template: '{emitting} of {max} Probes active.' },
  'nav.status.viewing': { human: 'Viewing', template: 'Viewing {name} @ ({x}, {y}).' },
  'nav.status.unknownName': { human: 'CORRUPT NAME' },
  'nav.status.noTemperature': { human: 'NO TEMP' },
  /** Opens the inline create form under the Companies entity list; `[c]` = placeholder lore (spec Assumption 9). */
  'nav.entity.newCompany': { human: '+ New Company', lore: 'New Consortium [c]' },
} as const satisfies Record<string, ContentEntry>;
