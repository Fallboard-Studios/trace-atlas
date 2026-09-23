import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { memo } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// AudioSettingSection/PingControlsDrawer/PingContourDrawer/SignatureArrayDrawer pull in real
// Tone.js/AudioEngine machinery, and CompanyOptionsSection mounts all four of them at once —
// under the full test suite's parallel load that made this file intermittently exceed its 5s
// timeout (it passed reliably in isolation; this was a resource-contention flake, not a logic
// bug). Mocked here the same way RobotOptionsTab.test.tsx already mocks the same four components
// for the same reason: this test is about CompanyOptionsSection's own value-derivation and
// broadcast wiring, not about the sections' own rendered content (each has its own full test
// suite) — the mocks render probe buttons that invoke the captured callback props, so wiring bugs
// (wrong function, wrong argument, wrong per-member count) still surface here even though the
// real section JSX never mounts.
//
// Roadmap Phase 14 — every mock below also reads `props.style`'s two custom properties onto
// data-* attributes, the same styleAttrs helper RobotOptionsTab.test.tsx uses, so this file's own
// trait-color tests can assert on what CompanyOptionsSection actually passed down without needing
// the real drawer to mount.
function styleAttrs(style?: { [key: string]: string }) {
  return { 'data-style-a': style?.['--color-accent-a'], 'data-style-b': style?.['--color-accent-b'] };
}

// Every stub below is `React.memo`-wrapped and calls its own render-count spy unconditionally in
// its body (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md follow-up, 2026-09-15) — the real 4
// section components are memoized too (that plan's own Tasks 1-4), so wrapping these stand-ins
// the same way lets the cascade regression test below prove whether CompanyOptionsSection is
// actually handing them stable props, without paying the cost of mounting the real Tone.js/
// GSAP-adjacent components this file was written to avoid. Each is a `vi.fn()` (a function call,
// not a mutated outer variable) rather than a plain incremented counter —
// `react-hooks/immutability` forbids mutating a module-level variable during render.
const renderCounts = {
  audioSettingSection: vi.fn(),
  pingControlsDrawer: vi.fn(),
  pingContourDrawer: vi.fn(),
  signatureArrayDrawer: vi.fn(),
};

