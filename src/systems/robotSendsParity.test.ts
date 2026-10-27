/**
 * Roadmap 55, Robot Sends: One Table for the Five Sends (docs/specs/ROBOT_SEND_TABLE.md assumption 11, §5 "The parity
 * test"; docs/tasks/ROBOT_SEND_TABLE.md Task 1). The oracle for a behaviour-free refactor: every recording below was taken
 * from a run on the branch base, main at 608c5b92 (the Robot Effect Sends merge, PR #569), before any refactor commit.
 *
 * NEVER RE-RECORD. A red case here means the refactor changed what the five sends seed, prime, encode or clamp; fix the
 * code, not the recording (`git log -p` on this file must show one commit). Case (e) was narrowed on purpose when
 * backlog 37 changed the swell pool (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §7 Q2); no recording was touched.
 *
 * Five groups: (a) seeds, (b) the updateRobotSends call sequence per entry point, (c) the share string, (d) the store
 * clamp, (e) the swell pool. Every hand-set fixture send is a distinct, non-default value, so a path that drops or
 * swaps a send cannot pass by matching a seed or a zero (the parity-fixture rule).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// As sessionDiff.test.ts: applySessionPayload calls retransmitWorld, whose initializeLocale starts the lifecycle and
// swell ticks; those subscribe to BeatClock, which needs a real AudioContext this jsdom environment does not have.
vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()),
  getCurrentMeasure: vi.fn(() => 0),
  scheduleRepeat: vi.fn(() => 'schedule-id'),
  cancelSchedule: vi.fn(),
  getCurrentMeasurePrecise: vi.fn(() => 0),
}));

import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import { AudioEngine } from '../engine/AudioEngine';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import type { Robot } from '../types/Robot';
import type { SessionPayload, RobotAudioOverrideDiff } from '../types/session';
import { SWELL_ROBOT_ATTRIBUTE_IDS } from '../types/audioSwell';
import { generateRobotRosterBaseline, spawnInitialRoster, reRegisterAllRobotsAudio } from './spawnSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopAudioSwells, tickAudioSwells, getActiveSwellSnapshot } from './audioSwells';
import { buildSessionPayload, applySessionPayload } from '../utils/sessionDiff';
import { decodeBlob, decodeWorldLink, encodeBlob, encodeWorldLinkParams } from '../utils/worldLink';
import { toCompactWorldDiff } from '../utils/worldDiffCodec';
import { precomputeDataX } from '../utils/getSeededVal';
import * as noiseMaps from '../utils/noiseMaps';

afterEach(() => {
  vi.restoreAllMocks();
  stopRobotLifecycle();
  stopAudioSwells();
});

// ========================================
// FIXTURES
// ========================================

const SEND_FIELDS = ['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const;
type SendField = (typeof SEND_FIELDS)[number];

/** A fixed plot, so the roster (and its robot ids) never depends on the suite's randomCoordinate mock order. */
const COORDINATES = { x: 31, y: 47 };

/** Five distinct, non-default hand-set sends, two decimals (what a session diff stores). */
const HAND_SET: Record<SendField, number> = { reverbSend: 0.62, delaySend: 0.18, gritSend: 0.47, shimmerSend: 0.09, doubleSend: 0.73 };
/** Three of the five, for the session restore (the diff carries only what moved). */
const SESSION_THREE: Partial<Record<SendField, number>> = { delaySend: 0.21, gritSend: 0.56, shimmerSend: 0.38 };

/** One world per case: a fresh locale id (the spawn counter is per locale) at the fixed plot, made current. */
function setupWorld(name: string): string {
  const localeId = `send-parity-${name}`;
  useAttenuationStyleStore.setState({
    attenuationStyles: [{ ...DEFAULT_PELAGOS, currentLocaleId: localeId }],
    currentAttenuationStyleId: DEFAULT_PELAGOS.id,
  });
  useLocaleStore.setState({
    locales: { [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: COORDINATES, robots: [], companies: [] } },
  });
  return localeId;
}

