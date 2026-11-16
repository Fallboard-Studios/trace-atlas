import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

import { FleetParamsScreen } from './FleetParamsScreen';
import { NavBreadcrumb } from '../nav/NavBreadcrumb';
import { FLEET_PARAMS_SUBSECTIONS, back, openFleetParamsAt, selectBranch, selectEntity, takeArrivalFocus } from '../nav/navActions';
import { CONTENT, fill, labels, type ContentEntry } from '@/content';
import { useUIStore, type FleetParamsGroup, type SelectedFleetParamsEffect } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { laneTitle } from '@/data/lfoConfig';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { LfoLaneId } from '@/types/lfo';
import type { Trait } from '@/types/traits';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 15 (spec §1.3, §1.4, §1.10): Fleet Params as one collapsible intro
 * over section tabs, one section in the DOM at a time. The lane titles follow the shell, so useShell is
 * mocked: desk unless a test says phone (jsdom has no matchMedia, which would make every test phone).
 */
// A subscribing mock, as the real hook is (useSyncExternalStore over matchMedia): a memoized row
// re-reads it on a change, not only when its parent re-renders.
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

// The panels have their own suites (AudioRigDrawer / AudioRigEffectPanel / LfoBankLanePanel tests);
// this file is about which one the screen mounts, and when.
vi.mock('../console/AudioRigDrawer', () => ({
  AudioRigDrawer: () => <div data-testid="audio-rig-drawer-stub" />,
  AudioRigEffectPanel: ({ effectKey }: { effectKey: string }) => <div data-testid="audio-rig-effect-panel-stub" data-effect-key={effectKey} />,
}));
vi.mock('../console/LfoBankLanePanel', () => ({
  LfoBankLanePanel: ({ lane }: { lane: string }) => <div data-testid="lfo-bank-lane-panel-stub" data-lane={lane} />,
}));
vi.mock('../console/AudioLoadPanel', () => ({
  AudioLoadPanel: () => <div data-testid="audio-load-panel-stub" />,
}));

const UI_INITIAL = useUIStore.getInitialState();
const AUDIO_INITIAL = useAudioStore.getState();

const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const GROUPS: readonly [FleetParamsGroup, keyof typeof CONTENT, Trait][] = [
  ['world', 'fleet.world', 'composition'],
  ['lfoBank', 'fleet.lfoBank', 'timeSpace'],
  ['eqFilters', 'fleet.eqFilters', 'spectral'],
  ['timeSpace', 'fleet.timeSpace', 'timeSpace'],
  ['colour', 'fleet.colour', 'colour'],
  ['modulation', 'fleet.modulation', 'spectral'],
  ['output', 'fleet.output', 'output'],
];
const LANES: readonly LfoLaneId[] = ['a', 'b', 'c', 'd'];

const sectionRow = () => screen.getByRole('tablist', { name: human('fleet.root') });
const subRow = (group: keyof typeof CONTENT) => screen.getByRole('tablist', { name: human(group) });
const tabNames = (list: HTMLElement) => within(list).getAllByRole('tab').map((t) => t.textContent);
const selectedTab = (list: HTMLElement) => within(list).getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')!;
const pick = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

const lanePanels = () => screen.queryAllByTestId('lfo-bank-lane-panel-stub');
const effectPanels = () => screen.queryAllByTestId('audio-rig-effect-panel-stub');
const audioLoadPanels = () => screen.queryAllByTestId('audio-load-panel-stub');
/** Pacing's panel is the screen's own; the intensity drawer stub inside it marks it. */
const pacingPanels = () => screen.queryAllByTestId('audio-rig-drawer-stub');
/** Every panel the screen can mount, whatever its kind. */
const mountedPanels = () => [...lanePanels(), ...effectPanels(), ...pacingPanels(), ...audioLoadPanels()];

beforeEach(() => {
  shell.set('desk');
  useUIStore.setState(UI_INITIAL, true);
  useUIStore.setState({ activeHubTile: 'audioRig' });
  useAudioStore.setState(AUDIO_INITIAL, true);
});

describe('FleetParamsScreen — the default view', () => {
  // docs/specs/CONTENT_LAYOUT.md assumption 8: the screen opens on World > Pacing.
  it("opens on World at Pacing, with only Pacing's panel in the DOM", () => {
    render(<FleetParamsScreen />);
    expect(selectedTab(sectionRow()).textContent).toBe(human('fleet.world'));
    expect(selectedTab(subRow('fleet.world')).textContent).toBe(human('fleet.pacing'));
    expect(mountedPanels()).toHaveLength(1);
    expect(pacingPanels()).toHaveLength(1);
    expect(screen.getByRole('slider', { name: /tempo/i })).toBeTruthy();
  });

  it('the section row is the seven groups in order, World first, Colour then Modulation between Time & Space and Output, each trigger in its trait colour', () => {
    render(<FleetParamsScreen />);
    expect(tabNames(sectionRow())).toEqual(GROUPS.map(([, key]) => human(key)));
    expect(tabNames(sectionRow())).toHaveLength(7);
    expect(tabNames(sectionRow()).indexOf(human('fleet.world'))).toBe(0);
    expect(tabNames(sectionRow()).indexOf(human('fleet.colour'))).toBe(4);
    expect(tabNames(sectionRow()).indexOf(human('fleet.modulation'))).toBe(5);
    expect(tabNames(sectionRow())).not.toContain(human('fleet.pacing'));
    expect(tabNames(sectionRow())).not.toContain(human('fleet.quality'));
    const tabs = within(sectionRow()).getAllByRole('tab');
    GROUPS.forEach(([, , trait], i) => {
      const expected = getTraitColorStyle(trait) as Record<string, string>;
      expect(tabs[i].style.getPropertyValue('--color-accent'), trait).toBe(expected['--color-accent']);
    });
  });
});

