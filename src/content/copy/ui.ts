import type { ContentEntry } from '../types';

/**
 * Strings owned by a shared control or primitive, not by one feature (docs/specs/CONTENT_LAYER.md
 * §1.2). Transcribed verbatim on 2026-09-30 (Task 5) from Stepper.tsx, PowerRockerSwitch.tsx,
 * HeldOffNote.tsx, ConsolePanel.tsx and the three AlertDialog Cancel buttons; `ui.lfo.*`/`ui.lfoLane`
 * added since for the LfoLink primitive (docs/tasks/LFO_BANK.md).
 */
export const ui = {
  'ui.cancel': { human: 'Cancel' },
  'ui.confirm': { human: 'Confirm' },
  'ui.consolePanel': { human: 'Console Panel' },
  'ui.heldOff': { human: 'Held off by Audio Load' },
  'ui.stepper.increment': { human: 'Increment', template: 'Increment {name}' },
  'ui.stepper.decrement': { human: 'Decrement', template: 'Decrement {name}' },
  'ui.power.controls': { human: 'Device power controls' },
  'ui.power.on': { human: 'Power on' },
  'ui.power.off': { human: 'Power off' },
  'ui.power.confirmTitle': { human: 'Power off?' },
  'ui.power.confirmBody': { human: 'All audio will stop.' },
  'ui.lfo.shape': {
    human: 'Shape',
    lore: 'Mutation Type',
    options: {
      triangle: { human: 'Triangle', lore: 'Sweep' },
      sine: { human: 'Sine', lore: 'Sway' },
      square: { human: 'Square', lore: 'Binary' },
      sawtooth: { human: 'Sawtooth', lore: 'Kinetic' },
    },
  },
  'ui.lfo.rate': { human: 'Rate', lore: 'Mutation Cadence', unit: 'Hz' },
  'ui.lfo.depth': { human: 'Depth', lore: 'Mutation Span', unit: '%' },
  /** The LfoLink primitive's lane picker (docs/specs/LFO_BANK.md §1.5) — `off` plus the four
   *  world lanes, Crawford's names (2026-10-01). Reused verbatim as fleet.lfoBank.laneA–D's
   *  own names once Task 15 wires the LFO Bank accordion (kept in sync by hand, not by reference —
   *  the content model has no cross-key lookup). */
  'ui.lfoLane': {
    human: 'Lane',
    lore: 'Signature Lane',
    options: {
      off: { human: 'Off' },
      a: { human: 'Core LFO', lore: 'Apex Signature' },
      b: { human: 'Companion LFO', lore: 'Lateral Signature' },
      c: { human: 'Accent LFO', lore: 'Impulse Signature' },
      d: { human: 'Overtone LFO', lore: 'Canopy Signature' },
    },
  },
  /** A tempo-synced note's readout (docs/specs/FREE_SYNC_TOGGLE.md §1.9), assembled by
   *  utils/formatNoteValue.ts: `1/8`, `1 bar`, `2 bars`, and `{note} {modifier}` for dotted/triplet.
   *  Straight takes no suffix by rule, so it has no modifier option. The digits and slash are data. */
  'ui.noteValue.fraction': { human: 'Fraction', template: '1/{n}' },
  'ui.noteValue.bar': { human: '1 bar' },
  'ui.noteValue.bars': { human: 'Bars', template: '{n} bars' },
  'ui.noteValue.modifier': { human: 'Modifier', options: { dotted: { human: 'dotted' }, triplet: { human: 'triplet' } } },
  'ui.noteValue.modified': { human: 'Modified note', template: '{note} {modifier}' },
} as const satisfies Record<string, ContentEntry>;
