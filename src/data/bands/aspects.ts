// ========================================
// IMPORTS
// ========================================
import type { BandKey, BandTable } from './bandKeys';

// ========================================
// IDS
// ========================================

/** The aspect families (docs/specs/OFF_SCREEN.md assumption 15), in family order: Melody, then Envelope and Distance
 *  (docs/tasks/OFF_SCREEN_REVISIONS.md Task 7, Crawford's note 3; the wireframe's Space became Distance in his answer 6),
 *  then Voice (revisions Task 10, through the waveform pick), then Motion and Performance
 *  (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b, the cut's default order: last).
 *  A family is a key set and its options' columns; the deal (dealAspects.ts) seats one option per family per robot.
 *  Aspects are robot-side (spec §3): a family's keys are robot bands or sends, never `bpm` or a global row. */
export const ASPECT_FAMILY_IDS = ['melody', 'envelope', 'distance', 'voice', 'motion', 'performance'] as const;
export type AspectFamilyId = (typeof ASPECT_FAMILY_IDS)[number];

/** Each family's option ids in canonical option order (assumption 17): a family's row lists them so, and every pick list
 *  and link param is sorted so (canonicalPicks). The ids are code, unique across families; names and descriptions are
 *  content (`home.off.<family>.<id>`, `home.off.<family>Description.<id>`). A pick list holds its family's ids and
 *  nothing else: the "as theme" member is gone (revisions Task 6, Crawford's note 4) — an empty list is every robot as
 *  theme, and a stale `theme`, or another family's id, is dropped as any unknown id is. */
export const ASPECT_IDS_BY_FAMILY = {
  // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T9: the cut's twenty-seven, the options that stood first, then the
  // candidates kept, in the sheets' order (docs/reference/THEME_AND_ASPECT_SHEETS.md). Far and Remote are cut as rungs.
  melody: ['hypnotic', 'mechanical', 'wandering', 'chanting', 'tumbling', 'telegraph'],
  envelope: ['plucked', 'swelling', 'held', 'bowed', 'hammered', 'breathing'],
  distance: ['near', 'echoing', 'halfHeard'],
  voice: ['glassy', 'woody', 'hollow', 'brassy', 'muted', 'chiming'],
  motion: ['gliding', 'trembling', 'sweeping'],
  performance: ['steady', 'dramatic', 'halting'],
} as const satisfies Record<AspectFamilyId, readonly string[]>;

/** One family's option ids. */
export type AspectIdOf<F extends AspectFamilyId> = (typeof ASPECT_IDS_BY_FAMILY)[F][number];
/** Any family's option id. A record keyed by family (a pick list, Robot.loadedUnder) holds only that family's ids, in
 *  its type too (FamilyAspects, FamilyPicks); the readers below still check membership, since a payload or a link is
 *  untrusted input. */
export type AspectId = AspectIdOf<AspectFamilyId>;
/** At most one aspect per family, each one of its own family's ids: what the deal seats on one robot (dealAspects.ts's
 *  RobotAspects, Robot.loadedUnder) and what that robot's bands resolve under (resolveBands). A family absent means as
 *  theme for that family (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R15: `{ melody: 'plucked' }` does not compile). */
export type FamilyAspects = { [F in AspectFamilyId]?: AspectIdOf<F> };
/** A pick list per family, each list of its own family's ids: a world's loading (LoadingIdentity.aspects) and every copy
 *  of it - the payload, the link, a retransmit's input, the off screen's intent. */
export type FamilyPicks = { [F in AspectFamilyId]?: AspectIdOf<F>[] };

// ========================================
// FAMILIES
// ========================================

/** The four Melody keys an aspect may move (assumption 16). */
const MELODY_BAND_KEYS = [
  'robot.rhythmicDensity',
  'robot.noteVariance',
  'robot.rhythmicMotifLength',
  'robot.pitchRepeat',
] as const;
export type MelodyBandKey = (typeof MELODY_BAND_KEYS)[number];

/** The six Envelope keys (revisions Task 7): the four stages and the two shaped stages. A shaped stage is drawn from its
 *  own band instead of the plain one (generateAudioAttributes), so an option that moves a stage moves its shaped band
 *  with it, or a curved robot would undo the option; the shaped stages' `lit` rides along. */
const ENVELOPE_BAND_KEYS = [
  'robot.attack',
  'robot.decay',
  'robot.sustain',
  'robot.release',
  'robot.shapedAttack',
  'robot.shapedRelease',
] as const;
export type EnvelopeBandKey = (typeof ENVELOPE_BAND_KEYS)[number];

