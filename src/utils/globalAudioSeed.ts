// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import { getAttenuationStyleNoiseMap } from './noiseMaps';
import { getCentredSeededVal, getUniformSeededVal } from './getSeededVal';
import { quantizeToStep } from './math';
import { pickShape, LFO_SHAPE_SEED_ORDER } from './lfoShapeDraw';
import { generateAttenuationStyleBpm } from './bpmSeed';
import { pickSeedNoteValue } from './tempoSync';
import { stepsValueToT, stepsTToValue } from '@/components/ui/controls/sliderLogMath';
import { SWELL_FREQUENCY_STEPS, SWELL_DURATION_SCHEMA, HUMANIZE_SCHEMA } from '@/data/audioRigConfig';

import type { NoteValue } from '@/data/noteValues';
import type { GlobalAudioSettings } from '@/types/globalAudio';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS, SYNCED_RATE_KEYS, type SyncedRateKey } from '@/types/globalAudio';
import { getBand } from '@/data/bands/loadingContext';
import { GLOBAL_AUDIO_SEED_RANGES, type LoadingRangeKey, type SeedRange } from '@/data/globalAudioSeedRanges';
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

/** The EQ bands, whose middle (0 dB) is neutral: they draw centred, the rest even (docs/specs/EVEN_SEEDED_DRAWS.md §1.2). */
const CENTRED_FIELD_KEYS: ReadonlySet<LoadingRangeKey> = new Set(['eq3.low', 'eq3.mid', 'eq3.high']);

/**
 * Every field draws its position evenly (getUniformSeededVal), each key on its own draw, so a world fills the band and no
 * two fields move together; the EQ bands draw centred (getCentredSeededVal), near 0 dB but still independent. One
 * getSeededVal sample at offset 0 is bell-curved, takes 3 to a few hundred distinct values across all worlds, and welds
 * keys together (the EQ low and mid correlated at r = 1.000), so no field uses it (Even Seeded Draws T10).
 */
function sampleField(noiseMap: NoiseFunction2D, key: LoadingRangeKey): number {
  // Sample within the narrower LOADING band - the loaded world's, from the band table (getBand, band-table T22;
  // Classic's rows are in src/data/bands/classic.ts) - but honor the full range's log/linear scale: a band carries no
  // `scale`, it is purely a narrower min/max over the same field GLOBAL_AUDIO_SEED_RANGES already describes.
  const range: SeedRange = { ...getBand(key), scale: GLOBAL_AUDIO_SEED_RANGES[key].scale };
  // The draw gives the [0, 1] position; scaleUnitValue owns range + log/linear mapping, so the two concerns stay
  // separately testable.
  const draw = CENTRED_FIELD_KEYS.has(key) ? getCentredSeededVal : getUniformSeededVal;
  const t = draw(noiseMap, `globalAudio.${key}`);
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
 * untouched. The note itself is then picked from the Delay loading band only. The mode and note
 * draws are even (Even Seeded Draws T11), so the edge is the share.
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
 * first band whose edge is above it. The draw is even (getUniformSeededVal, Even Seeded Draws T11), so each band's
 * width is its share: a quarter each, the target (docs/specs/EVEN_SEEDED_DRAWS.md §1.4). The bell-curved plain draw
 * needed fitted edges (0.3065 / 0.5 / 0.6935) to give the same quarters. If the targets move, move the edges.
 */
export const COLOUR_CHARACTER_BANDS: readonly number[] = [0.25, 0.5, 0.75, 1];

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
  // Robot Effect Sends T8 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 9): the Chorus (0.25) and the shifter (0.15) left
  // with their move into rooms; a room has no lit roll, its robots' sends light it.
  tremolo: 0.25,
  vibrato: 0.25,
};

/** The Global Pedals' motion pedals still in the dry chain, in chain order (docs/specs/GLOBAL_PEDALS.md §1.2), the order
 *  they roll in. The Chorus and the Frequency Shifter left at Robot Effect Sends T8, for the Double and Shimmer rooms. */
export const MOTION_PEDALS = ['tremolo', 'vibrato'] as const;
export type MotionPedal = (typeof MOTION_PEDALS)[number];

