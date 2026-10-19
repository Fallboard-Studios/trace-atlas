// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import { getAttenuationStyleNoiseMap } from './noiseMaps';
import { getSeededVal, getUniformSeededVal } from './getSeededVal';
import { quantizeToStep } from './math';
import { pickLane } from './lfoLaneDraw';
import { pickShape, LFO_SHAPE_SEED_ORDER } from './lfoShapeDraw';
import { generateAttenuationStyleBpm } from './bpmSeed';
import { pickSeedNoteValue } from './tempoSync';
import { stepsValueToT, stepsTToValue } from '@/components/ui/controls/sliderLogMath';
import { SWELL_FREQUENCY_STEPS, SWELL_DURATION_SCHEMA, HUMANIZE_SCHEMA } from '@/data/audioRigConfig';

import type { NoteValue } from '@/data/noteValues';
import type { GlobalAudioSettings } from '@/types/globalAudio';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { GLOBAL_AUDIO_LOADING_RANGES } from '@/data/globalAudioLoadingRanges';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey, type SeedRange } from '@/data/globalAudioSeedRanges';
import {
  GLOBAL_LFO_TARGET_IDS,
  LFO_LANE_IDS,
  LFO_RATE_MIN,
  LFO_DEPTH_MIN,
  type GlobalLfoTargetId,
  type LfoShape,
  type LfoLaneId,
  type LfoLink,
  type BankLfoSettings,
} from '@/types/lfo';

// ========================================
// FUNCTIONS
// ========================================

/**
 * Map a seeded [0, 1] draw to a field's real range, honoring its scale.
 * Linear fields interpolate arithmetically; log fields interpolate
 * geometrically (min * (max/min)^t), matching how the rest of the UI
 * already treats logarithmic sliders (see GLOBAL_CHAIN_GRID.md). `t` is
 * clamped rather than extrapolated in case of floating-point overshoot.
 */
export function scaleUnitValue(t: number, range: SeedRange): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (range.scale === 'log') {
    return range.min * Math.pow(range.max / range.min, clamped);
  }
  return range.min + (range.max - range.min) * clamped;
}

/**
 * `uniform` draws the position with getUniformSeededVal instead of one getSeededVal sample. One sample at offset 0 is
 * bell-curved and takes only a few dozen to a few hundred distinct values across all worlds (three, for some keys), so a
 * field that must FILL its band uses the uniform draw (Global Modulation T7: autoWah.gain and autoWah.wet took 3 distinct
 * values over 3 000 styles, phaser.wet 24). Every pre-existing field keeps the plain draw, so no existing value moves.
 */
function sampleField(noiseMap: NoiseFunction2D, key: GlobalAudioSeedFieldKey, uniform = false): number {
  // Sample within the narrower LOADING range (initial-seed sub-window), but
  // honor the full range's log/linear scale — GLOBAL_AUDIO_LOADING_RANGES
  // doesn't carry its own `scale`, it's purely a narrower min/max over the
  // same field GLOBAL_AUDIO_SEED_RANGES already describes.
  const range: SeedRange = { ...GLOBAL_AUDIO_LOADING_RANGES[key], scale: GLOBAL_AUDIO_SEED_RANGES[key].scale };
  // getSeededVal handles the seeded noise → [0, 1] draw; scaleUnitValue owns
  // range + log/linear mapping, so the two concerns stay separately testable.
  const t = uniform ? getUniformSeededVal(noiseMap, `globalAudio.${key}`) : getSeededVal(noiseMap, `globalAudio.${key}`, 0, 0, 1);
  const value = scaleUnitValue(t, range);
  const { step } = GLOBAL_AUDIO_SEED_RANGES[key];
  // Quantized against the FULL range's own min, never the narrower loading
  // range's min — the grid a field's slider actually exposes is anchored to
  // its full min, so quantizing against the loading min would land values on
  // a different, incompatible grid.
  return step === undefined ? value : quantizeToStep(value, GLOBAL_AUDIO_SEED_RANGES[key].min, step);
}

/**
 * Probability threshold Delay's own "Sync" seed draw ([0, 1]) must fall under to seed Anchored
 * rather than Float — 66% target (docs/specs/FREE_SYNC_TOGGLE.md §1.7). A separate pair of
 * keys from the quiet roll above, so the two never correlate and Delay's existing draws are
 * untouched. The note itself is then picked from the Delay loading band only. Measured raw share
 * at 0.66 over 3000 Attenuation Styles (2026-10-03): 66.4% — no calibration needed.
 */
const DELAY_SYNC_ODDS = 0.66;

/**
 * The colour character a fresh world draws (docs/specs/GLOBAL_COLOUR.md §1.2): which of Distortion, Chebyshev and
 * BitCrusher it lights. One draw decides it, not three independent rolls, because independent rolls light two or three
 * nodes in a share of worlds. AT MOST ONE node is on in any world (Crawford, Global Colour T14, 2026-10-15): the spec
 * first drew three pair characters too (about 15 % of worlds), and they were dropped, their share going to the singles.
 * By hand any node goes to full.
 */
