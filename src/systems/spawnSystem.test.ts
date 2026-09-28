// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import type { Robot } from '../types/Robot';

import { generateSpawnPosition, generateAudioAttributes, generateRobotLfoSettings, generateRobotAudioBaseline, generateRobotRosterBaseline, spawnRobot, spawnInitialRoster, spawnInitialCompanies, generateCompanyName, generateCompanyIdentityColor, ADJECTIVES, COMPANY_NOUNS } from './spawnSystem';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { AudioEngine } from '../engine/AudioEngine';
import { DockingState } from '../types/Robot';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { ROBOT_LFO_TARGET_IDS, LFO_SHAPES, LFO_RATE_MIN, LFO_RATE_MAX, LFO_DEPTH_MIN, LFO_DEPTH_MAX } from '../types/lfo';
import {
  MAX_ROBOTS, INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX,
  INITIAL_COMPANIES_MIN, INITIAL_COMPANIES_MAX, COMPANY_SIZE_MIN, COMPANY_SIZE_MAX,
} from '../constants';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';
import { getSeededVal } from '../utils/getSeededVal';

/** General-purpose mock: returns a pseudo-random value in [-1, 1]. */
const mockNoiseMap: NoiseFunction2D = () => Math.random() * 2 - 1;

/** Deterministic mock: always returns -1, mapping every getSeededVal call to its min value. */
const deterministicNoiseMap: NoiseFunction2D = () => -1;

// ========================================
// TESTS
// ========================================

