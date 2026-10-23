import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

import { SettingsScreen } from './SettingsScreen';
import { NavBreadcrumb } from '../nav/NavBreadcrumb';
import { selectBranch } from '../nav/navActions';
import { CONTENT, fill, type ContentEntry } from '@/content';
import { useUIStore, type SettingsLeaf } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 17 (spec §1.3, §1.8, §1.10): Settings as one collapsible intro over
 * three section tabs — Audio Quality, Seeds, Save & Share — with one panel in the DOM at a time. The
 * panels have their own suites (AudioLoadPanel / SectorSettingsDrawer / SessionsPanel tests) and pull in
 * the audio and session paths, so they are stubbed here; SettingsScreen.panels.test.tsx mounts the real
 * ones.
 */
// The breadcrumb renders its own well on the desk shell only (on the phone it lives in PhoneBar), and
// jsdom has no matchMedia, which would make every test the phone. Settings itself reads no shell.
vi.mock('@/components/panels/screen/useShell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/panels/screen/useShell')>()),
  useShell: () => 'desk',
}));
vi.mock('../console/AudioLoadPanel', () => ({
  AudioLoadPanel: () => <div data-testid="audio-load-panel-stub" />,
}));
vi.mock('../console/SectorSettingsDrawer', () => ({
  SectorSettingsDrawer: () => <div data-testid="sector-settings-drawer-stub" />,
}));
vi.mock('../console/SessionsPanel', () => ({
  SessionsPanel: () => <div data-testid="sessions-panel-stub" />,
}));

const UI_INITIAL = useUIStore.getInitialState();
const AUDIO_INITIAL = useAudioStore.getState();

const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const LEAVES: readonly [SettingsLeaf, keyof typeof CONTENT, string][] = [
  ['quality', 'settings.quality', 'audio-load-panel-stub'],
  ['sectorSettings', 'settings.seeds', 'sector-settings-drawer-stub'],
  ['sessions', 'settings.sessions', 'sessions-panel-stub'],
];

const sectionRow = () => screen.getByRole('tablist', { name: human('settings.root') });
const tabNames = () => within(sectionRow()).getAllByRole('tab').map((t) => t.textContent);
const selectedTab = () => within(sectionRow()).getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')!;
const tab = (key: keyof typeof CONTENT) => screen.getByRole('tab', { name: human(key) });
// Radix Tabs triggers activate on mouseDown, not click (SectionTabs.test.tsx).
const pick = (key: keyof typeof CONTENT) => fireEvent.mouseDown(tab(key));
/** Every panel the screen can mount, whichever leaf it belongs to. */
const mountedPanels = () => LEAVES.flatMap(([, , testId]) => screen.queryAllByTestId(testId));
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  useUIStore.setState(UI_INITIAL, true);
  useUIStore.setState({ activeHubTile: 'settings' });
  useAudioStore.setState(AUDIO_INITIAL, true);
});

describe('SettingsScreen — the default view', () => {
  it('opens on Audio Quality, with only its panel in the DOM', () => {
    render(<SettingsScreen />);
    expect(selectedTab().textContent).toBe(human('settings.quality'));
    expect(mountedPanels()).toHaveLength(1);
    expect(screen.getByTestId('audio-load-panel-stub')).toBeTruthy();
  });

  it('the section row is the three leaves in order, named from the content layer', () => {
    render(<SettingsScreen />);
    expect(tabNames()).toEqual(LEAVES.map(([, key]) => human(key)));
  });

  it('is the only tab row: no leaf has sub-tabs', () => {
    for (const [leaf] of LEAVES) {
      useUIStore.setState({ selectedSettingsLeaf: leaf });
      const { unmount } = render(<SettingsScreen />);
      expect(screen.getAllByRole('tablist')).toHaveLength(1);
      unmount();
    }
  });
});

