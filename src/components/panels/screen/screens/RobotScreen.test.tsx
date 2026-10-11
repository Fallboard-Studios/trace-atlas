import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { memo, Profiler, type ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 16 (spec §1.3, §1.4): the robot screen — the avatar column (desk) or
 * the small band (phone) beside SectionTabs over ROBOT_SECTIONS_CONFIG, one section in the DOM at a
 * time. RobotOptionsTab's wiring tests and RobotDisplaySection's column tests moved here.
 */

// A subscribing mock, as the real hook is (useSyncExternalStore over matchMedia): jsdom has no
// matchMedia, which would make every test the phone shell.
const shell = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    current: 'desk' as 'desk' | 'phone',
    set(next: 'desk' | 'phone') {
      this.current = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock('@/components/panels/screen/useShell', async (importOriginal) => {
  const { useSyncExternalStore } = await import('react');
  return {
    ...(await importOriginal<typeof import('@/components/panels/screen/useShell')>()),
    useShell: () => useSyncExternalStore((listener) => shell.subscribe(listener), () => shell.current),
  };
});

// The section components have their own suites; these stubs render probe buttons that call the captured
// callbacks, so a wiring bug (wrong action, wrong argument) still shows here.
vi.mock('@/components/robot/AudioSettingSection', () => ({
  AudioSettingSection: memo((props: {
    value: { audioMode: string; masterVolume: number };
    onAudioModeChange: (mode: string) => void;
    onVolumeChange: (pct: number) => void;
    volumeSwelling?: boolean;
  }) => (
    <div data-testid="audio-setting-section-stub" data-audio-mode={props.value.audioMode} data-master-volume={props.value.masterVolume}>
      <button onClick={() => props.onAudioModeChange('solo')}>probe-audio-mode</button>
      <button onClick={() => props.onVolumeChange(55)}>probe-volume</button>
    </div>
  )),
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
  }) => (
    <div
      data-testid="ping-controls-composition-stub"
      data-density={props.value.rhythmicDensity}
      data-pitch-repeat={props.value.pitchRepeat}
    >
      <button onClick={() => props.onDensityChange(77)}>probe-density</button>
      <button onClick={() => props.onMotifLengthChange(6)}>probe-motif-length</button>
      <button onClick={() => props.onPitchRepeatChange(88)}>probe-pitch-repeat</button>
      <button onClick={() => props.onOctaveMinChange(4)}>probe-octave-min</button>
      <button onClick={() => props.onOctaveMaxChange(6)}>probe-octave-max</button>
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
  SignatureArrayLayer: memo((props: {
    idx: number;
    layer: { type: string };
    lfoLinks?: Record<string, { lane: string | null; depth: number }>;
    onTypeChange: (idx: number, type: string) => void;
    onParamChange: (idx: number, field: string, v: number) => void;
    onLfoFieldChange: (idx: number, target: string, value: { lane: string | null; depth: number }) => void;
  }) => (
    <div data-testid={`signature-array-layer-stub-${props.idx}`} data-type={props.layer.type}>
      <button onClick={() => props.onTypeChange(props.idx, 'sawtooth')}>probe-layer-type-{props.idx}</button>
      <button onClick={() => props.onParamChange(props.idx, 'gain', 0.5)}>probe-layer-gain-{props.idx}</button>
      <button
        onClick={() => {
          const current = props.lfoLinks?.[`layer${props.idx}.gain`] ?? { lane: null, depth: 0 };
          props.onLfoFieldChange(props.idx, `layer${props.idx}.gain`, { ...current, lane: 'a' });
        }}
      >
        probe-layer-lfo-{props.idx}
      </button>
    </div>
  )),
}));

// Captures each schema the real RadioButton receives, keeping its rendering — the company radio's
// schema identity is checked below (RobotDisplaySection's memo tests).
const capturedRadioSchemas = vi.hoisted(() => [] as { id: string }[]);
vi.mock('@/components/ui/controls/RadioButton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/RadioButton')>();
  function RadioButtonSchemaCapture(props: ComponentProps<typeof actual.RadioButton>) {
    capturedRadioSchemas.push(props.schema);
    return <actual.RadioButton {...props} />;
  }
  return { ...actual, RadioButton: RadioButtonSchemaCapture };
});

import { RobotScreen } from './RobotScreen';
import { NavBreadcrumb } from '../nav/NavBreadcrumb';
import { CONTENT, fill, type ContentEntry } from '@/content';
import { useUIStore, type RobotSection, type RobotSubsection } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getTraitColorStyle } from '@/utils/traitColors';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { ROBOT_SELECTION_ROW_SCHEMAS, ACTIVITY_LABELS } from '@/data/robotSelectionConfig';
import { buildCompanyAssignmentSchema } from '@/data/companyConfig';
import { getRobotGem } from '@/components/robot/gem/polygon';
import { gemMotionViewBox } from '@/components/robot/gem/orbiterMotion';
import * as robotOptionsActions from '@/systems/robotOptionsActions';
import * as audioSwells from '@/systems/audioSwells';
import type { Robot, RobotActivity } from '@/types/Robot';
import type { Locale } from '@/types/locale';
import type { Trait } from '@/types/traits';

const localeId = getActiveLocaleId();
const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const LEVELS = human('probe.levels');
const COMPOSITION = human('probe.composition');
const ENVELOPE = human('probe.envelope');
const SOURCE = human('probe.source');
const CORE = human('probe.source.core');
const COMPANION = human('probe.source.companion');
const ACCENT = human('probe.source.accent');

