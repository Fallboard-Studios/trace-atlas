import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memo } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RobotOptionsTab } from './RobotOptionsTab';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef } from '@/utils/sectionRefs';

// RobotDisplaySection/PingControlsRhythmSection/PingControlsFrequencySection/PingContourDrawer/
// SignatureArrayLayer/RobotDriftPanel pull in real Tone.js/AudioEngine and GSAP, both of which
// throw in this jsdom test environment — the same boundary ConsolePanel.test.tsx already draws
// around RobotsTab/RobotOptionsTab. This test is about RobotOptionsTab's own stacked-view/
// accordion wiring, not about the leaf components' own rendered content (each has its own full
// test suite) — the mocks below render probe buttons that invoke the captured callback props, so
// wiring bugs (wrong function, wrong argument) still surface here even though the real leaf JSX
// never mounts.
vi.mock('@/components/robot/RobotDisplaySection', () => ({
  RobotDisplaySection: memo(() => <div data-testid="robot-display-section-stub" />),
}));
vi.mock('@/components/robot/AudioSettingSection', () => ({
  AudioSettingSection: memo((props: {
    value: { audioMode: string; masterVolume: number };
    onAudioModeChange: (mode: string) => void;
    onVolumeChange: (pct: number) => void;
    volumeLfoHeldOff?: boolean;
  }) => (
    <div
      data-testid="audio-setting-section-stub"
      data-audio-mode={props.value.audioMode}
      data-master-volume={props.value.masterVolume}
      data-volume-held-off={String(props.volumeLfoHeldOff)}
    >
      <button onClick={() => props.onAudioModeChange('solo')}>probe-audio-mode</button>
      <button onClick={() => props.onVolumeChange(55)}>probe-volume</button>
    </div>
  )),
}));
vi.mock('@/components/robot/PingControlsDrawer', () => ({
  PingControlsRhythmSection: memo((props: {
    value: { rhythmicDensity: number; rhythmicMotifLength: number; pitchRepeat: number; clickTrackActive: boolean };
    onDensityChange: (v: number) => void;
    onMotifLengthChange: (v: number) => void;
    onPitchRepeatChange: (v: number) => void;
    onResetMelody?: () => void;
    onClickTrackActiveChange: (v: boolean) => void;
  }) => (
    <div
      data-testid="ping-controls-rhythm-stub"
      data-density={props.value.rhythmicDensity}
      data-motif-length={props.value.rhythmicMotifLength}
      data-pitch-repeat={props.value.pitchRepeat}
      data-click-track-active={String(props.value.clickTrackActive)}
    >
      <button onClick={() => props.onDensityChange(77)}>probe-density</button>
      <button onClick={() => props.onMotifLengthChange(6)}>probe-motif-length</button>
      <button onClick={() => props.onPitchRepeatChange(88)}>probe-pitch-repeat</button>
      {props.onResetMelody && <button onClick={props.onResetMelody}>probe-reset-melody</button>}
      <button onClick={() => props.onClickTrackActiveChange(true)}>probe-click-track</button>
    </div>
  )),
  PingControlsFrequencySection: memo((props: {
    value: { noteVariance: number };
    onOctaveMinChange: (v: number) => void;
    onOctaveMaxChange: (v: number) => void;
    onNoteVarianceChange: (v: number) => void;
  }) => (
    <div data-testid="ping-controls-frequency-stub" data-note-variance={props.value.noteVariance}>
      <button onClick={() => props.onOctaveMinChange(4)}>probe-octave-min</button>
      <button onClick={() => props.onNoteVarianceChange(0)}>probe-note-variance</button>
    </div>
  )),
}));
vi.mock('@/components/robot/PingContourDrawer', () => ({
  PingContourDrawer: memo((props: { value: { attack: number }; onChange: (next: unknown) => void }) => (
    <div data-testid="ping-contour-drawer-stub" data-attack={props.value.attack}>
      <button onClick={() => props.onChange({ attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 })}>probe-adsr</button>
    </div>
  )),
}));
vi.mock('@/components/robot/SignatureArrayDrawer', () => ({
  SignatureArrayLayer: memo((props: { idx: number; layer: { type: string }; onTypeChange: (idx: number, type: string) => void; onParamChange: (idx: number, field: string, v: number) => void }) => (
    <div data-testid={`signature-array-layer-stub-${props.idx}`} data-type={props.layer.type}>
      <button onClick={() => props.onParamChange(props.idx, 'gain', 0.5)}>probe-layer-gain-{props.idx}</button>
    </div>
  )),
  RobotDriftPanel: memo(() => <div data-testid="robot-drift-panel-stub" />),
}));

