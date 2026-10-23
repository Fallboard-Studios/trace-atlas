import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompanyOptions } from './useCompanyOptions';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import * as robotOptionsActions from '@/systems/robotOptionsActions';
import * as audioSwells from '@/systems/audioSwells';
import { useAudioStore } from '@/stores/audioStore';
import { AudioEngine } from '@/engine/AudioEngine';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';
import type { RobotLfoTargetId } from '@/types/lfo';
import { DEFAULT_LFO_LINK } from '@/data/lfoConfig';

// The hook is CompanyOptionsSection's logic moved out of the component (docs/tasks/LAYOUT_REWORK.md
// Task 23): the value derivation, the broadcast handlers, the diff-one-field rule and the zero-member
// disabled state. The tests are CompanyOptionsSection.test.tsx's, with the leaf-component stubs'
// probe buttons replaced by calls to the handlers they called. Real store, real resolveCompanyOptions;
// robotOptionsActions is spied so no edit reaches the audio engine.

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    name: 'Test Robot',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
      filterFreq: 0,
      waveform: 'sine',
      layers: [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
        { type: 'square', gain: 0.8, detune: 5, phase: 10 },
        { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
      ],
    },
    octaveRange: [3, 5],
    masterVolume: 0.6,
    docking: 'active',
    batteryLevel: 100,
    rhythmicDensity: 42,
    pitchRepeat: 30,
    audioMode: 'none',
    ...overrides,
  } as Robot;
}