/** The two Distance keys (revisions Task 7): a robot's depth into the Reverb and the Delay - how far off it sounds. A
 *  room's own size (`reverb.decay`, `delay.delayTime`) is a global band, a theme's and never an aspect's (spec §3), so
 *  Distance sinks robots into the rooms but cannot lengthen them. Grit, Shimmer and Double stay the theme's. */
const DISTANCE_BAND_KEYS = ['reverbSend', 'delaySend'] as const;
export type DistanceBandKey = (typeof DISTANCE_BAND_KEYS)[number];

/** The five Voice keys (revisions Task 10): the waveform pick (the base and the three layers draw it), the open and the
 *  accent bus filter with the accent's resonance, and the Coaxial / Harmonic layer gain. */
const VOICE_BAND_KEYS = [
  'robot.waveform',
  'robot.filterFreq',
  'robot.accentFilterFreq',
  'robot.accentFilterQ',
  'robot.layerGain',
] as const;
export type VoiceBandKey = (typeof VOICE_BAND_KEYS)[number];

/** The four Motion keys (docs/specs/THEME_AND_ASPECTS_REFINEMENT.md §1.5; docs/reference/THEME_AND_ASPECT_SHEETS.md,
 *  Motion): how the probes move while they sound - the glide and the three LFO link depth windows. The three room sends
 *  stay the theme's (the Motion sheet), so Distance keeps the Reverb and Delay pair alone. */
const MOTION_BAND_KEYS = ['robot.portamento', 'robot.lfoGainDepth', 'robot.lfoDetuneDepth', 'robot.lfoBusDepth'] as const;
export type MotionBandKey = (typeof MOTION_BAND_KEYS)[number];

/** The three Performance keys (spec §1.5; the Performance sheet): how the probes play their lines - how much a robot's
 *  velocities swing, how often it rests, how often it marks a note. `humanize` stays the theme's (one scatter for the
 *  fleet). */
const PERFORMANCE_BAND_KEYS = ['robot.dynamics', 'robot.rests', 'robot.accents'] as const;
export type PerformanceBandKey = (typeof PERFORMANCE_BAND_KEYS)[number];

/** A family: its key set, and per option a column over those keys only. The option type is
 *  `Partial<Pick<BandTable, K>>`, so an aspect cannot reach outside its family (spec §1.5) and no conflict rule is
 *  needed; the option ids are the family's own. */
export interface AspectFamily<F extends AspectFamilyId, K extends BandKey> {
  readonly keys: readonly K[];
  readonly options: Readonly<Record<AspectIdOf<F>, Partial<Pick<BandTable, K>>>>;
}

/**
 * The families and their options' columns, one per sheet in docs/reference/THEME_AND_ASPECT_SHEETS.md
 * (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T9). Each column names exactly its sheet's "Keys owned" and each new key's
 * comment is the sheet sentence that needs it; resolveBands.test.ts types the lists in and holds every column to them,
 * to the kind-and-bounds check, and to differing from the theme-less table somewhere (an option band equal to Classic's
 * still overrides a theme that moves the key). EVERY NUMBER IS A FIRST CUT: T10 measures, L2 and L3 listen.
 *
 * The twelve options that stood before the cut keep the numbers their listens left (Melody: docs/tasks/OFF_SCREEN.md
 * Tasks 34-35; Envelope, Near and Voice: docs/tasks/OFF_SCREEN_REVISIONS.md Tasks 7, 10 and 11), since each sheet owns
 * exactly the keys its column already named. A lit share of 0 is a sheet's "none" and an off share of 1 its "always off",
 * as in the theme columns.
 */