function makeRobot(id = 'r1', overrides: Partial<Robot> = {}): Robot {
  return {
    id,
    name: 'Test Robot',
    identityColor: '#428d95',
    position: { x: 0, y: 0 },
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
    activity: 'working',
    batteryLevel: 82,
    audioMode: 'none',
    job: 'acousticSurvey',
    gemSeed: 20261004,
    rhythmicDensity: 42,
    pitchRepeat: 33,
    ...overrides,
  } as Robot;
}

/** Puts the robot in the locale and selects it, at a section and subsection if given. */
function selectRobot(robot: Robot, section: RobotSection | null = null, subsection: RobotSubsection | null = null) {
  useLocaleStore.getState().addRobot(localeId, robot);
  useUIStore.getState().selectRobot(robot.id);
  useUIStore.getState().setSelectedSection(section);
  useUIStore.getState().setSelectedSubsection(subsection);
}

const sectionRow = (name = 'Test Robot') => screen.getByRole('tablist', { name });
const subRow = () => screen.getByRole('tablist', { name: SOURCE });
const tabNames = (list: HTMLElement) => within(list).getAllByRole('tab').map((t) => t.textContent);
const selectedTab = (list: HTMLElement) => within(list).getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')!;
const pick = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }));
const STUBS = ['audio-setting-section-stub', 'ping-controls-composition-stub', 'ping-contour-drawer-stub', 'signature-array-layer-stub-0', 'signature-array-layer-stub-1', 'signature-array-layer-stub-2'];
/** Every section panel the screen can mount, by its stub's test id. */
const mounted = () => STUBS.filter((id) => screen.queryByTestId(id));
const column = (container: HTMLElement) => container.querySelector('.robot-screen__avatar-column');
const band = (container: HTMLElement) => container.querySelector('.robot-screen__band');
const metaValues = (container: HTMLElement) => [...container.querySelectorAll('.robot-screen__meta-value')].map((el) => el.textContent);

beforeEach(() => {
  shell.set('desk');
  useUIStore.setState(useUIStore.getInitialState(), true);
  useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  capturedRadioSchemas.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  useUIStore.getState().setActiveLocaleLocalTime(null);
  useAudioStore.setState({ soundingRobotIds: [], filterLinksHeldOff: false });
});