describe('SettingsScreen — switching tabs', () => {
  it.each(LEAVES)('a pick on %s writes selectedSettingsLeaf and mounts its panel alone', (leaf, key, testId) => {
    // Start from a different leaf, so the pick is a real change.
    useUIStore.setState({ selectedSettingsLeaf: leaf === 'quality' ? 'sessions' : 'quality' });
    render(<SettingsScreen />);
    pick(key);
    expect(useUIStore.getState().selectedSettingsLeaf).toBe(leaf);
    expect(mountedPanels()).toHaveLength(1);
    expect(screen.getByTestId(testId)).toBeTruthy();
  });

  it.each(LEAVES)('%s, from the store, mounts exactly that panel', (leaf, key, testId) => {
    useUIStore.setState({ selectedSettingsLeaf: leaf });
    render(<SettingsScreen />);
    expect(selectedTab().textContent).toBe(human(key));
    expect(mountedPanels()).toHaveLength(1);
    expect(screen.getByTestId(testId)).toBeTruthy();
  });

  it('switching unmounts the panel that was open', () => {
    render(<SettingsScreen />);
    pick('settings.sessions');
    expect(screen.queryByTestId('audio-load-panel-stub')).toBeNull();
    pick('settings.seeds');
    expect(screen.queryByTestId('sessions-panel-stub')).toBeNull();
    expect(mountedPanels()).toHaveLength(1);
  });

  it('a leaf the screen does not know shows Audio Quality, without a store write', async () => {
    useUIStore.setState({ selectedSettingsLeaf: 'subsection' as SettingsLeaf });
    render(<SettingsScreen />);
    await flush();
    expect(selectedTab().textContent).toBe(human('settings.quality'));
    expect(mountedPanels()).toHaveLength(1);
    expect(screen.getByTestId('audio-load-panel-stub')).toBeTruthy();
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('subsection');
  });

  it('the arrow keys move the tab and the store with it, wrapping at the ends', async () => {
    render(<SettingsScreen />);
    act(() => tab('settings.quality').focus());
    fireEvent.keyDown(tab('settings.quality'), { key: 'ArrowLeft' });
    await flush();
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('sessions');
    expect(screen.getByTestId('sessions-panel-stub')).toBeTruthy();
    fireEvent.keyDown(tab('settings.sessions'), { key: 'ArrowRight' });
    await flush();
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('quality');
  });

  it('a nav pick on Settings brings it back to Audio Quality', () => {
    render(<SettingsScreen />);
    pick('settings.sessions');
    act(() => selectBranch('settings'));
    expect(selectedTab().textContent).toBe(human('settings.quality'));
    expect(screen.getByTestId('audio-load-panel-stub')).toBeTruthy();
  });
});

describe('SettingsScreen — trait colour', () => {
  const SEED = getTraitColorStyle('seed') as Record<string, string>;

  it('every trigger wears the seed trait, the Settings box\'s colour', () => {
    render(<SettingsScreen />);
    for (const t of within(sectionRow()).getAllByRole('tab')) {
      expect(t.style.getPropertyValue('--color-accent'), t.textContent ?? '').toBe(SEED['--color-accent']);
    }
  });

  it.each(LEAVES)('%s: the open panel sits in the seed trait, as the old screen coloured it', (leaf, _key, testId) => {
    useUIStore.setState({ selectedSettingsLeaf: leaf });
    const { container } = render(<SettingsScreen />);
    const section = container.querySelector('.settings-screen__section') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.style.getPropertyValue('--color-accent-a')).toBe(SEED['--color-accent-a']);
    expect(section.style.getPropertyValue('--color-accent-b')).toBe(SEED['--color-accent-b']);
    expect(section.contains(screen.getByTestId(testId))).toBe(true);
  });
});