describe('spawnSystem', () => {
  describe('generateSpawnPosition', () => {
    it('generates position just outside world bounds (off-screen)', () => {
      const position = generateSpawnPosition(mockNoiseMap, 0);
      // Must be outside the viewBox on at least one axis
      const outsideX = position.x < 0 || position.x > 1920;
      const outsideY = position.y < 0 || position.y > 1080;
      expect(outsideX || outsideY).toBe(true);
    });

    it('only ever spawns below the bottom edge — never to the sides or above', () => {
      const positions = Array.from({ length: 100 }, (_, i) => generateSpawnPosition(mockNoiseMap, i));

      for (const p of positions) {
        expect(p.y).toBeGreaterThan(1080); // below the bottom edge, every time
        expect(p.x).toBeGreaterThanOrEqual(0); // x stays on-screen horizontally
        expect(p.x).toBeLessThanOrEqual(1920);
      }
    });

    it('generates varied positions along x (not all the same)', () => {
      const positions = Array.from({ length: 20 }, (_, i) => generateSpawnPosition(mockNoiseMap, i));
      const uniqueX = new Set(positions.map((p) => Math.round(p.x)));

      expect(uniqueX.size).toBeGreaterThan(8); // Should have variety
    });
  });

  describe('generateAudioAttributes', () => {
    it('generates valid synth type', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      expect(['sine', 'square', 'triangle', 'sawtooth', 'pulse']).toContain(attrs.waveform);
    });

    it('generates ADSR values within the unified 0-5s generation range (Roadmap Phase 9)', () => {
      // attack/decay/release used to have mismatched per-field maxes (2/2/5) narrower than the
      // Ping Contour drawer's 0-10s edit range; Phase 9 unifies generation to a flat 0-5s so it's
      // still narrower than the edit range without three different arbitrary per-field caps.
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      expect(attrs.adsr.attack).toBeGreaterThanOrEqual(0);
      expect(attrs.adsr.attack).toBeLessThanOrEqual(5.0);
      expect(attrs.adsr.decay).toBeGreaterThanOrEqual(0);
      expect(attrs.adsr.decay).toBeLessThanOrEqual(5.0);
      expect(attrs.adsr.sustain).toBeGreaterThanOrEqual(0.0);
      expect(attrs.adsr.sustain).toBeLessThanOrEqual(1.0);
      expect(attrs.adsr.release).toBeGreaterThanOrEqual(0);
      expect(attrs.adsr.release).toBeLessThanOrEqual(5.0);
    });

    it('generates octave range from predefined registers', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      const validRegisters: [number, number][] = [[1, 3], [2, 4], [3, 5], [4, 6], [5, 7]];

      const matchesRegister = validRegisters.some(
        ([min, max]) =>
          attrs.octaveRange?.[0] === min && attrs.octaveRange?.[1] === max
      );

      expect(matchesRegister).toBe(true);
    });

    it('generates filter frequency in valid range', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      expect(attrs.filterFreq).toBeGreaterThanOrEqual(400);
      expect(attrs.filterFreq).toBeLessThanOrEqual(2500);
    });

    it('generates varied attributes (not all the same)', () => {
      const attributes = Array.from({ length: 20 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      const uniqueWaveforms = new Set(attributes.map((a) => a.waveform));
      const uniqueAttacks = new Set(attributes.map((a) => a.adsr.attack.toFixed(2)));
      // Synth type is now generic; ensure ADSR variety still exists
      expect(uniqueWaveforms.size).toBeGreaterThan(1);
      expect(uniqueAttacks.size).toBeGreaterThan(10); // Should have variety
    });

    it('always produces exactly 3 layers (Baseline/Coaxial/Harmonic), Baseline always audible, shapeParams in range', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      const vm = attrs.visualAudioMap;
      expect(vm).toBeDefined();
      const layers = attrs.layers ?? [];
      expect(layers).toHaveLength(3);
      expect(layers[0].gain).not.toBe(0); // Baseline never mutes — no quiet roll for layer0
      // shape params 0..1
      expect(vm?.shapeParams?.scale).toBeGreaterThanOrEqual(0);
      expect(vm?.shapeParams?.scale).toBeLessThanOrEqual(1);
      expect(vm?.shapeParams?.roundness).toBeGreaterThanOrEqual(0);
      expect(vm?.shapeParams?.roundness).toBeLessThanOrEqual(1);
      expect(vm?.shapeParams?.detail).toBeGreaterThanOrEqual(0);
      expect(vm?.shapeParams?.detail).toBeLessThanOrEqual(1);
    });

    it('no layer is ever typed \'noise\' — dropped entirely per Roadmap Phase 9', () => {
      const attributes = Array.from({ length: 50 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      const allTypes = attributes.flatMap((a) => (a.layers ?? []).map((l) => l.type));
      expect(allTypes.length).toBeGreaterThan(0);
      expect(allTypes).not.toContain('noise');
      const validWaveforms = ['sine', 'square', 'triangle', 'sawtooth', 'pulse'];
      allTypes.forEach((t) => expect(validWaveforms).toContain(t));
    });

    it('has no averagedADSR field — nothing left to average with one shared envelope', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      expect((attrs.visualAudioMap as unknown as { averagedADSR?: unknown })?.averagedADSR).toBeUndefined();
    });

    it('shapeParams derive directly from the shared adsr (deterministic: min-valued adsr -> scale 1, roundness/detail 0)', () => {
      // deterministicNoiseMap always returns -1, mapping every getSeededVal to its min: adsr is
      // {attack: 0, decay: 0, sustain: 0, release: 0}. Normalized by ADSR_MAX
      // ({attack:2, decay:2, sustain:1, release:5}), every ratio is 0.
      const attrs = generateAudioAttributes(deterministicNoiseMap, 0);
      expect(attrs.adsr).toEqual({ attack: 0, decay: 0, sustain: 0, release: 0 });
      const shapeParams = attrs.visualAudioMap!.shapeParams!;
      expect(shapeParams.scale).toBeCloseTo(1, 6);      // 0.25 + (1 - 0/2) * 0.75
      expect(shapeParams.roundness).toBeCloseTo(0, 6);  // 0/1
      expect(shapeParams.detail).toBeCloseTo(0, 6);     // 0/5
    });

    it('Coaxial and Harmonic are each independently seeded muted/audible (not both forced the same value)', () => {
      const attributes = Array.from({ length: 60 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      const coaxialMuted = attributes.map((a) => a.layers![1].gain === 0);
      const harmonicMuted = attributes.map((a) => a.layers![2].gain === 0);
      expect(new Set(coaxialMuted).size, 'Coaxial should take both muted and audible across many spawns').toBe(2);
      expect(new Set(harmonicMuted).size, 'Harmonic should take both muted and audible across many spawns').toBe(2);
      // Not perfectly correlated — some robot has Coaxial and Harmonic disagreeing
      expect(attributes.some((a) => (a.layers![1].gain === 0) !== (a.layers![2].gain === 0))).toBe(true);
    });

    it('quantizes every non-muted layer\'s gain to a 0.01 grid, across many seeds (SEEDED_SLIDER_VALUE_QUANTIZATION Task 6)', () => {
      const attributes = Array.from({ length: 60 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      for (const attrs of attributes) {
        for (const layer of attrs.layers ?? []) {
          if (layer.gain === 0) continue;
          const stepsFromMin = layer.gain / 0.01;
          expect(Math.abs(stepsFromMin - Math.round(stepsFromMin))).toBeLessThan(1e-9);
        }
      }
    });

    it('leaves a muted layer\'s gain exactly 0 — never passed through quantizeToStep (regression)', () => {
      const attributes = Array.from({ length: 60 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      const mutedGains = attributes.flatMap((a) => (a.layers ?? []).slice(1)).filter((l) => l.gain === 0);
      expect(mutedGains.length, 'expected at least one muted layer across 60 spawns x 2 mutable layers').toBeGreaterThan(0);
      for (const layer of mutedGains) {
        expect(Object.is(layer.gain, 0)).toBe(true);
      }
    });

    it('quantizes every layer\'s detune to a whole cent, across many seeds', () => {
      const attributes = Array.from({ length: 60 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      for (const attrs of attributes) {
        for (const layer of attrs.layers ?? []) {
          expect(Number.isInteger(layer.detune), `detune: ${layer.detune}`).toBe(true);
        }
      }
    });
  });

  describe('generateRobotLfoSettings', () => {
    it('generates LfoSettings for all 13 RobotLfoTargetId values, no extras', () => {
      const settings = generateRobotLfoSettings(mockNoiseMap, 0);
      expect(Object.keys(settings).sort()).toEqual([...ROBOT_LFO_TARGET_IDS].sort());
    });

    it('every target\'s shape/rate/depth falls within documented bounds — no active field left', () => {
      const settings = generateRobotLfoSettings(mockNoiseMap, 0);
      for (const target of ROBOT_LFO_TARGET_IDS) {
        const s = settings[target];
        expect(LFO_SHAPES, `${target}.shape`).toContain(s.shape);
        expect(s.rate, `${target}.rate >= min`).toBeGreaterThanOrEqual(LFO_RATE_MIN);
        expect(s.rate, `${target}.rate <= max`).toBeLessThanOrEqual(LFO_RATE_MAX);
        expect(s.depth, `${target}.depth >= min`).toBeGreaterThanOrEqual(LFO_DEPTH_MIN);
        expect(s.depth, `${target}.depth <= max`).toBeLessThanOrEqual(LFO_DEPTH_MAX);
        expect('active' in s, `${target} should not carry an active field`).toBe(false);
      }
    });

    it('seeds quiet (rate: 0) independently per target — not uniformly all-quiet or all-oscillating (Roadmap Phase 9)', () => {
      const settings = generateRobotLfoSettings(mockNoiseMap, 0);
      const isQuiet = ROBOT_LFO_TARGET_IDS.map((t) => settings[t].rate === 0);
      expect(new Set(isQuiet).size, 'expected both quiet and oscillating targets among the 13').toBe(2);
    });

    it('quantizes rate to a 0.05 grid, across many seeds and targets, excluding the quiet -> 0 case (SEEDED_SLIDER_VALUE_QUANTIZATION Task 6)', () => {
      for (let i = 0; i < 30; i++) {
        const settings = generateRobotLfoSettings(mockNoiseMap, i);
        for (const target of ROBOT_LFO_TARGET_IDS) {
          const { rate } = settings[target];
          if (rate === 0) continue;
          const stepsFromMin = rate / 0.05;
          expect(Math.abs(stepsFromMin - Math.round(stepsFromMin)), `${target}.rate (offset ${i})`).toBeLessThan(1e-9);
        }
      }
    });

    it('quantizes depth to a whole percent, across many seeds and targets (SEEDED_SLIDER_VALUE_QUANTIZATION follow-up)', () => {
      for (let i = 0; i < 30; i++) {
        const settings = generateRobotLfoSettings(mockNoiseMap, i);
        for (const target of ROBOT_LFO_TARGET_IDS) {
          const { depth } = settings[target];
          expect(Number.isInteger(depth), `${target}.depth (offset ${i}): ${depth}`).toBe(true);
        }
      }
    });

    it('gives different targets different values within the same call — dataIds are genuinely distinct, not colliding', () => {
      const settings = generateRobotLfoSettings(mockNoiseMap, 0);
      const rates = ROBOT_LFO_TARGET_IDS.map((t) => settings[t].rate);
      expect(new Set(rates.map((r) => r.toFixed(6))).size).toBeGreaterThan(1);
    });

    it('is deterministic — the same real seeded noise map + offset always produces identical LfoSettings', () => {
      const noiseMap = createNoise2D(alea('lfo-determinism-test-seed'));
      const first = generateRobotLfoSettings(noiseMap, 5);
      const second = generateRobotLfoSettings(noiseMap, 5);
      expect(second).toEqual(first);
    });

    it('produces different LfoSettings for a different spawn offset (non-degenerate)', () => {
      const noiseMap = createNoise2D(alea('lfo-determinism-test-seed'));
      const a = generateRobotLfoSettings(noiseMap, 0);
      const b = generateRobotLfoSettings(noiseMap, 1);
      expect(b).not.toEqual(a);
    });
  });

  describe('spawnRobot', () => {
    beforeEach(() => {
      // Reset locale store before each test
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
      vi.clearAllMocks();
    });

    it('spawns a robot and adds to store', () => {
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

      spawnRobot(DEFAULT_LOCALE_ID);

      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots.length).toBe(1);

      const robot = robots[0];
      expect(robot.id).toBeDefined();
      expect(robot.state).toBe('idle');
      expect(robot.position).toBeDefined();
      expect(robot.destination).toBeNull();
      expect(robot.melody).toBeDefined();
      expect(robot.melody.length).toBeGreaterThan(0);
      expect(robot.audioAttributes).toBeDefined();
      expect(robot.lfoSettings).toBeDefined();
      expect(Object.keys(robot.lfoSettings ?? {}).sort()).toEqual([...ROBOT_LFO_TARGET_IDS].sort());

      expect(registerSpy).toHaveBeenCalledWith(robot.id, robot.melody);
    });

    it('quantizes masterVolume so its percent (x100) is always an integer, across many spawns (SEEDED_SLIDER_VALUE_QUANTIZATION Task 6)', () => {
      for (let i = 0; i < 30; i++) {
        spawnRobot(DEFAULT_LOCALE_ID);
      }
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots.length).toBeGreaterThan(0);
      for (const robot of robots) {
        expect(Number.isInteger(robot.masterVolume * 100), `robot ${robot.id}: ${robot.masterVolume}`).toBe(true);
      }
    });

    it('spawns robots with the new percentage/toggle melody shapes', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      const robot = (useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [])[0];

      expect(typeof robot.rhythmicDensity).toBe('number');
      expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(0);
      expect(robot.rhythmicDensity).toBeLessThanOrEqual(100);

      expect(robot.rhythmicMotifLength).toEqual(
        expect.objectContaining({ active: expect.any(Boolean), value: expect.any(Number) })
      );
      expect(robot.rhythmicMotifLength!.value).toBeGreaterThanOrEqual(0);
      expect(robot.rhythmicMotifLength!.value).toBeLessThanOrEqual(8);
      expect(robot.rhythmicMotifLength!.active).toBe(robot.rhythmicMotifLength!.value > 0);

      expect(robot.noteVariance).toEqual(
        expect.objectContaining({ active: expect.any(Boolean), value: expect.any(Number) })
      );
      expect(robot.noteVariance!.value).toBeGreaterThanOrEqual(0);
      expect(robot.noteVariance!.value).toBeLessThanOrEqual(8);
      expect(robot.noteVariance!.active).toBe(robot.noteVariance!.value > 0);

      expect(typeof robot.pitchRepeat).toBe('number');
      expect(robot.pitchRepeat).toBeGreaterThanOrEqual(0);
      expect(robot.pitchRepeat).toBeLessThanOrEqual(100);
    });

    it('seeds rhythmicMotifLength.active at roughly an 85% chance across many spawns', () => {
      // A dedicated locale ID, not DEFAULT_LOCALE_ID: spawnCounters is keyed
      // per-locale, so this test's result is independent of how many times
      // earlier tests in this file already called spawnRobot(DEFAULT_LOCALE_ID)
      // -- otherwise this deterministic seeded roll depends on execution order.
      const localeId = 'motif-active-stat-test-locale';
      useLocaleStore.setState((state) => ({
        locales: {
          ...state.locales,
          [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] },
        },
      }));
      const n = 500;
      for (let i = 0; i < n; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
      const activeCount = robots.filter((r) => r.rhythmicMotifLength?.active).length;
      const activeFraction = activeCount / robots.length;
      // ~30% of spawns copy an existing robot's setting rather than rolling fresh,
      // which adds clustering variance but doesn't bias the marginal proportion —
      // generous band to avoid flakiness while still discriminating from the old
      // ~66% (shared with noteVariance) threshold.
      expect(activeFraction).toBeGreaterThanOrEqual(0.75);
      expect(activeFraction).toBeLessThanOrEqual(0.95);
    });

    it('reaches rhythmicMotifLength.value: 0 (the off state) through the single consolidated draw', () => {
      // Old two-draw implementation could never produce value: 0 at all (the value draw was
      // seeded 1-9, floored, min 8) -- this is only reachable once active/value collapse to one
      // draw where the off branch sets value itself to 0, not just active: false.
      const localeId = 'motif-off-value-reachable-locale';
      useLocaleStore.setState((state) => ({
        locales: {
          ...state.locales,
          [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] },
        },
      }));
      for (let i = 0; i < 500; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
      const offRobots = robots.filter((r) => r.rhythmicMotifLength?.value === 0);
      expect(offRobots.length).toBeGreaterThan(0);
      // Every off robot's active must agree -- no drawn-independently active field left behind.
      for (const r of offRobots) expect(r.rhythmicMotifLength!.active).toBe(false);
    });

    it('seeds noteVariance.active at roughly an 85% chance across many spawns', () => {
      // Dedicated locale ID -- see the rhythmicMotifLength.active test above
      // for why (spawnCounters is keyed per-locale; this avoids execution-order
      // sensitivity in this deterministic seeded roll).
      const localeId = 'note-variance-active-stat-test-locale';
      useLocaleStore.setState((state) => ({
        locales: {
          ...state.locales,
          [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] },
        },
      }));
      const n = 500;
      for (let i = 0; i < n; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
      const activeCount = robots.filter((r) => r.noteVariance?.active).length;
      const activeFraction = activeCount / robots.length;
      // Same generous band and copy-clustering rationale as the motif-length
      // version of this test above.
      expect(activeFraction).toBeGreaterThanOrEqual(0.75);
      expect(activeFraction).toBeLessThanOrEqual(0.95);
    });

    it('reaches noteVariance.value: 0 (the off state) through the single consolidated draw', () => {
      const localeId = 'note-variance-off-value-reachable-locale';
      useLocaleStore.setState((state) => ({
        locales: {
          ...state.locales,
          [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] },
        },
      }));
      for (let i = 0; i < 500; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
      const offRobots = robots.filter((r) => r.noteVariance?.value === 0);
      expect(offRobots.length).toBeGreaterThan(0);
      for (const r of offRobots) expect(r.noteVariance!.active).toBe(false);
    });

    it('a copied robot inherits the source\'s rhythmicDensity/rhythmicMotifLength/noteVariance rather than rolling fresh ones', () => {
      for (let i = 0; i < 30; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const byLfo = new Map<Robot['lfoSettings'], Robot[]>();
      for (const r of robots) {
        const group = byLfo.get(r.lfoSettings) ?? [];
        group.push(r);
        byLfo.set(r.lfoSettings, group);
      }
      const sharedGroup = [...byLfo.values()].find((g) => g.length > 1);
      expect(sharedGroup, 'expected at least one copy to share its source\'s object references').toBeDefined();
      const [a, b] = sharedGroup!;
      expect(a.rhythmicDensity).toBe(b.rhythmicDensity);
      expect(a.rhythmicMotifLength).toEqual(b.rhythmicMotifLength);
      expect(a.noteVariance).toEqual(b.noteVariance);
      expect(a.pitchRepeat).toBe(b.pitchRepeat);
    });

    it('a copied robot inherits the source\'s lfoSettings rather than generating fresh ones', () => {
      // 30 spawns at a ~30% copy chance per spawn makes at least one copy
      // virtually certain (P(zero copies) ≈ 0.7^29 ≈ 0.00002). The roster is
      // uncapped now (no more oldest-robot removal churn to avoid).
      for (let i = 0; i < 30; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const bySettings = new Map<Robot['lfoSettings'], Robot[]>();
      for (const r of robots) {
        const group = bySettings.get(r.lfoSettings) ?? [];
        group.push(r);
        bySettings.set(r.lfoSettings, group);
      }
      const sharedGroup = [...bySettings.values()].find((g) => g.length > 1);
      expect(sharedGroup, 'expected at least one copy to share its source\'s lfoSettings reference').toBeDefined();
    });

    it('spawns multiple robots with unique IDs', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);

      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const ids = new Set(robots.map((r) => r.id));

      expect(robots.length).toBe(3);
      expect(ids.size).toBe(3); // All unique
    });

    it('generates robots with different attributes', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);

      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];

      // Positions should differ (ensures different robots)
      const positions = robots.map((r) => `${r.position.x},${r.position.y}`);
      const uniquePositions = new Set(positions);

      expect(uniquePositions.size).toBeGreaterThan(1); // Different positions
    });

  });

  describe('spawnRobot — deterministic robot IDs', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
    });

    it('robot.id is not a crypto.randomUUID-shaped string', () => {
      // melodyGenerator.ts still legitimately calls crypto.randomUUID() for each
      // melody EVENT's own id — unrelated and untouched by this task. This test
      // checks the ROBOT id's own shape, not whether randomUUID is called at all.
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
      spawnRobot(DEFAULT_LOCALE_ID);
      const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots[0];
      const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(robot?.id).toBeDefined();
      expect(uuidShape.test(robot!.id)).toBe(false);
    });

    it('spawning against the same locale coordinates twice (fresh module state each time) produces identical ID sequences', async () => {
      // Simulates a reload/shared-link replay: a brand-new module instance
      // (spawnCounters reset to empty) spawning against the same coordinates
      // must reproduce the exact same ID sequence, since Session Storage
      // (Phase 20) needs to reapply overrides by ID after the roster
      // regenerates. Reuses the same vi.resetModules() pattern the
      // "spawnInitialRoster" determinism test below uses, rather than
      // reaching into spawnSystem's private per-locale counter.
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnRobot(attenuationStyle1.DEFAULT_LOCALE_ID);
      run1.spawnRobot(attenuationStyle1.DEFAULT_LOCALE_ID);
      const idsRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.id);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnRobot(attenuationStyle2.DEFAULT_LOCALE_ID);
      run2.spawnRobot(attenuationStyle2.DEFAULT_LOCALE_ID);
      const idsRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.id);

      expect(idsRun1).toHaveLength(2);
      expect(idsRun2).toEqual(idsRun1);
    });

    it('two different locale IDs sharing the same coordinates produce identical ID sequences', () => {
      // Robot ID depends on (coordinates, spawnCount) alone, never on localeId
      // itself — matching the same coordinates-are-the-seed guarantee
      // LOCALE_SEED_DECOUPLING.md established for every other locale-derived value.
      const coords = { x: 5.5, y: -3.25 };
      useLocaleStore.setState({
        locales: {
          'locale-id-test-a': { ...DEFAULT_LOCALE, id: 'locale-id-test-a', coordinates: coords, robots: [] },
          'locale-id-test-b': { ...DEFAULT_LOCALE, id: 'locale-id-test-b', coordinates: coords, robots: [] },
        },
      });

      spawnRobot('locale-id-test-a');
      spawnRobot('locale-id-test-a');
      spawnRobot('locale-id-test-b');
      spawnRobot('locale-id-test-b');

      const idsA = (useLocaleStore.getState().getLocaleById('locale-id-test-a')?.robots ?? []).map((r) => r.id);
      const idsB = (useLocaleStore.getState().getLocaleById('locale-id-test-b')?.robots ?? []).map((r) => r.id);
      expect(idsA).toEqual(idsB);
    });
  });

  describe('spawnRobot — docking/battery options', () => {
    // Each test gets its own locale id + coordinates (never DEFAULT_LOCALE_ID),
    // matching this file's existing "*-stat-test-locale" pattern — spawnCounters
    // and robot-ID noise sampling are both keyed by locale, so a dedicated
    // locale per test guarantees no shared counter/ID state leaks in from
    // whatever order the rest of this file's many DEFAULT_LOCALE_ID spawns run in.
    function freshLocale(id: string, x: number, y: number) {
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [id]: { ...DEFAULT_LOCALE, id, coordinates: { x, y }, robots: [] } },
      }));
    }

    it('defaults to Active/100 when no options are passed', () => {
      const localeId = 'docking-opts-defaults';
      freshLocale(localeId, 101, 201);
      spawnRobot(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.docking).toBe(DockingState.Active);
      expect(robot?.batteryLevel).toBe(100);
    });

    it('respects explicit docking/batteryLevel options', () => {
      const localeId = 'docking-opts-explicit';
      freshLocale(localeId, 102, 202);
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: 37 });
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.docking).toBe(DockingState.Docked);
      expect(robot?.batteryLevel).toBe(37);
    });

    it('reserves a voice and registers the melody regardless of docking state — mute is via audioMode, not absent registration', () => {
      const localeId = 'docking-opts-active-voice';
      freshLocale(localeId, 103, 203);
      spawnRobot(localeId, { docking: DockingState.Active, batteryLevel: 100 });
      const activeRobot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(AudioEngine.getVoiceForRobot(activeRobot!.id)).not.toBeNull();
      expect(AudioEngine.getRegisteredMelody(activeRobot!.id).length).toBeGreaterThan(0);
    });

    it('still reserves a voice and registers the melody when created Docked', () => {
      const localeId = 'docking-opts-docked-still-voice';
      freshLocale(localeId, 104, 204);
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: 50 });
      const dockedRobot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(AudioEngine.getVoiceForRobot(dockedRobot!.id)).not.toBeNull();
      expect(AudioEngine.getRegisteredMelody(dockedRobot!.id).length).toBeGreaterThan(0);
    });

    it('sets audioMode to none when created Active', () => {
      const localeId = 'docking-opts-active-audiomode';
      freshLocale(localeId, 106, 206);
      spawnRobot(localeId, { docking: DockingState.Active, batteryLevel: 100 });
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.audioMode).toBe('none');
    });

    it('sets audioMode to mute when created Docked — the toggle Robot Options exposes, not absent registration', () => {
      const localeId = 'docking-opts-docked-audiomode';
      freshLocale(localeId, 107, 207);
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: 50 });
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.audioMode).toBe('mute');
    });

    it('no longer sets a persists field', () => {
      const localeId = 'docking-opts-no-persists';
      freshLocale(localeId, 105, 205);
      spawnRobot(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect((robot as unknown as { persists?: unknown }).persists).toBeUndefined();
    });
  });

  describe('spawnInitialRoster', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it(`creates exactly ${MAX_ROBOTS} robots`, () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots).toHaveLength(MAX_ROBOTS);
    });

    it(`seeds the Active count within [${INITIAL_ACTIVE_ROBOTS_MIN}, ${INITIAL_ACTIVE_ROBOTS_MAX}]`, () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const activeCount = robots.filter((r) => r.docking === DockingState.Active).length;
      expect(activeCount).toBeGreaterThanOrEqual(INITIAL_ACTIVE_ROBOTS_MIN);
      expect(activeCount).toBeLessThanOrEqual(INITIAL_ACTIVE_ROBOTS_MAX);
      expect(robots.filter((r) => r.docking === DockingState.Docked)).toHaveLength(MAX_ROBOTS - activeCount);
    });

    it('does not assign a job to any robot — that is worldTransition.ts\'s job, not spawnInitialRoster\'s', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots.every((r) => r.job === undefined)).toBe(true);
    });

    it('seeds varied (not uniform) starting battery levels for Docked robots', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const dockedLevels = robots.filter((r) => r.docking === DockingState.Docked).map((r) => r.batteryLevel);
      expect(new Set(dockedLevels).size).toBeGreaterThan(1);
      dockedLevels.forEach((level) => {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThan(100);
      });
    });

    it('Active robots start at full battery', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      robots.filter((r) => r.docking === DockingState.Active).forEach((r) => {
        expect(r.batteryLevel).toBe(100);
      });
    });

    it('every robot has a reserved voice and registered melody, with audioMode matching its docking state', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      robots.forEach((r) => {
        expect(AudioEngine.getVoiceForRobot(r.id)).not.toBeNull();
        expect(AudioEngine.getRegisteredMelody(r.id).length).toBeGreaterThan(0);
        expect(r.audioMode).toBe(r.docking === DockingState.Active ? 'none' : 'mute');
      });
    });

    it('is deterministic — spawning against the same coordinates reproduces the same active/docked split', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      const dockingRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.docking);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      const dockingRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.docking);

      expect(dockingRun2).toEqual(dockingRun1);
    });

    // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.4) — each robot's own seeded
    // UI-chrome identity color, generated the same way generateRobotName already is.
    it('gives every robot an identityColor from ROBOT_IDENTITY_COLOR_NAMES\' resolved hex set', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const validColors = ROBOT_IDENTITY_COLOR_NAMES.map((name) => ACCENT_COLORS[name]);
      robots.forEach((r) => {
        expect(validColors).toContain(r.identityColor);
      });
    });

    it('never assigns black, white, or darkGray as a robot\'s identityColor', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      robots.forEach((r) => {
        expect(r.identityColor).not.toBe(ACCENT_COLORS.black);
        expect(r.identityColor).not.toBe(ACCENT_COLORS.white);
        expect(r.identityColor).not.toBe(ACCENT_COLORS.darkGray);
      });
    });

    it('does not collapse every robot to the same identityColor', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const distinctColors = new Set(robots.map((r) => r.identityColor));
      expect(distinctColors.size).toBeGreaterThan(1);
    });

    it('is deterministic — spawning against the same coordinates reproduces the same identityColor per robot', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      const colorsRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.identityColor);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      const colorsRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.identityColor);

      expect(colorsRun2).toEqual(colorsRun1);
    });
  });

  describe('generateCompanyName', () => {
    it('returns an "Adjective Noun" pair drawn from ADJECTIVES and COMPANY_NOUNS', () => {
      const name = generateCompanyName(deterministicNoiseMap, 0);
      const [adjective, noun] = name.split(' ');
      expect(ADJECTIVES).toContain(adjective);
      expect(COMPANY_NOUNS).toContain(noun);
    });

    it('COMPANY_NOUNS is a distinct list from robot naming — never the literal word "Drifter" (a robot NOUNS entry), so a company name can never take the exact same word-pair form a robot name can', () => {
      expect(COMPANY_NOUNS).not.toContain('Drifter');
    });
  });

  describe('spawnInitialCompanies', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it(`creates between ${INITIAL_COMPANIES_MIN} and ${INITIAL_COMPANIES_MAX} companies`, () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      expect(companies.length).toBeGreaterThanOrEqual(INITIAL_COMPANIES_MIN);
      expect(companies.length).toBeLessThanOrEqual(INITIAL_COMPANIES_MAX);
    });

    it(`gives each company between ${COMPANY_SIZE_MIN} and ${COMPANY_SIZE_MAX} members`, () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      companies.forEach((c) => {
        expect(c.robotIds.length).toBeGreaterThanOrEqual(COMPANY_SIZE_MIN);
        expect(c.robotIds.length).toBeLessThanOrEqual(COMPANY_SIZE_MAX);
      });
    });

    it('never lets the same robot ID appear in more than one company (disjoint membership)', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      const allMemberIds = companies.flatMap((c) => c.robotIds);
      expect(new Set(allMemberIds).size).toBe(allMemberIds.length);
    });

    it('sets companyId on every claimed robot to match the company that claimed it', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      locale.companies.forEach((c) => {
        c.robotIds.forEach((id) => {
          expect(locale.robots.find((r) => r.id === id)?.companyId).toBe(c.id);
        });
      });
    });

    // Roadmap: Company Section Enhancements (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.2) —
    // each company's own seeded identity color, generated the same way generateRobotIdentityColor
    // already is (mirrors the identityColor test block above).
    it('gives every company a color from ROBOT_IDENTITY_COLOR_NAMES\' resolved hex set', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      const validColors = ROBOT_IDENTITY_COLOR_NAMES.map((name) => ACCENT_COLORS[name]);
      companies.forEach((c) => {
        expect(validColors).toContain(c.color);
      });
    });

    it('never assigns black, white, or darkGray as a company\'s color', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      companies.forEach((c) => {
        expect(c.color).not.toBe(ACCENT_COLORS.black);
        expect(c.color).not.toBe(ACCENT_COLORS.white);
        expect(c.color).not.toBe(ACCENT_COLORS.darkGray);
      });
    });

    it('is deterministic — spawning against the same coordinates reproduces the same color per company', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      run1.spawnInitialCompanies(attenuationStyle1.DEFAULT_LOCALE_ID);
      const colorsRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.companies ?? []).map((c) => c.color);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      run2.spawnInitialCompanies(attenuationStyle2.DEFAULT_LOCALE_ID);
      const colorsRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.companies ?? []).map((c) => c.color);

      expect(colorsRun2).toEqual(colorsRun1);
    });

    it('leaves every unclaimed robot Freelance (companyId undefined)', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      const claimedIds = new Set(locale.companies.flatMap((c) => c.robotIds));
      locale.robots.filter((r) => !claimedIds.has(r.id)).forEach((r) => {
        expect(r.companyId).toBeUndefined();
      });
    });

    it('leaves at least one robot Freelance across a sample of locales — not every robot is claimed by design', () => {
      const leftoverCounts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const localeId = `freelance-sample-${i}`;
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: i * 7 + 1, y: i * 3 + 2 }, robots: [], companies: [] } },
        }));
        spawnInitialRoster(localeId);
        spawnInitialCompanies(localeId);
        const locale = useLocaleStore.getState().getLocaleById(localeId)!;
        const claimedIds = new Set(locale.companies.flatMap((c) => c.robotIds));
        leftoverCounts.push(locale.robots.filter((r) => !claimedIds.has(r.id)).length);
      }
      expect(leftoverCounts.some((n) => n > 0)).toBe(true);
    });

    it('every company gets a generated "Adjective Noun" name', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      companies.forEach((c) => {
        const [adjective, noun] = c.name.split(' ');
        expect(ADJECTIVES).toContain(adjective);
        expect(COMPANY_NOUNS).toContain(noun);
      });
    });

    it('is deterministic — spawning against the same coordinates reproduces the same company count, membership, and names', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      run1.spawnInitialCompanies(attenuationStyle1.DEFAULT_LOCALE_ID);
      const companiesRun1 = store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.companies ?? [];

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      run2.spawnInitialCompanies(attenuationStyle2.DEFAULT_LOCALE_ID);
      const companiesRun2 = store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.companies ?? [];

      expect(companiesRun2).toEqual(companiesRun1);
    });

    // Roadmap: Robot Selection Filter Panel Polish §1.4 — reverses the "accepted, low-risk"
    // decision docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §7 item 2 previously made: two companies
    // spawned in the same locale must never share a color, closing the same gap
    // pickRandomCompanyColor (CompanyCrudControls.tsx, manual creation) already closed.
    it('never assigns two companies in the same locale the same color, across a sample of locales', () => {
      for (let i = 0; i < 15; i++) {
        const localeId = `color-collision-sample-${i}`;
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: i * 11 + 3, y: i * 5 + 2 }, robots: [], companies: [] } },
        }));
        spawnInitialRoster(localeId);
        spawnInitialCompanies(localeId);
        const companies = useLocaleStore.getState().getLocaleById(localeId)?.companies ?? [];
        const colors = companies.map((c) => c.color);
        expect(new Set(colors).size).toBe(colors.length);
      }
    });
  });

  describe('generateCompanyIdentityColor', () => {
    const noiseMap = createNoise2D(alea('color-collision-fix-test-seed'));

    it('matches a plain getSeededVal draw when usedColors is empty — unchanged for a non-colliding seed', () => {
      const expected = ACCENT_COLORS[
        ROBOT_IDENTITY_COLOR_NAMES[
          Math.min(
            ROBOT_IDENTITY_COLOR_NAMES.length - 1,
            Math.floor(getSeededVal(noiseMap, 'company.identityColor', 0, 0, ROBOT_IDENTITY_COLOR_NAMES.length)),
          )
        ]
      ];
      expect(generateCompanyIdentityColor(noiseMap, 0, [])).toBe(expected);
    });

    it('is deterministic — identical arguments (including usedColors) produce identical output', () => {
      const first = generateCompanyIdentityColor(noiseMap, 2, [ACCENT_COLORS.red]);
      const second = generateCompanyIdentityColor(noiseMap, 2, [ACCENT_COLORS.red]);
      expect(second).toBe(first);
    });

    it('retries to a different color when the attempt-0 draw is already in usedColors', () => {
      const attempt0Color = generateCompanyIdentityColor(noiseMap, 0, []);
      const retried = generateCompanyIdentityColor(noiseMap, 0, [attempt0Color]);
      expect(retried).not.toBe(attempt0Color);
      expect(ROBOT_IDENTITY_COLOR_NAMES.map((name) => ACCENT_COLORS[name])).toContain(retried);
    });

    // Bounded retries (18 attempts, matching pickRandomCompanyColor's own bound), not an
    // exhaustive search — same non-guarantee pickRandomCompanyColor already has (a probabilistic
    // draw can revisit an already-tried color within its own attempt budget). Never triggered in
    // practice (INITIAL_COMPANIES_MAX is 3, far under the 18-color palette); this only proves the
    // loop terminates and still returns a valid palette color rather than throwing or hanging.
    it('terminates and returns a valid palette color even when the bound is exhausted (all colors excluded)', () => {
      const everyColor = ROBOT_IDENTITY_COLOR_NAMES.map((name) => ACCENT_COLORS[name]);
      const result = generateCompanyIdentityColor(noiseMap, 0, everyColor);
      expect(everyColor).toContain(result);
    });
  });

  // Session Storage (Roadmap Phase 20, docs/specs/SESSION_STORAGE.md) needs a way to compute
  // "what the seed alone would have produced" for a robot, without touching the live store, so a
  // saved override diff can be compared against it. generateRobotAudioBaseline/
  // generateRobotRosterBaseline are a pure, additive parallel to spawnRobot's own generate-or-copy
  // decision tree — NOT a refactor of spawnRobot itself (spawnRobot's own inline logic is
  // untouched; see docs/tasks/SESSION_STORAGE.md Task 2's note on this deviation from the
  // original plan, made after discovering spawnRobot's ~30% "copy an earlier sibling" branch,
  // which depends on the live store's accumulated robots — replaying it purely requires this
  // function to take that pool as an explicit array argument instead).
  describe('generateRobotAudioBaseline / generateRobotRosterBaseline', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it('with no prior baselines, generates fresh values identical to a real spawnRobot at spawnCount 0', () => {
      const localeId = 'baseline-parity-fresh-locale';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
      }));
      spawnRobot(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];

      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      const baseline = generateRobotAudioBaseline(noiseMap, 0, []);

      expect(baseline.name).toBe(robot.name);
      expect(baseline.audioAttributes).toEqual(robot.audioAttributes);
      expect(baseline.octaveRange).toEqual(robot.octaveRange);
      expect(baseline.rhythmicDensity).toBe(robot.rhythmicDensity);
      expect(baseline.rhythmicMotifLength).toEqual(robot.rhythmicMotifLength);
      expect(baseline.noteVariance).toEqual(robot.noteVariance);
      expect(baseline.pitchRepeat).toBe(robot.pitchRepeat);
      expect(baseline.lfoSettings).toEqual(robot.lfoSettings);
    });

    it('reproduces every field of a full real 12-robot roster (spawnInitialRoster), including any copied siblings', () => {
      const localeId = 'baseline-parity-full-roster-locale';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
      }));
      spawnInitialRoster(localeId);
      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      const robots = locale.robots;
      expect(robots.length).toBeGreaterThan(0); // sanity: MAX_ROBOTS, not an empty roster

      const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      const baselines = generateRobotRosterBaseline(noiseMap, robots.length);

      expect(baselines.length).toBe(robots.length);
      robots.forEach((robot, i) => {
        expect(baselines[i].name, `robot ${i} (${robot.id}) name`).toBe(robot.name);
        expect(baselines[i].audioAttributes, `robot ${i} (${robot.id}) audioAttributes`).toEqual(robot.audioAttributes);
        expect(baselines[i].octaveRange, `robot ${i} (${robot.id}) octaveRange`).toEqual(robot.octaveRange);
        expect(baselines[i].rhythmicDensity, `robot ${i} (${robot.id}) rhythmicDensity`).toBe(robot.rhythmicDensity);
        expect(baselines[i].rhythmicMotifLength, `robot ${i} (${robot.id}) rhythmicMotifLength`).toEqual(robot.rhythmicMotifLength);
        expect(baselines[i].noteVariance, `robot ${i} (${robot.id}) noteVariance`).toEqual(robot.noteVariance);
        expect(baselines[i].pitchRepeat, `robot ${i} (${robot.id}) pitchRepeat`).toBe(robot.pitchRepeat);
        expect(baselines[i].lfoSettings, `robot ${i} (${robot.id}) lfoSettings`).toEqual(robot.lfoSettings);
      });
    });

    it('takes the copy branch (reuses a prior baseline by reference) at roughly the same ~30% rate spawnRobot itself uses', () => {
      // No store involved at all -- generateRobotRosterBaseline is pure. 30 entries at a ~30%
      // per-entry copy chance makes at least one copy virtually certain (P(zero) ~= 0.7^29),
      // mirroring the existing "a copied robot inherits..." spawnRobot tests' own sample size.
      const noiseMap = createNoise2D(alea('baseline-copy-branch-test-seed'));
      const baselines = generateRobotRosterBaseline(noiseMap, 30);

      const bySettings = new Map<typeof baselines[number]['lfoSettings'], number[]>();
      baselines.forEach((b, i) => {
        const group = bySettings.get(b.lfoSettings) ?? [];
        group.push(i);
        bySettings.set(b.lfoSettings, group);
      });
      const sharedGroup = [...bySettings.values()].find((indices) => indices.length > 1);
      expect(sharedGroup, 'expected at least one entry to share an earlier entry\'s lfoSettings reference (a copy)').toBeDefined();

      const [earlierIdx, laterIdx] = sharedGroup!;
      // A copy reuses the SAME lfoSettings (and audioAttributes/octaveRange/etc.) object by
      // reference, not a freshly-generated equivalent one -- matching spawnRobot's own
      // "source.lfoSettings" (no re-generation) on the copy path. name is the one field that's
      // never copied (generated fresh even on a copy, see generateRobotAudioBaseline's own doc
      // comment) -- not asserted here, since two different spawnCounts could coincidentally
      // generate the same "Adjective Noun" name by chance, independent of copying.
      expect(baselines[laterIdx].lfoSettings).toBe(baselines[earlierIdx].lfoSettings);
      expect(baselines[laterIdx].audioAttributes).toBe(baselines[earlierIdx].audioAttributes);
    });
  });
});