const THREE_LAYERS_A = [
  { type: 'sine', gain: 1, detune: 0, phase: 0 },
  { type: 'square', gain: 0.8, detune: 5, phase: 10 },
  { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
] as const;
const THREE_LAYERS_B = [
  { type: 'pulse', gain: 0.2, detune: 40, phase: 90 },
  { type: 'triangle', gain: 0.5, detune: -10, phase: 30 },
  { type: 'sine', gain: 0.9, detune: 15, phase: 5 },
] as const;
const ADSR_A = { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 };
const ADSR_B = { attack: 0.1, decay: 0.9, sustain: 0.1, release: 0.4 };

describe('useCompanyOptions', () => {
  const localeId = getActiveLocaleId();

  // Reset before each test, not after: RTL's own cleanup unmounts the hook after this file's afterEach,
  // so a reset there would write the store into a still-mounted hook (an act() warning).
  beforeEach(() => {
    useLocaleStore.getState().setLocaleData(localeId, {
      robots: [], companies: [], allRobotsLastEditedOptions: undefined,
    } as unknown as Partial<Locale>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const addCompany = (id: string, robotIds: string[], extra: object = {}) =>
    useLocaleStore.getState().addCompany(localeId, { id, name: 'Iron Consortium', color: '#4f6d7a', robotIds, ...extra });
  const addRobot = (robot: Robot) => useLocaleStore.getState().addRobot(localeId, robot);

  /** Two members with different ADSR and layers, so a broadcast has something of each member's own to preserve. */
  function twoDistinctMembers(extra: Partial<Robot> = {}) {
    addRobot(makeRobot({ id: 'r1', companyId: 'c1', audioAttributes: { adsr: ADSR_A, filterFreq: 0, waveform: 'sine', layers: [...THREE_LAYERS_A] }, ...extra }));
    addRobot(makeRobot({ id: 'r2', companyId: 'c1', audioAttributes: { adsr: ADSR_B, filterFreq: 0, waveform: 'sine', layers: [...THREE_LAYERS_B] } }));
    addCompany('c1', ['r1', 'r2']);
  }

  describe('who the members are', () => {
    it('is every robot assigned to the company, and no other', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c2' }));
      addRobot(makeRobot({ id: 'r3', companyId: undefined }));
      addCompany('c1', ['r1']);
      addCompany('c2', ['r2']);

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.members.map((m) => m.id)).toEqual(['r1']);
      expect(result.current.company?.id).toBe('c1');
    });

    it('is every robot in the locale for \'all\' — Freelance included — with no company', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: undefined }));
      addCompany('c1', ['r1']);

      const { result } = renderHook(() => useCompanyOptions('all'));

      expect(result.current.members.map((m) => m.id)).toEqual(['r1', 'r2']);
      expect(result.current.company).toBeUndefined();
    });

    it('follows the store: a robot moved into the company joins the members', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: undefined }));
      addCompany('c1', ['r1']);
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r2', 'c1'));

      expect(result.current.members.map((m) => m.id).sort()).toEqual(['r1', 'r2']);
    });
  });

  describe('the zero-member disabled state', () => {
    it('is disabled for \'all\' on an empty roster, with placeholder values that keep the layout complete', () => {
      const { result } = renderHook(() => useCompanyOptions('all'));

      const { options } = result.current;
      expect(options.active).toBe(false);
      expect(options.audioSettingValue).toEqual({ audioMode: 'none', masterVolume: 0, pan: 0, panAuto: true, reverbSend: 0, delaySend: 0, gritSend: 0, shimmerSend: 0, doubleSend: 0, dynamics: 0 });
      expect(options.signatureArrayValue.layers).toHaveLength(3);
      expect(options.adsrValue).toEqual({ attack: 0, decay: 0, sustain: 0, release: 0 });
    });

    it('is disabled for a company with no members', () => {
      addCompany('c1', []);

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.active).toBe(false);
      expect(result.current.company?.id).toBe('c1');
    });

    it('is disabled for an id naming no company (a stale selection), even if a robot carries that id', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'gone' }));

      const { result } = renderHook(() => useCompanyOptions('gone'));

      expect(result.current.company).toBeUndefined();
      expect(result.current.options.active).toBe(false);
    });

    it('is enabled once the company has a member', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addCompany('c1', ['r1']);

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.active).toBe(true);
    });

    it('goes disabled again when its last member leaves', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addCompany('c1', ['r1']);
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r1', null));

      expect(result.current.options.active).toBe(false);
    });
  });

  describe('the values (resolveCompanyOptions)', () => {
    it('come from the first member when the company has no last edit', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6, rhythmicDensity: 42, audioMode: 'solo' }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1', masterVolume: 0.1, rhythmicDensity: 5 }));
      addCompany('c1', ['r1', 'r2']);

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.audioSettingValue).toEqual({ audioMode: 'solo', masterVolume: 0.6, pan: 0, panAuto: true, reverbSend: 0, delaySend: 0, gritSend: 0, shimmerSend: 0, doubleSend: 0, dynamics: 50 });
      expect(result.current.options.pingControlsValue.rhythmicDensity).toBe(42);
    });

    it('prefer the company\'s own last edit, field by field, over the first member', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6, rhythmicDensity: 42 }));
      addCompany('c1', ['r1'], { lastEditedOptions: { masterVolume: 0.9 } });

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.audioSettingValue.masterVolume).toBe(0.9);
      expect(result.current.options.pingControlsValue.rhythmicDensity).toBe(42);
    });

    it('flatten the motif length and note variance to plain numbers for the Composition panel', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', rhythmicMotifLength: { active: true, value: 6 }, noteVariance: { active: true, value: 33 } }));
      addCompany('c1', ['r1']);

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.pingControlsValue.rhythmicMotifLength).toBe(6);
      expect(result.current.options.pingControlsValue.noteVariance).toBe(33);
    });

    it('for \'all\', come from the first robot in the locale, across companies and Freelance alike', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6 }));
      addRobot(makeRobot({ id: 'r2', companyId: undefined, masterVolume: 0.2 }));
      addCompany('c1', ['r1']);

      const { result } = renderHook(() => useCompanyOptions('all'));

      expect(result.current.options.active).toBe(true);
      expect(result.current.options.audioSettingValue.masterVolume).toBe(0.6);
    });

    it('for \'all\', prefer locale.allRobotsLastEditedOptions — and a company\'s own snapshot never leaks in', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6 }));
      addCompany('c1', ['r1'], { lastEditedOptions: { masterVolume: 0.2 } });
      useLocaleStore.getState().setLocaleData(localeId, { allRobotsLastEditedOptions: { masterVolume: 0.8 } } as unknown as Partial<Locale>);

      const all = renderHook(() => useCompanyOptions('all'));
      const company = renderHook(() => useCompanyOptions('c1'));

      expect(all.result.current.options.audioSettingValue.masterVolume).toBe(0.8);
      expect(company.result.current.options.audioSettingValue.masterVolume).toBe(0.2);
    });

    it('switching target re-derives from the new entity', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.5 }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c2', masterVolume: 0.7 }));
      addCompany('c1', ['r1']);
      addCompany('c2', ['r2']);
      const { result, rerender } = renderHook(({ target }) => useCompanyOptions(target), { initialProps: { target: 'c1' } });
      expect(result.current.options.audioSettingValue.masterVolume).toBe(0.5);

      rerender({ target: 'c2' });

      expect(result.current.options.audioSettingValue.masterVolume).toBe(0.7);
    });
  });

  describe('Output: audio mode and volume', () => {
    it('onAudioModeChange calls applyAudioMode once per member and records only audioMode', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyAudioMode').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onAudioModeChange('solo'));

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
      expect(spy.mock.calls.every((c) => c[1] === localeId && c[2] === 'solo')).toBe(true);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ audioMode: 'solo' });
    });

    it('onVolumeChange calls applyVolume once per member with the percent, and records only masterVolume as a fraction', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onVolumeChange(77));

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls.every((c) => c[2] === 77)).toBe(true);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ masterVolume: 0.77 });
    });

    it('onVolumeChange interrupts every member\'s own Volume swell', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onVolumeChange(77));

      expect(cancel.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([['r1', 'volume'], ['r2', 'volume']]);
    });

    it('a handler held from before a membership change still reaches the new member (handlers read the latest roster)', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: undefined }));
      addCompany('c1', ['r1']);
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const held = result.current.options.onVolumeChange;

      act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r2', 'c1'));
      act(() => held(50));

      expect(spy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
    });

    it('with no members there is nothing to broadcast to: applyVolume is never called', () => {
      addCompany('c1', []);
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onVolumeChange(50));

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // docs/tasks/ROBOT_PERFORMANCE.md Task 14 - the company Dynamics, Rests and Accents controls: the recorded snapshot
  // field, else the first member's own, else the default; a broadcast through the robot screen's own action once per
  // member; a snapshot of the plain number (onDensityChange's shape). Replaces Tasks 9 and 10's pass-throughs.
  describe('Dynamics, Rests and Accents (Robot Performance Task 14)', () => {
    const lastEdited = (id = 'c1') => useLocaleStore.getState().getCompanyById(localeId, id)?.lastEditedOptions;
    const allLastEdited = () => useLocaleStore.getState().getLocaleById(localeId)?.allRobotsLastEditedOptions;

    function twoMembersWithPerformance() {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', dynamics: 72, rests: 35, accents: 80 }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1', dynamics: 10, rests: 90, accents: 5 }));
      addCompany('c1', ['r1', 'r2']);
    }

    describe('the value', () => {
      it("is the first member's own dynamics, rests and accents, not the second's", () => {
        twoMembersWithPerformance();

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.audioSettingValue.dynamics).toBe(72);
        expect(result.current.options.pingControlsValue).toMatchObject({ rests: 35, accents: 80 });
      });

      it('shows the recorded snapshot over the first member, 0 included', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', dynamics: 72, rests: 35, accents: 80 }));
        addCompany('c1', ['r1'], { lastEditedOptions: { dynamics: 0, rests: 60, accents: 0 } });

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.audioSettingValue.dynamics).toBe(0);
        expect(result.current.options.pingControlsValue).toMatchObject({ rests: 60, accents: 0 });
      });

      it('is 50, 0 and 0 for a first member that carries none of the fields', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addCompany('c1', ['r1']);

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.audioSettingValue.dynamics).toBe(50);
        expect(result.current.options.pingControlsValue).toMatchObject({ rests: 0, accents: 0 });
      });

      it('is 0, 0 and 0 while the selection is disabled (no members)', () => {
        addCompany('c1', []);

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.active).toBe(false);
        expect(result.current.options.audioSettingValue.dynamics).toBe(0);
        expect(result.current.options.pingControlsValue).toMatchObject({ rests: 0, accents: 0 });
      });

      it('follows the first member when its fields change elsewhere, and ignores a member that is not first', () => {
        twoMembersWithPerformance();
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { dynamics: 80, rests: 20, accents: 45 }));
        expect(result.current.options.audioSettingValue.dynamics).toBe(80);
        expect(result.current.options.pingControlsValue).toMatchObject({ rests: 20, accents: 45 });

        const audioBefore = result.current.options.audioSettingValue;
        const pingBefore = result.current.options.pingControlsValue;
        act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { dynamics: 5, rests: 77, accents: 77 }));
        expect(result.current.options.audioSettingValue).toBe(audioBefore);
        expect(result.current.options.pingControlsValue).toBe(pingBefore);
      });

      it('"all" reads the three from the all-robots snapshot, else the first robot', () => {
        addRobot(makeRobot({ id: 'r1', companyId: undefined, dynamics: 72, rests: 35, accents: 80 }));
        const first = renderHook(() => useCompanyOptions('all')).result.current.options;
        expect(first.audioSettingValue.dynamics).toBe(72);
        expect(first.pingControlsValue).toMatchObject({ rests: 35, accents: 80 });

        useLocaleStore.getState().setLocaleData(localeId, { allRobotsLastEditedOptions: { rests: 60 } } as unknown as Partial<Locale>);
        const recorded = renderHook(() => useCompanyOptions('all')).result.current.options;
        expect(recorded.audioSettingValue.dynamics).toBe(72);
        expect(recorded.pingControlsValue).toMatchObject({ rests: 60, accents: 80 });
      });
    });

    describe('onDynamicsChange / onRestsChange / onAccentsChange', () => {
      it('onDynamicsChange(40) applies once per member with 40 and records only { dynamics: 40 }', () => {
        twoMembersWithPerformance();
        const apply = vi.spyOn(robotOptionsActions, 'applyDynamics').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onDynamicsChange(40));

        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), localeId, 40);
        expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }), localeId, 40);
        expect(lastEdited()).toEqual({ dynamics: 40 });
      });

      it('onRestsChange(40) applies once per member with 40 and records only { rests: 40 }', () => {
        twoMembersWithPerformance();
        const apply = vi.spyOn(robotOptionsActions, 'applyRests').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onRestsChange(40));

        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), localeId, 40);
        expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }), localeId, 40);
        expect(lastEdited()).toEqual({ rests: 40 });
      });

      it('onAccentsChange(40) applies once per member with 40 and records only { accents: 40 }', () => {
        twoMembersWithPerformance();
        const apply = vi.spyOn(robotOptionsActions, 'applyAccents').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onAccentsChange(40));

        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), localeId, 40);
        expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }), localeId, 40);
        expect(lastEdited()).toEqual({ accents: 40 });
      });

      it('each records its own key beside the others, never overwriting them', () => {
        twoMembersWithPerformance();
        vi.spyOn(robotOptionsActions, 'applyDynamics').mockImplementation(() => {});
        vi.spyOn(robotOptionsActions, 'applyRests').mockImplementation(() => {});
        vi.spyOn(robotOptionsActions, 'applyAccents').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onDynamicsChange(40));
        act(() => result.current.options.onRestsChange(0));
        act(() => result.current.options.onAccentsChange(100));

        expect(lastEdited()).toEqual({ dynamics: 40, rests: 0, accents: 100 });
      });

      it('with the real actions, every member stores the value and the panel shows it', () => {
        twoMembersWithPerformance();
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onDynamicsChange(40));

        const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
        expect(robots.find((r) => r.id === 'r1')?.dynamics).toBe(40);
        expect(robots.find((r) => r.id === 'r2')?.dynamics).toBe(40);
        expect(result.current.options.audioSettingValue.dynamics).toBe(40);
      });

      it('for "all", applies to every robot (Freelance included) and records into the all-robots snapshot', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', rests: 35 }));
        addRobot(makeRobot({ id: 'r2', companyId: undefined, rests: 90 }));
        addCompany('c1', ['r1']);
        const apply = vi.spyOn(robotOptionsActions, 'applyRests').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('all'));

        act(() => result.current.options.onRestsChange(55));

        expect(apply).toHaveBeenCalledTimes(2);
        expect(allLastEdited()).toEqual({ rests: 55 });
        expect(lastEdited()).toBeUndefined();
      });

      it('does nothing for a company that does not exist', () => {
        const apply = vi.spyOn(robotOptionsActions, 'applyAccents').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('ghost'));

        act(() => result.current.options.onAccentsChange(40));

        expect(apply).not.toHaveBeenCalled();
        expect(lastEdited('ghost')).toBeUndefined();
      });
    });

    describe('identity', () => {
      it('the three handlers keep their identity when an unrelated edit rebuilds the options', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addCompany('c1', ['r1']);
        vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const first = result.current.options;

        act(() => result.current.options.onVolumeChange(50));

        expect(result.current.options).not.toBe(first);
        expect(result.current.options.onDynamicsChange).toBe(first.onDynamicsChange);
        expect(result.current.options.onRestsChange).toBe(first.onRestsChange);
        expect(result.current.options.onAccentsChange).toBe(first.onAccentsChange);
      });

      it('the three handlers keep their identity across an edit of their own', () => {
        twoMembersWithPerformance();
        vi.spyOn(robotOptionsActions, 'applyRests').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const first = result.current.options;

        act(() => result.current.options.onRestsChange(40));

        expect(result.current.options.onDynamicsChange).toBe(first.onDynamicsChange);
        expect(result.current.options.onRestsChange).toBe(first.onRestsChange);
        expect(result.current.options.onAccentsChange).toBe(first.onAccentsChange);
      });
    });
  });

  // docs/tasks/ROBOT_SENDS.md Task 14 - the company Reverb and Delay rows: the first member's sends (or the
  // recorded ones), a broadcast that interrupts each member's own send swell, and a snapshot of the stored fraction.
  describe('Reverb and Delay sends (Robot Sends Task 14)', () => {
    const lastEdited = (id = 'c1') => useLocaleStore.getState().getCompanyById(localeId, id)?.lastEditedOptions;
    const stored = (id: string) => useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === id);

    function twoMembersWithSends() {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', reverbSend: 0.35, delaySend: 0.2 }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1', reverbSend: 0.8, delaySend: 0.6 }));
      addCompany('c1', ['r1', 'r2']);
    }

    describe('the value', () => {
      it('is the first member\'s own sends, not the second\'s', () => {
        twoMembersWithSends();

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.audioSettingValue.reverbSend).toBe(0.35);
        expect(result.current.options.audioSettingValue.delaySend).toBe(0.2);
      });

      it('shows the recorded snapshot over the first member, 0 included', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', reverbSend: 0.35, delaySend: 0.2 }));
        addCompany('c1', ['r1'], { lastEditedOptions: { reverbSend: 0.9, delaySend: 0 } });

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.audioSettingValue.reverbSend).toBe(0.9);
        expect(result.current.options.audioSettingValue.delaySend).toBe(0);
      });

      it('is 0 and 0 for a first member that carries neither field', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addCompany('c1', ['r1']);

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.audioSettingValue).toMatchObject({ reverbSend: 0, delaySend: 0 });
      });

      it('is 0 and 0 while the selection is disabled (no members)', () => {
        addCompany('c1', []);

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.active).toBe(false);
        expect(result.current.options.audioSettingValue).toMatchObject({ reverbSend: 0, delaySend: 0 });
      });

      it('follows the first member when its send changes elsewhere', () => {
        twoMembersWithSends();
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { reverbSend: 0.5 }));

        expect(result.current.options.audioSettingValue.reverbSend).toBe(0.5);
      });

      it('ignores a send change on a member that is not first (the value, and its identity, stay)', () => {
        twoMembersWithSends();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const before = result.current.options.audioSettingValue;

        act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { reverbSend: 0.1, delaySend: 0.1 }));

        expect(result.current.options.audioSettingValue).toBe(before);
      });

      it('"all" reads its sends from the all-robots snapshot, else the first robot', () => {
        addRobot(makeRobot({ id: 'r1', companyId: undefined, reverbSend: 0.35, delaySend: 0.2 }));
        expect(renderHook(() => useCompanyOptions('all')).result.current.options.audioSettingValue).toMatchObject({ reverbSend: 0.35, delaySend: 0.2 });

        useLocaleStore.getState().setLocaleData(localeId, { allRobotsLastEditedOptions: { reverbSend: 0.7 } } as unknown as Partial<Locale>);
        expect(renderHook(() => useCompanyOptions('all')).result.current.options.audioSettingValue).toMatchObject({ reverbSend: 0.7, delaySend: 0.2 });
      });
    });

    describe("onSendChange('reverbSend' | 'delaySend', pct)", () => {
      it("onSendChange('reverbSend', 40) interrupts and applies once per member with 40, and records only { reverbSend: 0.4 }", () => {
        twoMembersWithSends();
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange('reverbSend', 40));

        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
        expect(apply.mock.calls.every((c) => c[1] === localeId && c[2] === 'reverbSend' && c[3] === 40)).toBe(true);
        expect(cancel.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([['r1', 'reverbSend'], ['r2', 'reverbSend']]);
        expect(lastEdited()).toEqual({ reverbSend: 0.4 });
      });

      it("onSendChange('delaySend', 40) mirrors it for delaySend", () => {
        twoMembersWithSends();
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange('delaySend', 40));

        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply.mock.calls.every((c) => c[2] === 'delaySend' && c[3] === 40)).toBe(true);
        expect(cancel.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([['r1', 'delaySend'], ['r2', 'delaySend']]);
        expect(lastEdited()).toEqual({ delaySend: 0.4 });
      });

      it('a Reverb edit leaves the other send alone: no other field applied, no other cancel, no other snapshot key', () => {
        twoMembersWithSends();
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange('reverbSend', 40));

        expect(apply.mock.calls.map((c) => c[2])).toEqual(['reverbSend', 'reverbSend']);
        expect(cancel.mock.calls.some((c) => c[1] === 'delaySend')).toBe(false);
        expect(lastEdited()).not.toHaveProperty('delaySend');
      });

      it('interrupts each member before applying to it, so the typed value is the last write', () => {
        twoMembersWithSends();
        const order: string[] = [];
        vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute').mockImplementation((id, attr) => { order.push(`cancel:${id}:${attr}`); });
        vi.spyOn(robotOptionsActions, 'applySend').mockImplementation((robot) => { order.push(`apply:${robot.id}`); });
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange('reverbSend', 40));

        expect(order).toEqual(['cancel:r1:reverbSend', 'apply:r1', 'cancel:r2:reverbSend', 'apply:r2']);
      });

      it.each([
        ['over the top', 150, 1],
        ['below zero', -5, 0],
        ['exactly zero (fully dry), a real write', 0, 0],
        ['exactly full', 100, 1],
        ['a fraction of a percent', 12.5, 0.125],
      ] as const)('a Reverb value %s records the clamped fraction the members store', (_name, display, expected) => {
        twoMembersWithSends();
        vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange('reverbSend', display));

        expect(lastEdited()).toEqual({ reverbSend: expected });
      });

      it('a Delay value past either end records the clamped fraction too', () => {
        twoMembersWithSends();
        vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange('delaySend', 250));
        expect(lastEdited()).toEqual({ delaySend: 1 });
        act(() => result.current.options.onSendChange('delaySend', -3));
        expect(lastEdited()).toEqual({ delaySend: 0 });
      });

      it('a NaN is dropped whole: no cancel, no action, no snapshot', () => {
        twoMembersWithSends();
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => {
          result.current.options.onSendChange('reverbSend', NaN);
          result.current.options.onSendChange('delaySend', NaN);
        });

        expect(apply).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
        expect(lastEdited()).toBeUndefined();
      });

      it('with no members there is nothing to broadcast to and nothing to record', () => {
        addCompany('c1', []);
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => {
          result.current.options.onSendChange('reverbSend', 50);
          result.current.options.onSendChange('delaySend', 50);
        });

        expect(apply).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
        expect(lastEdited()).toBeUndefined();
      });

      it('a handler held from before a membership change still reaches the new member', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addRobot(makeRobot({ id: 'r2', companyId: undefined }));
        addCompany('c1', ['r1']);
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const held = result.current.options.onSendChange;

        act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r2', 'c1'));
        act(() => held('reverbSend', 50));

        expect(apply.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
      });

      it('"all" broadcasts to every robot, Freelance included, and records into the all-robots snapshot', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addRobot(makeRobot({ id: 'r2', companyId: undefined }));
        addCompany('c1', ['r1']);
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('all'));

        act(() => result.current.options.onSendChange('delaySend', 30));

        expect(apply.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
        expect(useLocaleStore.getState().getLocaleById(localeId)?.allRobotsLastEditedOptions).toEqual({ delaySend: 0.3 });
        expect(lastEdited()).toBeUndefined();
      });

      // The real actions, nothing mocked but the engine: every member stores the send, each keeps its other one.
      it('end to end: every member stores the fraction and primes the engine; the other send is untouched', () => {
        twoMembersWithSends();
        const engine = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange('reverbSend', 40));

        expect(stored('r1')).toMatchObject({ reverbSend: 0.4, delaySend: 0.2 });
        expect(stored('r2')).toMatchObject({ reverbSend: 0.4, delaySend: 0.6 });
        expect(engine).toHaveBeenCalledTimes(2);
        expect(engine).toHaveBeenCalledWith('r1', { reverb: 0.4 });
        expect(engine).toHaveBeenCalledWith('r2', { reverb: 0.4 });
        expect(result.current.options.audioSettingValue.reverbSend).toBe(0.4);
      });

      it('a member outside the company is untouched', () => {
        twoMembersWithSends();
        addRobot(makeRobot({ id: 'r9', companyId: 'c2', reverbSend: 0.9, delaySend: 0.9 }));
        vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange('reverbSend', 10));

        expect(stored('r9')).toMatchObject({ reverbSend: 0.9, delaySend: 0.9 });
      });
    });

    describe('identity', () => {
      it('the handlers keep their identity when an unrelated edit rebuilds the options', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addCompany('c1', ['r1']);
        vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const first = result.current.options;

        act(() => result.current.options.onVolumeChange(50)); // records a snapshot, so the options object is rebuilt

        expect(result.current.options).not.toBe(first);
        expect(result.current.options.onSendChange).toBe(first.onSendChange);
      });

      it('the handler keeps its identity across a send edit of its own', () => {
        twoMembersWithSends();
        vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const first = result.current.options;

        act(() => result.current.options.onSendChange('reverbSend', 40));

        expect(result.current.options.onSendChange).toBe(first.onSendChange);
      });

      it('the options carry one send handler and one flag record, and none of the ten per-field members (Robot Send Table T12)', () => {
        twoMembersWithSends();
        const { options } = renderHook(() => useCompanyOptions('c1')).result.current;
        expect(typeof options.onSendChange).toBe('function');
        expect(Object.keys(options.sendSwelling)).toEqual(['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend']);
        const keys = Object.keys(options);
        for (const name of ['Reverb', 'Delay', 'Grit', 'Shimmer', 'Double']) {
          expect(keys, name).not.toContain(`on${name}SendChange`);
          expect(keys, name).not.toContain(`${name.toLowerCase()}SendSwelling`);
        }
      });

      it('the flag record keeps its identity while no flag changes, so the options do not rebuild for it', () => {
        twoMembersWithSends();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const first = result.current.options.sendSwelling;

        act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 5 }));

        expect(result.current.options.sendSwelling).toBe(first);
      });

      it('the options object keeps its identity through an edit that changes nothing in it (a non-first member\'s battery)', () => {
        twoMembersWithSends();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const first = result.current.options;

        act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { batteryLevel: 5 }));

        expect(result.current.options).toBe(first);
      });
    });

    describe('the swelling flags', () => {
      it('are read from the first member only, per send', () => {
        twoMembersWithSends();
        vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation(
          (id, attr) => (id === 'r1' && attr === 'reverbSend') || (id === 'r2' && attr === 'delaySend'),
        );

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.sendSwelling.reverbSend).toBe(true);
        expect(result.current.options.sendSwelling.delaySend).toBe(false); // r2 is not the first member
        expect(result.current.options.volumeSwelling).toBe(false);
      });

      it('a company-wide swell on reverbSend (every member swelling together) shows true, and delay stays false', () => {
        twoMembersWithSends();
        vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((_id, attr) => attr === 'reverbSend');

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.sendSwelling.reverbSend).toBe(true);
        expect(result.current.options.sendSwelling.delaySend).toBe(false);
      });

      it.each(['reverbSend', 'delaySend'] as const)('%s\'s flag is recomputed when a swell tick writes that send (the module-scope Map is not tracked by React)', (field) => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', reverbSend: 0.3, delaySend: 0.3 }));
        addCompany('c1', ['r1']);
        let swelling = false;
        vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((_id, attr) => swelling && attr === field);
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const flag = () => result.current.options.sendSwelling[field];
        expect(flag()).toBe(false);

        swelling = true;
        act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { [field]: 0.4 }));

        expect(flag()).toBe(true);
      });

      // Robot Send Table T12: the flags are read on every render (useSendSwellingFlags), so a flip on a render that changes
      // nothing else in the options (a non-first member's battery tick) must still rebuild them.
      it('a flag that flips while the hook re-renders for an unrelated change still reaches the options', () => {
        twoMembersWithSends();
        let swelling = false;
        vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((id, attr) => swelling && id === 'r1' && attr === 'delaySend');
        const { result } = renderHook(() => useCompanyOptions('c1'));
        expect(result.current.options.sendSwelling.delaySend).toBe(false);

        swelling = true;
        act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { batteryLevel: 5 }));

        expect(result.current.options.sendSwelling.delaySend).toBe(true);
      });

      it('the send handler keeps its identity when only a swell flag changes', () => {
        twoMembersWithSends();
        let swelling = false;
        vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((id, attr) => swelling && id === 'r1' && attr === 'reverbSend');
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const first = result.current.options.onSendChange;

        swelling = true;
        act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { reverbSend: 0.5 }));

        expect(result.current.options.sendSwelling.reverbSend).toBe(true);
        expect(result.current.options.onSendChange).toBe(first);
      });

      it('are false when there is no first member', () => {
        const { result } = renderHook(() => useCompanyOptions('all'));

        expect(result.current.options.sendSwelling).toEqual({ reverbSend: false, delaySend: false, gritSend: false, shimmerSend: false, doubleSend: false });
      });
    });
  });

  // docs/tasks/ROBOT_EFFECT_SENDS.md Task 14: Grit, Shimmer and Double broadcast on Reverb's shape (one onSendChange for
  // all five since docs/tasks/ROBOT_SEND_TABLE.md Task 12).
  describe.each([
    { field: 'gritSend', key: 'grit' },
    { field: 'shimmerSend', key: 'shimmer' },
    { field: 'doubleSend', key: 'double' },
  ] as const)('$field (Robot Effect Sends Task 14)', ({ field, key }) => {
    const SEND_FIELDS = ['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const;
    const lastEdited = (id = 'c1') => useLocaleStore.getState().getCompanyById(localeId, id)?.lastEditedOptions;
    const stored = (id: string) => useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === id);

    /** r1 and r2 carry distinct values for every send, so a crossed field or a member mix-up shows. */
    function twoMembersWithSends() {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', reverbSend: 0.35, delaySend: 0.2, gritSend: 0.45, shimmerSend: 0.3, doubleSend: 0.15 }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1', reverbSend: 0.8, delaySend: 0.6, gritSend: 0.05, shimmerSend: 0.7, doubleSend: 0.55 }));
      addCompany('c1', ['r1', 'r2']);
    }

    describe('the value', () => {
      it('is the first member\'s own send, not the second\'s', () => {
        twoMembersWithSends();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        expect(result.current.options.audioSettingValue[field]).toBe(stored('r1')![field]);
      });

      it('shows the recorded snapshot over the first member, 0 included', () => {
        twoMembersWithSends();
        useLocaleStore.getState().updateCompany(localeId, 'c1', { lastEditedOptions: { [field]: 0 } });
        const { result } = renderHook(() => useCompanyOptions('c1'));
        expect(result.current.options.audioSettingValue[field]).toBe(0);
      });

      it('is 0 for a first member that carries no such field, and 0 while disabled', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addCompany('c1', ['r1']);
        addCompany('c2', []);
        expect(renderHook(() => useCompanyOptions('c1')).result.current.options.audioSettingValue[field]).toBe(0);
        expect(renderHook(() => useCompanyOptions('c2')).result.current.options.audioSettingValue[field]).toBe(0);
      });

      it('follows the first member when its send changes elsewhere, and ignores the second member', () => {
        twoMembersWithSends();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const before = result.current.options.audioSettingValue;

        act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { [field]: 0.99 }));
        expect(result.current.options.audioSettingValue).toBe(before);

        act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { [field]: 0.5 }));
        expect(result.current.options.audioSettingValue[field]).toBe(0.5);
      });
    });

    describe(`onSendChange('${field}', pct)`, () => {
      it(`onSendChange('${field}', 40) interrupts and applies once per member with 40, and records only { ${field}: 0.4 }`, () => {
        twoMembersWithSends();
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange(field, 40));

        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
        expect(apply.mock.calls.every((c) => c[1] === localeId && c[2] === field && c[3] === 40)).toBe(true);
        expect(cancel.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([['r1', field], ['r2', field]]);
        expect(lastEdited()).toEqual({ [field]: 0.4 });
      });

      it('touches no other send: no other field applied, no other cancel, no other snapshot key', () => {
        twoMembersWithSends();
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange(field, 40));

        expect(apply.mock.calls.map((c) => c[2])).toEqual([field, field]);
        expect(cancel.mock.calls.every((c) => c[1] === field)).toBe(true);
        expect(Object.keys(lastEdited()!)).toEqual([field]);
      });

      it('interrupts each member before applying to it, so the typed value is the last write', () => {
        twoMembersWithSends();
        const order: string[] = [];
        vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute').mockImplementation((id, attr) => { order.push(`cancel:${id}:${attr}`); });
        vi.spyOn(robotOptionsActions, 'applySend').mockImplementation((...args) => { order.push(`apply:${args[0].id}`); });
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange(field, 40));

        expect(order).toEqual([`cancel:r1:${field}`, 'apply:r1', `cancel:r2:${field}`, 'apply:r2']);
      });

      it.each([
        ['over the top', 150, 1],
        ['below zero', -5, 0],
        ['exactly zero, a real write', 0, 0],
        ['a fraction of a percent', 12.5, 0.125],
      ] as const)('a value %s records the clamped fraction the members store', (_name, display, expected) => {
        twoMembersWithSends();
        vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange(field, display));

        expect(lastEdited()).toEqual({ [field]: expected });
      });

      it('a NaN is dropped whole: no cancel, no action, no snapshot', () => {
        twoMembersWithSends();
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange(field, NaN));

        expect(apply).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
        expect(lastEdited()).toBeUndefined();
      });

      it('with no members there is nothing to broadcast to and nothing to record', () => {
        addCompany('c1', []);
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange(field, 50));

        expect(apply).not.toHaveBeenCalled();
        expect(lastEdited()).toBeUndefined();
      });

      it('"all" broadcasts to every robot, Freelance included, and records into the all-robots snapshot', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addRobot(makeRobot({ id: 'r2', companyId: undefined }));
        addCompany('c1', ['r1']);
        const apply = vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('all'));

        act(() => result.current.options.onSendChange(field, 30));

        expect(apply.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
        expect(useLocaleStore.getState().getLocaleById(localeId)?.allRobotsLastEditedOptions).toEqual({ [field]: 0.3 });
        expect(lastEdited()).toBeUndefined();
      });

      it('end to end: every member stores the fraction and primes the engine; every other send and robot is untouched', () => {
        twoMembersWithSends();
        addRobot(makeRobot({ id: 'r9', companyId: 'c2', [field]: 0.9 }));
        const before = { r1: stored('r1')!, r2: stored('r2')! };
        const engine = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onSendChange(field, 40));

        for (const id of ['r1', 'r2'] as const) {
          expect(stored(id)![field]).toBe(0.4);
          for (const other of SEND_FIELDS) if (other !== field) expect(stored(id)![other], `${id}.${other}`).toBe(before[id][other]);
          expect(engine).toHaveBeenCalledWith(id, { [key]: 0.4 });
        }
        expect(engine).toHaveBeenCalledTimes(2);
        expect(stored('r9')![field]).toBe(0.9);
        expect(result.current.options.audioSettingValue[field]).toBe(0.4);
      });
    });

    describe('identity', () => {
      it('the handler keeps its identity when an unrelated edit rebuilds the options, and across its own edit', () => {
        twoMembersWithSends();
        vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
        vi.spyOn(robotOptionsActions, 'applySend').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const first = result.current.options;

        act(() => result.current.options.onVolumeChange(50));
        expect(result.current.options).not.toBe(first);
        expect(result.current.options.onSendChange).toBe(first.onSendChange);

        act(() => result.current.options.onSendChange(field, 40));
        expect(result.current.options.onSendChange).toBe(first.onSendChange);
      });
    });

    describe('the swelling flag', () => {
      it('is read from the first member only', () => {
        twoMembersWithSends();
        vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((id, attr) => id === 'r2' && attr === field);
        expect(renderHook(() => useCompanyOptions('c1')).result.current.options.sendSwelling[field]).toBe(false);

        vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((id, attr) => id === 'r1' && attr === field);
        const { options } = renderHook(() => useCompanyOptions('c1')).result.current;
        expect(options.sendSwelling[field]).toBe(true);
        expect(options.volumeSwelling).toBe(false);
        for (const other of SEND_FIELDS) if (other !== field) expect(options.sendSwelling[other], other).toBe(false);
      });

      it('is recomputed when a swell tick writes that send (the module-scope Map is not tracked by React)', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', [field]: 0.3 }));
        addCompany('c1', ['r1']);
        let swelling = false;
        vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((_id, attr) => swelling && attr === field);
        const { result } = renderHook(() => useCompanyOptions('c1'));
        expect(result.current.options.sendSwelling[field]).toBe(false);

        swelling = true;
        act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { [field]: 0.4 }));

        expect(result.current.options.sendSwelling[field]).toBe(true);
      });

      it('is false when there is no first member', () => {
        expect(renderHook(() => useCompanyOptions('all')).result.current.options.sendSwelling[field]).toBe(false);
      });
    });
  });

  describe('Output: pan', () => {
    it('audioSettingValue carries the first member\'s own non-default pan and panAuto', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', pan: -0.35, panAuto: false }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1', pan: 0.9, panAuto: true }));
      addCompany('c1', ['r1', 'r2']);

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.audioSettingValue).toEqual({ audioMode: 'none', masterVolume: 0.6, pan: -0.35, panAuto: false, reverbSend: 0, delaySend: 0, gritSend: 0, shimmerSend: 0, doubleSend: 0, dynamics: 50 });
    });

    it('audioSettingValue shows the recorded snapshot over the first member, so the slider reads the stored pan', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', pan: 0.1, panAuto: true }));
      addCompany('c1', ['r1'], { lastEditedOptions: { pan: 0.8, panAuto: false } });

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.audioSettingValue.pan).toBe(0.8);
      expect(result.current.options.audioSettingValue.panAuto).toBe(false);
    });

    it('onPanChange calls applyPan once per member with the display number, and records pan as a fraction', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyPan').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onPanChange(40));

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
      expect(spy.mock.calls.every((c) => c[1] === localeId && c[2] === 40)).toBe(true);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ pan: 0.4 });
    });

    it('onPanChange handles the full negative range', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyPan').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onPanChange(-100));

      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ pan: -1 });
    });

    it('onPanChange records the same clamped value applyPan stores, so the snapshot cannot disagree with the members', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyPan').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onPanChange(150));
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.pan).toBe(1);

      act(() => result.current.options.onPanChange(-150));
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.pan).toBe(-1);
    });

    it('onPanAutoChange(false) calls applyPanAuto per member and records Auto off at the resolved pan', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', pan: 0.3, panAuto: true }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1', pan: -0.6, panAuto: true }));
      addCompany('c1', ['r1', 'r2']);
      const spy = vi.spyOn(robotOptionsActions, 'applyPanAuto').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onPanAutoChange(false));

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
      expect(spy.mock.calls.every((c) => c[1] === localeId && c[2] === false)).toBe(true);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ panAuto: false, pan: 0.3 });
    });

    it('onPanAutoChange(false) after a recorded pan keeps that pan, not the first member\'s', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', pan: 0.3, panAuto: true }));
      addCompany('c1', ['r1'], { lastEditedOptions: { pan: -0.5 } });
      vi.spyOn(robotOptionsActions, 'applyPanAuto').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onPanAutoChange(false));

      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ panAuto: false, pan: -0.5 });
    });

    it('onPanAutoChange(true) calls applyPanAuto per member and records exactly { panAuto: true }', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyPanAuto').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onPanAutoChange(true));

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls.every((c) => c[2] === true)).toBe(true);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ panAuto: true });
    });

    it('for \'all\' both handlers reach every robot in the locale and record on the all-robots snapshot', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: undefined }));
      addCompany('c1', ['r1']);
      const pan = vi.spyOn(robotOptionsActions, 'applyPan').mockImplementation(() => {});
      const auto = vi.spyOn(robotOptionsActions, 'applyPanAuto').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('all'));

      act(() => result.current.options.onPanAutoChange(false));
      act(() => result.current.options.onPanChange(25));

      expect(auto.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
      expect(pan.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
      expect(useLocaleStore.getState().getLocaleById(localeId)?.allRobotsLastEditedOptions).toEqual({ panAuto: false, pan: 0.25 });
    });

    it('with no members there is nothing to broadcast to: neither action is called', () => {
      addCompany('c1', []);
      const pan = vi.spyOn(robotOptionsActions, 'applyPan').mockImplementation(() => {});
      const auto = vi.spyOn(robotOptionsActions, 'applyPanAuto').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onPanChange(50));
      act(() => result.current.options.onPanAutoChange(false));

      expect(pan).not.toHaveBeenCalled();
      expect(auto).not.toHaveBeenCalled();
    });

    it('a handler held from before a membership change still reaches the new member', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: undefined }));
      addCompany('c1', ['r1']);
      const spy = vi.spyOn(robotOptionsActions, 'applyPan').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const held = result.current.options.onPanChange;

      act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r2', 'c1'));
      act(() => held(10));

      expect(spy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
    });

    it('the two handlers keep their identity across an edit that changes neither', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyDensity').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const { onPanChange, onPanAutoChange } = result.current.options;

      act(() => result.current.options.onDensityChange(70));

      expect(result.current.options.onPanChange).toBe(onPanChange);
      expect(result.current.options.onPanAutoChange).toBe(onPanAutoChange);
    });
  });

  describe('Composition', () => {
    it('onDensityChange broadcasts applyDensity and records rhythmicDensity', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyDensity').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onDensityChange(61));

      expect(spy).toHaveBeenCalledTimes(2);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ rhythmicDensity: 61 });
    });

    it('onMotifLengthChange records an active {value} above zero and an inactive one at zero (the edit that crosses 0)', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyMotifLength').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onMotifLengthChange(12));
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.rhythmicMotifLength).toEqual({ active: true, value: 12 });

      act(() => result.current.options.onMotifLengthChange(0));
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.rhythmicMotifLength).toEqual({ active: false, value: 0 });
      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('onNoteVarianceChange records an active {value} above zero and an inactive one at zero', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyNoteVariance').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onNoteVarianceChange(40));
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.noteVariance).toEqual({ active: true, value: 40 });

      act(() => result.current.options.onNoteVarianceChange(0));
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.noteVariance).toEqual({ active: false, value: 0 });
    });

    it('onPitchRepeatChange broadcasts applyPitchRepeat and records pitchRepeat', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyPitchRepeat').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onPitchRepeatChange(90));

      expect(spy).toHaveBeenCalledTimes(2);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ pitchRepeat: 90 });
    });

    it('onOctaveMinChange keeps the resolved max, and onOctaveMaxChange keeps the resolved min', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', octaveRange: [3, 5] }));
      addCompany('c1', ['r1']);
      const minSpy = vi.spyOn(robotOptionsActions, 'applyOctaveMin').mockImplementation(() => {});
      const maxSpy = vi.spyOn(robotOptionsActions, 'applyOctaveMax').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onOctaveMinChange(4));
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.octaveRange).toEqual([4, 5]);
      expect(minSpy).toHaveBeenCalledTimes(1);

      act(() => result.current.options.onOctaveMaxChange(7));
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.octaveRange).toEqual([4, 7]);
      expect(maxSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Envelope: the diff-one-field rule', () => {
    it('editing Attack broadcasts only attack — each member keeps its own Decay / Sustain / Release', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onAdsrChange({ ...result.current.options.adsrValue, attack: 0.9 }));

      expect(spy.mock.calls.find((c) => c[0].id === 'r1')?.[2]).toEqual({ ...ADSR_A, attack: 0.9 });
      expect(spy.mock.calls.find((c) => c[0].id === 'r2')?.[2]).toEqual({ attack: 0.9, decay: 0.9, sustain: 0.1, release: 0.4 });
    });

    it('interrupts every member\'s own Attack swell only, never Decay / Sustain / Release', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onAdsrChange({ ...result.current.options.adsrValue, attack: 0.9 }));

      expect(cancel).toHaveBeenCalledWith('r1', 'adsr.attack');
      expect(cancel).toHaveBeenCalledWith('r2', 'adsr.attack');
      expect(cancel).toHaveBeenCalledTimes(2);
    });

    it('records the whole new envelope in the company snapshot', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onAdsrChange({ ...result.current.options.adsrValue, attack: 0.9 }));

      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ adsr: { ...ADSR_A, attack: 0.9 } });
    });
  });

  describe('Source: the three layers', () => {
    it('editing one layer\'s Gain broadcasts only that layer\'s gain — other layers and other members\' own values survive', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onLayerParamChange(1, 'gain', 0.4));

      const r2Layers = spy.mock.calls.find((c) => c[0].id === 'r2')?.[2] as { type: string; gain: number; detune: number; phase: number }[];
      expect(r2Layers[0]).toEqual({ type: 'pulse', gain: 0.2, detune: 40, phase: 90 });
      expect(r2Layers[1]).toEqual({ type: 'triangle', gain: 0.4, detune: -10, phase: 30 });
      expect(r2Layers[2]).toEqual({ type: 'sine', gain: 0.9, detune: 15, phase: 5 });
    });

    it('a layer-param edit interrupts every member\'s own swell on that layer attribute and no other', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
      const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onLayerParamChange(1, 'gain', 0.4));

      expect(cancel.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([['r1', 'layer1.gain'], ['r2', 'layer1.gain']]);
    });

    it('a layer-param edit records the snapshot layers with only that field changed', () => {
      twoDistinctMembers();
      vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onLayerParamChange(2, 'detune', -25));

      const layers = useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.layers;
      expect(layers?.[2]).toEqual({ ...THREE_LAYERS_A[2], detune: -25 });
      expect(layers?.[0]).toEqual(THREE_LAYERS_A[0]);
    });

    it('a layer-type edit goes through applyLayersStructural, changing only that layer\'s type per member', () => {
      twoDistinctMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyLayersStructural').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('c1'));

      act(() => result.current.options.onLayerTypeChange(1, 'square'));

      const r2Layers = spy.mock.calls.find((c) => c[0].id === 'r2')?.[2] as { type: string }[];
      expect(r2Layers.map((l) => l.type)).toEqual(['pulse', 'square', 'sine']);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.layers?.[1].type).toBe('square');
    });

    // LFO Bank Task 13: a layer's LfoLink broadcasts through applyLayerLfoLink, diffing lane and depth
    // independently via diffCompoundField, so a member's untouched field survives.
    describe('a layer\'s LFO link', () => {
      const LINKS = {
        r1: { 'layer1.gain': { lane: 'a', depth: 40 } },
        r2: { 'layer1.gain': { lane: 'c', depth: 70 } },
      } as unknown as Record<string, Robot['lfoLinks']>;
      function twoLinkedMembers() {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', lfoLinks: LINKS.r1 }));
        addRobot(makeRobot({ id: 'r2', companyId: 'c1', lfoLinks: LINKS.r2 }));
        addCompany('c1', ['r1', 'r2']);
      }

      it('editing the lane broadcasts only the lane — each member keeps its own depth', () => {
        twoLinkedMembers();
        const spy = vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const current = result.current.options.signatureArrayValue.lfoLinks?.['layer1.gain' as RobotLfoTargetId];

        act(() => result.current.options.onLayerLfoFieldChange(1, 'layer1.gain' as RobotLfoTargetId, { ...current!, lane: 'b' }));

        expect(spy.mock.calls.find((c) => c[0].id === 'r2')?.[3]).toEqual({ lane: 'b', depth: 70 });
        expect(spy.mock.calls.find((c) => c[0].id === 'r1')?.[3]).toEqual({ lane: 'b', depth: 40 });
      });

      it('editing the depth broadcasts only the depth — each member keeps its own lane', () => {
        twoLinkedMembers();
        const spy = vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const current = result.current.options.signatureArrayValue.lfoLinks?.['layer1.gain' as RobotLfoTargetId];

        act(() => result.current.options.onLayerLfoFieldChange(1, 'layer1.gain' as RobotLfoTargetId, { ...current!, depth: 55 }));

        expect(spy.mock.calls.find((c) => c[0].id === 'r2')?.[3]).toEqual({ lane: 'c', depth: 55 });
        expect(spy.mock.calls.find((c) => c[0].id === 'r1')?.[3]).toEqual({ lane: 'a', depth: 55 });
      });

      it('patches the company snapshot with the full new link, not just the changed field', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', lfoLinks: LINKS.r1 }));
        addCompany('c1', ['r1']);
        vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const current = result.current.options.signatureArrayValue.lfoLinks?.['layer1.gain' as RobotLfoTargetId];

        act(() => result.current.options.onLayerLfoFieldChange(1, 'layer1.gain' as RobotLfoTargetId, { ...current!, lane: 'b' }));

        const snapshot = useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions;
        expect(snapshot?.lfoLinks?.['layer1.gain' as RobotLfoTargetId]).toEqual({ lane: 'b', depth: 40 });
      });

      it('keeps the snapshot\'s links for the other targets when one target is edited', () => {
        const links = { 'layer0.gain': { lane: 'd', depth: 12 }, 'layer1.gain': { lane: 'a', depth: 40 } } as unknown as Robot['lfoLinks'];
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', lfoLinks: links }));
        addCompany('c1', ['r1']);
        vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const current = result.current.options.signatureArrayValue.lfoLinks?.['layer1.gain' as RobotLfoTargetId];

        act(() => result.current.options.onLayerLfoFieldChange(1, 'layer1.gain' as RobotLfoTargetId, { ...current!, lane: 'b' }));

        const snapshot = useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions;
        expect(snapshot?.lfoLinks?.['layer0.gain' as RobotLfoTargetId]).toEqual({ lane: 'd', depth: 12 });
        expect(snapshot?.lfoLinks?.['layer1.gain' as RobotLfoTargetId]).toEqual({ lane: 'b', depth: 40 });
      });

      it('a member with no link of its own starts from the default link, not from undefined', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1', lfoLinks: LINKS.r1 }));
        addRobot(makeRobot({ id: 'r2', companyId: 'c1', lfoLinks: undefined }));
        addCompany('c1', ['r1', 'r2']);
        const spy = vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const current = result.current.options.signatureArrayValue.lfoLinks?.['layer1.gain' as RobotLfoTargetId];

        act(() => result.current.options.onLayerLfoFieldChange(1, 'layer1.gain' as RobotLfoTargetId, { ...current!, lane: 'b' }));

        const r2Link = spy.mock.calls.find((c) => c[0].id === 'r2')?.[3];
        expect(r2Link).toMatchObject({ lane: 'b' });
        expect(typeof r2Link?.depth).toBe('number');
      });
    });
  });

  describe('\'all\'', () => {
    function threeRobotsAcrossCompanies() {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6 }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c2' }));
      addRobot(makeRobot({ id: 'r3', companyId: undefined }));
      addCompany('c1', ['r1']);
      addCompany('c2', ['r2']);
    }

    it('editing Volume calls applyVolume once per robot in the locale, regardless of company', () => {
      threeRobotsAcrossCompanies();
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('all'));

      act(() => result.current.options.onVolumeChange(77));

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2', 'r3']);
    });

    it('editing Volume interrupts every robot\'s own Volume swell', () => {
      threeRobotsAcrossCompanies();
      vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
      const { result } = renderHook(() => useCompanyOptions('all'));

      act(() => result.current.options.onVolumeChange(77));

      expect(cancel.mock.calls.map((c) => c[0]).sort()).toEqual(['r1', 'r2', 'r3']);
      expect(cancel.mock.calls.every((c) => c[1] === 'volume')).toBe(true);
    });

    it('records the edit in locale.allRobotsLastEditedOptions, never in any company\'s lastEditedOptions', () => {
      threeRobotsAcrossCompanies();
      vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const updateCompany = vi.spyOn(useLocaleStore.getState(), 'updateCompany');
      const { result } = renderHook(() => useCompanyOptions('all'));

      act(() => result.current.options.onVolumeChange(77));

      expect(updateCompany).not.toHaveBeenCalled();
      expect(useLocaleStore.getState().getLocaleById(localeId)?.allRobotsLastEditedOptions?.masterVolume).toBeCloseTo(0.77, 5);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toBeUndefined();
    });

    it('a second edit keeps the first one\'s fields in the snapshot', () => {
      threeRobotsAcrossCompanies();
      vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      vi.spyOn(robotOptionsActions, 'applyDensity').mockImplementation(() => {});
      const { result } = renderHook(() => useCompanyOptions('all'));

      act(() => result.current.options.onVolumeChange(77));
      act(() => result.current.options.onDensityChange(10));

      const snapshot = useLocaleStore.getState().getLocaleById(localeId)?.allRobotsLastEditedOptions;
      expect(snapshot?.masterVolume).toBeCloseTo(0.77, 5);
      expect(snapshot?.rhythmicDensity).toBe(10);
    });

    it('its last-edited value is independent of any company\'s', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.5 }));
      addCompany('c1', ['r1']);
      vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const all = renderHook(() => useCompanyOptions('all'));
      act(() => all.result.current.options.onVolumeChange(77));

      const company = renderHook(() => useCompanyOptions('c1'));

      expect(company.result.current.options.audioSettingValue.masterVolume).toBe(0.5);
    });
  });

  describe('the swelling flags (a swell\'s own ramp is not eased twice)', () => {
    it('are read from the first member only, matching the value they sit beside', () => {
      twoDistinctMembers();
      vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation(
        (id, attr) => (id === 'r1' && attr === 'volume') || (id === 'r2' && attr === 'adsr.attack') || (id === 'r1' && attr === 'layer2.phase'),
      );

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.volumeSwelling).toBe(true);
      expect(result.current.options.adsrSwelling).toEqual({ attack: false, decay: false, sustain: false, release: false });
      expect(result.current.options.layerSwelling[2]).toEqual({ gain: false, detune: false, phase: true, pulseWidth: false });
      expect(result.current.options.layerSwelling[0]).toEqual({ gain: false, detune: false, phase: false, pulseWidth: false });
    });

    it.each([0, 1, 2])('layer %i\'s flags are recomputed when a swell tick writes that layer\'s value (the module-scope Map is not tracked by React)', (idx) => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addCompany('c1', ['r1']);
      let swelling = false;
      vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((_id, attr) => swelling && attr === `layer${idx}.gain`);
      const { result } = renderHook(() => useCompanyOptions('c1'));
      expect(result.current.options.layerSwelling[idx]?.gain).toBe(false);

      swelling = true;
      const layers = makeRobot().audioAttributes.layers!.map((l, i) => (i === idx ? { ...l, gain: 0.5 } : l));
      act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { audioAttributes: { ...makeRobot().audioAttributes, layers } }));

      expect(result.current.options.layerSwelling[idx]?.gain).toBe(true);
    });

    it('the envelope\'s flags are recomputed when a swell tick writes the envelope', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addCompany('c1', ['r1']);
      let swelling = false;
      vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation((_id, attr) => swelling && attr === 'adsr.release');
      const { result } = renderHook(() => useCompanyOptions('c1'));
      expect(result.current.options.adsrSwelling?.release).toBe(false);

      swelling = true;
      act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', {
        audioAttributes: { ...makeRobot().audioAttributes, adsr: { ...ADSR_A, release: 0.9 } },
      }));

      expect(result.current.options.adsrSwelling?.release).toBe(true);
    });

    it('are undefined when there is no first member', () => {
      const { result } = renderHook(() => useCompanyOptions('all'));

      expect(result.current.options.volumeSwelling).toBe(false);
      expect(result.current.options.adsrSwelling).toBeUndefined();
      expect(result.current.options.layerSwelling).toEqual([undefined, undefined, undefined]);
    });
  });
  // Robot Articulation Task 9: with no recorded edit the Filter panel shows the first member's resolved filter (Task 10 adds the
  // recorded fields and the broadcast edits, tested in their own describe below).
  describe('the filter value (Robot Articulation Task 9)', () => {
    const withFilter = (id: string, extra: Partial<Robot['audioAttributes']>, robot: Partial<Robot> = {}) =>
      makeRobot({ id, companyId: 'c1', ...robot, audioAttributes: { ...makeRobot().audioAttributes, ...extra } });
    const OPEN = { filterFreq: 20000, filterQ: 1, filterType: 'lowpass', lfoLink: DEFAULT_LFO_LINK['bus.frequency'] };

    it('is the first member stored cutoff, resonance, type and bus link', () => {
      addRobot(withFilter('r1', { filterFreq: 900, filterQ: 4, filterType: 'bandpass' }, { lfoLinks: { 'bus.frequency': { lane: 'b', depth: 40 } } as Robot['lfoLinks'] }));
      addRobot(withFilter('r2', { filterFreq: 300, filterQ: 9, filterType: 'highpass' }));
      addCompany('c1', ['r1', 'r2']);

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.busFilterValue).toEqual({ filterFreq: 900, filterQ: 4, filterType: 'bandpass', lfoLink: { lane: 'b', depth: 40 } });
    });

    it('resolves a first member with none of the fields to Q 1, lowpass, the open band and the default link', () => {
      addRobot(withFilter('r1', {}));
      addCompany('c1', ['r1']);

      const { result } = renderHook(() => useCompanyOptions('c1'));

      expect(result.current.options.busFilterValue).toEqual(OPEN);
      expect(result.current.options.busFilterValue.lfoLink).toBe(DEFAULT_LFO_LINK['bus.frequency']);
    });

    it('is a placeholder, complete enough to lay out, when there is nothing to edit', () => {
      const { result } = renderHook(() => useCompanyOptions('all'));

      expect(result.current.options.active).toBe(false);
      expect(result.current.options.busFilterValue).toEqual(OPEN);
    });

    it('for all, comes from the first robot in the locale', () => {
      addRobot(withFilter('r1', { filterFreq: 700 }, { companyId: undefined }));
      addRobot(withFilter('r2', { filterFreq: 300 }, { companyId: 'c9' }));

      const { result } = renderHook(() => useCompanyOptions('all'));

      expect(result.current.options.busFilterValue.filterFreq).toBe(700);
    });

    it('follows the first member cutoff, and keeps its reference when an unrelated field changes', () => {
      addRobot(withFilter('r1', { filterFreq: 900 }));
      addCompany('c1', ['r1']);
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const before = result.current.options.busFilterValue;

      act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { rhythmicDensity: 91 }));
      expect(result.current.options.busFilterValue).toBe(before);

      act(() => {
        const stored = useLocaleStore.getState().locales[localeId].robots.find((r) => r.id === 'r1')!;
        useLocaleStore.getState().updateRobot(localeId, 'r1', { audioAttributes: { ...stored.audioAttributes, filterFreq: 500 } });
      });
      expect(result.current.options.busFilterValue).not.toBe(before);
      expect(result.current.options.busFilterValue.filterFreq).toBe(500);
    });

    it.each<[string, (stored: Robot) => Partial<Robot>, Record<string, unknown>]>([
      ['resonance', (r) => ({ audioAttributes: { ...r.audioAttributes, filterQ: 7 } }), { filterQ: 7 }],
      ['type', (r) => ({ audioAttributes: { ...r.audioAttributes, filterType: 'highpass' } }), { filterType: 'highpass' }],
      ['bus link', () => ({ lfoLinks: { 'bus.frequency': { lane: 'c', depth: 60 } } as Robot['lfoLinks'] }), { lfoLink: { lane: 'c', depth: 60 } }],
    ])('follows the first member %s too', (_name, change, expected) => {
      addRobot(withFilter('r1', { filterFreq: 900 }));
      addCompany('c1', ['r1']);
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const before = result.current.options.busFilterValue;

      act(() => {
        const stored = useLocaleStore.getState().locales[localeId].robots.find((r) => r.id === 'r1')!;
        useLocaleStore.getState().updateRobot(localeId, 'r1', change(stored));
      });

      expect(result.current.options.busFilterValue).not.toBe(before);
      expect(result.current.options.busFilterValue).toMatchObject({ filterFreq: 900, ...expected });
    });

    it('editing a non-first member leaves the whole options object alone', () => {
      addRobot(withFilter('r1', { filterFreq: 900 }));
      addRobot(withFilter('r2', { filterFreq: 300 }));
      addCompany('c1', ['r1', 'r2']);
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const before = result.current.options;

      act(() => {
        const stored = useLocaleStore.getState().locales[localeId].robots.find((r) => r.id === 'r2')!;
        useLocaleStore.getState().updateRobot(localeId, 'r2', { audioAttributes: { ...stored.audioAttributes, filterFreq: 100 } });
      });

      expect(result.current.options).toBe(before);
    });
  });

  describe('Portamento and the filter broadcast (Robot Articulation Task 10)', () => {
    const snapshotOf = (id = 'c1') => useLocaleStore.getState().getCompanyById(localeId, id)?.lastEditedOptions;
    const memberIds = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (c[0] as Robot).id).sort();
    const articulationMembers = () => {
      const base = makeRobot().audioAttributes;
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', audioAttributes: { ...base, filterFreq: 900, filterQ: 4, filterType: 'bandpass', portamento: 0.3 } }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1', audioAttributes: { ...base, filterFreq: 300, filterQ: 9, filterType: 'highpass', portamento: 0 } }));
      addCompany('c1', ['r1', 'r2']);
    };

    describe('the values', () => {
      it('portamentoValue is the first member\'s, then the recorded one', () => {
        articulationMembers();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        expect(result.current.options.portamentoValue).toBe(0.3);

        act(() => useLocaleStore.getState().updateCompany(localeId, 'c1', { lastEditedOptions: { portamento: 0.05 } }));
        expect(result.current.options.portamentoValue).toBe(0.05);
      });

      it('portamentoValue is 0 when there is nothing to edit', () => {
        const { result } = renderHook(() => useCompanyOptions('c1'));
        expect(result.current.options.active).toBe(false);
        expect(result.current.options.portamentoValue).toBe(0);
      });

      it('busFilterValue prefers the recorded fields, one by one, over the first member', () => {
        articulationMembers();
        useLocaleStore.getState().updateCompany(localeId, 'c1', { lastEditedOptions: { filterQ: 6 } });

        const { result } = renderHook(() => useCompanyOptions('c1'));

        expect(result.current.options.busFilterValue).toMatchObject({ filterFreq: 900, filterQ: 6, filterType: 'bandpass' });
      });

      it('busFilterValue.lfoLink is the recorded bus link, else the first member\'s, else the default', () => {
        articulationMembers();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        expect(result.current.options.busFilterValue.lfoLink).toBe(DEFAULT_LFO_LINK['bus.frequency']);

        act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { lfoLinks: { 'bus.frequency': { lane: 'b', depth: 40 } } as Robot['lfoLinks'] }));
        expect(result.current.options.busFilterValue.lfoLink).toEqual({ lane: 'b', depth: 40 });

        act(() => useLocaleStore.getState().updateCompany(localeId, 'c1', { lastEditedOptions: { lfoLinks: { 'bus.frequency': { lane: 'd', depth: 80 } } } }));
        expect(result.current.options.busFilterValue.lfoLink).toEqual({ lane: 'd', depth: 80 });
      });

      it('carries the Audio Load hold on the robot bus-filter links', () => {
        articulationMembers();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        expect(result.current.options.busFilterLinksHeldOff).toBe(false);

        act(() => useAudioStore.setState({ busFilterLinksHeldOff: true }));
        expect(result.current.options.busFilterLinksHeldOff).toBe(true);
        act(() => useAudioStore.setState({ busFilterLinksHeldOff: false }));
      });

      it('does not carry the global filter flag: it is not the bus drawer hold', () => {
        articulationMembers();
        const { result } = renderHook(() => useCompanyOptions('c1'));
        act(() => useAudioStore.setState({ filterLinksHeldOff: true }));
        expect(result.current.options.busFilterLinksHeldOff).toBe(false);
        expect('filterLinksHeldOff' in result.current.options).toBe(false);
        act(() => useAudioStore.setState({ filterLinksHeldOff: false }));
      });
    });

    describe('onPortamentoChange', () => {
      it('calls applyPortamento once per member and records only portamento', () => {
        articulationMembers();
        const spy = vi.spyOn(robotOptionsActions, 'applyPortamento').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onPortamentoChange(0.1));

        expect(spy).toHaveBeenCalledTimes(2);
        expect(memberIds(spy)).toEqual(['r1', 'r2']);
        expect(spy.mock.calls.every((c) => c[1] === localeId && c[2] === 0.1)).toBe(true);
        expect(snapshotOf()).toEqual({ portamento: 0.1 });
      });

      it('records 0 as a real value (turning the glide off)', () => {
        articulationMembers();
        vi.spyOn(robotOptionsActions, 'applyPortamento').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onPortamentoChange(0));

        expect(snapshotOf()).toEqual({ portamento: 0 });
        expect(result.current.options.portamentoValue).toBe(0);
      });

      it('leaves the rest of the snapshot alone', () => {
        articulationMembers();
        vi.spyOn(robotOptionsActions, 'applyPortamento').mockImplementation(() => {});
        useLocaleStore.getState().updateCompany(localeId, 'c1', { lastEditedOptions: { masterVolume: 0.9, filterQ: 6 } });
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onPortamentoChange(0.2));

        expect(snapshotOf()).toEqual({ masterVolume: 0.9, filterQ: 6, portamento: 0.2 });
      });

      it('with no members there is nothing to broadcast to', () => {
        addCompany('c1', []);
        const spy = vi.spyOn(robotOptionsActions, 'applyPortamento').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onPortamentoChange(0.2));

        expect(spy).not.toHaveBeenCalled();
      });

      it('for all, reaches every robot in the locale and records on the locale snapshot', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addRobot(makeRobot({ id: 'r2', companyId: undefined }));
        addCompany('c1', ['r1']);
        const spy = vi.spyOn(robotOptionsActions, 'applyPortamento').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('all'));

        act(() => result.current.options.onPortamentoChange(0.4));

        expect(memberIds(spy)).toEqual(['r1', 'r2']);
        expect(useLocaleStore.getState().locales[localeId].allRobotsLastEditedOptions).toEqual({ portamento: 0.4 });
        expect(snapshotOf()).toBeUndefined();
      });
    });

    describe('onBusFilterChange', () => {
      it('calls applyBusFilter once per member with exactly that patch and records exactly it', () => {
        articulationMembers();
        const spy = vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusFilterChange({ filterQ: 6 }));

        expect(spy).toHaveBeenCalledTimes(2);
        expect(memberIds(spy)).toEqual(['r1', 'r2']);
        expect(spy.mock.calls.every((c) => c[1] === localeId)).toBe(true);
        expect(spy.mock.calls.map((c) => c[2])).toEqual([{ filterQ: 6 }, { filterQ: 6 }]);
        expect(Object.keys(snapshotOf()!)).toEqual(['filterQ']);
        expect(snapshotOf()).toEqual({ filterQ: 6 });
      });

      it.each([
        ['cutoff', { filterFreq: 640 }],
        ['type', { filterType: 'bandpass' as const }],
      ])('a %s edit reaches every member and records only that field', (_name, patch) => {
        articulationMembers();
        const spy = vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusFilterChange(patch));

        expect(spy.mock.calls.map((c) => c[2])).toEqual([patch, patch]);
        expect(snapshotOf()).toEqual(patch);
      });

      it('successive edits accumulate in the snapshot and show in busFilterValue', () => {
        articulationMembers();
        vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusFilterChange({ filterQ: 6 }));
        act(() => result.current.options.onBusFilterChange({ filterFreq: 640 }));

        expect(snapshotOf()).toEqual({ filterQ: 6, filterFreq: 640 });
        expect(result.current.options.busFilterValue).toMatchObject({ filterFreq: 640, filterQ: 6, filterType: 'bandpass' });
      });

      it('broadcasts the one value to members that differed (broadcast, not link)', () => {
        articulationMembers();
        const spy = vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusFilterChange({ filterType: 'lowpass' }));

        // r1 was bandpass and r2 highpass; both are told the same type, and neither is told anything else.
        expect(spy.mock.calls.map((c) => [c[0].id, c[2]]).sort()).toEqual([['r1', { filterType: 'lowpass' }], ['r2', { filterType: 'lowpass' }]]);
      });

      it('leaves the rest of the snapshot alone', () => {
        articulationMembers();
        vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        useLocaleStore.getState().updateCompany(localeId, 'c1', { lastEditedOptions: { masterVolume: 0.9 } });
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusFilterChange({ filterQ: 6 }));

        expect(snapshotOf()).toEqual({ masterVolume: 0.9, filterQ: 6 });
      });

      it('an edit interrupts no swell (the filter has no swell attribute)', () => {
        articulationMembers();
        vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusFilterChange({ filterFreq: 640 }));

        expect(cancel).not.toHaveBeenCalled();
      });

      it('with no members there is nothing to broadcast to', () => {
        addCompany('c1', []);
        const spy = vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusFilterChange({ filterQ: 6 }));

        expect(spy).not.toHaveBeenCalled();
      });

      it('for all, reaches every robot and records on the locale snapshot', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addRobot(makeRobot({ id: 'r2', companyId: undefined }));
        addCompany('c1', ['r1']);
        const spy = vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('all'));

        act(() => result.current.options.onBusFilterChange({ filterQ: 3 }));

        expect(memberIds(spy)).toEqual(['r1', 'r2']);
        expect(useLocaleStore.getState().locales[localeId].allRobotsLastEditedOptions).toEqual({ filterQ: 3 });
      });

      it('a handler held from before a membership change still reaches the new member', () => {
        addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
        addRobot(makeRobot({ id: 'r2', companyId: undefined }));
        addCompany('c1', ['r1']);
        const spy = vi.spyOn(robotOptionsActions, 'applyBusFilter').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));
        const held = result.current.options.onBusFilterChange;

        act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r2', 'c1'));
        act(() => held({ filterQ: 2 }));

        expect(memberIds(spy)).toEqual(['r1', 'r2']);
      });
    });

    describe('onBusLinkChange', () => {
      it('calls applyLayerLfoLink for bus.frequency once per member, keeping each member\'s own other field', () => {
        articulationMembers();
        useLocaleStore.getState().updateRobot(localeId, 'r1', { lfoLinks: { 'bus.frequency': { lane: 'a', depth: 20 } } as Robot['lfoLinks'] });
        useLocaleStore.getState().updateRobot(localeId, 'r2', { lfoLinks: { 'bus.frequency': { lane: 'a', depth: 70 } } as Robot['lfoLinks'] });
        const spy = vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        // The drawer hands back the baseline (r1's link) with one field changed: the lane.
        act(() => result.current.options.onBusLinkChange({ lane: 'c', depth: 20 }));

        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy.mock.calls.map((c) => [c[0].id, c[2], c[3]]).sort()).toEqual([
          ['r1', 'bus.frequency', { lane: 'c', depth: 20 }],
          ['r2', 'bus.frequency', { lane: 'c', depth: 70 }], // r2 keeps its own depth
        ]);
      });

      it('records the link under bus.frequency and keeps the other recorded links', () => {
        articulationMembers();
        vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        useLocaleStore.getState().updateCompany(localeId, 'c1', { lastEditedOptions: { lfoLinks: { 'layer0.gain': { lane: 'b', depth: 10 } } } });
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusLinkChange({ lane: 'a', depth: 50 }));

        expect(snapshotOf()).toEqual({ lfoLinks: { 'layer0.gain': { lane: 'b', depth: 10 }, 'bus.frequency': { lane: 'a', depth: 50 } } });
      });

      it('turning the lane Off broadcasts lane null', () => {
        articulationMembers();
        useLocaleStore.getState().updateRobot(localeId, 'r1', { lfoLinks: { 'bus.frequency': { lane: 'a', depth: 20 } } as Robot['lfoLinks'] });
        const spy = vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusLinkChange({ lane: null, depth: 20 }));

        // Only the lane changed, so r2 (no link of its own) keeps the default depth rather than taking r1's 20.
        expect(spy.mock.calls.map((c) => [c[0].id, c[3]]).sort()).toEqual([
          ['r1', { lane: null, depth: 20 }],
          ['r2', { lane: null, depth: DEFAULT_LFO_LINK['bus.frequency'].depth }],
        ]);
      });

      it('with no members there is nothing to broadcast to', () => {
        addCompany('c1', []);
        const spy = vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
        const { result } = renderHook(() => useCompanyOptions('c1'));

        act(() => result.current.options.onBusLinkChange({ lane: 'a', depth: 50 }));

        expect(spy).not.toHaveBeenCalled();
      });
    });
  });

  describe('stability (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md): an edit re-derives only what it touches', () => {
    function memberAndStranger() {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c2' }));
      addCompany('c1', ['r1']);
      addCompany('c2', ['r2']);
    }

    it('editing a robot outside the company returns the very same options object', () => {
      memberAndStranger();
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const before = result.current.options;

      act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { rhythmicDensity: 91 }));

      expect(result.current.options).toBe(before);
    });

    it('editing a non-first member leaves every value reference alone (values read members[0] only)', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1' }));
      addCompany('c1', ['r1', 'r2']);
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const before = result.current.options;

      act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { rhythmicDensity: 91 }));

      expect(result.current.options).toBe(before);
    });

    it('editing one field of the first member replaces that section\'s value and no other', () => {
      memberAndStranger();
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const before = result.current.options;

      act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { rhythmicDensity: 91 }));

      const after = result.current.options;
      expect(after.pingControlsValue).not.toBe(before.pingControlsValue);
      expect(after.pingControlsValue.rhythmicDensity).toBe(91);
      expect(after.audioSettingValue).toBe(before.audioSettingValue);
      expect(after.adsrValue).toBe(before.adsrValue);
      expect(after.signatureArrayValue).toBe(before.signatureArrayValue);
    });

    it('keeps every handler\'s identity across edits', () => {
      memberAndStranger();
      const { result } = renderHook(() => useCompanyOptions('c1'));
      const before = result.current.options;

      act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { rhythmicDensity: 91 }));

      const after = result.current.options;
      expect(after.onVolumeChange).toBe(before.onVolumeChange);
      expect(after.onAdsrChange).toBe(before.onAdsrChange);
      expect(after.onLayerParamChange).toBe(before.onLayerParamChange);
      expect(after.onPortamentoChange).toBe(before.onPortamentoChange);
      expect(after.onBusFilterChange).toBe(before.onBusFilterChange);
      expect(after.onBusLinkChange).toBe(before.onBusLinkChange);
      expect(after.onPortamentoChange).toBeTypeOf('function'); // not a vacuous undefined === undefined
    });
  });
});