describe('RobotScreen — fallbacks', () => {
  it('renders the not-selected prompt when no robot is selected', () => {
    render(<RobotScreen />);
    expect(screen.getByText(human('probe.selectPrompt'))).toBeTruthy();
  });

  it('renders "not found" when selectedRobotId points at a robot that no longer exists', () => {
    useUIStore.getState().selectRobot('gone');
    render(<RobotScreen />);
    expect(screen.getByText(human('probe.notFound'))).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

// Crawford, 2026-10-10 (spec §1.3 amended): each section's intro is back, first in its panel, as an
// expander (IntroPanel `collapsible`) — the headline shows, a More button reveals the rest.
describe('RobotScreen — each section opens with its intro, an expander', () => {
  const SECTIONS: readonly [RobotSection, keyof typeof CONTENT][] = [
    ['volume', 'probe.levels'], ['melody', 'probe.composition'], ['envelope', 'probe.envelope'], ['source', 'probe.source'],
  ];

  it.each(SECTIONS)('%s: %s\'s intro, first in the panel, collapsed until More', (section, key) => {
    selectRobot(makeRobot(), section);
    const { container } = render(<RobotScreen />);
    const panel = container.querySelector('.robot-screen__section') as HTMLElement;
    const intro = panel.firstElementChild as HTMLElement;
    expect(intro.classList.contains('sc-intro-panel')).toBe(true);
    expect(within(intro).getByText((CONTENT[key] as ContentEntry).intro!.lore)).toBeTruthy();
    const body = intro.querySelector('.sc-intro-panel__body') as HTMLElement;
    expect(body.hidden).toBe(true);
    fireEvent.click(within(intro).getByRole('button', { name: fill('ui.intro.more', { name: human(key) }) }));
    expect(body.hidden).toBe(false);
  });

  it('Source\'s intro sits above its sub-tab row, so it stays while the oscillator changes', () => {
    selectRobot(makeRobot(), 'source');
    const { container } = render(<RobotScreen />);
    const intro = container.querySelector('.robot-screen__section > .sc-intro-panel') as HTMLElement;
    expect(intro.compareDocumentPosition(subRow()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(intro).getByRole('button'));
    pick(COMPANION);
    expect(within(intro).getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });

  it('exactly one intro on the screen at a time: the open section\'s', () => {
    selectRobot(makeRobot(), 'envelope');
    const { container } = render(<RobotScreen />);
    expect(container.querySelectorAll('.sc-intro-panel')).toHaveLength(1);
  });
});

describe('RobotScreen — the section tabs (spec §1.3)', () => {
  it("opens on Source with Core Oscillator's sub-tab, and only that panel is in the DOM", () => {
    selectRobot(makeRobot());
    render(<RobotScreen />);
    expect(selectedTab(sectionRow()).textContent).toBe(SOURCE);
    expect(selectedTab(subRow()).textContent).toBe(CORE);
    expect(mounted()).toEqual(['signature-array-layer-stub-0']);
  });

  it("the section row is Levels, Composition, Envelope, Source, named after the robot, each in its section's trait", () => {
    selectRobot(makeRobot());
    render(<RobotScreen />);
    expect(tabNames(sectionRow())).toEqual([LEVELS, COMPOSITION, ENVELOPE, SOURCE]);
    const traits: Trait[] = ['output', 'composition', 'timeSpace', 'spectral'];
    within(sectionRow()).getAllByRole('tab').forEach((tab, i) => {
      expect(tab.style.getPropertyValue('--color-accent'), traits[i]).toBe((getTraitColorStyle(traits[i]) as Record<string, string>)['--color-accent']);
    });
  });

  it("a robot with no name names the row by its id, as the tree's rows did", () => {
    selectRobot(makeRobot('r7', { name: '' }));
    render(<RobotScreen />);
    expect(sectionRow('r7')).toBeTruthy();
  });

  it('only Source has a sub-tab row: Core, Companion and Accent Oscillator, in its trait', () => {
    selectRobot(makeRobot());
    render(<RobotScreen />);
    expect(tabNames(subRow())).toEqual([CORE, COMPANION, ACCENT]);
    const spectral = (getTraitColorStyle('spectral') as Record<string, string>)['--color-accent'];
    within(subRow()).getAllByRole('tab').forEach((tab) => expect(tab.style.getPropertyValue('--color-accent')).toBe(spectral));
    for (const name of [LEVELS, COMPOSITION, ENVELOPE]) {
      pick(name);
      expect(screen.getAllByRole('tablist'), name).toHaveLength(1);
    }
  });

  it.each<[string, string]>([
    [LEVELS, 'audio-setting-section-stub'],
    [COMPOSITION, 'ping-controls-composition-stub'],
    [ENVELOPE, 'ping-contour-drawer-stub'],
  ])('picking %s writes the section, clears the sub-tab and mounts only its panel', (name, stub) => {
    selectRobot(makeRobot(), 'source', 'coaxialOscillator');
    render(<RobotScreen />);
    pick(name);
    expect(useUIStore.getState().selectedSection).toBe(name === LEVELS ? 'volume' : name === COMPOSITION ? 'melody' : 'envelope');
    expect(useUIStore.getState().selectedSubsection).toBeNull();
    expect(mounted()).toEqual([stub]);
  });

  it('a sub-tab pick writes the subsection and swaps the oscillator layer', () => {
    selectRobot(makeRobot());
    render(<RobotScreen />);
    pick(ACCENT);
    expect(useUIStore.getState().selectedSubsection).toBe('harmonicOscillator');
    expect(mounted()).toEqual(['signature-array-layer-stub-2']);
  });

  it('leaving Source and coming back opens Core Oscillator again', () => {
    selectRobot(makeRobot());
    render(<RobotScreen />);
    pick(COMPANION);
    pick(ENVELOPE);
    pick(SOURCE);
    expect(selectedTab(subRow()).textContent).toBe(CORE);
    expect(mounted()).toEqual(['signature-array-layer-stub-0']);
  });

  it.each<[RobotSection | null, RobotSubsection | null, string]>([
    ['volume', 'coaxialOscillator', 'audio-setting-section-stub'],
    ['melody', 'frequency', 'ping-controls-composition-stub'],
    ['source', 'rhythm', 'signature-array-layer-stub-0'],
    [null, 'harmonicOscillator', 'signature-array-layer-stub-2'],
  ])('a stored %s / %s shows %s, without a store write', (section, subsection, stub) => {
    selectRobot(makeRobot(), section, subsection);
    render(<RobotScreen />);
    expect(mounted()).toEqual([stub]);
    expect(useUIStore.getState().selectedSection).toBe(section);
    expect(useUIStore.getState().selectedSubsection).toBe(subsection);
  });

  it('switching to another robot opens it on its default tab', () => {
    const r1 = makeRobot('r1');
    const r2 = makeRobot('r2', { name: 'Other' });
    useLocaleStore.getState().addRobot(localeId, r2);
    selectRobot(r1);
    render(<RobotScreen />);
    pick(ENVELOPE);
    act(() => useUIStore.getState().selectRobot('r2'));
    expect(selectedTab(sectionRow('Other')).textContent).toBe(SOURCE);
    expect(mounted()).toEqual(['signature-array-layer-stub-0']);
  });

  // The section intros came back as expanders (Crawford, 2026-10-10); there is still no accordion.
  it('has no accordion: the tabs and the intro expanders are the only chrome over the panels (spec §1.3)', () => {
    selectRobot(makeRobot());
    const { container } = render(<RobotScreen />);
    expect(container.querySelector('.sc-accordion')).toBeNull();
  });
});

describe('RobotScreen — each section reaches the robot as before (moved from RobotOptionsTab)', () => {
  describe('Levels (AudioSettingSection)', () => {
    it("derives its value from the robot's audioMode / masterVolume", () => {
      selectRobot(makeRobot('r1', { audioMode: 'mute', masterVolume: 0.42 }), 'volume');
      render(<RobotScreen />);
      const stub = screen.getByTestId('audio-setting-section-stub');
      expect(stub.getAttribute('data-audio-mode')).toBe('mute');
      expect(stub.getAttribute('data-master-volume')).toBe('0.42');
    });

    it('wires onAudioModeChange to applyAudioMode', () => {
      const robot = makeRobot();
      selectRobot(robot, 'volume');
      const spy = vi.spyOn(robotOptionsActions, 'applyAudioMode').mockImplementation(() => {});
      render(<RobotScreen />);
      fireEvent.click(screen.getByText('probe-audio-mode'));
      expect(spy).toHaveBeenCalledWith(robot, localeId, 'solo');
    });

    it('wires onVolumeChange to applyVolume, interrupting a Volume swell first', () => {
      const robot = makeRobot();
      selectRobot(robot, 'volume');
      const apply = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
      render(<RobotScreen />);
      fireEvent.click(screen.getByText('probe-volume'));
      expect(apply).toHaveBeenCalledWith(robot, localeId, 55);
      expect(cancel).toHaveBeenCalledWith(robot.id, 'volume');
    });
  });

  describe('Composition (PingControlsCompositionSection)', () => {
    it('derives its value from the robot', () => {
      selectRobot(makeRobot(), 'melody');
      render(<RobotScreen />);
      const stub = screen.getByTestId('ping-controls-composition-stub');
      expect(stub.getAttribute('data-density')).toBe('42');
      expect(stub.getAttribute('data-pitch-repeat')).toBe('33');
    });

    it.each([
      ['probe-density', 'applyDensity', 77],
      ['probe-motif-length', 'applyMotifLength', 6],
      ['probe-pitch-repeat', 'applyPitchRepeat', 88],
      ['probe-octave-min', 'applyOctaveMin', 4],
      ['probe-octave-max', 'applyOctaveMax', 6],
      ['probe-note-variance', 'applyNoteVariance', 0],
    ] as const)('%s calls %s', (button, action, value) => {
      const robot = makeRobot();
      selectRobot(robot, 'melody');
      const spy = vi.spyOn(robotOptionsActions, action).mockImplementation(() => {});
      render(<RobotScreen />);
      fireEvent.click(screen.getByText(button));
      expect(spy).toHaveBeenCalledWith(robot, localeId, value);
    });
  });

  describe('Envelope (PingContourDrawer)', () => {
    it("derives its value from audioAttributes.adsr and wires onChange to applyAdsr", () => {
      const robot = makeRobot();
      selectRobot(robot, 'envelope');
      const spy = vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      render(<RobotScreen />);
      expect(screen.getByTestId('ping-contour-drawer-stub').getAttribute('data-attack')).toBe('0.01');
      fireEvent.click(screen.getByText('probe-adsr'));
      expect(spy).toHaveBeenCalledWith(robot, localeId, { attack: 0.9, decay: 0.1, sustain: 0.5, release: 0.2 });
    });

    it('an ADSR edit interrupts a swell on exactly the changed fields', () => {
      selectRobot(makeRobot(), 'envelope');
      vi.spyOn(robotOptionsActions, 'applyAdsr').mockImplementation(() => {});
      const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
      render(<RobotScreen />);
      fireEvent.click(screen.getByText('probe-adsr')); // decay stays 0.1
      expect(cancel).toHaveBeenCalledWith('r1', 'adsr.attack');
      expect(cancel).toHaveBeenCalledWith('r1', 'adsr.sustain');
      expect(cancel).toHaveBeenCalledWith('r1', 'adsr.release');
      expect(cancel).not.toHaveBeenCalledWith('r1', 'adsr.decay');
    });
  });

  describe('Source (SignatureArrayLayer)', () => {
    it.each([
      ['baselineOscillator', 0, 'sine'],
      ['coaxialOscillator', 1, 'square'],
      ['harmonicOscillator', 2, 'triangle'],
    ] as const)('%s is bound to layer %i', (subsection, idx, type) => {
      selectRobot(makeRobot(), 'source', subsection);
      render(<RobotScreen />);
      expect(screen.getByTestId(`signature-array-layer-stub-${idx}`).getAttribute('data-type')).toBe(type);
    });

    it('a layer param edit goes to applyLayersContinuous, keeping the other layers, and interrupts its swell', () => {
      const robot = makeRobot();
      selectRobot(robot, 'source', 'coaxialOscillator');
      const apply = vi.spyOn(robotOptionsActions, 'applyLayersContinuous').mockImplementation(() => {});
      const cancel = vi.spyOn(audioSwells, 'cancelSwellForRobotAttribute');
      render(<RobotScreen />);
      fireEvent.click(screen.getByText('probe-layer-gain-1'));
      expect(apply).toHaveBeenCalledWith(robot, localeId, [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
        { type: 'square', gain: 0.5, detune: 5, phase: 10, pulseWidth: 0.4 },
        { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
      ]);
      expect(cancel).toHaveBeenCalledWith(robot.id, 'layer1.gain');
    });

    it('a layer type change goes to applyLayersStructural', () => {
      const robot = makeRobot();
      selectRobot(robot, 'source', 'harmonicOscillator');
      const apply = vi.spyOn(robotOptionsActions, 'applyLayersStructural').mockImplementation(() => {});
      render(<RobotScreen />);
      fireEvent.click(screen.getByText('probe-layer-type-2'));
      expect(apply).toHaveBeenCalledWith(robot, localeId, [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
        { type: 'square', gain: 0.8, detune: 5, phase: 10, pulseWidth: 0.4 },
        { type: 'sawtooth', gain: 0.6, detune: -5, phase: 20 },
      ]);
    });

    it("a layer's LFO lane change goes to applyLayerLfoLink", () => {
      const robot = makeRobot();
      selectRobot(robot, 'source', 'coaxialOscillator');
      const spy = vi.spyOn(robotOptionsActions, 'applyLayerLfoLink').mockImplementation(() => {});
      render(<RobotScreen />);
      fireEvent.click(screen.getByText('probe-layer-lfo-1'));
      expect(spy).toHaveBeenCalledWith(robot, localeId, 'layer1.gain', { lane: 'a', depth: 0 });
    });

    it('a robot with fewer layers renders no panel for a missing one', () => {
      const robot = makeRobot();
      selectRobot({ ...robot, audioAttributes: { ...robot.audioAttributes, layers: [robot.audioAttributes.layers![0]] } }, 'source', 'harmonicOscillator');
      render(<RobotScreen />);
      expect(mounted()).toEqual([]);
    });

    it('renders no held-off note while the Audio Load dial holds filter links off (robot layers never are)', () => {
      useAudioStore.setState({ filterLinksHeldOff: true });
      selectRobot(makeRobot(), 'source');
      render(<RobotScreen />);
      expect(screen.queryByText('Held off by Audio Load')).toBeNull();
    });
  });
});

describe('RobotScreen — colour', () => {
  it("scopes the screen to the robot's identity colour", () => {
    selectRobot(makeRobot('r1', { identityColor: '#68cb97' }));
    const { container } = render(<RobotScreen />);
    const root = container.querySelector('.robot-screen') as HTMLElement;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe('#68cb97');
    expect(root.style.getPropertyValue('--color-accent-b')).toBe('#68cb97');
  });

  it.each<[RobotSection, Trait, string]>([
    ['volume', 'output', 'audio-setting-section-stub'],
    ['melody', 'composition', 'ping-controls-composition-stub'],
    ['envelope', 'timeSpace', 'ping-contour-drawer-stub'],
    ['source', 'spectral', 'signature-array-layer-stub-0'],
  ])("%s's panel sits in its trait (%s), as its accordion coloured it", (section, trait, stub) => {
    selectRobot(makeRobot(), section);
    const { container } = render(<RobotScreen />);
    const wrapper = container.querySelector('.robot-screen__section') as HTMLElement;
    const expected = getTraitColorStyle(trait) as Record<string, string>;
    expect(wrapper.style.getPropertyValue('--color-accent-a')).toBe(expected['--color-accent-a']);
    expect(wrapper.style.getPropertyValue('--color-accent-b')).toBe(expected['--color-accent-b']);
    expect(wrapper.contains(screen.getByTestId(stub))).toBe(true);
  });
});

// Moved from RobotDisplaySection.test.tsx: the column is that component's content, on the desk shell.
describe('RobotScreen — the avatar column (desk shell)', () => {
  it("draws the robot's seeded gem as the avatar, framed to its motion canvas at scale 1", () => {
    let seed = 0;
    while (getRobotGem(seed).widthFactor !== 2) seed++;
    selectRobot(makeRobot('r1', { gemSeed: seed }));
    const { container } = render(<RobotScreen />);
    const avatar = column(container)!.querySelector('svg.robot-screen__gem')!;
    expect(avatar.getAttribute('viewBox')).toBe(gemMotionViewBox(getRobotGem(seed)));
    expect(avatar.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(avatar.querySelector('g.gem')!.getAttribute('transform')).toContain('scale(1)');
    const quads = [...avatar.querySelectorAll('.gem__top .gem__facets')].flatMap((p) => p.getAttribute('d')!.split('Z').filter(Boolean));
    expect(quads).toHaveLength(getRobotGem(seed).top.pts.length);
  });

  it('the avatar is the avatar render context: halo and ripple under avatar ids, a docked orbiter, both Mids', () => {
    selectRobot(makeRobot());
    const { container } = render(<RobotScreen />);
    const avatar = column(container)!;
    expect(avatar.querySelector('ellipse.gem__halo')!.getAttribute('fill')).toBe('url(#halo-avatar-r1)');
    expect(avatar.querySelector('.gem__ripple')!.getAttribute('fill')).toBe('url(#ripple-avatar-r1)');
    expect(avatar.querySelector('.gem__orbiter')).not.toBeNull();
    expect(avatar.querySelector('.gem__mid--left')).not.toBeNull();
    expect(avatar.querySelector('.gem__mid--right')).not.toBeNull();
  });

  it('ignores daylight: the same fill at noon and midnight', () => {
    selectRobot(makeRobot());
    useUIStore.getState().setActiveLocaleLocalTime(12);
    const { container: noon, unmount } = render(<RobotScreen />);
    const noonFill = noon.querySelector('.robot-screen__gem .gem__top .gem__face')!.getAttribute('fill');
    unmount();
    useUIStore.getState().setActiveLocaleLocalTime(0);
    const { container: midnight } = render(<RobotScreen />);
    expect(noonFill).not.toBeNull();
    expect(midnight.querySelector('.robot-screen__gem .gem__top .gem__face')!.getAttribute('fill')).toBe(noonFill);
  });

  it("heads the column with the robot's name, falling back to its id", () => {
    selectRobot(makeRobot('r1', { name: 'Tidal Wisp' }));
    const { container, unmount } = render(<RobotScreen />);
    expect(within(column(container) as HTMLElement).getByRole('heading', { name: 'Tidal Wisp' })).toBeTruthy();
    unmount();
    useUIStore.getState().selectRobot('r9');
    useLocaleStore.getState().addRobot(localeId, makeRobot('r9', { name: '' }));
    const { container: c2 } = render(<RobotScreen />);
    expect(within(column(c2) as HTMLElement).getByRole('heading', { name: 'r9' })).toBeTruthy();
  });

  it('shows the read-only meta as four wells — job, docking, phase, emission — each under its caption, none interactive', () => {
    selectRobot(makeRobot());
    const { container } = render(<RobotScreen />);
    const wells = [...container.querySelectorAll('.robot-screen__meta > .robot-screen__well')];
    expect(wells).toHaveLength(4);
    expect(metaValues(container)).toEqual(['Acoustic Survey', 'Active', 'Working', 'Emitting']);
    const captions = wells.map((w) => w.querySelector('.sc-dual-label__lore')!.textContent);
    expect(captions).toEqual([
      ROBOT_SELECTION_ROW_SCHEMAS.job.loreLabel,
      ROBOT_SELECTION_ROW_SCHEMAS.docking.loreLabel,
      ROBOT_SELECTION_ROW_SCHEMAS.activity.loreLabel,
      ROBOT_SELECTION_ROW_SCHEMAS.status.loreLabel,
    ]);
    container.querySelectorAll('.robot-screen__meta-value').forEach((el) => {
      expect(el.closest('button, input, [role="button"], [role="radio"], [role="switch"]')).toBeNull();
    });
  });

  it.each(['charging', 'exiting', 'transit', 'working', 'waiting', 'returning', 'entering'] as const satisfies readonly RobotActivity[])(
    'reads the %s activity',
    (activity) => {
      selectRobot(makeRobot('r1', { activity }));
      const { container } = render(<RobotScreen />);
      expect(metaValues(container)[2]).toBe(ACTIVITY_LABELS[activity].humanLabel);
    },
  );

  it('follows a robot change in the store (a new activity)', () => {
    selectRobot(makeRobot('r1', { activity: 'returning', docking: 'recalled' }));
    const { container } = render(<RobotScreen />);
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { activity: 'entering' }));
    expect(metaValues(container)[2]).toBe(ACTIVITY_LABELS.entering.humanLabel);
  });

  it('reads "Unassigned" with no job, and the Maintenance label for that job', () => {
    selectRobot(makeRobot('r1', { job: undefined, docking: 'docked' }));
    const { container, unmount } = render(<RobotScreen />);
    expect(metaValues(container)[0]).toBe('Unassigned');
    unmount();
    useLocaleStore.getState().updateRobot(localeId, 'r1', { job: 'maintenance' });
    const { container: c2 } = render(<RobotScreen />);
    expect(metaValues(c2)[0]).toBe('Maintenance');
  });

  describe('the emission well', () => {
    it('reads Emitting for an audible robot and Disabled for a muted one', () => {
      selectRobot(makeRobot('r1', { audioMode: 'mute' }));
      const { container } = render(<RobotScreen />);
      expect(metaValues(container)[3]).toBe('Disabled');
      act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { audioMode: 'none' }));
      expect(metaValues(container)[3]).toBe('Emitting');
    });

    it('reads Standing by while the Audio Load budget holds it back, and Emitting once admitted', () => {
      selectRobot(makeRobot());
      useAudioStore.setState({ soundingRobotIds: ['other'] });
      const { container } = render(<RobotScreen />);
      expect(metaValues(container)[3]).toBe('Standing by');
      act(() => useAudioStore.setState({ soundingRobotIds: ['other', 'r1'] }));
      expect(metaValues(container)[3]).toBe('Emitting');
    });

    it('flips to Disabled while another robot is soloed, and back', () => {
      useLocaleStore.getState().addRobot(localeId, makeRobot('r2'));
      selectRobot(makeRobot());
      const { container } = render(<RobotScreen />);
      act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { audioMode: 'solo' }));
      expect(metaValues(container)[3]).toBe('Disabled');
      act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { audioMode: 'none' }));
      expect(metaValues(container)[3]).toBe('Emitting');
    });
  });

  it('shows the battery as a read-only readout, rounded to a whole percent, under its own caption', () => {
    selectRobot(makeRobot('r1', { batteryLevel: 81.6 }));
    const { container } = render(<RobotScreen />);
    const readout = column(container)!.querySelector('[data-readonly="true"]')!;
    expect(readout.getAttribute('role')).toBe('status');
    expect(readout.textContent).toContain('82%');
    expect(within(column(container) as HTMLElement).getByText(CONTENT['probe.battery'].human)).toBeTruthy();
    expect(within(column(container) as HTMLElement).queryByRole('slider')).toBeNull();
  });

  it('offers no job reassignment or docking override', () => {
    selectRobot(makeRobot());
    render(<RobotScreen />);
    expect(screen.queryByRole('combobox', { name: /job/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /docked|undocking|active|recalled/i })).toBeNull();
  });

  describe('the company radio', () => {
    it('selects Freelance for an unassigned robot and the company for a member', () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
      selectRobot(makeRobot('r1', { companyId: undefined }));
      const { unmount } = render(<RobotScreen />);
      expect(screen.getByRole('radio', { name: 'Freelance' }).getAttribute('aria-checked')).toBe('true');
      unmount();
      useLocaleStore.getState().assignRobotToCompany(localeId, 'r1', 'c1');
      render(<RobotScreen />);
      expect(screen.getByRole('radio', { name: 'Iron Consortium' }).getAttribute('aria-checked')).toBe('true');
    });

    it("picking a company calls assignRobotToCompany with its id; Freelance with null", () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
      selectRobot(makeRobot('r1', { companyId: undefined }));
      const assign = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      render(<RobotScreen />);
      fireEvent.click(screen.getByRole('radio', { name: 'Iron Consortium' }));
      expect(assign).toHaveBeenCalledWith(localeId, 'r1', 'c1');
      fireEvent.click(screen.getByRole('radio', { name: 'Freelance' }));
      expect(assign).toHaveBeenLastCalledWith(localeId, 'r1', null);
    });

    it('keeps its schema across a robot change while the companies have not changed, and rebuilds it when they do', () => {
      selectRobot(makeRobot());
      render(<RobotScreen />);
      const companyId = buildCompanyAssignmentSchema([]).id;
      const companySchemas = () => capturedRadioSchemas.filter((s) => s.id === companyId);
      act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 50 }));
      const afterTick = companySchemas();
      expect(afterTick.length).toBeGreaterThanOrEqual(2);
      expect(afterTick.at(-1)).toBe(afterTick[0]);
      act(() => useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] }));
      expect(companySchemas().at(-1)).not.toBe(afterTick[0]);
    });
  });

  it('the column has no band, and the band no column', () => {
    selectRobot(makeRobot());
    const { container } = render(<RobotScreen />);
    expect(column(container)).not.toBeNull();
    expect(band(container)).toBeNull();
  });
});