import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import * as robotOptionsActions from '@/systems/robotOptionsActions';
import * as regenerateMelodyModule from '@/engine/regenerateMelody';
import type { Robot } from '@/types/Robot';
import type { RobotSection, RobotSubsection } from '@/stores/uiStore';
import type { Locale } from '@/types/locale';
import { ACCENT_COLORS } from '@/constants/accentColors';

function makeRobot(id = 'r1', overrides: Partial<Robot> = {}): Robot {
  return {
    id,
    name: 'Test Robot',
    identityColor: '#428d95',
    state: 'idle',
    position: { x: 0, y: 0 },
    destination: null,
    direction: 'right',
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
      filterFreq: 0,
      waveform: 'sine',
      layers: [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
        { type: 'square', gain: 0.8, detune: 5, phase: 10, pulseWidth: 0.4 },
        { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
      ],
    },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 100,
    rhythmicDensity: 42,
    pitchRepeat: 33,
    ...overrides,
  } as Robot;
}

const SUBSECTION_IDS = (id: string) => [
  `probes.${id}.volume.audioSettings`,
  `probes.${id}.melody.rhythm`,
  `probes.${id}.melody.frequency`,
  `probes.${id}.envelope.pingContour`,
  `probes.${id}.source.baselineOscillator`,
  `probes.${id}.source.coaxialOscillator`,
  `probes.${id}.source.harmonicOscillator`,
  `probes.${id}.source.probeDrift`,
];

