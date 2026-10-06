import type { ContentEntry } from '../types';

/** The Deck / home view. Transcribed verbatim on 2026-09-30 (Task 5) from ContentPane.tsx's
 *  HOME_HTML — split into the IntroPanel shape (headline, lore blurb, human explanation) with
 *  the HTML kept as-is; ContentPane renders the three parts back-to-back (Task 13).
 *  `human` ("Welcome") is the landing-state Accordion's own trigger label — unused elsewhere,
 *  so it was free to repoint from the app name to this surface when the blank/landing state
 *  moved from an always-visible Textbox into a collapsible AccordionContainer + IntroPanel. */
export const home = {
  'home.root': {
    human: 'Welcome',
    intro: {
      lore: 'Trace Atlas',
      loreDescription: '<p>A Meridia Telemetry Group product.<br>\n  Locating the resources you need now.</p>\n'
        + '  <p>Trace Atlas is a tablet that allows users to monitor and control Meridia Telemetry\n'
        + '  Probes as they search the Pelagos Ocean floor for extractable resources. Using Meridia\n'
        + '  Power Group Perpetualish Battery Packs, they can search indefinitely for the resources\n'
        + '  you need.</p>',
      humanDescription: '<p>Each probe plays its own procedurally generated melody as it works, drawn from a\n'
        + '  curated set of notes. When its battery runs low, the probe docks to recharge — its melody\n'
        + '  stops, and sometimes changes, until it\'s back online.</p>\n'
        + '  <hr>\n'
        + '  <p>Open the panel on the left to inspect a Probe\'s melody and synth, tune the Fleet\'s\n'
        + '  shared effects, or manage the Companies coordinating them.</p>',
    },
  },
} as const satisfies Record<string, ContentEntry>;