export const COLOUR_CHARACTERS = ['clean', 'drive', 'fold', 'crush'] as const;
export type ColourCharacter = (typeof COLOUR_CHARACTERS)[number];
export type ColourNode = 'distortion' | 'chebyshev' | 'bitCrusher';

/** The nodes each character lights; every node outside the list seeds `wet` 0. */
export const COLOUR_CHARACTER_NODES: Record<ColourCharacter, readonly ColourNode[]> = {
  clean: [],
  drive: ['distortion'],
  fold: ['chebyshev'],
  crush: ['bitCrusher'],
};

/**
 * Cumulative upper edges on the character draw, one per COLOUR_CHARACTERS entry in order; a draw `t` belongs to the
 * first band whose edge is above it. SET BY MEASUREMENT, not by fraction. Two properties of the draw rule out
 * nominal edges: it is bell-curved (the nominal 0.25 / 0.45 / 0.65 / 0.85 / 0.90 / 0.95 realised 10 / 34 / 18 / 30 /
 * 4 / 4 / 0 % over 20 000 styles), and it is DISCRETE - one simplex sample at a fixed (x, 0) takes only ~190
 * distinct values, the largest holding ~1 % of styles - so an edge parked on a quantile can land either side of an
 * atom and move a share by half a point. Each edge is therefore the midpoint of the gap between two atoms whose
 * cumulative share is nearest the target (gaps are at least 0.0004 wide, so four decimals stay inside them).
 * Realised over those 20 000 styles ('ColourCalibration<n>'): clean 25.2, drive 24.9, fold 25.2, crush 24.7 %
 * (targets 25 / 25 / 25 / 25; the cumulative targets 25 / 50 / 75 fall in gaps 0.00056, 0.00673 and 0.00056 wide). The test in
 * globalAudioSeed.test.ts holds them to within 3 points on a different set ('ColourShare<n>', 3 000 styles); that set
 * measured 24.8 / 25.5 / 25.6 / 24.0 % with no world lighting two nodes. If the targets move (Crawford's listen, roadmap 50.3 T14),
 * refit the same way.
 */
export const COLOUR_CHARACTER_BANDS: readonly number[] = [0.3065, 0.5, 0.6935, 1];

/** The character a seeded draw `t` in [0, 1] picks. Out-of-range draws clamp to the ends and a non-finite one is clean. */
export function pickColourCharacter(t: number): ColourCharacter {
  if (!Number.isFinite(t)) return 'clean';
  const band = COLOUR_CHARACTER_BANDS.findIndex((edge) => t < edge);
  return COLOUR_CHARACTERS[band === -1 ? COLOUR_CHARACTERS.length - 1 : band];
}

/**
 * The edges of the two pedals' lit rolls (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.2): a pedal is lit when its roll falls
 * under its edge, so each lights in about a third of fresh worlds. The rolls are UNIFORM draws (getUniformSeededVal), so a
 * nominal edge is the realised share and nothing here needed fitting. They are separate keys, so the two pedals are
 * independent of each other and of the Colour character draw.
 *
 * Measured over 20 000 styles ('PedalCalibration<n>'): AutoWah lit 33.07 %, Phaser lit 33.30 %, both lit 11.22 % (product
 * 11.01 %); each pedal lit alongside a lit Colour 24.95 % / 25.09 % against products of 24.95 % / 25.12 %. The tests
 * hold the shares to within 3 points on a different set ('PedalShare<n>', 3 000 styles). The plain single draw
 * (getSeededVal at offset 0) was measured first and rejected: autoWah.lit took 24 distinct values across 20 000 styles,
 * and a lit wah landed in 55.9 % of worlds with a clean Colour against 26.8 % of coloured ones. If the targets move
 * (Crawford's listen, roadmap 50.4 T16), change the edge and re-measure the same way.
 */
export const PEDAL_LIT_EDGE: Record<'autoWah' | 'phaser' | MotionPedal, number> = {
  autoWah: 1 / 3,
  phaser: 1 / 3,
  // Global Pedals (docs/specs/GLOBAL_PEDALS.md assumption 7): nominal edges, rolled after the two above in chain order
  // and capped by MAX_LIT_PEDALS, so each realises less than its edge (see MAX_LIT_PEDALS for the measured shares).
  chorus: 0.25,
  tremolo: 0.25,
  vibrato: 0.25,
  frequencyShifter: 0.15,
};

/** The Global Pedals' four motion pedals in chain order (docs/specs/GLOBAL_PEDALS.md §1.2), the order they roll in. */
export const MOTION_PEDALS = ['chorus', 'tremolo', 'vibrato', 'frequencyShifter'] as const;
export type MotionPedal = (typeof MOTION_PEDALS)[number];
/** The three motion pedals whose rate is a Free | Sync field. */
const LFO_PEDALS = ['chorus', 'tremolo', 'vibrato'] as const;

