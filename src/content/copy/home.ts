import type { ContentEntry } from '../types';

/** The Deck's copy: the powered-off screen only. The Welcome accordion's intro (`home.root`) was
 *  removed with the accordion itself. */
export const home = {
  // The powered-off screen (docs/specs/LAYOUT_REWORK.md §1.9). Placeholder copy until Crawford's
  // review; the preset names are the sketch's stand-ins (src/data/transmissionPresets.ts).
  'home.off.label': {
    human: 'Trace Atlas',
    lore: 'A Meridia Telemetry Group product',
  },
  'home.off.powerHint': {
    human: 'Press the power switch to begin. Sound will play.',
  },
  'home.off.transmission': {
    human: 'Transmission',
  },
  // The Current row's eyebrow (docs/specs/OFF_SCREEN.md assumption 8): the row itself is named by describeWorld
  // (the loaded world, or the loaded save's name in front of it) — data, not copy.
  'home.off.current': { human: 'Current' },
  // The Loading axis's group heading (the theme row and the Melody row), read from docs/tasks/OFF_SCREEN.md
  // Task 30 on; listed in content.test.ts's AWAITING_CONSUMER until then.
  'home.off.loading': { human: 'Loading' },
  'home.off.presets.a': { human: 'Kryndara' },
  'home.off.presets.b': { human: 'Vessport Null' },
  'home.off.presets.c': { human: 'Halcyon Drift' },
  // The readout well's accessible name; what it shows is describeWorld's string for the pick, so it carries no
  // template of its own (docs/tasks/OFF_SCREEN.md Task 10).
  'home.off.readout': {
    human: 'Selected transmission',
  },
} as const satisfies Record<string, ContentEntry>;
