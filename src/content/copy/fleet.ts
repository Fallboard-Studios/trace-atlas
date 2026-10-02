import type { ContentEntry } from '../types';

/**
 * Fleet Params — the global chain. One entry per concept: the nav row, the control's label and
 * the accordion/panel heading all read the same key (docs/specs/CONTENT_LAYER.md §1.1).
 *
 * Transcribed verbatim from navTreeConfig.ts, audioRigConfig.ts and FleetParamsContent.tsx on
 * 2026-09-30 (Task 3). ALL CAPS panel headings are today's placeholder text, kept in `heading`
 * until the review gate (Task 17) replaces them — `lore` is the nav row's name from the
 * 2026-09-29 copy pass. File order follows the screen top to bottom.
 */
export const fleet = {
  // ---------------------------------------------------------------- branch
  'fleet.root': {
    human: 'Fleet Params',
    lore: 'Environment',
    intro: {
      lore: 'Fleet Params — your key to mesh-wide performance.',
      loreDescription: 'Fleets of probes stay synchronized through Meridia Comms Group’s Undersea Mesh Network, broadcasting the same audio signature settings to every unit at once.',
      humanDescription: 'This screen holds every control that shapes the sound of your whole fleet at once — pacing, EQ and filtering, modulation lanes, spatial effects, and output. Changes here apply to every probe simultaneously; to adjust one probe at a time, use the Probes screen instead.',
    },
  },

  // ---------------------------------------------------------------- Pacing
  'fleet.pacing': {
    human: 'Pacing',
    lore: 'Trace Timing',
    intro: {
      lore: 'Pacing — set the tempo of the mesh.',
      loreDescription: 'Every probe keeps time together, and the network periodically intensifies its own signal processing to surface new data.',
      humanDescription: '<ul>'
        + '<li><strong>Tempo</strong>: how fast the music plays, in beats per minute.</li>'
        + '<li><strong>Automation Rate</strong>: how often the fleet automatically nudges its own effects settings — swells of extra motion that come and go on their own. Set it to 0 to turn automatic swells off entirely.</li>'
        + '<li><strong>Automation Length</strong>: how many measures one of those swells lasts, start to finish.</li>'
        + '<li><strong>Automation Range</strong>: how far a swell can push the affected settings once one is happening — bigger numbers mean more dramatic swells.</li>'
        + '</ul>',
    },
  },
  'fleet.pacing.tempo': { human: 'Tempo', lore: 'Ping Rate', unit: 'BPM' },
  'fleet.pacing.automationRate': { human: 'Automation Rate', lore: 'Trace Skip Rate', options: { off: { human: 'Off' } } },
  /** The rate slider's readout for ≥1 and <1 per measure (audioRigConfig's formatSwellFrequency). */
  'fleet.pacing.automationRate.perMeasure': { human: 'per measure', template: '{n}/measure' },
  'fleet.pacing.automationRate.everyMeasures': { human: 'every … measures', template: 'every {n} measures' },
  'fleet.pacing.automationLength': { human: 'Automation Length', lore: 'Trace Runway', unit: ' measures' },
  'fleet.pacing.automationRange': { human: 'Automation Range', lore: 'Trace Width', unit: '%' },

  // ---------------------------------------------------------------- EQ & Filters
  'fleet.eqFilters': {
    human: 'EQ & Filters',
    lore: 'Outer Bounds',
    intro: {
      lore: 'EQ & Filters — shape the signal every probe shares.',
      loreDescription: 'Meridia Comms Group’s Undersea Mesh Network carries every probe’s signal through the same equalizer and filter bank before it reaches you.',
      humanDescription: '<ul>'
        + '<li><strong>3-Band EQ</strong>: three sliders to boost or cut the low, mid, and high ranges of the sound.</li>'
        + '<li><strong>High-Pass Filter</strong>: cuts the deep, thumping bass and lets bright, high sounds through — like a small phone speaker.</li>'
        + '<li><strong>Low-Pass Filter</strong>: cuts the harsh high pitches and lets deep, low sounds through smoothly — like a thick blanket over the sound.</li>'
        + '</ul>'
        + '<p>Each of these sliders has its own LFO (Low Frequency Oscillator) — an invisible hand that turns the slider’s knob back and forth automatically. Click a slider to see and edit its LFO below: Rate controls how fast the hand turns, Depth controls how far.</p>',
    },
  },
  'fleet.eq': { human: '3-Band EQ', lore: 'Trace Metrics', heading: 'SPECTRAL FREQUENCY EQUALIZER' },
  'fleet.eq.bass': { human: 'Bass', lore: 'Sub-Band', unit: 'dB' },
  'fleet.eq.mid': { human: 'Mid', lore: 'Medial Band', unit: 'dB' },
  'fleet.eq.treble': { human: 'Treble', lore: 'Apical Band', unit: 'dB' },
  'fleet.hpf': { human: 'High-Pass Filter', lore: 'Top Extraction', heading: 'LOW-FREQUENCY MASK' },
  'fleet.hpf.cutoff': { human: 'Cutoff', lore: 'Extraction Ceiling', unit: 'Hz' },
  'fleet.hpf.resonance': { human: 'Resonance', lore: 'Boundary Resonance' },
  'fleet.lpf': { human: 'Low-Pass Filter', lore: 'Bottom Extraction', heading: 'HIGH-FREQUENCY MASK' },
  'fleet.lpf.cutoff': { human: 'Cutoff', lore: 'Extraction Floor', unit: 'Hz' },
  'fleet.lpf.resonance': { human: 'Resonance', lore: 'Boundary Resonance' },

  // ---------------------------------------------------------------- LFO Bank (docs/specs/LFO_BANK.md
  // Task 15 — replaces the old 2-group Drift accordion above entirely: 'fleet.drift'/'.environmental'/
  // '.voice' and their rate/depth children are gone, not renamed — Rate Drift/Depth Drift now belong
  // to each of the 4 lanes below instead of 2 fixed groups. Lane names (laneA-D) restate ui.lfoLane's
  // own a-d options verbatim (Task 11's own doc comment — the content model has no cross-key lookup,
  // so this is a deliberate hand-kept duplicate). rateDrift/depthDrift carry forward the old
  // fleet.drift.environmental entries' exact copy — one shared Rate/Depth Drift pair reused by all 4
  // lanes, not per-lane-distinct text.
  'fleet.lfoBank': {
    human: 'LFO Bank',
    lore: 'Phase Locking',
    intro: {
      lore: 'LFO Bank — four shared signatures driving every linked dial.',
      loreDescription: 'Meridia Comms Group’s Undersea Mesh Network runs four independent oscillators at all times; any dial across the fleet can lock onto one and ride its signature.',
      humanDescription: '<p>Four shared LFOs (Low Frequency Oscillators) run continuously. Any dial elsewhere in Fleet Params or on a probe can link to one of them — or none — and ride its motion at its own depth; several dials linked to the same lane move together.</p>'
        + '<p>Each lane below has its own Shape and Rate, plus a Rate Drift/Depth Drift pair: Rate Drift makes the lane’s own speed wander over time, Depth Drift makes how far it swings wander instead.</p>',
    },
  },
  'fleet.lfoBank.laneA': { human: 'Core LFO', lore: 'Apex Signature' },
  'fleet.lfoBank.laneB': { human: 'Companion LFO', lore: 'Lateral Signature' },
  'fleet.lfoBank.laneC': { human: 'Accent LFO', lore: 'Impulse Signature' },
  'fleet.lfoBank.laneD': { human: 'Overtone LFO', lore: 'Canopy Signature' },
  'fleet.lfoBank.rateDrift': { human: 'Rate Drift', lore: 'Trace Pulse', unit: '%' },
  'fleet.lfoBank.depthDrift': { human: 'Depth Drift', lore: 'Trace Bending', unit: '%' },

  // ---------------------------------------------------------------- Time & Space
  'fleet.timeSpace': {
    human: 'Time & Space',
    lore: 'Dimensional Bounds',
    intro: {
      lore: 'Time & Space — give every signal somewhere to travel.',
      loreDescription: 'Reverb and Delay recreate the vast, echoing distances a probe’s signal crosses before reaching your receiver.',
      humanDescription: '<ul>'
        + '<li><strong>Reverb Length</strong>: how long the echo rings out after a sound plays.</li>'
        + '<li><strong>Pre-Delay</strong>: how long the echo waits before it starts, after the original sound.</li>'
        + '<li><strong>Reverb Amount</strong>: how much of that echo you hear blended in with the original sound.</li>'
        + '<li><strong>Delay Time</strong>: how long between the original sound and its first repeat.</li>'
        + '<li><strong>Repeats</strong>: how many times that repeat echoes back before fading out.</li>'
        + '<li><strong>Delay Amount</strong>: how loud those repeats are, blended in with the original sound.</li>'
        + '</ul>',
    },
  },
  'fleet.reverb': { human: 'Reverb', lore: 'External Capacity', heading: 'SPATIAL DIFFUSION MATRIX' },
  'fleet.reverb.length': { human: 'Reverb Length', lore: 'Dissipation Time', unit: 's' },
  'fleet.reverb.preDelay': { human: 'Pre-Delay', lore: 'Initial Lag', unit: 's' },
  'fleet.reverb.amount': { human: 'Reverb Amount', lore: 'Diffusion Ratio' },
  'fleet.delay': { human: 'Delay', lore: 'Retracing', heading: 'TEMPORAL REFLECTION MATRIX' },
  'fleet.delay.time': { human: 'Delay Time', lore: 'Propagation Lag', unit: 's' },
  'fleet.delay.repeats': { human: 'Repeats', lore: 'Recirculation Rate' },
  'fleet.delay.amount': { human: 'Delay Amount', lore: 'Reflection Ratio' },

  // ---------------------------------------------------------------- Output
  'fleet.output': {
    human: 'Output',
    lore: 'Trace Flattening',
    intro: {
      lore: 'Output — the final stage before transmission.',
      loreDescription: 'Every probe’s signal is compressed and limited here, guaranteeing a clean, consistent transmission back to your receiver.',
      humanDescription: '<p><strong>Compressor</strong>: automatically turns down loud moments and evens out the overall volume.</p>'
        + '<ul>'
        + '<li><strong>Threshold</strong>: how loud a sound has to get before the compressor starts working on it.</li>'
        + '<li><strong>Ratio</strong>: how strongly the compressor turns the sound down once it’s past the threshold.</li>'
        + '<li><strong>Attack Time</strong>: how quickly the compressor reacts once a sound crosses the threshold.</li>'
        + '<li><strong>Release Time</strong>: how quickly the compressor lets go once the sound drops back below the threshold.</li>'
        + '<li><strong>Knee</strong>: how gradually the compressor eases into effect, rather than snapping on abruptly.</li>'
        + '<li><strong>Decay Mode</strong>: Natural Decay lets Reverb’s and Delay’s echoes ring out uncompressed, after the Compressor. Controlled Decay compresses them too, keeping everything — echoes included — evened out.</li>'
        + '</ul>'
        + '<p><strong>Limiter</strong>: a hard ceiling that keeps the loudest sounds from ever going too loud. <strong>Ceiling</strong> sets the maximum volume nothing is allowed to pass.</p>',
    },
  },
  'fleet.compressor': { human: 'Compressor', lore: 'Bundler', heading: 'DYNAMIC RANGE CONDENSER' },
  'fleet.compressor.threshold': { human: 'Threshold', lore: 'Bundle Threshold', unit: 'dB' },
  'fleet.compressor.ratio': { human: 'Ratio', lore: 'Bundle Ratio' },
  'fleet.compressor.attack': { human: 'Attack Time', lore: 'Bundle Onset', unit: 's' },
  'fleet.compressor.release': { human: 'Release Time', lore: 'Bundle Recovery', unit: 's' },
  'fleet.compressor.knee': { human: 'Knee', lore: 'Bundle Curve', unit: 'dB' },
  'fleet.output.decayMode': {
    human: 'Decay Mode',
    lore: 'Decay Protocol',
    options: {
      natural: { human: 'Natural Decay', lore: 'Dissipation' },
      controlled: { human: 'Controlled Decay', lore: 'Clamped' },
    },
  },
  'fleet.limiter': { human: 'Limiter', lore: 'Reduction', heading: 'TERMINAL CEILING GATE' },
  'fleet.limiter.ceiling': { human: 'Ceiling', lore: 'Output Ceiling', unit: 'dB' },
} as const satisfies Record<string, ContentEntry>;