/**
 * The most Modulation pedals a fresh world lights, counting the AutoWah and the Phaser (docs/specs/GLOBAL_PEDALS.md
 * assumption 7). A SEQUENTIAL cap: the AutoWah and Phaser roll first and untouched, then each motion pedal in chain order
 * rolls its own uniform draw and is forced dark if two are already lit. Every roll key is read on every style, so the
 * draw set never depends on the outcome. The rolls are uniform and independent, so the realised shares follow from the
 * edges exactly - the 50.4 pedals leave 0 / 1 / 2 lit in 4/9 / 4/9 / 1/9 of worlds - giving Chorus 22.2 %, Tremolo
 * 19.4 %, Vibrato 16.7 % and the shifter 8.4 %. Measured over 20 000 styles ('PedalsCalibration<n>', 2026-10-18): Chorus
 * 22.68 %, Tremolo 19.33 %, Vibrato 16.75 %, shifter 8.20 %, two pedals lit in 49.38 % of worlds and never more. The
 * test holds a different set ('PedalsShare<n>', 3 000 styles) to within 3 points of those. A theme that wants more lit
 * moves the edges or this cap. By hand any number of pedals can be lit.
 */
export const MAX_LIT_PEDALS = 2;

/**
 * The share of LIT LFO pedals (Phaser, Chorus, Tremolo, Vibrato) that seed Sync rather than Free: each one's sync roll
 * falls under this (docs/specs/GLOBAL_PEDALS.md assumption 8). A dark pedal never seeds Sync. Measured 49.82 / 50.88 /
 * 49.73 % of lit Chorus / Tremolo / Vibrato worlds over the 20 000 calibration styles.
 */
export const PEDAL_SYNC_ODDS = 0.5;

/**
 * The Phaser's name for PEDAL_SYNC_ODDS (Global Modulation, spec assumption 8). Measured 50.20 % of 6 660 lit Phasers
 * over 20 000 styles; the roll is uniform.
 */
export const PHASER_SYNC_ODDS = PEDAL_SYNC_ODDS;

/**
 * Generate deterministic GlobalAudioSettings for an Attenuation Style, sampled from the
 * Attenuation Style noise map — a new direct sample; previously that map was only
 * used to derive locale maps (see PROCEDURAL_GENERATION.md).
 *
 * `type`/`compressorBeforeDelay` are NOT seeded — carried over from
 * DEFAULT_GLOBAL_AUDIO_SETTINGS unchanged. Neither are the two rooms' `wet`
 * fields: they are the Reverb and Delay RETURN levels now, a fixed full 1 taken
 * from the defaults, because how much echo each robot throws is its own seeded
 * send (spawnSystem.ts generateRobotSends, docs/specs/ROBOT_SENDS.md §1.2) —
 * including the ~quarter of robots that start with no delay, which used to be
 * one global "quiet Delay" roll here. Neither wet field, nor that roll, draws
 * from the noise map, so no other field's draw moved. Everything else always
 * seeds a real, audible value. Off states are expressed purely through the
 * params themselves (the old per-effect `enabled` boolean and `globalBypass`
 * are gone).
 *
 * The three colour blocks are the exception to "a real, audible value": one
 * character draw (COLOUR_CHARACTERS) lights none or exactly one of the nodes and
 * the rest seed `wet` 0, so a fresh world is clean or a little coloured in one way.
 *
 * The two modulation pedals are the same kind of exception, each on its own roll (PEDAL_LIT_EDGE): about a third of
 * worlds light each, independently. A dark pedal seeds `wet` 0 and still draws every other field from its band; a lit
 * Phaser seeds Sync in about half of worlds (PHASER_SYNC_ODDS), with the note drawn from the lit rate band.
 *
 * The four Global Pedals motion pedals roll after them in chain order under a two-lit cap (MAX_LIT_PEDALS), each with
 * the same dark-pedal rule; a lit Chorus, Tremolo or Vibrato seeds Sync about half the time, the shifter's sign is its own
 * draw, and Width always seeds from its band (docs/specs/GLOBAL_PEDALS.md §1.2).
 */
