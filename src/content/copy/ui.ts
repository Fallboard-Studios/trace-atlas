import type { ContentEntry } from '../types';

/**
 * Strings owned by a shared control or primitive, not by one feature — including the shared LFO
 * control (docs/specs/CONTENT_LAYER.md §1.2). Transcribed verbatim on 2026-09-30 (Task 5) from
 * Lfo.tsx, useLfoTargetGroup.ts, Stepper.tsx, PowerRockerSwitch.tsx, HeldOffNote.tsx,
 * ConsolePanel.tsx and the three AlertDialog Cancel buttons.
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
  /** The LFO display's fallback lore name when the targeted field has none; `human` is never
   *  rendered (the human side always comes from the targeted field). */
  'ui.lfo': { human: 'Modulation', lore: 'Mutation' },
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
} as const satisfies Record<string, ContentEntry>;
