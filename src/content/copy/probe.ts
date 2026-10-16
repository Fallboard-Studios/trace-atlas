import type { ContentEntry, ContentOption } from '../types';

/**
 * Probes — a robot's own sections, status/value labels and selection card. One entry per
 * concept (docs/specs/CONTENT_LAYER.md §1.1).
 *
 * Transcribed verbatim on 2026-09-30 (Task 4) from navTreeConfig.ts, robotSubsectionConfig.ts,
 * robotOptionsConfig.ts, robotSelectionConfig.ts, ProbesContent.tsx and
 * RobotSectionAccordionStack.tsx. ALL CAPS strings are today's legacy copy, kept verbatim until
 * the review gate (Task 17). Where a section's nav row and its accordion carry different text
 * today, they are two concepts (spec §1.3's rhythm/Composition precedent).
 */

/** The 5 oscillator waveforms — shared by the three Source layers' Type radios. */
const WAVEFORMS: Record<string, ContentOption> = {
  sine: { human: 'Sine', lore: 'Sway' },
  triangle: { human: 'Triangle', lore: 'Sweep' },
  sawtooth: { human: 'Sawtooth', lore: 'Kinetic' },
  square: { human: 'Square', lore: 'Binary' },
  pulse: { human: 'Pulse', lore: 'Burst' },
};

/** The 7 envelope curves — shared by the Attack Shape and Release Shape radios, keyed by EnvelopeCurveName
 *  in ENVELOPE_CURVE_NAMES order. The lore words are placeholders until Crawford's copy pass
 *  (docs/specs/ROBOT_ARTICULATION.md assumption 15). */
const CURVES: Record<string, ContentOption> = {
  linear: { human: 'Linear', lore: 'Even' },
  exponential: { human: 'Exponential', lore: 'Surge' },
  sine: { human: 'Sine', lore: 'Ebb' },
  cosine: { human: 'Cosine', lore: 'Tide' },
  bounce: { human: 'Bounce', lore: 'Rebound' },
  ripple: { human: 'Ripple', lore: 'Tremor' },
  step: { human: 'Step', lore: 'Ratchet' },
};

/** The 3 bus filter types, keyed by RobotFilterType in ROBOT_FILTER_TYPES order. Placeholder lore, as CURVES. */
const FILTER_TYPES: Record<string, ContentOption> = {
  lowpass: { human: 'Low-pass', lore: 'Sink' },
  bandpass: { human: 'Band-pass', lore: 'Channel' },
  highpass: { human: 'High-pass', lore: 'Skim' },
};