export function generateGlobalAudioSettings(attenuationStyleId: string, attenuationStyleName: string): GlobalAudioSettings {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const defaults = DEFAULT_GLOBAL_AUDIO_SETTINGS;
  // The tempo the Delay and the Phaser snap their Sync notes to. Drawn lazily and once: a style with neither anchored
  // never draws it, exactly as before.
  let styleBpm: number | undefined;
  const bpm = (): number => (styleBpm ??= generateAttenuationStyleBpm(attenuationStyleId, attenuationStyleName));
  const delaySyncModeT = getSeededVal(noiseMap, 'globalAudio.delay.syncMode', 0, 0, 1);
  const delaySyncNoteT = getSeededVal(noiseMap, 'globalAudio.delay.syncNote', 0, 0, 1);
  const delaySync =
    delaySyncModeT < DELAY_SYNC_ODDS
      ? pickSeedNoteValue(delaySyncNoteT, bpm(), [GLOBAL_AUDIO_LOADING_RANGES['delay.delayTime']], 'seconds')
      : undefined;

  // Colour: the character draw says which nodes are lit. All seven colour keys are read on every style, lit or not,
  // so the draw set never depends on the character; an unlit node still seeds its shape value (a hand nudge of Mix
  // then hears something at once) and just has its `wet` forced to 0.
  const lit = COLOUR_CHARACTER_NODES[pickColourCharacter(getSeededVal(noiseMap, 'globalAudio.colour.character', 0, 0, 1))];
  const distortionWet = sampleField(noiseMap, 'distortion.wet');
  const chebyshevWet = sampleField(noiseMap, 'chebyshev.wet');
  const bitCrusherWet = sampleField(noiseMap, 'bitCrusher.wet');

  // Modulation: four roll draws, then the thirteen value draws, ALL read on every style, lit or dark, so the draw set
  // never depends on the outcome. Every one is a uniform draw (see PEDAL_LIT_EDGE and sampleField for why).
  const autoWahLit = getUniformSeededVal(noiseMap, 'globalAudio.autoWah.lit') < PEDAL_LIT_EDGE.autoWah;
  const phaserLit = getUniformSeededVal(noiseMap, 'globalAudio.phaser.lit') < PEDAL_LIT_EDGE.phaser;
  const phaserSyncModeT = getUniformSeededVal(noiseMap, 'globalAudio.phaser.syncMode');
  const phaserSyncNoteT = getUniformSeededVal(noiseMap, 'globalAudio.phaser.syncNote');
  const autoWahWet = sampleField(noiseMap, 'autoWah.wet', true);
  const phaserWet = sampleField(noiseMap, 'phaser.wet', true);
  // A dark Phaser is Free (no `sync` key), like a Free lane; an empty band leaves a lit one Free too.
  const phaserSync =
    phaserLit && phaserSyncModeT < PHASER_SYNC_ODDS
      ? pickSeedNoteValue(phaserSyncNoteT, bpm(), [GLOBAL_AUDIO_LOADING_RANGES['phaser.rate']], 'hz')
      : undefined;

  // Global Pedals (docs/specs/GLOBAL_PEDALS.md §1.2): the sequential cap. Each motion pedal's roll is read whether or not
  // the cap would allow it, so the draw set is total; the AutoWah and Phaser results above count towards the cap.
  let litCount = Number(autoWahLit) + Number(phaserLit);
  const pedalLit = {} as Record<MotionPedal, boolean>;
  for (const pedal of MOTION_PEDALS) {
    const wants = getUniformSeededVal(noiseMap, `globalAudio.${pedal}.lit`) < PEDAL_LIT_EDGE[pedal];
    pedalLit[pedal] = wants && litCount < MAX_LIT_PEDALS;
    if (pedalLit[pedal]) litCount += 1;
  }
  // A sync pair per LFO pedal, read on every style; Sync only when lit and under the odds, the note from the lit band.
  const pedalSync = {} as Record<(typeof LFO_PEDALS)[number], NoteValue | undefined>;
  for (const pedal of LFO_PEDALS) {
    const modeT = getUniformSeededVal(noiseMap, `globalAudio.${pedal}.syncMode`);
    const noteT = getUniformSeededVal(noiseMap, `globalAudio.${pedal}.syncNote`);
    pedalSync[pedal] =
      pedalLit[pedal] && modeT < PEDAL_SYNC_ODDS
        ? pickSeedNoteValue(noteT, bpm(), [GLOBAL_AUDIO_LOADING_RANGES[`${pedal}.rate`]], 'hz')
        : undefined;
  }
  // The shift is a magnitude band with its own sign draw, so a seeded shift is never inside ±2 Hz.
  const shiftSign = getUniformSeededVal(noiseMap, 'globalAudio.frequencyShifter.sign') < 0.5 ? -1 : 1;
  const pedalWet = (pedal: MotionPedal): number => {
    const wet = sampleField(noiseMap, `${pedal}.wet`, true);
    return pedalLit[pedal] ? wet : 0;
  };
  const withSync = <T extends object>(block: T, sync: NoteValue | undefined): T =>
    sync === undefined ? block : { ...block, sync };

  return {
    compressorBeforeDelay: defaults.compressorBeforeDelay,
    compressor: {
      threshold: sampleField(noiseMap, 'compressor.threshold'),
      ratio: sampleField(noiseMap, 'compressor.ratio'),
      attack: sampleField(noiseMap, 'compressor.attack'),
      release: sampleField(noiseMap, 'compressor.release'),
      knee: sampleField(noiseMap, 'compressor.knee'),
    },
    eq3: {
      low: sampleField(noiseMap, 'eq3.low'),
      mid: sampleField(noiseMap, 'eq3.mid'),
      high: sampleField(noiseMap, 'eq3.high'),
    },
    filterLPF: {
      type: 'lowpass',
      frequency: sampleField(noiseMap, 'filterLPF.frequency'),
      Q: sampleField(noiseMap, 'filterLPF.Q'),
    },
    filterHPF: {
      type: 'highpass',
      frequency: sampleField(noiseMap, 'filterHPF.frequency'),
      Q: sampleField(noiseMap, 'filterHPF.Q'),
    },
    delay: {
      delayTime: sampleField(noiseMap, 'delay.delayTime'),
      feedback: sampleField(noiseMap, 'delay.feedback'),
      // The room's return level: fixed, not sampled (see this function's doc comment).
      wet: defaults.delay.wet,
      // Free (the other ~third, or an empty band) carries no `sync` key at all — never `sync: undefined`.
      ...(delaySync !== undefined && { sync: delaySync }),
    },
    reverb: {
      decay: sampleField(noiseMap, 'reverb.decay'),
      preDelay: sampleField(noiseMap, 'reverb.preDelay'),
      wet: defaults.reverb.wet,
    },
    distortion: {
      amount: sampleField(noiseMap, 'distortion.amount'),
      wet: lit.includes('distortion') ? distortionWet : 0,
    },
    chebyshev: {
      order: sampleField(noiseMap, 'chebyshev.order'),
      wet: lit.includes('chebyshev') ? chebyshevWet : 0,
    },
    bitCrusher: {
      bits: sampleField(noiseMap, 'bitCrusher.bits'),
      wet: lit.includes('bitCrusher') ? bitCrusherWet : 0,
    },
    autoWah: {
      baseFrequency: sampleField(noiseMap, 'autoWah.baseFrequency', true),
      octaves: sampleField(noiseMap, 'autoWah.octaves', true),
      sensitivity: sampleField(noiseMap, 'autoWah.sensitivity', true),
      Q: sampleField(noiseMap, 'autoWah.Q', true),
      gain: sampleField(noiseMap, 'autoWah.gain', true),
      follower: sampleField(noiseMap, 'autoWah.follower', true),
      wet: autoWahLit ? autoWahWet : 0,
    },
    phaser: {
      rate: sampleField(noiseMap, 'phaser.rate', true),
      octaves: sampleField(noiseMap, 'phaser.octaves', true),
      baseFrequency: sampleField(noiseMap, 'phaser.baseFrequency', true),
      stages: sampleField(noiseMap, 'phaser.stages', true),
      Q: sampleField(noiseMap, 'phaser.Q', true),
      wet: phaserLit ? phaserWet : 0,
      ...(phaserSync !== undefined && { sync: phaserSync }),
    },
    // Global Pedals: every value a uniform draw from its band, lit or dark; a dark pedal has Mix 0 and no sync key.
    chorus: withSync(
      {
        rate: sampleField(noiseMap, 'chorus.rate', true),
        delayTime: sampleField(noiseMap, 'chorus.delayTime', true),
        depth: sampleField(noiseMap, 'chorus.depth', true),
        spread: sampleField(noiseMap, 'chorus.spread', true),
        feedback: sampleField(noiseMap, 'chorus.feedback', true),
        wet: pedalWet('chorus'),
      },
      pedalSync.chorus,
    ),
    tremolo: withSync(
      {
        rate: sampleField(noiseMap, 'tremolo.rate', true),
        depth: sampleField(noiseMap, 'tremolo.depth', true),
        spread: sampleField(noiseMap, 'tremolo.spread', true),
        wet: pedalWet('tremolo'),
      },
      pedalSync.tremolo,
    ),
    vibrato: withSync(
      {
        rate: sampleField(noiseMap, 'vibrato.rate', true),
        depth: sampleField(noiseMap, 'vibrato.depth', true),
        wet: pedalWet('vibrato'),
      },
      pedalSync.vibrato,
    ),
    frequencyShifter: {
      shift: shiftSign * sampleField(noiseMap, 'frequencyShifter.shift', true),
      wet: pedalWet('frequencyShifter'),
    },
    // Width has no dark state: always a value from its band, never near the mono fold.
    stereoWidener: { width: sampleField(noiseMap, 'stereoWidener.width', true) },
    limiter: {
      threshold: sampleField(noiseMap, 'limiter.threshold'),
    },
  };
}