function currentRobots(): Robot[] {
  const style = useAttenuationStyleStore.getState().attenuationStyles.find((s) => s.id === useAttenuationStyleStore.getState().currentAttenuationStyleId);
  return style?.currentLocaleId ? (useLocaleStore.getState().getLocaleById(style.currentLocaleId)?.robots ?? []) : [];
}

const sendsOf = (robot: Robot): number[] => SEND_FIELDS.map((field) => robot[field]);

/** Loading a payload for another plot first wipes the hand-set world, so the real restore rebuilds it from the seed. */
const shifted = (payload: SessionPayload): SessionPayload => ({
  ...payload,
  coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 },
});

type Prime = [robotId: string, sends: string];

/** Every updateRobotSends call `run` makes, in order: the robot id and the sends object as JSON (which fixes key order). */
function recordPrimes(run: () => void): Prime[] {
  const spy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
  run();
  const calls = spy.mock.calls.map(([robotId, sends]): Prime => [robotId, JSON.stringify(sends)]);
  spy.mockRestore();
  return calls;
}

// ========================================
// RECORDINGS (608c5b92 — never re-record)
// ========================================

const SEEDED_SENDS: Record<string, number[][]> = {
  'send-table-parity-a': [
    [0.51, 0.08, 0, 0, 0],
    [0.26, 0.16, 0, 0, 0],
    [0.46, 0.19, 0, 0.28, 0],
    [0.46, 0.05, 0.78, 0, 0],
    [0.24, 0.08, 0.51, 0, 0],
    [0.41, 0.2, 0, 0, 0],
    [0.31, 0.13, 0, 0, 0],
    [0.16, 0, 0, 0.47, 0],
    [0.46, 0.21, 0, 0, 0],
    [0.44, 0.22, 0, 0, 0.5],
    [0.26, 0.15, 0, 0, 0],
    [0.38, 0.17, 0, 0.42, 0],
  ],
  'send-table-parity-b': [
    [0.48, 0.29, 0.49, 0, 0],
    [0.42, 0.08, 0, 0, 0],
    [0.47, 0.11, 0, 0.32, 0],
    [0.44, 0.17, 0, 0, 0],
    [0.48, 0.2, 0, 0, 0.48],
    [0.56, 0.21, 0.64, 0, 0],
    [0.46, 0.2, 0, 0, 0],
    [0.31, 0.12, 0, 0.27, 0],
    [0.51, 0.01, 0.58, 0, 0],
    [0.41, 0.07, 0, 0, 0],
    [0.43, 0.15, 0, 0, 0],
    [0.46, 0.22, 0, 0, 0],
  ],
};
const SPAWN_PRIMES: Prime[] = [
  ['robot-0-rtzgxb0h', '{"reverb":0.51,"delay":0.08,"grit":0,"shimmer":0,"double":0}'],
  ['robot-1-oc8copp5', '{"reverb":0.36,"delay":0.22,"grit":0,"shimmer":0,"double":0}'],
  ['robot-2-nq1zfwlz', '{"reverb":0.47,"delay":0.13,"grit":0.42,"shimmer":0,"double":0}'],
  ['robot-3-spaohmu8', '{"reverb":0.5,"delay":0.2,"grit":0,"shimmer":0,"double":0}'],
  ['robot-4-g9rrd94w', '{"reverb":0.23,"delay":0.03,"grit":0,"shimmer":0,"double":0.44}'],
  ['robot-5-gu8i8m8l', '{"reverb":0.29,"delay":0.21,"grit":0,"shimmer":0,"double":0}'],
  ['robot-6-50bzozmg', '{"reverb":0.3,"delay":0.2,"grit":0,"shimmer":0.28,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.21,"delay":0,"grit":0,"shimmer":0,"double":0.33}'],
  ['robot-8-jq9k9pbv', '{"reverb":0.33,"delay":0.22,"grit":0,"shimmer":0,"double":0}'],
  ['robot-9-tmw8lmz4', '{"reverb":0.45,"delay":0.03,"grit":0,"shimmer":0,"double":0}'],
  ['robot-10-ug4nah4e', '{"reverb":0.57,"delay":0.15,"grit":0,"shimmer":0,"double":0.35}'],
  ['robot-11-ri6s5np6', '{"reverb":0.51,"delay":0.07,"grit":0,"shimmer":0,"double":0}'],
];
const RE_REGISTER_PRIMES: Prime[] = [
  ['robot-0-rtzgxb0h', '{"reverb":0.51,"delay":0.08,"grit":0,"shimmer":0,"double":0}'],
  ['robot-1-oc8copp5', '{"reverb":0.62,"delay":0.18,"grit":0.47,"shimmer":0.09,"double":0.73}'],
  ['robot-2-nq1zfwlz', '{"reverb":0.47,"delay":0.13,"grit":0.42,"shimmer":0,"double":0}'],
  ['robot-3-spaohmu8', '{"reverb":0.5,"delay":0.2,"grit":0,"shimmer":0,"double":0}'],
  ['robot-4-g9rrd94w', '{"reverb":0.23,"delay":0.03,"grit":0,"shimmer":0,"double":0.44}'],
  ['robot-5-gu8i8m8l', '{"reverb":0.29,"delay":0.21,"grit":0,"shimmer":0,"double":0}'],
  ['robot-6-50bzozmg', '{"reverb":0.3,"delay":0.2,"grit":0,"shimmer":0.28,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.21,"delay":0,"grit":0,"shimmer":0,"double":0.33}'],
  ['robot-8-jq9k9pbv', '{"reverb":0.33,"delay":0.22,"grit":0,"shimmer":0,"double":0}'],
  ['robot-9-tmw8lmz4', '{"reverb":0.45,"delay":0.03,"grit":0,"shimmer":0,"double":0}'],
  ['robot-10-ug4nah4e', '{"reverb":0.57,"delay":0.15,"grit":0,"shimmer":0,"double":0.35}'],
  ['robot-11-ri6s5np6', '{"reverb":0.51,"delay":0.07,"grit":0,"shimmer":0,"double":0}'],
];
const RE_RESERVE_PRIMES: Prime[] = [
  ['robot-4-g9rrd94w', '{"reverb":0.62,"delay":0.18,"grit":0.47,"shimmer":0.09,"double":0.73}'],
];
const SESSION_RESTORE_PRIMES: Prime[] = [
  ['robot-0-rtzgxb0h', '{"reverb":0.51,"delay":0.08,"grit":0,"shimmer":0,"double":0}'],
  ['robot-1-oc8copp5', '{"reverb":0.36,"delay":0.22,"grit":0,"shimmer":0,"double":0}'],
  ['robot-2-nq1zfwlz', '{"reverb":0.47,"delay":0.13,"grit":0.42,"shimmer":0,"double":0}'],
  ['robot-3-spaohmu8', '{"reverb":0.5,"delay":0.2,"grit":0,"shimmer":0,"double":0}'],
  ['robot-4-g9rrd94w', '{"reverb":0.23,"delay":0.03,"grit":0,"shimmer":0,"double":0.44}'],
  ['robot-5-gu8i8m8l', '{"reverb":0.29,"delay":0.21,"grit":0,"shimmer":0,"double":0}'],
  ['robot-6-50bzozmg', '{"reverb":0.3,"delay":0.2,"grit":0,"shimmer":0.28,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.21,"delay":0,"grit":0,"shimmer":0,"double":0.33}'],
  ['robot-8-jq9k9pbv', '{"reverb":0.33,"delay":0.22,"grit":0,"shimmer":0,"double":0}'],
  ['robot-9-tmw8lmz4', '{"reverb":0.45,"delay":0.03,"grit":0,"shimmer":0,"double":0}'],
  ['robot-10-ug4nah4e', '{"reverb":0.57,"delay":0.15,"grit":0,"shimmer":0,"double":0.35}'],
  ['robot-11-ri6s5np6', '{"reverb":0.51,"delay":0.07,"grit":0,"shimmer":0,"double":0}'],
  ['robot-2-nq1zfwlz', '{"delay":0.21,"grit":0.56,"shimmer":0.38}'],
];
const SHARE_RESTORE_PRIMES: Prime[] = [
  ['robot-0-rtzgxb0h', '{"reverb":0.51,"delay":0.08,"grit":0,"shimmer":0,"double":0}'],
  ['robot-1-oc8copp5', '{"reverb":0.36,"delay":0.22,"grit":0,"shimmer":0,"double":0}'],
  ['robot-2-nq1zfwlz', '{"reverb":0.47,"delay":0.13,"grit":0.42,"shimmer":0,"double":0}'],
  ['robot-3-spaohmu8', '{"reverb":0.5,"delay":0.2,"grit":0,"shimmer":0,"double":0}'],
  ['robot-4-g9rrd94w', '{"reverb":0.23,"delay":0.03,"grit":0,"shimmer":0,"double":0.44}'],
  ['robot-5-gu8i8m8l', '{"reverb":0.29,"delay":0.21,"grit":0,"shimmer":0,"double":0}'],
  ['robot-6-50bzozmg', '{"reverb":0.3,"delay":0.2,"grit":0,"shimmer":0.28,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.21,"delay":0,"grit":0,"shimmer":0,"double":0.33}'],
  ['robot-8-jq9k9pbv', '{"reverb":0.33,"delay":0.22,"grit":0,"shimmer":0,"double":0}'],
  ['robot-9-tmw8lmz4', '{"reverb":0.45,"delay":0.03,"grit":0,"shimmer":0,"double":0}'],
  ['robot-10-ug4nah4e', '{"reverb":0.57,"delay":0.15,"grit":0,"shimmer":0,"double":0.35}'],
  ['robot-11-ri6s5np6', '{"reverb":0.51,"delay":0.07,"grit":0,"shimmer":0,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.62,"delay":0.18,"grit":0.47,"shimmer":0.09,"double":0.73}'],
];
// The forced start lands on robot 11's Delay send (seeded 0.07): eight writes up to the peak, seven down, landing exactly.
const SWELL_PRIMES: Prime[] = [
  ['robot-11-ri6s5np6', '{"delay":0.15937500000000002}'],
  ['robot-11-ri6s5np6', '{"delay":0.24875000000000003}'],
  ['robot-11-ri6s5np6', '{"delay":0.33812500000000006}'],
  ['robot-11-ri6s5np6', '{"delay":0.42750000000000005}'],
  ['robot-11-ri6s5np6', '{"delay":0.516875}'],
  ['robot-11-ri6s5np6', '{"delay":0.6062500000000002}'],
  ['robot-11-ri6s5np6', '{"delay":0.6956250000000002}'],
  ['robot-11-ri6s5np6', '{"delay":0.7850000000000001}'],
  ['robot-11-ri6s5np6', '{"delay":0.682857142857143}'],
  ['robot-11-ri6s5np6', '{"delay":0.5807142857142857}'],
  ['robot-11-ri6s5np6', '{"delay":0.4785714285714286}'],
  ['robot-11-ri6s5np6', '{"delay":0.3764285714285715}'],
  ['robot-11-ri6s5np6', '{"delay":0.2742857142857143}'],
  ['robot-11-ri6s5np6', '{"delay":0.1721428571428572}'],
  ['robot-11-ri6s5np6', '{"delay":0.07}'],
];
const SHARE_WIRE_JSON =
  '{"v":2,"n":"Send Parity","c":{"x":31,"y":47},"g":{},"r":{"parity-robot":{"rd":37,"p":-0.35,"rs":0.62,"ds":0.18,"gr":0.47,"sm":0.09,"db":0.73,"dy":41}}}';