export const ASPECT_FAMILIES: {
  readonly melody: AspectFamily<'melody', MelodyBandKey>;
  readonly envelope: AspectFamily<'envelope', EnvelopeBandKey>;
  readonly distance: AspectFamily<'distance', DistanceBandKey>;
  readonly voice: AspectFamily<'voice', VoiceBandKey>;
  readonly motion: AspectFamily<'motion', MotionBandKey>;
  readonly performance: AspectFamily<'performance', PerformanceBandKey>;
} = {
  melody: {
    keys: MELODY_BAND_KEYS,
    options: {
      hypnotic: {
        'robot.rhythmicDensity': { min: 40, max: 60 },
        'robot.noteVariance': { offShare: 0, min: 1, max: 2 },
        'robot.pitchRepeat': { min: 50, max: 100 },
      },
      mechanical: {
        'robot.rhythmicDensity': { min: 70, max: 95 },
        'robot.noteVariance': { offShare: 0, min: 1, max: 3 },
        'robot.rhythmicMotifLength': { offShare: 0, min: 6, max: 8 },
        'robot.pitchRepeat': { min: 30, max: 70 },
      },
      wandering: {
        'robot.rhythmicDensity': { min: 20, max: 50 },
        'robot.noteVariance': { offShare: 0, min: 6, max: 8 },
        'robot.rhythmicMotifLength': { offShare: 0.85, min: 1, max: 8 },
        'robot.pitchRepeat': { min: 0, max: 30 },
      },
      // Chanting: a short ostinato.
      chanting: {
        'robot.rhythmicMotifLength': { offShare: 0, min: 2, max: 3 }, // a figure of two or three notes, never off
        'robot.noteVariance': { offShare: 0, min: 1, max: 2 }, // keeps its pitch close, never off
        'robot.pitchRepeat': { min: 75, max: 100 }, // the same notes nearly every time
        'robot.rhythmicDensity': { min: 60, max: 80 }, // a brisk, even rate
      },
      // Tumbling: a cascade that never settles.
      tumbling: {
        'robot.rhythmicDensity': { min: 85, max: 100 }, // speaks nearly all the time
        'robot.noteVariance': { offShare: 0, min: 6, max: 8 }, // ranges wide in pitch, never off
        'robot.rhythmicMotifLength': { offShare: 1, min: 1, max: 8 }, // never tiles a figure: always off
        'robot.pitchRepeat': { min: 0, max: 15 }, // rarely returns to a note
      },
      // Telegraph: dots and dashes from far off.
      telegraph: {
        'robot.rhythmicDensity': { min: 5, max: 20 }, // speaks rarely
        'robot.rhythmicMotifLength': { offShare: 0, min: 6, max: 8 }, // a long fixed figure, never off
        'robot.noteVariance': { offShare: 0, min: 1, max: 2 }, // on one or two notes, never off
        'robot.pitchRepeat': { min: 40, max: 60 }, // returning to them about as often as not
      },
    },
  },
  envelope: {
    keys: ENVELOPE_BAND_KEYS,
    options: {
      plucked: {
        'robot.attack': { min: 0.015, max: 0.03 },
        'robot.decay': { min: 0.1, max: 0.6 },
        'robot.sustain': { min: 0, max: 0.25 },
        'robot.release': { min: 0.05, max: 0.4 },
        'robot.shapedAttack': { min: 0.015, max: 0.04, lit: 0.5 },
        'robot.shapedRelease': { min: 0.1, max: 0.4, lit: 0.6 },
      },
      swelling: {
        'robot.attack': { min: 0.3, max: 1.2 },
        'robot.sustain': { min: 0.7, max: 1 },
        'robot.shapedAttack': { min: 0.3, max: 1.2, lit: 0.4 },
      },
      held: {
        'robot.attack': { min: 0.02, max: 0.15 },
        'robot.sustain': { min: 0.9, max: 1 },
        'robot.release': { min: 0.8, max: 2 },
        'robot.shapedRelease': { min: 0.8, max: 2, lit: 0.275 },
      },
      // Bowed: slow in and slow out.
      bowed: {
        'robot.attack': { min: 0.4, max: 1.2 }, // drawn in slowly
        'robot.sustain': { min: 0.75, max: 1 }, // holds high while it lasts
        'robot.release': { min: 0.8, max: 2 }, // drawn out slowly after
        'robot.shapedAttack': { min: 0.4, max: 1.2, lit: 0.3 }, // a curved probe drawn in as slowly
        'robot.shapedRelease': { min: 0.8, max: 2, lit: 0.3 }, // and out as slowly
      },
      // Hammered: a hard start and a dead stop.
      // Its four edges are held at the sliders' click-free floors (15 ms attack, 20 ms release).
      hammered: {
        'robot.attack': { min: 0.015, max: 0.015 }, // switches on at once
        'robot.sustain': { min: 0.95, max: 1 }, // sounds in full for as long as it lasts
        'robot.release': { min: 0.02, max: 0.02 }, // stops dead when it ends
        'robot.shapedAttack': { min: 0.015, max: 0.015, lit: 0.155 }, // a curved probe switches on as fast
        'robot.shapedRelease': { min: 0.02, max: 0.02, lit: 0.15 }, // and stops as dead
      },
      // Breathing: comes in, gives way, lingers.
      breathing: {
        'robot.attack': { min: 0.08, max: 0.3 }, // comes in over a moment
        'robot.decay': { min: 0.2, max: 0.6 }, // falls away
        'robot.sustain': { min: 0.1, max: 0.3 }, // to a low level
        'robot.release': { min: 1, max: 2 }, // and lingers after it is let go
        'robot.shapedAttack': { min: 0.08, max: 0.3, lit: 0.3 }, // a curved probe comes in as slowly
        'robot.shapedRelease': { min: 1, max: 2, lit: 0.3 }, // and lingers as long
      },
    },
  },
  distance: {
    keys: DISTANCE_BAND_KEYS,
    options: {
      near: {
        reverbSend: { min: 0, max: 0.1, lit: 0.3 },
        delaySend: { min: 0, max: 0.05, lit: 0.1 },
      },
      // Echoing: a call, and the call again.
      echoing: {
        delaySend: { min: 0.4, max: 0.7, lit: 1 }, // every probe sent deep into the delay
        reverbSend: { min: 0.05, max: 0.15, lit: 1 }, // only lightly into the reverb: repeats rather than wash
      },
      // Half-heard: near and far at once.
      halfHeard: {
        reverbSend: { min: 0.55, max: 0.85, lit: 0.5 }, // half the probes dry and present, half far off in the reverb
        delaySend: { min: 0.2, max: 0.4, lit: 0.5 }, // an echo on about half
      },
    },
  },
  voice: {
    keys: VOICE_BAND_KEYS,
    options: {
      glassy: {
        'robot.waveform': { weights: { sine: 4, square: 0.5, triangle: 4, sawtooth: 0.5, pulse: 1 } },
        'robot.filterFreq': { min: 5000, max: 9000 },
        'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0.1 },
        'robot.layerGain': { min: 0.2, max: 0.5, lit: 0.3 },
      },
      woody: {
        'robot.waveform': { weights: { sine: 1, square: 3, triangle: 4, sawtooth: 1, pulse: 1 } },
        'robot.filterFreq': { min: 1200, max: 3500 },
        'robot.layerGain': { min: 0.6, max: 1, lit: 0.7 },
      },
      hollow: {
        'robot.waveform': { weights: { sine: 0.5, square: 4, triangle: 0.5, sawtooth: 1, pulse: 4 } },
        'robot.filterFreq': { min: 1500, max: 5000 },
        'robot.accentFilterFreq': { min: 600, max: 2000, lit: 0.45 },
        'robot.accentFilterQ': { min: 6, max: 12 },
      },
      // Brassy: a brass section, loud and plain.
      brassy: {
        'robot.waveform': { weights: { sine: 0.5, square: 1, triangle: 0.5, sawtooth: 5, pulse: 1 } }, // leans to the sawtooth
        'robot.filterFreq': { min: 6000, max: 10000 }, // under a filter left open
        'robot.layerGain': { min: 0.8, max: 1.2, lit: 1 }, // partner layers full and always on
        'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0.05 }, // almost never one of the resonant ones
      },
      // Muted: a voice behind a wall.
      muted: {
        'robot.waveform': { weights: { sine: 4, square: 0.5, triangle: 3, sawtooth: 0, pulse: 0.5 } }, // the round waveforms
        'robot.filterFreq': { min: 500, max: 1200 }, // under a filter brought right down
        'robot.layerGain': { min: 0.2, max: 0.4, lit: 0.15 }, // partner layers quiet and rarely on
        'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0 }, // none is resonant
      },
      // Chiming: a bell.
      chiming: {
        'robot.waveform': { weights: { sine: 1, square: 0, triangle: 0, sawtooth: 0, pulse: 0 } }, // a pure fundamental
        'robot.filterFreq': { min: 6000, max: 12000 }, // under an open filter
        'robot.layerGain': { min: 0.9, max: 1.2, lit: 1 }, // partner layers ring loud above it and are always on
        'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0 }, // none is resonant
      },
    },
  },
  motion: {
    keys: MOTION_BAND_KEYS,
    options: {
      // Gliding: the slide heard clean.
      gliding: {
        'robot.portamento': { min: 0.2, max: 0.4, lit: 1 }, // every one glides into every note over a long slide
        'robot.lfoDetuneDepth': { min: 1, max: 10, lit: 0 }, // the layers hold still in pitch
        'robot.lfoGainDepth': { min: 1, max: 60, lit: 0 }, // and in loudness
        'robot.lfoBusDepth': { min: 1, max: 40, lit: 0 }, // the filter holds still
      },
      // Trembling: the tremor heard clean.
      trembling: {
        'robot.lfoDetuneDepth': { min: 4, max: 15, lit: 0.9 }, // the layers waver in pitch, deep enough to hear
        'robot.lfoGainDepth': { min: 20, max: 60, lit: 0.9 }, // and in loudness
        'robot.portamento': { min: 0.05, max: 0.2, lit: 0 }, // no probe slides
        'robot.lfoBusDepth': { min: 1, max: 40, lit: 0 }, // and no filter sweeps
      },
      // Sweeping: the sweep the only motion.
      sweeping: {
        'robot.lfoBusDepth': { min: 30, max: 70, lit: 1 }, // a deep filter sweep rolls through every probe
        'robot.portamento': { min: 0.05, max: 0.2, lit: 0 }, // no probe slides
        'robot.lfoDetuneDepth': { min: 1, max: 10, lit: 0 }, // the layers hold still in pitch
        'robot.lfoGainDepth': { min: 1, max: 60, lit: 0 }, // and in loudness
      },
    },
  },
  performance: {
    keys: PERFORMANCE_BAND_KEYS,
    options: {
      // Steady: played straight.
      steady: {
        'robot.dynamics': { min: 0, max: 15 }, // every note the same weight
        'robot.accents': { min: 0, max: 5 }, // none is marked
        'robot.rests': { min: 0, max: 8 }, // almost none is cut short
      },
      // Dramatic: acted.
      dramatic: {
        'robot.dynamics': { min: 80, max: 100 }, // played loud and soft
        'robot.accents': { min: 75, max: 100 }, // nearly every note marked, the hardest unlocked
        'robot.rests': { min: 15, max: 30 }, // now and then a note cut short for effect
      },
      // Halting: broken off, hesitant.
      halting: {
        'robot.rests': { min: 65, max: 95 }, // most notes cut short, the gaps deep
        'robot.dynamics': { min: 30, max: 50 }, // the weight varies a little
        'robot.accents': { min: 10, max: 25 }, // the mild marks only
      },
    },
  },
};

