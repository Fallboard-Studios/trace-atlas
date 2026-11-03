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
  // The theme row's label (docs/tasks/OFF_SCREEN.md Task 30), with its hint under it. "Drive" (Crawford, 2026-11-01,
  // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F5), then "Trace Type" with "select one" (Crawford, 2026-11-02,
  // docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6c); the key and the axis's internal name stay "loading".
  'home.off.loading': { human: 'Trace Type' },
  'home.off.loadingHint': { human: 'select one' },
  // The title over the aspect family rows, with its hint (Crawford, 2026-11-02, Task 6c).
  'home.off.aspects': { human: 'Trace Aspects' },
  'home.off.aspectsHint': { human: 'select many' },
  // The Transmission list's section titles over the saves and the presets (Crawford, 2026-11-02, Task 6c). The saves'
  // shows only while there are saves.
  'home.off.savedTransmissions': { human: 'Saved Transmissions' },
  'home.off.presetTransmissions': { human: 'Preset Transmissions' },
  // New Transmission: the first row of the list, a world drawn when the off screen opens (a random Attenuation Style and
  // plot, under Classic with no aspects); Scan, the action in its row, draws another and selects it. An action, not a
  // radio. Crawford's words (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.6); Scan replaced Roll.
  'home.off.newTransmission': { human: 'New Transmission' },
  'home.off.scan': { human: 'Scan' },
  // Keep (spec assumption 14): the one save action on the off screen — the loaded world, under the name Comms would
  // suggest, no name field. Dims once the world is kept. Crawford's words, 2026-10-31: "Save Last World", his answer to
  // the review's Open Question 6 (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R20), after "Save the last session" (revisions
  // Task 4).
  'home.off.keep': { human: 'Save Last World' },
  // Keep's failure line (R20): shown in the unsaved warning's place when the storage refuses the save (a full quota).
  // Crawford's words, verbatim (2026-11-01, docs/tasks/OFF_SCREEN_FINAL_FIXES.md F3).
  'home.off.keepFailed': { human: 'storage is already full, cannot save world' },
  // A save row's meta in the Transmission list (revisions Task 4): when it was saved, in the Sessions list's own
  // format (formatSessionTimestamp, "Sep 28, 2:14 PM"). Stand-in copy until Crawford's pass.
  'home.off.savedAt': { human: 'Saved', template: 'saved {time}' },
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
  // The fourteen themes since docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T8, named as the sheets name them.
  'home.off.theme.classic': { human: 'Classic' },
  'home.off.theme.float': { human: 'Float' },
  'home.off.theme.anchor': { human: 'Anchor' },
  'home.off.theme.shatter': { human: 'Shatter' },
  'home.off.theme.tide': { human: 'Tide' },
  'home.off.theme.trench': { human: 'Trench' },
  'home.off.theme.tidepool': { human: 'Tidepool' },
  'home.off.theme.floe': { human: 'Floe' },
  'home.off.theme.thicket': { human: 'Thicket' },
  'home.off.theme.wreck': { human: 'Wreck' },
  'home.off.theme.openWater': { human: 'Open Water' },
  'home.off.theme.ventField': { human: 'Vent Field' },
  'home.off.theme.beacon': { human: 'Beacon' },
  'home.off.theme.squall': { human: 'Squall' },
  'home.off.melody.hypnotic': { human: 'Hypnotic' },
  'home.off.melody.mechanical': { human: 'Mechanical' },
  'home.off.melody.wandering': { human: 'Wandering' },
  // One sentence per theme (assumption 17; spec §1.6, the Guide's part): the muted line under the theme row (Task 30),
  // and the entry the Guide's Themes page will read. STAND-INS until docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T12
  // writes the words: each is its sheet's Promise line (docs/reference/THEME_AND_ASPECT_SHEETS.md), T8.
  'home.off.themeDescription.classic': { human: 'The receiver as it came: the whole range, every kind of probe at once.' },
  'home.off.themeDescription.float': { human: 'Slow, soft and warm: nothing hurries, nothing is pushed, everything is in the room.' },
  'home.off.themeDescription.anchor': { human: 'Weight: every note lands dry and solid, and stops.' },
  'home.off.themeDescription.shatter': { human: 'Bright, fast and abrasive: a wall of crunch that never lets up.' },
  'home.off.themeDescription.tide': { human: 'Fluid: everything slides, and water moves over the whole sound.' },
  'home.off.themeDescription.trench': { human: 'Dark and deep: the top is gone, the room is a cavern, the probes slide like sonar.' },
  'home.off.themeDescription.tidepool': { human: 'Small, bright and close: every note a dry droplet.' },
  'home.off.themeDescription.floe': { human: 'Cold, slow and glassy, with a sheen on every note.' },
  'home.off.themeDescription.thicket': { human: 'Thick, warm and swaying: every probe doubled.' },
  'home.off.themeDescription.wreck': { human: 'Dark, rusted and echoing: machines still cycling in the hulk.' },
  'home.off.themeDescription.openWater': { human: 'Vast and far: each call from a distance, its echo late.' },
  'home.off.themeDescription.ventField': { human: 'Hot and bubbling: resonant probes squelching and whistling.' },
  'home.off.themeDescription.beacon': { human: 'One phrase, round and round, with its echo.' },
  'home.off.themeDescription.squall': { human: 'Stormy: surging, gusting, tearing, nothing steady.' },
  // The Melody row (Task 31; assumption 17): the family's label, and one sentence per option plus one for a row with no
  // aspect on - `none`, every probe as the theme (the as-theme option is gone, docs/tasks/OFF_SCREEN_REVISIONS.md Task 6)
  // - the Guide's part too. STAND-INS for Crawford's pass - each names what the option moves across the family's keys
  // (assumption 16: density, note variance, motif length, pitch repeat).
  'home.off.melody': { human: 'Melody' },
  'home.off.melodyDescription.none': { human: 'Every probe takes its melody from the theme alone.' },
  'home.off.melodyDescription.hypnotic': { human: 'Hypnotic probes circle a note or two at a steady, middling pace.' },
  'home.off.melodyDescription.mechanical': { human: 'Mechanical probes drive one long, fixed motif at high density.' },
  'home.off.melodyDescription.wandering': { human: 'Wandering probes roam wide and sparse, rarely repeating a phrase.' },
  // The Envelope and Distance families (docs/tasks/OFF_SCREEN_REVISIONS.md Task 7; Crawford's note 3, the wireframe's
  // Space renamed Distance in his answer 6): each family's label, its three names (Near / Far / Remote are Claude's words
  // for his "distance", one line each to rename), and one sentence per option plus one for a row with nothing on.
  // STAND-INS for Crawford's pass. Distance is how far off a probe sounds, never a room: a room's size is the theme's.
  'home.off.envelope': { human: 'Envelope' },
  'home.off.envelope.plucked': { human: 'Plucked' },
  'home.off.envelope.swelling': { human: 'Swelling' },
  'home.off.envelope.held': { human: 'Held' },
  'home.off.envelopeDescription.none': { human: 'Every probe shapes its notes as the theme does.' },
  'home.off.envelopeDescription.plucked': { human: 'Plucked probes strike at once and die away, with hardly a sustain.' },
  'home.off.envelopeDescription.swelling': { human: 'Swelling probes rise slowly into each note and hold it high.' },
  'home.off.envelopeDescription.held': { human: 'Held probes sound in full and let each note ring on long after.' },
  'home.off.distance': { human: 'Distance' },
  'home.off.distance.near': { human: 'Near' },
  'home.off.distance.far': { human: 'Far' },
  'home.off.distance.remote': { human: 'Remote' },
  'home.off.distanceDescription.none': { human: 'Every probe sounds as far off as the theme sets it.' },
  'home.off.distanceDescription.near': { human: 'Near probes sound close and dry, right at the receiver.' },
  'home.off.distanceDescription.far': { human: 'Far probes sound well off, deep in the wash, with little echo.' },
  'home.off.distanceDescription.remote': { human: 'Remote probes sound at the edge of range, washed out and echoing.' },
  // The Voice family (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10; the wireframe's names): its label, three names and four
  // sentences, as Envelope's and Distance's. STAND-INS for Crawford's pass.
  'home.off.voice': { human: 'Voice' },
  'home.off.voice.glassy': { human: 'Glassy' },
  'home.off.voice.woody': { human: 'Woody' },
  'home.off.voice.hollow': { human: 'Hollow' },
  'home.off.voiceDescription.none': { human: 'Every probe speaks in the voice the theme gives it.' },
  'home.off.voiceDescription.glassy': { human: 'Glassy probes ring clear and pure, round tones under an open filter.' },
  'home.off.voiceDescription.woody': { human: 'Woody probes sound warm and soft-edged, their layers full and low.' },
  'home.off.voiceDescription.hollow': { human: 'Hollow probes sound reedy and resonant, as if through a tube.' },
  // The Motion and Performance families (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b; names and sentences from
  // docs/reference/THEME_AND_ASPECT_SHEETS.md's Promise lines). STAND-INS until T12 writes the words.
  'home.off.motion': { human: 'Motion' },
  'home.off.motion.gliding': { human: 'Gliding' },
  'home.off.motion.trembling': { human: 'Trembling' },
  'home.off.motion.sweeping': { human: 'Sweeping' },
  'home.off.motionDescription.none': { human: 'Every probe moves as the theme sets it while it sounds.' },
  'home.off.motionDescription.gliding': { human: 'Gliding probes slide into every note.' },
  'home.off.motionDescription.trembling': { human: 'Trembling probes tremble while they hold a note.' },
  'home.off.motionDescription.sweeping': { human: 'Sweeping probes carry a slow sweep through every note.' },
  'home.off.performance': { human: 'Performance' },
  'home.off.performance.steady': { human: 'Steady' },
  'home.off.performance.dramatic': { human: 'Dramatic' },
  'home.off.performance.halting': { human: 'Halting' },
  'home.off.performanceDescription.none': { human: 'Every probe plays its line as the theme sets it.' },
  'home.off.performanceDescription.steady': { human: 'Steady probes play their lines straight.' },
  'home.off.performanceDescription.dramatic': { human: 'Dramatic probes act their lines out, loud and soft, every note marked.' },
  'home.off.performanceDescription.halting': { human: 'Halting probes break their lines off, hesitant.' },
  // The readout well's accessible name; what it shows is describeWorld's string for the pick, so it carries no
  // template of its own (docs/tasks/OFF_SCREEN.md Task 10).
  'home.off.readout': {
    human: 'Selected transmission',
  },
} as const satisfies Record<string, ContentEntry>;