// Crawford, 2026-10-10 (spec §1.3 amended): the intros are back — the screen's, and each tab's at the top
// of its panel — and each is an expander (IntroPanel `collapsible`). No accordion.
describe('SettingsScreen — the intros, each an expander (spec §1.3)', () => {
  const more = (key: keyof typeof CONTENT) => screen.getByRole('button', { name: fill('ui.intro.more', { name: human(key) }) });
  const less = (key: keyof typeof CONTENT) => screen.getByRole('button', { name: fill('ui.intro.less', { name: human(key) }) });

  it('the screen intro is settings.root\'s headline and a collapsed More, with no accordion', () => {
    const { container } = render(<SettingsScreen />);
    expect(container.querySelector('.sc-accordion')).toBeNull();
    expect(screen.getByText(CONTENT['settings.root'].intro.lore)).toBeTruthy();
    expect(more('settings.root').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more('settings.root'));
    expect(less('settings.root').getAttribute('aria-expanded')).toBe('true');
  });

  it('sits above the section row', () => {
    render(<SettingsScreen />);
    expect(more('settings.root').compareDocumentPosition(sectionRow()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(LEAVES)('%s opens with its own intro first in its panel, collapsed', (leaf, key, testId) => {
    useUIStore.setState({ selectedSettingsLeaf: leaf });
    const { container } = render(<SettingsScreen />);
    const entry: ContentEntry = CONTENT[key];
    const section = container.querySelector('.settings-screen__section') as HTMLElement;
    const intro = section.firstElementChild as HTMLElement;
    expect(intro.classList.contains('sc-intro-panel')).toBe(true);
    expect(within(intro).getByText(entry.intro!.lore)).toBeTruthy();
    expect(intro.compareDocumentPosition(screen.getByTestId(testId)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const body = intro.querySelector('.sc-intro-panel__body') as HTMLElement;
    expect(body.hidden).toBe(true);
    fireEvent.click(more(key));
    expect(body.hidden).toBe(false);
  });

  it('an expanded screen intro stays expanded across a tab switch; the new tab\'s starts collapsed', () => {
    render(<SettingsScreen />);
    fireEvent.click(more('settings.root'));
    fireEvent.click(more('settings.quality'));
    pick('settings.sessions');
    expect(less('settings.root').getAttribute('aria-expanded')).toBe('true');
    expect(more('settings.sessions').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('SettingsScreen — re-render discipline', () => {
  const rendersOn = (change: () => void) => {
    let renders = 0;
    render(
      <Profiler id="settings" onRender={() => renders++}>
        <SettingsScreen />
      </Profiler>,
    );
    const before = renders;
    act(change);
    return renders - before;
  };

  it('the lighting tick (activeLocaleLocalTime, about once a second) does not re-render the screen', () => {
    expect(rendersOn(() => useUIStore.setState({ activeLocaleLocalTime: 13.25, activeLocaleTemperature: 9 }))).toBe(0);
  });

  it('another branch\'s tab (Fleet Params) does not re-render it', () => {
    expect(rendersOn(() => useUIStore.setState({ fleetParamsSection: 'output', fleetParamsSubsection: 'limiter' }))).toBe(0);
  });

  it('its own tab does', () => {
    expect(rendersOn(() => useUIStore.setState({ selectedSettingsLeaf: 'sectorSettings' }))).toBeGreaterThan(0);
  });
});

describe('SettingsScreen — the breadcrumb names the open tab (Root / Settings / <leaf>)', () => {
  const crumb = () => screen.getByRole('navigation', { name: human('nav.breadcrumb') }).textContent;
  const path = (leaf: keyof typeof CONTENT) => [human('nav.root'), human('settings.root'), human(leaf)].join(' / ');

  it('follows each pick, and names Audio Quality before any', () => {
    render(
      <>
        <SettingsScreen />
        <NavBreadcrumb />
      </>,
    );
    expect(crumb()).toBe(path('settings.quality'));
    pick('settings.seeds');
    expect(crumb()).toBe(path('settings.seeds'));
    pick('settings.sessions');
    expect(crumb()).toBe(path('settings.sessions'));
    pick('settings.quality');
    expect(crumb()).toBe(path('settings.quality'));
  });
});