/**
 * Probability threshold a target's own "start quiet" seed draw ([0, 1]) must
 * clear to force rate to 0 — ~34% chance per target (not a flat 50/50), so a
 * typical Attenuation Style seeds roughly 5 already-oscillating LFOs out of 7.
 * Replaces the old separate `active` boolean — see LFO_RATE_MIN's own doc
 * comment (src/types/lfo.ts) for why rate=0 is now the "off" state.
 */
const LFO_QUIET_THRESHOLD = 0.34;

/**
 * Ping Variance Automation's own seeded-default range — [10%, 60%] as a
 * fraction — same "bounded/legible default, freely draggable afterward"
 * convention every other seeded Rig field follows (e.g. DELAY_SYNC_ODDS
 * above). Narrowed from [33%, 66%] once Intensity's on/off role moved to the
 * new Frequency field (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2).
 */
const PING_VARIANCE_AUTOMATION_SEED_RANGE = { min: 0.10, max: 0.60 };

/**
 * Seeded starting value for audioStore's pingVarianceAutomation, [0.10, 0.60]
 * as a fraction. Sampled once per session, not once per Attenuation Style
 * switch — audioStore.ts's regenerateGlobalAudioFromSeed is responsible for
 * only calling this on the very first seed and carrying the value forward on
 * every later call (docs/specs/PING-VARIANCE-AUTOMATION.md §1.2); this
 * function itself is a plain, stateless seeded draw, same shape as every
 * other function in this file.
 */
