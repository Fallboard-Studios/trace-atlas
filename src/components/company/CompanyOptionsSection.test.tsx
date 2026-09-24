import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { memo } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CompanyOptionsSection } from './CompanyOptionsSection';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef } from '@/utils/sectionRefs';

// AudioSettingSection/PingControlsRhythmSection/PingControlsFrequencySection/PingContourDrawer/
// SignatureArrayLayer/RobotDriftPanel pull in real Tone.js/AudioEngine machinery — mocked here the
// same way RobotOptionsTab.test.tsx mocks the same components, for the same reason. This test is
// about CompanyOptionsSection's own value-derivation, broadcast wiring, and accordion stacking —
// not about the leaf components' own rendered content (each has its own full test suite).
//
// Every probe button below builds its onChange payload the same way the real leaf components do —
// spreading the received `props.value` (CompanyOptionsSection's shared `resolved` baseline) and
// touching only one field, e.g. PingContourDrawer's real `onChange({ ...adsr, attack: v })` — so
// the "other members' own untouched sub-fields survive" regression tests below exercise the real
// diff-and-preserve broadcast logic, not a stub shortcut.
const renderCounts = {
  audioSettingSection: vi.fn(),
  pingControlsRhythm: vi.fn(),
  pingContourDrawer: vi.fn(),
};

