// ========================================
// IMPORTS
// ========================================
import type { BandTable } from './bandKeys';

// ========================================
// THEMES
// ========================================

/** The fourteen theme ids (docs/specs/THEME_AND_ASPECTS_REFINEMENT.md; the cut, docs/reference/THEME_AND_ASPECT_SHEETS.md),
 *  Classic first, then the four renamed (Float was Calm, Anchor Bold, Shatter Perilous, Undertow the Current candidate,
 *  first named Tide) and the nine candidates kept, in the sheets' order - the order the Loading axis's theme row lists
 *  them. Each id follows its name (open question 5), so an old link's `calm`, `adventurous` or `tide` is no theme and
 *  loads Classic. The ids are code;
 *  the names and one-line descriptions are content (`home.off.theme.<id>`, `home.off.themeDescription.<id>`). */
export const THEME_IDS = [
  'classic',
  'float',
  'anchor',
  'shatter',
  'undertow',
  'trench',
  'tidepool',
  'floe',
  'thicket',
  'wreck',
  'openWater',
  'ventField',
  'beacon',
  'polarLow',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Whether a value from outside the app - a payload, a link param - names a theme. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/**
 * A theme's column: a whole band for each key it moves and nothing for the rest; resolveBands overlays it on Classic,
 * replacing never widening (docs/specs/OFF_SCREEN.md §1.5). Any key of the band table, each of its own kind
 * (docs/specs/THEME_AND_ASPECTS_REFINEMENT.md §1.5, widening): the v1 ten-key list (OFF_SCREEN.md assumption 16) went
 * with the interview, since a theme is the world and the default probe guardrails alike. The type still holds two
 * lines - a key outside the table, or a band of the wrong kind, does not compile - and resolveBands.test.ts holds the
 * third, every band inside its field. A robot key a column names must also be compared and pushed when a theme
 * changes on a live world (aspectDeal.ts's movedFields, plan T6) before a column may name it.
 */
export type ThemeColumn = Partial<BandTable>;

/** What a theme can light in every world (the sheets' rules, Crawford 2026-11-03): the three colour nodes and the four
 *  dry-chain pedals, each of which a seeded coin lights otherwise. The rooms (the Chorus is the Double room, the
 *  Frequency Shifter the Shimmer room) have no coin: their probes' sends light them. */
export const THEME_LIGHTS = ['distortion', 'chebyshev', 'bitCrusher', 'autoWah', 'phaser', 'tremolo', 'vibrato'] as const;
export type ThemeLight = (typeof THEME_LIGHTS)[number];

/**
 * The lit rule (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T8): a column naming any row of a pedal or a colour node -
 * its Mix or any shape row - lights that pedal or node in every world it seeds; a column naming none of its rows leaves
 * the coin. generateGlobalAudioSettings reads the loaded theme's set through the loading context (isLitByTheme), and a
 * forced pedal counts against the two-lit cap.
 */
export function themeLights(column: ThemeColumn): ReadonlySet<ThemeLight> {
  const units = new Set(Object.keys(column).map((key) => key.split('.')[0]));
  return new Set(THEME_LIGHTS.filter((light) => units.has(light)));
}

/**
 * The theme columns, one per sheet in docs/reference/THEME_AND_ASPECT_SHEETS.md (plan T8). Each column names exactly the
 * sheet's "Keys owned" (resolveBands.test.ts types the lists in and holds them), each key's comment is the sheet
 * sentence that needs it, and no band equals Classic's. EVERY NUMBER HERE IS A FIRST CUT: T10's harness measures what
 * the generators realise under it, L1's listens tune it, and each retune is an R-task naming its sheet sentence. Where a
 * sheet gave "Sketch starting points" (Crawford's guesses for the sketch, not rules) the cut starts from them, clamped
 * to the field. A lit share of 0 is the sheet's "none": no probe carries the trait, and a lit coin never lands. Classic's
 * column is `{}` by definition - Classic IS the lifted table (classic.ts); its sheet owns no key.
 *
 * Two draws to read the numbers against. The three effect-room sends roll in the order Grit, Shimmer, Double and a probe
 * carries at most one (composeExclusiveSends), so a theme raising the Shimmer or the Double share realises less than its
 * `lit` beside Classic's Grit share; the sketch shows how much (Floe's, Thicket's and Undertow's sheets say so). And the
 * layers' detune draws centred over its band, so most layers sit near the band's middle.
 */
export const THEMES: Record<ThemeId, ThemeColumn> = {
  classic: {},

  // Float: slack water, warm.
  float: {
    bpm: { min: 40, max: 60 }, // the pulse is slow
    'robot.rhythmicDensity': { min: 0, max: 40 }, // each probe speaks seldom
    'robot.rests': { min: 40, max: 80 }, // and leaves long rests between phrases
    'robot.rhythmicMotifLength': { offShare: 0.15, min: 1, max: 3 }, // short gentle cells: a figure short when on
    'robot.accents': { min: 0, max: 15 }, // no note pushed harder than another: no rhythmic push
    'robot.waveform': { weights: { sine: 1, square: 0, triangle: 1, sawtooth: 0, pulse: 0 } }, // the sine and the triangle
    'robot.attack': { min: 0.3, max: 0.8 }, // every note arrives slowly (sketch: 0.3 to 0.8 s)
    'robot.release': { min: 1.5, max: 2 }, // and trails long (sketch: 1.5 to 3 s, clamped to the 2 s slider)
    'robot.filterFreq': { min: 2000, max: 4500 }, // the probe filter open and warm
    'filterLPF.frequency': { min: 1500, max: 2500 }, // the master filter takes the top off (sketch: 1.5 to 2.5 kHz)
    gritSend: { min: 0.4, max: 0.8, lit: 0 }, // no probe sent to the Grit room: no drive, whatever node the coin lit
    'reverb.decay': { min: 2, max: 3.5 }, // a generous room
    'reverb.preDelay': { min: 0, max: 0.02 }, // near: its walls close, warm rather than vast
    reverbSend: { min: 0.35, max: 0.6, lit: 1 }, // every probe in it
  },

  // Anchor: the hold on the sea floor.
  anchor: {
    'robot.attack': { min: 0.015, max: 0.015 }, // an instant attack: the note lands (sketch: 0.001 s; held at the slider's click-free floor)
    'robot.decay': { min: 0.05, max: 0.3 }, // a tight decay
    'robot.portamento': { min: 0.05, max: 0.2, lit: 0 }, // nothing slides: no probe glides
    'robot.lfoDetuneDepth': { min: 1, max: 10, lit: 0 }, // nothing wavers: no layer drifts against another
    'robot.detune': { min: 0, max: 0 }, // each probe's layers tuned dead on one another
    'robot.waveform': { weights: { sine: 0, square: 1, triangle: 1, sawtooth: 0, pulse: 0 } }, // the square and the triangle
    'robot.layerGain': { min: 0.8, max: 1.2, lit: 1 }, // partner layers full: the stack is dense
    reverbSend: { min: 0.1, max: 0.6, lit: 0 }, // no probe in the wash (sketch: zero)
    delaySend: { min: 0, max: 0.3, lit: 0 }, // none in the echo (sketch: zero)
    'eq3.low': { min: -1, max: 1 }, // flat: held near centre
    'eq3.high': { min: -1, max: 1 }, // flat
    'eq3.mid': { min: 1, max: 3 }, // but for a slight lift: the weight sits low-mid
    'limiter.threshold': { min: -6, max: -4 }, // held tight: the punch never spikes
  },

  // Shatter: breaking glass. Naming all three colour nodes lights all three in every world (the lit rule).
  shatter: {
    gritSend: { min: 0.6, max: 0.9, lit: 0.85 }, // most probes sent to the Grit room: a crunch on nearly every note
    'distortion.amount': { min: 0.5, max: 0.8 }, // the drive high
    'chebyshev.order': { min: 5, max: 8 }, // the fold order high: jagged
    'bitCrusher.bits': { min: 3, max: 6 }, // the bit depth low
    'distortion.wet': { min: 0.2, max: 0.3 }, // whatever node the coin lit bites hard
    'chebyshev.wet': { min: 0.2, max: 0.3 }, // bites hard
    'bitCrusher.wet': { min: 0.2, max: 0.3 }, // bites hard
    'eq3.high': { min: 3, max: 6 }, // the high band lifted: the crunch sits on top
    'filterLPF.frequency': { min: 12000, max: 20000 }, // the master filter wide open
    'robot.waveform': { weights: { sine: 0, square: 0, triangle: 0, sawtooth: 1, pulse: 1 } }, // the saw and the pulse
    'robot.octaveRegister': { weights: { bass: 0, low: 0, mid: 0, high: 1, treble: 1 } }, // set high in the register
    'robot.detune': { min: -30, max: 30 }, // each probe's layers tuned wide apart (sketch: 20 to 30 cents)
    'robot.attack': { min: 0.015, max: 0.015 }, // a hard strike (held at the slider's click-free floor)
    'robot.decay': { min: 0.02, max: 0.15 }, // short
    'robot.sustain': { min: 0, max: 0.2 }, // holds little
    'robot.release': { min: 0.02, max: 0.1 }, // gone at once
    'robot.rhythmicDensity': { min: 80, max: 100 }, // probes talk nearly all the time
    'robot.rests': { min: 0, max: 8 }, // with hardly a rest: a wall, never gusting
    bpm: { min: 110, max: 140 }, // the pulse is fast
    'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0.05 }, // nothing resonates: the accent filter off most probes
    'robot.lfoBusDepth': { min: 1, max: 40, lit: 0 }, // nothing sweeps: the probe filter does not move
    'delay.delayTime': { min: 0.06, max: 0.12 }, // a short echo (sketch: a slapback)
    'delay.feedback': { min: 0.5, max: 0.7 }, // with high feedback: a rattle
    delaySend: { min: 0.2, max: 0.4, lit: 1 }, // on every probe
    reverbSend: { min: 0.1, max: 0.6, lit: 0 }, // dry of wash
  },

  // Undertow: everything slides, and water moves over the whole sound. Naming the Vibrato's rows lights it in every world.
  undertow: {
    'robot.portamento': { min: 0.15, max: 0.35, lit: 1 }, // every probe glides over a long slide (sketch: 0.15 to 0.35 s)
    'robot.lfoBusDepth': { min: 5, max: 25, lit: 0.6 }, // on many the probe filter wobbles gently
    'robot.attack': { min: 0.2, max: 0.6 }, // notes arrive slowly
    'robot.rests': { min: 0, max: 5 }, // run into each other with no rests
    'robot.release': { min: 1, max: 2 }, // and release long
    'robot.waveform': { weights: { sine: 0, square: 0, triangle: 1, sawtooth: 1, pulse: 0 } }, // the saw and the triangle
    doubleSend: { min: 0.4, max: 0.7, lit: 0.85 }, // most probes sent to the Double room: water over the sound
    'chorus.depth': { min: 0.1, max: 0.25 }, // shallow: a wobble, not voices (sketch: shallow)
    'chorus.rate': { min: 1.5, max: 3 }, // quick-ish: water moving
    'chorus.delayTime': { min: 2, max: 5 }, // short: a smear, not a second voice (sketch: short)
    'vibrato.wet': { min: 0.95, max: 1 }, // a vibrato rides the whole world
    'vibrato.depth': { min: 0.02, max: 0.06 }, // shallow: never quite still, never seasick
    'vibrato.rate': { min: 0.5, max: 2 }, // slow
    'lfoLink.lpf.frequency': { min: 10, max: 40, lit: 1 }, // the master filter tied to the world's slow oscillator
    'delay.feedback': { min: 0.3, max: 0.5 }, // moderate: each note ripples a few times
    delaySend: { min: 0.15, max: 0.35, lit: 0.9 }, // most probes sent into it
  },

  // Trench: the deep.
  trench: {
    'filterLPF.frequency': { min: 400, max: 1000 }, // the master filter shut well down: the top is gone
    'eq3.high': { min: -9, max: -5 }, // the high band cut
    'eq3.low': { min: 2, max: 5 }, // the low band lifted: felt as much as heard
    bpm: { min: 25, max: 45 }, // the pulse is a crawl
    'reverb.decay': { min: 6, max: 10 }, // the room is a cavern: a long tail
    'reverb.preDelay': { min: 0.1, max: 0.2 }, // its walls are far: a late first reflection
    reverbSend: { min: 0.5, max: 0.8, lit: 1 }, // every probe sunk deep in it
    'robot.rhythmicDensity': { min: 0, max: 30 }, // a probe speaks seldom
    'robot.rests': { min: 50, max: 85 }, // and leaves long gaps between calls
    'robot.portamento': { min: 0.15, max: 0.4, lit: 0.75 }, // most probes slur between notes, like a sonar sweep
    'robot.release': { min: 1, max: 2 }, // its notes fade long
    'robot.waveform': { weights: { sine: 1, square: 0, triangle: 1, sawtooth: 0, pulse: 0 } }, // round, with no edges
    'robot.octaveRegister': { weights: { bass: 1, low: 1, mid: 0, high: 0, treble: 0 } }, // set low in the register
  },

  // Tidepool: a small bright pool at low tide.
  tidepool: {
    'reverb.decay': { min: 0.2, max: 0.6 }, // a tiny room: a short tail
    'reverb.preDelay': { min: 0, max: 0.01 }, // no distance to the walls
    reverbSend: { min: 0.1, max: 0.6, lit: 0 }, // no wash
    delaySend: { min: 0, max: 0.3, lit: 0 }, // no echo
    'filterLPF.frequency': { min: 14000, max: 20000 }, // wide open: everything clear
    'eq3.high': { min: 2, max: 5 }, // the high band lifted
    bpm: { min: 90, max: 120 }, // a light, quick-ish pulse
    'robot.attack': { min: 0.015, max: 0.02 }, // a droplet strikes
    'robot.decay': { min: 0.02, max: 0.15 }, // settles at once
    'robot.sustain': { min: 0, max: 0.1 }, // holds almost nothing
    'robot.release': { min: 0.02, max: 0.15 }, // and is gone
    'robot.shapedAttack': { min: 0.015, max: 0.05, lit: 0.155 }, // a curved start kept as short as a plain one
    'robot.shapedRelease': { min: 0.03, max: 0.15, lit: 0.15 }, // the same for its tail
    'robot.waveform': { weights: { sine: 2, square: 0, triangle: 1, sawtooth: 0, pulse: 0 } }, // round, thin voices
    'robot.layerGain': { min: 0.2, max: 1.2, lit: 0 }, // one voice each, partners quiet
    'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0 }, // no probe is resonant
    'robot.rhythmicDensity': { min: 35, max: 65 }, // a middling rate: the pool ticks
  },

  // Floe: pack ice, slow and glassy.
  floe: {
    shimmerSend: { min: 0.4, max: 0.7, lit: 0.85 }, // most probes sent to the Shimmer room: a sheen on nearly every note
    'frequencyShifter.shift': { min: 2, max: 5 }, // the shift small, so it beats rather than clashes
    'robot.waveform': { weights: { sine: 3, square: 0, triangle: 1, sawtooth: 0, pulse: 0 } }, // the voices are pure
    'robot.attack': { min: 0.5, max: 1.5 }, // notes arrive slowly
    'robot.sustain': { min: 0.6, max: 1 }, // hold
    'robot.release': { min: 1.2, max: 2 }, // and ring long
    'robot.shapedAttack': { min: 0.5, max: 1.5, lit: 0.155 }, // a curved probe arrives as slowly
    'robot.shapedRelease': { min: 1.2, max: 2, lit: 0.15 }, // and rings as long
    bpm: { min: 30, max: 55 }, // slow and still
    'robot.rhythmicDensity': { min: 0, max: 35 }, // probes speak seldom
    'eq3.high': { min: 2, max: 5 }, // the high band lifted
    'filterHPF.frequency': { min: 200, max: 400 }, // the low floor removed: nothing underneath
    'reverb.decay': { min: 4, max: 7 }, // a large room with a long tail
    reverbSend: { min: 0.4, max: 0.7, lit: 1 }, // every probe in it
  },

  // Thicket: a kelp forest, thick and swaying.
  thicket: {
    doubleSend: { min: 0.4, max: 0.7, lit: 0.85 }, // most probes sent to the Double room
    'chorus.depth': { min: 0.7, max: 0.95 }, // a deep chorus: two or three of itself
    'chorus.rate': { min: 0.1, max: 0.4 }, // slow: swaying
    'chorus.delayTime': { min: 12, max: 20 }, // long enough to read as voices, not a smear
    'robot.layerGain': { min: 0.8, max: 1.2, lit: 1 }, // partner layers full and on
    'robot.waveform': { weights: { sine: 0, square: 1, triangle: 2, sawtooth: 0, pulse: 0 } }, // the mellow and the square
    'robot.filterFreq': { min: 800, max: 2500 }, // under a probe filter brought down
    'eq3.mid': { min: 2, max: 5 }, // the mid band lifted
    'filterLPF.frequency': { min: 3000, max: 7000 }, // the master filter part-closed: nothing bright
    bpm: { min: 50, max: 80 }, // unhurried
    'robot.rhythmicDensity': { min: 30, max: 60 }, // a middling rate
    'robot.sustain': { min: 0.6, max: 0.9 }, // notes hold
    'robot.release': { min: 0.8, max: 1.6 }, // and are let go slowly
    reverbSend: { min: 0.2, max: 0.4, lit: 1 }, // moderately in the wash
  },

  // Wreck: a rusted hulk. Naming the drive's and the crush's rows lights both in every world; the fold is the coin's.
  wreck: {
    gritSend: { min: 0.4, max: 0.7, lit: 0.8 }, // most probes sent to the Grit room: a grain on the notes
    'distortion.amount': { min: 0.4, max: 0.7 }, // the drive is high
    'bitCrusher.bits': { min: 4, max: 7 }, // the bit depth low: whatever nodes are lit bite hard
    'delay.delayTime': { min: 0.6, max: 1.2 }, // the echo is long
    'delay.feedback': { min: 0.6, max: 0.8 }, // and will not die
    delaySend: { min: 0.3, max: 0.5, lit: 1 }, // every probe sent into it
    'eq3.high': { min: -8, max: -4 }, // dark: the high band cut
    'filterLPF.frequency': { min: 1500, max: 4000 }, // the master filter down
    bpm: { min: 40, max: 65 }, // slow
    'robot.rhythmicMotifLength': { offShare: 0, min: 6, max: 8 }, // a long fixed figure, always on
    'robot.pitchRepeat': { min: 60, max: 100 }, // the same notes returning
    'robot.waveform': { weights: { sine: 0, square: 1, triangle: 0, sawtooth: 1, pulse: 1 } }, // hard-edged voices
    'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0.5 }, // more probes than usual on a resonant filter: some creak
  },

  // Open Water: the pelagic, a vast space with nothing near.
  openWater: {
    'reverb.decay': { min: 7, max: 10 }, // the reverb at its longest
    'reverb.preDelay': { min: 0.12, max: 0.25 }, // its first reflection late
    'delay.delayTime': { min: 0.8, max: 1.5 }, // the delay long: every call comes back late
    reverbSend: { min: 0.5, max: 0.8, lit: 1 }, // every probe deep in the reverb
    delaySend: { min: 0.3, max: 0.5, lit: 1 }, // and in the delay
    'robot.rhythmicDensity': { min: 0, max: 30 }, // probes speak seldom
    'robot.rests': { min: 50, max: 90 }, // and leave long gaps: the silence is the room
    'robot.masterVolume': { min: 0.45, max: 0.65 }, // each quieter than usual, as a far thing is
    'robot.release': { min: 1, max: 2 }, // its notes fade long
    'stereoWidener.width': { min: 0.75, max: 0.95 }, // wide across the field
    'filterLPF.frequency': { min: 3000, max: 7000 }, // partly closed: distance dulls
    bpm: { min: 45, max: 75 }, // slow to middling
  },

  // Vent Field: hydrothermal vents, hot and bubbling. Naming the Auto-Wah's rows lights it in every world.
  ventField: {
    'robot.accentFilterFreq': { min: 250, max: 900, lit: 0.9 }, // nearly every probe on the resonant filter, set low
    'robot.accentFilterQ': { min: 8, max: 14 }, // with a sharp peak
    'robot.lfoBusDepth': { min: 20, max: 60, lit: 0.8 }, // the filter sweeps on most of them
    'robot.waveform': { weights: { sine: 0, square: 1, triangle: 0, sawtooth: 1, pulse: 1 } }, // hard-edged voices
    'robot.rhythmicDensity': { min: 60, max: 90 }, // probes speak often
    'robot.attack': { min: 0.015, max: 0.03 }, // short notes
    'robot.decay': { min: 0.05, max: 0.25 }, // that settle fast
    'robot.sustain': { min: 0, max: 0.3 }, // and hold little
    'robot.noteVariance': { offShare: 0, min: 5, max: 8 }, // a pitch that ranges wide
    'eq3.low': { min: 2, max: 5 }, // the low band lifted
    'eq3.mid': { min: 1, max: 4 }, // and the mid
    'filterLPF.frequency': { min: 3000, max: 8000 }, // the top part-closed
    bpm: { min: 90, max: 125 }, // middling to fast
    'autoWah.wet': { min: 0.45, max: 0.6 }, // the whole world's filter chews on the loud notes too
    'autoWah.baseFrequency': { min: 50, max: 120 }, // set low: the squelch starts in the mud
    'autoWah.Q': { min: 5, max: 9 }, // sharp: it whistles as it opens
  },

  // Beacon: the lighthouse, one phrase round and round.
  beacon: {
    'robot.rhythmicMotifLength': { offShare: 0, min: 6, max: 8 }, // a long figure that is always on
    'robot.noteVariance': { offShare: 0, min: 1, max: 2 }, // keeps its pitch close, never off
    'robot.pitchRepeat': { min: 70, max: 100 }, // returns to the same notes
    'robot.dynamics': { min: 0, max: 15 }, // plays flat
    'robot.accents': { min: 0, max: 0 }, // with no marks; few gaps is Classic's own rests band since R3 (was 0-10 here)
    delaySend: { min: 0.4, max: 0.6, lit: 1 }, // every probe sent into the delay
    'delay.feedback': { min: 0.6, max: 0.8 }, // with high feedback: answered by its own repeats
    'delay.delayTime': { min: 0.4, max: 0.8 }, // whose echo falls well behind the phrase
    reverbSend: { min: 0.05, max: 0.15, lit: 1 }, // little wash
    bpm: { min: 50, max: 80 }, // slow to middling
    'robot.rhythmicDensity': { min: 20, max: 45 }, // a middling-low rate
    humanize: { min: 0, max: 0 }, // no timing scatter: the phrase comes round exactly
  },

  // Polar Low (first named Squall, then Abyss): a storm. Naming the Tremolo's rows lights it in every world.
  polarLow: {
    'robot.dynamics': { min: 75, max: 100 }, // wide dynamics: surges and drops (accents and rests are Classic's: R6)
    'compressor.threshold': { min: -45, max: -35 }, // the master compressor clamps hard: the whole world pumps
    'compressor.ratio': { min: 10, max: 20 }, // clamps hard
    bpm: { min: 120, max: 160 }, // the pulse is fast
    'robot.rhythmicDensity': { min: 70, max: 100 }, // probes speak often
    'robot.noteVariance': { offShare: 0, min: 5, max: 8 }, // a wide-ranging pitch
    'robot.attack': { min: 0.015, max: 0.02 }, // short hard notes
    'robot.release': { min: 0.02, max: 0.2 }, // short
    gritSend: { min: 0.5, max: 0.8, lit: 0.6 }, // many sent to the Grit room: the loud ones tear
    'robot.masterVolume': { min: 0.8, max: 0.95 }, // loud
    'eq3.low': { min: 2, max: 5 }, // the low band lifted
    'stereoWidener.width': { min: 0.75, max: 0.95 }, // the field wide
    'tremolo.wet': { min: 0.45, max: 0.6 }, // the whole world throbs under the gusts
    'tremolo.depth': { min: 0.7, max: 0.95 }, // deep: a throb, not a shimmer
    'tremolo.rate': { min: 0.5, max: 2.5 }, // slow to middling: weather, not a buzz
  },
};