// ========================================
// FUNCTIONS
// ========================================

/** A family's picks in canonical order: its own option ids, in ASPECT_IDS_BY_FAMILY order (assumption 9). */
export function pickOrderOf<F extends AspectFamilyId>(family: F): AspectIdOf<F>[] {
  return [...ASPECT_IDS_BY_FAMILY[family]];
}

/** Whether `id` is one of `family`'s options - the membership a family-keyed record's readers check on untrusted input,
 *  where the type cannot vouch for the id. */
export function isAspectOf<F extends AspectFamilyId>(family: F, id: string): id is AspectIdOf<F> {
  return (ASPECT_IDS_BY_FAMILY[family] as readonly string[]).includes(id);
}

/** A pick list as the store, the payload and the link carry it (assumptions 9, 11): sorted into the family's canonical
 *  option order, deduped, unknown ids dropped - so the same set always reads and encodes one way. Takes any strings, so
 *  it is also where an untrusted list becomes the family's ids. A new array. */
export function canonicalPicks<F extends AspectFamilyId>(family: F, picks: readonly string[]): AspectIdOf<F>[] {
  const wanted = new Set<string>(picks);
  return pickOrderOf(family).filter((pick) => wanted.has(pick));
}

/** Every family's list canonical, with empty and unknown families dropped: one JSON shape for one set of picks, so a
 *  payload built from the store compares equal for equal worlds (Keep's dirty check, assumption 14) and a world with
 *  nothing picked — every robot as theme — is always `{}`. Each family's list is written by canonicalInto, typed by
 *  that family. */
export function canonicalAspects(aspects: Partial<Record<AspectFamilyId, readonly string[]>>): FamilyPicks {
  const out: FamilyPicks = {};
  for (const family of ASPECT_FAMILY_IDS) canonicalInto(out, family, aspects[family]);
  return out;
}

/** One family's list into `out`, canonical, when any pick survives. Generic in the family, with `out` mapped over that
 *  same key, so TypeScript sees the list written is that family's ids: the write a per-family type takes without a cast
 *  (a plain FamilyPicks would make `out[family]` every family's ids at once). */
function canonicalInto<F extends AspectFamilyId>(
  out: { [K in F]?: AspectIdOf<K>[] },
  family: F,
  picks: readonly string[] | undefined,
): void {
  if (!picks) return;
  const canonical = canonicalPicks(family, picks);
  if (canonical.length > 0) out[family] = canonical;
}
