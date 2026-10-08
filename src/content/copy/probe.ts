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
    intro: {
      lore: 'All Probes — broadcast to the entire fleet.',
      loreDescription: 'One instruction, transmitted to every probe on the mesh at once.',
      humanDescription: 'Changes you make here apply to every probe at once — a shortcut for tuning the whole fleet without editing each probe individually. Move a slider partway and every probe’s own value shifts by the same amount, keeping their individual differences intact.',
    },
  },
  'probe.notFound': { human: 'Robot not found' },
  'probe.selectPrompt': { human: 'Select a robot from the list, or use Robots to spawn one.' },
  'probe.list': { human: 'Robots' },
  'probe.list.clearFilter': { human: 'Clear Filter', lore: 'RESET UNIT ROSTER' },
  'probe.list.filteredBy': { human: 'Filtered by', template: 'Filtered by {company}' },
  'probe.list.noAssigned': { human: 'currently has no assigned robots', template: '{company} currently has no assigned robots' },

  // ---------------------------------------------------------------- selection card / display rows
  'probe.name': { human: 'Robot Name', lore: 'ROBOT IDENTIFIER' },
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
      humanDescription: 'Monitor Mode lets you Mute, Solo, or Highlight this probe for quick comparison against the rest of the fleet — Auto leaves it playing normally. Volume sets how loud this probe’s own melody plays.',
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
  },
  'probe.volume': { human: 'Volume', lore: 'Transducer Pressure', unit: '%' },

  // ---------------------------------------------------------------- Composition
  'probe.composition': {
    human: 'Composition',
    lore: 'Payload Registrar',
    intro: {
      lore: 'Composition — how this probe builds its melody.',
      loreDescription: 'Each probe draws its own melody from a curated set of notes, shaped by the settings below.',
      humanDescription: '<p><strong>Rhythm</strong>: Note Density controls how many notes play versus rest. Phrase Length sets how many notes repeat together as one phrase before moving on. Pitch Repeat Chance controls how likely a repeated phrase is to reuse the same pitches instead of picking new ones.</p>'
        + '<p><strong>Pitches</strong>: Note Variance controls how far notes can wander from the probe’s core pitch set. Lowest/Highest Octave set the pitch range notes are drawn from.</p>',
    },
  },
  'probe.composition.rhythm': { human: 'Rhythm', lore: 'Payload Map', heading: 'RHYTHMIC PHRASING MATRIX' },
  'probe.composition.phrasing': { human: 'Phrasing', heading: 'RHYTHMIC PHRASING MATRIX' },
  'probe.composition.clickTrack': { human: 'Click Track', lore: 'CALIBRATION PULSE' },
  'probe.composition.noteDensity': { human: 'Note Density', lore: 'Payload Density', unit: '%' },
  'probe.composition.phraseLength': { human: 'Phrase Length', lore: 'Payload Subgroups' },
  'probe.composition.pitchRepeat': { human: 'Pitch Repeat Chance', lore: 'Payload Duplication', unit: '%' },
  'probe.composition.pitches': { human: 'Pitches', lore: 'Payload Allocation', heading: 'PITCH FREQUENCY MATRIX' },
  'probe.composition.lowestOctave': { human: 'Lowest Octave', lore: 'Ping Floor' },
  'probe.composition.highestOctave': { human: 'Highest Octave', lore: 'Ping Ceiling' },
  'probe.composition.noteVariance': { human: 'Note Variance', lore: 'Ping Variance' },

  // ---------------------------------------------------------------- Envelope
  'probe.envelope': {
    human: 'Envelope',
    lore: 'Ping Shell',
    intro: {
      lore: 'Envelope — the shape of a single note.',
      loreDescription: 'Every ping this probe emits rises, holds, and fades in its own signature shape.',
      humanDescription: 'An ADSR envelope shapes the volume of every note this probe plays, over its lifetime. Attack Time: how quickly a note reaches full volume. Decay Time: how quickly it settles from that peak down to its sustained level. Sustain Level: the volume it holds at while a note continues. Release Time: how quickly it fades out once the note ends.',
    },
  },
  'probe.envelope.contour': { human: 'Contour', lore: 'Ping Profile' },
  'probe.envelope.attack': { human: 'Attack Time', lore: 'Ping Onset', unit: 's' },
  'probe.envelope.decay': { human: 'Decay Time', lore: 'Ping Settling', unit: 's' },
  'probe.envelope.sustain': { human: 'Sustain Level', lore: 'Ping Hold', unit: '%' },
  'probe.envelope.release': { human: 'Release Time', lore: 'Ping Fade', unit: 's' },

  // ---------------------------------------------------------------- Source
  'probe.source': {
    human: 'Source',
    lore: 'Telemetry',
    intro: {
      lore: 'Source — the raw signal, layered three ways.',
      loreDescription: 'Three synchronized oscillators, each contributing its own layer to this probe’s core signature.',
      humanDescription: 'A probe’s sound comes from 3 oscillator layers mixed together — Core, Companion, and Accent — each with identical controls. Type picks the layer’s waveform shape. Gain sets how loud that layer is in the mix — turn it down to 0 to effectively mute it. Detune shifts its pitch slightly, in cents, for a thicker or more dissonant blend. Phase offsets where in its own wave cycle the layer starts. Interval (Pulse-type layers only) narrows or widens the pulse itself.',
    },
  },
  /** Nav row + accordion read 'Core Oscillator' (the 2026-09-29 copy pass); the layer panel
   *  inside reads the short 'Core' today — one concept, so the panel takes this entry. Listed as
   *  a conflict row in the inventory for the review gate. Same for Companion/Accent. */
  'probe.source.core': { human: 'Core Oscillator', lore: 'Baseline Feed' },
  'probe.source.core.type': { human: 'Core Type', lore: 'Feed Geometry', options: WAVEFORMS },
  'probe.source.core.gain': { human: 'Core Gain', lore: 'Feed Saturation' },
  'probe.source.core.detune': { human: 'Core Detune', lore: 'Feed Drift', unit: 'cents' },
  'probe.source.core.phase': { human: 'Core Phase', lore: 'Feed Alignment' },
  'probe.source.core.interval': { human: 'Core Interval', lore: 'Feed Break' },
  'probe.source.companion': { human: 'Companion Oscillator', lore: 'Coaxial Effect' },
  'probe.source.companion.type': { human: 'Companion Type', lore: 'Effect Geometry', options: WAVEFORMS },
  'probe.source.companion.gain': { human: 'Companion Gain', lore: 'Effect Saturation' },
  'probe.source.companion.detune': { human: 'Companion Detune', lore: 'Effect Drift', unit: 'cents' },
  'probe.source.companion.phase': { human: 'Companion Phase', lore: 'Effect Alignment' },
  'probe.source.companion.interval': { human: 'Companion Interval', lore: 'Effect Break' },
  'probe.source.accent': { human: 'Accent Oscillator', lore: 'Offset Matrix' },
  'probe.source.accent.type': { human: 'Accent Type', lore: 'Matrix Geometry', options: WAVEFORMS },
  'probe.source.accent.gain': { human: 'Accent Gain', lore: 'Matrix Saturation' },
  'probe.source.accent.detune': { human: 'Accent Detune', lore: 'Matrix Drift', unit: 'cents' },
  'probe.source.accent.phase': { human: 'Accent Phase', lore: 'Matrix Alignment' },
  'probe.source.accent.interval': { human: 'Accent Interval', lore: 'Matrix Break' },
} as const satisfies Record<string, ContentEntry>;