/**
 * The most Modulation pedals a fresh world lights, counting the AutoWah and the Phaser (docs/specs/GLOBAL_PEDALS.md
 * assumption 7). A SEQUENTIAL cap: the AutoWah and Phaser roll first and untouched, then each motion pedal in chain order
 * rolls its own uniform draw and is forced dark if two are already lit. Every roll key is read on every style, so the
 * draw set never depends on the outcome. The rolls are uniform and independent, so the realised shares follow from the
 * edges exactly - the 50.4 pedals leave 0 / 1 / 2 lit in 4/9 / 4/9 / 1/9 of worlds. Since Robot Effect Sends T8 the cap
 * counts four pedals (the Chorus and the shifter became rooms, lit by their robots' sends), giving Tremolo 22.2 % and
 * Vibrato 19.4 %. Measured over 20 000 styles ('PedalsCalibration<n>', 2026-10-21): Tremolo 22.04 %, Vibrato 19.55 %, two
 * pedals lit in 33.20 % of worlds and never more. The test holds a different set ('PedalsShare<n>', 3 000 styles) to
 * within 3 points of those. A theme that wants more lit moves the edges or this cap. By hand any number of pedals can be
 * lit.
 */
export const MAX_LIT_PEDALS = 2;

/**
 * The share of LIT LFO pedals (Phaser, Chorus, Tremolo, Vibrato) that seed Sync rather than Free, one entry per pedal:
 * each one's sync roll falls under its own entry (docs/specs/GLOBAL_PEDALS.md assumption 8, the Phaser's from
 * docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 8). A dark pedal never seeds Sync. Half for the Phaser, Chorus and
 * Vibrato, three quarters for the Tremolo (Classic Band Retune row 13, 2026-10-21): a Free tremolo beats against the 16th
 * grid, and the others don't care. Measured over 20 000 styles ('PedalsCalibration<n>', 2026-10-21, after the retune): lit
 * Phaser / Chorus / Tremolo / Vibrato worlds synced 50.62 / 49.82 / 75.14 / 49.73 %, and no dark pedal ever; before it the
 * Tremolo's was 50.88 %. The rolls are uniform, so an entry is the realised share.
 */
export const PEDAL_SYNC_ODDS: Record<SyncedRateKey, number> = {
  phaser: 0.5,
  chorus: 0.5,
  tremolo: 0.75,
  vibrato: 0.5,
};

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
 * Phaser seeds Sync in about half of worlds (PEDAL_SYNC_ODDS.phaser), with the note drawn from the lit rate band.
 *
 * The Tremolo and the Vibrato roll after them in chain order under a two-lit cap (MAX_LIT_PEDALS), each with the same
 * dark-pedal rule and its own Sync odds (PEDAL_SYNC_ODDS). The Chorus and the Frequency Shifter are rooms (Robot Effect
 * Sends, docs/specs/ROBOT_EFFECT_SENDS.md assumptions 4 and 9): their `wet` is the room's Return, 1 from the defaults, and
 * they have no lit roll; the Chorus rolls Sync in every world, the shifter's sign is its own draw, and every shape value
 * still seeds from its band. Width always seeds from its band (docs/specs/GLOBAL_PEDALS.md §1.2).
 */
