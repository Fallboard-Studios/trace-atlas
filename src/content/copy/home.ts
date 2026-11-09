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
  // Current's eyebrow while no save matches it (docs/specs/OFF_SCREEN_CONSOLE.md §1.3): it says what the standing warning
  // line said. Stand-in copy until Crawford's pass (backlog 62).
  'home.off.unsavedEyebrow': { human: 'Current · unsaved' },
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
  // The action row under the list (docs/specs/OFF_SCREEN_CONSOLE.md §1.5), each acting on the selected row and named
  // after it ("Delete Harbour Song"). Save replaced Keep ("Save Last World"). Stand-in copy until Crawford's pass
  // (backlog 62).
  'home.off.save': { human: 'Save', template: 'Save {name}' },
  'home.off.rename': { human: 'Rename', template: 'Rename {name}' },
  'home.off.delete': { human: 'Delete', template: 'Delete {name}' },
  // Rename refused (spec assumption 3): another save already has the typed name, so the row keeps its own. In the status
  // slot under the readout. Stand-in copy until Crawford's pass (backlog 62).
  'home.off.renameTaken': { human: 'a save already has that name' },
  // A save row's meta in the Transmission list (revisions Task 4): when it was saved, in the Sessions list's own
  // format (formatSessionTimestamp, "Sep 28, 2:14 PM"). Stand-in copy until Crawford's pass.
  'home.off.savedAt': { human: 'Saved', template: 'saved {time}' },
  // The Transmissions section's header (docs/specs/OFF_SCREEN_CONSOLE.md §1.4): the section, the selected row's name
  // ("New Transmission", "Current", or the save's or preset's name) and the count of stored worlds (saves plus presets).
  // Stand-in copy until Crawford's pass (backlog 62).
  'home.off.transmissionsHeader': { human: 'Transmissions', template: 'Transmissions · {name} · {count}' },
  // The Device section's header (spec §1.4): over Factory Reset. Stand-in copy until Crawford's pass (backlog 62).
  'home.off.device': { human: 'Device' },
  // The lore footer (spec assumption 18): a prop in tiny etched type, last in the column. The legalese is Crawford's
  // copy; this is the sketch's stand-in (docs/sketches/off-screen.html) until he writes it.
  'home.off.footer': {
    human: 'Meridia Telemetry Group · Trace Atlas receiver firmware · unauthorised retransmission of any trace is an offence under the Deep Charter · no warranty is expressed or implied',
  },
  'home.off.presets.a': { human: 'Kryndara' },
  'home.off.presets.b': { human: 'Vessport Null' },
  'home.off.presets.c': { human: 'Halcyon Drift' },
  // The Loading axis's names and sentences: the fourteen themes and the six aspect families of
  // docs/specs/THEME_AND_ASPECTS_REFINEMENT.md, as shipped (its §1.8; docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T12).
  // Each sentence is written from its sheet's Promise line (docs/reference/THEME_AND_ASPECT_SHEETS.md); a theme's may
  // promise what an aspect can override, since themes and aspects are starting places (Crawford, 2026-11-05). One entry
  // per theme id and per option id, read by describeWorld's tail and by the off screen's rows through
  // src/utils/loadingNames.ts. The content grammar allows four key segments, so the family sits as one segment -
  // home.off.melody.<id>, not home.off.aspect.melody.<id>.
  'home.off.theme.classic': { human: 'Classic' },
  'home.off.theme.float': { human: 'Float' },
  'home.off.theme.anchor': { human: 'Anchor' },
  'home.off.theme.shatter': { human: 'Shatter' },
  'home.off.theme.undertow': { human: 'Undertow' },
  'home.off.theme.trench': { human: 'Trench' },
  'home.off.theme.tidepool': { human: 'Tidepool' },
  'home.off.theme.floe': { human: 'Floe' },
  'home.off.theme.thicket': { human: 'Thicket' },
  'home.off.theme.wreck': { human: 'Wreck' },
  'home.off.theme.openWater': { human: 'Open Water' },
  'home.off.theme.ventField': { human: 'Vent Field' },
  'home.off.theme.beacon': { human: 'Beacon' },
  'home.off.theme.polarLow': { human: 'Polar Low' },
  'home.off.melody.hypnotic': { human: 'Hypnotic' },
  'home.off.melody.mechanical': { human: 'Mechanical' },
  'home.off.melody.wandering': { human: 'Wandering' },
  'home.off.melody.chanting': { human: 'Chanting' },
  'home.off.melody.tumbling': { human: 'Tumbling' },
  'home.off.melody.telegraph': { human: 'Telegraph' },
  // One sentence per theme: the muted line under the theme row, and the entry the Guide's Themes page will read.
  'home.off.themeDescription.classic': { human: 'The receiver as it came: the whole range, every kind of probe at once.' },
  'home.off.themeDescription.float': { human: 'Slow, soft and warm: nothing hurries, nothing is pushed, everything is in the room.' },
  'home.off.themeDescription.anchor': { human: 'Weight: every note lands dry and solid, and stops.' },
  'home.off.themeDescription.shatter': { human: 'Bright, fast and abrasive: a wall of crunch that never lets up.' },
  'home.off.themeDescription.undertow': { human: 'Fluid: everything slides, and water moves over the whole sound.' },
  'home.off.themeDescription.trench': { human: 'Dark and deep: the top is gone, the room is a cavern, the probes slide like sonar.' },
  'home.off.themeDescription.tidepool': { human: 'Small, bright and close: every note a dry droplet.' },
  'home.off.themeDescription.floe': { human: 'Cold, slow and glassy, with a sheen on every note.' },
  'home.off.themeDescription.thicket': { human: 'Thick, warm and swaying: every probe doubled.' },
  'home.off.themeDescription.wreck': { human: 'Dark, rusted and echoing: machines still cycling in the hulk.' },
  'home.off.themeDescription.openWater': { human: 'Vast and far: each call from a distance, its echo late.' },
  'home.off.themeDescription.ventField': { human: 'Hot and bubbling: resonant probes squelching and whistling.' },
  'home.off.themeDescription.beacon': { human: 'One phrase, round and round, with its echo.' },
  'home.off.themeDescription.polarLow': { human: 'Stormy: surging, gusting, tearing, nothing steady.' },
  // Each family: its label, its option names, and one sentence per option plus one for a row with no aspect on -
  // `none`, every probe as the theme - the Guide's part too. Distance is how far off a probe sounds, never a room: a
  // room's size is the theme's.
  'home.off.melody': { human: 'Melody' },
  'home.off.melodyDescription.none': { human: 'Every probe takes its melody from the theme alone.' },
  'home.off.melodyDescription.hypnotic': { human: 'Hypnotic probes circle a note or two at a steady, middling pace.' },
  'home.off.melodyDescription.mechanical': { human: 'Mechanical probes drive one long figure, fast and over and over, on the same few notes.' },
  'home.off.melodyDescription.wandering': { human: 'Wandering probes roam wide and sparse, rarely repeating a phrase.' },
  'home.off.melodyDescription.chanting': { human: 'Chanting probes chant a short figure over and over.' },
  'home.off.melodyDescription.tumbling': { human: 'Tumbling probes run fast, wide and loose: a cascade.' },
  'home.off.melodyDescription.telegraph': { human: 'Telegraph probes send a rare, clipped signal.' },
  'home.off.envelope': { human: 'Envelope' },
  'home.off.envelope.plucked': { human: 'Plucked' },
  'home.off.envelope.swelling': { human: 'Swelling' },
  'home.off.envelope.held': { human: 'Held' },
  'home.off.envelope.bowed': { human: 'Bowed' },
  'home.off.envelope.hammered': { human: 'Hammered' },
  'home.off.envelope.breathing': { human: 'Breathing' },
  'home.off.envelopeDescription.none': { human: 'Every probe shapes its notes as the theme does.' },
  'home.off.envelopeDescription.plucked': { human: 'Plucked probes strike at once and die away, with hardly a sustain.' },
  'home.off.envelopeDescription.swelling': { human: 'Swelling probes rise slowly into each note and hold it high.' },
  'home.off.envelopeDescription.held': { human: 'Held probes sound in full and let each note ring on long after.' },
  'home.off.envelopeDescription.bowed': { human: 'Bowed probes draw each note in slowly and out slowly, like a bow.' },
  'home.off.envelopeDescription.hammered': { human: 'Hammered probes switch each note on and off: a hard start, a dead stop.' },
  'home.off.envelopeDescription.breathing': { human: 'Breathing probes sigh: each note comes in, gives way, and lingers.' },
  'home.off.distance': { human: 'Distance' },
  'home.off.distance.near': { human: 'Near' },
  'home.off.distance.echoing': { human: 'Echoing' },
  'home.off.distance.halfHeard': { human: 'Half-heard' },
  'home.off.distanceDescription.none': { human: 'Every probe sounds as far off as the theme sets it.' },
  'home.off.distanceDescription.near': { human: 'Near probes sound close and dry, right at the receiver.' },
  'home.off.distanceDescription.echoing': { human: 'Echoing probes repeat rather than wash: a call, and the call again.' },
  'home.off.distanceDescription.halfHeard': { human: 'Half-heard probes sit near and far at once: half close, half far off.' },
  'home.off.voice': { human: 'Voice' },
  'home.off.voice.glassy': { human: 'Glassy' },
  'home.off.voice.woody': { human: 'Woody' },
  'home.off.voice.hollow': { human: 'Hollow' },
  'home.off.voice.brassy': { human: 'Brassy' },
  'home.off.voice.muted': { human: 'Muted' },
  'home.off.voice.chiming': { human: 'Chiming' },
  'home.off.voiceDescription.none': { human: 'Every probe speaks in the voice the theme gives it.' },
  'home.off.voiceDescription.glassy': { human: 'Glassy probes ring clear and pure, round tones under an open filter.' },
  'home.off.voiceDescription.woody': { human: 'Woody probes sound warm and soft-edged, their layers full and low.' },
  'home.off.voiceDescription.hollow': { human: 'Hollow probes sound reedy and resonant, as if through a tube.' },
  'home.off.voiceDescription.brassy': { human: 'Brassy probes sound bright, edged and full.' },
  'home.off.voiceDescription.muted': { human: 'Muted probes sound muffled, as if behind a wall.' },
  'home.off.voiceDescription.chiming': { human: 'Chiming probes ring like bells, their partials loud above them.' },
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
