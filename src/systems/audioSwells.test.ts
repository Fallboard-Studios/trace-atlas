// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NoiseFunction2D } from 'simplex-noise';

vi.mock('@/engine/beatClock', () => ({
  scheduleRepeat: vi.fn(() => 'schedule-id'),
  cancelSchedule: vi.fn(),
  getCurrentMeasurePrecise: vi.fn(() => 0),
}));

// Wraps the REAL getAttenuationStyleNoiseMap by default (real, deterministic
// simplex noise — "prefer real implementations over mocks") so tests that
// don't care about forcing a specific draw still get genuine seeded
// determinism. Individual tests force a single draw via
// `.mockReturnValueOnce(...)`, which self-consumes and falls back to the
// real implementation on the next call — no manual restore needed.
vi.mock('@/utils/noiseMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/noiseMaps')>();
  return { ...actual, getAttenuationStyleNoiseMap: vi.fn(actual.getAttenuationStyleNoiseMap) };
});

import {
  startAudioSwells,
  stopAudioSwells,
  tickAudioSwells,
  getActiveSwellSnapshot,
  pickSwellPeakDelta,
  frequencyToPerTickChance,
  cancelSwellForGlobalField,
  cancelSwellForRobotAttribute,
  isGlobalTargetSwelling,
  isRobotAttributeSwelling,
  MAX_CONCURRENT_SWELLS_PER_POOL,
  VOLUME_SWELL_DOWNWARD_FLOOR,
  SWELL_COMPANY_CHANCE,
  DETUNE_SWELL_MAX_SWING_FRACTION,
  HPF_SWELL_UPWARD_CEILING_HZ,
  LPF_SWELL_DOWNWARD_FLOOR_HZ,
} from './audioSwells';
import * as robotOptionsActions from './robotOptionsActions';
import { scheduleRepeat, cancelSchedule } from '@/engine/beatClock';
import { getAttenuationStyleNoiseMap } from '@/utils/noiseMaps';
import { precomputeDataX } from '@/utils/getSeededVal';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { AudioEngine } from '@/engine/AudioEngine';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';
import type { Company } from '@/types/Company';

// ========================================
// TEST HELPERS
// ========================================

/** Maps EVERY getSeededVal draw (any dataId/offset) to a fixed fraction of
 *  whatever [min, max] that particular call passes: raw -1 -> min, 0 ->
 *  midpoint, 1 -> max. Matches spawnSystem.test.ts's deterministicNoiseMap
 *  convention, generalized to any fixed raw value. */
function constantNoiseMap(raw: number): NoiseFunction2D {
  return () => raw;
}
const ALWAYS_MIN = constantNoiseMap(-1);
const ALWAYS_MID = constantNoiseMap(0);
const ALWAYS_MAX = constantNoiseMap(1);

/**
 * Precise per-draw control: maps each named dataId to its own fixed raw
 * value (getSeededVal's `noiseMap(x, offset)` call always resolves `x` from
 * `precomputeDataX(dataId)`, so keying a lookup by that same x lets each
 * dataId in `mapping` get an independent, exact draw regardless of shared
 * offset). Any dataId not listed falls back to `fallback` (default 0, the
 * range's own midpoint fraction) — needed when a single tick's several
 * draws (trigger, company chance/pick/attribute/direction, per-member peak)
 * must diverge from each other, which a single flat constantNoiseMap can't do.
 */
function noiseMapForDataIds(mapping: Record<string, number>, fallback = 0): NoiseFunction2D {
  const byX = new Map<number, number>();
  for (const [dataId, raw] of Object.entries(mapping)) {
    byX.set(precomputeDataX(dataId), raw);
  }
  return (x: number) => byX.get(x) ?? fallback;
}

const LOCALE_ID = 'pelagos-default';

/** Mirrors robotOptionsActions.test.ts's own makeRobot fixture. Defaults to a
 *  single audible layer (layer0/Baseline only) — layer1/layer2 absent, so
 *  every layer1.* / layer2.* attribute is ineligible by construction (no
 *  parent OscillatorLayer present at all), matching a real 1-layer robot. */
function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    name: 'Test Robot',
    state: 'idle',
    position: { x: 0, y: 0 },
    destination: null,
    direction: 'right',
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
      filterFreq: 0,
      waveform: 'sine',
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
    },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 100,
    rhythmicDensity: 50,
    rhythmicMotifLength: { active: true, value: 8 },
    noteVariance: { active: false, value: 0 },
    ...overrides,
  } as Robot;
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return { id: 'c1', name: 'Test Company', color: '#4f6d7a', robotIds: [], ...overrides };
}

beforeEach(() => {
  vi.mocked(getAttenuationStyleNoiseMap).mockClear();
  stopAudioSwells(); // idempotent — clears any leftover activeSwells + subscription state
  vi.mocked(scheduleRepeat).mockClear();
  vi.mocked(cancelSchedule).mockClear();
  // pingVarianceAutomation: 1 keeps every pre-existing magnitude assertion in
  // this file meaningful once Task 3 wires scaleSwellPeakByAutomation in —
  // those tests assert an UNSCALED peak; automation-scaling itself gets its
  // own dedicated describe block below, which sets a different value per test.
  // swellFrequency: 4 gives a per-tick trigger chance of 4/16 = 0.25
  // (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3) — close enough to
  // the old fixed SWELL_TRIGGER_CHANCE (0.28) that every existing
  // ALWAYS_MIN(succeeds)/ALWAYS_MID(fails) fixture below still behaves
  // identically; individual trigger-mechanism tests override this explicitly.
  // swellDuration: 15 — chosen so that under ALWAYS_MIN (every draw within a
  // tick, including pickSwellSplit's own ratio draw, forced to its range
  // minimum, SWELL_SPLIT_MIN_FRACTION = 0.2) risingMeasures comes out to
  // exactly 3, matching every pre-existing "rising 3" fixture value this file
  // already relies on; fallingMeasures is then 15 - 3 = 12 (was 3 under the
  // old independent-draw mechanism — every completion tick below that used to
  // read "+ 3" for the falling leg now reads "+ 12").
  useAudioStore.setState({ globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS }, pingVarianceAutomation: 1, swellFrequency: 4, swellDuration: 15 });
  useLocaleStore.getState().setLocaleData(LOCALE_ID, { robots: [], companies: [] } as unknown as Partial<Locale>);
  // Real AudioEngine voice calls need a live Tone context this jsdom test
  // environment doesn't have — no-op them, matching robotOptionsActions.test.ts's
  // own established convention for these exact three methods.
  vi.spyOn(AudioEngine, 'updateRobotMasterVolume').mockImplementation(() => {});
  vi.spyOn(AudioEngine, 'updateVoiceLayerParams').mockImplementation(() => {});
  vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ========================================
// TESTS
// ========================================

describe('startAudioSwells / stopAudioSwells', () => {
  it('registers exactly one 16n schedule (smooth, sub-measure-precision ticking, not once-per-measure)', () => {
    startAudioSwells(LOCALE_ID);
    expect(scheduleRepeat).toHaveBeenCalledTimes(1);
    expect(scheduleRepeat).toHaveBeenCalledWith('16n', expect.any(Function));
  });

  it('is idempotent — a second start call does not double-schedule', () => {
    startAudioSwells(LOCALE_ID);
    startAudioSwells(LOCALE_ID);
    expect(scheduleRepeat).toHaveBeenCalledTimes(1);
  });

  it('stop is idempotent — a second stop call does not throw or cancel twice', () => {
    vi.mocked(scheduleRepeat).mockReturnValueOnce('the-schedule-id');
    startAudioSwells(LOCALE_ID);
    stopAudioSwells();
    expect(cancelSchedule).toHaveBeenCalledWith('the-schedule-id');
    expect(cancelSchedule).toHaveBeenCalledTimes(1);
    expect(() => stopAudioSwells()).not.toThrow();
    expect(cancelSchedule).toHaveBeenCalledTimes(1);
  });

  it('clears all in-flight swells — a fresh start begins from zero active swells', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);
    expect(getActiveSwellSnapshot('global').length).toBeGreaterThan(0);

    stopAudioSwells();
    expect(getActiveSwellSnapshot('global')).toEqual([]);
  });

  it('resets the once-per-measure trigger gate — a fresh session can roll again at the same measure value', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);
    expect(getActiveSwellSnapshot('global')).toHaveLength(1);

    stopAudioSwells();

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // same measure value as before stop — must still roll, not be gated as "already seen"
    expect(getActiveSwellSnapshot('global')).toHaveLength(1);
  });
});