describe('FleetParamsScreen — lane titles follow the shell (spec §1.4)', () => {
  beforeEach(() => {
    useUIStore.setState({ fleetParamsSection: 'lfoBank' });
  });

  it('desk: "Core LFO (LFO A)" … from laneTitle', () => {
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.lfoBank'))).toEqual(LANES.map((lane) => laneTitle(lane, 'desk')));
  });

  it('phone: "LFO A" …', () => {
    shell.set('phone');
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.lfoBank'))).toEqual(LANES.map((lane) => laneTitle(lane, 'phone')));
  });

  it('a shell change renames the lanes and keeps the open one', () => {
    useUIStore.setState({ fleetParamsSubsection: 'laneC' });
    render(<FleetParamsScreen />);
    act(() => shell.set('phone'));
    expect(tabNames(subRow('fleet.lfoBank'))).toEqual(LANES.map((lane) => laneTitle(lane, 'phone')));
    expect(selectedTab(subRow('fleet.lfoBank')).textContent).toBe(laneTitle('c', 'phone'));
    expect(lanePanels().map((p) => p.getAttribute('data-lane'))).toEqual(['c']);
  });

  it('only the lanes are renamed: the other sub-tabs read their entry', () => {
    shell.set('phone');
    useUIStore.setState({ fleetParamsSection: 'eqFilters' });
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.eqFilters'))).toEqual([human('fleet.eq'), human('fleet.hpf'), human('fleet.lpf')]);
  });
});

describe('FleetParamsScreen — switching tabs', () => {
  it('a section pick writes fleetParamsSection, opens its first sub-tab and unmounts the old panel', () => {
    useUIStore.setState({ fleetParamsSection: 'lfoBank', fleetParamsSubsection: 'laneC' });
    render(<FleetParamsScreen />);
    pick(human('fleet.eqFilters'));
    expect(useUIStore.getState().fleetParamsSection).toBe('eqFilters');
    expect(useUIStore.getState().fleetParamsSubsection).toBeNull();
    expect(lanePanels()).toHaveLength(0);
    expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual(['eq3']);
    expect(screen.queryByRole('tablist', { name: human('fleet.lfoBank') })).toBeNull();
  });

  it('a sub-tab pick writes fleetParamsSubsection and swaps the panel', () => {
    useUIStore.setState({ fleetParamsSection: 'eqFilters' });
    render(<FleetParamsScreen />);
    pick(human('fleet.hpf'));
    expect(useUIStore.getState().fleetParamsSubsection).toBe('filterHPF');
    expect(useUIStore.getState().fleetParamsSection).toBe('eqFilters');
    expect(mountedPanels()).toHaveLength(1);
    expect(effectPanels()[0].getAttribute('data-effect-key')).toBe('filterHPF');
  });

  it('a lane pick mounts that lane alone', () => {
    useUIStore.setState({ fleetParamsSection: 'lfoBank' });
    render(<FleetParamsScreen />);
    pick(laneTitle('d', 'desk'));
    expect(useUIStore.getState().fleetParamsSubsection).toBe('laneD');
    expect(mountedPanels()).toHaveLength(1);
    expect(lanePanels()[0].getAttribute('data-lane')).toBe('d');
  });

  const SUB_TABS = (Object.keys(FLEET_PARAMS_SUBSECTIONS) as FleetParamsGroup[]).flatMap((group) =>
    FLEET_PARAMS_SUBSECTIONS[group].map((sub) => [group, sub.id] as const),
  );

  it.each(SUB_TABS)('%s / %s, from the store, mounts exactly that panel', (group, id) => {
    useUIStore.setState({ fleetParamsSection: group, fleetParamsSubsection: id });
    render(<FleetParamsScreen />);
    expect(mountedPanels()).toHaveLength(1);
    if (id === 'pacing') {
      expect(pacingPanels()).toHaveLength(1);
    } else if (id === 'quality') {
      expect(audioLoadPanels()).toHaveLength(1);
    } else if (group === 'lfoBank') {
      expect(lanePanels()[0].getAttribute('data-lane')).toBe(id.slice(-1).toLowerCase());
    } else {
      expect(effectPanels()[0].getAttribute('data-effect-key')).toBe(id);
    }
  });

  it('the sub-tab rows name each tab after its entry, in the table\'s order', () => {
    for (const [group, key] of GROUPS) {
      if (group === 'lfoBank') continue;
      useUIStore.setState({ fleetParamsSection: group, fleetParamsSubsection: null });
      const { unmount } = render(<FleetParamsScreen />);
      expect(tabNames(subRow(key))).toEqual(FLEET_PARAMS_SUBSECTIONS[group].map((sub) => labels(sub.content).humanLabel));
      unmount();
    }
  });

  it('leaving a group and coming back opens its first sub-tab again (a section pick resets the sub-tab)', () => {
    useUIStore.setState({ fleetParamsSection: 'lfoBank' });
    render(<FleetParamsScreen />);
    pick(laneTitle('c', 'desk'));
    pick(human('fleet.output'));
    pick(human('fleet.lfoBank'));
    expect(selectedTab(subRow('fleet.lfoBank')).textContent).toBe(laneTitle('a', 'desk'));
    expect(lanePanels().map((p) => p.getAttribute('data-lane'))).toEqual(['a']);
  });

  it.each<[FleetParamsGroup, SelectedFleetParamsEffect, string]>([
    ['output', 'laneC', 'compressor'],
    ['timeSpace', 'filterLPF', 'reverb'],
    ['colour', 'limiter', 'distortion'],
    ['eqFilters', 'bitCrusher', 'eq3'],
    ['modulation', 'distortion', 'autoWah'],
    ['colour', 'phaser', 'distortion'],
  ])('a sub-tab left from another group (%s with %s) shows the group\'s first, without a store write', (group, stale, shown) => {
    useUIStore.setState({ fleetParamsSection: group, fleetParamsSubsection: stale });
    render(<FleetParamsScreen />);
    expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual([shown]);
    expect(useUIStore.getState().fleetParamsSubsection).toBe(stale);
  });
});