export function generateGlobalAudioSettings(attenuationStyleId: string, attenuationStyleName: string): GlobalAudioSettings {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const defaults = DEFAULT_GLOBAL_AUDIO_SETTINGS;
  // The tempo the Delay and the Phaser snap their Sync notes to. Drawn lazily and once: a style with neither anchored
  // never draws it, exactly as before.
  let styleBpm: number | undefined;
  const bpm = (): number => (styleBpm ??= generateAttenuationStyleBpm(attenuationStyleId, attenuationStyleName));
  const delaySyncModeT = getUniformSeededVal(noiseMap, 'globalAudio.delay.syncMode');
  const delaySyncNoteT = getUniformSeededVal(noiseMap, 'globalAudio.delay.syncNote');
  const delaySync =
    delaySyncModeT < DELAY_SYNC_ODDS
      ? pickSeedNoteValue(delaySyncNoteT, bpm(), [getBand('delay.delayTime')], 'seconds')
      : undefined;

  // Colour: the character draw says which nodes are lit. All seven colour keys are read on every style, lit or not,
  // so the draw set never depends on the character; an unlit node still seeds its shape value (a hand nudge of Mix
  // then hears something at once) and just has its `wet` forced to 0.
  const lit = COLOUR_CHARACTER_NODES[pickColourCharacter(getUniformSeededVal(noiseMap, 'globalAudio.colour.character'))];
  const distortionWet = sampleField(noiseMap, 'distortion.wet');
  const chebyshevWet = sampleField(noiseMap, 'chebyshev.wet');
  const bitCrusherWet = sampleField(noiseMap, 'bitCrusher.wet');

  // Modulation: four roll draws, then the thirteen value draws, ALL read on every style, lit or dark, so the draw set
  // never depends on the outcome. Every one is a uniform draw (see PEDAL_LIT_EDGE and sampleField for why).
  const autoWahLit = getUniformSeededVal(noiseMap, 'globalAudio.autoWah.lit') < PEDAL_LIT_EDGE.autoWah;
  const phaserLit = getUniformSeededVal(noiseMap, 'globalAudio.phaser.lit') < PEDAL_LIT_EDGE.phaser;
  const autoWahWet = sampleField(noiseMap, 'autoWah.wet');
  const phaserWet = sampleField(noiseMap, 'phaser.wet');

  // Global Pedals (docs/specs/GLOBAL_PEDALS.md §1.2): the sequential cap. Each motion pedal's roll is read whether or not
  // the cap would allow it, so the draw set is total; the AutoWah and Phaser results above count towards the cap.
  let litCount = Number(autoWahLit) + Number(phaserLit);
  const pedalLit = {} as Record<MotionPedal, boolean>;
  for (const pedal of MOTION_PEDALS) {
    const wants = getUniformSeededVal(noiseMap, `globalAudio.${pedal}.lit`) < PEDAL_LIT_EDGE[pedal];
    pedalLit[pedal] = wants && litCount < MAX_LIT_PEDALS;
    if (pedalLit[pedal]) litCount += 1;
  }
  // A sync pair per synced-rate block (the Phaser and the three LFO pedals), read on every style; Sync only when lit and
  // under the odds, the note from the lit band. A dark one is Free (no `sync` key), like a Free lane; an empty band
  // leaves a lit one Free too.
  // Robot Effect Sends T8 (spec assumption 9): the Chorus is the Double room, heard whenever any robot sends into it, so
  // it rolls Sync in every world under its odds.
  const rateLit: Record<SyncedRateKey, boolean> = { phaser: phaserLit, chorus: true, ...pedalLit };
  const rateSync = {} as Record<SyncedRateKey, NoteValue | undefined>;
  for (const key of SYNCED_RATE_KEYS) {
    const modeT = getUniformSeededVal(noiseMap, `globalAudio.${key}.syncMode`);
    const noteT = getUniformSeededVal(noiseMap, `globalAudio.${key}.syncNote`);
    rateSync[key] =
      rateLit[key] && modeT < PEDAL_SYNC_ODDS[key]
        ? pickSeedNoteValue(noteT, bpm(), [getBand(`${key}.rate`)], 'hz')
        : undefined;
  }
  // The shift is a magnitude band with its own sign draw, so a seeded shift is never inside ±2 Hz.
  const shiftSign = getUniformSeededVal(noiseMap, 'globalAudio.frequencyShifter.sign') < 0.5 ? -1 : 1;
  const pedalWet = (pedal: MotionPedal): number => {
    const wet = sampleField(noiseMap, `${pedal}.wet`);
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
      baseFrequency: sampleField(noiseMap, 'autoWah.baseFrequency'),
      octaves: sampleField(noiseMap, 'autoWah.octaves'),
      sensitivity: sampleField(noiseMap, 'autoWah.sensitivity'),
      Q: sampleField(noiseMap, 'autoWah.Q'),
      gain: sampleField(noiseMap, 'autoWah.gain'),
      follower: sampleField(noiseMap, 'autoWah.follower'),
      wet: autoWahLit ? autoWahWet : 0,
    },
    phaser: {
      rate: sampleField(noiseMap, 'phaser.rate'),
      octaves: sampleField(noiseMap, 'phaser.octaves'),
      baseFrequency: sampleField(noiseMap, 'phaser.baseFrequency'),
      stages: sampleField(noiseMap, 'phaser.stages'),
      Q: sampleField(noiseMap, 'phaser.Q'),
      wet: phaserLit ? phaserWet : 0,
      ...(rateSync.phaser !== undefined && { sync: rateSync.phaser }),
    },
    // Global Pedals: every value a uniform draw from its band, lit or dark; a dark pedal has Mix 0 and no sync key.
    chorus: withSync(
      {
        rate: sampleField(noiseMap, 'chorus.rate'),
        delayTime: sampleField(noiseMap, 'chorus.delayTime'),
        depth: sampleField(noiseMap, 'chorus.depth'),
        spread: sampleField(noiseMap, 'chorus.spread'),
        feedback: sampleField(noiseMap, 'chorus.feedback'),
        // The Double room's Return (Robot Effect Sends T8): never seeded, from the defaults.
        wet: defaults.chorus.wet,
      },
      rateSync.chorus,
    ),
    tremolo: withSync(
      {
        rate: sampleField(noiseMap, 'tremolo.rate'),
        depth: sampleField(noiseMap, 'tremolo.depth'),
        spread: sampleField(noiseMap, 'tremolo.spread'),
        wet: pedalWet('tremolo'),
      },
      rateSync.tremolo,
    ),
    vibrato: withSync(
      {
        rate: sampleField(noiseMap, 'vibrato.rate'),
        depth: sampleField(noiseMap, 'vibrato.depth'),
        wet: pedalWet('vibrato'),
      },
      rateSync.vibrato,
    ),
    frequencyShifter: {
      shift: shiftSign * sampleField(noiseMap, 'frequencyShifter.shift'),
      // The Shimmer room's Return (Robot Effect Sends T8): never seeded, from the defaults.
      wet: defaults.frequencyShifter.wet,
    },
    // Width has no dark state: always a value from its band, never near the mono fold.
    stereoWidener: { width: sampleField(noiseMap, 'stereoWidener.width') },
    limiter: {
      threshold: sampleField(noiseMap, 'limiter.threshold'),
    },
  };
}