describe('smooth sub-measure advance (16n ticking)', () => {
  it('interpolates continuously within a single measure from a fractional measure input, not just at whole-measure boundaries', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // eq3.low: base 0, peak 12, rising 3, falling 12

    tickAudioSwells(LOCALE_ID, 0.5); // half a measure into the 3-measure rise
    expect(useAudioStore.getState().globalAudio.eq3.low).toBeCloseTo(12 * (0.5 / 3));

    tickAudioSwells(LOCALE_ID, 0.9375); // 15/16 of a measure in (16th-note resolution)
    expect(useAudioStore.getState().globalAudio.eq3.low).toBeCloseTo(12 * (0.9375 / 3));
  });

  it('rolls the trigger/selection on every tick, not just once per whole measure (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3 — replaces the old once-per-whole-measure gate)', () => {
    for (let i = 0; i < 16; i++) {
      vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
      tickAudioSwells(LOCALE_ID, i / 16); // all 16 ticks land within measure 0
    }
    // Every eligible global target gets picked in turn, one per tick, well
    // before all 16 ticks are consumed — proves each tick rolled and picked
    // independently rather than only the first one taking effect.
    expect(getActiveSwellSnapshot('global').length).toBeGreaterThan(1);
  });

  it('a non-first tick within a whole measure can trigger a new swell — direct regression guard that the once-per-measure gate is gone', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MAX); // measure 0's own tick: draw 1, fails (>= chance)
    tickAudioSwells(LOCALE_ID, 0);
    expect(getActiveSwellSnapshot('global')).toEqual([]);

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN); // still measure 0, a later tick: draw 0, succeeds
    tickAudioSwells(LOCALE_ID, 0.5);
    expect(getActiveSwellSnapshot('global')).toHaveLength(1);
  });
});

describe('swellFrequency gate (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3 — takes over the on/off role pingVarianceAutomation used to have)', () => {
  it('starts no new swell (global or robot) at frequency 0, even when the trigger draw would otherwise succeed', () => {
    useAudioStore.setState({ swellFrequency: 0 });
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);

    tickAudioSwells(LOCALE_ID, 0);

    expect(getActiveSwellSnapshot('global')).toEqual([]);
    expect(getActiveSwellSnapshot('robot')).toEqual([]);
  });

  it('resumes starting new swells once frequency is nonzero again', () => {
    useAudioStore.setState({ swellFrequency: 0 });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);
    expect(getActiveSwellSnapshot('global')).toEqual([]);

    useAudioStore.setState({ swellFrequency: 4 });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 1);

    expect(getActiveSwellSnapshot('global')).toHaveLength(1);
  });

  it('Intensity (pingVarianceAutomation) no longer gates new swells on its own — nonzero frequency at Intensity\'s new floor (0.01) still starts swells', () => {
    useAudioStore.setState({ pingVarianceAutomation: 0.01, swellFrequency: 4 });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);

    tickAudioSwells(LOCALE_ID, 0);

    expect(getActiveSwellSnapshot('global')).toHaveLength(1);
  });

  it('no longer reads audioSwellsEnabled anywhere in this module (source-scan regression guard) — the field itself was deleted from AudioStore entirely in docs/tasks/PING-VARIANCE-AUTOMATION.md Task 7', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioSwells.ts'), 'utf-8');
    expect(source).not.toMatch(/audioSwellsEnabled/);
  });

  it('no longer reads SWELL_TRIGGER_CHANCE or lastRolledMeasure anywhere in this module (source-scan regression guard, docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §3)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioSwells.ts'), 'utf-8');
    expect(source).not.toMatch(/SWELL_TRIGGER_CHANCE/);
    expect(source).not.toMatch(/lastRolledMeasure/);
  });

  it('no longer uses the identifier "automation" anywhere in this module outside a comment naming the superseded PING-VARIANCE-AUTOMATION.md spec (source-scan regression guard — magnitude scaling is now parameter "intensity", docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioSwells.ts'), 'utf-8');
    const codeLines = source
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)); // drop comment-only lines
    const codeWithoutComments = codeLines.join('\n');
    expect(codeWithoutComments).not.toMatch(/\bautomation\b/);
  });
});

describe('frequencyToPerTickChance (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3)', () => {
  it('divides frequency by the 16-tick-per-measure cadence', () => {
    expect(frequencyToPerTickChance(4)).toBeCloseTo(0.25);
    expect(frequencyToPerTickChance(8)).toBeCloseTo(0.5);
  });

  it('clamps to 1 once frequency reaches the 16-tick cadence — 16 and 24 are behaviorally identical', () => {
    expect(frequencyToPerTickChance(16)).toBe(1);
    expect(frequencyToPerTickChance(24)).toBe(1);
  });

  it('returns 0 at frequency 0', () => {
    expect(frequencyToPerTickChance(0)).toBe(0);
  });
});