describe('FleetParamsScreen — World > Pacing, five controls (docs/specs/CONTENT_LAYOUT.md §1.2)', () => {
  beforeEach(() => {
    useUIStore.setState({ fleetParamsSection: 'world', fleetParamsSubsection: null });
  });

  it("World's sub-tab row is Pacing then Settings, Pacing open, and none of the other sections' panels", () => {
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.world'))).toEqual([human('fleet.pacing'), human('fleet.quality')]);
    expect(selectedTab(subRow('fleet.world')).textContent).toBe(human('fleet.pacing'));
    expect(lanePanels()).toHaveLength(0);
    expect(effectPanels()).toHaveLength(0);
    expect(audioLoadPanels()).toHaveLength(0);
  });

  it.each<SelectedFleetParamsEffect>(['tempo', 'laneC', 'compressor'])('a sub-tab left from elsewhere (%s) opens Pacing, without a store write', (stale) => {
    useUIStore.setState({ fleetParamsSubsection: stale });
    render(<FleetParamsScreen />);
    expect(selectedTab(subRow('fleet.world')).textContent).toBe(human('fleet.pacing'));
    expect(screen.getByRole('slider', { name: /tempo/i })).toBeTruthy();
    expect(mountedPanels()).toHaveLength(1);
    expect(useUIStore.getState().fleetParamsSubsection).toBe(stale);
  });

  it('reads tempo, automation rate and automation length from audioStore', () => {
    useAudioStore.setState({ bpm: 88, swellFrequency: 8, swellDuration: 6 });
    render(<FleetParamsScreen />);
    expect(screen.getByRole('slider', { name: /tempo/i }).getAttribute('aria-valuenow')).toBe('88');
    // SliderLog's aria-valuenow is its normalised t; its display text is the value (SliderLog.test.tsx).
    expect(screen.getByText('8/measure')).toBeTruthy();
    expect(screen.getByRole('slider', { name: /automation length/i }).getAttribute('aria-valuenow')).toBe('6');
  });

  it.each([
    [/tempo/i, 'setBPM'],
    [/automation rate/i, 'setSwellFrequency'],
    [/automation length/i, 'setSwellDuration'],
  ] as const)('a %s edit calls audioStore.%s', (slider, setter) => {
    render(<FleetParamsScreen />);
    const spy = vi.spyOn(useAudioStore.getState(), setter);
    fireEvent.keyDown(screen.getByRole('slider', { name: slider }), { key: 'ArrowRight' });
    expect(spy).toHaveBeenCalled();
  });

  // The sliders ease an outside change in over a GSAP quickTo (useEasedControlValue), so the readout is
  // not the check; the re-render is. Paired with the re-render test below, it places the subscription
  // in Pacing's own panel.
  // Each value moves off the seeded one, which a fixed number could equal (and so change nothing).
  it.each(['bpm', 'swellFrequency', 'swellDuration', 'humanize'] as const)('re-renders on a %s change while Pacing is open', (field) => {
    let renders = 0;
    render(
      <Profiler id="fleet" onRender={() => renders++}>
        <FleetParamsScreen />
      </Profiler>,
    );
    const before = renders;
    act(() => useAudioStore.setState({ [field]: AUDIO_INITIAL[field] + 1 }));
    expect(renders).toBeGreaterThan(before);
  });
});

