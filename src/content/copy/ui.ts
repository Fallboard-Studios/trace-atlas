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
  /** The "?" on a control's label (docs/specs/LAYOUT_REWORK.md §1.4): its accessible name, filled with
   *  the control's own name so every "?" on a screen is told apart; `human` when there is no name. */
  'ui.help': { human: 'Help', template: 'Help for {name}' },
  'ui.stepper.increment': { human: 'Increment', template: 'Increment {name}' },
  'ui.stepper.decrement': { human: 'Decrement', template: 'Decrement {name}' },
  'ui.power.controls': { human: 'Device power controls' },
  'ui.power.on': { human: 'Power on' },
  'ui.power.off': { human: 'Power off' },
  'ui.power.confirmTitle': { human: 'Power off?' },
  'ui.power.confirmBody': { human: 'All audio will stop.' },
  /** The phone bar's well while the nav sheet is open (docs/specs/LAYOUT_REWORK.md §1.1). The sketch's
   *  "menu open — tap outside or pick to close" cut short at 320 px; the open sheet and the menu's ✕
   *  already say it is open (Crawford, 2026-10-09: "shorter copy"). The bar's menu button is the nav
   *  toggle's replacement and keeps reading nav.toggle. */
  'ui.phoneBar.menuOpen': { human: 'tap outside or pick to close' },
  'ui.lfo.shape': {
    human: 'Shape',
    lore: 'Mutation Type',
    options: {
      triangle: { human: 'Triangle', lore: 'Sweep' },
      sine: { human: 'Sine', lore: 'Sway' },
      square: { human: 'Square', lore: 'Binary' },
      sawtooth: { human: 'Sawtooth', lore: 'Kinetic' },
    },
    help: { human: 'The shape of the lane’s back-and-forth motion. Sine and Triangle glide smoothly, Square jumps between two points, and Sawtooth ramps up then snaps back.' },
  },
  'ui.lfo.rate': {
    human: 'Rate',
    lore: 'Mutation Cadence',
    unit: 'Hz',
    help: { human: 'How fast the lane moves back and forth. In Free it is set in cycles per second, and 0 holds it still; in Sync it is a note length that follows the Tempo.' },
  },
  'ui.lfo.depth': {
    human: 'Depth',
    lore: 'Mutation Span',
    unit: '%',
    help: { human: 'How far the linked lane turns this dial. 0 leaves the dial where it is; 100% swings it as far as it can go.' },
  },
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
    help: { human: 'Which of the four shared LFO Bank lanes moves this dial — an automatic hand turning it back and forth. Every dial on the same lane moves together; Off leaves this one alone.' },
  },
  /** The Free | Sync toggle on a lane's Rate and on Delay Time (docs/specs/FREE_SYNC_TOGGLE.md §1.9),
   *  read by TempoSyncToggle. Wording confirmed 2026-10-02. TWO label pairs, which are different things:
   *  the entry's own { human: 'Tempo Sync', lore: 'Anchoring' } is the toggle's LABEL (what the control
   *  is, shown beside the box; its human word is the switch's stable accessible name), and `options` is
   *  the box's CONTENT, the current mode's pair: { 'Free', 'Float' } when Free, { 'Sync', 'Anchored' }
   *  when synced. */
  'ui.tempoSync': {
    human: 'Tempo Sync',
    lore: 'Anchoring',
    options: { free: { human: 'Free', lore: 'Float' }, sync: { human: 'Sync', lore: 'Anchored' } },
    help: { human: 'Free sets the slider beside it in plain time. Sync locks it to note lengths — a 1/8, a bar — so it follows the Tempo.' },
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
