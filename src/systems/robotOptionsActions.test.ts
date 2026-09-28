import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  applyAudioMode, applyVolume, applyVolumeLfo,
  applyDensity, applyMotifLength, applyNoteVariance, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyLayersContinuous, applyLayersStructural, applyLayerLfo, applyClickTrackActive,
  applyPitchRepeat,
} from './robotOptionsActions';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { AudioEngine } from '@/engine/AudioEngine';
import { lfoEngine } from '@/engine/lfoEngine';
import * as melodyGen from '@/engine/melodyGenerator';
import type { Robot, ADSREnvelope, MelodyEvent } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type { LfoValue } from '@/types/controls';
import type { Locale } from '@/types/locale';

vi.mock('@/engine/lfoEngine', () => ({
  lfoEngine: {
    connectLfoTarget: vi.fn(() => true),
    disconnectLfoTarget: vi.fn(),
    setLfoRate: vi.fn(),
    setLfoDepth: vi.fn(),
    setLfoShape: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    compositionSeed: 0.5,
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
      layers: [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
      ],
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

  describe('applyVolumeLfo', () => {
    it('writes lfoSettings.volume and connects the LFO target when rate > 0', () => {
      const robot = makeRobot({ lfoSettings: {} as unknown as Robot['lfoSettings'] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const value: LfoValue = { shape: 'sine', rate: 1, depth: 20 };

      applyVolumeLfo(robot, localeId, value);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { lfoSettings: { volume: value } });
      expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('volume', robot.id);
      expect(lfoEngine.start).toHaveBeenCalledWith('volume', robot.id);
    });

    it('disconnects the LFO target when rate is 0', () => {
      const robot = makeRobot({ lfoSettings: {} as unknown as Robot['lfoSettings'] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const value: LfoValue = { shape: 'sine', rate: 0, depth: 20 };

      applyVolumeLfo(robot, localeId, value);

      expect(lfoEngine.disconnectLfoTarget).toHaveBeenCalledWith('volume', robot.id);
      expect(lfoEngine.stop).toHaveBeenCalledWith('volume', robot.id);
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

  describe('applyLayersContinuous', () => {
    it('writes audioAttributes.layers and calls AudioEngine.updateVoiceLayerParams, not reReserveVoice', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const paramsSpy = vi.spyOn(AudioEngine, 'updateVoiceLayerParams').mockImplementation(() => {});
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
      const paramsSpy = vi.spyOn(AudioEngine, 'updateVoiceLayerParams').mockImplementation(() => {});
      const reReserveSpy = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
      const nextLayers: OscillatorLayer[] = [{ type: 'square', gain: 1, detune: 0, phase: 0 }];

      applyLayersStructural(robot, localeId, nextLayers);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, {
        audioAttributes: { ...robot.audioAttributes, layers: nextLayers },
      });
      expect(reReserveSpy).toHaveBeenCalledWith(robot.id);
      expect(paramsSpy).not.toHaveBeenCalled();
    });
  });

  describe('applyLayerLfo', () => {
    it('writes lfoSettings[target] and connects the LFO target when rate > 0', () => {
      const robot = makeRobot({ lfoSettings: {} as unknown as Robot['lfoSettings'] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      const value: LfoValue = { shape: 'triangle', rate: 2, depth: 40 };

      applyLayerLfo(robot, localeId, 'layer0.gain', value);

      expect(updateSpy).toHaveBeenCalledWith(localeId, robot.id, { lfoSettings: { 'layer0.gain': value } });
      expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('layer0.gain', robot.id);
      expect(lfoEngine.start).toHaveBeenCalledWith('layer0.gain', robot.id);
    });

    it('disconnects the LFO target when rate is 0', () => {
      const robot = makeRobot({ lfoSettings: {} as unknown as Robot['lfoSettings'] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const value: LfoValue = { shape: 'triangle', rate: 0, depth: 40 };

      applyLayerLfo(robot, localeId, 'layer0.gain', value);

      expect(lfoEngine.disconnectLfoTarget).toHaveBeenCalledWith('layer0.gain', robot.id);
      expect(lfoEngine.stop).toHaveBeenCalledWith('layer0.gain', robot.id);
    });
  });
});
