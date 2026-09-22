import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memo, Profiler } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// RobotDisplaySection/PingControlsDrawer/PingContourDrawer/SignatureArrayDrawer pull in real
// Tone.js/AudioEngine and GSAP, both of which throw in this jsdom test environment — the same
// boundary ConsolePanel.test.tsx already draws around RobotsTab/RobotOptionsTab. This test is
// about RobotOptionsTab's own selected/not-selected switch and value/onChange wiring, not about
// the drawers' own rendered content (each has its own full test suite) — the mocks below render
// probe buttons that invoke the captured callback props, so wiring bugs (wrong function, wrong
// argument) still surface here even though the real drawer JSX never mounts.
//
// Every stub below is `React.memo`-wrapped and calls its own render-count spy unconditionally in
// its body (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 6) — the real 5 section components
// are memoized too, so wrapping these stand-ins the same way lets the cascade regression test
// below prove whether RobotOptionsTab is actually handing them stable props, without paying the
// cost of mounting the real Tone.js/GSAP-adjacent components this file was written to avoid. Each
// is a `vi.fn()` (a function call, not a mutated outer variable) rather than a plain incremented
// counter — `react-hooks/immutability` forbids mutating a module-level variable during render.
const renderCounts = {
  robotDisplaySection: vi.fn(),
  audioSettingSection: vi.fn(),
  pingControlsDrawer: vi.fn(),
  pingContourDrawer: vi.fn(),
  signatureArrayDrawer: vi.fn(),
};

vi.mock('@/components/robot/RobotDisplaySection', () => ({
  RobotDisplaySection: memo(() => {
    renderCounts.robotDisplaySection();
    return <div data-testid="robot-display-section-stub" />;
  }),
}));
// Roadmap Phase 14 (Task 12) — every mock below also reads `props.style`'s two custom
// properties onto data-* attributes, so this file's own trait/robot-color tests can assert on
// what RobotOptionsTab actually passed down without needing the real drawer/AccordionContainer
// to mount (this file's whole point is isolating RobotOptionsTab's own wiring).
function styleAttrs(style?: { [key: string]: string }) {
  return { 'data-style-a': style?.['--color-accent-a'], 'data-style-b': style?.['--color-accent-b'] };
}

