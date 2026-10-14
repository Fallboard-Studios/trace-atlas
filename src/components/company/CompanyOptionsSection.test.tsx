import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Fragment, memo } from 'react';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { useCompanySubsectionRenderer, companyTraitStyle } from './CompanyOptionsSection';
import { useCompanyOptions } from './useCompanyOptions';

// The four section panels' call site in company mode (docs/tasks/LAYOUT_REWORK.md Task 23): the hook's
// values and handlers handed to AudioSettingSection / PingControlsCompositionSection / PingContourDrawer /
// SignatureArrayLayer. The value derivation and the broadcast logic have their own suite
// (useCompanyOptions.test.ts); this one is about the wiring between the two, so the leaf components are
// stubbed the way RobotScreen.test.tsx stubs them — they pull in Tone.js / AudioEngine, and each has its
// own full suite. Every probe button builds its payload the way the real leaf does, from the `value` it
// was handed.
const renderCounts = {
  audioSettingSection: vi.fn(),
  pingControlsComposition: vi.fn(),
  pingContourDrawer: vi.fn(),
};

vi.mock('@/components/robot/AudioSettingSection', () => ({
  AudioSettingSection: memo((props: {
    value: { audioMode: string; masterVolume: number };
    onAudioModeChange: (mode: string) => void;
    onVolumeChange: (pct: number) => void;
    onVolumeLfoChange?: unknown;
    volumeSwelling?: boolean;
    disabled?: boolean;
  }) => {
    renderCounts.audioSettingSection();
    return (
      <div
        data-testid="audio-setting-section-stub"
        data-audio-mode={props.value.audioMode}
        data-volume={props.value.masterVolume}
        data-swelling={props.volumeSwelling ? '' : undefined}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button onClick={() => props.onAudioModeChange('solo')}>probe-audio-mode</button>
        <button onClick={() => props.onVolumeChange(77)}>probe-volume</button>
        {props.onVolumeLfoChange ? <button>probe-volume-lfo</button> : null}
      </div>
    );
  }),
}));
vi.mock('@/components/robot/PingControlsDrawer', () => ({
  PingControlsCompositionSection: memo((props: {
    value: { rhythmicDensity: number; rhythmicMotifLength: number; pitchRepeat: number; noteVariance: number };
    onDensityChange: (v: number) => void;
    onMotifLengthChange: (v: number) => void;
    onPitchRepeatChange: (v: number) => void;
    onOctaveMinChange: (v: number) => void;
    onOctaveMaxChange: (v: number) => void;
    onNoteVarianceChange: (v: number) => void;
    disabled?: boolean;
  }) => {
    renderCounts.pingControlsComposition();
    return (
      <div
        data-testid="ping-controls-composition-stub"
        data-density={props.value.rhythmicDensity}
        data-motif-length={props.value.rhythmicMotifLength}
        data-pitch-repeat={props.value.pitchRepeat}
        data-note-variance={props.value.noteVariance}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button onClick={() => props.onDensityChange(77)}>probe-density</button>
        <button onClick={() => props.onMotifLengthChange(12)}>probe-motif-length</button>
        <button onClick={() => props.onPitchRepeatChange(90)}>probe-pitch-repeat</button>
        <button onClick={() => props.onOctaveMinChange(4)}>probe-octave-min</button>
        <button onClick={() => props.onOctaveMaxChange(6)}>probe-octave-max</button>
        <button onClick={() => props.onNoteVarianceChange(33)}>probe-note-variance</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/PingContourDrawer', () => ({
  PingContourDrawer: memo((props: {
    value: { attack: number };
    onChange: (next: unknown) => void;
    portamento: number;
    onPortamentoChange: (seconds: number) => void;
    swelling?: { attack: boolean };
    disabled?: boolean;
  }) => {
    renderCounts.pingContourDrawer();
    return (
      <div
        data-testid="ping-contour-drawer-stub"
        data-attack={props.value.attack}
        data-portamento={props.portamento}
        data-swelling-attack={props.swelling?.attack ? '' : undefined}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button onClick={() => props.onChange({ ...(props.value as object), attack: 0.9 })}>probe-adsr</button>
        <button onClick={() => props.onPortamentoChange(0.7)}>probe-portamento</button>
        <button onClick={() => props.onChange({ ...(props.value as object), attackCurve: 'bounce' })}>probe-attack-curve</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/SignatureArrayDrawer', () => ({
  SignatureArrayLayer: memo((props: {
    idx: number;
    layer: { type: string; gain: number; detune: number; phase: number };
    lfoLinks?: Record<string, { lane: string | null; depth: number }>;
    swelling?: { gain: boolean };
    disabled?: boolean;
    onTypeChange: (idx: number, type: string) => void;
    onParamChange: (idx: number, field: string, v: number) => void;
    onLfoFieldChange: (idx: number, target: string, value: { lane: string | null; depth: number }) => void;
  }) => (
    <div
      data-testid={`signature-array-layer-stub-${props.idx}`}
      data-type={props.layer.type}
      data-swelling-gain={props.swelling?.gain ? '' : undefined}
      data-disabled={props.disabled ? '' : undefined}
    >
      <button onClick={() => props.onParamChange(props.idx, 'gain', 0.4)}>probe-layer-gain-{props.idx}</button>
      <button onClick={() => props.onTypeChange(props.idx, 'square')}>probe-layer-type-{props.idx}</button>
      <button
        onClick={() => {
          const current = props.lfoLinks?.[`layer${props.idx}.gain`] ?? { lane: null, depth: 0 };
          props.onLfoFieldChange(props.idx, `layer${props.idx}.gain`, { ...current, lane: 'b' });
        }}
      >
        probe-layer-lfo-lane-{props.idx}
      </button>
    </div>
  )),
}));

import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import * as robotOptionsActions from '@/systems/robotOptionsActions';
import * as audioSwells from '@/systems/audioSwells';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { getTraitColorStyle, getDisabledTraitColorStyle } from '@/utils/traitColors';
import type { RobotSubsection } from '@/stores/uiStore';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';

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

const ALL_IDS: RobotSubsection[] = [
  'audioSettings', 'rhythm', 'pingContour', 'baselineOscillator', 'coaxialOscillator', 'harmonicOscillator',
];

/** The hook and the renderer, wired the way CompanyScreen wires them, with the listed subsections mounted. */
function Sections({ target, ids = ALL_IDS }: { target: string; ids?: readonly RobotSubsection[] }) {
  const { options } = useCompanyOptions(target);
  const renderSubsection = useCompanySubsectionRenderer(options);
  return <>{ids.map((id) => <Fragment key={id}>{renderSubsection(id)}</Fragment>)}</>;
}

describe('CompanyOptionsSection: the four section panels in company mode', () => {
  const localeId = getActiveLocaleId();

  beforeEach(() => {
    useLocaleStore.getState().setLocaleData(localeId, {
      robots: [], companies: [], allRobotsLastEditedOptions: undefined,
    } as unknown as Partial<Locale>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const addCompany = (id: string, robotIds: string[]) =>
    useLocaleStore.getState().addCompany(localeId, { id, name: 'Iron Consortium', color: '#4f6d7a', robotIds });
  const addRobot = (robot: Robot) => useLocaleStore.getState().addRobot(localeId, robot);
  const click = (name: string) => fireEvent.click(screen.getByText(name));

  function activeCompany() {
    addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
    addCompany('c1', ['r1']);
  }

  describe('which panel each subsection id renders', () => {
    it('Levels is the audio-setting panel', () => {
      render(<Sections target="all" ids={['audioSettings']} />);
      expect(screen.getByTestId('audio-setting-section-stub')).toBeTruthy();
    });

    it('Composition (the \'rhythm\' id) is the merged Rhythm-and-Pitches panel', () => {
      render(<Sections target="all" ids={['rhythm']} />);
      expect(screen.getByTestId('ping-controls-composition-stub')).toBeTruthy();
    });

    it('Envelope is the ping-contour panel', () => {
      render(<Sections target="all" ids={['pingContour']} />);
      expect(screen.getByTestId('ping-contour-drawer-stub')).toBeTruthy();
    });

    it.each([['baselineOscillator', 0], ['coaxialOscillator', 1], ['harmonicOscillator', 2]] as const)(
      '%s is signature-array layer %i',
      (id, idx) => {
        activeCompany();
        render(<Sections target="c1" ids={[id]} />);
        expect(screen.getByTestId(`signature-array-layer-stub-${idx}`)).toBeTruthy();
        expect(screen.getAllByTestId(/signature-array-layer-stub-/)).toHaveLength(1);
      },
    );

    it('renders nothing for an id it has no panel for (\'frequency\', folded into Composition)', () => {
      const { container } = render(<Sections target="all" ids={['frequency']} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing for an oscillator whose layer is absent', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', audioAttributes: { adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine', layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }] } }));
      addCompany('c1', ['r1']);
      const { container } = render(<Sections target="c1" ids={['baselineOscillator', 'coaxialOscillator']} />);
      expect(screen.queryByTestId('signature-array-layer-stub-0')).toBeTruthy();
      expect(screen.queryByTestId('signature-array-layer-stub-1')).toBeNull();
      expect(container.children).toHaveLength(1); // the absent layer leaves no empty element behind
    });
  });

  describe('disabled state', () => {
    it('hands every panel disabled when the selection has no member robots (\'all\' on an empty roster)', () => {
      render(<Sections target="all" />);
      for (const id of ['audio-setting-section-stub', 'ping-controls-composition-stub', 'ping-contour-drawer-stub', 'signature-array-layer-stub-0', 'signature-array-layer-stub-1', 'signature-array-layer-stub-2']) {
        expect(screen.getByTestId(id).getAttribute('data-disabled')).toBe('');
      }
    });

    it('hands every panel disabled for a company with zero members', () => {
      addCompany('c1', []);
      render(<Sections target="c1" />);
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-disabled')).toBe('');
      expect(screen.getByTestId('signature-array-layer-stub-2').getAttribute('data-disabled')).toBe('');
    });

    it('hands none of them disabled once the company has a member', () => {
      activeCompany();
      render(<Sections target="c1" />);
      for (const id of ['audio-setting-section-stub', 'ping-controls-composition-stub', 'ping-contour-drawer-stub', 'signature-array-layer-stub-0', 'signature-array-layer-stub-1', 'signature-array-layer-stub-2']) {
        expect(screen.getByTestId(id).getAttribute('data-disabled')).toBeNull();
      }
    });
  });

  describe('values', () => {
    it('reach each panel from the first member', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6, rhythmicDensity: 42, pitchRepeat: 30, audioMode: 'solo' }));
      addCompany('c1', ['r1']);
      render(<Sections target="c1" />);

      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume')).toBe('0.6');
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-audio-mode')).toBe('solo');
      expect(screen.getByTestId('ping-controls-composition-stub').getAttribute('data-density')).toBe('42');
      expect(screen.getByTestId('ping-controls-composition-stub').getAttribute('data-pitch-repeat')).toBe('30');
      expect(screen.getByTestId('ping-contour-drawer-stub').getAttribute('data-attack')).toBe('0.2');
      expect(screen.getByTestId('signature-array-layer-stub-1').getAttribute('data-type')).toBe('square');
    });

    it('for \'all\', come from the first robot in the locale, across companies and Freelance alike', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6 }));
      addRobot(makeRobot({ id: 'r2', companyId: undefined, masterVolume: 0.1 }));
      addCompany('c1', ['r1']);
      render(<Sections target="all" ids={['audioSettings']} />);

      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume')).toBe('0.6');
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-disabled')).toBeNull();
    });

    it('carry the swelling flags to the panels that ease their sliders', () => {
      activeCompany();
      vi.spyOn(audioSwells, 'isRobotAttributeSwelling').mockImplementation(
        (_id, attr) => attr === 'volume' || attr === 'adsr.attack' || attr === 'layer1.gain',
      );
      render(<Sections target="c1" />);

      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-swelling')).toBe('');
      expect(screen.getByTestId('ping-contour-drawer-stub').getAttribute('data-swelling-attack')).toBe('');
      expect(screen.getByTestId('signature-array-layer-stub-1').getAttribute('data-swelling-gain')).toBe('');
      expect(screen.getByTestId('signature-array-layer-stub-0').getAttribute('data-swelling-gain')).toBeNull();
    });
  });

  describe('each panel\'s change reaches the members once (the broadcast itself is useCompanyOptions\' suite)', () => {
    function twoMembers() {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c1' }));
      addCompany('c1', ['r1', 'r2']);
    }
    const ids = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (c[0] as Robot).id).sort();

    it('Levels: audio mode', () => {
      twoMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyAudioMode').mockImplementation(() => {});
      render(<Sections target="c1" ids={['audioSettings']} />);
      click('probe-audio-mode');
      expect(ids(spy)).toEqual(['r1', 'r2']);
      expect(spy.mock.calls[0][2]).toBe('solo');
    });

    it('Levels: volume — applyVolume once per member, and only masterVolume recorded in the snapshot', () => {
      twoMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      render(<Sections target="c1" ids={['audioSettings']} />);
      click('probe-volume');
      expect(ids(spy)).toEqual(['r1', 'r2']);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toEqual({ masterVolume: 0.77 });
    });

    it.each([
      ['probe-density', 'applyDensity'],
      ['probe-motif-length', 'applyMotifLength'],
      ['probe-pitch-repeat', 'applyPitchRepeat'],
      ['probe-octave-min', 'applyOctaveMin'],
      ['probe-octave-max', 'applyOctaveMax'],
      ['probe-note-variance', 'applyNoteVariance'],
    ] as const)('Composition: %s calls %s once per member', (probe, action) => {
      twoMembers();
      const spy = vi.spyOn(robotOptionsActions, action).mockImplementation(() => {});
      render(<Sections target="c1" ids={['rhythm']} />);
      click(probe);
      expect(ids(spy)).toEqual(['r1', 'r2']);
    });

    it('Envelope: applyAdsr once per member', () => {
      twoMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      render(<Sections target="c1" ids={['pingContour']} />);
      click('probe-adsr');
      expect(ids(spy)).toEqual(['r1', 'r2']);
      expect((spy.mock.calls[0][2] as { attack: number }).attack).toBe(0.9);
    });

    // Placeholder until Robot Articulation Task 10 (docs/tasks/ROBOT_ARTICULATION.md Task 8): the slider shows 0 and does nothing.
    it('Envelope: Portamento is inert until Task 10 (a fixed 0, and an edit reaches no member)', () => {
      twoMembers();
      const portamento = vi.spyOn(robotOptionsActions, 'applyPortamento').mockImplementation(() => {});
      const adsr = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      render(<Sections target="c1" ids={['pingContour']} />);
      expect(screen.getByTestId('ping-contour-drawer-stub').getAttribute('data-portamento')).toBe('0');
      click('probe-portamento');
      expect(portamento).not.toHaveBeenCalled();
      expect(adsr).not.toHaveBeenCalled();
    });

    it('Envelope: a shape edit rides applyAdsr to every member, curve included', () => {
      twoMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      render(<Sections target="c1" ids={['pingContour']} />);
      click('probe-attack-curve');
      expect(ids(spy)).toEqual(['r1', 'r2']);
      expect((spy.mock.calls[0][2] as { attackCurve?: string }).attackCurve).toBe('bounce');
    });

    it('Source: a layer\'s gain reaches the right layer index', () => {
      twoMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
      render(<Sections target="c1" ids={['coaxialOscillator']} />);
      click('probe-layer-gain-1');
      expect(ids(spy)).toEqual(['r1', 'r2']);
      expect((spy.mock.calls[0][2] as { gain: number }[])[1].gain).toBe(0.4);
    });

    it('Source: a layer\'s type', () => {
      twoMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyLayersStructural').mockImplementation(() => {});
      render(<Sections target="c1" ids={['harmonicOscillator']} />);
      click('probe-layer-type-2');
      expect(ids(spy)).toEqual(['r1', 'r2']);
      expect((spy.mock.calls[0][2] as { type: string }[])[2].type).toBe('square');
    });

    it('Source: a layer\'s LFO link', () => {
      twoMembers();
      const spy = vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
      render(<Sections target="c1" ids={['coaxialOscillator']} />);
      click('probe-layer-lfo-lane-1');
      expect(ids(spy)).toEqual(['r1', 'r2']);
      expect(spy.mock.calls[0][2]).toBe('layer1.gain');
    });

    it('passes no Volume LFO handler to the audio-setting panel (the target was removed, docs/specs/LFO_LOAD_FIX.md)', () => {
      activeCompany();
      render(<Sections target="c1" ids={['audioSettings']} />);
      expect(screen.queryByText('probe-volume-lfo')).toBeNull();
      expect(screen.getByText('probe-volume')).toBeTruthy();
    });

    it('for \'all\', Volume reaches every robot in the locale, regardless of company', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c2' }));
      addRobot(makeRobot({ id: 'r3', companyId: undefined }));
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      render(<Sections target="all" ids={['audioSettings']} />);
      click('probe-volume');
      expect(ids(spy)).toEqual(['r1', 'r2', 'r3']);
    });

    it('a disabled panel (no members) broadcasts to nobody', () => {
      addCompany('c1', []);
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      render(<Sections target="c1" ids={['audioSettings']} />);
      click('probe-volume');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md follow-up: the hook subscribes to the whole locale's
  // robots array, which gets a new reference on any robot edit anywhere — these prove a mounted panel
  // re-renders only for an edit to a value it shows.
  describe('re-render cascade regression', () => {
    const counts = () => ({
      audioSettingSection: renderCounts.audioSettingSection.mock.calls.length,
      pingContourDrawer: renderCounts.pingContourDrawer.mock.calls.length,
    });

    beforeEach(() => {
      renderCounts.audioSettingSection.mockClear();
      renderCounts.pingContourDrawer.mockClear();
    });

    it('editing a robot that is NOT a member of the selected company leaves mounted panels un-re-rendered', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c2' }));
      addCompany('c1', ['r1']);
      addCompany('c2', ['r2']);
      render(<Sections target="c1" ids={['audioSettings', 'pingContour']} />);
      const afterMount = counts();

      act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { rhythmicDensity: 91 }));

      expect(counts()).toEqual(afterMount);
    });

    it('editing one field on a member re-renders only that field\'s own panel', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
      addRobot(r1);
      addRobot(makeRobot({ id: 'r2', companyId: 'c1' }));
      addCompany('c1', ['r1', 'r2']);
      render(<Sections target="c1" ids={['audioSettings', 'pingContour']} />);
      const afterMount = counts();

      act(() => {
        useLocaleStore.getState().updateRobot(localeId, 'r1', {
          audioAttributes: { ...r1.audioAttributes, adsr: { attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 } },
        });
      });

      const afterEdit = counts();
      expect(afterEdit.pingContourDrawer).toBeGreaterThan(afterMount.pingContourDrawer);
      expect(afterEdit.audioSettingSection).toBe(afterMount.audioSettingSection);
    });

    it('the renderer keeps its identity through an edit that changes nothing it reads', () => {
      addRobot(makeRobot({ id: 'r1', companyId: 'c1' }));
      addRobot(makeRobot({ id: 'r2', companyId: 'c2' }));
      addCompany('c1', ['r1']);
      addCompany('c2', ['r2']);
      const { result } = renderHook(() => useCompanySubsectionRenderer(useCompanyOptions('c1').options));
      const before = result.current;

      act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { rhythmicDensity: 91 }));

      expect(result.current).toBe(before);
    });
  });
});

