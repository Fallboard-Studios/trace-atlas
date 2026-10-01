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
      humanDescription: 'This screen holds every control that shapes the sound of your whole fleet at once — pacing, EQ and filtering, drift, spatial effects, and output. Changes here apply to every probe simultaneously; to adjust one probe at a time, use the Probes screen instead.',
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

  // ---------------------------------------------------------------- Drift
  'fleet.drift': {
    human: 'Drift',
    lore: 'Signatures',
    intro: {
      lore: 'Drift — a wandering hand behind every dial.',
      loreDescription: 'No signal holds perfectly steady across an entire mesh network — Drift keeps every automated adjustment a little unpredictable, the way a real network would.',
      humanDescription: '<p>Drift adds a second, slower LFO on top of an existing one — a hand turning the hand that’s turning the knob. Set Rate Drift positive and the underlying LFO’s speed wanders faster over time; set it negative and it wanders slower. Depth Drift works the same way for how far the LFO swings.</p>'
        + '<p><strong>Environmental Drift</strong> affects the shared LFOs on the EQ & Filters sliders above — one setting for all of them together. <strong>Voice Drift</strong> affects every probe’s own oscillator LFOs the same way, fleet-wide.</p>',
    },
  },
  'fleet.drift.environmental': { human: 'Environmental Drift', lore: 'Trace Appendix' },
  'fleet.drift.environmental.rate': { human: 'Rate Drift', lore: 'Trace Pulse', unit: '%' },
  'fleet.drift.environmental.depth': { human: 'Depth Drift', lore: 'Trace Bending', unit: '%' },
  'fleet.drift.voice': { human: 'Voice Drift', lore: 'Probe Signature' },
  'fleet.drift.voice.rate': { human: 'Rate Drift', lore: 'Ping Period', unit: '%' },
  'fleet.drift.voice.depth': { human: 'Depth Drift', lore: 'Ping Flicker', unit: '%' },

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