vi.mock('@/components/robot/AudioSettingSection', () => ({
  AudioSettingSection: memo((props: {
    value: { audioMode: string; masterVolume: number; volumeLfo: { shape: string; rate: number; depth: number } };
    onAudioModeChange: (mode: string) => void;
    onVolumeChange: (pct: number) => void;
    onVolumeLfoChange: (value: unknown) => void;
    disabled?: boolean;
  }) => {
    renderCounts.audioSettingSection();
    return (
      <div
        data-testid="audio-setting-section-stub"
        data-audio-mode={props.value.audioMode}
        data-volume={props.value.masterVolume}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button onClick={() => props.onAudioModeChange('solo')}>probe-audio-mode</button>
        <button onClick={() => props.onVolumeChange(77)}>probe-volume</button>
        <button onClick={() => props.onVolumeLfoChange({ ...props.value.volumeLfo, rate: 9 })}>probe-volume-lfo</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/PingControlsDrawer', () => ({
  PingControlsRhythmSection: memo((props: {
    value: { rhythmicDensity: number; rhythmicMotifLength: number; pitchRepeat: number; clickTrackActive: boolean };
    onDensityChange: (v: number) => void;
    onMotifLengthChange: (v: number) => void;
    onPitchRepeatChange: (v: number) => void;
    onClickTrackActiveChange: (v: boolean) => void;
    disabled?: boolean;
  }) => {
    renderCounts.pingControlsRhythm();
    return (
      <div
        data-testid="ping-controls-rhythm-stub"
        data-density={props.value.rhythmicDensity}
        data-motif-length={props.value.rhythmicMotifLength}
        data-pitch-repeat={props.value.pitchRepeat}
        data-click-track-active={String(props.value.clickTrackActive)}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button onClick={() => props.onDensityChange(77)}>probe-density</button>
        <button onClick={() => props.onMotifLengthChange(12)}>probe-motif-length</button>
        <button onClick={() => props.onPitchRepeatChange(90)}>probe-pitch-repeat</button>
        <button onClick={() => props.onClickTrackActiveChange(!props.value.clickTrackActive)}>probe-click-track</button>
      </div>
    );
  }),
  PingControlsFrequencySection: memo((props: { value: { noteVariance: number }; onOctaveMinChange: (v: number) => void; onNoteVarianceChange: (v: number) => void; disabled?: boolean }) => (
    <div data-testid="ping-controls-frequency-stub" data-note-variance={props.value.noteVariance} data-disabled={props.disabled ? '' : undefined}>
      <button onClick={() => props.onOctaveMinChange(4)}>probe-octave-min</button>
    </div>
  )),
}));
vi.mock('@/components/robot/PingContourDrawer', () => ({
  PingContourDrawer: memo((props: { value: { attack: number }; onChange: (next: unknown) => void; disabled?: boolean }) => {
    renderCounts.pingContourDrawer();
    return (
      <div data-testid="ping-contour-drawer-stub" data-attack={props.value.attack} data-disabled={props.disabled ? '' : undefined}>
        <button onClick={() => props.onChange({ ...(props.value as object), attack: 0.9 })}>probe-adsr</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/SignatureArrayDrawer', () => ({
  SignatureArrayLayer: memo((props: {
    idx: number;
    layer: { type: string; gain: number; detune: number; phase: number };
    lfoSettings?: Record<string, { shape: string; rate: number; depth: number }>;
    disabled?: boolean;
    onTypeChange: (idx: number, type: string) => void;
    onParamChange: (idx: number, field: string, v: number) => void;
    onLfoFieldChange: (idx: number, target: string, value: unknown) => void;
  }) => (
    <div data-testid={`signature-array-layer-stub-${props.idx}`} data-type={props.layer.type} data-disabled={props.disabled ? '' : undefined}>
      <button onClick={() => props.onParamChange(props.idx, 'gain', 0.4)}>probe-layer-gain-{props.idx}</button>
      <button onClick={() => props.onTypeChange(props.idx, 'square')}>probe-layer-type-{props.idx}</button>
      <button
        onClick={() => {
          const current = props.lfoSettings?.[`layer${props.idx}.gain`] ?? { shape: 'sine', rate: 0.1, depth: 0 };
          props.onLfoFieldChange(props.idx, `layer${props.idx}.gain`, { ...current, rate: 9 });
        }}
      >
        probe-layer-lfo-{props.idx}
      </button>
    </div>
  )),
  RobotDriftPanel: memo(() => <div data-testid="robot-drift-panel-stub" />),
}));

import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import * as robotOptionsActions from '@/systems/robotOptionsActions';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { desaturateHex } from '@/utils/traitColors';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';

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
      layers: [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
        { type: 'square', gain: 0.8, detune: 5, phase: 10 },
        { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
      ],
    },
    octaveRange: [3, 5],
    createdAt: Date.now(),
    masterVolume: 0.6,
    docking: 'active',
    batteryLevel: 100,
    rhythmicDensity: 42,
    pitchRepeat: 30,
    audioMode: 'none',
    ...overrides,
  } as Robot;
}

function allSubsectionIds(prefix: string) {
  return [
    `${prefix}.volume.audioSettings`,
    `${prefix}.melody.rhythm`,
    `${prefix}.melody.frequency`,
    `${prefix}.envelope.pingContour`,
    `${prefix}.source.baselineOscillator`,
    `${prefix}.source.coaxialOscillator`,
    `${prefix}.source.harmonicOscillator`,
    `${prefix}.source.probeDrift`,
  ];
}

describe('CompanyOptionsSection', () => {
  const localeId = getActiveLocaleId();

  beforeEach(() => {
    installIntersectionObserverStub();
    allSubsectionIds('probes.all').forEach(clearSectionRef);
    allSubsectionIds('companies.c1').forEach(clearSectionRef);
    allSubsectionIds('companies.c2').forEach(clearSectionRef);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
    useUIStore.getState().selectAllRobots();
    useUIStore.getState().setSelectedSection(null);
    useUIStore.getState().setSelectedSubsection(null);
  });

  function selectActiveCompany() {
    useLocaleStore.getState().addRobot(localeId, makeRobot({ id: 'r1', companyId: 'c1' }));
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
  }

  it('renders all 8 subsection accordion triggers as shells, regardless of active/disabled', () => {
    render(<CompanyOptionsSection />);
    for (const label of ['Audio Settings', 'Rhythm', 'Frequency', 'Ping Contour', 'Baseline Oscillator', 'Coaxial Oscillator', 'Harmonic Oscillator', 'Probe Drift']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('opens Audio Settings by default when no section is chosen — first-leaf fallback (spec §1.5)', () => {
    render(<CompanyOptionsSection />);
    expect(screen.getByRole('button', { name: 'Audio Settings' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Rhythm' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking a different subsection opens only it and updates selectedSection/selectedSubsection', () => {
    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Probe Drift' }));
    expect(useUIStore.getState().selectedSection).toBe('source');
    expect(useUIStore.getState().selectedSubsection).toBe('probeDrift');
    expect(screen.getByRole('button', { name: 'Probe Drift' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Audio Settings' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('a subsection\'s real content is not in the DOM until its own anchor has been approached', () => {
    render(<CompanyOptionsSection />);
    expect(screen.queryByTestId('audio-setting-section-stub')).toBeNull();
  });

  it('renders every section disabled when the selection has no member robots (default All, empty roster)', () => {
    render(<CompanyOptionsSection />);
    act(() => approachSection('probes.all.volume.audioSettings'));
    expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-disabled')).toBe('');
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5): each accordion gets the
  // identical trait style RobotOptionsTab passes it once active (a non-empty company selected).
  it('gives the Audio Settings accordion the Output trait\'s style (burnt orange/orange) when active', () => {
    selectActiveCompany();
    const { container } = render(<CompanyOptionsSection />);
    const root = container.querySelector('.sc-accordion') as HTMLElement;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.burntOrange);
    expect(root.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.orange);
  });

  it('gives the Audio Settings accordion Output\'s own tones, desaturated, when disabled (no company selected)', () => {
    const { container } = render(<CompanyOptionsSection />);
    const root = container.querySelector('.sc-accordion') as HTMLElement;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe(desaturateHex(ACCENT_COLORS.orange, 0.8));
    expect(root.style.getPropertyValue('--color-accent-b')).toBe(desaturateHex(ACCENT_COLORS.burntOrange, 0.6));
  });

  it('stays on the disabled (desaturated) style when a company is selected but has zero members', () => {
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
    useUIStore.getState().selectCompany('c1');
    const { container } = render(<CompanyOptionsSection />);
    const root = container.querySelector('.sc-accordion') as HTMLElement;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe(desaturateHex(ACCENT_COLORS.orange, 0.8));
  });

  describe('values and broadcast wiring, once approached', () => {
    it('wires onAudioModeChange to applyAudioMode once per member', () => {
      selectActiveCompany();
      const applySpy = vi.spyOn(robotOptionsActions, 'applyAudioMode').mockImplementation(() => {});
      render(<CompanyOptionsSection />);
      act(() => approachSection('companies.c1.volume.audioSettings'));

      fireEvent.click(screen.getByText('probe-audio-mode'));

      expect(applySpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), localeId, 'solo');
    });

    it('editing Attack broadcasts only attack — each member keeps its own Decay/Sustain/Release', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1', audioAttributes: { adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine', layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }] } });
      const r2 = makeRobot({ id: 'r2', companyId: 'c1', audioAttributes: { adsr: { attack: 0.1, decay: 0.9, sustain: 0.1, release: 0.4 }, filterFreq: 0, waveform: 'sine', layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }] } });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
      useUIStore.getState().selectCompany('c1');
      const adsrSpy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      render(<CompanyOptionsSection />);
      act(() => approachSection('companies.c1.envelope.pingContour'));

      fireEvent.click(screen.getByText('probe-adsr'));

      const r2Call = adsrSpy.mock.calls.find((c) => c[0].id === 'r2');
      expect(r2Call?.[2]).toEqual({ attack: 0.9, decay: 0.9, sustain: 0.1, release: 0.4 });
    });

    it('editing one Signature Array layer\'s Gain broadcasts only that layer\'s gain — other layers and other members\' own layer values survive', () => {
      const r1 = makeRobot({
        id: 'r1', companyId: 'c1',
        audioAttributes: { adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine', layers: [
          { type: 'sine', gain: 1, detune: 0, phase: 0 },
          { type: 'square', gain: 0.8, detune: 5, phase: 10 },
          { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
        ] },
      });
      const r2 = makeRobot({
        id: 'r2', companyId: 'c1',
        audioAttributes: { adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine', layers: [
          { type: 'pulse', gain: 0.2, detune: 40, phase: 90 },
          { type: 'triangle', gain: 0.5, detune: -10, phase: 30 },
          { type: 'sine', gain: 0.9, detune: 15, phase: 5 },
        ] },
      });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
      useUIStore.getState().selectCompany('c1');
      const continuousSpy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
      render(<CompanyOptionsSection />);
      act(() => approachSection('companies.c1.source.coaxialOscillator')); // idx 1

      fireEvent.click(screen.getByText('probe-layer-gain-1'));

      const r2Call = continuousSpy.mock.calls.find((c) => c[0].id === 'r2');
      const r2Layers = r2Call?.[2] as { type: string; gain: number; detune: number; phase: number }[];
      expect(r2Layers[0]).toEqual({ type: 'pulse', gain: 0.2, detune: 40, phase: 90 });
      expect(r2Layers[1]).toEqual({ type: 'triangle', gain: 0.4, detune: -10, phase: 30 });
      expect(r2Layers[2]).toEqual({ type: 'sine', gain: 0.9, detune: 15, phase: 5 });
    });

    it('editing the Volume LFO\'s rate broadcasts only rate — each member keeps its own shape/depth', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1', lfoSettings: { volume: { shape: 'sine', rate: 1, depth: 20 } } as Robot['lfoSettings'] });
      const r2 = makeRobot({ id: 'r2', companyId: 'c1', lfoSettings: { volume: { shape: 'square', rate: 0.5, depth: 60 } } as Robot['lfoSettings'] });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
      useUIStore.getState().selectCompany('c1');
      const volumeLfoSpy = vi.spyOn(robotOptionsActions, 'applyVolumeLfo').mockImplementation(() => {});
      render(<CompanyOptionsSection />);
      act(() => approachSection('companies.c1.volume.audioSettings'));

      fireEvent.click(screen.getByText('probe-volume-lfo'));

      const r2Call = volumeLfoSpy.mock.calls.find((c) => c[0].id === 'r2');
      expect(r2Call?.[2]).toEqual({ shape: 'square', rate: 9, depth: 60 });
    });
  });

  describe('"All" selection (CompanyButtonRow\'s All button)', () => {
    it('populates every section\'s value from the first robot in the locale, across companies and Freelance alike', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6, rhythmicDensity: 42 });
      const r2 = makeRobot({ id: 'r2', companyId: undefined });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      useUIStore.getState().selectAllRobots();
      render(<CompanyOptionsSection />);
      act(() => approachSection('probes.all.volume.audioSettings'));

      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume')).toBe('0.6');
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-disabled')).toBeNull();
    });

    it('editing Volume while All is selected calls applyVolume once per robot in the locale, regardless of company', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
      const r2 = makeRobot({ id: 'r2', companyId: 'c2' });
      const r3 = makeRobot({ id: 'r3', companyId: undefined });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addRobot(localeId, r3);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      useLocaleStore.getState().addCompany(localeId, { id: 'c2', name: 'Null Syndicate', color: '#4f6d7a', robotIds: ['r2'] });
      useUIStore.getState().selectAllRobots();
      const applyVolumeSpy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      render(<CompanyOptionsSection />);
      act(() => approachSection('probes.all.volume.audioSettings'));

      fireEvent.click(screen.getByText('probe-volume'));

      expect(applyVolumeSpy).toHaveBeenCalledTimes(3);
      expect(applyVolumeSpy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2', 'r3']);
    });

    it('editing one field while All is selected patches locale.allRobotsLastEditedOptions, not any company\'s lastEditedOptions', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6 });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      useUIStore.getState().selectAllRobots();
      vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const updateCompanySpy = vi.spyOn(useLocaleStore.getState(), 'updateCompany');
      render(<CompanyOptionsSection />);
      act(() => approachSection('probes.all.volume.audioSettings'));

      fireEvent.click(screen.getByText('probe-volume'));

      expect(updateCompanySpy).not.toHaveBeenCalled();
      const editedVolume = useLocaleStore.getState().getLocaleById(localeId)?.allRobotsLastEditedOptions?.masterVolume;
      expect(editedVolume).toBeCloseTo(0.77, 5);
      expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toBeUndefined();
    });

    it('All\'s last-edited value is independent of any company\'s — switching between them shows each one\'s own snapshot', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.5 });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});

      useUIStore.getState().selectAllRobots();
      const { unmount: unmount1 } = render(<CompanyOptionsSection />);
      act(() => approachSection('probes.all.volume.audioSettings'));
      fireEvent.click(screen.getByText('probe-volume'));
      unmount1();

      useUIStore.getState().selectCompany('c1');
      render(<CompanyOptionsSection />);
      act(() => approachSection('companies.c1.volume.audioSettings'));
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume')).toBe('0.5');
    });
  });

  describe('re-render cascade regression (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md follow-up)', () => {
    function callCounts() {
      return {
        audioSettingSection: renderCounts.audioSettingSection.mock.calls.length,
        pingContourDrawer: renderCounts.pingContourDrawer.mock.calls.length,
      };
    }

    beforeEach(() => {
      renderCounts.audioSettingSection.mockClear();
      renderCounts.pingContourDrawer.mockClear();
    });

    // The end-to-end proof this whole follow-up exists for: this component subscribes to the
    // *whole locale's* robots array, which gets a new reference on any robot edit anywhere in the
    // locale — editing a robot that isn't even a member of the selected company used to still
    // re-render every mounted section here.
    it('editing a robot that is NOT a member of the selected company leaves mounted sections un-re-rendered', () => {
      const member = makeRobot({ id: 'r1', companyId: 'c1' });
      const stranger = makeRobot({ id: 'r2', companyId: 'c2' });
      useLocaleStore.getState().addRobot(localeId, member);
      useLocaleStore.getState().addRobot(localeId, stranger);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      useLocaleStore.getState().addCompany(localeId, { id: 'c2', name: 'Null Syndicate', color: '#4f6d7a', robotIds: ['r2'] });
      useUIStore.getState().selectCompany('c1');
      render(<CompanyOptionsSection />);
      act(() => {
        approachSection('companies.c1.volume.audioSettings');
        approachSection('companies.c1.envelope.pingContour');
      });
      const countsAfterMount = callCounts();

      act(() => {
        useLocaleStore.getState().updateRobot(localeId, stranger.id, { rhythmicDensity: 91 });
      });

      expect(callCounts()).toEqual(countsAfterMount);
    });

    it('editing one field on the selected company\'s own member re-renders only that field\'s own section', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
      const r2 = makeRobot({ id: 'r2', companyId: 'c1' });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
      useUIStore.getState().selectCompany('c1');
      render(<CompanyOptionsSection />);
      act(() => {
        approachSection('companies.c1.volume.audioSettings');
        approachSection('companies.c1.envelope.pingContour');
      });
      const countsAfterMount = callCounts();

      act(() => {
        useLocaleStore.getState().updateRobot(localeId, r1.id, {
          audioAttributes: { ...r1.audioAttributes, adsr: { attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 } },
        });
      });

      const countsAfterEdit = callCounts();
      expect(countsAfterEdit.pingContourDrawer).toBeGreaterThan(countsAfterMount.pingContourDrawer);
      expect(countsAfterEdit.audioSettingSection).toBe(countsAfterMount.audioSettingSection);
    });
  });

  it('is a React.memo-wrapped component', () => {
    expect((CompanyOptionsSection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