// Every probe button below builds its onChange payload the same way the real drawer components
// do — spreading the received `props.value` (CompanyOptionsSection's shared `resolved` baseline)
// and touching only one field — e.g. real Lfo.tsx's `onChange({ ...value, rate })`,
// PingContourDrawer's `onChange({ ...adsr, attack: v })`, SignatureArrayDrawer's
// `withUpdatedLayer`. A stub that instead fired a fully-independent hardcoded object would never
// exercise CompanyOptionsSection's diff-and-preserve broadcast logic (diffCompoundField/
// diffLayerField) — it has to look like a real single-field edit for the "other members' own
// untouched sub-fields survive" regression tests below to mean anything.
vi.mock('@/components/robot/AudioSettingSection', () => ({
  AudioSettingSection: memo((props: {
    value: { audioMode: string; masterVolume: number; volumeLfo: { shape: string; rate: number; depth: number } };
    onAudioModeChange: (mode: string) => void;
    onVolumeChange: (pct: number) => void;
    onVolumeLfoChange: (value: unknown) => void;
    disabled?: boolean;
    style?: { [key: string]: string };
  }) => {
    renderCounts.audioSettingSection();
    return (
      <div
        data-testid="audio-setting-section-stub"
        data-audio-mode={props.value.audioMode}
        data-volume={props.value.masterVolume}
        data-disabled={props.disabled ? '' : undefined}
        {...styleAttrs(props.style)}
      >
        <button onClick={() => props.onAudioModeChange('solo')}>probe-audio-mode</button>
        <button onClick={() => props.onVolumeChange(77)}>probe-volume</button>
        <button onClick={() => props.onVolumeLfoChange({ ...props.value.volumeLfo, rate: 9 })}>probe-volume-lfo</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/PingControlsDrawer', () => ({
  PingControlsDrawer: memo((props: {
    value: {
      rhythmicDensity: number;
      rhythmicMotifLength: number;
      noteVariance: number;
      pitchRepeat: number;
      clickTrackActive: boolean;
    };
    onDensityChange: (v: number) => void;
    onMotifLengthChange: (v: number) => void;
    onNoteVarianceChange: (v: number) => void;
    onPitchRepeatChange: (v: number) => void;
    onClickTrackActiveChange: (v: boolean) => void;
    onResetMelody?: () => void;
    disabled?: boolean;
    style?: { [key: string]: string };
  }) => {
    renderCounts.pingControlsDrawer();
    return (
      <div
        data-testid="ping-controls-drawer-stub"
        data-density={props.value.rhythmicDensity}
        data-motif-length={props.value.rhythmicMotifLength}
        data-note-variance={props.value.noteVariance}
        data-pitch-repeat={props.value.pitchRepeat}
        data-click-track-active={String(props.value.clickTrackActive)}
        data-disabled={props.disabled ? '' : undefined}
        {...styleAttrs(props.style)}
      >
        <button onClick={() => props.onDensityChange(77)}>probe-density</button>
        {/* Plain-number pattern, matching onDensityChange/onPitchRepeatChange — no {active, value} */}
        {/* wrapping at this layer; reconstruction happens only in robotOptionsActions.ts. */}
        <button onClick={() => props.onMotifLengthChange(12)}>probe-motif-length</button>
        <button onClick={() => props.onMotifLengthChange(0)}>probe-motif-length-zero</button>
        <button onClick={() => props.onNoteVarianceChange(5)}>probe-note-variance</button>
        <button onClick={() => props.onNoteVarianceChange(0)}>probe-note-variance-zero</button>
        <button onClick={() => props.onPitchRepeatChange(90)}>probe-pitch-repeat</button>
        <button onClick={() => props.onClickTrackActiveChange(!props.value.clickTrackActive)}>probe-click-track</button>
        {props.onResetMelody && <button onClick={props.onResetMelody}>probe-reset-melody</button>}
      </div>
    );
  }),
}));
vi.mock('@/components/robot/PingContourDrawer', () => ({
  PingContourDrawer: memo((props: {
    value: { attack: number; decay: number; sustain: number; release: number };
    onChange: (next: unknown) => void;
    disabled?: boolean;
    style?: { [key: string]: string };
  }) => {
    renderCounts.pingContourDrawer();
    return (
      <div
        data-testid="ping-contour-drawer-stub"
        data-attack={props.value.attack}
        data-disabled={props.disabled ? '' : undefined}
        {...styleAttrs(props.style)}
      >
        <button onClick={() => props.onChange({ ...props.value, attack: 0.9 })}>probe-adsr</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/SignatureArrayDrawer', () => ({
  SignatureArrayDrawer: memo((props: {
    value: {
      layers: { type: string; gain: number; detune: number; phase: number }[];
      lfoSettings?: Record<string, { shape: string; rate: number; depth: number }>;
    };
    onContinuousChange: (v: unknown) => void;
    onStructuralChange: (v: unknown) => void;
    onLfoChange: (target: string, value: unknown) => void;
    disabled?: boolean;
    style?: { [key: string]: string };
  }) => {
    renderCounts.signatureArrayDrawer();
    return (
    <div
      data-testid="signature-array-drawer-stub"
      data-layer-count={props.value.layers.length}
      data-disabled={props.disabled ? '' : undefined}
      {...styleAttrs(props.style)}
    >
      <button
        onClick={() => props.onContinuousChange(props.value.layers.map((l, i) => (i === 1 ? { ...l, gain: 0.4 } : l)))}
      >
        probe-layers-continuous
      </button>
      <button
        onClick={() => props.onStructuralChange(props.value.layers.map((l, i) => (i === 2 ? { ...l, type: 'square' } : l)))}
      >
        probe-layers-structural
      </button>
      <button
        onClick={() => {
          const current = props.value.lfoSettings?.['layer0.gain'] ?? { shape: 'sine', rate: 0.1, depth: 0 };
          props.onLfoChange('layer0.gain', { ...current, rate: 9 });
        }}
      >
        probe-layer-lfo
      </button>
    </div>
    );
  }),
}));

import { CompanyOptionsSection } from './CompanyOptionsSection';
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

describe('CompanyOptionsSection', () => {
  const localeId = getActiveLocaleId();

  afterEach(() => {
    vi.restoreAllMocks();
    useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
    useUIStore.getState().selectAllRobots();
  });

  it('renders every section disabled when the selection has no member robots (default All, empty roster)', () => {
    render(<CompanyOptionsSection />);

    expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-disabled')).toBe('');
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-disabled')).toBe('');
    expect(screen.getByTestId('ping-contour-drawer-stub').getAttribute('data-disabled')).toBe('');
    expect(screen.getByTestId('signature-array-drawer-stub').getAttribute('data-disabled')).toBe('');
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5): each of the 4 reused
  // drawers gets the identical trait style RobotOptionsTab passes it once active (a non-empty
  // company selected), so the Robots tile's company bulk-edit panel matches the individual robot
  // detail page exactly, control for control — not CompanyManager's own Company blue/plum, which
  // stays scoped to CompanyManager's own button row/CRUD chrome (CompanyManager.tsx's own root
  // style). Each test selects a real non-empty company first — with none selected, the section is
  // disabled and gets getDisabledTraitColorStyle instead (see the describe block below).
  function selectActiveCompany() {
    useLocaleStore.getState().addRobot(localeId, makeRobot({ id: 'r1', companyId: 'c1' }));
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
  }

  it('gives AudioSettingSection the Output trait\'s style (burnt orange/orange), matching RobotOptionsTab', () => {
    selectActiveCompany();
    render(<CompanyOptionsSection />);
    const stub = screen.getByTestId('audio-setting-section-stub');
    expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.burntOrange);
    expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.orange);
  });

  it('gives PingControlsDrawer the Composition trait\'s style (emerald/lime), matching RobotOptionsTab', () => {
    selectActiveCompany();
    render(<CompanyOptionsSection />);
    const stub = screen.getByTestId('ping-controls-drawer-stub');
    expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.emerald);
    expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.lime);
  });

  it('gives PingContourDrawer the Time/Space trait\'s style (purple/pink), matching RobotOptionsTab', () => {
    selectActiveCompany();
    render(<CompanyOptionsSection />);
    const stub = screen.getByTestId('ping-contour-drawer-stub');
    expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.purple);
    expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.pink);
  });

  it('gives SignatureArrayDrawer the Spectral trait\'s style (cyan/indigo), matching RobotOptionsTab', () => {
    selectActiveCompany();
    render(<CompanyOptionsSection />);
    const stub = screen.getByTestId('signature-array-drawer-stub');
    expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.cyan);
    expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.indigo);
  });

  // 2026-09-13, Crawford's own request: a disabled section (no company/robots selected, or a
  // selected company with zero members) reads as full-color even though every control inside
  // shows a placeholder value — visually "live" for content that can't actually be edited. Each
  // disabled accordion now gets white + the trait's own darker tone (getDisabledTraitColorStyle)
  // instead, computed by WCAG relative luminance rather than hand-picked per trait.
  describe('disabled sections desaturate the trait\'s own 2 tones (lighter -80%, darker -60%) instead of full trait color', () => {
    it('gives AudioSettingSection Output\'s own tones, desaturated, when no company is selected', () => {
      render(<CompanyOptionsSection />);
      const stub = screen.getByTestId('audio-setting-section-stub');
      expect(stub.getAttribute('data-style-a')).toBe(desaturateHex(ACCENT_COLORS.orange, 0.8));
      expect(stub.getAttribute('data-style-b')).toBe(desaturateHex(ACCENT_COLORS.burntOrange, 0.6));
    });

    it('gives PingControlsDrawer Composition\'s own tones, desaturated, when no company is selected', () => {
      render(<CompanyOptionsSection />);
      const stub = screen.getByTestId('ping-controls-drawer-stub');
      expect(stub.getAttribute('data-style-a')).toBe(desaturateHex(ACCENT_COLORS.lime, 0.8));
      expect(stub.getAttribute('data-style-b')).toBe(desaturateHex(ACCENT_COLORS.emerald, 0.6));
    });

    it('gives PingContourDrawer Time/Space\'s own tones, desaturated, when no company is selected', () => {
      render(<CompanyOptionsSection />);
      const stub = screen.getByTestId('ping-contour-drawer-stub');
      expect(stub.getAttribute('data-style-a')).toBe(desaturateHex(ACCENT_COLORS.pink, 0.8));
      expect(stub.getAttribute('data-style-b')).toBe(desaturateHex(ACCENT_COLORS.purple, 0.6));
    });

    it('gives SignatureArrayDrawer Spectral\'s own tones, desaturated, when no company is selected — cyan lighter, indigo darker (by WCAG luminance, not cyan\'s lower raw HSL lightness)', () => {
      render(<CompanyOptionsSection />);
      const stub = screen.getByTestId('signature-array-drawer-stub');
      expect(stub.getAttribute('data-style-a')).toBe(desaturateHex(ACCENT_COLORS.cyan, 0.8));
      expect(stub.getAttribute('data-style-b')).toBe(desaturateHex(ACCENT_COLORS.indigo, 0.6));
    });

    it('switches back to full trait color once a non-empty company is selected', () => {
      selectActiveCompany();
      render(<CompanyOptionsSection />);
      const stub = screen.getByTestId('audio-setting-section-stub');
      expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.burntOrange);
      expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.orange);
    });

    it('stays on the disabled (desaturated) style when a company is selected but has zero members', () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
      useUIStore.getState().selectCompany('c1');
      render(<CompanyOptionsSection />);
      const stub = screen.getByTestId('audio-setting-section-stub');
      expect(stub.getAttribute('data-style-a')).toBe(desaturateHex(ACCENT_COLORS.orange, 0.8));
      expect(stub.getAttribute('data-style-b')).toBe(desaturateHex(ACCENT_COLORS.burntOrange, 0.6));
    });
  });

  it('renders every section disabled when the selected company has zero members', () => {
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
    useUIStore.getState().selectCompany('c1');

    render(<CompanyOptionsSection />);

    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-disabled')).toBe('');
  });

  it('populates every section\'s value from resolveCompanyOptions(company, firstMember) when a non-empty company is selected', () => {
    const robot = makeRobot({
      id: 'r1', companyId: 'c1', masterVolume: 0.6, rhythmicDensity: 42, pitchRepeat: 30,
      rhythmicMotifLength: { active: true, value: 6 },
      noteVariance: { active: true, value: 2 },
    });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');

    render(<CompanyOptionsSection />);

    expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume')).toBe('0.6');
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-density')).toBe('42');
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-pitch-repeat')).toBe('30');
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-disabled')).toBeNull();
    // rhythmicMotifLength/noteVariance flatten from the resolved { active, value } shape to plain
    // numbers here (pingControlsValue, CompanyOptionsSection.tsx) — distinct values on each field
    // so a field-swap bug (e.g. deriving noteVariance from resolved.rhythmicMotifLength.value)
    // would surface as a mismatch rather than passing by coincidence.
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-motif-length')).toBe('6');
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-note-variance')).toBe('2');
  });

  it('flattens rhythmicMotifLength/noteVariance to 0 (DISABLED_PING_CONTROLS) when no company is selected', () => {
    render(<CompanyOptionsSection />);

    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-motif-length')).toBe('0');
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-note-variance')).toBe('0');
  });

  it('editing Volume calls applyVolume once per member robot, not a single bulk call', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
    const r2 = makeRobot({ id: 'r2', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addRobot(localeId, r2);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
    useUIStore.getState().selectCompany('c1');
    const applyVolumeSpy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-volume'));

    expect(applyVolumeSpy).toHaveBeenCalledTimes(2);
    expect(applyVolumeSpy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
  });

  it('editing one field patches only that field into company.lastEditedOptions', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6 });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
    const updateCompanySpy = vi.spyOn(useLocaleStore.getState(), 'updateCompany');

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-volume'));

    expect(updateCompanySpy).toHaveBeenCalledTimes(1);
    const [, , update] = updateCompanySpy.mock.calls[0];
    expect(Object.keys(update.lastEditedOptions ?? {})).toEqual(['masterVolume']);
  });

  it('editing Click Track calls applyClickTrackActive once per member robot, not a single bulk call', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
    const r2 = makeRobot({ id: 'r2', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addRobot(localeId, r2);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
    useUIStore.getState().selectCompany('c1');
    const applyClickTrackSpy = vi.spyOn(robotOptionsActions, 'applyClickTrackActive').mockImplementation(() => {});

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-click-track'));

    expect(applyClickTrackSpy).toHaveBeenCalledTimes(2);
    expect(applyClickTrackSpy.mock.calls.map((c) => [c[0].id, c[2]])).toEqual([
      ['r1', true],
      ['r2', true],
    ]);
  });

  it('editing Click Track patches clickTrackActive into company.lastEditedOptions', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    vi.spyOn(robotOptionsActions, 'applyClickTrackActive').mockImplementation(() => {});
    const updateCompanySpy = vi.spyOn(useLocaleStore.getState(), 'updateCompany');

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-click-track'));

    const [, , update] = updateCompanySpy.mock.calls[0];
    expect(update.lastEditedOptions).toEqual({ clickTrackActive: true });
  });

  it('editing Pitch Repeat calls applyPitchRepeat once per member robot, not a single bulk call', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
    const r2 = makeRobot({ id: 'r2', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addRobot(localeId, r2);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
    useUIStore.getState().selectCompany('c1');
    const applyPitchRepeatSpy = vi.spyOn(robotOptionsActions, 'applyPitchRepeat').mockImplementation(() => {});

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-pitch-repeat'));

    expect(applyPitchRepeatSpy).toHaveBeenCalledTimes(2);
    expect(applyPitchRepeatSpy.mock.calls.map((c) => [c[0].id, c[2]])).toEqual([
      ['r1', 90],
      ['r2', 90],
    ]);
  });

  it('editing Pitch Repeat patches only pitchRepeat into company.lastEditedOptions (plain-number pattern, not diffCompoundField)', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    vi.spyOn(robotOptionsActions, 'applyPitchRepeat').mockImplementation(() => {});
    const updateCompanySpy = vi.spyOn(useLocaleStore.getState(), 'updateCompany');

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-pitch-repeat'));

    const [, , update] = updateCompanySpy.mock.calls[0];
    expect(update.lastEditedOptions).toEqual({ pitchRepeat: 90 });
  });

  it('editing Motif Length calls applyMotifLength once per member robot with the raw number, not diffCompoundField', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
    const r2 = makeRobot({ id: 'r2', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addRobot(localeId, r2);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
    useUIStore.getState().selectCompany('c1');
    const applyMotifLengthSpy = vi.spyOn(robotOptionsActions, 'applyMotifLength').mockImplementation(() => {});

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-motif-length'));

    expect(applyMotifLengthSpy).toHaveBeenCalledTimes(2);
    expect(applyMotifLengthSpy.mock.calls.map((c) => [c[0].id, c[2]])).toEqual([
      ['r1', 12],
      ['r2', 12],
    ]);
  });

  it('editing Motif Length patches { active, value } (reconstructed) into company.lastEditedOptions', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    vi.spyOn(robotOptionsActions, 'applyMotifLength').mockImplementation(() => {});
    const updateCompanySpy = vi.spyOn(useLocaleStore.getState(), 'updateCompany');

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-motif-length'));

    const [, , update] = updateCompanySpy.mock.calls[0];
    expect(update.lastEditedOptions).toEqual({ rhythmicMotifLength: { active: true, value: 12 } });
  });

  it('editing Motif Length across the 0 boundary patches both active and value together, not just one', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    const applyMotifLengthSpy = vi.spyOn(robotOptionsActions, 'applyMotifLength').mockImplementation(() => {});
    const updateCompanySpy = vi.spyOn(useLocaleStore.getState(), 'updateCompany');

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-motif-length-zero'));

    expect(applyMotifLengthSpy).toHaveBeenCalledWith(robot, localeId, 0);
    const [, , update] = updateCompanySpy.mock.calls[0];
    expect(update.lastEditedOptions).toEqual({ rhythmicMotifLength: { active: false, value: 0 } });
  });

  it('editing Note Variance calls applyNoteVariance once per member robot with the raw number, not diffCompoundField', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
    const r2 = makeRobot({ id: 'r2', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addRobot(localeId, r2);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
    useUIStore.getState().selectCompany('c1');
    const applyNoteVarianceSpy = vi.spyOn(robotOptionsActions, 'applyNoteVariance').mockImplementation(() => {});

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-note-variance'));

    expect(applyNoteVarianceSpy).toHaveBeenCalledTimes(2);
    expect(applyNoteVarianceSpy.mock.calls.map((c) => [c[0].id, c[2]])).toEqual([
      ['r1', 5],
      ['r2', 5],
    ]);
  });

  it('editing Note Variance patches { active, value } (reconstructed) into company.lastEditedOptions', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    vi.spyOn(robotOptionsActions, 'applyNoteVariance').mockImplementation(() => {});
    const updateCompanySpy = vi.spyOn(useLocaleStore.getState(), 'updateCompany');

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-note-variance'));

    const [, , update] = updateCompanySpy.mock.calls[0];
    expect(update.lastEditedOptions).toEqual({ noteVariance: { active: true, value: 5 } });
  });

  it('editing Note Variance across the 0 boundary patches both active and value together, not just one', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    const applyNoteVarianceSpy = vi.spyOn(robotOptionsActions, 'applyNoteVariance').mockImplementation(() => {});
    const updateCompanySpy = vi.spyOn(useLocaleStore.getState(), 'updateCompany');

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-note-variance-zero'));

    expect(applyNoteVarianceSpy).toHaveBeenCalledWith(robot, localeId, 0);
    const [, , update] = updateCompanySpy.mock.calls[0];
    expect(update.lastEditedOptions).toEqual({ noteVariance: { active: false, value: 0 } });
  });

  it('omits Reset Melody entirely in company mode', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');

    render(<CompanyOptionsSection />);

    expect(screen.queryByText('probe-reset-melody')).toBeNull();
  });

  it('re-selecting a company shows its last-edited value, not the first member\'s possibly-drifted live value', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.5 });
    const r2 = makeRobot({ id: 'r2', companyId: 'c2', masterVolume: 0.5 });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addRobot(localeId, r2);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useLocaleStore.getState().addCompany(localeId, { id: 'c2', name: 'Null Syndicate', color: '#4f6d7a', robotIds: ['r2'] });
    vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});

    // Select c1, edit its Volume (the probe button always fires with a fixed 77%).
    useUIStore.getState().selectCompany('c1');
    const { unmount } = render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-volume'));
    unmount();
    const editedVolume = useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions?.masterVolume;
    expect(editedVolume).toBeCloseTo(0.77, 5);

    // r1 (c1's only member) drifts independently after that edit.
    useLocaleStore.getState().updateRobot(localeId, 'r1', { masterVolume: 0.99 });

    // Switch to c2, then back to c1.
    useUIStore.getState().selectCompany('c2');
    render(<CompanyOptionsSection />);
    useUIStore.getState().selectCompany('c1');

    render(<CompanyOptionsSection />);
    const stubs = screen.getAllByTestId('audio-setting-section-stub');
    const lastStub = stubs[stubs.length - 1];
    expect(lastStub.getAttribute('data-volume')).toBe(String(editedVolume));
  });

  it('editing an individual member robot directly does not change the company\'s lastEditedOptions', () => {
    const robot = makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.5 });
    useLocaleStore.getState().addRobot(localeId, robot);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });

    robotOptionsActions.applyVolume(robot, localeId, 77);

    expect(useLocaleStore.getState().getCompanyById(localeId, 'c1')?.lastEditedOptions).toBeUndefined();
  });

  it('a Signature Array edit calls applyLayersContinuous once per member, and Ping Contour a separate applyAdsr call', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    const continuousSpy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
    const adsrSpy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-layers-continuous'));
    fireEvent.click(screen.getByText('probe-adsr'));

    expect(continuousSpy).toHaveBeenCalledTimes(1);
    expect(adsrSpy).toHaveBeenCalledTimes(1);
  });

  it('a structural Signature Array edit (Type/Active) calls applyLayersStructural, not applyLayersContinuous', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    const structuralSpy = vi.spyOn(robotOptionsActions, 'applyLayersStructural').mockImplementation(() => {});
    const continuousSpy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-layers-structural'));

    expect(structuralSpy).toHaveBeenCalledTimes(1);
    expect(continuousSpy).not.toHaveBeenCalled();
  });

  it('a per-layer LFO edit calls applyLayerLfo with the right target', () => {
    const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
    useUIStore.getState().selectCompany('c1');
    const lfoSpy = vi.spyOn(robotOptionsActions, 'applyLayerLfo').mockImplementation(() => {});

    render(<CompanyOptionsSection />);
    fireEvent.click(screen.getByText('probe-layer-lfo'));

    expect(lfoSpy).toHaveBeenCalledWith(r1, localeId, 'layer0.gain', { shape: 'sine', rate: 9, depth: 0 });
  });

  describe('broadcast preserves each member\'s own untouched sub-fields (only the single changed attribute propagates)', () => {
    it('editing Attack broadcasts only attack — each member keeps its own Decay/Sustain/Release', () => {
      const r1 = makeRobot({
        id: 'r1', companyId: 'c1',
        audioAttributes: {
          adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
          filterFreq: 0, waveform: 'sine',
          layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
        },
      });
      const r2 = makeRobot({
        id: 'r2', companyId: 'c1',
        audioAttributes: {
          adsr: { attack: 0.1, decay: 0.9, sustain: 0.1, release: 0.4 },
          filterFreq: 0, waveform: 'sine',
          layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
        },
      });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
      useUIStore.getState().selectCompany('c1');
      const adsrSpy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});

      render(<CompanyOptionsSection />);
      fireEvent.click(screen.getByText('probe-adsr')); // stub sends { ...resolved-from-r1, attack: 0.9 }

      const r1Call = adsrSpy.mock.calls.find((c) => c[0].id === 'r1');
      const r2Call = adsrSpy.mock.calls.find((c) => c[0].id === 'r2');
      expect(r1Call?.[2]).toEqual({ attack: 0.9, decay: 0.3, sustain: 0.8, release: 1.5 });
      // r2's own decay/sustain/release survive untouched — not clobbered by r1's (the resolved
      // baseline's) values, which is what a whole-object broadcast would have done.
      expect(r2Call?.[2]).toEqual({ attack: 0.9, decay: 0.9, sustain: 0.1, release: 0.4 });
    });

    it('editing one Signature Array layer\'s Gain broadcasts only that layer\'s gain — other layers and other members\' own layer values survive', () => {
      const r1 = makeRobot({
        id: 'r1', companyId: 'c1',
        audioAttributes: {
          adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine',
          layers: [
            { type: 'sine', gain: 1, detune: 0, phase: 0 },
            { type: 'square', gain: 0.8, detune: 5, phase: 10 },
            { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
          ],
        },
      });
      const r2 = makeRobot({
        id: 'r2', companyId: 'c1',
        audioAttributes: {
          adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 }, filterFreq: 0, waveform: 'sine',
          layers: [
            { type: 'pulse', gain: 0.2, detune: 40, phase: 90 },
            { type: 'triangle', gain: 0.5, detune: -10, phase: 30 },
            { type: 'sine', gain: 0.9, detune: 15, phase: 5 },
          ],
        },
      });
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'] });
      useUIStore.getState().selectCompany('c1');
      const continuousSpy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});

      render(<CompanyOptionsSection />);
      fireEvent.click(screen.getByText('probe-layers-continuous')); // stub sets layer[1].gain = 0.4

      const r2Call = continuousSpy.mock.calls.find((c) => c[0].id === 'r2');
      const r2Layers = r2Call?.[2] as { type: string; gain: number; detune: number; phase: number }[];
      // Only layer[1]'s gain changed; r2's own layer[0] and layer[2] — and layer[1]'s own
      // type/detune/phase — are untouched, not overwritten with r1's (resolved's) values.
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
      fireEvent.click(screen.getByText('probe-volume-lfo')); // stub sends { ...resolved-from-r1, rate: 9 }

      const r2Call = volumeLfoSpy.mock.calls.find((c) => c[0].id === 'r2');
      expect(r2Call?.[2]).toEqual({ shape: 'square', rate: 9, depth: 60 });
    });
  });

  describe('"All" selection (CompanyButtonRow\'s All button)', () => {
    it('renders every section disabled when All is selected but the locale has zero robots', () => {
      useUIStore.getState().selectAllRobots();

      render(<CompanyOptionsSection />);

      expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-disabled')).toBe('');
    });

    it('populates every section\'s value from the first robot in the locale, across companies and Freelance alike', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1', masterVolume: 0.6, rhythmicDensity: 42 });
      const r2 = makeRobot({ id: 'r2', companyId: undefined }); // Freelance
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      useUIStore.getState().selectAllRobots();

      render(<CompanyOptionsSection />);

      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume')).toBe('0.6');
      expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-density')).toBe('42');
      expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-disabled')).toBeNull();
    });

    it('editing Volume while All is selected calls applyVolume once per robot in the locale, regardless of company', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
      const r2 = makeRobot({ id: 'r2', companyId: 'c2' });
      const r3 = makeRobot({ id: 'r3', companyId: undefined }); // Freelance
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addRobot(localeId, r3);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      useLocaleStore.getState().addCompany(localeId, { id: 'c2', name: 'Null Syndicate', color: '#4f6d7a', robotIds: ['r2'] });
      useUIStore.getState().selectAllRobots();
      const applyVolumeSpy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});

      render(<CompanyOptionsSection />);
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

      // Edit while "All" is selected (probe fires a fixed 77%).
      useUIStore.getState().selectAllRobots();
      const { unmount: unmount1 } = render(<CompanyOptionsSection />);
      fireEvent.click(screen.getByText('probe-volume'));
      unmount1();

      // Switch to the company and confirm ITS resolved value still reflects the robot's own live
      // value (0.5), not All's edited 77% — the two snapshots never cross-contaminate.
      useUIStore.getState().selectCompany('c1');
      render(<CompanyOptionsSection />);
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume')).toBe('0.5');
    });
  });

  describe('re-render cascade regression (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md follow-up)', () => {
    function callCounts() {
      return {
        audioSettingSection: renderCounts.audioSettingSection.mock.calls.length,
        pingControlsDrawer: renderCounts.pingControlsDrawer.mock.calls.length,
        pingContourDrawer: renderCounts.pingContourDrawer.mock.calls.length,
        signatureArrayDrawer: renderCounts.signatureArrayDrawer.mock.calls.length,
      };
    }

    beforeEach(() => {
      renderCounts.audioSettingSection.mockClear();
      renderCounts.pingControlsDrawer.mockClear();
      renderCounts.pingContourDrawer.mockClear();
      renderCounts.signatureArrayDrawer.mockClear();
    });

    // The end-to-end proof this whole follow-up exists for: this component subscribes to the
    // *whole locale's* robots array, which gets a new reference on any robot edit anywhere in the
    // locale — editing a robot that isn't even a member of the selected company used to still
    // re-render all 4 sections here.
    it('editing a robot that is NOT a member of the selected company leaves all 4 sections un-re-rendered', () => {
      const member = makeRobot({ id: 'r1', companyId: 'c1' });
      const stranger = makeRobot({ id: 'r2', companyId: 'c2' });
      useLocaleStore.getState().addRobot(localeId, member);
      useLocaleStore.getState().addRobot(localeId, stranger);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      useLocaleStore.getState().addCompany(localeId, { id: 'c2', name: 'Null Syndicate', color: '#4f6d7a', robotIds: ['r2'] });
      useUIStore.getState().selectCompany('c1');
      render(<CompanyOptionsSection />);

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

      const countsAfterMount = callCounts();

      // Editing r2 (not members[0]) touches an ADSR-irrelevant field on a non-baseline member —
      // resolved is derived from members[0] (r1) alone, so this shouldn't move anything.
      act(() => {
        useLocaleStore.getState().updateRobot(localeId, r2.id, { rhythmicDensity: 91 });
      });
      expect(callCounts()).toEqual(countsAfterMount);

      // Editing r1 (members[0]) for real, on an ADSR-only field.
      act(() => {
        useLocaleStore.getState().updateRobot(localeId, r1.id, {
          audioAttributes: { ...r1.audioAttributes, adsr: { attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 } },
        });
      });

      const countsAfterEdit = callCounts();
      expect(countsAfterEdit.pingContourDrawer).toBeGreaterThan(countsAfterMount.pingContourDrawer);
      expect(countsAfterEdit.audioSettingSection).toBe(countsAfterMount.audioSettingSection);
      expect(countsAfterEdit.pingControlsDrawer).toBe(countsAfterMount.pingControlsDrawer);
      expect(countsAfterEdit.signatureArrayDrawer).toBe(countsAfterMount.signatureArrayDrawer);
    });
  });

  // Bugfix, found live (docs/todo/backlog.md #27 follow-up), matching CompanyManager.tsx's own
  // documented fix — RobotsTab re-renders on every audio-swell tick, and this component takes
  // zero props, so a memo boundary is correct and sufficient (an empty prop list can never
  // differ), even though it can't stop this component's OWN robots-array subscription from
  // re-executing its body (see this component's own doc comment for that known limitation).
  it('is a React.memo-wrapped component', () => {
    expect((CompanyOptionsSection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  // Task 19 (docs/tasks/NAV_LAYOUT_REWRITE.md) — an optional `section` prop, additive to every
  // test above (all of which call <CompanyOptionsSection /> with no props and keep rendering all
  // 4 sections, RobotsTab.tsx's own call site, untouched until Task 20). When provided, narrows
  // rendering to exactly one of the 4 sections — the "Probes -> All Probes -> Volume" etc. leaf
  // content ProbesContent.tsx binds to. `section={null}` (the bare "All Probes" node, no leaf
  // chosen yet) renders all 4, same as omitting the prop entirely.
  describe('section prop (leaf-narrowing, Task 19)', () => {
    it('with no section prop, still renders all 4 sections — legacy behavior for RobotsTab.tsx\'s existing call site', () => {
      selectActiveCompany();
      render(<CompanyOptionsSection />);

      expect(screen.getByTestId('audio-setting-section-stub')).toBeTruthy();
      expect(screen.getByTestId('ping-controls-drawer-stub')).toBeTruthy();
      expect(screen.getByTestId('ping-contour-drawer-stub')).toBeTruthy();
      expect(screen.getByTestId('signature-array-drawer-stub')).toBeTruthy();
    });

    it('with section={null}, renders all 4 sections — the bare "All Probes" node before a leaf is chosen', () => {
      selectActiveCompany();
      render(<CompanyOptionsSection section={null} />);

      expect(screen.getByTestId('audio-setting-section-stub')).toBeTruthy();
      expect(screen.getByTestId('ping-controls-drawer-stub')).toBeTruthy();
      expect(screen.getByTestId('ping-contour-drawer-stub')).toBeTruthy();
      expect(screen.getByTestId('signature-array-drawer-stub')).toBeTruthy();
    });

    it('with section="volume", renders only AudioSettingSection', () => {
      selectActiveCompany();
      render(<CompanyOptionsSection section="volume" />);

      expect(screen.getByTestId('audio-setting-section-stub')).toBeTruthy();
      expect(screen.queryByTestId('ping-controls-drawer-stub')).toBeNull();
      expect(screen.queryByTestId('ping-contour-drawer-stub')).toBeNull();
      expect(screen.queryByTestId('signature-array-drawer-stub')).toBeNull();
    });

    it('with section="melody", renders only PingControlsDrawer', () => {
      selectActiveCompany();
      render(<CompanyOptionsSection section="melody" />);

      expect(screen.getByTestId('ping-controls-drawer-stub')).toBeTruthy();
      expect(screen.queryByTestId('audio-setting-section-stub')).toBeNull();
      expect(screen.queryByTestId('ping-contour-drawer-stub')).toBeNull();
      expect(screen.queryByTestId('signature-array-drawer-stub')).toBeNull();
    });

    it('with section="envelope", renders only PingContourDrawer', () => {
      selectActiveCompany();
      render(<CompanyOptionsSection section="envelope" />);

      expect(screen.getByTestId('ping-contour-drawer-stub')).toBeTruthy();
      expect(screen.queryByTestId('audio-setting-section-stub')).toBeNull();
      expect(screen.queryByTestId('ping-controls-drawer-stub')).toBeNull();
      expect(screen.queryByTestId('signature-array-drawer-stub')).toBeNull();
    });

    it('with section="source", renders only SignatureArrayDrawer', () => {
      selectActiveCompany();
      render(<CompanyOptionsSection section="source" />);

      expect(screen.getByTestId('signature-array-drawer-stub')).toBeTruthy();
      expect(screen.queryByTestId('audio-setting-section-stub')).toBeNull();
      expect(screen.queryByTestId('ping-controls-drawer-stub')).toBeNull();
      expect(screen.queryByTestId('ping-contour-drawer-stub')).toBeNull();
    });

    it('narrowed to section="volume" under allRobotsSelected still broadcasts applyVolume once per robot in the locale (Task 19 AC2 — the "All Probes" bulk-edit target)', () => {
      const r1 = makeRobot({ id: 'r1', companyId: 'c1' });
      const r2 = makeRobot({ id: 'r2', companyId: undefined }); // Freelance
      useLocaleStore.getState().addRobot(localeId, r1);
      useLocaleStore.getState().addRobot(localeId, r2);
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      useUIStore.getState().selectAllRobots();
      const applyVolumeSpy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});

      render(<CompanyOptionsSection section="volume" />);
      fireEvent.click(screen.getByText('probe-volume'));

      expect(applyVolumeSpy).toHaveBeenCalledTimes(2);
      expect(applyVolumeSpy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r1', 'r2']);
    });
  });
});