export function generatePingVarianceAutomation(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getSeededVal(
    noiseMap, 'globalAudio.pingVarianceAutomation', 0,
    PING_VARIANCE_AUTOMATION_SEED_RANGE.min, PING_VARIANCE_AUTOMATION_SEED_RANGE.max
  );
  // Quantized in percent-space, not against the stored fraction directly —
  // quantizing the fraction itself would round to hundredths of a fraction
  // (a much finer grid than a whole percent), silently reintroducing a
  // subtler version of the off-grid bug this quantization pass exists to fix.
  return quantizeToStep(raw * 100, 0, 1) / 100;
}

/**
 * Frequency's own seeded-default range — [2, 8] swells/measure, same domain
 * the slider itself uses directly (no fraction/percent split, unlike
 * pingVarianceAutomation). docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5.
 */
const SWELL_FREQUENCY_SEED_RANGE = { min: 2, max: 8 };

/**
 * Duration's own seeded-default range — [2, 8] measures, same domain the
 * slider itself uses directly. docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5.
 */
const SWELL_DURATION_SEED_RANGE = { min: 2, max: 8 };

/**
 * Seeded starting value for audioStore's swellFrequency — a continuous roll within [2, 8], then
 * snapped onto SWELL_FREQUENCY_SCHEMA's own fixed step grid (audioRigConfig.ts) so a freshly-seeded
 * world always starts on one of the slider's actual allowed values (2, 3, 4, or 8 — the only steps
 * inside this range), the same "no off-grid value" guarantee pingVarianceAutomation's own
 * quantization gives it below. Sampled once per session, carried forward across later Attenuation
 * Style switches, same sentinel-gated mechanism pingVarianceAutomation already uses
 * (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5).
 */
export function generateSwellFrequency(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getSeededVal(
    noiseMap, 'globalAudio.swellFrequency', 0,
    SWELL_FREQUENCY_SEED_RANGE.min, SWELL_FREQUENCY_SEED_RANGE.max
  );
  return stepsTToValue(stepsValueToT(raw, SWELL_FREQUENCY_STEPS), SWELL_FREQUENCY_STEPS);
}

/**
 * Seeded starting value for audioStore's swellDuration, [2, 8] measures. Same
 * seed-once/carry-forward treatment as generateSwellFrequency above. Snapped onto
 * SWELL_DURATION_SCHEMA's own step=1 grid (audioRigConfig.ts) the same way generateSwellFrequency
 * snaps onto SWELL_FREQUENCY_STEPS — a fresh seed's raw continuous roll otherwise lands on a
 * fractional number of measures (e.g. 6.88), off-grid from what the "Automation Length" slider
 * itself can ever produce by hand (found live, 2026-09-30).
 */
export function generateSwellDuration(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getSeededVal(
    noiseMap, 'globalAudio.swellDuration', 0,
    SWELL_DURATION_SEED_RANGE.min, SWELL_DURATION_SEED_RANGE.max
  );
  return quantizeToStep(raw, SWELL_DURATION_SCHEMA.min, SWELL_DURATION_SCHEMA.step ?? 1);
}

/**
 * Humanize's own seeded-default range — [2, 6] ms (docs/specs/ROBOT_PERFORMANCE.md assumption 9): audible as looseness on a
 * fresh world, a third of the slider's 20 ms top, so the first thing a listener hears is a fleet that is a touch off the grid.
 */
export const HUMANIZE_SEED_RANGE = { min: 2, max: 6 };

/**
 * Seeded starting value for audioStore's humanize, whole ms in [2, 6]. Same seed-once/carry-forward treatment as
 * generateSwellDuration above (audioStore.ts's regenerateGlobalAudioFromSeed calls it only on the first seed), snapped onto
 * HUMANIZE_SCHEMA's own 1 ms grid so a fresh world starts on a value the slider can actually produce.
 *
 * A uniform draw, not getSeededVal: one plain draw at offset 0 takes only about three values across all worlds (measured
 * here: 3 over 300 styles, and a single value across 40 names), which would seed nearly every world to the same few ms
 * (docs/specs/ROBOT_PERFORMANCE.md assumption 9 asked for a plain draw; the plan's rename fallback would have kept the flat patch).
 */
export function generateHumanize(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = HUMANIZE_SEED_RANGE.min + getUniformSeededVal(noiseMap, 'globalAudio.humanize') * (HUMANIZE_SEED_RANGE.max - HUMANIZE_SEED_RANGE.min);
  return quantizeToStep(raw, HUMANIZE_SCHEMA.min, HUMANIZE_SCHEMA.step ?? 1);
}

