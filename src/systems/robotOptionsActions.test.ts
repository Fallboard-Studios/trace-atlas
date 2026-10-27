import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  applyAudioMode, applyVolume, applyPan, applyPanAuto,
  applyDensity, applyMotifLength, applyNoteVariance, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyLayersContinuous, applyLayersStructural, applyLayerLfoLink, applyClickTrackActive,
  applyPitchRepeat, applyDynamics, applyRests, applyAccents, applyPortamento, applyBusFilter,
  applySend, applySendValue,
} from './robotOptionsActions';
// Namespace import so a removed export can be asserted absent at runtime (same pattern
// robotOptionsConfig.test.ts uses for its own removed schemas).
import * as robotOptionsActionsModule from './robotOptionsActions';
import * as robotLfoLinks from './robotLfoLinks';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { AudioEngine } from '@/engine/AudioEngine';
import * as melodyGen from '@/engine/melodyGenerator';
import type { Robot, ADSREnvelope, MelodyEvent } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type { LfoLink } from '@/types/lfo';
import type { Locale } from '@/types/locale';

// The LFO Bank engine (docs/tasks/LFO_BANK.md) — applyLayerLfoLink routes through this exclusively.
vi.mock('@/engine/lfoEngine', () => ({
  lfoEngine: {
    linkTarget: vi.fn(() => true),
  },
}));

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    compositionSeed: 0.5,
    name: 'Test Robot',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
      filterFreq: 0,
      waveform: 'sine',
      layers: [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
      ],
    },
    octaveRange: [3, 4],
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 100,
    rhythmicDensity: 50,
    rhythmicMotifLength: { active: true, value: 8 },
    noteVariance: { active: false, value: 0 },
    ...overrides,
  } as Robot;
}

function stubMelodyPipeline() {
  const sampleMelody = [{ id: 'm1', startStep: 1, length: '8n', noteIndex: 0, octave: 3 }];
  vi.spyOn(melodyGen, 'generateMelodyForRobot').mockReturnValue(sampleMelody as unknown as MelodyEvent[]);
  vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});
  vi.spyOn(AudioEngine, 'unregisterRobotMelody').mockImplementation(() => {});
}