describe('RobotScreen — the phone band (spec §1.4: small form only)', () => {
  beforeEach(() => {
    shell.set('phone');
  });

  it('shows the gem, the name and one status line: job · docking · phase · emission · battery', () => {
    selectRobot(makeRobot('r1', { name: 'Tidal Wisp' }));
    const { container } = render(<RobotScreen />);
    const b = band(container) as HTMLElement;
    expect(b).not.toBeNull();
    expect(b.querySelector('svg.robot-screen__gem .gem')).not.toBeNull();
    expect(within(b).getByRole('heading', { name: 'Tidal Wisp' })).toBeTruthy();
    expect(b.querySelector('.robot-screen__status-line')!.textContent).toBe(
      fill('probe.band.statusLine', { job: 'Acoustic Survey', dockingState: 'Active', activity: 'Working', status: 'Emitting', battery: `82${CONTENT['probe.battery'].unit}` }),
    );
  });

  it('carries none of the column: no meta wells, no battery readout, no company radio', () => {
    selectRobot(makeRobot());
    const { container } = render(<RobotScreen />);
    expect(column(container)).toBeNull();
    expect(container.querySelector('.robot-screen__well')).toBeNull();
    expect(container.querySelector('[data-readonly="true"]')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Freelance' })).toBeNull();
  });

  it('follows the robot: a battery tick and a mute update the line', () => {
    selectRobot(makeRobot());
    const { container } = render(<RobotScreen />);
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 40.4, audioMode: 'mute' }));
    const line = container.querySelector('.robot-screen__status-line')!.textContent!;
    expect(line).toContain(`40${CONTENT['probe.battery'].unit}`);
    expect(line).toContain('Disabled');
  });

  it('keeps the same tabs and panels as the desk', () => {
    selectRobot(makeRobot());
    render(<RobotScreen />);
    expect(tabNames(sectionRow())).toEqual([LEVELS, COMPOSITION, ENVELOPE, SOURCE]);
    expect(mounted()).toEqual(['signature-array-layer-stub-0']);
  });

  it('a shell change swaps the band for the column and back, keeping the open tab', () => {
    selectRobot(makeRobot(), 'envelope');
    const { container } = render(<RobotScreen />);
    act(() => shell.set('desk'));
    expect(column(container)).not.toBeNull();
    expect(band(container)).toBeNull();
    act(() => shell.set('phone'));
    expect(band(container)).not.toBeNull();
    expect(mounted()).toEqual(['ping-contour-drawer-stub']);
  });
});