describe('pingVarianceAutomation magnitude scaling (Task 3)', () => {
  it("scales a newly-created global swell's peakDelta by the automation fraction, applied after the default rule", () => {
    useAudioStore.setState({ pingVarianceAutomation: 0.5 });
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.global': -1,
      'audioSwell.target.global': -1, // index 0 -> eq3.low
      // eq3.low's default (0) sits exactly at its own [-12,12] midpoint, so
      // direction is the seeded coin-flip tie-break, not the plain
      // above/below-midpoint rule — force it explicitly to "up".
      'audioSwell.peak.eq3.low.tiebreak': -1,
      'audioSwell.peak.eq3.low': 1, // true edge -> unscaled peak 12 (base 0)
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(swell.peakDelta).toBeCloseTo(6); // half of the unscaled 12
  });

  it('scales strictly AFTER the HPF ceiling clamp, not before — proves clamp-then-scale ordering, not scale-then-clamp', () => {
    // Unscaled (automation 1) this exact setup lands the peak at exactly the
    // 4000Hz ceiling (see the "global pool — HPF/LPF frequency clamps"
    // describe block above). Clamp-then-scale: (4000 - 20) * 0.5 + 20 = 2010.
    // Scale-then-clamp would instead re-clamp an already-halved delta back up
    // near the same 4000 ceiling — a different, larger number. Asserting the
    // smaller value is what tells the two orderings apart.
    useAudioStore.setState({ pingVarianceAutomation: 0.5 });
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.global': -1,
      'audioSwell.target.global': 0.2, // index 5 of 9 -> 'hpf.frequency'
      'audioSwell.peak.hpf.frequency': 1, // force the largest unclamped draw
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'hpf.frequency')!;
    const peak = swell.baseValue! + swell.peakDelta!;
    expect(peak).toBeCloseTo(2010);
    expect(peak).toBeLessThan(HPF_SWELL_UPWARD_CEILING_HZ); // sanity: definitely not still pinned to the ceiling
  });

  it("scales a single-robot swell's peakDelta the same way, strictly after Volume's downward clamp", () => {
    // Unscaled (automation 1), this exact setup clamps the peak to exactly
    // 0.5 (see "robot pool — Volume's downward-swell clamp" above):
    // peakDelta -0.4. Clamp-then-scale: -0.4 * 0.5 = -0.2 -> peak 0.7.
    useAudioStore.setState({ pingVarianceAutomation: 0.5 });
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ masterVolume: 0.9 }));
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('robot').find((s) => s.robotAttribute === 'volume')!;
    const member = swell.members![0];
    expect(member.peakDelta).toBeCloseTo(-0.2);
    expect(member.baseValue + member.peakDelta).toBeCloseTo(0.7);
  });

  it("scales each company-wide member's peakDelta independently by the same automation fraction, leaving direction/timing shared and baseValue untouched", () => {
    function setupCompany() {
      stopAudioSwells();
      useLocaleStore.getState().setLocaleData(LOCALE_ID, { robots: [], companies: [] } as unknown as Partial<Locale>);
      useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r1', masterVolume: 0.2 }));
      useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r2', masterVolume: 0.4 }));
      useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r3', masterVolume: 0.6 }));
      useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1', 'r2', 'r3'] }));
    }

    setupCompany();
    useAudioStore.setState({ pingVarianceAutomation: 1 });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);
    const unscaledSwell = getActiveSwellSnapshot('robot')[0];
    const unscaledMembers = unscaledSwell.members!;

    setupCompany();
    useAudioStore.setState({ pingVarianceAutomation: 0.5 });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);
    const scaledSwell = getActiveSwellSnapshot('robot')[0];
    const scaledMembers = scaledSwell.members!;

    expect(scaledSwell.risingMeasures).toBe(unscaledSwell.risingMeasures);
    expect(scaledSwell.fallingMeasures).toBe(unscaledSwell.fallingMeasures);
    for (const scaledMember of scaledMembers) {
      const unscaledMember = unscaledMembers.find((m) => m.robotId === scaledMember.robotId)!;
      expect(scaledMember.baseValue).toBe(unscaledMember.baseValue);
      expect(scaledMember.peakDelta).toBeCloseTo(unscaledMember.peakDelta * 0.5);
    }
  });
});

describe('swellFrequency forced return at 0 (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3 — re-keyed from pingVarianceAutomation, Task 4 of PING-VARIANCE-AUTOMATION.md)', () => {
  it('forces a rising global swell into its falling phase with no jump, then lands exactly on baseValue after its own original fallingMeasures', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // eq3.low: base 0, peak 12, rising 3, falling 12

    tickAudioSwells(LOCALE_ID, 1); // partway into rising
    const valueBeforeForcing = useAudioStore.getState().globalAudio.eq3.low;
    expect(valueBeforeForcing).toBeCloseTo(4); // 12 * (1/3)

    useAudioStore.setState({ swellFrequency: 0 });

    tickAudioSwells(LOCALE_ID, 1); // the forcing tick itself — same measure, frequency now 0
    expect(useAudioStore.getState().globalAudio.eq3.low).toBeCloseTo(valueBeforeForcing); // no audible jump
    const swell = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(swell.phase).toBe('falling');

    tickAudioSwells(LOCALE_ID, 1 + 12); // rides its own original fallingMeasures (12) back to base
    expect(useAudioStore.getState().globalAudio.eq3.low).toBe(0);
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.low')).toBe(false);
  });

  it('forces a rising single-robot swell the same way', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ masterVolume: 0.1 })); // up: floor 0.6, peak 0.6 via ALWAYS_MIN
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // base 0.1, peak 0.6 (peakDelta 0.5), rising 3, falling 12

    tickAudioSwells(LOCALE_ID, 1);
    const valueBeforeForcing = useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume;
    expect(valueBeforeForcing).toBeCloseTo(0.1 + 0.5 * (1 / 3));

    useAudioStore.setState({ swellFrequency: 0 });

    tickAudioSwells(LOCALE_ID, 1); // forcing tick
    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume).toBeCloseTo(valueBeforeForcing);
    const swell = getActiveSwellSnapshot('robot').find((s) => s.robotAttribute === 'volume')!;
    expect(swell.phase).toBe('falling');

    tickAudioSwells(LOCALE_ID, 1 + 12);
    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume).toBe(0.1);
    expect(getActiveSwellSnapshot('robot').some((s) => s.robotAttribute === 'volume')).toBe(false);
  });

  it('forces every member of a company-wide swell together, sharing phase/timing, each landing exactly on its own baseValue', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r1', masterVolume: 0.1 }));
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r2', masterVolume: 0.9 }));
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1', 'r2'] }));

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // company-wide volume swell, rising 3 / falling 12

    tickAudioSwells(LOCALE_ID, 1); // partway into rising
    const r1Before = useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume;
    const r2Before = useLocaleStore.getState().getRobotById(LOCALE_ID, 'r2')!.masterVolume;

    useAudioStore.setState({ swellFrequency: 0 });
    tickAudioSwells(LOCALE_ID, 1); // forcing tick — both members convert together

    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume).toBeCloseTo(r1Before);
    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r2')!.masterVolume).toBeCloseTo(r2Before);
    const swell = getActiveSwellSnapshot('robot').find((s) => s.companyId === 'c1')!;
    expect(swell.phase).toBe('falling');

    tickAudioSwells(LOCALE_ID, 1 + 12);
    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume).toBe(0.1);
    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r2')!.masterVolume).toBe(0.9);
    expect(getActiveSwellSnapshot('robot')).toEqual([]);
  });

  it('leaves a swell already in its falling phase untouched when frequency drops to 0 — no re-forcing', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // eq3.low creates, rising 3 / falling 12

    tickAudioSwells(LOCALE_ID, 3); // falling phase's first tick, naturally (frequency still nonzero)
    const swellBefore = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(swellBefore.phase).toBe('falling');
    const { peakDelta: peakDeltaBefore, startMeasure: startMeasureBefore } = swellBefore;

    useAudioStore.setState({ swellFrequency: 0 });
    tickAudioSwells(LOCALE_ID, 4); // still falling, frequency now 0

    const swellAfter = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(swellAfter.peakDelta).toBe(peakDeltaBefore);
    expect(swellAfter.startMeasure).toBe(startMeasureBefore);
    expect(swellAfter.phase).toBe('falling');
  });

  it('does not re-derive peakDelta on an already-forced (now-falling) swell across repeated ticks at frequency 0', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);
    tickAudioSwells(LOCALE_ID, 1);
    useAudioStore.setState({ swellFrequency: 0 });
    tickAudioSwells(LOCALE_ID, 1); // forcing tick
    const { peakDelta, startMeasure } = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;

    tickAudioSwells(LOCALE_ID, 1.5);
    tickAudioSwells(LOCALE_ID, 2);

    const swellLater = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(swellLater.peakDelta).toBe(peakDelta);
    expect(swellLater.startMeasure).toBe(startMeasure);
  });

  it('does not interrupt, reverse, or resume a forced return when frequency goes back to nonzero before it completes', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);
    tickAudioSwells(LOCALE_ID, 1);
    useAudioStore.setState({ swellFrequency: 0 });
    tickAudioSwells(LOCALE_ID, 1); // forced into falling, riding 3 measures back to base
    const forced = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    const { peakDelta, startMeasure, risingMeasures, fallingMeasures } = forced;

    useAudioStore.setState({ swellFrequency: 4 }); // back to nonzero before the forced fall completes
    tickAudioSwells(LOCALE_ID, 2); // still mid forced-fall

    const stillForced = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(stillForced.phase).toBe('falling');
    expect(stillForced.peakDelta).toBe(peakDelta);
    expect(stillForced.startMeasure).toBe(startMeasure);
    expect(stillForced.risingMeasures).toBe(risingMeasures);
    expect(stillForced.fallingMeasures).toBe(fallingMeasures);

    tickAudioSwells(LOCALE_ID, 1 + fallingMeasures); // completes on its forced schedule, not a fresh rise
    expect(useAudioStore.getState().globalAudio.eq3.low).toBe(0);
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.low')).toBe(false);
  });
});