describe('companyTraitStyle', () => {
  it('is the trait\'s full-saturation style while the panels are active', () => {
    expect(companyTraitStyle('output', true)).toEqual(getTraitColorStyle('output'));
    expect(companyTraitStyle('output', true)['--color-accent-a' as never]).toBe(ACCENT_COLORS.burntOrange);
  });

  it('is the trait\'s own two tones, desaturated, while they are disabled', () => {
    expect(companyTraitStyle('output', false)).toEqual(getDisabledTraitColorStyle('output'));
    expect(companyTraitStyle('output', false)).not.toEqual(companyTraitStyle('output', true));
  });

  it.each(['output', 'composition', 'timeSpace', 'spectral'] as const)('has both states for the %s trait', (trait) => {
    expect(companyTraitStyle(trait, true)).toEqual(getTraitColorStyle(trait));
    expect(companyTraitStyle(trait, false)).toEqual(getDisabledTraitColorStyle(trait));
  });
});

describe('CompanyOptionsSection is the sections only', () => {
  it('no longer owns an accordion stack, a selection read or a layout of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'CompanyOptionsSection.tsx'), 'utf8');
    expect(source).not.toMatch(/RobotSectionAccordionStack/);
    expect(source).not.toMatch(/useUIStore/);
    expect(source).not.toMatch(/useLocaleStore/);
    expect(source).not.toMatch(/AccordionState/);
  });
});