/**
 * Probability threshold a target's own "start quiet" seed draw ([0, 1]) must
 * clear to force rate to 0 — ~34% chance per target (not a flat 50/50), so a
 * typical Attenuation Style seeds roughly 5 already-oscillating LFOs out of 7.
 * The quiet draw is even (Even Seeded Draws T14), so 0.34 is each target's
 * share; on the old plain draw it ranged 0–34 % (hpf.Q was never quiet).
 * Replaces the old separate `active` boolean — see LFO_RATE_MIN's own doc
 * comment (src/types/lfo.ts) for why rate=0 is now the "off" state.
 */
const LFO_QUIET_THRESHOLD = 0.34;

/** A global target's quiet edge: LFO_QUIET_THRESHOLD, except the master low-pass cutoff's, which is its band's unlit
 *  share (lfoLink.lpf.frequency, docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6; Classic's lit of 0.66 is the same edge),
 *  so a theme naming it at a lit of 1 ties it live in every world. */
function quietThresholdForTarget(target: GlobalLfoTargetId): number {
  return target === 'lpf.frequency' ? 1 - getBand('lfoLink.lpf.frequency').lit : LFO_QUIET_THRESHOLD;
}

/**
 * Ping Variance Automation's own seeded-default range — [10%, 60%] as a
 * fraction — same "bounded/legible default, freely draggable afterward"
 * convention every other seeded Rig field follows (e.g. DELAY_SYNC_ODDS
 * above). Narrowed from [33%, 66%] once Intensity's on/off role moved to the
 * new Frequency field (docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2).
 */
const PING_VARIANCE_AUTOMATION_SEED_RANGE = { min: 0.10, max: 0.60 };

/**
 * Seeded starting value for audioStore's pingVarianceAutomation, [0.10, 0.60]
 * as a fraction. Sampled once per session, not once per Attenuation Style
 * switch — audioStore.ts's regenerateGlobalAudioFromSeed is responsible for
 * only calling this on the very first seed and carrying the value forward on
 * every later call (docs/specs/archive/PING-VARIANCE-AUTOMATION.md §1.2); this
 * function itself is a stateless, even seeded draw (getUniformSeededVal, Even
 * Seeded Draws T15, like swell frequency and duration below), same shape as every
 * other function in this file.
 */