describe('trigger gating (frequencyToPerTickChance, swellFrequency: 4 -> 0.25 chance)', () => {
  it('does not start a swell when the seeded trigger draw lands well above the trigger chance', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MID); // draw = 0.5
    tickAudioSwells(LOCALE_ID, 10);
    expect(getActiveSwellSnapshot('global')).toEqual([]);
  });

  it('starts a swell when the seeded trigger draw lands at the bottom of the range', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN); // draw = 0
    tickAudioSwells(LOCALE_ID, 10);
    expect(getActiveSwellSnapshot('global')).toHaveLength(1);
  });

  it('a higher swellFrequency raises the per-tick trigger chance — a draw that fails at frequency 4 succeeds at frequency 16 (chance 1)', () => {
    useAudioStore.setState({ swellFrequency: 16 });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MID); // draw = 0.5, fails at chance 0.25, succeeds at chance 1
    tickAudioSwells(LOCALE_ID, 10);
    expect(getActiveSwellSnapshot('global')).toHaveLength(1);
  });
});

describe('eligibility', () => {
  it('never picks delay.wet while its own wet sits at 0 (off-equivalent) — the very same draw picks it once wet is nonzero again', () => {
    // raw 0.6 -> rawIndex (0.6+1)/2*9 = 7.2 -> floor 7 -> the 9-item list's
    // index 7 is delay.wet. Once delay.wet is excluded (wet: 0), the eligible
    // list shrinks to 8 and the identical raw draw recomputes to a different
    // index entirely — proving delay.wet itself was skipped, not coincidence.
    const pickDelayNoiseMap = noiseMapForDataIds({ 'audioSwell.trigger.global': -1, 'audioSwell.target.global': 0.6 });

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(pickDelayNoiseMap);
    tickAudioSwells(LOCALE_ID, 0);
    expect(getActiveSwellSnapshot('global').map((s) => s.globalTarget)).toContain('delay.wet');

    stopAudioSwells();
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, delay: { ...s.globalAudio.delay, wet: 0 } } }));

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(pickDelayNoiseMap);
    tickAudioSwells(LOCALE_ID, 0);
    expect(getActiveSwellSnapshot('global').map((s) => s.globalTarget)).not.toContain('delay.wet');
  });

  it('excludes a target already mid-swell from being picked again — a second forced trigger picks the next eligible target', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 1); // picks eq3.low (index 0, everything eligible)
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 2); // eq3.low now excluded -> picks eq3.mid
    const targets = getActiveSwellSnapshot('global').map((s) => s.globalTarget).sort();
    expect(targets).toEqual(['eq3.low', 'eq3.mid']);
  });
});

describe('concurrency cap', () => {
  it('enforces the 5-cap — a 6th global swell does not start while 5 are already active', () => {
    for (let i = 0; i < 5; i++) {
      vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
      tickAudioSwells(LOCALE_ID, i);
    }
    expect(getActiveSwellSnapshot('global')).toHaveLength(MAX_CONCURRENT_SWELLS_PER_POOL);

    // measure 5 — still well inside every one of the 5 swells' own window (each
    // totals rising(3)+falling(3)=6 measures, started at measures 0-4, so none
    // completes before measure 6); a measure far enough out that they've all
    // auto-completed and freed the cap would prove nothing about the cap itself.
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 5);
    expect(getActiveSwellSnapshot('global')).toHaveLength(MAX_CONCURRENT_SWELLS_PER_POOL);
  });
});

describe('ramp lifecycle', () => {
  it('has phase "rising" then "falling" only — the tick right after risingMeasures elapses is already falling, no hold tick', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // eq3.low: base 0, peak 12, rising 3, falling 12 (all draws forced to their floor)

    let snap = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(snap.phase).toBe('rising');

    tickAudioSwells(LOCALE_ID, 2); // elapsed 2 < rising 3 -> still rising
    snap = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(snap.phase).toBe('rising');

    tickAudioSwells(LOCALE_ID, 3); // elapsed 3 >= rising 3 -> already falling
    snap = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    expect(snap.phase).toBe('falling');
  });

  it('interpolates during rising/falling and returns to exactly baseValue on completion, removing the swell', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // eq3.low: base 0, peak 12, rising 3, falling 12

    tickAudioSwells(LOCALE_ID, 3); // falling phase's first tick — progress 0 -> value === peak
    expect(useAudioStore.getState().globalAudio.eq3.low).toBeCloseTo(12);
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.low')).toBe(true);

    tickAudioSwells(LOCALE_ID, 15); // falling completes
    expect(useAudioStore.getState().globalAudio.eq3.low).toBe(0);
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.low')).toBe(false);
  });

  it('cancels a swell immediately and snaps back to base when its own wet drops to 0 mid-swell', () => {
    const pickReverbNoiseMap = noiseMapForDataIds({ 'audioSwell.trigger.global': -1, 'audioSwell.target.global': 1 }); // clamped to the last eligible index -> reverb.wet
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(pickReverbNoiseMap);
    tickAudioSwells(LOCALE_ID, 0); // starts reverb.wet
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'reverb.wet')).toBe(true);

    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, reverb: { ...s.globalAudio.reverb, wet: 0 } } }));

    tickAudioSwells(LOCALE_ID, 1); // mid-swell, now off
    // Cancellation snaps back to the swell's own CAPTURED base value (0.3,
    // the default reverb.wet at creation time) — not the manually-forced 0
    // that triggered the cancellation in the first place.
    expect(useAudioStore.getState().globalAudio.reverb.wet).toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb.wet);
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'reverb.wet')).toBe(false);
  });

  it('writes every value via useAudioStore.getState().setGlobalAudio, never a bare AudioEngine call', () => {
    const spy = vi.spyOn(useAudioStore.getState(), 'setGlobalAudio');
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // creation tick — no write yet
    tickAudioSwells(LOCALE_ID, 2); // advance tick — writes the interpolated value

    expect(spy).toHaveBeenCalledWith('eq3', expect.objectContaining({ low: expect.any(Number) }));
  });
});