export const probe = {
  // ---------------------------------------------------------------- branch
  'probe.root': {
    human: 'Probes',
    lore: 'Timbre & Color',
    intro: {
      lore: 'Probes — your fleet at a glance.',
      loreDescription: 'Every unit currently deployed on the mesh, ready for individual inspection.',
      humanDescription: 'This is the full list of your probes. Select one to view and edit its own settings, or use All Probes above to adjust every probe at once.',
    },
  },
  'probe.all': {
    human: 'All Probes',
    /** The phone roster head's button (docs/specs/LAYOUT_REWORK.md §1.5; the sketch's "All"). */
    short: 'All',
    intro: {
      lore: 'All Probes — broadcast to the entire fleet.',
      loreDescription: 'One instruction, transmitted to every probe on the mesh at once.',
      humanDescription: 'Changes you make here apply to every probe at once — a shortcut for tuning the whole fleet without editing each probe individually. Move a slider partway and every probe’s own value shifts by the same amount, keeping their individual differences intact.',
    },
  },
  'probe.notFound': { human: 'Robot not found' },
  'probe.selectPrompt': { human: 'Select a robot from the list, or use Robots to spawn one.' },

  // ---------------------------------------------------------------- roster board
  // docs/specs/LAYOUT_REWORK.md §1.5, copy from the approved sketch. The head reuses `probe.all` and
  // `nav.entity.newCompany`, the Freelance group `company.assign`'s option, and the Move panel's title
  // `company.assign`'s template — one entry per concept.
  /** A group's count beside its name box. One probe has its own form (as `ui.noteValue.bar` does). */
  'probe.roster.count': { human: 'Probes', template: '{n} probes' },
  'probe.roster.count.one': { human: '1 probe' },
  /** A tile's one status line: the job, then the docking, activity and emission states. */
  'probe.roster.statusLine': { human: 'Status line', template: '{job} · {dockingState} · {activity} · {status}' },
  /** The tile's reassignment chip: the glyph alone on the phone; the robot in its accessible name. */
  'probe.roster.move': { human: '⇄ Move', short: '⇄', template: 'Move {name}' },

  // ---------------------------------------------------------------- selection card / display rows
  'probe.name': { human: 'Robot Name', lore: 'ROBOT IDENTIFIER' },
  // The robot screen's phone band (docs/specs/LAYOUT_REWORK.md §1.4): the avatar column's meta and
  // battery on one line, as the sketch draws it ("Salvage · Docked · Charging · Disabled · 85%").
  'probe.band.statusLine': { human: 'Status line', template: '{job} · {dockingState} · {activity} · {status} · {battery}' },
  'probe.job': {
    human: 'Job Data',
    lore: 'ASSIGNED PROTOCOL',
    options: {
      ventExtraction: { human: 'Vent Extraction', lore: 'VOLATILE VENT EXTRACTION' },
      acousticSurvey: { human: 'Acoustic Survey', lore: 'HIGH-ALTITUDE ACOUSTIC SURVEY' },
      structuralInspection: { human: 'Structural Inspection', lore: 'STRUCTURAL INTEGRITY INSPECTION' },
      fluidMonitoring: { human: 'Fluid Monitoring', lore: 'SUBSTATION FLUID MONITORING' },
      salvage: { human: 'Salvage', lore: 'DERELICT HULL SALVAGE' },
      maintenance: { human: 'Maintenance', lore: 'GRID INFRASTRUCTURE MAINTENANCE' },
    },
  },
  /** The world view's caption above the robot the Deck camera is following: its name, then its job. */
  'probe.followMarker': { human: 'Followed probe', template: '{name} | {job}' },
  'probe.job.unassigned': { human: 'Unassigned', lore: 'NO PROTOCOL ASSIGNED' },
  'probe.battery': { human: 'Battery Data', lore: 'POWER CELL STATUS', unit: '%' },
  'probe.status.docking': {
    human: 'Docked Status',
    lore: 'DOCKING STATE',
    options: {
      docked: { human: 'Docked', lore: 'DOCKED' },
      undocking: { human: 'Undocking', lore: 'UNDOCKING' },
      active: { human: 'Active', lore: 'ACTIVE' },
      recalled: { human: 'Recalled', lore: 'RECALLED' },
    },
  },
  /** What the work loop has the robot doing right now (Phase 43 spec §1.11) — the second word of the
   *  selection card's status line, and its own row in the detail view. Lore lines are drafts for
   *  Crawford's review (Task 25). */
  'probe.status.activity': {
    human: 'Activity',
    lore: 'OPERATIONAL PHASE',
    options: {
      charging: { human: 'Charging', lore: 'CELL REPLENISHMENT' },
      exiting: { human: 'Exiting', lore: 'BERTH DEPARTURE' },
      transit: { human: 'In transit', lore: 'EN ROUTE TO SITE' },
      working: { human: 'Working', lore: 'PROTOCOL IN PROGRESS' },
      waiting: { human: 'Waiting', lore: 'HOLDING FOR CLEARANCE' },
      returning: { human: 'Returning', lore: 'RETURNING TO BERTH' },
      entering: { human: 'Entering', lore: 'BERTH ARRIVAL' },
    },
  },
  'probe.status': {
    human: 'Status',
    lore: 'ACOUSTIC EMISSION STATE',
    options: {
      emitting: { human: 'Emitting', lore: 'ACOUSTIC EMISSION ACTIVE' },
      limited: { human: 'Standing by', lore: 'ACOUSTIC EMISSION HELD IN RESERVE' },
      disabled: { human: 'Disabled', lore: 'ACOUSTIC EMISSION SUPPRESSED' },
    },
  },
  /** The audio-mode badge's own value words (robotSelectionConfig AUDIO_MODE_LABELS) — same
   *  values as probe.monitorMode's radio below but a different legacy lore set; listed as a
   *  conflict in the inventory for the review gate. */
  'probe.status.monitorMode': {
    human: 'Monitor Mode',
    options: {
      none: { human: 'Auto', lore: 'OFFLINE' },
      mute: { human: 'Mute', lore: 'SILENCED' },
      solo: { human: 'Solo', lore: 'ISOLATED' },
      highlight: { human: 'Highlight', lore: 'PRIORITIZED' },
    },
  },

  // ---------------------------------------------------------------- Dynamics / Levels
  'probe.dynamics': { human: 'Dynamics', lore: 'Output' },
  'probe.dynamics.levelControl': { human: 'Level Control', lore: 'Ops Clarity' },
  'probe.levels': {
    human: 'Levels',
    intro: {
      lore: 'Levels — this probe’s signal strength.',
      loreDescription: 'Fine-tune how loudly this probe transmits, or silence it from the mesh entirely.',
      humanDescription: 'Monitor Mode lets you Mute, Solo, or Highlight this probe for quick comparison against the rest of the fleet — Auto leaves it playing normally. Volume sets how loud this probe’s own melody plays. Pan sets where it sits between the left and right speakers — Auto follows the probe across the field, or turn it off to place the probe yourself. Reverb and Delay set how much of this probe’s sound is sent into the shared echoes — 0% keeps it dry and close, higher settings push it further away and give it longer-trailing repeats. Dynamics sets how much louder and softer this probe’s notes swing from one to the next — 0% plays every note at the same level.',
    },
  },
  'probe.monitorMode': {
    human: 'Monitor Mode',
    lore: 'Diagnostic Feed',
    options: {
      none: { human: 'Auto', lore: 'Freeform' },
      mute: { human: 'Mute', lore: 'Standby' },
      solo: { human: 'Solo', lore: 'Featured' },
      highlight: { human: 'Highlight', lore: 'Elevated' },
    },
    help: { human: 'Auto plays this probe normally. Mute silences it, Solo silences every other probe so you hear this one alone, and Highlight turns the other probes down so this one stands out.' },
  },
  'probe.volume': {
    human: 'Volume',
    lore: 'Transducer Pressure',
    unit: '%',
    help: { human: 'How loud this probe’s own melody plays, from silent at 0% to full volume at 100%.' },
  },
  // The lore words are placeholders until Crawford's copy pass (docs/specs/ROBOT_PAN.md assumption 10).
  'probe.pan': {
    human: 'Pan',
    lore: 'Bearing',
    help: { human: 'Where this probe sits between the left and right speakers. With Auto on it follows the probe across the field and the bar just shows where it is; turn Auto off to hold it where it is and place it yourself, as far left or right as you like. Phone speakers are mono, so you will only hear the difference on headphones or a stereo.' },
  },
  'probe.pan.auto': {
    human: 'Auto',
    lore: 'Tracking',
    help: { human: 'On: the probe’s sound follows it across the field. Off: it stays where the Pan bar puts it.' },
  },
  // The lore words are placeholders until Crawford's copy pass (docs/specs/ROBOT_SENDS.md assumption 11).
  'probe.reverbSend': {
    human: 'Reverb',
    lore: 'Remoteness',
    unit: '%',
    help: { human: 'How much of this probe’s sound is sent into the shared Reverb. 0% keeps it completely dry and close; higher settings push it further away into the echo.' },
  },
  'probe.delaySend': {
    human: 'Delay',
    lore: 'Retrace Depth',
    unit: '%',
    help: { human: 'How much of this probe’s sound is sent into the shared Delay. 0% gives it no repeats at all; higher settings give it louder, longer-trailing repeats.' },
  },
  // The lore words are placeholders until Crawford's copy pass (docs/specs/ROBOT_PERFORMANCE.md assumption 14). The human
  // word clashes with the nav row above ('probe.dynamics', "Dynamics / Output") — one key to rename (spec §7).
  'probe.levels.dynamics': {
    human: 'Dynamics',
    lore: 'Pressure Swing',
    unit: '%',
    help: { human: 'How much louder and softer this probe’s notes vary from one to the next. 0% plays every note at the same level; higher settings let more of them swell and fade, so the probe sounds played rather than sequenced.' },
  },

  // ---------------------------------------------------------------- Composition
  'probe.composition': {
    human: 'Composition',
    lore: 'Payload Registrar',
    intro: {
      lore: 'Composition — how this probe builds its melody.',
      loreDescription: 'Each probe draws its own melody from a curated set of notes, shaped by the settings below.',
      humanDescription: '<p><strong>Rhythm</strong>: Note Density controls how many notes play versus rest. Phrase Length sets how many notes repeat together as one phrase before moving on. Pitch Repeat Chance controls how likely a repeated phrase is to reuse the same pitches instead of picking new ones.</p>'
        + '<p><strong>Articulation</strong>: Rests sets how often a note stops early and leaves a gap before the next. Accents sets how often a note is struck differently — pushed, clipped short, or leaned on. Neither changes which notes play or when.</p>'
        + '<p><strong>Pitches</strong>: Note Variance controls how far notes can wander from the probe’s core pitch set. Lowest/Highest Octave set the pitch range notes are drawn from.</p>',
    },
  },
  'probe.composition.rhythm': { human: 'Rhythm', lore: 'Payload Map', heading: 'RHYTHMIC PHRASING MATRIX' },
  'probe.composition.phrasing': { human: 'Phrasing', heading: 'RHYTHMIC PHRASING MATRIX' },
  'probe.composition.clickTrack': {
    human: 'Click Track',
    lore: 'CALIBRATION PULSE',
    help: { human: 'A testing aid: swaps this probe’s melody for one plain note on every beat, so the tempo is easy to hear. Turn it off to bring the melody back.' },
  },
  'probe.composition.noteDensity': {
    human: 'Note Density',
    lore: 'Payload Density',
    unit: '%',
    help: { human: 'How many steps of the rhythm play a note instead of resting. Low values leave lots of space, down to a single note; 100% fills every step.' },
  },
  'probe.composition.phraseLength': {
    human: 'Phrase Length',
    lore: 'Payload Subgroups',
    help: { human: 'How many steps long this probe’s rhythm pattern is before it repeats across the measure. 0 turns repeating off, and the notes are scattered across the whole measure instead.' },
  },
  'probe.composition.pitchRepeat': {
    human: 'Pitch Repeat Chance',
    lore: 'Payload Duplication',
    unit: '%',
    help: { human: 'How often a repeat of the rhythm pattern also repeats its notes. 0 picks fresh notes for every repeat; 100% plays the same notes every time. It does nothing while Phrase Length is 0.' },
  },
  'probe.composition.articulation': { human: 'Articulation', heading: 'ARTICULATION MATRIX' },
  // The lore words are placeholders until Crawford's copy pass (docs/specs/ROBOT_PERFORMANCE.md assumption 14).
  'probe.composition.rests': {
    human: 'Rests',
    lore: 'Payload Gaps',
    unit: '%',
    help: { human: 'How often a note stops early and leaves a gap before the next. 0% lets every note ring its full length; higher settings cut more of them short, and cut them deeper. The notes themselves stay where they are.' },
  },
  'probe.composition.accents': {
    human: 'Accents',
    lore: 'Payload Stress',
    unit: '%',
    help: { human: 'How often a note is struck differently — pushed harder, clipped short, or leaned on — and how many of those ways are used. 0% plays every note plainly; higher settings mark more notes and bring in more kinds of mark.' },
  },
  'probe.composition.pitches': { human: 'Pitches', lore: 'Payload Allocation', heading: 'PITCH FREQUENCY MATRIX' },
  'probe.composition.lowestOctave': {
    human: 'Lowest Octave',
    lore: 'Ping Floor',
    help: { human: 'The lowest octave this probe’s notes can play in, from 1 (deep) to 7 (high). Raise it to keep the melody out of the low end.' },
  },
  'probe.composition.highestOctave': {
    human: 'Highest Octave',
    lore: 'Ping Ceiling',
    help: { human: 'The highest octave this probe’s notes can play in, from 1 (deep) to 7 (high). Lower it to keep the melody out of the high end.' },
  },
  'probe.composition.noteVariance': {
    human: 'Note Variance',
    lore: 'Ping Variance',
    help: { human: 'How many different notes the melody leans on, out of the eight it can choose from. Low values keep it circling a few notes; 8 uses all of them. 0 picks every note at random.' },
  },

  // ---------------------------------------------------------------- Envelope
  'probe.envelope': {
    human: 'Envelope',
    lore: 'Ping Shell',
    intro: {
      lore: 'Envelope — the shape of a single note.',
      loreDescription: 'Every ping this probe emits rises, holds, and fades in its own signature shape.',
      humanDescription: 'An ADSR envelope shapes the volume of every note this probe plays, over its lifetime. Attack Time: how quickly a note reaches full volume. Decay Time: how quickly it settles from that peak down to its sustained level. Sustain Level: the volume it holds at while a note continues. Release Time: how quickly it fades out once the note ends. Attack Shape and Release Shape: the curve the rise and the fade follow. Portamento: how long a note takes to glide from the previous note’s pitch.',
    },
  },
  'probe.envelope.contour': { human: 'Contour', lore: 'Ping Profile' },
  'probe.envelope.attack': {
    human: 'Attack Time',
    lore: 'Ping Onset',
    unit: 's',
    help: { human: 'How long each note takes to rise from silence to full volume. Short gives a sharp, plucked start; long fades each note in.' },
  },
  'probe.envelope.decay': {
    human: 'Decay Time',
    lore: 'Ping Settling',
    unit: 's',
    help: { human: 'How long each note takes to fall from its peak to the Sustain Level. Short makes a quick drop; long lets the peak linger.' },
  },
  'probe.envelope.sustain': {
    human: 'Sustain Level',
    lore: 'Ping Hold',
    unit: '%',
    help: { human: 'The volume a note holds at after its peak, for as long as it plays, as a share of that peak. 100% holds it at full volume; 0% lets it die away during the Decay.' },
  },
  'probe.envelope.release': {
    human: 'Release Time',
    lore: 'Ping Fade',
    unit: 's',
    help: { human: 'How long each note takes to fade to silence once it ends. Short cuts it off cleanly; long lets it ring on.' },
  },
  // The lore words of the entries below are placeholders until Crawford's copy pass (docs/specs/ROBOT_ARTICULATION.md assumption 15).
  'probe.envelope.portamento': {
    human: 'Portamento',
    lore: 'Ping Glide',
    unit: 's',
    help: { human: 'How long each note takes to slide from the pitch of the note before it. 0 jumps straight to each new note; higher values glide between them, like a voice swooping up or down.' },
  },
  'probe.envelope.attackShape': {
    human: 'Attack Shape',
    lore: 'Onset Profile',
    options: CURVES,
    help: { human: 'The curve each note follows as it rises to full volume. Linear is a straight ramp; Exponential starts slowly and speeds up; Sine and Cosine round it off in two different ways; Bounce, Ripple and Step give the rise a bouncing, rippling or stair-stepped feel. You will only hear it when Attack Time is long enough.' },
  },
  'probe.envelope.releaseShape': {
    human: 'Release Shape',
    lore: 'Fade Profile',
    options: CURVES,
    help: { human: 'The curve each note follows as it fades to silence. Linear is a straight ramp down; Exponential drops quickly then trails off; Sine and Cosine round it off in two different ways; Bounce, Ripple and Step give the fade a bouncing, rippling or stair-stepped feel. You will only hear it when Release Time is long enough.' },
  },

  // ---------------------------------------------------------------- Source
  'probe.source': {
    human: 'Source',
    lore: 'Telemetry',
    intro: {
      lore: 'Source — the raw signal, layered three ways.',
      loreDescription: 'Three synchronized oscillators, each contributing its own layer to this probe’s core signature.',
      humanDescription: 'A probe’s sound comes from 3 oscillator layers mixed together — Core, Companion, and Accent — each with identical controls. Type picks the layer’s waveform shape. Gain sets how loud that layer is in the mix — turn it down to 0 to effectively mute it. Detune shifts its pitch slightly, in cents, for a thicker or more dissonant blend. Phase offsets where in its own wave cycle the layer starts. Interval (Pulse-type layers only) narrows or widens the pulse itself. The Filter tab then shapes all three layers together: Cutoff sets where it acts, Resonance how much it rings, and Type which part of the sound it keeps.',
    },
  },
  /** Nav row + accordion read 'Core Oscillator' (the 2026-09-29 copy pass); the layer panel
   *  inside reads the short 'Core' today — one concept, so the panel takes this entry. Listed as
   *  a conflict row in the inventory for the review gate. Same for Companion/Accent. */
  'probe.source.core': { human: 'Core Oscillator', lore: 'Baseline Feed' },
  'probe.source.core.type': {
    human: 'Core Type',
    lore: 'Feed Geometry',
    options: WAVEFORMS,
    help: { human: 'The shape of the core layer’s sound wave. Sine is soft and pure, Triangle a little brighter, Square hollow, Sawtooth bright and buzzy, and Pulse a reedy square whose width Interval sets.' },
  },
  'probe.source.core.gain': {
    human: 'Core Gain',
    lore: 'Feed Saturation',
    help: { human: 'How loud the core layer is in the mix of this probe’s three layers. 0 mutes it; the higher it goes, the more it stands out against the other two.' },
  },
  'probe.source.core.detune': {
    human: 'Core Detune',
    lore: 'Feed Drift',
    unit: 'cents',
    help: { human: 'Shifts the core layer’s pitch slightly up or down, in cents — hundredths of a semitone. A little against the other layers thickens the sound; a lot makes it sour.' },
  },
  'probe.source.core.phase': {
    human: 'Core Phase',
    lore: 'Feed Alignment',
    help: { human: 'Where in its own wave cycle the core layer starts, from 0 to 360 degrees. Shifting it against the other layers changes how they blend.' },
  },
  'probe.source.core.interval': {
    human: 'Core Interval',
    lore: 'Feed Break',
    help: { human: 'Narrows or widens each pulse of the core layer’s Pulse wave, moving its tone between hollow and thin. It only appears while Core Type is Pulse.' },
  },
  'probe.source.companion': { human: 'Companion Oscillator', lore: 'Coaxial Effect' },
  'probe.source.companion.type': {
    human: 'Companion Type',
    lore: 'Effect Geometry',
    options: WAVEFORMS,
    help: { human: 'The shape of the companion layer’s sound wave. Sine is soft and pure, Triangle a little brighter, Square hollow, Sawtooth bright and buzzy, and Pulse a reedy square whose width Interval sets.' },
  },
  'probe.source.companion.gain': {
    human: 'Companion Gain',
    lore: 'Effect Saturation',
    help: { human: 'How loud the companion layer is in the mix of this probe’s three layers. 0 mutes it; the higher it goes, the more it stands out against the other two.' },
  },
  'probe.source.companion.detune': {
    human: 'Companion Detune',
    lore: 'Effect Drift',
    unit: 'cents',
    help: { human: 'Shifts the companion layer’s pitch slightly up or down, in cents — hundredths of a semitone. A little against the other layers thickens the sound; a lot makes it sour.' },
  },
  'probe.source.companion.phase': {
    human: 'Companion Phase',
    lore: 'Effect Alignment',
    help: { human: 'Where in its own wave cycle the companion layer starts, from 0 to 360 degrees. Shifting it against the other layers changes how they blend.' },
  },
  'probe.source.companion.interval': {
    human: 'Companion Interval',
    lore: 'Effect Break',
    help: { human: 'Narrows or widens each pulse of the companion layer’s Pulse wave, moving its tone between hollow and thin. It only appears while Companion Type is Pulse.' },
  },
  'probe.source.accent': { human: 'Accent Oscillator', lore: 'Offset Matrix' },
  'probe.source.accent.type': {
    human: 'Accent Type',
    lore: 'Matrix Geometry',
    options: WAVEFORMS,
    help: { human: 'The shape of the accent layer’s sound wave. Sine is soft and pure, Triangle a little brighter, Square hollow, Sawtooth bright and buzzy, and Pulse a reedy square whose width Interval sets.' },
  },
  'probe.source.accent.gain': {
    human: 'Accent Gain',
    lore: 'Matrix Saturation',
    help: { human: 'How loud the accent layer is in the mix of this probe’s three layers. 0 mutes it; the higher it goes, the more it stands out against the other two.' },
  },
  'probe.source.accent.detune': {
    human: 'Accent Detune',
    lore: 'Matrix Drift',
    unit: 'cents',
    help: { human: 'Shifts the accent layer’s pitch slightly up or down, in cents — hundredths of a semitone. A little against the other layers thickens the sound; a lot makes it sour.' },
  },
  'probe.source.accent.phase': {
    human: 'Accent Phase',
    lore: 'Matrix Alignment',
    help: { human: 'Where in its own wave cycle the accent layer starts, from 0 to 360 degrees. Shifting it against the other layers changes how they blend.' },
  },
  'probe.source.accent.interval': {
    human: 'Accent Interval',
    lore: 'Matrix Break',
    help: { human: 'Narrows or widens each pulse of the accent layer’s Pulse wave, moving its tone between hollow and thin. It only appears while Accent Type is Pulse.' },
  },
  // The probe's filter, after its three layers are mixed. The lore words are placeholders (assumption 15).
  'probe.source.filter': { human: 'Filter', lore: 'Resonator' },
  'probe.source.filter.cutoff': {
    human: 'Cutoff',
    lore: 'Resonator Band',
    unit: 'Hz',
    help: { human: 'The pitch where the filter starts to act on this probe’s whole sound. With Low-pass, everything above it fades away, so lower values sound darker and more muffled; High-pass does the opposite; Band-pass keeps just a narrow band around it.' },
  },
  'probe.source.filter.resonance': {
    human: 'Resonance',
    lore: 'Resonator Peak',
    help: { human: 'How much the filter rings around its Cutoff. Low is smooth; high adds a whistling, vowel-like peak, and with a lane linked to the Cutoff it becomes the classic wah.' },
  },
  'probe.source.filter.type': {
    human: 'Type',
    lore: 'Resonator Mode',
    options: FILTER_TYPES,
    help: { human: 'Which part of the sound the filter keeps. Low-pass keeps the lows and cuts the highs, High-pass does the reverse, and Band-pass keeps only a narrow band around the Cutoff.' },
  },
} as const satisfies Record<string, ContentEntry>;