vi.mock('@/components/robot/AudioSettingSection', () => ({
  AudioSettingSection: memo((props: {
    value: { audioMode: string; masterVolume: number };
    onAudioModeChange: (mode: string) => void;
    onVolumeChange: (pct: number) => void;
    volumeLfoHeldOff?: boolean;
    style?: { [key: string]: string };
  }) => {
    renderCounts.audioSettingSection();
    return (
      <div
        data-testid="audio-setting-section-stub"
        data-audio-mode={props.value.audioMode}
        data-master-volume={props.value.masterVolume}
        data-volume-held-off={String(props.volumeLfoHeldOff)}
        {...styleAttrs(props.style)}
      >
        <button onClick={() => props.onAudioModeChange('solo')}>probe-audio-mode</button>
        <button onClick={() => props.onVolumeChange(55)}>probe-volume</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/PingControlsDrawer', () => ({
  PingControlsDrawer: memo((props: {
    value: { rhythmicDensity: number; rhythmicMotifLength: number; noteVariance: number; pitchRepeat: number; clickTrackActive: boolean };
    onDensityChange: (v: number) => void;
    onMotifLengthChange: (v: number) => void;
    onNoteVarianceChange: (v: number) => void;
    onPitchRepeatChange: (v: number) => void;
    onResetMelody?: () => void;
    onClickTrackActiveChange: (v: boolean) => void;
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
        {...styleAttrs(props.style)}
      >
        <button onClick={() => props.onDensityChange(77)}>probe-density</button>
        <button onClick={() => props.onMotifLengthChange(6)}>probe-motif-length</button>
        <button onClick={() => props.onNoteVarianceChange(0)}>probe-note-variance</button>
        <button onClick={() => props.onPitchRepeatChange(88)}>probe-pitch-repeat</button>
        {props.onResetMelody && <button onClick={props.onResetMelody}>probe-reset-melody</button>}
        <button onClick={() => props.onClickTrackActiveChange(true)}>probe-click-track</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/PingContourDrawer', () => ({
  PingContourDrawer: memo((props: { value: { attack: number }; onChange: (next: unknown) => void; style?: { [key: string]: string } }) => {
    renderCounts.pingContourDrawer();
    return (
      <div data-testid="ping-contour-drawer-stub" data-attack={props.value.attack} {...styleAttrs(props.style)}>
        <button onClick={() => props.onChange({ attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 })}>probe-adsr</button>
      </div>
    );
  }),
}));
vi.mock('@/components/robot/SignatureArrayDrawer', () => ({
  SignatureArrayDrawer: memo((props: { value: { layers: unknown[] }; onContinuousChange: (v: unknown) => void; heldOffTargets?: Record<string, boolean>; style?: { [key: string]: string } }) => {
    renderCounts.signatureArrayDrawer();
    return (
      <div data-testid="signature-array-drawer-stub" data-layer-count={props.value.layers.length} data-held-off-targets={JSON.stringify(props.heldOffTargets ?? {})} {...styleAttrs(props.style)}>
        <button onClick={() => props.onContinuousChange([{ type: 'sine', gain: 1, detune: 0, phase: 0 }])}>probe-layers</button>
      </div>
    );
  }),
}));

import { RobotOptionsTab } from './RobotOptionsTab';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import * as robotOptionsActions from '@/systems/robotOptionsActions';
import * as regenerateMelodyModule from '@/engine/regenerateMelody';
import type { Robot } from '@/types/Robot';
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
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
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

describe('RobotOptionsTab', () => {
  const localeId = getActiveLocaleId();

  // beforeEach, not afterEach — runs after RTL's own afterEach cleanup has already unmounted the
  // previous test's component, so mutating the store here doesn't trigger the "update not
  // wrapped in act()" warning an afterEach-based reset would (same ordering pattern
  // ConsolePanel.test.tsx already documents and uses).
  beforeEach(() => {
    useUIStore.getState().selectRobot(null);
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
    useAudioStore.setState({ heldOffLfoKeys: [] });
    vi.restoreAllMocks();
  });

  it('renders the not-selected fallback when no robot is selected', () => {
    useUIStore.getState().selectRobot(null);
    render(<RobotOptionsTab />);
    expect(screen.getByText(/Select a robot from the list/i)).toBeTruthy();
    expect(screen.queryByTestId('robot-display-section-stub')).toBeNull();
  });

  it('renders RobotDisplaySection, AudioSettingSection, plus all 3 drawers when a robot is selected', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);

    render(<RobotOptionsTab />);

    expect(screen.getByTestId('robot-display-section-stub')).toBeTruthy();
    expect(screen.getByTestId('audio-setting-section-stub')).toBeTruthy();
    expect(screen.getByTestId('ping-controls-drawer-stub')).toBeTruthy();
    expect(screen.getByTestId('ping-contour-drawer-stub')).toBeTruthy();
    expect(screen.getByTestId('signature-array-drawer-stub')).toBeTruthy();
  });

  describe('AudioSettingSection extraction (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 5)', () => {
    it('renders as a direct sibling between RobotDisplaySection and PingControlsDrawer', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      const displaySection = screen.getByTestId('robot-display-section-stub');
      const audioSetting = screen.getByTestId('audio-setting-section-stub');
      const pingControls = screen.getByTestId('ping-controls-drawer-stub');

      expect(displaySection.compareDocumentPosition(audioSetting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(audioSetting.compareDocumentPosition(pingControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("derives its value from the selected robot's audioMode/masterVolume", () => {
      const robot = makeRobot('r1', { audioMode: 'mute', masterVolume: 0.42 });
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      const stub = screen.getByTestId('audio-setting-section-stub');
      expect(stub.getAttribute('data-audio-mode')).toBe('mute');
      expect(stub.getAttribute('data-master-volume')).toBe('0.42');
    });

    it('defaults audioMode to \'none\' when the robot has none set', () => {
      const robot = makeRobot('r1', { audioMode: undefined });
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-audio-mode')).toBe('none');
    });

    it('wires onAudioModeChange straight through to robotOptionsActions.applyAudioMode', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      const applySpy = vi.spyOn(robotOptionsActions, 'applyAudioMode').mockImplementation(() => {});
      render(<RobotOptionsTab />);

      fireEvent.click(screen.getByText('probe-audio-mode'));

      expect(applySpy).toHaveBeenCalledWith(robot, localeId, 'solo');
    });

    it('wires onVolumeChange straight through to robotOptionsActions.applyVolume', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      const applySpy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      render(<RobotOptionsTab />);

      fireEvent.click(screen.getByText('probe-volume'));

      expect(applySpy).toHaveBeenCalledWith(robot, localeId, 55);
    });
  });

  it('renders "Robot not found" when selectedRobotId points at a robot that no longer exists', () => {
    useUIStore.getState().selectRobot('does-not-exist');
    render(<RobotOptionsTab />);
    expect(screen.getByText('Robot not found')).toBeTruthy();
  });

  it('derives PingControlsDrawer\'s value from the selected robot', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    render(<RobotOptionsTab />);

    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-density')).toBe('42');
  });

  it('derives PingControlsDrawer\'s pitchRepeat value from the selected robot', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    render(<RobotOptionsTab />);

    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-pitch-repeat')).toBe('33');
  });

  it('derives PingControlsDrawer\'s rhythmicMotifLength/noteVariance as plain numbers from the robot\'s {active, value} fields', () => {
    const robot = makeRobot('r1', {
      rhythmicMotifLength: { active: true, value: 6 },
      noteVariance: { active: true, value: 2 },
    });
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    render(<RobotOptionsTab />);

    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-motif-length')).toBe('6');
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-note-variance')).toBe('2');
  });

  it('falls back to the invariant-correct defaults\' .value when the robot has never had these fields set', () => {
    const robot = makeRobot(); // rhythmicMotifLength/noteVariance both omitted
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    render(<RobotOptionsTab />);

    // DEFAULT_RHYTHMIC_MOTIF_LENGTH = { active: true, value: 8 }, DEFAULT_NOTE_VARIANCE = { active: false, value: 0 }
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-motif-length')).toBe('8');
    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-note-variance')).toBe('0');
  });

  it('wires PingControlsDrawer\'s onMotifLengthChange straight through to robotOptionsActions.applyMotifLength', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    const applySpy = vi.spyOn(robotOptionsActions, 'applyMotifLength').mockImplementation(() => {});
    render(<RobotOptionsTab />);

    fireEvent.click(screen.getByText('probe-motif-length'));

    expect(applySpy).toHaveBeenCalledWith(robot, localeId, 6);
  });

  it('wires PingControlsDrawer\'s onNoteVarianceChange straight through to robotOptionsActions.applyNoteVariance', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    const applySpy = vi.spyOn(robotOptionsActions, 'applyNoteVariance').mockImplementation(() => {});
    render(<RobotOptionsTab />);

    fireEvent.click(screen.getByText('probe-note-variance'));

    expect(applySpy).toHaveBeenCalledWith(robot, localeId, 0);
  });

  it('wires PingControlsDrawer\'s onDensityChange to robotOptionsActions.applyDensity', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    const applySpy = vi.spyOn(robotOptionsActions, 'applyDensity').mockImplementation(() => {});
    render(<RobotOptionsTab />);

    fireEvent.click(screen.getByText('probe-density'));

    expect(applySpy).toHaveBeenCalledWith(robot, localeId, 77);
  });

  it('wires PingControlsDrawer\'s onPitchRepeatChange to robotOptionsActions.applyPitchRepeat', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    const applySpy = vi.spyOn(robotOptionsActions, 'applyPitchRepeat').mockImplementation(() => {});
    render(<RobotOptionsTab />);

    fireEvent.click(screen.getByText('probe-pitch-repeat'));

    expect(applySpy).toHaveBeenCalledWith(robot, localeId, 88);
  });

  it('wires PingControlsDrawer\'s onResetMelody to regenerateMelody directly (not a robotOptionsActions function)', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    const regenSpy = vi.spyOn(regenerateMelodyModule, 'regenerateMelody').mockImplementation(() => {});
    render(<RobotOptionsTab />);

    fireEvent.click(screen.getByText('probe-reset-melody'));

    expect(regenSpy).toHaveBeenCalledWith(robot, localeId);
  });

  it('derives PingControlsDrawer\'s clickTrackActive from the robot and wires onClickTrackActiveChange to applyClickTrackActive', () => {
    const robot = { ...makeRobot(), clickTrackActive: true };
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    const applySpy = vi.spyOn(robotOptionsActions, 'applyClickTrackActive').mockImplementation(() => {});
    render(<RobotOptionsTab />);

    expect(screen.getByTestId('ping-controls-drawer-stub').getAttribute('data-click-track-active')).toBe('true');

    fireEvent.click(screen.getByText('probe-click-track'));

    expect(applySpy).toHaveBeenCalledWith(robot, localeId, true);
  });

  it('derives PingContourDrawer\'s value from the robot\'s audioAttributes.adsr and wires onChange to applyAdsr', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    const applySpy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
    render(<RobotOptionsTab />);

    expect(screen.getByTestId('ping-contour-drawer-stub').getAttribute('data-attack')).toBe('0.01');

    fireEvent.click(screen.getByText('probe-adsr'));

    expect(applySpy).toHaveBeenCalledWith(robot, localeId, { attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 });
  });

  it('derives SignatureArrayDrawer\'s value from the robot\'s layers and wires onContinuousChange to applyLayersContinuous', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    useUIStore.getState().selectRobot(robot.id);
    const applySpy = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
    render(<RobotOptionsTab />);

    expect(screen.getByTestId('signature-array-drawer-stub').getAttribute('data-layer-count')).toBe('1');

    fireEvent.click(screen.getByText('probe-layers'));

    expect(applySpy).toHaveBeenCalledWith(robot, localeId, [{ type: 'sine', gain: 1, detune: 0, phase: 0 }]);
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 12) — the robot-options
  // root carries the robot's own identity color; each of the 4 drawers gets its own trait color.
  describe('trait/robot color scoping', () => {
    it('scopes the robot-options root to the selected robot\'s own identityColor', () => {
      const robot = makeRobot('r1', { identityColor: '#68cb97' });
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      const { container } = render(<RobotOptionsTab />);

      const root = container.querySelector('.robot-options') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#68cb97');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#68cb97');
    });

    it('gives AudioSettingSection the Output trait\'s style (burnt orange/orange)', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      const stub = screen.getByTestId('audio-setting-section-stub');
      expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.burntOrange);
      expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.orange);
    });

    it('gives PingControlsDrawer the Composition trait\'s style (emerald/lime)', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      const stub = screen.getByTestId('ping-controls-drawer-stub');
      expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.emerald);
      expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.lime);
    });

    it('gives PingContourDrawer the Time/Space trait\'s style (purple/pink)', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      const stub = screen.getByTestId('ping-contour-drawer-stub');
      expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.purple);
      expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.pink);
    });

    it('gives SignatureArrayDrawer the Spectral trait\'s style (cyan/indigo)', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      const stub = screen.getByTestId('signature-array-drawer-stub');
      expect(stub.getAttribute('data-style-a')).toBe(ACCENT_COLORS.cyan);
      expect(stub.getAttribute('data-style-b')).toBe(ACCENT_COLORS.indigo);
    });

    it('gives two different robots two different root colors, while both get the same 4 trait colors on their drawers', () => {
      const robotA = makeRobot('r1', { identityColor: ACCENT_COLORS.red });
      useLocaleStore.getState().addRobot(localeId, robotA);
      useUIStore.getState().selectRobot(robotA.id);
      const { container: containerA, unmount } = render(<RobotOptionsTab />);
      const rootA = containerA.querySelector('.robot-options') as HTMLElement;
      expect(rootA.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.red);
      const traitStyleA = screen.getByTestId('signature-array-drawer-stub').getAttribute('data-style-a');
      unmount();

      const robotB = makeRobot('r2', { identityColor: ACCENT_COLORS.purple });
      useLocaleStore.getState().addRobot(localeId, robotB);
      useUIStore.getState().selectRobot(robotB.id);
      const { container: containerB } = render(<RobotOptionsTab />);
      const rootB = containerB.querySelector('.robot-options') as HTMLElement;
      expect(rootB.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.purple);
      const traitStyleB = screen.getByTestId('signature-array-drawer-stub').getAttribute('data-style-a');

      expect(rootA.style.getPropertyValue('--color-accent-a')).not.toBe(rootB.style.getPropertyValue('--color-accent-a'));
      expect(traitStyleA).toBe(traitStyleB);
    });
  });

  // Audio Load Budget (plan task 22): the tab owns the store access and the robot id, so it turns the held-off keys into plain
  // per-robot props for the (store-free) sections.
  describe('Audio Load: held-off LFOs for THIS robot', () => {
    function mountRobot() {
      const robot = makeRobot('r1');
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      return render(<RobotOptionsTab />);
    }
    const volumeHeldOff = () => screen.getByTestId('audio-setting-section-stub').getAttribute('data-volume-held-off');
    const heldTargets = () => JSON.parse(screen.getByTestId('signature-array-drawer-stub').getAttribute('data-held-off-targets')!);

    it('passes nothing held off when the list is empty (Full, or the budget not running)', () => {
      mountRobot();
      expect(volumeHeldOff()).toBe('false');
      expect(Object.values(heldTargets()).some(Boolean)).toBe(false);
    });

    it("marks this robot's Volume LFO held off when its key is in the list", () => {
      useAudioStore.setState({ heldOffLfoKeys: ['r1:volume'] });
      mountRobot();
      expect(volumeHeldOff()).toBe('true');
    });

    it("marks this robot's layer LFO targets held off by instance key (robotId:target)", () => {
      useAudioStore.setState({ heldOffLfoKeys: ['r1:layer1.detune', 'r1:layer0.gain'] });
      mountRobot();
      expect(heldTargets()['layer1.detune']).toBe(true);
      expect(heldTargets()['layer0.gain']).toBe(true);
      expect(heldTargets()['layer2.gain']).toBe(false);
    });

    it("ignores another robot's held-off LFOs and global ones", () => {
      useAudioStore.setState({ heldOffLfoKeys: ['r2:volume', 'r2:layer0.gain', 'lpf.Q'] });
      mountRobot();
      expect(volumeHeldOff()).toBe('false');
      expect(Object.values(heldTargets()).some(Boolean)).toBe(false);
    });

    it('updates as soon as the robot is over the cap and again when it clears', () => {
      mountRobot();
      act(() => useAudioStore.setState({ heldOffLfoKeys: ['r1:volume'] }));
      expect(volumeHeldOff()).toBe('true');
      act(() => useAudioStore.setState({ heldOffLfoKeys: [] }));
      expect(volumeHeldOff()).toBe('false');
    });

    it("does not re-render the sections when ANOTHER robot's LFO enters or leaves the held-off list", () => {
      mountRobot();
      const before = {
        audio: renderCounts.audioSettingSection.mock.calls.length,
        signature: renderCounts.signatureArrayDrawer.mock.calls.length,
      };

      act(() => useAudioStore.setState({ heldOffLfoKeys: ['r2:volume'] }));
      act(() => useAudioStore.setState({ heldOffLfoKeys: ['r2:volume', 'r3:layer0.gain', 'lpf.Q'] }));
      act(() => useAudioStore.setState({ heldOffLfoKeys: [] }));

      expect(renderCounts.audioSettingSection.mock.calls.length).toBe(before.audio);
      expect(renderCounts.signatureArrayDrawer.mock.calls.length).toBe(before.signature);
    });

    it("does not even re-render the tab itself for another robot's held-off LFO (a per-robot boolean selector, not the whole list)", () => {
      const robot = makeRobot('r1');
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      const commits = { count: 0 };
      render(
        <Profiler id="tab" onRender={() => { commits.count++; }}>
          <RobotOptionsTab />
        </Profiler>,
      );
      const initial = commits.count;

      act(() => useAudioStore.setState({ heldOffLfoKeys: ['r2:volume'] }));
      act(() => useAudioStore.setState({ heldOffLfoKeys: ['r2:volume', 'r3:layer0.gain'] }));
      act(() => useAudioStore.setState({ heldOffLfoKeys: [] }));

      expect(commits.count).toBe(initial);
    });
  });

  describe('re-render cascade regression (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 6)', () => {
    // The end-to-end proof this whole plan exists for: a single-field edit anywhere in the panel
    // used to re-render all 5 sections, not just the one the user touched (backlog item 27).
    // Mutates the store directly (`updateRobot`), the same way a real slider drag eventually
    // does via `applyDensity`/etc., without invoking the real `regenerateMelody`/AudioEngine
    // machinery those actions also call — this test is about RobotOptionsTab's own re-render
    // wiring, not melody regeneration.
    //
    // RobotDisplaySection is deliberately excluded from the "stayed flat" assertions below — per
    // spec §1.2.3/Task 5, its sole prop is the *entire* `robot` object, which is always a new
    // reference on every edit regardless of which field changed, so it's expected to re-render
    // every time (not one of "the accordions" the reported symptom was about; see Task 5's own
    // tests for the documented limitation in isolation).
    function callCounts() {
      return {
        audioSettingSection: renderCounts.audioSettingSection.mock.calls.length,
        pingControlsDrawer: renderCounts.pingControlsDrawer.mock.calls.length,
        pingContourDrawer: renderCounts.pingContourDrawer.mock.calls.length,
        signatureArrayDrawer: renderCounts.signatureArrayDrawer.mock.calls.length,
      };
    }

    it('re-rendering after a Density-only edit leaves the other 3 accordion-wrapped sections un-re-rendered', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      const countsAfterMount = callCounts();

      act(() => {
        useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicDensity: 91 });
      });

      const countsAfterEdit = callCounts();
      // The edited section re-renders (its own value genuinely changed)...
      expect(countsAfterEdit.pingControlsDrawer).toBeGreaterThan(countsAfterMount.pingControlsDrawer);
      // ...but none of the other 3 accordion-wrapped sections do — this is the cascade this plan fixes.
      expect(countsAfterEdit.audioSettingSection).toBe(countsAfterMount.audioSettingSection);
      expect(countsAfterEdit.pingContourDrawer).toBe(countsAfterMount.pingContourDrawer);
      expect(countsAfterEdit.signatureArrayDrawer).toBe(countsAfterMount.signatureArrayDrawer);
    });

    it('re-rendering after an ADSR-only edit leaves the other 3 accordion-wrapped sections un-re-rendered', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      useUIStore.getState().selectRobot(robot.id);
      render(<RobotOptionsTab />);

      const countsAfterMount = callCounts();

      act(() => {
        useLocaleStore.getState().updateRobot(localeId, robot.id, {
          audioAttributes: { ...robot.audioAttributes, adsr: { attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 } },
        });
      });

      const countsAfterEdit = callCounts();
      expect(countsAfterEdit.pingContourDrawer).toBeGreaterThan(countsAfterMount.pingContourDrawer);
      expect(countsAfterEdit.audioSettingSection).toBe(countsAfterMount.audioSettingSection);
      expect(countsAfterEdit.pingControlsDrawer).toBe(countsAfterMount.pingControlsDrawer);
      expect(countsAfterEdit.signatureArrayDrawer).toBe(countsAfterMount.signatureArrayDrawer);
    });
  });
});