describe('Duration — pickSwellSplit (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.4, full pipeline, real seeded noise)', () => {
  it('risingMeasures + fallingMeasures always equals swellDuration (within the 1-measure-per-phase rounding floor), for every swell type including delay.wet/reverb.wet', () => {
    useAudioStore.setState({ swellDuration: 10 });
    const samples: { target: string; rising: number; falling: number }[] = [];
    for (let measure = 0; measure < 300 && samples.length < MAX_CONCURRENT_SWELLS_PER_POOL; measure++) {
      tickAudioSwells(LOCALE_ID, measure);
      for (const swell of getActiveSwellSnapshot('global')) {
        if (!samples.some((s) => s.target === swell.globalTarget)) {
          samples.push({ target: swell.globalTarget!, rising: swell.risingMeasures, falling: swell.fallingMeasures });
        }
      }
    }

    expect(samples.length).toBeGreaterThan(0);
    for (const { target, rising, falling } of samples) {
      expect(rising, `${target} rising`).toBeGreaterThanOrEqual(1);
      expect(falling, `${target} falling`).toBeGreaterThanOrEqual(1);
      expect(rising + falling, `${target} total`).toBe(10);
    }
  });

  it('the rising/falling split varies across swells rather than always landing 50/50, but never exceeds the documented [0.2, 0.8] bound either direction', () => {
    useAudioStore.setState({ swellDuration: 20 }); // large enough that rounding noise doesn't obscure the bound
    const ratios: number[] = [];
    for (let measure = 0; measure < 300 && ratios.length < MAX_CONCURRENT_SWELLS_PER_POOL; measure++) {
      tickAudioSwells(LOCALE_ID, measure);
      for (const swell of getActiveSwellSnapshot('global')) {
        const total = swell.risingMeasures + swell.fallingMeasures;
        if (!ratios.includes(swell.risingMeasures / total)) ratios.push(swell.risingMeasures / total);
      }
    }

    expect(ratios.length).toBeGreaterThan(1); // proves real variety, not one fixed ratio every time
    expect(ratios.some((r) => Math.abs(r - 0.5) > 0.01)).toBe(true); // not always symmetric
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThanOrEqual(0.2 - 0.05); // small tolerance for rounding at the edge
      expect(ratio).toBeLessThanOrEqual(0.8 + 0.05);
    }
  });

  it('applies the exact same total to delay.wet/reverb.wet as every other target — no more 2x mix-target treatment', () => {
    const pickReverbNoiseMap = noiseMapForDataIds({ 'audioSwell.trigger.global': -1, 'audioSwell.target.global': 1 }); // clamped to the last eligible index -> reverb.wet
    useAudioStore.setState({ swellDuration: 9 });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(pickReverbNoiseMap);
    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'reverb.wet')!;
    expect(swell.risingMeasures + swell.fallingMeasures).toBe(9);
  });

  it('pickPhaseMeasures, DEFAULT_SWELL_DURATION_RANGE, MIX_SWELL_DURATION_RANGE, MIX_SWELL_TARGETS no longer exist anywhere in this module (source-scan regression guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioSwells.ts'), 'utf-8');
    expect(source).not.toMatch(/pickPhaseMeasures/);
    expect(source).not.toMatch(/DEFAULT_SWELL_DURATION_RANGE/);
    expect(source).not.toMatch(/MIX_SWELL_DURATION_RANGE/);
    expect(source).not.toMatch(/MIX_SWELL_TARGETS/);
  });
});

describe('determinism and zero Math.random()', () => {
  it('never calls Math.random() anywhere in this module (source-scan regression guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioSwells.ts'), 'utf-8');
    expect(source).not.toMatch(/Math\.random/);
  });

  it('two identical ticks (same store state, same measure, real seeded noise) produce identical trigger/target/direction/duration decisions', () => {
    const runOnce = () => {
      stopAudioSwells();
      useAudioStore.setState({ globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS } });
      tickAudioSwells(LOCALE_ID, 17);
      return { snapshot: getActiveSwellSnapshot('global'), audio: { ...useAudioStore.getState().globalAudio } };
    };

    const first = runOnce();
    const second = runOnce();

    expect(second.snapshot).toEqual(first.snapshot);
    expect(second.audio).toEqual(first.audio);
  });
});

describe('pickSwellPeakDelta — direction & magnitude rule (spec §1.5)', () => {
  it('swells up, landing in [83%, 100%] of range, for a field at 33% of its range', () => {
    const range = { min: 0, max: 100 };
    const current = 33;
    const delta = pickSwellPeakDelta(ALWAYS_MIN, 'test.key', 0, range, current);
    const peak = current + delta;
    expect(peak).toBeGreaterThanOrEqual(83);
    expect(peak).toBeLessThanOrEqual(100);
  });

  it('swells down, landing in [0%, 20%] of range, for a field at 70% of its range', () => {
    const range = { min: 0, max: 100 };
    const current = 70;
    const delta = pickSwellPeakDelta(ALWAYS_MIN, 'test.key', 0, range, current);
    const peak = current + delta;
    expect(peak).toBeGreaterThanOrEqual(0);
    expect(peak).toBeLessThanOrEqual(20);
  });

  it('can land either direction when exactly at the midpoint (seeded coin-flip tie-break)', () => {
    const range = { min: 0, max: 100 };
    const current = 50;
    const upDelta = pickSwellPeakDelta(ALWAYS_MIN, 'test.key', 0, range, current);
    const downDelta = pickSwellPeakDelta(ALWAYS_MAX, 'test.key', 0, range, current);
    expect(current + upDelta).toBeGreaterThan(current);
    expect(current + downDelta).toBeLessThan(current);
  });

  it('never produces a peak outside the field\'s own [min, max] range', () => {
    const range = { min: -50, max: 50 };
    for (const current of [-50, -25, 0, 25, 50]) {
      for (const noiseMap of [ALWAYS_MIN, ALWAYS_MID, ALWAYS_MAX]) {
        const delta = pickSwellPeakDelta(noiseMap, 'test.key', 0, range, current);
        const peak = current + delta;
        expect(peak).toBeGreaterThanOrEqual(range.min);
        expect(peak).toBeLessThanOrEqual(range.max);
      }
    }
  });
});

// ========================================
// ROBOT POOL (Task 4 — single-robot swells)
// ========================================

describe('robot pool — trigger and selection', () => {
  it('starts a single-robot swell (one SwellMember) when the trigger draw succeeds', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN); // trigger succeeds; index 0 -> 'volume'

    tickAudioSwells(LOCALE_ID, 0);

    const snap = getActiveSwellSnapshot('robot');
    expect(snap).toHaveLength(1);
    expect(snap[0].robotAttribute).toBe('volume');
    expect(snap[0].members).toHaveLength(1);
    expect(snap[0].members![0].robotId).toBe('r1');
  });

  it('does not start a robot swell when the trigger draw lands well above the trigger chance', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MID); // draw = 0.5

    tickAudioSwells(LOCALE_ID, 0);

    expect(getActiveSwellSnapshot('robot')).toEqual([]);
  });

  it('fills its first 5 (=cap) picks with exactly volume + layer0\'s 4 continuous fields — layer0.phase reachable, an explicitly-present-but-muted layer1 never picked', () => {
    const robot = makeRobot({
      audioAttributes: {
        adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
        filterFreq: 0,
        waveform: 'sine',
        layers: [
          { type: 'sine', gain: 1, detune: 0, phase: 0 },
          { type: 'sine', gain: 0, detune: 0, phase: 0 }, // present, muted
        ],
      },
    });
    useLocaleStore.getState().addRobot(LOCALE_ID, robot);

    const picked = new Set<string>();
    for (let measure = 0; measure < 5; measure++) {
      vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN); // index 0 of the shrinking eligible list
      tickAudioSwells(LOCALE_ID, measure);
      for (const s of getActiveSwellSnapshot('robot')) picked.add(s.robotAttribute!);
    }

    expect([...picked].sort()).toEqual(
      ['volume', 'layer0.gain', 'layer0.detune', 'layer0.phase', 'layer0.pulseWidth'].sort()
    );
  });

  it('fills its first 5 (=cap) picks with exactly volume + all 4 ADSR fields when every layer is muted', () => {
    const robot = makeRobot({
      audioAttributes: {
        adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
        filterFreq: 0,
        waveform: 'sine',
        layers: [{ type: 'sine', gain: 0, detune: 0, phase: 0 }],
      },
    });
    useLocaleStore.getState().addRobot(LOCALE_ID, robot);

    const picked = new Set<string>();
    for (let measure = 0; measure < 5; measure++) {
      vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
      tickAudioSwells(LOCALE_ID, measure);
      for (const s of getActiveSwellSnapshot('robot')) picked.add(s.robotAttribute!);
    }

    expect([...picked].sort()).toEqual(['volume', 'adsr.attack', 'adsr.decay', 'adsr.sustain', 'adsr.release'].sort());
  });
});

