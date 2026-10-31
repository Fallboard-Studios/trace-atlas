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
  // Roll (spec assumption 14): the action beside Current — a fresh random Attenuation Style and plot under the chosen
  // Loading. An action, not a radio. Stand-in copy until Crawford's pass.
  'home.off.roll': { human: 'Roll' },
  // Keep (spec assumption 14): the one save action on the off screen — the loaded world, under the name Comms would
  // suggest, no name field. Dims once the world is kept. Stand-in copy until Crawford's pass.
  'home.off.keep': { human: 'Keep' },
  // The one warning worth having, shown under the chooser only while the loaded world is unkept.
  'home.off.unsavedWarning': { human: 'Picking another transmission discards this world’s unsaved changes.' },
  // The lore footer (spec assumption 18): a prop in tiny etched type, last in the column. The legalese is Crawford's
  // copy; this is the sketch's stand-in (docs/sketches/off-screen.html) until he writes it.
  'home.off.footer': {
    human: 'Meridia Telemetry Group · Trace Atlas receiver firmware · unauthorised retransmission of any trace is an offence under the Deep Charter · no warranty is expressed or implied',
  },
  'home.off.presets.a': { human: 'Kryndara' },
  'home.off.presets.b': { human: 'Vessport Null' },
  'home.off.presets.c': { human: 'Halcyon Drift' },
  // The Loading axis's names (docs/specs/OFF_SCREEN.md assumption 17), the sketch's lists as stand-ins until Crawford's
  // pass: one entry per theme id and per Melody option id, read by describeWorld's tail (band-table T28) and by the two
  // rows (Tasks 30 and 31) through src/utils/loadingNames.ts. The content grammar allows four key segments, so the
  // family sits as one segment - home.off.melody.<id>, not the spec's home.off.aspect.melody.<id>.
  'home.off.theme.classic': { human: 'Classic' },
  'home.off.theme.calm': { human: 'Calm' },
  'home.off.theme.bold': { human: 'Bold' },
  'home.off.theme.adventurous': { human: 'Adventurous' },
  'home.off.theme.perilous': { human: 'Perilous' },
  'home.off.melody.hypnotic': { human: 'Hypnotic' },
  'home.off.melody.mechanical': { human: 'Mechanical' },
  'home.off.melody.wandering': { human: 'Wandering' },
  // One sentence per theme (assumption 17; spec §1.6, the Guide's part): the muted line under the theme row (Task 30),
  // and the entry the Guide's Themes page will read. STAND-INS for Crawford's pass - each names what its column moves
  // across the v1 key list (assumption 16: tempo, density, rests, attack and release, the two sends, the filter).
  'home.off.themeDescription.classic': { human: 'The receiver as it shipped: every band at its surveyed range.' },
  'home.off.themeDescription.calm': { human: 'Slower and sparser: longer rests, softer attacks, a longer wash of reverb.' },
  'home.off.themeDescription.bold': { human: 'Up front: denser rhythms, sharper attacks, a drier and brighter room.' },
  'home.off.themeDescription.adventurous': { human: 'Wider roaming: tempo, density and tone swing further from the middle.' },
  'home.off.themeDescription.perilous': { human: 'The densest loading: fast, crowded and bright, with hardly a rest.' },
  // The readout well's accessible name; what it shows is describeWorld's string for the pick, so it carries no
  // template of its own (docs/tasks/OFF_SCREEN.md Task 10).
  'home.off.readout': {
    human: 'Selected transmission',
  },
} as const satisfies Record<string, ContentEntry>;
