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
  'home.off.presets.a': { human: 'Kryndara' },
  'home.off.presets.b': { human: 'Vessport Null' },
  'home.off.presets.c': { human: 'Halcyon Drift' },
  'home.off.readout': {
    human: 'Selected transmission',
    template: '{name} · {code}',
  },
} as const satisfies Record<string, ContentEntry>;