describe('robot pool — Volume\'s downward-swell clamp', () => {
  it('clamps a downward Volume swell so it never lands below 50% of Volume\'s own range', () => {
    // masterVolume 0.9 is above the [0,1] midpoint -> direction picks down
    // automatically; the unclamped default rule alone would allow the peak
    // down to floor = max(0.9 - 0.5, 0) = 0.4, well below the 0.5 clamp.
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ masterVolume: 0.9 }));
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN); // index 0 -> 'volume'; peak draw -> its own floor (0.4, pre-clamp)

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('robot').find((s) => s.robotAttribute === 'volume')!;
    const peak = swell.members![0].baseValue + swell.members![0].peakDelta;
    expect(peak).toBeGreaterThanOrEqual(VOLUME_SWELL_DOWNWARD_FLOOR);
  });

  it('leaves an upward Volume swell unaffected by the downward clamp', () => {
    // masterVolume 0.1 is below the midpoint -> direction picks up; floor =
    // min(0.1 + 0.5, 1) = 0.6, entirely above the downward-only clamp.
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ masterVolume: 0.1 }));
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('robot').find((s) => s.robotAttribute === 'volume')!;
    const peak = swell.members![0].baseValue + swell.members![0].peakDelta;
    expect(peak).toBeCloseTo(0.6);
  });
});

describe('robot pool — concurrency cap', () => {
  it('enforces the 5-cap across the whole roster (not per-robot) — a 6th robot swell does not start while 5 are active', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    for (let i = 0; i < 5; i++) {
      vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
      tickAudioSwells(LOCALE_ID, i);
    }
    expect(getActiveSwellSnapshot('robot')).toHaveLength(MAX_CONCURRENT_SWELLS_PER_POOL);

    // measure 5 — inside every one of the 5 swells' own 6-measure (3+3) window.
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 5);
    expect(getActiveSwellSnapshot('robot')).toHaveLength(MAX_CONCURRENT_SWELLS_PER_POOL);
  });

  it('never blocks the global pool and is never blocked by it — independent caps', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    for (let i = 0; i < 5; i++) {
      vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
      tickAudioSwells(LOCALE_ID, i); // fills the ROBOT pool to its cap
    }
    // Each of those same 5 ticks also independently rolls (and, under
    // ALWAYS_MIN, succeeds at) a global-pool attempt — proving the robot
    // pool's own cap being full didn't throttle the global pool at all: both
    // reach their own independent 5-cap from the very same 5 ticks.
    expect(getActiveSwellSnapshot('robot')).toHaveLength(MAX_CONCURRENT_SWELLS_PER_POOL);
    expect(getActiveSwellSnapshot('global')).toHaveLength(MAX_CONCURRENT_SWELLS_PER_POOL);
  });
});

describe('robot pool — ramp lifecycle and write path', () => {
  it('interpolates and returns to exactly baseValue on completion, removing the swell', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ masterVolume: 0.1 })); // up: floor 0.6, peak 0.6 via ALWAYS_MIN
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // creates the swell only

    tickAudioSwells(LOCALE_ID, 3); // falling phase's first tick -> value === peak
    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume).toBeCloseTo(0.6);
    expect(getActiveSwellSnapshot('robot').some((s) => s.robotAttribute === 'volume')).toBe(true);

    tickAudioSwells(LOCALE_ID, 15); // falling completes
    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume).toBe(0.1);
    expect(getActiveSwellSnapshot('robot').some((s) => s.robotAttribute === 'volume')).toBe(false);
  });

  it('writes a Volume swell through applyVolume, never a bare updateRobot/AudioEngine call', () => {
    const spy = vi.spyOn(robotOptionsActions, 'applyVolume');
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ masterVolume: 0.1 }));
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);
    tickAudioSwells(LOCALE_ID, 1); // advance -> writes

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].id).toBe('r1');
  });

  it('writes a layer swell through applyLayersContinuous, never a bare updateRobot/AudioEngine call', () => {
    const spy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous');
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // picks 'volume' (index 0)
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 1); // 'volume' now excluded -> picks 'layer0.gain'
    tickAudioSwells(LOCALE_ID, 2); // advance -> writes

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].id).toBe('r1');
  });

  it('writes an ADSR swell through applyAdsr, never a bare updateRobot/AudioEngine call', () => {
    const spy = vi.spyOn(robotOptionsActions, 'applyAdsr');
    // layer0 muted too (synthetic — Baseline is always audible in the real
    // app) narrows the eligible pool to exactly volume + the 4 ADSR fields,
    // so excluding 'volume' alone (already-picked) leaves adsr.attack as the
    // very next index-0 pick — no layer noise to walk past.
    useLocaleStore.getState().addRobot(
      LOCALE_ID,
      makeRobot({ audioAttributes: { adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine', layers: [{ type: 'sine', gain: 0, detune: 0, phase: 0 }] } })
    );
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // picks 'volume'
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 1); // 'volume' now excluded -> picks 'adsr.attack'
    tickAudioSwells(LOCALE_ID, 2); // advance -> writes

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].id).toBe('r1');
  });

  it('never calls useLocaleStore\'s updateRobot or an AudioEngine.updateVoice*/updateRobotMasterVolume method directly (source-scan regression guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioSwells.ts'), 'utf-8');
    // Requires an actual call site (trailing paren) so a doc comment merely
    // NAMING one of these functions in prose (e.g. "never a bare
    // AudioEngine.updateVoice* pairing") doesn't trip this guard.
    expect(source).not.toMatch(/\.updateRobot\(/);
    expect(source).not.toMatch(/AudioEngine\.(updateVoice\w*|updateRobotMasterVolume)\(/);
  });
});

// ========================================
// ROBOT POOL — COMPANY-WIDE SWELLS (Task 5)
// ========================================

describe('SWELL_COMPANY_CHANCE', () => {
  it('is a small, valid probability (0, 1)', () => {
    expect(SWELL_COMPANY_CHANCE).toBeGreaterThan(0);
    expect(SWELL_COMPANY_CHANCE).toBeLessThan(1);
  });
});