describe('RobotScreen — re-render discipline', () => {
  it("another robot's battery tick does not re-render the screen", () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r2'));
    selectRobot(makeRobot());
    let renders = 0;
    render(
      <Profiler id="robot" onRender={() => renders++}>
        <RobotScreen />
      </Profiler>,
    );
    const before = renders;
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r2', { batteryLevel: 10 }));
    expect(renders).toBe(before);
  });
});

describe('RobotScreen — the breadcrumb names the open tab (Root / Probes / <robot> / <section>)', () => {
  it('follows each pick', () => {
    selectRobot(makeRobot('r1', { name: 'Tidal Wisp' }));
    useUIStore.getState().setActiveHubTile('robots');
    render(
      <>
        <RobotScreen />
        <NavBreadcrumb />
      </>,
    );
    const crumb = () => screen.getByRole('navigation', { name: human('nav.breadcrumb') }).textContent;
    const path = (section: string) => [human('nav.root'), human('probe.root'), 'Tidal Wisp', section].join(' / ');
    expect(crumb()).toBe(path(SOURCE));
    pick(LEVELS);
    expect(crumb()).toBe(path(LEVELS));
    pick(COMPOSITION);
    expect(crumb()).toBe(path(COMPOSITION));
  });
});

const here = dirname(fileURLToPath(import.meta.url));