export function generatePingVarianceAutomation(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getUniformSeededVal(
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
 * pingVarianceAutomation). docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5.
 */
const SWELL_FREQUENCY_SEED_RANGE = { min: 2, max: 8 };

/**
 * Duration's own seeded-default range — [2, 8] measures, same domain the
 * slider itself uses directly. docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5.
 */
const SWELL_DURATION_SEED_RANGE = { min: 2, max: 8 };

/**
 * Seeded starting value for audioStore's swellFrequency — a continuous roll within [2, 8], then
 * snapped onto SWELL_FREQUENCY_SCHEMA's own fixed step grid (audioRigConfig.ts) so a freshly-seeded
 * world always starts on one of the slider's actual allowed values (2, 3, 4, or 8 — the only steps
 * inside this range), the same "no off-grid value" guarantee pingVarianceAutomation's own
 * quantization gives it below. Sampled once per session, carried forward across later Attenuation
 * Style switches, same sentinel-gated mechanism pingVarianceAutomation already uses
 * (docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5).
 */
export function generateSwellFrequency(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getUniformSeededVal(
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
  const raw = getUniformSeededVal(
    noiseMap, 'globalAudio.swellDuration', 0,
    SWELL_DURATION_SEED_RANGE.min, SWELL_DURATION_SEED_RANGE.max
  );
  return quantizeToStep(raw, SWELL_DURATION_SCHEMA.min, SWELL_DURATION_SCHEMA.step ?? 1);
}

/**
 * Seeded starting value for audioStore's humanize, whole ms in the loaded world's `humanize` band (Classic's [2, 6] ms,
 * docs/specs/ROBOT_PERFORMANCE.md assumption 9: audible as looseness on a fresh world, a third of the slider's 20 ms top;
 * a band since docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6, so a theme can tighten or loosen it). Same
 * seed-once/carry-forward treatment as generateSwellDuration above on a style switch (audioStore.ts's
 * regenerateGlobalAudioFromSeed calls it only on the first seed); a loading change draws it again
 * (deriveGlobalHalfMoves). Snapped onto HUMANIZE_SCHEMA's own 1 ms grid so a fresh world starts on a value the slider can
 * actually produce.
 *
 * A uniform draw, not getSeededVal: one plain draw at offset 0 takes only about three values across all worlds (measured
 * here: 3 over 300 styles, and a single value across 40 names), which would seed nearly every world to the same few ms
 * (docs/specs/ROBOT_PERFORMANCE.md assumption 9 asked for a plain draw; the plan's rename fallback would have kept the flat patch).
 */
export function generateHumanize(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const band = getBand('humanize');
  const raw = band.min + getUniformSeededVal(noiseMap, 'globalAudio.humanize') * (band.max - band.min);
  return quantizeToStep(raw, HUMANIZE_SCHEMA.min, HUMANIZE_SCHEMA.step ?? 1);
}

/**
 * Loading-range sub-windows for global-chain LFO link depth — narrower than LFO_DEPTH_MIN/MAX
 * (the full/UI-facing range the LfoLink primitive's Depth slider still uses unchanged). Mirrors
 * the band table's pattern for effect params (src/data/bands/classic.ts) — bounds what a FRESH SEED can roll,
 * never what the UI exposes or what the app can do. Robot-level LFO-link seeding
 * (spawnSystem.ts) has its own separate ROBOT_LFO_*_DEPTH_SEED_RANGE windows, not these.
 * Per-group rather than one flat window (Crawford's own load-value tuning pass, 2026-10-02):
 * EQ bands, filter frequency sweeps, and filter Q each get their own ceiling, sharing one floor.
 */
export const GLOBAL_LFO_DEPTH_SEED_MIN = 5;
export const GLOBAL_LFO_EQ_DEPTH_SEED_RANGE = { min: GLOBAL_LFO_DEPTH_SEED_MIN, max: 30 };
export const GLOBAL_LFO_FILTER_FREQUENCY_DEPTH_SEED_RANGE = { min: GLOBAL_LFO_DEPTH_SEED_MIN, max: 60 };
export const GLOBAL_LFO_FILTER_Q_DEPTH_SEED_RANGE = { min: GLOBAL_LFO_DEPTH_SEED_MIN, max: 40 };

/** Picks the right depth seed window for a global-chain target: the master low-pass cutoff its own band
 *  (lfoLink.lpf.frequency, docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6), eq3.* -> EQ, *.Q -> filter Q, everything else
 *  (hpf.frequency) -> filter frequency. */
function globalLfoDepthSeedRangeForTarget(target: GlobalLfoTargetId): { min: number; max: number } {
  if (target === 'lpf.frequency') {
    const { min, max } = getBand('lfoLink.lpf.frequency');
    return { min, max };
  }
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
 * rather than Float — slower lanes lean Anchored, the fast ones lean Float. Each is its TARGET
 * share, a 75 / b 66 / c 33 / d 25 % (docs/specs/FREE_SYNC_TOGGLE.md §1.7): the draw is even
 * (getUniformSeededVal, Even Seeded Draws T13), so an edge is the share it gives. The bell-curved
 * plain draw needed calibrated edges (0.6 / 0.62 / 0.33 / 0.33) for the same shares.
 */
const LFO_BANK_SYNC_ODDS: Record<LfoLaneId, number> = { a: 0.75, b: 0.66, c: 0.33, d: 0.25 };

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
    const rateT = getUniformSeededVal(noiseMap, `lfoBank.${lane}.rate`);
    const shapeT = getUniformSeededVal(noiseMap, `lfoBank.${lane}.shape`);
    const rateDriftT = getUniformSeededVal(noiseMap, `lfoBank.${lane}.rateDrift`);
    const depthDriftT = getUniformSeededVal(noiseMap, `lfoBank.${lane}.depthDrift`);

    const picked = pickShape(shapeT, shapeQueue);
    shapeQueue = picked.queue;

    const syncModeT = getUniformSeededVal(noiseMap, `lfoBank.${lane}.syncMode`);
    const syncNoteT = getUniformSeededVal(noiseMap, `lfoBank.${lane}.syncNote`);
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
 * The share of a lit global target's lane draw that asks for the Companion (lane b) rather than the Core (lane a), while
 * no target has taken it yet. Crawford, 2026-10-21: the EQ, LPF and HPF links may only reach the Core or Companion LFO on
 * load, usually the Core, with the Companion "maybe once per session on those attributes". So the Companion is capped at
 * one link per world and each lit target asks for it with this probability until one has: about 4.6 targets are lit per
 * world, so roughly 1 - 0.9^4.6 = 38 % of worlds carry one Companion link and the rest are all Core. The draw is uniform
 * (getUniformSeededVal), so the edge is the realised share (measured in the docs/tasks/CLASSIC_BAND_RETUNE.md §7 entry).
 */
export const GLOBAL_LFO_COMPANION_EDGE = 0.1;

/**
 * Generate deterministic global-chain LFO links for an Attenuation Style — replaces
 * generateGlobalLfoSettings's per-target shape/rate with a lane pick (spec §1.3). Reuses
 * LFO_QUIET_THRESHOLD (0.34) unchanged; depth now draws from one of three per-group loading
 * windows (globalLfoDepthSeedRangeForTarget above) rather than one flat window.
 *
 * A lit target links the Core LFO (lane a) or, at most once per world, the Companion (lane b) — never the Accent or
 * Overtone lane (GLOBAL_LFO_COMPANION_EDGE). This governs a fresh world only: a saved session or share link restores
 * whatever lane was hand-set. The robot-level links keep the four-lane weighted draw (pickLane).
 */
export function generateGlobalLfoLinks(
  attenuationStyleId: string,
  attenuationStyleName: string,
): Record<GlobalLfoTargetId, LfoLink> {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const result = {} as Record<GlobalLfoTargetId, LfoLink>;
  let companionTaken = false;

  for (const target of GLOBAL_LFO_TARGET_IDS) {
    const quietT = getUniformSeededVal(noiseMap, `globalLfo.${target}.quiet`);
    if (quietT < quietThresholdForTarget(target)) {
      result[target] = { lane: null, depth: 0 };
      continue;
    }

    // A uniform draw: one getSeededVal sample is bell-curved and coarse, which would make the Companion's share a guess.
    const laneT = getUniformSeededVal(noiseMap, `globalLfo.${target}.lane`);
    const lane: LfoLaneId = !companionTaken && laneT < GLOBAL_LFO_COMPANION_EDGE ? 'b' : 'a';
    if (lane === 'b') companionTaken = true;

    const depthT = getUniformSeededVal(noiseMap, `globalLfo.${target}.depth`);
    const depth = quantizeToStep(
      scaleUnitValue(depthT, { ...globalLfoDepthSeedRangeForTarget(target), scale: 'linear' }),
      LFO_DEPTH_MIN,
      LFO_DEPTH_STEP,
    );
    result[target] = { lane, depth };
  }
  return result;
}
