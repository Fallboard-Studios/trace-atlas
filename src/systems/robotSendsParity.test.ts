/**
 * Roadmap 55, Robot Sends: One Table for the Five Sends (docs/specs/ROBOT_SEND_TABLE.md assumption 11, §5 "The parity
 * test"; docs/tasks/ROBOT_SEND_TABLE.md Task 1). The oracle for a behaviour-free refactor: every recording below was taken
 * from a run on the branch base, main at 608c5b92 (the Robot Effect Sends merge, PR #569), before any refactor commit.
 *
 * NEVER RE-RECORD. A red case here means the refactor changed what the five sends seed, prime, encode or clamp; fix the
 * code, not the recording. Case (e) was narrowed on purpose when backlog 37 changed the swell pool
 * (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §7 Q2); no recording was touched. The one re-recording: Even Seeded Draws
 * T9a (Crawford, 2026-11-02; docs/tasks/EVEN_SEEDED_DRAWS.md) moved the Reverb and Delay send draws to the even draw on
 * purpose, so SEEDED_SENDS and the five seeded primes were captured again from that code, every case, fixture and
 * precondition unchanged. `git log -p` on this file shows the original recording (9600610b) and this one; its other
 * commits touched no recording.
 *
 * Company Families Task 5 (docs/tasks/COMPANY_FAMILIES.md, B5) changed what spawn primes on purpose: a company member
 * carries its founder's five sends. No recording was touched. (a) reads each index's own draw (every recorded row was
 * one, the old copies included), and the (b) cases expect each seeded member row to be its founder's recorded row
 * (`asFamilies`).
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

// The swell rolls draw even (docs/tasks/EVEN_SEEDED_DRAWS.md T16): the swell case forces them through T3's tagged stub
// maps, which this wrapper steers; every real map, the whole oracle's, passes through to the real draw.
vi.mock('../utils/getSeededVal', async (importOriginal) => {
  const { steerSeededDraws } = await import('../testUtils/seededDraws');
  return steerSeededDraws(await importOriginal<typeof import('../utils/getSeededVal')>());
});

import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import { AudioEngine } from '../engine/AudioEngine';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import type { Robot } from '../types/Robot';
import type { SessionPayload, RobotAudioOverrideDiff } from '../types/session';
import { SWELL_ROBOT_ATTRIBUTE_IDS } from '../types/audioSwell';
import { companyFounders, generateCompanyMembership, generateRobotSends, spawnInitialRoster, reRegisterAllRobotsAudio } from './spawnSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopAudioSwells, tickAudioSwells, getActiveSwellSnapshot } from './audioSwells';
import { buildSessionPayload, applySessionPayload } from '../utils/sessionDiff';
import { decodeBlob, decodeWorldLink, encodeBlob, encodeWorldLinkParams } from '../utils/worldLink';
import { toCompactWorldDiff } from '../utils/worldDiffCodec';
import { noiseMapForDataIds } from '../testUtils/seededDraws';
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
// RECORDINGS (608c5b92; re-recorded once at Even Seeded Draws T9a — never otherwise)
// ========================================

const SEEDED_SENDS: Record<string, number[][]> = {
  'send-table-parity-a': [
    [0.11, 0.05, 0, 0, 0],
    [0.31, 0.23, 0, 0, 0],
    [0.37, 0, 0, 0.28, 0],
    [0.51, 0, 0.78, 0, 0],
    [0.5, 0.01, 0.51, 0, 0],
    [0.46, 0.16, 0, 0, 0],
    [0.57, 0, 0, 0, 0],
    [0.53, 0.02, 0, 0.47, 0],
    [0.47, 0, 0, 0, 0],
    [0.19, 0.13, 0, 0, 0.5],
    [0.2, 0.23, 0, 0, 0],
    [0.18, 0.08, 0, 0.42, 0],
  ],
  'send-table-parity-b': [
    [0.1, 0, 0.49, 0, 0],
    [0.38, 0.12, 0, 0, 0],
    [0.3, 0.08, 0, 0.32, 0],
    [0.43, 0.27, 0, 0, 0],
    [0.13, 0.1, 0, 0, 0.48],
    [0.43, 0.19, 0.64, 0, 0],
    [0.1, 0, 0, 0, 0],
    [0.21, 0.03, 0, 0.27, 0],
    [0.48, 0.29, 0.58, 0, 0],
    [0.56, 0, 0, 0, 0],
    [0.45, 0.18, 0, 0, 0],
    [0.15, 0.23, 0, 0, 0],
  ],
};
const SPAWN_PRIMES: Prime[] = [
  ['robot-0-rtzgxb0h', '{"reverb":0.15,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-1-oc8copp5', '{"reverb":0.23,"delay":0.13,"grit":0,"shimmer":0,"double":0}'],
  ['robot-2-nq1zfwlz', '{"reverb":0.1,"delay":0.29,"grit":0.42,"shimmer":0,"double":0}'],
  ['robot-3-spaohmu8', '{"reverb":0.58,"delay":0.27,"grit":0,"shimmer":0,"double":0}'],
  ['robot-4-g9rrd94w', '{"reverb":0.18,"delay":0,"grit":0,"shimmer":0,"double":0.44}'],
  ['robot-5-gu8i8m8l', '{"reverb":0.58,"delay":0.14,"grit":0,"shimmer":0,"double":0}'],
  ['robot-6-50bzozmg', '{"reverb":0.45,"delay":0.09,"grit":0,"shimmer":0.28,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.18,"delay":0.08,"grit":0,"shimmer":0,"double":0.33}'],
  ['robot-8-jq9k9pbv', '{"reverb":0.22,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-9-tmw8lmz4', '{"reverb":0.48,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-10-ug4nah4e', '{"reverb":0.2,"delay":0.02,"grit":0,"shimmer":0,"double":0.35}'],
  ['robot-11-ri6s5np6', '{"reverb":0.2,"delay":0.25,"grit":0,"shimmer":0,"double":0}'],
];
const RE_REGISTER_PRIMES: Prime[] = [
  ['robot-0-rtzgxb0h', '{"reverb":0.15,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-1-oc8copp5', '{"reverb":0.62,"delay":0.18,"grit":0.47,"shimmer":0.09,"double":0.73}'],
  ['robot-2-nq1zfwlz', '{"reverb":0.1,"delay":0.29,"grit":0.42,"shimmer":0,"double":0}'],
  ['robot-3-spaohmu8', '{"reverb":0.58,"delay":0.27,"grit":0,"shimmer":0,"double":0}'],
  ['robot-4-g9rrd94w', '{"reverb":0.18,"delay":0,"grit":0,"shimmer":0,"double":0.44}'],
  ['robot-5-gu8i8m8l', '{"reverb":0.58,"delay":0.14,"grit":0,"shimmer":0,"double":0}'],
  ['robot-6-50bzozmg', '{"reverb":0.45,"delay":0.09,"grit":0,"shimmer":0.28,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.18,"delay":0.08,"grit":0,"shimmer":0,"double":0.33}'],
  ['robot-8-jq9k9pbv', '{"reverb":0.22,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-9-tmw8lmz4', '{"reverb":0.48,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-10-ug4nah4e', '{"reverb":0.2,"delay":0.02,"grit":0,"shimmer":0,"double":0.35}'],
  ['robot-11-ri6s5np6', '{"reverb":0.2,"delay":0.25,"grit":0,"shimmer":0,"double":0}'],
];
const RE_RESERVE_PRIMES: Prime[] = [
  ['robot-4-g9rrd94w', '{"reverb":0.62,"delay":0.18,"grit":0.47,"shimmer":0.09,"double":0.73}'],
];
const SESSION_RESTORE_PRIMES: Prime[] = [
  ['robot-0-rtzgxb0h', '{"reverb":0.15,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-1-oc8copp5', '{"reverb":0.23,"delay":0.13,"grit":0,"shimmer":0,"double":0}'],
  ['robot-2-nq1zfwlz', '{"reverb":0.1,"delay":0.29,"grit":0.42,"shimmer":0,"double":0}'],
  ['robot-3-spaohmu8', '{"reverb":0.58,"delay":0.27,"grit":0,"shimmer":0,"double":0}'],
  ['robot-4-g9rrd94w', '{"reverb":0.18,"delay":0,"grit":0,"shimmer":0,"double":0.44}'],
  ['robot-5-gu8i8m8l', '{"reverb":0.58,"delay":0.14,"grit":0,"shimmer":0,"double":0}'],
  ['robot-6-50bzozmg', '{"reverb":0.45,"delay":0.09,"grit":0,"shimmer":0.28,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.18,"delay":0.08,"grit":0,"shimmer":0,"double":0.33}'],
  ['robot-8-jq9k9pbv', '{"reverb":0.22,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-9-tmw8lmz4', '{"reverb":0.48,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-10-ug4nah4e', '{"reverb":0.2,"delay":0.02,"grit":0,"shimmer":0,"double":0.35}'],
  ['robot-11-ri6s5np6', '{"reverb":0.2,"delay":0.25,"grit":0,"shimmer":0,"double":0}'],
  ['robot-2-nq1zfwlz', '{"delay":0.21,"grit":0.56,"shimmer":0.38}'],
];
const SHARE_RESTORE_PRIMES: Prime[] = [
  ['robot-0-rtzgxb0h', '{"reverb":0.15,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-1-oc8copp5', '{"reverb":0.23,"delay":0.13,"grit":0,"shimmer":0,"double":0}'],
  ['robot-2-nq1zfwlz', '{"reverb":0.1,"delay":0.29,"grit":0.42,"shimmer":0,"double":0}'],
  ['robot-3-spaohmu8', '{"reverb":0.58,"delay":0.27,"grit":0,"shimmer":0,"double":0}'],
  ['robot-4-g9rrd94w', '{"reverb":0.18,"delay":0,"grit":0,"shimmer":0,"double":0.44}'],
  ['robot-5-gu8i8m8l', '{"reverb":0.58,"delay":0.14,"grit":0,"shimmer":0,"double":0}'],
  ['robot-6-50bzozmg', '{"reverb":0.45,"delay":0.09,"grit":0,"shimmer":0.28,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.18,"delay":0.08,"grit":0,"shimmer":0,"double":0.33}'],
  ['robot-8-jq9k9pbv', '{"reverb":0.22,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-9-tmw8lmz4', '{"reverb":0.48,"delay":0,"grit":0,"shimmer":0,"double":0}'],
  ['robot-10-ug4nah4e', '{"reverb":0.2,"delay":0.02,"grit":0,"shimmer":0,"double":0.35}'],
  ['robot-11-ri6s5np6', '{"reverb":0.2,"delay":0.25,"grit":0,"shimmer":0,"double":0}'],
  ['robot-7-b2f37xro', '{"reverb":0.62,"delay":0.18,"grit":0.47,"shimmer":0.09,"double":0.73}'],
];
// The forced start lands on robot 11's Delay send (seeded 0.25): eight writes up to the peak, seven down, landing exactly.
const SWELL_PRIMES: Prime[] = [
  ['robot-11-ri6s5np6', '{"delay":0.328125}'],
  ['robot-11-ri6s5np6', '{"delay":0.40625}'],
  ['robot-11-ri6s5np6', '{"delay":0.484375}'],
  ['robot-11-ri6s5np6', '{"delay":0.5625}'],
  ['robot-11-ri6s5np6', '{"delay":0.640625}'],
  ['robot-11-ri6s5np6', '{"delay":0.71875}'],
  ['robot-11-ri6s5np6', '{"delay":0.796875}'],
  ['robot-11-ri6s5np6', '{"delay":0.875}'],
  ['robot-11-ri6s5np6', '{"delay":0.7857142857142858}'],
  ['robot-11-ri6s5np6', '{"delay":0.6964285714285714}'],
  ['robot-11-ri6s5np6', '{"delay":0.6071428571428571}'],
  ['robot-11-ri6s5np6', '{"delay":0.5178571428571429}'],
  ['robot-11-ri6s5np6', '{"delay":0.42857142857142855}'],
  ['robot-11-ri6s5np6', '{"delay":0.3392857142857143}'],
  ['robot-11-ri6s5np6', '{"delay":0.25}'],
];
const SHARE_WIRE_JSON =
  '{"v":2,"n":"Send Parity","c":{"x":31,"y":47},"g":{},"r":{"parity-robot":{"rd":37,"p":-0.35,"rs":0.62,"ds":0.18,"gr":0.47,"sm":0.09,"db":0.73,"dy":41}}}';
const CLAMPED_SENDS: number[] = [1, 0.18, 0, 1, 0.73];

/** The fixed plot's company members, by roster index, to their founders. */
const FOUNDERS = companyFounders(generateCompanyMembership(noiseMaps.getLocaleNoiseMap('send-parity-founders', COORDINATES.x, COORDINATES.y)));