describe('RobotOptionsTab — stacked view (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 11)', () => {
  const localeId = getActiveLocaleId();

  beforeEach(() => {
    useUIStore.getState().selectRobot(null);
    useUIStore.getState().setSelectedSection(null);
    useUIStore.getState().setSelectedSubsection(null);
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
    useAudioStore.setState({ heldOffLfoKeys: [] });
    installIntersectionObserverStub();
    SUBSECTION_IDS('r1').forEach(clearSectionRef);
    SUBSECTION_IDS('r2').forEach(clearSectionRef);
    vi.restoreAllMocks();
  });

  function selectRobot(robot: Robot, section: RobotSection | null = null, subsection: RobotSubsection | null = null) {
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    useUIStore.getState().setSelectedSection(section);
    useUIStore.getState().setSelectedSubsection(subsection);
  }

  function openAndApproach(id: string) {
    act(() => approachSection(id));
  }

  it('renders the not-selected fallback when no robot is selected', () => {
    useUIStore.getState().selectRobot(null);
    render(<RobotOptionsTab />);
    expect(screen.getByText(/Select a robot from the list/i)).toBeTruthy();
    expect(screen.queryByTestId('robot-display-section-stub')).toBeNull();
  });

  it('renders "Robot not found" when selectedRobotId points at a robot that no longer exists', () => {
    useUIStore.getState().selectRobot('does-not-exist');
    render(<RobotOptionsTab />);
    expect(screen.getByText('Robot not found')).toBeTruthy();
  });

  it('always renders RobotDisplaySection, unwrapped, regardless of which subsection is open', () => {
    const robot = makeRobot();
    selectRobot(robot, 'source', 'probeDrift');
    render(<RobotOptionsTab />);
    expect(screen.getByTestId('robot-display-section-stub')).toBeTruthy();
  });

  it('renders all 8 subsection accordion triggers as shells: Dynamics, Rhythm, Pitches, Contour, Baseline/Coaxial/Harmonic Oscillator, Probe Drift', () => {
    const robot = makeRobot();
    selectRobot(robot);
    render(<RobotOptionsTab />);

    for (const label of ['Dynamics', 'Rhythm', 'Pitches', 'Contour', 'Baseline Oscillator', 'Coaxial Oscillator', 'Harmonic Oscillator', 'Probe Drift']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('opens Output\'s Audio Settings accordion by default when no section is chosen — first-leaf fallback (spec §1.5)', () => {
    const robot = makeRobot();
    selectRobot(robot);
    render(<RobotOptionsTab />);

    expect(screen.getByRole('button', { name: 'Dynamics' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Rhythm' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('selecting a subsection via the nav tree (selectedSection/selectedSubsection) does not open or close any accordion — nav selection only drives tree highlighting now', () => {
    const robot = makeRobot();
    selectRobot(robot, 'source', 'probeDrift');
    render(<RobotOptionsTab />);

    // Audio Settings still opens by default — the tree selection has no bearing on which
    // accordion is open (Crawford's own follow-up call, 2026-09-24).
    expect(screen.getByRole('button', { name: 'Dynamics' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Probe Drift' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking a subsection\'s own trigger opens it directly, without touching selectedSection/selectedSubsection or closing any other open accordion', () => {
    const robot = makeRobot();
    selectRobot(robot);
    render(<RobotOptionsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Contour' }));

    expect(screen.getByRole('button', { name: 'Contour' }).getAttribute('aria-expanded')).toBe('true');
    // Audio Settings (the default-open one) stays open too — multiple accordions can be open at once.
    expect(screen.getByRole('button', { name: 'Dynamics' }).getAttribute('aria-expanded')).toBe('true');
    expect(useUIStore.getState().selectedSection).toBeNull();
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });

  it('clicking an already-open accordion closes it, leaving "all closed" as a legal state', () => {
    const robot = makeRobot();
    selectRobot(robot);
    render(<RobotOptionsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Dynamics' }));

    expect(screen.getByRole('button', { name: 'Dynamics' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('switching to a different robot resets accordion state back to the default (Audio Settings open only)', () => {
    const robotA = makeRobot('r1');
    const robotB = makeRobot('r2');
    useLocaleStore.getState().addRobot(localeId, robotB);
    selectRobot(robotA);
    const { rerender } = render(<RobotOptionsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Contour' }));
    expect(screen.getByRole('button', { name: 'Contour' }).getAttribute('aria-expanded')).toBe('true');

    act(() => useUIStore.getState().selectRobot('r2'));
    rerender(<RobotOptionsTab />);

    expect(screen.getByRole('button', { name: 'Dynamics' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Contour' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('a subsection\'s real content is not in the DOM until its own anchor has been approached', () => {
    const robot = makeRobot();
    selectRobot(robot); // Audio Settings open by default, but not yet approached
    render(<RobotOptionsTab />);
    expect(screen.queryByTestId('audio-setting-section-stub')).toBeNull();
  });

  it('mounts a subsection\'s real content once its anchor is approached', () => {
    const robot = makeRobot();
    selectRobot(robot);
    render(<RobotOptionsTab />);

    openAndApproach('probes.r1.volume.audioSettings');

    expect(screen.getByTestId('audio-setting-section-stub')).toBeTruthy();
  });

  it('manually scrolling a subsection into view (scrollspy) updates selectedSection/selectedSubsection for tree highlighting, without touching any accordion\'s open state', () => {
    const robot = makeRobot();
    selectRobot(robot);
    render(<RobotOptionsTab />);

    openAndApproach('probes.r1.source.coaxialOscillator');

    expect(useUIStore.getState().selectedSection).toBe('source');
    expect(useUIStore.getState().selectedSubsection).toBe('coaxialOscillator');
    expect(screen.getByRole('button', { name: 'Dynamics' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Coaxial Oscillator' }).getAttribute('aria-expanded')).toBe('false');
  });

  describe('AudioSettingSection (Output -> Audio Settings)', () => {
    it("derives its value from the selected robot's audioMode/masterVolume", () => {
      const robot = makeRobot('r1', { audioMode: 'mute', masterVolume: 0.42 });
      selectRobot(robot, 'volume', 'audioSettings');
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.volume.audioSettings');

      const stub = screen.getByTestId('audio-setting-section-stub');
      expect(stub.getAttribute('data-audio-mode')).toBe('mute');
      expect(stub.getAttribute('data-master-volume')).toBe('0.42');
    });

    it('wires onAudioModeChange straight through to robotOptionsActions.applyAudioMode', () => {
      const robot = makeRobot();
      selectRobot(robot, 'volume', 'audioSettings');
      const applySpy = vi.spyOn(robotOptionsActions, 'applyAudioMode').mockImplementation(() => {});
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.volume.audioSettings');

      fireEvent.click(screen.getByText('probe-audio-mode'));

      expect(applySpy).toHaveBeenCalledWith(robot, localeId, 'solo');
    });

    it('wires onVolumeChange straight through to robotOptionsActions.applyVolume', () => {
      const robot = makeRobot();
      selectRobot(robot, 'volume', 'audioSettings');
      const applySpy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.volume.audioSettings');

      fireEvent.click(screen.getByText('probe-volume'));

      expect(applySpy).toHaveBeenCalledWith(robot, localeId, 55);
    });
  });

  describe('PingControlsRhythmSection/FrequencySection (Melody)', () => {
    it('derives Rhythm\'s value from the selected robot', () => {
      const robot = makeRobot();
      selectRobot(robot, 'melody', 'rhythm');
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.melody.rhythm');

      expect(screen.getByTestId('ping-controls-rhythm-stub').getAttribute('data-density')).toBe('42');
      expect(screen.getByTestId('ping-controls-rhythm-stub').getAttribute('data-pitch-repeat')).toBe('33');
    });

    it('wires Rhythm\'s onDensityChange to robotOptionsActions.applyDensity', () => {
      const robot = makeRobot();
      selectRobot(robot, 'melody', 'rhythm');
      const applySpy = vi.spyOn(robotOptionsActions, 'applyDensity').mockImplementation(() => {});
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.melody.rhythm');

      fireEvent.click(screen.getByText('probe-density'));

      expect(applySpy).toHaveBeenCalledWith(robot, localeId, 77);
    });

    it('wires Rhythm\'s onResetMelody to regenerateMelody directly (not a robotOptionsActions function)', () => {
      const robot = makeRobot();
      selectRobot(robot, 'melody', 'rhythm');
      const regenSpy = vi.spyOn(regenerateMelodyModule, 'regenerateMelody').mockImplementation(() => {});
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.melody.rhythm');

      fireEvent.click(screen.getByText('probe-reset-melody'));

      expect(regenSpy).toHaveBeenCalledWith(robot, localeId);
    });

    it('wires Frequency\'s onOctaveMinChange to robotOptionsActions.applyOctaveMin, independently of Rhythm', () => {
      const robot = makeRobot();
      selectRobot(robot, 'melody', 'frequency');
      const applySpy = vi.spyOn(robotOptionsActions, 'applyOctaveMin').mockImplementation(() => {});
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.melody.frequency');

      fireEvent.click(screen.getByText('probe-octave-min'));

      expect(applySpy).toHaveBeenCalledWith(robot, localeId, 4);
    });
  });

  describe('PingContourDrawer (Envelope -> Ping Contour)', () => {
    it('derives its value from the robot\'s audioAttributes.adsr and wires onChange to applyAdsr', () => {
      const robot = makeRobot();
      selectRobot(robot, 'envelope', 'pingContour');
      const applySpy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.envelope.pingContour');

      expect(screen.getByTestId('ping-contour-drawer-stub').getAttribute('data-attack')).toBe('0.01');

      fireEvent.click(screen.getByText('probe-adsr'));

      expect(applySpy).toHaveBeenCalledWith(robot, localeId, { attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 });
    });
  });

  describe('SignatureArrayLayer/RobotDriftPanel (Source)', () => {
    it('renders Baseline/Coaxial/Harmonic Oscillator each bound to their own layer index, once approached', () => {
      const robot = makeRobot();
      selectRobot(robot, 'source', 'baselineOscillator');
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.source.baselineOscillator');

      expect(screen.getByTestId('signature-array-layer-stub-0').getAttribute('data-type')).toBe('sine');
    });

    it('wires each layer\'s onParamChange to applyLayersContinuous, preserving the other layers', () => {
      const robot = makeRobot();
      selectRobot(robot, 'source', 'coaxialOscillator');
      const applySpy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.source.coaxialOscillator');

      fireEvent.click(screen.getByText('probe-layer-gain-1'));

      expect(applySpy).toHaveBeenCalledWith(robot, localeId, [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
        { type: 'square', gain: 0.5, detune: 5, phase: 10, pulseWidth: 0.4 },
        { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
      ]);
    });

    it('renders RobotDriftPanel once Probe Drift is approached', () => {
      const robot = makeRobot();
      selectRobot(robot, 'source', 'probeDrift');
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.source.probeDrift');

      expect(screen.getByTestId('robot-drift-panel-stub')).toBeTruthy();
    });
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 12) — the robot-options
  // root carries the robot's own identity color; each accordion gets its own trait color.
  describe('trait/robot color scoping', () => {
    it('scopes the robot-options root to the selected robot\'s own identityColor, regardless of which subsection is showing', () => {
      const robot = makeRobot('r1', { identityColor: '#68cb97' });
      selectRobot(robot);
      const { container } = render(<RobotOptionsTab />);

      const root = container.querySelector('.robot-options') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#68cb97');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#68cb97');
    });

    it('gives the Audio Settings accordion the Output trait\'s style (burnt orange/orange)', () => {
      const robot = makeRobot();
      selectRobot(robot, 'volume', 'audioSettings');
      const { container } = render(<RobotOptionsTab />);

      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.burntOrange);
      expect(root.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.orange);
    });
  });

  // Audio Load Budget (plan task 22): the tab owns the store access and the robot id, so it turns
  // the held-off keys into plain per-robot props for the (store-free) sections.
  describe('Audio Load: held-off LFOs for THIS robot', () => {
    it("marks this robot's Volume LFO held off when its key is in the list", () => {
      useAudioStore.setState({ heldOffLfoKeys: ['r1:volume'] });
      const robot = makeRobot('r1');
      selectRobot(robot, 'volume', 'audioSettings');
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.volume.audioSettings');

      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume-held-off')).toBe('true');
    });

    it("ignores another robot's held-off LFOs for Volume", () => {
      useAudioStore.setState({ heldOffLfoKeys: ['r2:volume'] });
      const robot = makeRobot('r1');
      selectRobot(robot, 'volume', 'audioSettings');
      render(<RobotOptionsTab />);
      openAndApproach('probes.r1.volume.audioSettings');

      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume-held-off')).toBe('false');
    });
  });
});