// docs/specs/ROBOT_PERFORMANCE.md §1.6 (docs/tasks/ROBOT_PERFORMANCE.md Task 13) — Humanize, the third control of the top row.
// docs/specs/CONTENT_LAYOUT.md §1.2 (Task 9): Pacing is two boxes — P1: Tempo★ · Humanize; P2: Automation Rate★ ·
// Automation Length | Automation Range. The intensity drawer (Automation Range) is stubbed in this file.
describe('FleetParamsScreen — World > Pacing, two boxes (docs/specs/CONTENT_LAYOUT.md §1.2)', () => {
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  function stubMatchMedia(state: { mobile: boolean; tablet: boolean }) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('639px') ? state.mobile : state.tablet,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    });
  }

  beforeEach(() => {
    useUIStore.setState({ fleetParamsSection: 'world', fleetParamsSubsection: 'pacing' });
  });
  afterEach(() => {
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  const box = (container: HTMLElement, n: number) => container.querySelector(`[data-panel-id="fleetParams.pacing.p${n}"]`) as HTMLElement;
  const contentOf = (panel: Element) => panel.querySelector(':scope > .sc-directional-panel__content')!;
  const slider = (name: RegExp) => screen.getByRole('slider', { name });

  it('renders exactly two boxes, P1 before P2', () => {
    const { container } = render(<FleetParamsScreen />);
    expect(box(container, 1)).not.toBeNull();
    expect(box(container, 2)).not.toBeNull();
    expect(box(container, 3)).toBeNull();
    expect(box(container, 1).compareDocumentPosition(box(container, 2)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("P1 holds Tempo then Humanize, a row each, and Tempo's cell is featured", () => {
    const { container } = render(<FleetParamsScreen />);
    const rows = [...contentOf(box(container, 1)).children];
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByRole('slider', { name: /tempo/i })).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByRole('slider', { name: new RegExp('^' + human('fleet.pacing.humanize'), 'i') })).toBeTruthy();
    expect(rows[0].classList.contains('sc-featured')).toBe(true);
    expect(rows[1].classList.contains('sc-featured')).toBe(false);
  });

  it("P2 holds Automation Rate, featured, then one shared row: Automation Length beside Automation Range", () => {
    const { container } = render(<FleetParamsScreen />);
    const rows = [...contentOf(box(container, 2)).children];
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByRole('slider', { name: /automation rate/i })).toBeTruthy();
    expect(rows[0].classList.contains('sc-featured')).toBe(true);
    expect(rows[1].getAttribute('data-panel-id')).toBe('fleetParams.pacing.p2.r2');
    const cells = [...contentOf(rows[1]).children];
    expect(cells).toHaveLength(2);
    expect(within(cells[0] as HTMLElement).getByRole('slider', { name: /automation length/i })).toBeTruthy();
    expect(cells[1].getAttribute('data-testid')).toBe('audio-rig-drawer-stub');
  });

  it('Tempo and Automation Rate are the only featured cells', () => {
    const { container } = render(<FleetParamsScreen />);
    const featured = [...container.querySelectorAll('.sc-featured')];
    expect(featured).toHaveLength(2);
    expect(featured[0].contains(slider(/tempo/i))).toBe(true);
    expect(featured[1].contains(slider(/automation rate/i))).toBe(true);
  });

  it('the shared row is side by side (row) on desktop and stacks (column) on tablet and phone', () => {
    const orientationOf = (container: HTMLElement) =>
      container.querySelector('[data-panel-id="fleetParams.pacing.p2.r2"] > .sc-directional-panel__content')!.getAttribute('data-orientation');
    stubMatchMedia({ mobile: false, tablet: false });
    const desktop = render(<FleetParamsScreen />);
    expect(orientationOf(desktop.container)).toBe('row');
    desktop.unmount();
    for (const tier of [{ mobile: false, tablet: true }, { mobile: true, tablet: true }]) {
      stubMatchMedia(tier);
      const { container, unmount } = render(<FleetParamsScreen />);
      expect(orientationOf(container), JSON.stringify(tier)).toBe('column');
      unmount();
    }
  });

  it('no Pacing box carries a heading (none did): its content is its first child', () => {
    const { container } = render(<FleetParamsScreen />);
    for (const n of [1, 2]) {
      expect(box(container, n).firstElementChild, `p${n}`).toBe(contentOf(box(container, n)));
    }
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 12 (spec §1.9): Audio Quality left Settings for Fleet Params' last
// tab; docs/specs/CONTENT_LAYOUT.md §1.2 made it World's second sub-tab, Settings.
describe("FleetParamsScreen — World > Settings, the Audio Load panel", () => {
  const crumb = () => screen.getByRole('navigation', { name: human('nav.breadcrumb') }).textContent;

  it('picking the sub-tab writes it and mounts the Audio Load panel alone', () => {
    render(<FleetParamsScreen />);
    pick(human('fleet.quality'));
    expect(useUIStore.getState()).toMatchObject({ fleetParamsSection: 'world', fleetParamsSubsection: 'quality' });
    expect(mountedPanels()).toHaveLength(1);
    expect(audioLoadPanels()).toHaveLength(1);
  });

  it('leaving it, for Pacing or another tab, unmounts the panel', () => {
    useUIStore.setState({ fleetParamsSection: 'world', fleetParamsSubsection: 'quality' });
    render(<FleetParamsScreen />);
    pick(human('fleet.pacing'));
    expect(audioLoadPanels()).toHaveLength(0);
    pick(human('fleet.quality'));
    pick(human('fleet.output'));
    expect(audioLoadPanels()).toHaveLength(0);
  });

  it('a Settings sub-tab left over on another group opens that group\'s first', () => {
    useUIStore.setState({ fleetParamsSection: 'output', fleetParamsSubsection: 'quality' });
    render(<FleetParamsScreen />);
    expect(audioLoadPanels()).toHaveLength(0);
    expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual(['compressor']);
  });

  it('the breadcrumb reads Root / Fleet Params / World / Settings', () => {
    render(
      <>
        <FleetParamsScreen />
        <NavBreadcrumb />
      </>,
    );
    pick(human('fleet.quality'));
    expect(crumb()).toBe([human('nav.root'), human('fleet.root'), human('fleet.world'), human('fleet.quality')].join(' / '));
  });
});

describe('FleetParamsScreen — Pacing: Humanize (Robot Performance Task 13)', () => {
  beforeEach(() => {
    useUIStore.setState({ fleetParamsSection: 'world' });
  });

  const humanizeSlider = () => screen.getByRole('slider', { name: new RegExp('^' + CONTENT['fleet.pacing.humanize'].human, 'i') });

  it('reads its value from audioStore, with a 0..20 range', () => {
    useAudioStore.setState({ humanize: 12 });
    render(<FleetParamsScreen />);

    expect(humanizeSlider().getAttribute('aria-valuenow')).toBe('12');
    expect(humanizeSlider().getAttribute('aria-valuemin')).toBe('0');
    expect(humanizeSlider().getAttribute('aria-valuemax')).toBe('20');
  });

  it.each([0, 20])('shows %s ms at either end of the travel', (ms) => {
    useAudioStore.setState({ humanize: ms });
    render(<FleetParamsScreen />);
    expect(humanizeSlider().getAttribute('aria-valuenow')).toBe(String(ms));
  });

  it('an edit calls audioStore.setHumanize with the next whole ms, once, and no other Pacing setter', () => {
    useAudioStore.setState({ humanize: 12 });
    render(<FleetParamsScreen />);
    const humanize = vi.spyOn(useAudioStore.getState(), 'setHumanize');
    const bpm = vi.spyOn(useAudioStore.getState(), 'setBPM');
    const frequency = vi.spyOn(useAudioStore.getState(), 'setSwellFrequency');
    const duration = vi.spyOn(useAudioStore.getState(), 'setSwellDuration');

    fireEvent.keyDown(humanizeSlider(), { key: 'ArrowRight' });

    expect(humanize).toHaveBeenCalledTimes(1);
    expect(humanize).toHaveBeenCalledWith(13);
    [bpm, frequency, duration].forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('Home and End drive it to 0 and 20 ms', () => {
    useAudioStore.setState({ humanize: 12 });
    render(<FleetParamsScreen />);
    const humanize = vi.spyOn(useAudioStore.getState(), 'setHumanize');

    fireEvent.keyDown(humanizeSlider(), { key: 'End' });
    fireEvent.keyDown(humanizeSlider(), { key: 'Home' });

    expect(humanize.mock.calls.map(([ms]) => ms)).toEqual([20, 0]);
  });

  it('a drag reaches the engine through the store: the screen itself never calls AudioEngine', async () => {
    const { AudioEngine } = await import('@/engine/AudioEngine');
    const push = vi.spyOn(AudioEngine, 'setHumanize');
    useAudioStore.setState({ humanize: 12 });
    render(<FleetParamsScreen />);

    fireEvent.keyDown(humanizeSlider(), { key: 'ArrowRight' });

    expect(useAudioStore.getState().humanize).toBe(13);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(13);
  });

  it('carries a help button named for it, and the component writes no display string for it', () => {
    render(<FleetParamsScreen />);
    expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['fleet.pacing.humanize'].human }) })).toBeTruthy();
  });

  it('the sliders in the row keep their own values when Humanize moves', () => {
    useAudioStore.setState({ bpm: 88, humanize: 5 });
    render(<FleetParamsScreen />);
    act(() => useAudioStore.setState({ humanize: 9 }));

    expect(screen.getByRole('slider', { name: /tempo/i }).getAttribute('aria-valuenow')).toBe('88');
  });
});

describe('FleetParamsScreen — trait colours', () => {
  it.each(GROUPS)('%s: the open panel sits in its group\'s trait (%s, %s), as the group accordions coloured it', (group, _key, trait) => {
    useUIStore.setState({ fleetParamsSection: group });
    const { container } = render(<FleetParamsScreen />);
    const section = container.querySelector('.fleet-params-screen__section') as HTMLElement;
    expect(section).not.toBeNull();
    const expected = getTraitColorStyle(trait) as Record<string, string>;
    expect(section.style.getPropertyValue('--color-accent-a')).toBe(expected['--color-accent-a']);
    expect(section.style.getPropertyValue('--color-accent-b')).toBe(expected['--color-accent-b']);
    expect(section.contains(mountedPanels()[0])).toBe(true);
  });

  it.each(GROUPS)("%s: every sub-tab trigger wears its section's trait (%s, %s)", (group, key, trait) => {
    useUIStore.setState({ fleetParamsSection: group });
    render(<FleetParamsScreen />);
    const expected = getTraitColorStyle(trait) as Record<string, string>;
    for (const tab of within(subRow(key)).getAllByRole('tab')) {
      expect(tab.style.getPropertyValue('--color-accent'), tab.textContent ?? '').toBe(expected['--color-accent']);
    }
  });

  // docs/specs/CONTENT_LAYOUT.md assumption 7: inside World, Pacing's boxes keep Composition and Settings'
  // box keeps Seed, the colours they wore as their own tabs.
  /** The accent an element inherits: the nearest ancestor's own inline one. */
  const inheritedAccent = (el: Element | null): string => {
    for (let node = el as HTMLElement | null; node; node = node.parentElement) {
      const value = node.style?.getPropertyValue('--color-accent-a');
      if (value) return value;
    }
    return '';
  };
  const accent = (trait: Trait) => (getTraitColorStyle(trait) as Record<string, string>)['--color-accent-a'];

  it("Pacing's panel sits in Composition", () => {
    useUIStore.setState({ fleetParamsSection: 'world', fleetParamsSubsection: 'pacing' });
    render(<FleetParamsScreen />);
    expect(inheritedAccent(pacingPanels()[0])).toBe(accent('composition'));
  });

  it("Settings' panel sits in Seed, not World's Composition", () => {
    useUIStore.setState({ fleetParamsSection: 'world', fleetParamsSubsection: 'quality' });
    render(<FleetParamsScreen />);
    expect(accent('seed')).not.toBe(accent('composition'));
    expect(inheritedAccent(audioLoadPanels()[0])).toBe(accent('seed'));
  });
});

// Crawford, 2026-10-10 (spec §1.3 amended): the intros are back — the screen's, and each section's at the
// top of its panel — and each is an expander (IntroPanel `collapsible`): the headline shows, a More
// button reveals the rest. No accordion.
describe('FleetParamsScreen — the intros, each an expander (spec §1.3)', () => {
  const more = (key: keyof typeof CONTENT) => screen.getByRole('button', { name: fill('ui.intro.more', { name: human(key) }) });
  const less = (key: keyof typeof CONTENT) => screen.getByRole('button', { name: fill('ui.intro.less', { name: human(key) }) });

  it('the screen intro is fleet.root\'s headline and a collapsed More, with no accordion', () => {
    const { container } = render(<FleetParamsScreen />);
    expect(container.querySelector('.sc-accordion')).toBeNull();
    expect(screen.getByText(CONTENT['fleet.root'].intro.lore)).toBeTruthy();
    expect(more('fleet.root').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more('fleet.root'));
    expect(less('fleet.root').getAttribute('aria-expanded')).toBe('true');
  });

  it('sits above the section row', () => {
    render(<FleetParamsScreen />);
    expect(more('fleet.root').compareDocumentPosition(sectionRow()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(GROUPS)('%s opens with its own intro first in its panel, collapsed', (group, key) => {
    useUIStore.setState({ fleetParamsSection: group });
    const { container } = render(<FleetParamsScreen />);
    const entry: ContentEntry = CONTENT[key];
    const section = container.querySelector('.fleet-params-screen__section') as HTMLElement;
    const intro = section.firstElementChild as HTMLElement;
    expect(intro.classList.contains('sc-intro-panel')).toBe(true);
    expect(within(intro).getByText(entry.intro!.lore)).toBeTruthy();
    const body = intro.querySelector('.sc-intro-panel__body') as HTMLElement;
    expect(body.hidden).toBe(true);
    fireEvent.click(more(key));
    expect(body.hidden).toBe(false);
  });

  // World's sub-tabs were tabs with intros of their own; World's intro speaks for both now (§1.6).
  it.each(['pacing', 'quality'] as const)("World > %s shows World's intro alone, not its sub-tab's own", (sub) => {
    useUIStore.setState({ fleetParamsSection: 'world', fleetParamsSubsection: sub });
    const { container } = render(<FleetParamsScreen />);
    const section = container.querySelector('.fleet-params-screen__section') as HTMLElement;
    expect(section.querySelectorAll('.sc-intro-panel')).toHaveLength(1);
    expect(within(section).getByText(CONTENT['fleet.world'].intro!.lore)).toBeTruthy();
    expect(within(section).queryByText(CONTENT['fleet.pacing'].intro!.lore)).toBeNull();
    expect(within(section).queryByText(CONTENT['fleet.quality'].intro!.lore)).toBeNull();
  });

  it('an expanded screen intro stays expanded across a tab switch; the new section\'s starts collapsed', () => {
    render(<FleetParamsScreen />);
    fireEvent.click(more('fleet.root'));
    fireEvent.click(more('fleet.world'));
    pick(human('fleet.output'));
    expect(less('fleet.root').getAttribute('aria-expanded')).toBe('true');
    expect(more('fleet.output').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('FleetParamsScreen — re-render discipline', () => {
  it('a tempo change does not re-render the screen while Pacing is not the open section', () => {
    useUIStore.setState({ fleetParamsSection: 'lfoBank' });
    let renders = 0;
    render(
      <Profiler id="fleet" onRender={() => renders++}>
        <FleetParamsScreen />
      </Profiler>,
    );
    const before = renders;
    act(() => useAudioStore.setState({
      bpm: AUDIO_INITIAL.bpm + 1, swellFrequency: AUDIO_INITIAL.swellFrequency + 1, swellDuration: AUDIO_INITIAL.swellDuration + 1,
      humanize: AUDIO_INITIAL.humanize + 1,
    }));
    expect(renders).toBe(before);
  });
});

describe('FleetParamsScreen — the breadcrumb names the open tab (Root / Fleet Params / <group> / <sub-tab>)', () => {
  const crumb = () => screen.getByRole('navigation', { name: human('nav.breadcrumb') }).textContent;
  const path = (...tail: string[]) => [human('nav.root'), human('fleet.root'), ...tail].join(' / ');

  it('follows each pick', () => {
    render(
      <>
        <FleetParamsScreen />
        <NavBreadcrumb />
      </>,
    );
    expect(crumb()).toBe(path(human('fleet.world'), human('fleet.pacing')));
    pick(human('fleet.quality'));
    expect(crumb()).toBe(path(human('fleet.world'), human('fleet.quality')));
    pick(human('fleet.lfoBank'));
    expect(crumb()).toBe(path(human('fleet.lfoBank'), human('fleet.lfoBank.laneA')));
    pick(laneTitle('b', 'desk'));
    expect(crumb()).toBe(path(human('fleet.lfoBank'), human('fleet.lfoBank.laneB')));
    pick(human('fleet.timeSpace'));
    expect(crumb()).toBe(path(human('fleet.timeSpace'), human('fleet.reverb')));
    pick(human('fleet.delay'));
    expect(crumb()).toBe(path(human('fleet.timeSpace'), human('fleet.delay')));
    pick(human('fleet.world'));
    expect(crumb()).toBe(path(human('fleet.world'), human('fleet.pacing')));
  });

  it('reads Modulation and its pedals: picking the tab, then Phaser', () => {
    render(
      <>
        <FleetParamsScreen />
        <NavBreadcrumb />
      </>,
    );
    pick(human('fleet.modulation'));
    expect(crumb()).toBe(path(human('fleet.modulation'), human('fleet.autoWah')));
    pick(human('fleet.phaser'));
    expect(crumb()).toBe(path(human('fleet.modulation'), human('fleet.phaser')));
  });

  it('reads the Global Pedals: Modulation / Chorus, Modulation / Shifter, then Output / Width', () => {
    render(
      <>
        <FleetParamsScreen />
        <NavBreadcrumb />
      </>,
    );
    pick(human('fleet.modulation'));
    pick(human('fleet.chorus'));
    expect(crumb()).toBe(path(human('fleet.modulation'), human('fleet.chorus')));
    pick(human('fleet.frequencyShifter'));
    expect(crumb()).toBe(path(human('fleet.modulation'), human('fleet.frequencyShifter')));
    pick(human('fleet.output'));
    expect(crumb()).toBe(path(human('fleet.output'), human('fleet.compressor')));
    pick(human('fleet.stereoWidener'));
    expect(crumb()).toBe(path(human('fleet.output'), human('fleet.stereoWidener')));
  });

  it('reads Colour and its effect: picking the tab, then Bit Crusher', () => {
    render(
      <>
        <FleetParamsScreen />
        <NavBreadcrumb />
      </>,
    );
    pick(human('fleet.colour'));
    expect(crumb()).toBe(path(human('fleet.colour'), human('fleet.distortion')));
    pick(human('fleet.bitCrusher'));
    expect(crumb()).toBe(path(human('fleet.colour'), human('fleet.bitCrusher')));
  });
});

describe('FleetParamsScreen — the Colour section (Global Colour T9)', () => {
  it('shows the three effects as its sub-tabs, in chain order, opening on Distortion', () => {
    useUIStore.setState({ fleetParamsSection: 'colour', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.colour'))).toEqual([human('fleet.distortion'), human('fleet.chebyshev'), human('fleet.bitCrusher')]);
    expect(selectedTab(subRow('fleet.colour')).textContent).toBe(human('fleet.distortion'));
    expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual(['distortion']);
  });

  it('each sub-tab mounts exactly its own effect panel, and nothing else', () => {
    render(<FleetParamsScreen />);
    pick(human('fleet.colour'));
    for (const [name, key] of [['fleet.chebyshev', 'chebyshev'], ['fleet.bitCrusher', 'bitCrusher'], ['fleet.distortion', 'distortion']] as const) {
      pick(human(name));
      expect(useUIStore.getState().fleetParamsSubsection).toBe(key);
      expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual([key]);
      expect(mountedPanels()).toHaveLength(1);
    }
  });

  it('the Colour sub-tab triggers wear the colour trait', () => {
    useUIStore.setState({ fleetParamsSection: 'colour', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    const expected = getTraitColorStyle('colour') as Record<string, string>;
    for (const tab of within(subRow('fleet.colour')).getAllByRole('tab')) {
      expect(tab.style.getPropertyValue('--color-accent')).toBe(expected['--color-accent']);
    }
  });

  it('on the phone shell the sixth tab is there too, with the same three sub-tabs', () => {
    shell.set('phone');
    useUIStore.setState({ fleetParamsSection: 'colour', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    expect(tabNames(sectionRow())).toContain(human('fleet.colour'));
    expect(tabNames(subRow('fleet.colour'))).toHaveLength(3);
  });
});

describe('FleetParamsScreen — the Modulation section (Global Modulation T10)', () => {
  it('shows the six pedals as its sub-tabs, in chain order, opening on Auto Wah (Global Pedals T10 added four)', () => {
    useUIStore.setState({ fleetParamsSection: 'modulation', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.modulation'))).toEqual([
      human('fleet.autoWah'), human('fleet.phaser'), human('fleet.chorus'), human('fleet.tremolo'),
      human('fleet.vibrato'), human('fleet.frequencyShifter'),
    ]);
    expect(selectedTab(subRow('fleet.modulation')).textContent).toBe(human('fleet.autoWah'));
    expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual(['autoWah']);
  });

  it('each sub-tab mounts exactly its own effect panel, and nothing else', () => {
    render(<FleetParamsScreen />);
    pick(human('fleet.modulation'));
    for (const [name, key] of [
      ['fleet.phaser', 'phaser'], ['fleet.chorus', 'chorus'], ['fleet.tremolo', 'tremolo'], ['fleet.vibrato', 'vibrato'],
      ['fleet.frequencyShifter', 'frequencyShifter'], ['fleet.autoWah', 'autoWah'],
    ] as const) {
      pick(human(name));
      expect(useUIStore.getState().fleetParamsSubsection).toBe(key);
      expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual([key]);
      expect(mountedPanels()).toHaveLength(1);
    }
  });

  it('the Modulation tab and its sub-tab triggers wear the spectral trait, not the Colour trait', () => {
    useUIStore.setState({ fleetParamsSection: 'modulation', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    const spectral = getTraitColorStyle('spectral') as Record<string, string>;
    const colour = getTraitColorStyle('colour') as Record<string, string>;
    expect(spectral['--color-accent']).not.toBe(colour['--color-accent']);
    for (const tab of within(subRow('fleet.modulation')).getAllByRole('tab')) {
      expect(tab.style.getPropertyValue('--color-accent')).toBe(spectral['--color-accent']);
    }
  });

  it('opening Modulation after a Colour sub-tab choice still lands on Auto Wah', () => {
    useUIStore.setState({ fleetParamsSection: 'colour', fleetParamsSubsection: 'bitCrusher' });
    render(<FleetParamsScreen />);
    pick(human('fleet.modulation'));
    expect(selectedTab(subRow('fleet.modulation')).textContent).toBe(human('fleet.autoWah'));
  });

  it('on the phone shell the Modulation tab is there too, with the same six sub-tabs', () => {
    shell.set('phone');
    useUIStore.setState({ fleetParamsSection: 'modulation', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    expect(tabNames(sectionRow())).toContain(human('fleet.modulation'));
    expect(tabNames(subRow('fleet.modulation'))).toHaveLength(6);
  });

  it('the default section is World, so Modulation is a tab you open, not the landing view', () => {
    expect(useUIStore.getState().fleetParamsSection).toBe('world');
    expect(useUIStore.getState().fleetParamsSection).not.toBe('modulation');
  });
});

describe('FleetParamsScreen — the Output section gains Width (Global Pedals T10)', () => {
  it('shows Compressor, Width and Limiter as its sub-tabs, in chain order, still opening on the Compressor', () => {
    useUIStore.setState({ fleetParamsSection: 'output', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.output'))).toEqual([human('fleet.compressor'), human('fleet.stereoWidener'), human('fleet.limiter')]);
    expect(selectedTab(subRow('fleet.output')).textContent).toBe(human('fleet.compressor'));
    expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual(['compressor']);
  });

  it('the Width sub-tab mounts exactly the widener panel, and nothing else', () => {
    render(<FleetParamsScreen />);
    pick(human('fleet.output'));
    pick(human('fleet.stereoWidener'));
    expect(useUIStore.getState().fleetParamsSubsection).toBe('stereoWidener');
    expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual(['stereoWidener']);
    expect(mountedPanels()).toHaveLength(1);
  });

  it('the Width sub-tab wears the output trait, like its neighbours', () => {
    useUIStore.setState({ fleetParamsSection: 'output', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    const output = getTraitColorStyle('output') as Record<string, string>;
    const width = within(subRow('fleet.output')).getByRole('tab', { name: human('fleet.stereoWidener') });
    expect(width.style.getPropertyValue('--color-accent')).toBe(output['--color-accent']);
  });

  it('on the phone shell Output has the same three sub-tabs', () => {
    shell.set('phone');
    useUIStore.setState({ fleetParamsSection: 'output', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.output'))).toEqual([human('fleet.compressor'), human('fleet.stereoWidener'), human('fleet.limiter')]);
  });
});

// docs/tasks/HELP_POPOVER_LINKS.md Task 2 (docs/specs/HELP_POPOVER_LINKS.md §1.5): after a help jump the open sub-tab's
// trigger has focus; nothing else moves focus.
describe('FleetParamsScreen — arrival focus after a help jump', () => {
  /** The screen as the app mounts it: only while Fleet Params is the open tile, beside a button outside it. */
  function Host() {
    const tile = useUIStore((s) => s.activeHubTile);
    return (
      <>
        <button type="button">outside</button>
        {tile === 'audioRig' && <FleetParamsScreen />}
      </>
    );
  }
  const outside = () => screen.getByRole('button', { name: 'outside' });
  const tab = (name: string) => screen.getByRole('tab', { name });

  beforeEach(() => {
    takeArrivalFocus(); // a flag left by another file's jump
  });

  it('from a robot on Levels > Sends to Modulation > Chorus: the Chorus trigger has focus', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1', selectedSection: 'volume', selectedSubsection: 'sends' });
    render(<Host />);
    outside().focus();
    act(() => openFleetParamsAt('modulation', 'chorus'));
    expect(document.activeElement).toBe(tab(human('fleet.chorus')));
    expect(tab(human('fleet.chorus')).getAttribute('aria-selected')).toBe('true');
  });

  it('from Fleet Params on Delay to LFOs > Accent LFO: the Accent LFO trigger has focus', () => {
    useUIStore.setState({ fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' });
    render(<Host />);
    outside().focus();
    act(() => openFleetParamsAt('lfoBank', 'laneC'));
    expect(document.activeElement).toBe(tab(laneTitle('c', 'desk')));
  });

  it('from Delay to Reverb, the sub-tab row staying mounted: the Reverb trigger has focus', () => {
    useUIStore.setState({ fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' });
    render(<Host />);
    outside().focus();
    act(() => openFleetParamsAt('timeSpace', 'reverb'));
    expect(document.activeElement).toBe(tab(human('fleet.reverb')));
  });

  it('the request is taken once: a later sub-tab change moves no focus', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    render(<Host />);
    act(() => openFleetParamsAt('modulation', 'chorus'));
    outside().focus();
    act(() => useUIStore.getState().setFleetParamsSubsection('phaser'));
    expect(document.activeElement).toBe(outside());
    expect(takeArrivalFocus()).toBe(false);
  });

  it.each<[string, () => void]>([
    ['a sub-tab press', () => pick(human('fleet.reverb'))],
    ['setFleetParamsSection', () => act(() => useUIStore.getState().setFleetParamsSection('colour'))],
    ['the no-op jump (already on Delay)', () => act(() => openFleetParamsAt('timeSpace', 'delay'))],
  ])('%s on Fleet Params moves no focus', (_case, go) => {
    useUIStore.setState({ fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' });
    render(<Host />);
    outside().focus();
    go();
    expect(document.activeElement).toBe(outside());
    expect(takeArrivalFocus()).toBe(false);
  });

  it("selectBranch('fleetParams') from a robot moves no focus", () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    render(<Host />);
    outside().focus();
    act(() => selectBranch('fleetParams'));
    expect(screen.getByRole('tablist', { name: human('fleet.root') })).toBeTruthy();
    expect(document.activeElement).toBe(outside());
    expect(takeArrivalFocus()).toBe(false);
  });

  it('back() onto a Fleet Params stop moves no focus', () => {
    useUIStore.setState({ fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' });
    render(<Host />);
    act(() => selectEntity({ robotId: 'r1' }));
    outside().focus();
    act(() => back());
    expect(useUIStore.getState()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: 'timeSpace', fleetParamsSubsection: 'delay' });
    expect(document.activeElement).toBe(outside());
    expect(takeArrivalFocus()).toBe(false);
  });

  it('a jump never taken (no screen mounted) is cleared by the next navigation: back() onto Fleet Params moves no focus', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    openFleetParamsAt('modulation', 'chorus'); // nothing rendered: the request is left set
    selectEntity({ robotId: 'r2' });
    render(<Host />);
    outside().focus();
    act(() => back());
    expect(useUIStore.getState()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: 'modulation' });
    expect(document.activeElement).toBe(outside());
  });
});