/**
 * Loading-range sub-windows for global-chain LFO link depth — narrower than LFO_DEPTH_MIN/MAX
 * (the full/UI-facing range the LfoLink primitive's Depth slider still uses unchanged). Mirrors
 * globalAudioLoadingRanges.ts's pattern for effect params — bounds what a FRESH SEED can roll,
 * never what the UI exposes or what the app can do. Robot-level LFO-link seeding
 * (spawnSystem.ts) has its own separate ROBOT_LFO_*_DEPTH_SEED_RANGE windows, not these.
 * Per-group rather than one flat window (Crawford's own load-value tuning pass, 2026-10-02):
 * EQ bands, filter frequency sweeps, and filter Q each get their own ceiling, sharing one floor.
 */
export const GLOBAL_LFO_DEPTH_SEED_MIN = 5;
export const GLOBAL_LFO_EQ_DEPTH_SEED_RANGE = { min: GLOBAL_LFO_DEPTH_SEED_MIN, max: 30 };
export const GLOBAL_LFO_FILTER_FREQUENCY_DEPTH_SEED_RANGE = { min: GLOBAL_LFO_DEPTH_SEED_MIN, max: 60 };
export const GLOBAL_LFO_FILTER_Q_DEPTH_SEED_RANGE = { min: GLOBAL_LFO_DEPTH_SEED_MIN, max: 40 };

/** Picks the right depth seed window for a global-chain target: eq3.* -> EQ, *.Q -> filter Q,
 *  everything else (lpf.frequency/hpf.frequency) -> filter frequency. */
function globalLfoDepthSeedRangeForTarget(target: GlobalLfoTargetId): { min: number; max: number } {
  if (target.startsWith('eq3.')) return GLOBAL_LFO_EQ_DEPTH_SEED_RANGE;
  return target.endsWith('.Q') ? GLOBAL_LFO_FILTER_Q_DEPTH_SEED_RANGE : GLOBAL_LFO_FILTER_FREQUENCY_DEPTH_SEED_RANGE;
}

/**
 * Mirrors Lfo.tsx's own RATE_STEP — kept as a separate local constant, same
 * "mirrored, not shared" pattern spawnSystem.ts's own LFO_RATE_STEP uses,
 * since the two files quantize independently sampled rates and have no
 * other reason to share an import.
 */
const LFO_RATE_STEP = 0.05;

/** Rounds depth to a whole percent — depth is already stored in percent units (0-100), so no
 *  unit conversion is needed the way Rate/Volume/Ping Variance Automation's percent-space
 *  conversions require. */
const LFO_DEPTH_STEP = 1;

// ========================================
// LFO BANK (docs/specs/LFO_BANK.md §1.3)
// ========================================

/**
 * Four fixed, adjacent, log-spaced bands a fresh bank lane's rate seeds within — one slow, one
 * fast, two between (spec §1.3/assumption 8). Boundaries are all exact multiples of LFO_RATE_STEP
 * (0.05), so quantizing a sample drawn from a band can never round it out of that band. A first
 * tuning for the listening pass (Checkpoint C), not sacred.
 */
export const LFO_BANK_RATE_BANDS: Record<LfoLaneId, { min: number; max: number }> = {
  a: { min: 0.1, max: 0.4 },
  b: { min: 0.4, max: 1.5 },
  c: { min: 1.5, max: 4 },
  d: { min: 4, max: 8 },
};

/**
 * Probability threshold each lane's own "Sync" seed draw ([0, 1]) must fall under to seed Anchored
 * rather than Float — slower lanes lean Anchored, the fast ones lean Float. The TARGET shares are
 * a 75 / b 66 / c 33 / d 25 % (docs/specs/FREE_SYNC_TOGGLE.md §1.7); the constants below are
 * calibrated, because a simplex draw isn't uniform — it bunches around 0.5, so a threshold equal
 * to its target share over- or under-shoots. Measured over 3000 Attenuation Styles (2026-10-03):
 *   a  0.75 gave 91.8% raw  -> 0.60 gives 74.6%   (calibrated)
 *   b  0.66 gave 72.3% raw  -> 0.62 gives 66.2%   (calibrated at Crawford's request, 2026-10-03)
 *   c  0.33 gives 34.2%                           (left; the c.syncMode draw takes only 3 distinct values)
 *   d  0.25 gave 11.2% raw  -> 0.33 gives 23.8%   (calibrated)
 * Calibrate the constant, never the target. Re-measure if a key or the noise map changes.
 */
const LFO_BANK_SYNC_ODDS: Record<LfoLaneId, number> = { a: 0.6, b: 0.62, c: 0.33, d: 0.33 };

/**
 * Which lanes' rate bands a lane's Sync draw tries, in order — its own, then the next faster, then
 * the next slower, widening outward the same way. pickSeedNoteValue takes the first band holding a
 * note at the seed tempo, so a Sync lane lands as close to its own band as the tempo allows. At
 * today's 40–100 BPM seed range the own band is never empty (a test proves it); the rest is
 * insurance against a future retune of the bands or the range.
 */
export const LFO_BANK_SYNC_BAND_ORDER: Record<LfoLaneId, readonly LfoLaneId[]> = {
  a: ['a', 'b', 'c', 'd'],
  b: ['b', 'c', 'a', 'd'],
  c: ['c', 'd', 'b', 'a'],
  d: ['d', 'c', 'b', 'a'],
};