describe('RobotScreen — source and CSS', () => {
  const src = readFileSync(resolve(here, 'RobotScreen.tsx'), 'utf8');
  const css = readFileSync(resolve(here, 'RobotScreen.css'), 'utf8');

  it('imports none of the stacked-scroll machinery', () => {
    expect(src).not.toMatch(/accordionSync|sectionRefs|viewFade|useSectionObserver|useAccordionOpenState|RobotSectionAccordionStack/);
  });

  it('carries no copy literal of its own', () => {
    expect(src).not.toMatch(/(loreLabel|humanLabel|loreDescription|humanDescription|label)\s*[:=]\s*['"`]/);
    expect(src).not.toMatch(/>[A-Za-z][^<{]*</);
  });

  it('the desk column is 400 px wide, a custom property, never a magic number in JSX (spec §4)', () => {
    expect(getCssRuleBody(css, '.robot-screen')).toMatch(/--avatar-column-width:\s*400px/);
    expect(src).not.toMatch(/400/);
  });

  // Crawford, 2026-10-10: at 1024 px the controls' side-by-side rows were cramped. The controls get
  // first claim on 560 px; the column takes what is left, between 200 and 400 px.
  it('reserves 560 px for the controls and gives the column the rest, 200 to 400 px', () => {
    const root = getCssRuleBody(css, '.robot-screen')!;
    expect(root).toMatch(/--controls-column-reserve:\s*560px/);
    expect(root).toMatch(/--avatar-column-min:\s*200px/);
    expect(getCssRuleBody(css, '.robot-screen--desk')).toMatch(
      /grid-template-columns:\s*clamp\(var\(--avatar-column-min\), calc\(100% - var\(--controls-column-reserve\) - var\(--spacing-lg\)\), var\(--avatar-column-width\)\) minmax\(0, 1fr\);/,
    );
  });

  it('the column keeps clear of its own scrollbar', () => {
    // Its own rule, not the shared `…__avatar-column, …__controls` scroll rule before it.
    const own = [...css.matchAll(/(?:^|\n)\.robot-screen--desk > \.robot-screen__avatar-column \{([^}]*)\}/g)].map((m) => m[1]).join('');
    expect(own).toMatch(/padding-right:\s*var\(--spacing-sm\)/);
  });

  it('the meta wells sit two to a row where the column has room, one where it does not (never three)', () => {
    expect(getCssRuleBody(css, '.robot-screen__meta')).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit, minmax\(max\(120px, calc\(\(100% - var\(--spacing-sm\)\) \/ 2\)\), 1fr\)\);/,
    );
  });

  it('the phone band sticks to the top and draws the 72 × 58 gem; there is no expanded form', () => {
    const bandBody = getCssRuleBody(css, '.robot-screen__band')!;
    expect(bandBody).toMatch(/position:\s*sticky/);
    const gem = getCssRuleBody(css, '.robot-screen__band .robot-screen__gem')!;
    expect(gem).toMatch(/width:\s*72px/);
    expect(gem).toMatch(/height:\s*58px/);
    expect(`${src}\n${css}`).not.toMatch(/band--(big|expanded|large)|\.big\b/);
  });

  it("the band sticks at the scroller's edge, not inside its padding (where the controls showed through)", () => {
    const consoleCss = readFileSync(resolve(here, '../console/ConsolePanel.css'), 'utf8');
    const padding = getCssRuleBody(consoleCss, '.console-panel__content')!.match(/padding:\s*(var\(--[a-z-]+\))/)![1];
    expect(getCssRuleBody(css, '.robot-screen__band')).toMatch(new RegExp(`top:\\s*calc\\(-1 \\* ${padding.replace(/[()]/g, '\\$&')}\\)`));
  });

  it('the status line wraps rather than cutting off the emission and the battery', () => {
    const line = getCssRuleBody(css, '.robot-screen__status-line')!;
    expect(line).not.toMatch(/nowrap|ellipsis/);
  });

  it('the desk gem is the first thing to give way in a short column, down to 120 px', () => {
    const gem = getCssRuleBody(css, '.robot-screen__avatar-column .robot-screen__gem')!;
    expect(gem).toMatch(/flex:\s*0 1 auto/);
    expect(gem).toMatch(/height:\s*300px/);
    expect(gem).toMatch(/min-height:\s*120px/);
  });
});