describe('robotOptionsActions', () => {
  const localeId = getActiveLocaleId();

  beforeEach(() => {
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
  });

  describe('applyAudioMode', () => {
    it('writes audioMode to the store', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');

      applyAudioMode(robot, localeId, 'solo');

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { audioMode: 'solo' });
    });
  });

  describe('applyVolume', () => {
    it('converts a 0-100 percent to 0..1, writes the store, and updates the live AudioEngine cache', () => {
      const robot = makeRobot({ masterVolume: 0.42 });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const volumeSpy = vi.spyOn(AudioEngine, 'updateRobotMasterVolume').mockImplementation(() => {});

      applyVolume(robot, localeId, 55);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { masterVolume: 0.55 });
      expect(volumeSpy).toHaveBeenCalledWith(robot.id, 0.55);
    });
  });

  // docs/specs/ROBOT_PAN.md §1.2 — the Pan slider's two actions, on applyVolume's shape.
  describe('applyPan', () => {
    function storedRobot(overrides: Partial<Robot> = {}): Robot {
      const robot = makeRobot({ pan: 0, panAuto: false, ...overrides });
      useLocaleStore.getState().addRobot(localeId, robot);
      return robot;
    }
    function storedPan(id: string): number | undefined {
      return useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === id)?.pan;
    }

    it('converts a -100..100 display number to -1..1, writes the store, and ramps the live panner', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPan(robot, localeId, 40);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { pan: 0.4 });
      expect(panSpy).toHaveBeenCalledTimes(1);
      expect(panSpy).toHaveBeenCalledWith(robot.id, 0.4);
      expect(storedPan(robot.id)).toBe(0.4);
    });

    it('carries a negative display number through signed', () => {
      const robot = storedRobot();
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPan(robot, localeId, -75);

      expect(panSpy).toHaveBeenCalledWith(robot.id, -0.75);
      expect(storedPan(robot.id)).toBe(-0.75);
    });

    it('passes the exact travel limits through unchanged', () => {
      const robot = storedRobot();
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPan(robot, localeId, 100);
      applyPan(robot, localeId, -100);

      expect(panSpy).toHaveBeenNthCalledWith(1, robot.id, 1);
      expect(panSpy).toHaveBeenNthCalledWith(2, robot.id, -1);
    });

    it('clamps a display number past +100 to 1 for both the store and the engine', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPan(robot, localeId, 150);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { pan: 1 });
      expect(panSpy).toHaveBeenCalledWith(robot.id, 1);
    });

    it('clamps a display number past -100 to -1 for both the store and the engine', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPan(robot, localeId, -4000);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { pan: -1 });
      expect(panSpy).toHaveBeenCalledWith(robot.id, -1);
    });

    it('sends a centred display number as 0, not as a skipped write', () => {
      const robot = storedRobot({ pan: 0.6 });
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPan(robot, localeId, 0);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { pan: 0 });
      expect(panSpy).toHaveBeenCalledWith(robot.id, 0);
      expect(storedPan(robot.id)).toBe(0);
    });

    it('keeps a fractional display number fractional (pan is not truncated)', () => {
      const robot = storedRobot();
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPan(robot, localeId, 12.5);

      expect(panSpy).toHaveBeenCalledWith(robot.id, 0.125);
      expect(storedPan(robot.id)).toBe(0.125);
    });

    it('never touches panAuto (the slider only writes pan)', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPan(robot, localeId, 20);

      expect(updateSpy.mock.calls[0][2]).not.toHaveProperty('panAuto');
    });
  });

  // Every send field at a distinct non-default value, so a write to the wrong field cannot pass by coincidence.
  const STORED_SENDS = { reverbSend: 0.2, delaySend: 0.1, gritSend: 0.3, shimmerSend: 0.4, doubleSend: 0.6 } as const;
  const SEND_FIELDS = Object.keys(STORED_SENDS) as (keyof typeof STORED_SENDS)[];
  // Robot Send Table T6 (docs/specs/ROBOT_SEND_TABLE.md §1.3): the keyed pair runs through the cases the ten named
  // actions had, one row per field (T14 deleted the ten). The engine keys are written out here, not read from the table,
  // so a wrong mapping fails.
  const SEND_ENGINE_KEYS = [
    ['reverbSend', 'reverb'], ['delaySend', 'delay'], ['gritSend', 'grit'], ['shimmerSend', 'shimmer'], ['doubleSend', 'double'],
  ] as const;
  const KEYED_SEND_VALUE_ROWS = SEND_ENGINE_KEYS.map(([field, engineKey]) => ({
    name: `applySendValue(${field})`,
    apply: (robot: Robot, locale: string, fraction: number) => applySendValue(robot, locale, field, fraction),
    field,
    engineKey,
  }));
  const KEYED_SEND_ROWS = SEND_ENGINE_KEYS.map(([field, engineKey]) => ({
    name: `applySend(${field})`,
    apply: (robot: Robot, locale: string, pct: number) => applySend(robot, locale, field, pct),
    field,
    engineKey,
  }));

  // docs/tasks/ROBOT_SENDS.md Task 12 - the stored-fraction form of the send actions (the three new rooms'
  // from docs/tasks/ROBOT_EFFECT_SENDS.md Task 9). The swell tick writes through this: a display percent
  // (x * 100 / 100) does not round-trip every double, and a swell must land on its base exactly.
  describe.each(KEYED_SEND_VALUE_ROWS)('$name', ({ apply, field, engineKey }) => {
    function storedRobot(): Robot {
      const robot = makeRobot({ ...STORED_SENDS });
      useLocaleStore.getState().addRobot(localeId, robot);
      return robot;
    }
    function stored(id: string): Robot | undefined {
      return useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === id);
    }

    it.each([0.007, 0.013, 0.29, 0.7123456789, 0.5, 1, 0])('stores and sends the fraction %s exactly, with no percent round trip', (fraction) => {
      const robot = storedRobot();
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, fraction);

      expect(stored(robot.id)?.[field]).toBe(fraction);
      expect(sendsSpy).toHaveBeenCalledWith(robot.id, { [engineKey]: fraction });
    });

    it('clamps a fraction outside 0..1', () => {
      const robot = storedRobot();
      vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, 1.0000000000000002);
      expect(stored(robot.id)?.[field]).toBe(1);
      apply(robot, localeId, -0.1);
      expect(stored(robot.id)?.[field]).toBe(0);
    });

    it('drops a NaN whole: no store write, no engine call', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, NaN);

      expect(updateSpy).not.toHaveBeenCalled();
      expect(sendsSpy).not.toHaveBeenCalled();
    });

    it('writes only its own field and its own engine key', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, 0.55);

      expect(Object.keys(updateSpy.mock.calls[0][2])).toEqual([field]);
      expect(Object.keys(sendsSpy.mock.calls[0][1])).toEqual([engineKey]);
    });
  });

  // docs/specs/ROBOT_SENDS.md §1.5 - the send slider action, on applyVolume's shape (Grit, Shimmer and Double from
  // docs/specs/ROBOT_EFFECT_SENDS.md §1.5). It never cancels a swell (the callers do): the swell tick itself writes
  // through the pair.
  describe.each(KEYED_SEND_ROWS)('$name', ({ apply, field, engineKey }) => {
    const others = SEND_FIELDS.filter((f) => f !== field);
    function storedRobot(overrides: Partial<Robot> = {}): Robot {
      const robot = makeRobot({ ...STORED_SENDS, ...overrides });
      useLocaleStore.getState().addRobot(localeId, robot);
      return robot;
    }
    function stored(id: string): Robot | undefined {
      return useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === id);
    }

    it('converts a 0-100 display number to 0..1, writes the store, and sends it to the engine', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, 40);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { [field]: 0.4 });
      expect(sendsSpy).toHaveBeenCalledTimes(1);
      expect(sendsSpy).toHaveBeenCalledWith(robot.id, { [engineKey]: 0.4 });
      expect(stored(robot.id)?.[field]).toBe(0.4);
    });

    it('clamps a display number past 100 to 1 for both the store and the engine', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, 150);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { [field]: 1 });
      expect(sendsSpy).toHaveBeenCalledWith(robot.id, { [engineKey]: 1 });
    });

    it('clamps a negative display number to 0 for both the store and the engine', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, -5);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { [field]: 0 });
      expect(sendsSpy).toHaveBeenCalledWith(robot.id, { [engineKey]: 0 });
    });

    it('passes the exact travel limits 0 and 100 through, 0 as a real write rather than a skipped one', () => {
      const robot = storedRobot({ [field]: 0.6 });
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, 0);
      expect(stored(robot.id)?.[field]).toBe(0);
      apply(robot, localeId, 100);
      expect(stored(robot.id)?.[field]).toBe(1);

      expect(sendsSpy).toHaveBeenNthCalledWith(1, robot.id, { [engineKey]: 0 });
      expect(sendsSpy).toHaveBeenNthCalledWith(2, robot.id, { [engineKey]: 1 });
    });

    it('keeps a fractional display number fractional (a send is not truncated)', () => {
      const robot = storedRobot();
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, 12.5);

      expect(sendsSpy).toHaveBeenCalledWith(robot.id, { [engineKey]: 0.125 });
      expect(stored(robot.id)?.[field]).toBe(0.125);
    });

    it('touches only its own send: the other four fields and gains are left alone', () => {
      const robot = storedRobot();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, 70);

      expect(Object.keys(updateSpy.mock.calls[0][2])).toEqual([field]);
      expect(Object.keys(sendsSpy.mock.calls[0][1])).toEqual([engineKey]);
      for (const other of others) expect(stored(robot.id)?.[other]).toBe(STORED_SENDS[other]);
    });

    it('ignores a NaN display number whole: no store write, no engine call, the stored send survives', () => {
      const robot = storedRobot({ [field]: 0.3 });
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      apply(robot, localeId, NaN);

      expect(updateSpy).not.toHaveBeenCalled();
      expect(sendsSpy).not.toHaveBeenCalled();
      expect(stored(robot.id)?.[field]).toBe(0.3);
    });

    it('does not throw for a robot with no composite reserved (the engine no-ops; the store still takes the value)', () => {
      const robot = storedRobot();

      expect(() => apply(robot, localeId, 50)).not.toThrow();
      expect(stored(robot.id)?.[field]).toBe(0.5);
    });
  });

  it.each(SEND_ENGINE_KEYS)('applySend and applySendValue on %s never cancel a swell (the caller does; the tick writes through them)', async (field) => {
    const swells = await import('./audioSwells');
    const cancelSpy = vi.spyOn(swells, 'cancelSwellForRobotAttribute');
    const robot = makeRobot({ ...STORED_SENDS });
    useLocaleStore.getState().addRobot(localeId, robot);
    vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

    applySend(robot, localeId, field, 40);
    applySendValue(robot, localeId, field, 0.25);

    expect(cancelSpy).not.toHaveBeenCalled();
  });

  // Robot Send Table T14 (docs/specs/ROBOT_SEND_TABLE.md §1.3): the ten named send actions went, not as wrappers;
  // applySend / applySendValue, keyed by field, are the only way to write a send.
  describe('the ten per-send actions (removed — docs/tasks/ROBOT_SEND_TABLE.md Task 14)', () => {
    it.each([
      'applyReverbSend', 'applyDelaySend', 'applyGritSend', 'applyShimmerSend', 'applyDoubleSend',
      'applyReverbSendValue', 'applyDelaySendValue', 'applyGritSendValue', 'applyShimmerSendValue', 'applyDoubleSendValue',
    ])('%s is no longer exported — the keyed pair takes the field instead', (name) => {
      expect(name in robotOptionsActionsModule).toBe(false);
    });

    it('the keyed pair is exported (the absence check reads the real module)', () => {
      expect('applySend' in robotOptionsActionsModule).toBe(true);
      expect('applySendValue' in robotOptionsActionsModule).toBe(true);
    });
  });

  describe('applyPanAuto', () => {
    function storedRobot(overrides: Partial<Robot> = {}): Robot {
      const robot = makeRobot({ pan: 0, panAuto: true, ...overrides });
      useLocaleStore.getState().addRobot(localeId, robot);
      return robot;
    }
    function storedRobotNow(id: string): Robot | undefined {
      return useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === id);
    }

    it('Auto off copies the live value into pan, flips the flag in the same write, and pins the engine there', () => {
      const robot = storedRobot({ pan: 0.9 });
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      vi.spyOn(AudioEngine, 'getLivePan').mockReturnValue(-0.3);
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPanAuto(robot, localeId, false);

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { panAuto: false, pan: -0.3 });
      expect(panSpy).toHaveBeenCalledWith(robot.id, -0.3);
      expect(storedRobotNow(robot.id)).toMatchObject({ panAuto: false, pan: -0.3 });
    });

    it('Auto off falls back to the robot own pan when the engine has no live value yet', () => {
      const robot = storedRobot({ pan: 0.1 });
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      vi.spyOn(AudioEngine, 'getLivePan').mockReturnValue(undefined);
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPanAuto(robot, localeId, false);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { panAuto: false, pan: 0.1 });
      expect(panSpy).toHaveBeenCalledWith(robot.id, 0.1);
    });

    it('Auto off with a live value of exactly 0 uses 0, not the stale robot pan (nullish, not falsy)', () => {
      const robot = storedRobot({ pan: 0.8 });
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      vi.spyOn(AudioEngine, 'getLivePan').mockReturnValue(0);
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPanAuto(robot, localeId, false);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { panAuto: false, pan: 0 });
      expect(panSpy).toHaveBeenCalledWith(robot.id, 0);
    });

    it('Auto off reads the live value for the robot it was given, by id', () => {
      const robot = storedRobot({ id: 'r7' });
      const liveSpy = vi.spyOn(AudioEngine, 'getLivePan').mockReturnValue(0.2);
      vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPanAuto(robot, localeId, false);

      expect(liveSpy).toHaveBeenCalledWith('r7');
    });

    it('Auto on writes only the flag (pan is left as it was) and hands the robot back with null', () => {
      const robot = storedRobot({ panAuto: false, pan: 0.7 });
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const liveSpy = vi.spyOn(AudioEngine, 'getLivePan');
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applyPanAuto(robot, localeId, true);

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy.mock.calls[0][2]).toStrictEqual({ panAuto: true });
      expect(panSpy).toHaveBeenCalledWith(robot.id, null);
      expect(liveSpy).not.toHaveBeenCalled();
      expect(storedRobotNow(robot.id)).toMatchObject({ panAuto: true, pan: 0.7 });
    });
  });

  describe('applyVolumeLfo (removed — docs/specs/LFO_LOAD_FIX.md assumption 9, Task 3)', () => {
    it('is no longer exported — the Volume LFO target is gone, so there is no wrapper to call', () => {
      expect('applyVolumeLfo' in robotOptionsActionsModule).toBe(false);
    });
  });

  describe('applyDensity', () => {
    it('writes rhythmicDensity and regenerates the melody', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');

      applyDensity(robot, localeId, 75);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { rhythmicDensity: 75 });
      expect(genSpy).toHaveBeenCalled();
    });
  });

  describe('applyPitchRepeat', () => {
    it('writes pitchRepeat and regenerates the melody', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');

      applyPitchRepeat(robot, localeId, 60);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { pitchRepeat: 60 });
      expect(genSpy).toHaveBeenCalled();
    });
  });

  // Robot Performance T7 (docs/specs/ROBOT_PERFORMANCE.md §1.5)
  describe('applyDynamics', () => {
    it('writes dynamics to the store and touches neither the melody nor any engine method', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');
      const engineSpies = (Object.keys(AudioEngine) as (keyof typeof AudioEngine)[])
        .filter((key) => typeof AudioEngine[key] === 'function' && key !== 'registerRobotMelody' && key !== 'unregisterRobotMelody')
        .map((key) => vi.spyOn(AudioEngine, key as never));
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

      applyDynamics(robot, localeId, 70);

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { dynamics: 70 });
      expect(useLocaleStore.getState().getLocaleById(localeId)?.robots[0].dynamics).toBe(70);
      expect(genSpy).not.toHaveBeenCalled();
      expect(registerSpy).not.toHaveBeenCalled();
      for (const spy of engineSpies) expect(spy).not.toHaveBeenCalled();
    });

    it('stores the store-clamped value for an out-of-range slider number (the store owns the clamp)', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);

      applyDynamics(robot, localeId, 140);

      expect(useLocaleStore.getState().getLocaleById(localeId)?.robots[0].dynamics).toBe(100);
    });
  });

  describe('applyRests', () => {
    it('writes rests, then regenerates with the new value spread in', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

      applyRests(robot, localeId, 100);

      expect(updateSpy).toHaveBeenNthCalledWith(1, localeId, robot.id, { rests: 100 });
      // The stubbed generator returns one plain event; rests 100 must stamp it, proving the NEW value
      // (not the robot's stale absent field) reached regenerateMelody.
      const registered = registerSpy.mock.calls[0][1] as MelodyEvent[];
      expect(registered).toHaveLength(1);
      expect(registered[0].rest).toBeGreaterThanOrEqual(0.25);
      expect(registered[0].rest).toBeLessThanOrEqual(0.75);
    });

    it('leaves the notes alone: rests 0 registers the generated events by reference', () => {
      const robot = makeRobot({ rests: 80 });
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

      applyRests(robot, localeId, 0);

      const registered = registerSpy.mock.calls[0][1] as MelodyEvent[];
      expect(registered[0].rest).toBeUndefined();
      expect(useLocaleStore.getState().getLocaleById(localeId)?.robots[0].rests).toBe(0);
    });

    it('keeps the robot accents when only rests moves', () => {
      const robot = makeRobot({ accents: 100 });
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');
      const applySpy = vi.spyOn(melodyGen, 'applyPerformanceMarks');

      applyRests(robot, localeId, 30);

      expect(genSpy).toHaveBeenCalledTimes(1);
      expect(applySpy).toHaveBeenCalledWith(expect.anything(), { rests: 30, accents: 100 }, expect.any(Function));
    });
  });

  describe('applyAccents', () => {
    it('writes accents, then regenerates with the new value spread in', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const applySpy = vi.spyOn(melodyGen, 'applyPerformanceMarks');

      applyAccents(robot, localeId, 40);

      expect(updateSpy).toHaveBeenNthCalledWith(1, localeId, robot.id, { accents: 40 });
      expect(applySpy).toHaveBeenCalledWith(expect.anything(), { rests: 0, accents: 40 }, expect.any(Function));
    });

    it('keeps the robot rests when only accents moves', () => {
      const robot = makeRobot({ rests: 55 });
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const applySpy = vi.spyOn(melodyGen, 'applyPerformanceMarks');

      applyAccents(robot, localeId, 90);

      expect(applySpy).toHaveBeenCalledWith(expect.anything(), { rests: 55, accents: 90 }, expect.any(Function));
    });

    it('registers a melody with the same notes at every setting (Accents never moves a note)', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

      applyAccents(robot, localeId, 0);
      applyAccents(robot, localeId, 100);

      const [low, high] = registerSpy.mock.calls.map((call) => call[1] as MelodyEvent[]);
      expect(high.map((e) => [e.id, e.startStep, e.length, e.noteIndex, e.octave])).toEqual(
        low.map((e) => [e.id, e.startStep, e.length, e.noteIndex, e.octave]),
      );
    });
  });

  describe('applyMotifLength', () => {
    it('takes a plain number and writes { active: true, value } when value > 0', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');

      applyMotifLength(robot, localeId, 4);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { rhythmicMotifLength: { active: true, value: 4 } });
      expect(genSpy).toHaveBeenCalled();
    });

    it('writes { active: false, value: 0 } when value is 0', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');

      applyMotifLength(robot, localeId, 0);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { rhythmicMotifLength: { active: false, value: 0 } });
    });

    it('passes the same constructed { active, value } object into regenerateMelody, not the raw robot field', () => {
      const robot = makeRobot({ rhythmicMotifLength: { active: true, value: 8 } });
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');

      applyMotifLength(robot, localeId, 0);

      expect(genSpy).toHaveBeenCalledWith(
        expect.objectContaining({ rhythmicMotifLength: { active: false, value: 0 } })
      );
    });
  });

  describe('applyNoteVariance', () => {
    it('takes a plain number and writes { active: true, value } when value > 0', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');

      applyNoteVariance(robot, localeId, 3);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { noteVariance: { active: true, value: 3 } });
      expect(genSpy).toHaveBeenCalled();
    });

    it('writes { active: false, value: 0 } when value is 0', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');

      applyNoteVariance(robot, localeId, 0);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { noteVariance: { active: false, value: 0 } });
    });
  });

  describe('applyOctaveMin / applyOctaveMax', () => {
    it('applyOctaveMin writes the updated tuple, clamped to not exceed the current max', () => {
      const robot = makeRobot({ octaveRange: [3, 5] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');

      applyOctaveMin(robot, localeId, 4);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { octaveRange: [4, 5] });
    });

    it('applyOctaveMin does not let min exceed the current max', () => {
      const robot = makeRobot({ octaveRange: [3, 5] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');

      applyOctaveMin(robot, localeId, 9);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { octaveRange: [5, 5] });
    });

    it('applyOctaveMax writes the updated tuple, clamped to not go below the current min', () => {
      const robot = makeRobot({ octaveRange: [3, 5] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');

      applyOctaveMax(robot, localeId, 2);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { octaveRange: [3, 3] });
    });

    it('applyOctaveMin regenerates the melody using the UPDATED octaveRange, not the pre-edit one (Deterministic Robot Melody Generation, Task 5)', () => {
      const robot = makeRobot({ octaveRange: [3, 5] });
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');

      applyOctaveMin(robot, localeId, 4);

      expect(genSpy).toHaveBeenCalledWith(expect.objectContaining({ octaveMin: 4, octaveMax: 5 }));
    });

    it('applyOctaveMax regenerates the melody using the UPDATED octaveRange, not the pre-edit one (Deterministic Robot Melody Generation, Task 5)', () => {
      const robot = makeRobot({ octaveRange: [3, 5] });
      useLocaleStore.getState().addRobot(localeId, robot);
      stubMelodyPipeline();
      const genSpy = vi.spyOn(melodyGen, 'generateMelodyForRobot');

      applyOctaveMax(robot, localeId, 6);

      expect(genSpy).toHaveBeenCalledWith(expect.objectContaining({ octaveMin: 3, octaveMax: 6 }));
    });
  });

  describe('applyClickTrackActive', () => {
    it('writes clickTrackActive and registers the fixed click-track melody, at the octave range minimum, when turned on', () => {
      const robot = makeRobot({ octaveRange: [3, 5], melody: [{ id: 'real', startStep: 1, length: '8n', noteIndex: 0, octave: 4 }] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});

      applyClickTrackActive(robot, localeId, true);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { clickTrackActive: true });
      expect(registerSpy).toHaveBeenCalledWith(robot.id, [
        { id: 'click-track-0', startStep: 1, length: '4n', noteIndex: 0, octave: 3 },
        { id: 'click-track-1', startStep: 5, length: '4n', noteIndex: 1, octave: 3 },
        { id: 'click-track-2', startStep: 9, length: '4n', noteIndex: 0, octave: 3 },
        { id: 'click-track-3', startStep: 13, length: '4n', noteIndex: 2, octave: 3 },
      ]);
    });

    it('writes clickTrackActive false and re-registers the robot\'s own real melody, unchanged, when turned off', () => {
      const realMelody = [{ id: 'real', startStep: 1, length: '8n' as const, noteIndex: 0, octave: 4 }];
      const robot = makeRobot({ melody: realMelody });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});

      applyClickTrackActive(robot, localeId, false);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { clickTrackActive: false });
      expect(registerSpy).toHaveBeenCalledWith(robot.id, realMelody);
    });
  });

  describe('applyAdsr', () => {
    it('writes audioAttributes.adsr and calls AudioEngine.updateVoiceEnvelope, not reReserveVoice', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const envelopeSpy = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
      const reReserveSpy = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
      const nextAdsr: ADSREnvelope = { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.5 };

      applyAdsr(robot, localeId, nextAdsr);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, {
        audioAttributes: { ...robot.audioAttributes, adsr: nextAdsr },
      });
      expect(envelopeSpy).toHaveBeenCalledWith(robot.id, nextAdsr);
      expect(reReserveSpy).not.toHaveBeenCalled();
    });
  });

  describe('applyAdsr — envelope curves (Robot Articulation T6, regression: no code change)', () => {
    it('hands updateVoiceEnvelope the attack and release curves the envelope carries, and stores them', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const envelopeSpy = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
      const nextAdsr: ADSREnvelope = { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.5, attackCurve: 'sine', releaseCurve: 'bounce' };

      applyAdsr(robot, localeId, nextAdsr);

      expect(envelopeSpy).toHaveBeenCalledTimes(1);
      expect(envelopeSpy).toHaveBeenCalledWith(robot.id, nextAdsr);
      expect(envelopeSpy.mock.calls[0][1]).toMatchObject({ attackCurve: 'sine', releaseCurve: 'bounce' });
      const stored = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
      expect(stored.audioAttributes.adsr).toEqual(nextAdsr);
    });
  });

  describe('applyPortamento (Robot Articulation T6)', () => {
    it('stores portamento beside the other attributes and calls updateVoicePortamento once', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const portamentoSpy = vi.spyOn(AudioEngine, 'updateVoicePortamento').mockImplementation(() => {});
      const reReserveSpy = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);

      applyPortamento(robot, localeId, 0.2);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, {
        audioAttributes: { ...robot.audioAttributes, portamento: 0.2 },
      });
      expect(portamentoSpy).toHaveBeenCalledTimes(1);
      expect(portamentoSpy).toHaveBeenCalledWith(robot.id, 0.2);
      expect(reReserveSpy).not.toHaveBeenCalled();
      const stored = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
      expect(stored.audioAttributes.portamento).toBe(0.2);
      expect(stored.audioAttributes.adsr).toEqual(robot.audioAttributes.adsr);
      expect(stored.audioAttributes.layers).toEqual(robot.audioAttributes.layers);
    });

    it('0 is a real value: it clears a glide in the store and reaches the engine (not skipped as falsy)', () => {
      const robot = makeRobot({ audioAttributes: { ...makeRobot().audioAttributes, portamento: 0.3 } });
      useLocaleStore.getState().addRobot(localeId, robot);
      const portamentoSpy = vi.spyOn(AudioEngine, 'updateVoicePortamento').mockImplementation(() => {});

      applyPortamento(robot, localeId, 0);

      expect(portamentoSpy).toHaveBeenCalledWith(robot.id, 0);
      expect(useLocaleStore.getState().getLocaleById(localeId)!.robots[0].audioAttributes.portamento).toBe(0);
    });

    it('writes the store before it calls the engine', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const portamentoSpy = vi.spyOn(AudioEngine, 'updateVoicePortamento').mockImplementation(() => {});

      applyPortamento(robot, localeId, 0.1);

      expect(updateSpy.mock.invocationCallOrder[0]).toBeLessThan(portamentoSpy.mock.invocationCallOrder[0]);
    });

    it('still stores the value when no voice is reserved (the engine only warns)', () => {
      const robot = makeRobot({ id: 'never-reserved' });
      useLocaleStore.getState().addRobot(localeId, robot);

      expect(() => applyPortamento(robot, localeId, 0.15)).not.toThrow();
      expect(useLocaleStore.getState().getLocaleById(localeId)!.robots[0].audioAttributes.portamento).toBe(0.15);
    });
  });

  describe('applyBusFilter (Robot Articulation T6)', () => {
    it('a type-only patch stores only that key and sends the engine { type } with no frequency or Q key', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const busSpy = vi.spyOn(AudioEngine, 'updateRobotBusFilter').mockImplementation(() => {});
      const reReserveSpy = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);

      applyBusFilter(robot, localeId, { filterType: 'highpass' });

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, {
        audioAttributes: { ...robot.audioAttributes, filterType: 'highpass' },
      });
      expect(busSpy).toHaveBeenCalledTimes(1);
      expect(busSpy).toHaveBeenCalledWith(robot.id, { type: 'highpass' });
      expect(Object.keys(busSpy.mock.calls[0][1])).toEqual(['type']);
      expect(reReserveSpy).not.toHaveBeenCalled();
      const stored = useLocaleStore.getState().getLocaleById(localeId)!.robots[0].audioAttributes;
      expect(stored.filterType).toBe('highpass');
      expect(stored.filterFreq).toBe(robot.audioAttributes.filterFreq);
      expect(stored.filterQ).toBeUndefined();
    });

    it('maps filterFreq to frequency and filterQ to Q', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const busSpy = vi.spyOn(AudioEngine, 'updateRobotBusFilter').mockImplementation(() => {});

      applyBusFilter(robot, localeId, { filterFreq: 900, filterQ: 4 });

      expect(busSpy).toHaveBeenCalledWith(robot.id, { frequency: 900, Q: 4 });
      expect(Object.keys(busSpy.mock.calls[0][1]).sort()).toEqual(['Q', 'frequency']);
      const stored = useLocaleStore.getState().getLocaleById(localeId)!.robots[0].audioAttributes;
      expect(stored.filterFreq).toBe(900);
      expect(stored.filterQ).toBe(4);
    });

    it('a full patch maps all three at once', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const busSpy = vi.spyOn(AudioEngine, 'updateRobotBusFilter').mockImplementation(() => {});

      applyBusFilter(robot, localeId, { filterFreq: 1850, filterQ: 5, filterType: 'bandpass' });

      expect(busSpy).toHaveBeenCalledWith(robot.id, { frequency: 1850, Q: 5, type: 'bandpass' });
    });

    it('filterFreq 0 (the "no filter" sentinel) still reaches the engine as frequency 0, not dropped as falsy', () => {
      const robot = makeRobot({ audioAttributes: { ...makeRobot().audioAttributes, filterFreq: 1200 } });
      useLocaleStore.getState().addRobot(localeId, robot);
      const busSpy = vi.spyOn(AudioEngine, 'updateRobotBusFilter').mockImplementation(() => {});

      applyBusFilter(robot, localeId, { filterFreq: 0 });

      expect(busSpy).toHaveBeenCalledWith(robot.id, { frequency: 0 });
      expect(useLocaleStore.getState().getLocaleById(localeId)!.robots[0].audioAttributes.filterFreq).toBe(0);
    });

    it('an explicit undefined in the patch neither erases the stored value nor reaches the engine', () => {
      const robot = makeRobot({ audioAttributes: { ...makeRobot().audioAttributes, filterFreq: 1200, filterType: 'bandpass' } });
      useLocaleStore.getState().addRobot(localeId, robot);
      const busSpy = vi.spyOn(AudioEngine, 'updateRobotBusFilter').mockImplementation(() => {});

      applyBusFilter(robot, localeId, { filterFreq: undefined, filterQ: 4, filterType: undefined });

      expect(busSpy).toHaveBeenCalledWith(robot.id, { Q: 4 });
      expect(Object.keys(busSpy.mock.calls[0][1])).toEqual(['Q']);
      const stored = useLocaleStore.getState().getLocaleById(localeId)!.robots[0].audioAttributes;
      expect(stored.filterFreq).toBe(1200);
      expect(stored.filterType).toBe('bandpass');
      expect(stored.filterQ).toBe(4);
    });

    it('writes the store before it calls the engine, and still stores when no voice is reserved', () => {
      const robot = makeRobot({ id: 'bus-never-reserved' });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const busSpy = vi.spyOn(AudioEngine, 'updateRobotBusFilter');

      expect(() => applyBusFilter(robot, localeId, { filterQ: 2 })).not.toThrow();

      expect(updateSpy.mock.invocationCallOrder[0]).toBeLessThan(busSpy.mock.invocationCallOrder[0]);
      expect(useLocaleStore.getState().getLocaleById(localeId)!.robots[0].audioAttributes.filterQ).toBe(2);
    });
  });

  describe('applyLayersContinuous', () => {
    it('writes audioAttributes.layers and calls AudioEngine.updateVoiceLayerParams, not reReserveVoice', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const paramsSpy = vi.spyOn(AudioEngine, 'updateVoiceLayerParams').mockImplementation(() => false);
      const reReserveSpy = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
      const nextLayers: OscillatorLayer[] = [{ type: 'sine', gain: 0.9, detune: 5, phase: 0 }];

      applyLayersContinuous(robot, localeId, nextLayers);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, {
        audioAttributes: { ...robot.audioAttributes, layers: nextLayers },
      });
      expect(paramsSpy).toHaveBeenCalledWith(robot.id, nextLayers);
      expect(reReserveSpy).not.toHaveBeenCalled();
    });
  });

  describe('applyLayersStructural', () => {
    it('writes audioAttributes.layers and calls AudioEngine.reReserveVoice, not updateVoiceLayerParams', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const paramsSpy = vi.spyOn(AudioEngine, 'updateVoiceLayerParams').mockImplementation(() => false);
      const reReserveSpy = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
      const nextLayers: OscillatorLayer[] = [{ type: 'square', gain: 1, detune: 0, phase: 0 }];

      applyLayersStructural(robot, localeId, nextLayers);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, {
        audioAttributes: { ...robot.audioAttributes, layers: nextLayers },
      });
      expect(reReserveSpy).toHaveBeenCalledWith(robot.id);
      expect(paramsSpy).not.toHaveBeenCalled();
    });

    // docs/tasks/LFO_BANK.md Task 10 (also the stale-signal fix, inherited from LFO Load Fix Task
    // 7): a layer-type change rebuilds the voice, which disposes the Tone nodes any connected
    // robot link pointed at. Re-priming after the rebuild re-wires them instead of leaving them
    // silent until a user happens to touch that one link again.
    it('re-primes the robot\'s LFO links after reReserveVoice, re-wiring any connection that pointed at the now-disposed voice', () => {
      const robot = makeRobot({ lfoLinks: { 'layer0.gain': { lane: 'a', depth: 40 } } as unknown as Robot['lfoLinks'] });
      useLocaleStore.getState().addRobot(localeId, robot);
      vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
      const primeSpy = vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
      const nextLayers: OscillatorLayer[] = [{ type: 'square', gain: 1, detune: 0, phase: 0 }];

      applyLayersStructural(robot, localeId, nextLayers);

      expect(primeSpy).toHaveBeenCalledTimes(1);
      expect(primeSpy).toHaveBeenCalledWith(expect.objectContaining({ id: robot.id }));
    });

    it('applyLayersContinuous never primes LFO links — it never rebuilds the voice, so nothing needs re-wiring', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      vi.spyOn(AudioEngine, 'updateVoiceLayerParams').mockImplementation(() => false);
      const primeSpy = vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
      const nextLayers: OscillatorLayer[] = [{ type: 'sine', gain: 0.5, detune: 0, phase: 0 }];

      applyLayersContinuous(robot, localeId, nextLayers);

      expect(primeSpy).not.toHaveBeenCalled();
    });
  });

  describe('applyLayerLfo (removed — docs/tasks/LFO_BANK.md Task 16)', () => {
    it('is no longer exported — the bank replaces it entirely, via applyLayerLfoLink', () => {
      expect('applyLayerLfo' in robotOptionsActionsModule).toBe(false);
    });
  });

  describe('applyLayerLfoLink', () => {
    it('writes lfoLinks[target], leaving other targets untouched, and links it into the bank engine', () => {
      const robot = makeRobot({
        lfoLinks: { 'layer1.detune': { lane: 'c', depth: 10 } } as unknown as Robot['lfoLinks'],
      });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const link: LfoLink = { lane: 'b', depth: 55 };

      applyLayerLfoLink(robot, localeId, 'layer0.gain', link);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, {
        lfoLinks: { 'layer1.detune': { lane: 'c', depth: 10 }, 'layer0.gain': link },
      });
    });

    it('routes through the shared applyRobotLinkToEngine helper (robotLfoLinks), not a parallel implementation', () => {
      const robot = makeRobot({ lfoLinks: {} as unknown as Robot['lfoLinks'] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const spy = vi.spyOn(robotLfoLinks, 'applyRobotLinkToEngine');
      const link: LfoLink = { lane: 'a', depth: 30 };

      applyLayerLfoLink(robot, localeId, 'layer0.gain', link);

      expect(spy).toHaveBeenCalledWith(robot.id, 'layer0.gain', link);
    });
  });

  // BeatClock Transport time T6 (docs/specs/BEATCLOCK_TRANSPORT_TIME.md §5.1 item 7): the four helpers the swell tick
  // writes through hand its time to the engine; the store write is the same with or without one.
  describe('the swell-path helpers forward a Transport time', () => {
    const LAYERS: OscillatorLayer[] = [{ type: 'sine', gain: 0.9, detune: 5, phase: 0 }];
    const ADSR: ADSREnvelope = { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.5 };

    /** Each helper, its engine method, the arguments it is called with, and what the engine should see before the time. */
    const ROWS = [
      {
        name: 'applyVolume',
        engine: 'updateRobotMasterVolume' as const,
        call: (robot: Robot, time?: number) => applyVolume(robot, localeId, 55, time),
        engineArgs: (robot: Robot) => [robot.id, 0.55],
        storedOf: (robot: Robot | undefined) => robot?.masterVolume,
      },
      {
        name: 'applySendValue',
        engine: 'updateRobotSends' as const,
        call: (robot: Robot, time?: number) => applySendValue(robot, localeId, 'reverbSend', 0.25, time),
        engineArgs: (robot: Robot) => [robot.id, { reverb: 0.25 }],
        storedOf: (robot: Robot | undefined) => robot?.reverbSend,
      },
      {
        name: 'applyLayersContinuous',
        engine: 'updateVoiceLayerParams' as const,
        call: (robot: Robot, time?: number) => applyLayersContinuous(robot, localeId, LAYERS, time),
        engineArgs: (robot: Robot) => [robot.id, LAYERS],
        storedOf: (robot: Robot | undefined) => robot?.audioAttributes.layers,
      },
      {
        name: 'applyAdsr',
        engine: 'updateVoiceEnvelope' as const,
        call: (robot: Robot, time?: number) => applyAdsr(robot, localeId, ADSR, time),
        engineArgs: (robot: Robot) => [robot.id, ADSR],
        storedOf: (robot: Robot | undefined) => robot?.audioAttributes.adsr,
      },
    ];

    function storedRobot(): Robot {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      return robot;
    }
    function stored(id: string): Robot | undefined {
      return useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === id);
    }

    it.each(ROWS)('$name hands the time to $engine as its last argument', ({ engine, call, engineArgs }) => {
      const robot = storedRobot();
      const spy = vi.spyOn(AudioEngine, engine).mockImplementation(() => {});
      call(robot, 4.5);
      expect(spy.mock.calls).toEqual([[...engineArgs(robot), 4.5]]);
    });

    it.each(ROWS)('$name hands a time of 0 through as 0', ({ engine, call, engineArgs }) => {
      const robot = storedRobot();
      const spy = vi.spyOn(AudioEngine, engine).mockImplementation(() => {});
      call(robot, 0);
      expect(spy.mock.calls).toEqual([[...engineArgs(robot), 0]]);
    });

    it.each(ROWS)('$name without a time (or an explicit undefined) makes the call a hand edit always made', ({ engine, call, engineArgs }) => {
      const robot = storedRobot();
      const spy = vi.spyOn(AudioEngine, engine).mockImplementation(() => {});
      call(robot);
      call(robot, undefined);
      expect(spy.mock.calls).toEqual([engineArgs(robot), engineArgs(robot)]);
      expect((spy.mock.calls as unknown[][]).map((args) => args.length)).toEqual([2, 2]);
    });

    it.each(ROWS)('$name stores the same value with a time as without', ({ engine, call, storedOf }) => {
      vi.spyOn(AudioEngine, engine).mockImplementation(() => {});
      const timed = storedRobot();
      call(timed, 4.5);
      const timedValue = storedOf(stored(timed.id));
      useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
      const untimed = storedRobot();
      call(untimed);
      expect(timedValue).toBeDefined();
      expect(storedOf(stored(untimed.id))).toEqual(timedValue);
    });

    it('applySendValue with a time still drops a NaN whole', () => {
      const robot = storedRobot();
      const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
      applySendValue(robot, localeId, 'reverbSend', NaN, 4.5);
      expect(sendsSpy).not.toHaveBeenCalled();
    });
  });
});
