import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

import { FleetParamsScreen } from './FleetParamsScreen';
import { NavBreadcrumb } from '../nav/NavBreadcrumb';
import { FLEET_PARAMS_SUBSECTIONS } from '../nav/navActions';
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

const UI_INITIAL = useUIStore.getInitialState();
const AUDIO_INITIAL = useAudioStore.getState();

const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const GROUPS: readonly [FleetParamsGroup, keyof typeof CONTENT, Trait][] = [
  ['pacing', 'fleet.pacing', 'composition'],
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
/** Every panel the screen can mount, whatever its kind. */
const mountedPanels = () => [...lanePanels(), ...effectPanels(), ...screen.queryAllByTestId('audio-rig-drawer-stub')];

beforeEach(() => {
  shell.set('desk');
  useUIStore.setState(UI_INITIAL, true);
  useUIStore.setState({ activeHubTile: 'audioRig' });
  useAudioStore.setState(AUDIO_INITIAL, true);
});

describe('FleetParamsScreen — the default view', () => {
  it("opens on LFO Bank at lane A, with only lane A's panel in the DOM", () => {
    render(<FleetParamsScreen />);
    expect(selectedTab(sectionRow()).textContent).toBe(human('fleet.lfoBank'));
    expect(selectedTab(subRow('fleet.lfoBank')).textContent).toBe(laneTitle('a', 'desk'));
    expect(mountedPanels()).toHaveLength(1);
    expect(lanePanels()[0].getAttribute('data-lane')).toBe('a');
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('the section row is the seven groups in order, Colour then Modulation between Time & Space and Output, each trigger in its trait colour', () => {
    render(<FleetParamsScreen />);
    expect(tabNames(sectionRow())).toEqual(GROUPS.map(([, key]) => human(key)));
    expect(tabNames(sectionRow())).toHaveLength(7);
    expect(tabNames(sectionRow()).indexOf(human('fleet.colour'))).toBe(4);
    expect(tabNames(sectionRow()).indexOf(human('fleet.modulation'))).toBe(5);
    const tabs = within(sectionRow()).getAllByRole('tab');
    GROUPS.forEach(([, , trait], i) => {
      const expected = getTraitColorStyle(trait) as Record<string, string>;
      expect(tabs[i].style.getPropertyValue('--color-accent'), trait).toBe(expected['--color-accent']);
    });
  });
});

describe('FleetParamsScreen — lane titles follow the shell (spec §1.4)', () => {
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
    useUIStore.setState({ fleetParamsSubsection: 'laneC' });
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
    if (group === 'lfoBank') {
      expect(lanePanels()[0].getAttribute('data-lane')).toBe(id.slice(-1).toLowerCase());
    } else {
      expect(effectPanels()[0].getAttribute('data-effect-key')).toBe(id);
    }
  });

  it('the sub-tab rows name each tab after its entry, in the table\'s order', () => {
    for (const [group, key] of GROUPS) {
      if (group === 'pacing' || group === 'lfoBank') continue;
      useUIStore.setState({ fleetParamsSection: group, fleetParamsSubsection: null });
      const { unmount } = render(<FleetParamsScreen />);
      expect(tabNames(subRow(key))).toEqual(FLEET_PARAMS_SUBSECTIONS[group].map((sub) => labels(sub.content).humanLabel));
      unmount();
    }
  });

  it('leaving a group and coming back opens its first sub-tab again (a section pick resets the sub-tab)', () => {
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

describe('FleetParamsScreen — Pacing, one panel of five controls with no sub-tabs', () => {
  beforeEach(() => {
    useUIStore.setState({ fleetParamsSection: 'pacing' });
  });

  it('has no sub-tab row, and none of the other sections\' panels', () => {
    render(<FleetParamsScreen />);
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(lanePanels()).toHaveLength(0);
    expect(effectPanels()).toHaveLength(0);
  });

  it('a stored sub-tab does not give Pacing a sub-tab row', () => {
    useUIStore.setState({ fleetParamsSubsection: 'tempo' });
    render(<FleetParamsScreen />);
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getByRole('slider', { name: /tempo/i })).toBeTruthy();
  });

  it('Tempo and Automation Rate share the top row; Automation Length and the intensity drawer the bottom one', () => {
    render(<FleetParamsScreen />);
    const tempo = screen.getByRole('slider', { name: /tempo/i });
    const rate = screen.getByRole('slider', { name: /automation rate/i });
    const length = screen.getByRole('slider', { name: /automation length/i });
    const drawer = screen.getByTestId('audio-rig-drawer-stub');
    const top = tempo.closest('.sc-directional-panel')!;
    const bottom = length.closest('.sc-directional-panel')!;
    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    expect(top).not.toBe(bottom);
    expect(top.contains(rate)).toBe(true);
    expect(bottom.contains(drawer)).toBe(true);
    expect(top.compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
describe('FleetParamsScreen — Pacing: Humanize (Robot Performance Task 13)', () => {
  beforeEach(() => {
    useUIStore.setState({ fleetParamsSection: 'pacing' });
  });

  const humanizeSlider = () => screen.getByRole('slider', { name: new RegExp('^' + CONTENT['fleet.pacing.humanize'].human, 'i') });
  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('sits in the top row between Tempo and Automation Rate, in that order', () => {
    render(<FleetParamsScreen />);
    const tempo = screen.getByRole('slider', { name: /tempo/i });
    const rate = screen.getByRole('slider', { name: /automation rate/i });
    const top = tempo.closest('.sc-directional-panel')!;

    expect(top.contains(humanizeSlider())).toBe(true);
    expect(top.contains(rate)).toBe(true);
    expect(before(tempo, humanizeSlider())).toBe(true);
    expect(before(humanizeSlider(), rate)).toBe(true);
  });

  it('is not in the bottom row, beside Automation Length', () => {
    render(<FleetParamsScreen />);
    const bottom = screen.getByRole('slider', { name: /automation length/i }).closest('.sc-directional-panel')!;
    expect(bottom.contains(humanizeSlider())).toBe(false);
  });

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
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'FleetParamsScreen.tsx'), 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*AudioEngine['"]/); // no import of the engine...
    expect(source).not.toMatch(/AudioEngine\./); // ...and no call on it
  });

  it('carries a help button named for it, and the component writes no display string for it', () => {
    render(<FleetParamsScreen />);
    expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['fleet.pacing.humanize'].human }) })).toBeTruthy();
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'FleetParamsScreen.tsx'), 'utf8');
    expect(source).not.toContain('>' + CONTENT['fleet.pacing.humanize'].human + '<');
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

  it.each(GROUPS.filter(([group]) => group !== 'pacing'))("%s: every sub-tab trigger wears its section's trait (%s, %s)", (group, key, trait) => {
    useUIStore.setState({ fleetParamsSection: group });
    render(<FleetParamsScreen />);
    const expected = getTraitColorStyle(trait) as Record<string, string>;
    for (const tab of within(subRow(key)).getAllByRole('tab')) {
      expect(tab.style.getPropertyValue('--color-accent'), tab.textContent ?? '').toBe(expected['--color-accent']);
    }
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

  it('an expanded screen intro stays expanded across a tab switch; the new section\'s starts collapsed', () => {
    render(<FleetParamsScreen />);
    fireEvent.click(more('fleet.root'));
    fireEvent.click(more('fleet.lfoBank'));
    pick(human('fleet.output'));
    expect(less('fleet.root').getAttribute('aria-expanded')).toBe('true');
    expect(more('fleet.output').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('FleetParamsScreen — re-render discipline', () => {
  it('a tempo change does not re-render the screen while Pacing is not the open section', () => {
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
    expect(crumb()).toBe(path(human('fleet.lfoBank'), human('fleet.lfoBank.laneA')));
    pick(laneTitle('b', 'desk'));
    expect(crumb()).toBe(path(human('fleet.lfoBank'), human('fleet.lfoBank.laneB')));
    pick(human('fleet.timeSpace'));
    expect(crumb()).toBe(path(human('fleet.timeSpace'), human('fleet.reverb')));
    pick(human('fleet.delay'));
    expect(crumb()).toBe(path(human('fleet.timeSpace'), human('fleet.delay')));
    pick(human('fleet.pacing'));
    expect(crumb()).toBe(path(human('fleet.pacing')));
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
  it('shows the two pedals as its sub-tabs, in chain order, opening on Auto Wah', () => {
    useUIStore.setState({ fleetParamsSection: 'modulation', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    expect(tabNames(subRow('fleet.modulation'))).toEqual([human('fleet.autoWah'), human('fleet.phaser')]);
    expect(selectedTab(subRow('fleet.modulation')).textContent).toBe(human('fleet.autoWah'));
    expect(effectPanels().map((p) => p.getAttribute('data-effect-key'))).toEqual(['autoWah']);
  });

  it('each sub-tab mounts exactly its own effect panel, and nothing else', () => {
    render(<FleetParamsScreen />);
    pick(human('fleet.modulation'));
    for (const [name, key] of [['fleet.phaser', 'phaser'], ['fleet.autoWah', 'autoWah']] as const) {
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

  it('on the phone shell the Modulation tab is there too, with the same two sub-tabs', () => {
    shell.set('phone');
    useUIStore.setState({ fleetParamsSection: 'modulation', fleetParamsSubsection: null });
    render(<FleetParamsScreen />);
    expect(tabNames(sectionRow())).toContain(human('fleet.modulation'));
    expect(tabNames(subRow('fleet.modulation'))).toHaveLength(2);
  });

  it('the default section is still the LFO Bank, so Modulation is a tab you open, not the landing view', () => {
    expect(useUIStore.getState().fleetParamsSection).not.toBe('modulation');
  });
});

describe('FleetParamsScreen — source', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(here, 'FleetParamsScreen.tsx'), 'utf8');

  it('imports none of the stacked-scroll machinery (accordionSync, sectionRefs, viewFade, the scrollspy, the open-state hook)', () => {
    expect(src).not.toMatch(/accordionSync|sectionRefs|viewFade|useSectionObserver|useAccordionOpenState/);
  });

  it('carries no copy literal of its own', () => {
    expect(src).not.toMatch(/(loreLabel|humanLabel|loreDescription|humanDescription|label)\s*[:=]\s*['"`]/);
  });
});

// The grep gate, kept as a test (as Task 9's is): FleetParamsContent is gone and nothing imports it.
describe('FleetParamsContent is deleted', () => {
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const module = 'components/panels/screen/nav/content/FleetParamsContent';

  it('its component, stylesheet and tests are gone', () => {
    for (const ext of ['.ts', '.tsx', '.css', '.test.ts', '.test.tsx']) {
      expect(existsSync(join(srcRoot, module + ext)), module + ext).toBe(false);
    }
  });

  it('nothing under src/ imports or mocks it', () => {
    const importOf = /(from|import|vi\.mock\()\s*['"][^'"]*\/FleetParamsContent(\.css)?['"]/;
    const importers = (readdirSync(srcRoot, { recursive: true }) as string[])
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => importOf.test(readFileSync(join(srcRoot, file), 'utf8')));
    expect(importers).toEqual([]);
  });
});