// The grep gate, kept as a test (as Task 9's is). RobotSectionAccordionStack went with its last consumer,
// CompanyOptionsSection, when Task 23 made that the company screen's section panels.
describe('RobotOptionsTab, RobotDisplaySection and RobotSectionAccordionStack are deleted', () => {
  const srcRoot = resolve(here, '../../../..');
  const DELETED = [
    'components/panels/screen/console/RobotOptionsTab',
    'components/robot/RobotDisplaySection',
    'components/panels/screen/nav/RobotSectionAccordionStack',
  ];

  it.each(DELETED)('%s is gone, with its stylesheet and tests', (module) => {
    for (const ext of ['.ts', '.tsx', '.css', '.test.ts', '.test.tsx']) {
      expect(existsSync(join(srcRoot, module + ext)), module + ext).toBe(false);
    }
  });

  it('nothing under src/ imports or mocks one', () => {
    const importOf = /(from|import|vi\.mock\()\s*['"][^'"]*\/(RobotOptionsTab|RobotDisplaySection|RobotSectionAccordionStack)(\.css)?['"]/;
    const importers = (readdirSync(srcRoot, { recursive: true }) as string[])
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => importOf.test(readFileSync(join(srcRoot, file), 'utf8')));
    expect(importers).toEqual([]);
  });
});