describe('robot pool — company-wide swells', () => {
  it('a company-wide pick gives every eligible robot in the company a member sharing robotAttribute/direction/timing', () => {
    const robots = [
      makeRobot({ id: 'r1', masterVolume: 0.2 }),
      makeRobot({ id: 'r2', masterVolume: 0.4 }),
      makeRobot({ id: 'r3', masterVolume: 0.6 }),
    ];
    robots.forEach((r) => useLocaleStore.getState().addRobot(LOCALE_ID, r));
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1', 'r2', 'r3'] }));

    // ALWAYS_MIN forces: trigger succeeds, company-chance succeeds (0 < any
    // positive SWELL_COMPANY_CHANCE), company index 0, attribute index 0
    // ('volume' — no parent toggle, so every member is eligible).
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);

    const snap = getActiveSwellSnapshot('robot');
    expect(snap).toHaveLength(1); // counts as exactly one swell
    const swell = snap[0];
    expect(swell.robotAttribute).toBe('volume');
    expect(swell.companyId).toBe('c1');
    expect(swell.members).toHaveLength(3);
    expect(new Set(swell.members!.map((m) => m.robotId))).toEqual(new Set(['r1', 'r2', 'r3']));
    // Members differ in baseValue (their own current value) but share
    // nothing else per-member — direction/timing live on the swell itself,
    // shared by construction (one ActiveSwell, not one per robot).
    expect(swell.members!.map((m) => m.baseValue).sort()).toEqual([0.2, 0.4, 0.6]);
  });

  it('does not go company-wide when the company-chance draw fails, even with companies available — falls through to a single-robot pick', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1'] }));
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.robot': -1, // succeeds
      'audioSwell.company.chance': 1, // fails (>= SWELL_COMPANY_CHANCE)
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('robot')[0];
    expect(swell.companyId).toBeUndefined();
    expect(swell.members).toHaveLength(1);
  });

  it('falls through to a single-robot pick when company-chance succeeds but the locale has zero companies', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    // No addCompany call — companies stays [].
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN); // company-chance would succeed if any existed

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('robot')[0];
    expect(swell.companyId).toBeUndefined();
    expect(swell.members).toHaveLength(1);
  });

  it('excludes an ineligible member (a muted layer\'s field) from the company, every other eligible member still gets one', () => {
    const eligible = makeRobot({ id: 'r1' }); // layer0 audible (default)
    const ineligible = makeRobot({
      id: 'r2',
      audioAttributes: { adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine', layers: [{ type: 'sine', gain: 0, detune: 0, phase: 0 }] },
    });
    useLocaleStore.getState().addRobot(LOCALE_ID, eligible);
    useLocaleStore.getState().addRobot(LOCALE_ID, ineligible);
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1', 'r2'] }));

    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.robot': -1,
      'audioSwell.company.chance': -1,
      'audioSwell.company.attribute': -0.8, // index 1 of 17 -> 'layer0.gain'
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('robot')[0];
    expect(swell.robotAttribute).toBe('layer0.gain');
    expect(swell.members!.map((m) => m.robotId)).toEqual(['r1']);
  });

  it('starts no swell at all this tick if every robot in the picked company is ineligible for the picked attribute (no re-roll, no fallback)', () => {
    const allMutedLayer0 = () =>
      makeRobot({
        id: 'r1',
        audioAttributes: { adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine', layers: [{ type: 'sine', gain: 0, detune: 0, phase: 0 }] },
      });
    useLocaleStore.getState().addRobot(LOCALE_ID, allMutedLayer0());
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1'] }));

    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.robot': -1,
      'audioSwell.company.chance': -1,
      'audioSwell.company.attribute': -0.8, // index 1 of 17 -> 'layer0.gain', ineligible for r1
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    expect(getActiveSwellSnapshot('robot')).toEqual([]);
  });

  it('counts as exactly one swell against the robot pool\'s 5-cap regardless of company size', () => {
    const robots = Array.from({ length: 4 }, (_, i) => makeRobot({ id: `r${i}` }));
    robots.forEach((r) => useLocaleStore.getState().addRobot(LOCALE_ID, r));
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: robots.map((r) => r.id) }));

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0);

    const snap = getActiveSwellSnapshot('robot');
    expect(snap).toHaveLength(1);
    expect(snap[0].members).toHaveLength(4);
  });

  it('is lock-step in time (every member starts/ends on the same measures) but per-robot in magnitude — each lands exactly on its own baseValue', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r1', masterVolume: 0.1 }));
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r2', masterVolume: 0.9 }));
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1', 'r2'] }));

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // creates the company swell (volume, rising 3 / falling 12 under ALWAYS_MIN)

    // Force this measure's own trigger draw to fail (real noise would
    // otherwise decide it non-deterministically, per session's random AS
    // name seed, and could spuriously start an unrelated swell here).
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MID);
    tickAudioSwells(LOCALE_ID, 15); // both members' shared window completes on the same measure

    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r1')!.masterVolume).toBe(0.1);
    expect(useLocaleStore.getState().getRobotById(LOCALE_ID, 'r2')!.masterVolume).toBe(0.9);
    expect(getActiveSwellSnapshot('robot')).toEqual([]);
  });

  it('is deterministic — two identical ticks (same store state, same measure, real seeded noise) produce identical company-wide decisions', () => {
    const setup = () => {
      stopAudioSwells();
      useLocaleStore.getState().setLocaleData(LOCALE_ID, { robots: [], companies: [] } as unknown as Partial<Locale>);
      useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r1', masterVolume: 0.3 }));
      useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ id: 'r2', masterVolume: 0.7 }));
      useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1', 'r2'] }));
    };

    setup();
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 12);
    const first = getActiveSwellSnapshot('robot');

    setup();
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 12);
    const second = getActiveSwellSnapshot('robot');

    expect(second).toEqual(first);
  });
});

// ========================================
// PER-ATTRIBUTE RANGE OVERRIDES (detune swing cap, HPF/LPF frequency clamps)
// ========================================

describe('robot pool — detune swing cap (25% of range = 25 cents, either direction)', () => {
  function makeDetuneRobot(detune: number): Robot {
    return makeRobot({
      audioAttributes: {
        adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
        filterFreq: 0,
        waveform: 'sine',
        layers: [{ type: 'sine', gain: 1, detune, phase: 0 }],
      },
    });
  }

  it('caps an upward detune swell at 25 cents even when the default rule would allow much more', () => {
    const robot = makeDetuneRobot(-40); // near the -50 edge -> direction picks up; the default (uncapped) rule would allow up to +90 cents of travel
    useLocaleStore.getState().addRobot(LOCALE_ID, robot);
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.robot': -1,
      'audioSwell.target.robot': -0.5, // index 2 of 9 eligible -> 'layer0.detune'
      [`audioSwell.peak.${robot.id}.layer0.detune`]: 1, // force the largest draw the capped range allows
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const member = getActiveSwellSnapshot('robot').find((s) => s.robotAttribute === 'layer0.detune')!.members![0];
    expect(member.baseValue).toBe(-40);
    expect(member.peakDelta).toBeCloseTo(100 * DETUNE_SWELL_MAX_SWING_FRACTION); // exactly the 25-cent cap, not the ~90 the default rule would allow
  });

  it('caps a downward detune swell at 25 cents even when the default rule would allow much more', () => {
    const robot = makeDetuneRobot(40); // near the +50 edge -> direction picks down
    useLocaleStore.getState().addRobot(LOCALE_ID, robot);
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.robot': -1,
      'audioSwell.target.robot': -0.5,
      [`audioSwell.peak.${robot.id}.layer0.detune`]: -1, // force the largest downward draw the capped range allows
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const member = getActiveSwellSnapshot('robot').find((s) => s.robotAttribute === 'layer0.detune')!.members![0];
    expect(member.baseValue).toBe(40);
    expect(member.peakDelta).toBeCloseTo(-100 * DETUNE_SWELL_MAX_SWING_FRACTION);
  });

  it('still draws a variable magnitude somewhere between 0 and the 25-cent cap, not always the full cap', () => {
    const robot = makeDetuneRobot(-40);
    useLocaleStore.getState().addRobot(LOCALE_ID, robot);
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.robot': -1,
      'audioSwell.target.robot': -0.5,
      [`audioSwell.peak.${robot.id}.layer0.detune`]: 0, // midpoint fraction -> roughly half the cap
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const member = getActiveSwellSnapshot('robot').find((s) => s.robotAttribute === 'layer0.detune')!.members![0];
    expect(member.peakDelta).toBeCloseTo(12.5); // half of the 25-cent cap
  });
});