/** A recorded prime sequence as company families make it (B5): each member's seeded row (one still equal to its own
 *  recorded spawn row) becomes its founder's recorded spawn row. Hand-set rows and the carried rows after the roster
 *  stand as recorded. */
function asFamilies(primes: Prime[]): Prime[] {
  return primes.map(([robotId, sends], i): Prime => {
    const founder = FOUNDERS.get(i);
    return i < SPAWN_PRIMES.length && founder !== undefined && sends === SPAWN_PRIMES[i][1] ? [robotId, SPAWN_PRIMES[founder][1]] : [robotId, sends];
  });
}

// ========================================
// TESTS
// ========================================

describe('Robot sends parity (roadmap 55 oracle, recorded at 608c5b92)', () => {
  it('the fixed plot has company members, so the (b) cases see the founder rule', () => {
    expect(FOUNDERS.size).toBeGreaterThan(0);
  });

  it('(a) seeds all five sends, value for value, for two twelve-robot rosters (each index\'s own draw)', () => {
    const actual: Record<string, number[][]> = {};
    for (const seed of ['send-table-parity-a', 'send-table-parity-b']) {
      const noise = createNoise2D(alea(seed));
      actual[seed] = Array.from({ length: 12 }, (_, i) => generateRobotSends(noise, i)).map((b) => SEND_FIELDS.map((f) => b[f]));
    }
    expect(actual).toEqual(SEEDED_SENDS);
  });

  describe('(b) primes every reservation and restore in order', () => {
    it('spawn: spawnInitialRoster primes each spawned robot with its own five sends', () => {
      const localeId = setupWorld('spawn');
      const primes = recordPrimes(() => spawnInitialRoster(localeId));
      expect(primes).toEqual(asFamilies(SPAWN_PRIMES));
    });

    it('reRegisterAllRobotsAudio re-primes the whole roster, a hand-set robot with its hand-set sends', () => {
      const localeId = setupWorld('re-register');
      spawnInitialRoster(localeId);
      const target = currentRobots()[1];
      expect(sendsOf(target)).not.toEqual(Object.values(HAND_SET)); // precondition: the hand-set values are not the seed
      useLocaleStore.getState().updateRobot(localeId, target.id, HAND_SET);

      const primes = recordPrimes(() => reRegisterAllRobotsAudio(localeId));
      expect(primes).toEqual(asFamilies(RE_REGISTER_PRIMES));
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
      expect(primes).toEqual(asFamilies(SESSION_RESTORE_PRIMES));
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
      expect(primes).toEqual(asFamilies(SHARE_RESTORE_PRIMES));
    });

    // Spec §7 Q4: the public tick, with the robot-pool start forced the way sessionDiff.test.ts's mid-swell cases force
    // it (the attenuation-style noise map mocked per dataId). 'audioSwell.target.robot' at 1 picks the last eligible
    // pair, and the sends are the pool's tail, so the swell lands on a send.
    it('tickAudioSwells writes a send swell through updateRobotSends, ramp and landing', () => {
      const localeId = setupWorld('swell');
      spawnInitialRoster(localeId);
      // Company Families Task 5: robot 11 is a company member and carries its founder's sends (Delay 0.13); its own
      // recorded sends (Delay 0.25) are set back, so the swell rides from the recorded seed.
      const swellRobot = currentRobots()[11];
      expect(FOUNDERS.has(11)).toBe(true); // precondition: why the set-back is needed
      const ownRecorded = JSON.parse(SPAWN_PRIMES[11][1]) as Record<'reverb' | 'delay' | 'grit' | 'shimmer' | 'double', number>;
      useLocaleStore.getState().updateRobot(localeId, swellRobot.id, {
        reverbSend: ownRecorded.reverb, delaySend: ownRecorded.delay, gritSend: ownRecorded.grit, shimmerSend: ownRecorded.shimmer, doubleSend: ownRecorded.double,
      });
      useAudioStore.setState({ swellFrequency: 16, swellDuration: 15, pingVarianceAutomation: 1 });
      // Every draw not named lands mid-band (T3's fallback 0, the old stub's `?? 0`), so the swell is the recorded one.
      const forced = {
        'audioSwell.trigger.robot': -1, // the robot pool fires
        'audioSwell.company.chance': 1, // a single-robot swell
        'audioSwell.target.robot': 1, // the last eligible pair
        'audioSwell.trigger.global': 1, // the global pool stays quiet
      };
      const styleMap = vi.spyOn(noiseMaps, 'getAttenuationStyleNoiseMap').mockReturnValue(noiseMapForDataIds(forced));

      const primes = recordPrimes(() => {
        tickAudioSwells(localeId, 0);
        const swell = getActiveSwellSnapshot('robot')[0];
        expect(SEND_FIELDS as readonly string[]).toContain(swell?.robotAttribute); // precondition: the start is a send
        expect(getActiveSwellSnapshot('robot')).toHaveLength(1);
        // No further starts: this one swell rides to its landing.
        styleMap.mockReturnValue(noiseMapForDataIds({ ...forced, 'audioSwell.trigger.robot': 1 }));
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