const CLAMPED_SENDS: number[] = [1, 0.18, 0, 1, 0.73];

// ========================================
// TESTS
// ========================================

describe('Robot sends parity (roadmap 55 oracle, recorded at 608c5b92)', () => {
  it('(a) seeds all five sends, value for value, for two twelve-robot rosters', () => {
    const actual: Record<string, number[][]> = {};
    for (const seed of ['send-table-parity-a', 'send-table-parity-b']) {
      actual[seed] = generateRobotRosterBaseline(createNoise2D(alea(seed)), 12).map((b) => SEND_FIELDS.map((f) => b[f]));
    }
    expect(actual).toEqual(SEEDED_SENDS);
  });

  describe('(b) primes every reservation and restore in order', () => {
    it('spawn: spawnInitialRoster primes each spawned robot with its own five sends', () => {
      const localeId = setupWorld('spawn');
      const primes = recordPrimes(() => spawnInitialRoster(localeId));
      expect(primes).toEqual(SPAWN_PRIMES);
    });

    it('reRegisterAllRobotsAudio re-primes the whole roster, a hand-set robot with its hand-set sends', () => {
      const localeId = setupWorld('re-register');
      spawnInitialRoster(localeId);
      const target = currentRobots()[1];
      expect(sendsOf(target)).not.toEqual(Object.values(HAND_SET)); // precondition: the hand-set values are not the seed
      useLocaleStore.getState().updateRobot(localeId, target.id, HAND_SET);

      const primes = recordPrimes(() => reRegisterAllRobotsAudio(localeId));
      expect(primes).toEqual(RE_REGISTER_PRIMES);
    });

    it('AudioEngine.reReserveVoice hands the rebuilt voice the stored sends', () => {
      const localeId = setupWorld('re-reserve');
      spawnInitialRoster(localeId);
      const target = currentRobots()[4];
      useLocaleStore.getState().updateRobot(localeId, target.id, HAND_SET);

      const primes = recordPrimes(() => AudioEngine.reReserveVoice(target.id));
      expect(primes).toEqual(RE_RESERVE_PRIMES);
    });

    it('applySessionPayload: the rebuilt roster at its seeds, then the three carried sends last', () => {
      const localeId = setupWorld('session-restore');
      spawnInitialRoster(localeId);
      const target = currentRobots()[2];
      useLocaleStore.getState().updateRobot(localeId, target.id, SESSION_THREE);
      const payload = buildSessionPayload();
      expect(payload.robotOverrides[target.id]).toEqual(SESSION_THREE); // precondition: the diff carries exactly three
      applySessionPayload(shifted(payload));

      const primes = recordPrimes(() => applySessionPayload(payload));
      expect(primes).toEqual(SESSION_RESTORE_PRIMES);
    });

    it('a share link decoded and restored primes the same way, all five carried sends last', () => {
      const localeId = setupWorld('share-restore');
      spawnInitialRoster(localeId);
      const target = currentRobots()[7];
      useLocaleStore.getState().updateRobot(localeId, target.id, HAND_SET);
      const payload = buildSessionPayload();
      expect(payload.robotOverrides[target.id]).toEqual(HAND_SET); // precondition: the diff carries all five
      applySessionPayload(shifted(payload));
      const decoded = decodeWorldLink(`?${encodeWorldLinkParams(payload).toString()}`);
      expect(decoded).not.toBeNull();

      const primes = recordPrimes(() => applySessionPayload(decoded!));
      expect(primes).toEqual(SHARE_RESTORE_PRIMES);
    });

    // Spec §7 Q4: the public tick, with the robot-pool start forced the way sessionDiff.test.ts's mid-swell cases force
    // it (the attenuation-style noise map mocked per dataId). 'audioSwell.target.robot' at 1 picks the last eligible
    // pair, and the sends are the pool's tail, so the swell lands on a send.
    it('tickAudioSwells writes a send swell through updateRobotSends, ramp and landing', () => {
      const localeId = setupWorld('swell');
      spawnInitialRoster(localeId);
      useAudioStore.setState({ swellFrequency: 16, swellDuration: 15, pingVarianceAutomation: 1 });
      const byX = new Map<number, number>([
        [precomputeDataX('audioSwell.trigger.robot'), -1], // the robot pool fires
        [precomputeDataX('audioSwell.company.chance'), 1], // a single-robot swell
        [precomputeDataX('audioSwell.target.robot'), 1], // the last eligible pair
        [precomputeDataX('audioSwell.trigger.global'), 1], // the global pool stays quiet
      ]);
      vi.spyOn(noiseMaps, 'getAttenuationStyleNoiseMap').mockReturnValue(((x: number) => byX.get(x) ?? 0) as never);

      const primes = recordPrimes(() => {
        tickAudioSwells(localeId, 0);
        const swell = getActiveSwellSnapshot('robot')[0];
        expect(SEND_FIELDS as readonly string[]).toContain(swell?.robotAttribute); // precondition: the start is a send
        expect(getActiveSwellSnapshot('robot')).toHaveLength(1);
        byX.set(precomputeDataX('audioSwell.trigger.robot'), 1); // no further starts: this one swell rides to its landing
        for (let measure = 1; measure <= 40; measure++) tickAudioSwells(localeId, measure);
        expect(getActiveSwellSnapshot('robot')).toEqual([]); // precondition: it ran to its landing
      });
      expect(primes).toEqual(SWELL_PRIMES);
    });
  });

  it('(c) encodes all five sends to the recorded share codes, between pan and dynamics, and decodes them back', () => {
    const diff: RobotAudioOverrideDiff = { rhythmicDensity: 37, pan: -0.35, ...HAND_SET, dynamics: 41 };
    // The `?session=` codec this was recorded against is gone (docs/tasks/SHORT_WORLD_LINK.md Task 7). The world link's
    // blob carries a robot's diff under `r` with the same codes in the same order, so the recording's `r` is still the
    // oracle; the blob itself is checked by what it decodes to, never by its deflate bytes (spec risk 3).
    const robotOverrides = { 'parity-robot': diff };
    const recordedR = (JSON.parse(SHARE_WIRE_JSON) as { r: unknown }).r;
    expect(JSON.stringify(toCompactWorldDiff({ robotOverrides }).r)).toBe(JSON.stringify(recordedR));
    expect(decodeBlob(encodeBlob({ robotOverrides }))?.robotOverrides).toEqual(robotOverrides);
  });

  it('(d) updateRobot clamps an out-of-range send, drops a NaN one and keeps the stored value', () => {
    const localeId = setupWorld('clamp');
    spawnInitialRoster(localeId);
    const target = currentRobots()[3];
    useLocaleStore.getState().updateRobot(localeId, target.id, HAND_SET);

    useLocaleStore.getState().updateRobot(localeId, target.id, { reverbSend: 7, delaySend: NaN, gritSend: -1, shimmerSend: Infinity });
    const clamped = sendsOf(currentRobots().find((r) => r.id === target.id)!);
    expect(clamped).toEqual(CLAMPED_SENDS);
  });

  it('(e) the five sends are the robot swell pool tail, in table order', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS.slice(-SEND_FIELDS.length)).toEqual([...SEND_FIELDS]);
    const head: readonly string[] = SWELL_ROBOT_ATTRIBUTE_IDS.slice(0, -SEND_FIELDS.length);
    for (const field of SEND_FIELDS) expect(head, field).not.toContain(field);
  });

  it('self-check: every recording is non-empty and the hand-set fixtures are distinct, non-default values', () => {
    for (const [name, recording] of Object.entries({
      SPAWN_PRIMES, RE_REGISTER_PRIMES, RE_RESERVE_PRIMES, SESSION_RESTORE_PRIMES, SHARE_RESTORE_PRIMES, SWELL_PRIMES, CLAMPED_SENDS,
    })) {
      expect(recording.length, name).toBeGreaterThan(0);
    }
    expect(Object.keys(SEEDED_SENDS)).toHaveLength(2);
    for (const roster of Object.values(SEEDED_SENDS)) expect(new Set(roster.flat()).size, 'seeded sends vary').toBeGreaterThan(5);
    expect(SHARE_WIRE_JSON.length).toBeGreaterThan(0);
    expect(new Set(Object.values(HAND_SET)).size, 'five distinct hand-set sends').toBe(5);
    expect(new Set(Object.values(SESSION_THREE)).size).toBe(3);
    for (const value of [...Object.values(HAND_SET), ...Object.values(SESSION_THREE)]) {
      expect(value, 'never a default 0 or a clamp edge').toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });
});
