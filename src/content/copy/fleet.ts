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
        + '<li><strong>Humanize</strong>: how far off the grid, in milliseconds, every probe’s notes may land. 0 keeps them machine-exact.</li>'
        + '<li><strong>Automation Rate</strong>: how often the fleet automatically nudges its own effects settings — swells of extra motion that come and go on their own. Set it to 0 to turn automatic swells off entirely.</li>'
        + '<li><strong>Automation Length</strong>: how many measures one of those swells lasts, start to finish.</li>'
        + '<li><strong>Automation Range</strong>: how far a swell can push the affected settings once one is happening — bigger numbers mean more dramatic swells.</li>'
        + '</ul>',
    },
  },
  'fleet.pacing.tempo': {
    human: 'Tempo',
    lore: 'Ping Rate',
    unit: 'BPM',
    help: { human: 'How fast the music plays, in beats per minute. Every probe keeps time to it, and so does anything set to Sync — the LFO lanes and Delay Time.' },
  },
  // The lore words are placeholders until Crawford's copy pass (docs/specs/ROBOT_PERFORMANCE.md assumption 14).
  'fleet.pacing.humanize': {
    human: 'Humanize',
    lore: 'Ping Jitter',
    unit: ' ms',
    help: { human: 'How far off the grid, in milliseconds, every probe’s notes may land. 0 is machine-exact; higher settings loosen the fleet so no two notes land quite together. It does not change the tempo.' },
  },
  'fleet.pacing.automationRate': {
    human: 'Automation Rate',
    lore: 'Trace Skip Rate',
    options: { off: { human: 'Off' } },
    help: { human: 'How often the fleet starts a swell — a stretch where it pushes some of its own effects settings, then eases them back. It runs from once every 16 measures to 16 times a measure; Off stops swells entirely.' },
  },
  /** The rate slider's readout for ≥1 and <1 per measure (audioRigConfig's formatSwellFrequency). */
  'fleet.pacing.automationRate.perMeasure': { human: 'per measure', template: '{n}/measure' },
  'fleet.pacing.automationRate.everyMeasures': { human: 'every … measures', template: 'every {n} measures' },
  'fleet.pacing.automationLength': {
    human: 'Automation Length',
    lore: 'Trace Runway',
    unit: ' measures',
    help: { human: 'How many measures one swell lasts, from the moment it starts pushing to the moment the settings are back where they were.' },
  },
  'fleet.pacing.automationRange': {
    human: 'Automation Range',
    lore: 'Trace Width',
    unit: '%',
    help: { human: 'How far a swell can push the settings it touches. Low values make gentle swells; high values make dramatic ones.' },
  },

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
        + '<p>Each of these sliders can link to one of the 4 shared LFO Bank lanes — an invisible hand that turns the slider’s knob back and forth automatically. The picker and Depth control sit right below the slider; Depth sets how far the hand turns. How fast it turns belongs to the lane itself, tuned once in the LFO Bank panel and shared by every slider linked to it.</p>',
    },
  },
  'fleet.eq': { human: '3-Band EQ', lore: 'Trace Metrics', heading: 'SPECTRAL FREQUENCY EQUALIZER' },
  'fleet.eq.bass': {
    human: 'Bass',
    lore: 'Sub-Band',
    unit: 'dB',
    help: { human: 'Boosts or cuts the low end of the whole fleet’s sound — the deep, rumbling part. 0 dB leaves it as it is.' },
  },
  'fleet.eq.mid': {
    human: 'Mid',
    lore: 'Medial Band',
    unit: 'dB',
    help: { human: 'Boosts or cuts the middle of the sound, where most of the melodies sit. 0 dB leaves it as it is.' },
  },
  'fleet.eq.treble': {
    human: 'Treble',
    lore: 'Apical Band',
    unit: 'dB',
    help: { human: 'Boosts or cuts the high end — the bright, airy part of the sound. 0 dB leaves it as it is.' },
  },
  'fleet.hpf': { human: 'High-Pass Filter', lore: 'Top Extraction', heading: 'LOW-FREQUENCY MASK' },
  'fleet.hpf.cutoff': {
    human: 'Cutoff',
    lore: 'Extraction Ceiling',
    unit: 'Hz',
    help: { human: 'The pitch below which the high-pass filter starts cutting. Raise it to thin the sound out; at its lowest, nearly everything passes through.' },
  },
  'fleet.hpf.resonance': {
    human: 'Resonance',
    lore: 'Boundary Resonance',
    help: { human: 'Adds a ringing emphasis right at the high-pass cutoff. Low values keep the filter smooth; high values make it whistle.' },
  },
  'fleet.lpf': { human: 'Low-Pass Filter', lore: 'Bottom Extraction', heading: 'HIGH-FREQUENCY MASK' },
  'fleet.lpf.cutoff': {
    human: 'Cutoff',
    lore: 'Extraction Floor',
    unit: 'Hz',
    help: { human: 'The pitch above which the low-pass filter starts cutting. Lower it to make the sound darker and more muffled; at its highest, nearly everything passes through.' },
  },
  'fleet.lpf.resonance': {
    human: 'Resonance',
    lore: 'Boundary Resonance',
    help: { human: 'Adds a ringing emphasis right at the low-pass cutoff. Low values keep the filter smooth; high values make it whistle.' },
  },

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
  // `short` is the phone shell's lane title; laneTitle (src/data/lfoConfig.ts) composes the desk form
  // "Core LFO (LFO A)" through fleet.lfoBank.laneTitle's template (docs/specs/LAYOUT_REWORK.md §1.4).
  'fleet.lfoBank.laneA': { human: 'Core LFO', lore: 'Apex Signature', short: 'LFO A' },
  'fleet.lfoBank.laneB': { human: 'Companion LFO', lore: 'Lateral Signature', short: 'LFO B' },
  'fleet.lfoBank.laneC': { human: 'Accent LFO', lore: 'Impulse Signature', short: 'LFO C' },
  'fleet.lfoBank.laneD': { human: 'Overtone LFO', lore: 'Canopy Signature', short: 'LFO D' },
  'fleet.lfoBank.laneTitle': { human: 'Lane title', template: '{lane} ({short})' },
  'fleet.lfoBank.rateDrift': {
    human: 'Rate Drift',
    lore: 'Trace Pulse',
    unit: '%',
    help: { human: 'Makes this lane’s speed wander slowly up and down over time. 0 keeps the speed steady; the further from 0, the wider it wanders, and positive and negative start it off in opposite directions.' },
  },
  'fleet.lfoBank.depthDrift': {
    human: 'Depth Drift',
    lore: 'Trace Bending',
    unit: '%',
    help: { human: 'Makes how far this lane swings its linked dials wander slowly over time. 0 keeps the swing steady; the further from 0, the wider it wanders, and positive and negative start it off in opposite directions.' },
  },

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
        + '<li><strong>Reverb Amount</strong>: how loud the whole Reverb is, as heard from every probe. Each probe’s own Reverb slider decides how much of it that probe sends in; 0 silences the room.</li>'
        + '<li><strong>Delay Time</strong>: how long between the original sound and its first repeat.</li>'
        + '<li><strong>Repeats</strong>: how many times that repeat echoes back before fading out.</li>'
        + '<li><strong>Delay Amount</strong>: how loud the whole Delay is, as heard from every probe. Each probe’s own Delay slider decides how much of it that probe sends in; 0 silences the repeats.</li>'
        + '</ul>',
    },
  },
  'fleet.reverb': { human: 'Reverb', lore: 'External Capacity', heading: 'SPATIAL DIFFUSION MATRIX' },
  'fleet.reverb.length': {
    human: 'Reverb Length',
    lore: 'Dissipation Time',
    unit: 's',
    help: { human: 'How long the echo of the space rings out after each sound, in seconds. Short sounds like a small room; long sounds like a vast cavern.' },
  },
  'fleet.reverb.preDelay': {
    human: 'Pre-Delay',
    lore: 'Initial Lag',
    unit: 's',
    help: { human: 'How long the echo waits before it starts, after the original sound. A little pre-delay keeps the original sound clear in front of its echo.' },
  },
  'fleet.reverb.amount': {
    human: 'Reverb Amount',
    lore: 'Diffusion Ratio',
    help: { human: 'How loud the whole Reverb is, as heard from every probe. Each probe’s own Reverb slider decides how much of it that probe sends in. 0 silences the room.' },
  },
  'fleet.delay': { human: 'Delay', lore: 'Retracing', heading: 'TEMPORAL REFLECTION MATRIX' },
  'fleet.delay.time': {
    human: 'Delay Time',
    lore: 'Propagation Lag',
    unit: 's',
    help: { human: 'How long between the original sound and its first repeat. In Free it is set in seconds; in Sync it is a note length that follows the Tempo.' },
  },
  'fleet.delay.repeats': {
    human: 'Repeats',
    lore: 'Recirculation Rate',
    help: { human: 'How many times the repeat echoes back before it fades. Low values give one or two repeats; high values keep it going for a long time.' },
  },
  'fleet.delay.amount': {
    human: 'Delay Amount',
    lore: 'Reflection Ratio',
    help: { human: 'How loud the whole Delay is, as heard from every probe. Each probe’s own Delay slider decides how much of it that probe sends in. 0 silences the repeats.' },
  },

  // ---------------------------------------------------------------- Colour (docs/specs/GLOBAL_COLOUR.md §1.6)
  // Placeholders for Crawford's copy pass (spec assumption 14): the "degraded transmission" frame carries
  // the lore, and the lore words are the ones the grid (docs/reference/GLOBAL_CHAIN_GRID.md) already lists.
  'fleet.colour': {
    human: 'Colour',
    lore: 'Signal Wear',
    intro: {
      lore: 'Colour — what the long way home does to a signal.',
      loreDescription: 'A signal that crosses Meridia Comms Group’s Undersea Mesh Network arrives a little worn. Every fleet carries some wear of its own, and the network lets you turn it up or wipe it clean.',
      humanDescription: '<ul>'
        + '<li><strong>Distortion</strong>: pushes the sound until it overdrives, adding warmth, fuzz and grit.</li>'
        + '<li><strong>Chebyshev</strong>: adds extra overtones on top of the sound, from a faint shimmer to a bright, buzzy edge.</li>'
        + '<li><strong>Bit Crusher</strong>: throws away detail from the sound, making it grainy and lo-fi, like an old digital recording.</li>'
        + '</ul>'
        + '<p>The three effects share one room that a probe sends into, rather than a stage every probe passes through: each probe’s own <strong>Grit</strong> slider decides how much of its sound goes in, and a probe at 0% stays clean. Each effect has its own <strong>Mix</strong> slider: at 0 it does nothing, and the further you raise it, the more of the effect the room carries. Reverb and Delay echoes stay clean. Every new world starts with a little of one effect, or none, and gives a few probes some Grit.</p>',
    },
  },
  'fleet.distortion': { human: 'Distortion', lore: 'Carrier Bleed', heading: 'CARRIER BLEED STAGE' },
  'fleet.distortion.drive': {
    human: 'Drive',
    lore: 'Bleed Gain',
    help: { human: 'How hard the sound is pushed into the overdrive. Low values add a gentle warmth and fuzz; high values give a thick, gritty distortion. You only hear it as far as Mix lets it in.' },
  },
  'fleet.distortion.mix': {
    human: 'Mix',
    lore: 'Bleed Ratio',
    help: { human: 'How much of the distorted sound is blended in with the clean sound. At 0 the sound stays clean; raise it to hear more of the distortion.' },
  },
  'fleet.chebyshev': { human: 'Chebyshev', lore: 'Overtone Fold', heading: 'OVERTONE FOLD STAGE' },
  'fleet.chebyshev.harmonics': {
    human: 'Harmonics',
    lore: 'Fold Order',
    help: { human: 'How many layers of extra overtones are folded into the sound. 1 changes nothing; higher numbers add more shimmering, bell-like or buzzy pitches, and odd and even numbers have different characters.' },
  },
  'fleet.chebyshev.mix': {
    human: 'Mix',
    lore: 'Fold Ratio',
    help: { human: 'How much of the overtone-folded sound is blended in with the original. At 0 the sound is unchanged; raise it to hear the extra overtones.' },
  },
  'fleet.bitCrusher': { human: 'Bit Crusher', lore: 'Quantise Loss', heading: 'QUANTISE LOSS STAGE' },
  'fleet.bitCrusher.bits': {
    human: 'Bit Depth',
    lore: 'Quantise Depth',
    unit: ' bits',
    help: { human: 'How much detail the sound keeps, in bits. 16 is close to the original; lower numbers get grainier and rougher, and 1 is extremely harsh. You only hear it as far as Mix lets it in.' },
  },
  'fleet.bitCrusher.mix': {
    human: 'Mix',
    lore: 'Loss Ratio',
    help: { human: 'How much of the crushed sound is blended in with the clean sound. At 0 the sound stays clean; raise it to hear the grain.' },
  },

  // ---------------------------------------------------------------- Modulation (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.7)
  // Placeholders for Crawford's copy pass (spec assumption 16): the lore words follow the same "degraded
  // transmission" frame as Colour, and the names are the ones the grid (docs/reference/GLOBAL_CHAIN_GRID.md) lists.
  'fleet.modulation': {
    human: 'Modulation',
    lore: 'Mesh Drift',
    intro: {
      lore: 'Modulation — the drift the Undersea Mesh Network adds on its own.',
      loreDescription: 'Even a clean carrier wanders a little as it crosses the Undersea Mesh Network. Meridia Comms Group lets you tune that wander, or let it go quiet.',
      humanDescription: '<ul>'
        + '<li><strong>Auto Wah</strong>: a filter that opens and closes with the loudness of the fleet, so louder moments sound brighter and quieter ones duller.</li>'
        + '<li><strong>Phaser</strong>: a slow, swirling sweep that moves through the sound, like a soft whoosh or a jet passing by.</li>'
        + '<li><strong>Chorus</strong>: a doubled, slightly wavering copy of the sound beside the original, so the fleet shimmers and sounds wider.</li>'
        + '<li><strong>Tremolo</strong>: the volume pulses up and down, swinging between the left and right speakers.</li>'
        + '<li><strong>Vibrato</strong>: the pitch wobbles gently up and down, like a singer holding a note.</li>'
        + '<li><strong>Shifter</strong>: moves every frequency up or down by the same few hertz, so the notes ring and beat strangely against each other.</li>'
        + '</ul>'
        + '<p>The Auto Wah, Phaser, Tremolo and Vibrato act on the fleet’s direct sound, and each has its own <strong>Mix</strong> slider: at 0 it does nothing, and the further you raise it, the more of the effect you hear. The Chorus and Shifter are rooms a probe sends into rather than stages every probe passes through: each probe’s own <strong>Double</strong> and <strong>Shimmer</strong> sliders decide how much of its sound goes in, and each room’s <strong>Return</strong> slider sets how loud it is as heard from every probe. The <strong>Rate</strong> of the Phaser, Chorus, Tremolo and Vibrato can run Free, in hertz, or in Sync, as a note length that follows the Tempo. Reverb and Delay echoes stay clean. Every new world starts with a little of up to two pedals, or none, and gives a few probes some Shimmer or Double.</p>',
    },
  },
  'fleet.autoWah': { human: 'Auto Wah', lore: 'Pressure Sweep', heading: 'PRESSURE SWEEP STAGE' },
  'fleet.autoWah.baseFrequency': {
    human: 'Base Frequency',
    lore: 'Sweep Floor',
    unit: 'Hz',
    help: { human: 'The lowest pitch the wah filter rests on when the sound is quiet. Low values give a deep, throaty wah; high values keep it thin and bright.' },
  },
  'fleet.autoWah.octaves': {
    human: 'Octaves',
    lore: 'Sweep Span',
    unit: ' oct',
    help: { human: 'How far above the Base Frequency the filter opens when the sound is loud, in octaves. Small values nudge the tone; large values sweep it across most of the sound.' },
  },
  'fleet.autoWah.sensitivity': {
    human: 'Sensitivity',
    lore: 'Pressure Threshold',
    unit: 'dB',
    help: { human: 'How easily the filter reacts to the sound. Values closer to −40 dB make it open even for quiet notes; values near 0 dB need a loud sound to move it.' },
  },
  'fleet.autoWah.q': {
    human: 'Resonance',
    lore: 'Pressure Focus',
    help: { human: 'How narrow and sharp the wah filter is. Low values give a broad, gentle wah; high values give a pointed, vowel-like quack.' },
  },
  'fleet.autoWah.gain': {
    human: 'Peak',
    lore: 'Surge Gain',
    unit: 'dB',
    help: { human: 'How much the sound is boosted right where the filter sits. 0 adds no boost; higher values make the wah ring out more.' },
  },
  'fleet.autoWah.follower': {
    human: 'Follow',
    lore: 'Pressure Lag',
    unit: 's',
    help: { human: 'How quickly the filter follows the loudness of the sound, in seconds. Short values snap open and shut on every note; long values glide and smooth out.' },
  },
  'fleet.autoWah.mix': {
    human: 'Mix',
    lore: 'Sweep Ratio',
    help: { human: 'How much of the wah sound is blended in with the original. At 0 the sound is unchanged; raise it to hear the wah.' },
  },
  'fleet.phaser': { human: 'Phaser', lore: 'Phase Lag', heading: 'PHASE LAG STAGE' },
  'fleet.phaser.rate': {
    human: 'Rate',
    lore: 'Phase Cycle',
    unit: 'Hz',
    help: { human: 'How fast the phaser sweeps back and forth. In Free it is set in hertz, cycles per second; in Sync it is a note length that follows the Tempo.' },
  },
  'fleet.phaser.octaves': {
    human: 'Octaves',
    lore: 'Lag Span',
    unit: ' oct',
    help: { human: 'How wide the sweep is, in octaves, above the Base Frequency. Small values give a gentle shimmer; large values give a big, dramatic swoosh.' },
  },
  'fleet.phaser.baseFrequency': {
    human: 'Base Frequency',
    lore: 'Lag Floor',
    unit: 'Hz',
    help: { human: 'The lowest pitch the sweep reaches. Low values put the swirl in the body of the sound; high values keep it in the airy top.' },
  },
  'fleet.phaser.stages': {
    human: 'Stages',
    lore: 'Lag Depth',
    help: { human: 'How many layers of phase shift are stacked, from 1 to 12. Few stages give a light, subtle swirl; many stages give a deep, rich one. Changing it rebuilds the effect for a moment.' },
  },
  'fleet.phaser.q': {
    human: 'Resonance',
    lore: 'Lag Focus',
    help: { human: 'How sharply the sweep stands out. Low values blend in softly; high values give a pronounced, whistling swirl.' },
  },
  'fleet.phaser.mix': {
    human: 'Mix',
    lore: 'Lag Ratio',
    help: { human: 'How much of the swirling sound is blended in with the original. At 0 the sound is unchanged; raise it to hear the sweep.' },
  },

  // Global Pedals (docs/specs/GLOBAL_PEDALS.md §1.7): placeholders for the copy pass (spec assumption 16).
  'fleet.chorus': { human: 'Chorus', lore: 'Twin Current', heading: 'TWIN CURRENT STAGE' },
  'fleet.chorus.rate': {
    human: 'Rate',
    lore: 'Current Cycle',
    unit: 'Hz',
    help: { human: 'How fast the chorus copy drifts in and out of tune with the original. In Free it is set in hertz, cycles per second; in Sync it is a note length that follows the Tempo.' },
  },
  'fleet.chorus.delay': {
    human: 'Delay',
    lore: 'Current Offset',
    unit: ' ms',
    help: { human: 'How far behind the original the chorus copy sits, in milliseconds. Short values give a tight shimmer; longer values give a looser, doubled sound.' },
  },
  'fleet.chorus.depth': {
    human: 'Depth',
    lore: 'Current Depth',
    help: { human: 'How far the chorus copy wavers. Low values give a faint shimmer; high values give a wide, seasick wobble.' },
  },
  'fleet.chorus.spread': {
    human: 'Spread',
    lore: 'Current Spread',
    unit: '°',
    help: { human: 'How differently the left and right copies waver, in degrees. At 0 both move together; at 180 they move in opposite directions and the sound feels widest.' },
  },
  'fleet.chorus.feedback': {
    human: 'Feedback',
    lore: 'Current Return',
    help: { human: 'How much of the chorus copy is fed back into itself. At 0 it is a plain chorus; raise it for a metallic, jet-like flange.' },
  },
  // The Chorus is a room now (docs/specs/ROBOT_EFFECT_SENDS.md assumptions 4 and 14): this row is its Return.
  'fleet.chorus.mix': {
    human: 'Return',
    lore: 'Current Ratio',
    help: { human: 'How loud the whole Chorus is, as heard from every probe. Each probe’s own Double slider decides how much of it that probe sends in. 0 silences the room.' },
  },
  'fleet.tremolo': { human: 'Tremolo', lore: 'Pulse Fade', heading: 'PULSE FADE STAGE' },
  'fleet.tremolo.rate': {
    human: 'Rate',
    lore: 'Pulse Cycle',
    unit: 'Hz',
    help: { human: 'How fast the volume pulses. In Free it is set in hertz, pulses per second; in Sync it is a note length that follows the Tempo.' },
  },
  'fleet.tremolo.depth': {
    human: 'Depth',
    lore: 'Pulse Depth',
    help: { human: 'How far the volume dips on each pulse. Low values give a gentle throb; at 1 the sound fades all the way out between pulses.' },
  },
  'fleet.tremolo.spread': {
    human: 'Spread',
    lore: 'Pulse Spread',
    unit: '°',
    help: { human: 'How far apart the left and right pulses are, in degrees. At 0 both speakers pulse together; at 180 the sound swings from one side to the other.' },
  },
  'fleet.tremolo.mix': {
    human: 'Mix',
    lore: 'Pulse Ratio',
    help: { human: 'How much of the pulsing sound is blended in with the steady original. At 0 the volume holds still; raise it to hear the pulse.' },
  },
  'fleet.vibrato': { human: 'Vibrato', lore: 'Line Waver', heading: 'LINE WAVER STAGE' },
  'fleet.vibrato.rate': {
    human: 'Rate',
    lore: 'Waver Cycle',
    unit: 'Hz',
    help: { human: 'How fast the pitch wobbles. In Free it is set in hertz, wobbles per second; in Sync it is a note length that follows the Tempo.' },
  },
  'fleet.vibrato.depth': {
    human: 'Depth',
    lore: 'Waver Depth',
    help: { human: 'How far the pitch wobbles away from the note. Low values give a subtle warble; high values bend the notes clearly out of tune.' },
  },
  'fleet.vibrato.mix': {
    human: 'Mix',
    lore: 'Waver Ratio',
    help: { human: 'How much of the wobbling sound is blended in with the original. At 0 the pitch holds steady; raise it to hear the wobble.' },
  },
  'fleet.frequencyShifter': { human: 'Shifter', lore: 'Band Slip', heading: 'BAND SLIP STAGE' },
  'fleet.frequencyShifter.shift': {
    human: 'Shift',
    lore: 'Slip Offset',
    unit: 'Hz',
    help: { human: 'How many hertz every frequency is moved. At 0 nothing moves; above 0 everything slides up, below 0 everything slides down. A few hertz gives a slow, beating ring; hundreds give a clangy, metallic sound.' },
  },
  // The Shifter is a room now (docs/specs/ROBOT_EFFECT_SENDS.md assumptions 4 and 14): this row is its Return.
  'fleet.frequencyShifter.mix': {
    human: 'Return',
    lore: 'Slip Ratio',
    help: { human: 'How loud the whole Shifter is, as heard from every probe. Each probe’s own Shimmer slider decides how much of it that probe sends in. 0 silences the room.' },
  },

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
        + '<li><strong>Decay Mode</strong>: Natural Decay runs Reverb’s and Delay’s echoes through the Compressor along with the original sound, evening everything out together. Controlled Decay sends the echoes around it, so they ring out uncompressed with only Width and the Limiter above them.</li>'
        + '</ul>'
        + '<p><strong>Width</strong>: how wide the whole fleet sounds between the left and right speakers, echoes included. 0.5 is the sound as recorded; 0 folds it to mono; 1 pushes it out to the sides.</p>'
        + '<p><strong>Limiter</strong>: a hard ceiling that keeps the loudest sounds from ever going too loud. <strong>Ceiling</strong> sets the maximum volume nothing is allowed to pass.</p>',
    },
  },
  'fleet.compressor': { human: 'Compressor', lore: 'Bundler', heading: 'DYNAMIC RANGE CONDENSER' },
  'fleet.compressor.threshold': {
    human: 'Threshold',
    lore: 'Bundle Threshold',
    unit: 'dB',
    help: { human: 'How loud a sound has to get before the compressor starts turning it down. Lower it and more of the sound gets compressed.' },
  },
  'fleet.compressor.ratio': {
    human: 'Ratio',
    lore: 'Bundle Ratio',
    help: { human: 'How strongly the compressor turns a sound down once it passes the threshold. 1 does nothing; 20 flattens it almost completely.' },
  },
  'fleet.compressor.attack': {
    human: 'Attack Time',
    lore: 'Bundle Onset',
    unit: 's',
    help: { human: 'How quickly the compressor reacts once a sound crosses the threshold. Fast catches every peak; slow lets the start of each note punch through.' },
  },
  'fleet.compressor.release': {
    human: 'Release Time',
    lore: 'Bundle Recovery',
    unit: 's',
    help: { human: 'How quickly the compressor lets go once the sound drops back below the threshold. Fast sounds lively; slow sounds smooth.' },
  },
  'fleet.compressor.knee': {
    human: 'Knee',
    lore: 'Bundle Curve',
    unit: 'dB',
    help: { human: 'How gradually the compressor eases in around the threshold. 0 snaps on at once; higher values blend it in softly.' },
  },
  'fleet.output.decayMode': {
    human: 'Decay Mode',
    lore: 'Decay Protocol',
    options: {
      natural: { human: 'Natural Decay', lore: 'Dissipation' },
      controlled: { human: 'Controlled Decay', lore: 'Clamped' },
    },
    help: { human: 'Whether the compressor also evens out the echoes. Natural Decay runs Reverb’s and Delay’s echoes through the compressor; Controlled Decay sends them around it, so they ring out uncompressed.' },
  },
  'fleet.stereoWidener': { human: 'Width', lore: 'Spread', heading: 'STEREO SPREAD STAGE' },
  'fleet.stereoWidener.width': {
    human: 'Width',
    lore: 'Spread Field',
    help: { human: 'How wide the fleet sounds between the left and right speakers, echoes included. 0.5 is the sound as recorded; 0 folds it to mono, which can sound fuller on a single phone speaker; 1 pushes everything out to the sides.' },
  },
  'fleet.limiter': { human: 'Limiter', lore: 'Reduction', heading: 'TERMINAL CEILING GATE' },
  'fleet.limiter.ceiling': {
    human: 'Ceiling',
    lore: 'Output Ceiling',
    unit: 'dB',
    help: { human: 'The loudest the fleet is ever allowed to get. Anything that would go past it is held down to it.' },
  },
} as const satisfies Record<string, ContentEntry>;