describe('global pool — HPF/LPF frequency clamps', () => {
  it(`never swells HPF frequency above ${HPF_SWELL_UPWARD_CEILING_HZ}Hz`, () => {
    // HPF's default (20Hz) sits near the true min -> direction picks up by
    // default; the default rule alone would allow it all the way to 20000.
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.global': -1,
      'audioSwell.target.global': 0.2, // index 5 of 9 -> 'hpf.frequency'
      'audioSwell.peak.hpf.frequency': 1, // force the largest unclamped draw
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'hpf.frequency')!;
    const peak = swell.baseValue! + swell.peakDelta!;
    expect(peak).toBeCloseTo(HPF_SWELL_UPWARD_CEILING_HZ);
  });

  it(`never swells LPF frequency below ${LPF_SWELL_DOWNWARD_FLOOR_HZ}Hz`, () => {
    // LPF's default (20000Hz) sits at the true max -> direction picks down
    // by default; the default rule alone would allow it all the way to 20.
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.global': -1,
      'audioSwell.target.global': -0.2, // index 3 of 9 -> 'lpf.frequency'
      'audioSwell.peak.lpf.frequency': -1, // force the largest unclamped draw
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'lpf.frequency')!;
    const peak = swell.baseValue! + swell.peakDelta!;
    expect(peak).toBeCloseTo(LPF_SWELL_DOWNWARD_FLOOR_HZ);
  });

  it('leaves eq3/delay/reverb swells unaffected by the HPF/LPF clamps', () => {
    const noiseMap = noiseMapForDataIds({
      'audioSwell.trigger.global': -1,
      'audioSwell.target.global': -1, // index 0 of 9 -> 'eq3.low'
      'audioSwell.peak.eq3.low': 1, // force the largest unclamped draw (up to the true edge, 12)
    });
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);

    tickAudioSwells(LOCALE_ID, 0);

    const swell = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
    // eq3.low's default (0) sits exactly at its own midpoint, so direction is
    // a seeded coin-flip — either edge proves the point: it reaches its own
    // true ±12dB edge, unclamped by anything HPF/LPF-specific.
    expect(Math.abs(swell.baseValue! + swell.peakDelta!)).toBeCloseTo(12);
  });
});

// ========================================
// CANCELLATION (USER EDIT INTERRUPTS A SWELL)
// ========================================

describe('cancelSwellForGlobalField (a real UI edit interrupts a global-chain swell)', () => {
  it('drops the matching swell without snapping the field back to its base value', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // starts eq3.low
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.low')).toBe(true);

    // Simulate the user's own edit already having landed (AudioRigDrawer's
    // updateParam calls setGlobalAudio itself — cancelSwellForGlobalField's
    // own job is only to drop the swell, never to touch the store).
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, eq3: { ...s.globalAudio.eq3, low: 7 } } }));
    cancelSwellForGlobalField('eq3', 'low');

    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.low')).toBe(false);
    expect(useAudioStore.getState().globalAudio.eq3.low).toBe(7); // the user's value survives, untouched

    // A later tick must not resurrect or keep writing to the cancelled swell.
    tickAudioSwells(LOCALE_ID, 1);
    expect(useAudioStore.getState().globalAudio.eq3.low).toBe(7);
  });

  it('is a no-op when that field has no active swell', () => {
    expect(() => cancelSwellForGlobalField('eq3', 'low')).not.toThrow();
    expect(getActiveSwellSnapshot('global')).toEqual([]);
  });

  it('is a no-op for an effect/field this pool never swells (e.g. compressor)', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // starts eq3.low
    expect(() => cancelSwellForGlobalField('compressor', 'threshold')).not.toThrow();
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.low')).toBe(true); // untouched
  });

  it('does not cancel a different field on the same effect', () => {
    const noiseMap = noiseMapForDataIds({ 'audioSwell.trigger.global': -1, 'audioSwell.target.global': -0.6 }); // index 1 of 9 -> eq3.mid
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(noiseMap);
    tickAudioSwells(LOCALE_ID, 0); // starts eq3.mid
    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.mid')).toBe(true);

    cancelSwellForGlobalField('eq3', 'low'); // a different field on the same effect

    expect(getActiveSwellSnapshot('global').some((s) => s.globalTarget === 'eq3.mid')).toBe(true); // untouched
  });
});

describe('cancelSwellForRobotAttribute (a real UI edit interrupts a robot-pool swell)', () => {
  it('drops a single-robot swell for the matching robot + attribute', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ masterVolume: 0.1 }));
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // starts r1's volume swell
    expect(getActiveSwellSnapshot('robot').some((s) => s.robotAttribute === 'volume')).toBe(true);

    cancelSwellForRobotAttribute('r1', 'volume');

    expect(getActiveSwellSnapshot('robot')).toEqual([]);
  });

  it('is a no-op when that robot/attribute has no active swell', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    expect(() => cancelSwellForRobotAttribute('r1', 'volume')).not.toThrow();
    expect(getActiveSwellSnapshot('robot')).toEqual([]);
  });

  it('does not cancel a different attribute on the same robot', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot());
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // picks 'volume' (index 0)
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 1); // 'volume' now excluded -> picks 'layer0.gain'

    cancelSwellForRobotAttribute('r1', 'volume');

    expect(getActiveSwellSnapshot('robot').some((s) => s.robotAttribute === 'layer0.gain')).toBe(true);
  });

  it('cancels a company-wide swell atomically — one member\'s edit drops every member\'s key, not just its own', () => {
    const robots = [
      makeRobot({ id: 'r1', masterVolume: 0.2 }),
      makeRobot({ id: 'r2', masterVolume: 0.4 }),
      makeRobot({ id: 'r3', masterVolume: 0.6 }),
    ];
    robots.forEach((r) => useLocaleStore.getState().addRobot(LOCALE_ID, r));
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1', 'r2', 'r3'] }));

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // company-wide volume swell, all 3 members

    cancelSwellForRobotAttribute('r2', 'volume'); // the user edits only r2's own slider

    // Every member's own key is gone, not just r2's — a partial cancellation
    // would otherwise leave r1/r3 still mid-swell on a now-half-dead ActiveSwell.
    expect(getActiveSwellSnapshot('robot')).toEqual([]);
  });
});

describe('isGlobalTargetSwelling / isRobotAttributeSwelling (read-only swell-in-progress check, feeds the slider primitives\' swelling-aware ease)', () => {
  it('isGlobalTargetSwelling is true only for the effect/field actually swelling', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // starts eq3.low

    expect(isGlobalTargetSwelling('eq3', 'low')).toBe(true);
    expect(isGlobalTargetSwelling('eq3', 'mid')).toBe(false);
    expect(isGlobalTargetSwelling('compressor', 'threshold')).toBe(false); // not a swellable field at all
  });

  it('isGlobalTargetSwelling goes false once the swell completes', () => {
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // starts eq3.low
    cancelSwellForGlobalField('eq3', 'low');

    expect(isGlobalTargetSwelling('eq3', 'low')).toBe(false);
  });

  it('isRobotAttributeSwelling is true only for the robot/attribute actually swelling', () => {
    useLocaleStore.getState().addRobot(LOCALE_ID, makeRobot({ masterVolume: 0.1 }));
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // starts r1's volume swell

    expect(isRobotAttributeSwelling('r1', 'volume')).toBe(true);
    expect(isRobotAttributeSwelling('r1', 'layer0.gain')).toBe(false);
    expect(isRobotAttributeSwelling('r2', 'volume')).toBe(false);
  });

  it('isRobotAttributeSwelling is true for every member of a company-wide swell', () => {
    const robots = [
      makeRobot({ id: 'r1', masterVolume: 0.2 }),
      makeRobot({ id: 'r2', masterVolume: 0.4 }),
    ];
    robots.forEach((r) => useLocaleStore.getState().addRobot(LOCALE_ID, r));
    useLocaleStore.getState().addCompany(LOCALE_ID, makeCompany({ robotIds: ['r1', 'r2'] }));

    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(ALWAYS_MIN);
    tickAudioSwells(LOCALE_ID, 0); // company-wide volume swell, both members

    expect(isRobotAttributeSwelling('r1', 'volume')).toBe(true);
    expect(isRobotAttributeSwelling('r2', 'volume')).toBe(true);
  });
});
