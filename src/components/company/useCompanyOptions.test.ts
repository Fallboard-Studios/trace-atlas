import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompanyOptions } from './useCompanyOptions';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import * as robotOptionsActions from '@/systems/robotOptionsActions';
import * as audioSwells from '@/systems/audioSwells';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';
import type { RobotLfoTargetId } from '@/types/lfo';

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
      expect(options.audioSettingValue).toEqual({ audioMode: 'none', masterVolume: 0 });
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

      expect(result.current.options.audioSettingValue).toEqual({ audioMode: 'solo', masterVolume: 0.6 });
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
    });
  });
});