/** The bank's own per-lane drift loading window (±0.7, spec assumption 8). */
export const LFO_BANK_DRIFT_SEED_RANGE = { min: -0.7, max: 0.7 };

/** Rounds a bank lane's rateDrift/depthDrift to a whole hundredth. */
const LFO_BANK_DRIFT_STEP = 0.01;

/**
 * Generate deterministic LFO Bank lane settings for an Attenuation Style, sampled from the same
 * Attenuation Style noise map generateGlobalAudioSettings uses — the four lanes are a property of
 * the Attenuation Style (spec assumption 2), same seed source and re-seed trigger as the old
 * per-target global-chain LFO settings this supersedes.
 */
export function generateLfoBankSettings(
  attenuationStyleId: string,
  attenuationStyleName: string,
): Record<LfoLaneId, BankLfoSettings> {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const result = {} as Record<LfoLaneId, BankLfoSettings>;
  let shapeQueue: readonly LfoShape[] = LFO_SHAPE_SEED_ORDER;
  const seedBpm = generateAttenuationStyleBpm(attenuationStyleId, attenuationStyleName);

  for (const lane of LFO_LANE_IDS) {
    const rateT = getSeededVal(noiseMap, `lfoBank.${lane}.rate`, 0, 0, 1);
    const shapeT = getSeededVal(noiseMap, `lfoBank.${lane}.shape`, 0, 0, 1);
    const rateDriftT = getSeededVal(noiseMap, `lfoBank.${lane}.rateDrift`, 0, 0, 1);
    const depthDriftT = getSeededVal(noiseMap, `lfoBank.${lane}.depthDrift`, 0, 0, 1);

    const picked = pickShape(shapeT, shapeQueue);
    shapeQueue = picked.queue;

    const syncModeT = getSeededVal(noiseMap, `lfoBank.${lane}.syncMode`, 0, 0, 1);
    const syncNoteT = getSeededVal(noiseMap, `lfoBank.${lane}.syncNote`, 0, 0, 1);
    const sync =
      syncModeT < LFO_BANK_SYNC_ODDS[lane]
        ? pickSeedNoteValue(
            syncNoteT,
            seedBpm,
            LFO_BANK_SYNC_BAND_ORDER[lane].map((id) => LFO_BANK_RATE_BANDS[id]),
            'hz',
          )
        : undefined;

    result[lane] = {
      shape: picked.shape,
      rate: quantizeToStep(
        scaleUnitValue(rateT, { ...LFO_BANK_RATE_BANDS[lane], scale: 'log' }),
        LFO_RATE_MIN,
        LFO_RATE_STEP,
      ),
      rateDrift: quantizeToStep(
        scaleUnitValue(rateDriftT, { ...LFO_BANK_DRIFT_SEED_RANGE, scale: 'linear' }),
        0,
        LFO_BANK_DRIFT_STEP,
      ),
      depthDrift: quantizeToStep(
        scaleUnitValue(depthDriftT, { ...LFO_BANK_DRIFT_SEED_RANGE, scale: 'linear' }),
        0,
        LFO_BANK_DRIFT_STEP,
      ),
      // `rate` above is still sampled as ever — it's the Free value kept underneath a Sync lane.
      // A Free lane carries no `sync` key at all, never `sync: undefined`.
      ...(sync !== undefined && { sync }),
    };
  }
  return result;
}

/**
 * Generate deterministic global-chain LFO links for an Attenuation Style — replaces
 * generateGlobalLfoSettings's per-target shape/rate with a lane pick (spec §1.3). Reuses
 * LFO_QUIET_THRESHOLD (0.34) unchanged; depth now draws from one of three per-group loading
 * windows (globalLfoDepthSeedRangeForTarget above) rather than one flat window. The lane draw is
 * weighted by a running tally across only the 7 global targets — they seed before any robot
 * exists, so there is no roster to tally against (spec assumption 7).
 */
export function generateGlobalLfoLinks(
  attenuationStyleId: string,
  attenuationStyleName: string,
): Record<GlobalLfoTargetId, LfoLink> {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const result = {} as Record<GlobalLfoTargetId, LfoLink>;
  const counts: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };

  for (const target of GLOBAL_LFO_TARGET_IDS) {
    const quietT = getSeededVal(noiseMap, `globalLfo.${target}.quiet`, 0, 0, 1);
    if (quietT < LFO_QUIET_THRESHOLD) {
      result[target] = { lane: null, depth: 0 };
      continue;
    }

    const laneT = getSeededVal(noiseMap, `globalLfo.${target}.lane`, 0, 0, 1);
    const lane = pickLane(laneT, counts);
    counts[lane]++;

    const depthT = getSeededVal(noiseMap, `globalLfo.${target}.depth`, 0, 0, 1);
    const depth = quantizeToStep(
      scaleUnitValue(depthT, { ...globalLfoDepthSeedRangeForTarget(target), scale: 'linear' }),
      LFO_DEPTH_MIN,
      LFO_DEPTH_STEP,
    );
    result[target] = { lane, depth };
  }
  return result;
}
