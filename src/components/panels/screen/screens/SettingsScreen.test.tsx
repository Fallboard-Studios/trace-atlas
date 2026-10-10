import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

import { SettingsScreen } from './SettingsScreen';
import { NavBreadcrumb } from '../nav/NavBreadcrumb';
import { selectBranch } from '../nav/navActions';
import { CONTENT, type ContentEntry } from '@/content';
import { useUIStore, type SettingsLeaf } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';

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

describe('SettingsScreen — one collapsible intro (spec §1.3)', () => {
  // The trigger is DualLabel's lore over human, so its name ends in the human one.
  const introTrigger = () => screen.getByRole('button', { name: new RegExp(`${human('settings.root')}$`) });

  it('is one accordion, settings.root, collapsed until opened', () => {
    const { container } = render(<SettingsScreen />);
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(1);
    expect(introTrigger().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(introTrigger());
    expect(introTrigger().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(CONTENT['settings.root'].intro.lore)).toBeTruthy();
  });

  it('sits above the section row', () => {
    render(<SettingsScreen />);
    expect(introTrigger().compareDocumentPosition(sectionRow()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(LEAVES)('no second intro: %s shows no leaf intro of its own', (leaf, key) => {
    useUIStore.setState({ selectedSettingsLeaf: leaf });
    render(<SettingsScreen />);
    fireEvent.click(introTrigger());
    const entry: ContentEntry = CONTENT[key];
    expect(entry.intro, key).toBeDefined();
    expect(screen.queryByText(entry.intro!.lore)).toBeNull();
    expect(screen.queryByText(entry.intro!.humanDescription)).toBeNull();
  });

  it('an opened intro stays open across a tab switch', () => {
    render(<SettingsScreen />);
    fireEvent.click(introTrigger());
    pick('settings.sessions');
    expect(introTrigger().getAttribute('aria-expanded')).toBe('true');
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

// Spec §1.8: "the limits readout as a well" (§1.1: in = read). AudioLoadPanel's own tests stay as they
// are; the rule is the Settings screen's, so it is held here.
describe('AudioLoadPanel.css — the limits readout is a well, not a cabinet', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../console/AudioLoadPanel.css'), 'utf8');
  const readout = () => getCssRuleBody(css, '.audio-load-panel__readout');
  const declaration = (property: string) => readout()?.match(new RegExp(`(?:^|\\s)${property}:\\s*([^;]+);`))?.[1].trim();

  it('wears the shared well tokens and the accent edge every well has', () => {
    expect(readout()).not.toBeNull();
    expect(declaration('background')).toBe('var(--well-background)');
    expect(declaration('box-shadow')).toBe('var(--well-inset), inset 0 0 8px var(--color-accent)');
    expect(declaration('border')).toBe('1px solid var(--color-accent)');
  });

  it('is cut in, never raised: every shadow is inset, and nothing glows outward', () => {
    const shadows = declaration('box-shadow')!.split(/,(?![^(]*\))/).map((layer) => layer.trim());
    for (const layer of shadows) expect(layer.startsWith('inset') || layer === 'var(--well-inset)', layer).toBe(true);
    expect(readout()).not.toMatch(/(?:^|\s)filter:/);
  });

  it('reads in the fixed white the other wells use, so a trait accent never tints the reading', () => {
    expect(declaration('color')).toBe('var(--color-text-primary-fixed)');
  });

  // Beside the preset radio on the desk its row stretches every item to the radio's height (94 px in
  // Chrome at 1280), which left one line of text in an empty well; the sketch's .limits sits at the start.
  it('holds its own height: it never stretches to the preset radio beside it', () => {
    expect(declaration('align-self')).toBe('flex-start');
  });
});

describe('SettingsScreen — source', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(here, 'SettingsScreen.tsx'), 'utf8');

  it('imports none of the stacked-scroll machinery (accordionSync, sectionRefs, viewFade, the scrollspy, the open-state hook)', () => {
    expect(src).not.toMatch(/accordionSync|sectionRefs|viewFade|useSectionObserver|useAccordionOpenState/);
  });

  it('carries no copy literal of its own', () => {
    expect(src).not.toMatch(/(loreLabel|humanLabel|loreDescription|humanDescription|label)\s*[:=]\s*['"`]/);
  });

  it('reads the leaf order and the names from navActions, the table the breadcrumb reads', () => {
    expect(src).toMatch(/SETTINGS_LEAVES/);
    expect(src).toMatch(/SETTINGS_LEAF_CONTENT/);
    expect(src).toMatch(/activeSettingsLeaf/);
    expect(src).not.toMatch(/\[\s*'quality'\s*,\s*'sectorSettings'/);
  });
});

// The grep gate, kept as a test (as Tasks 9 and 15 do): SettingsContent is gone, nothing imports it, and
// the Settings subsection it alone read is retired from the store.
describe('SettingsContent is deleted', () => {
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const sourceFiles = () => (readdirSync(srcRoot, { recursive: true }) as string[]).filter((file) => /\.(ts|tsx)$/.test(file));

  it('its component, stylesheet and tests are gone, the subsection integration test with them', () => {
    for (const module of ['components/panels/screen/nav/content/SettingsContent', 'components/panels/screen/nav/content/SettingsSubsections.integration']) {
      for (const ext of ['.ts', '.tsx', '.css', '.test.ts', '.test.tsx']) {
        expect(existsSync(join(srcRoot, module + ext)), module + ext).toBe(false);
      }
    }
  });

  it('nothing under src/ imports or mocks it', () => {
    const importOf = /(from|import|vi\.mock\()\s*['"][^'"]*\/SettingsContent(\.css)?['"]/;
    expect(sourceFiles().filter((file) => importOf.test(readFileSync(join(srcRoot, file), 'utf8')))).toEqual([]);
  });

  it('no source file names the retired Settings subsection (its type, field or setter)', () => {
    const readers = sourceFiles()
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /SettingsSubsection/.test(readFileSync(join(srcRoot, file), 'utf8')));
    expect(readers).toEqual([]);
  });
});
