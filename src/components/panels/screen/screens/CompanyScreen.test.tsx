import { memo } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 23 (spec §1.6): the company screen — the robot screen with the column
 * swapped. A company column (the name as a popped box in the company's colour, the share and signal
 * wells, the member tiles, the broadcast note, Rename / Delete) beside SectionTabs over
 * ROBOT_SECTIONS_CONFIG, rendering the four sections with useCompanyOptions' values. The All form is the
 * same screen for the whole fleet. The values and the broadcast logic have their own suites
 * (useCompanyOptions.test.ts, CompanyOptionsSection.test.tsx); this one is the screen around them.
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
    onVolumeChange: (pct: number) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="audio-setting-section-stub" data-master-volume={props.value.masterVolume} data-disabled={props.disabled ? '' : undefined}>
      <button onClick={() => props.onVolumeChange(55)}>probe-volume</button>
    </div>
  )),
}));
vi.mock('@/components/robot/PingControlsDrawer', () => ({
  PingControlsCompositionSection: memo((props: { value: { rhythmicDensity: number }; onDensityChange: (v: number) => void; disabled?: boolean }) => (
    <div data-testid="ping-controls-composition-stub" data-density={props.value.rhythmicDensity} data-disabled={props.disabled ? '' : undefined}>
      <button onClick={() => props.onDensityChange(61)}>probe-density</button>
    </div>
  )),
}));
vi.mock('@/components/robot/PingContourDrawer', () => ({
  PingContourDrawer: memo((props: { disabled?: boolean }) => <div data-testid="ping-contour-drawer-stub" data-disabled={props.disabled ? '' : undefined} />),
}));
vi.mock('@/components/robot/SignatureArrayDrawer', () => ({
  SignatureArrayLayer: memo((props: { idx: number; layer: { type: string }; disabled?: boolean }) => (
    <div data-testid={`signature-array-layer-stub-${props.idx}`} data-type={props.layer.type} data-disabled={props.disabled ? '' : undefined} />
  )),
}));

import { CompanyScreen } from './CompanyScreen';
import { CONTENT, fill, labels } from '@/content';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle, getTraitColorStyle, getDisabledTraitColorStyle } from '@/utils/traitColors';
import * as robotOptionsActions from '@/systems/robotOptionsActions';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';

const localeId = getActiveLocaleId();
const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const LEVELS = human('probe.levels');
const COMPOSITION = human('probe.composition');
const ENVELOPE = human('probe.envelope');
const SOURCE = human('probe.source');
const RUST = { id: 'rust', name: 'Rust Syndicate', color: '#b5502a' };
const NAMES = ['Tidal Wisp', 'Coral Drift', 'Brine Hawk', 'Kelp Runner', 'Slate Finch', 'Ember Moth', 'Grey Lantern', 'Salt Warden', 'Dusk Heron', 'Pale Otter', 'Iron Gull', 'Reed Sparrow'];

function makeRobot(index: number, companyId?: string): Robot {
  return {
    id: `r${index}`,
    name: NAMES[index],
    identityColor: '#428d95',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
      filterFreq: 0,
      waveform: 'sine',
      layers: [
        { type: 'sine', gain: 1, detune: 0, phase: 0 },
        { type: 'square', gain: 0.8, detune: 5, phase: 10 },
        { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
      ],
    },
    octaveRange: [3, 4],
    masterVolume: 0.7,
    docking: 'active',
    activity: 'working',
    batteryLevel: 82,
    audioMode: 'none',
    job: 'acousticSurvey',
    gemSeed: 20261004 + index,
    rhythmicDensity: 42,
    pitchRepeat: 33,
    companyId,
  } as unknown as Robot;
}
/** Twelve robots: the first four in Rust Syndicate, two in Blue Crew, six Freelance. */
function seedFleet(rustMembers = 4) {
  const robots: Robot[] = [];
  for (let i = 0; i < 12; i++) {
    const companyId = i < rustMembers ? RUST.id : i < rustMembers + 2 ? 'blue' : undefined;
    robots.push(makeRobot(i, companyId));
  }
  useLocaleStore.getState().setLocaleData(localeId, {
    robots,
    companies: [
      { ...RUST, robotIds: robots.filter((r) => r.companyId === RUST.id).map((r) => r.id) },
      { id: 'blue', name: 'Blue Crew', color: '#3355aa', robotIds: robots.filter((r) => r.companyId === 'blue').map((r) => r.id) },
    ],
    allRobotsLastEditedOptions: undefined,
  } as unknown as Partial<Locale>);
}

const openCompany = (id: string) => useUIStore.getState().selectCompany(id);
const openAll = () => useUIStore.getState().setAllProbesSelected(true);
const pick = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }));
const STUBS = ['audio-setting-section-stub', 'ping-controls-composition-stub', 'ping-contour-drawer-stub', 'signature-array-layer-stub-0', 'signature-array-layer-stub-1', 'signature-array-layer-stub-2'];
const mounted = () => STUBS.filter((id) => screen.queryByTestId(id));
const tiles = (container: HTMLElement) => [...container.querySelectorAll('.company-screen__member')].map((el) => el.getAttribute('aria-label'));
const column = (container: HTMLElement) => container.querySelector('.robot-screen__avatar-column');
const band = (container: HTMLElement) => container.querySelector('.robot-screen__band');
const rootOf = (container: HTMLElement) => container.querySelector('.company-screen') as HTMLElement;

describe('CompanyScreen', () => {
  beforeEach(() => {
    shell.current = 'desk';
    useUIStore.setState(useUIStore.getInitialState(), true);
    seedFleet();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the company column (desk)', () => {
    it('is the column beside the controls, with no phone band', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(column(container)).toBeTruthy();
      expect(band(container)).toBeNull();
      expect(rootOf(container).classList.contains('robot-screen--desk')).toBe(true);
    });

    it('names the company in a heading, with its affiliation eyebrow, in the company\'s colour', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(screen.getByRole('heading', { name: 'Rust Syndicate' })).toBeTruthy();
      expect(within(column(container) as HTMLElement).getByText(CONTENT['company.assign'].lore!)).toBeTruthy();
      expect(rootOf(container).style.getPropertyValue('--color-accent')).toBe(getRobotColorStyle(RUST.color)['--color-accent' as never]);
    });

    it('shows the share well, "4 of 12 probes", under its lore caption', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(screen.getByText(fill('company.detail.share', { n: '4', total: '12' }))).toBe(screen.getByText('4 of 12 probes'));
      expect(container.textContent).toContain(labels('company.detail.share').loreLabel!);
    });

    it('takes the fleet size from the roster, never a literal 12', () => {
      useLocaleStore.getState().setLocaleData(localeId, { robots: [makeRobot(0, RUST.id), makeRobot(1)] } as unknown as Partial<Locale>);
      openCompany(RUST.id);
      render(<CompanyScreen />);
      expect(screen.getByText('1 of 2 probes')).toBeTruthy();
    });

    it('shows the signal well: a halo on every member', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(screen.getByText(CONTENT['company.detail.signal'].options!.company.human)).toBeTruthy();
      expect(container.textContent).toContain(labels('company.detail.signal').loreLabel!);
    });

    it('lists one tile per member, by name, and no one else', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(tiles(container)).toEqual(['Tidal Wisp', 'Coral Drift', 'Brine Hawk', 'Kelp Runner']);
    });

    it('a tile opens that robot (selectEntity), through the Probes branch', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Brine Hawk' }));
      expect(useUIStore.getState().selectedRobotId).toBe('r2');
      expect(useUIStore.getState().activeHubTile).toBe('robots');
    });

    it('states the broadcast once, with the member count', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      expect(screen.getByText(fill('company.detail.broadcastNote', { n: '4' }))).toBeTruthy();
    });

    it('says it in the singular for one member, and what to do for none', () => {
      seedFleet(1);
      openCompany(RUST.id);
      const { unmount } = render(<CompanyScreen />);
      expect(screen.getByText(CONTENT['company.detail.broadcastNote.one'].human)).toBeTruthy();
      expect(screen.queryByText(/reach all/)).toBeNull();
      unmount();

      seedFleet(0);
      render(<CompanyScreen />);
      expect(screen.getByText(CONTENT['company.detail.broadcastNote.none'].human)).toBeTruthy();
    });

    it('keeps Rename and Delete at the bottom, and shows the company\'s name only once', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      expect(screen.getByRole('button', { name: /^rename\b/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /^delete\b/i })).toBeTruthy();
      expect(screen.getAllByText('Rust Syndicate')).toHaveLength(1); // the form's own summary would be a second
    });

    it('renaming retitles the screen', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Blue Crew Two' } });
      fireEvent.click(screen.getByRole('button', { name: /^rename\b/i }));
      expect(screen.getByRole('heading', { name: 'Blue Crew Two' })).toBeTruthy();
    });

    it('opens the company profile intro as an expander, in the company trait', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(screen.getByText(CONTENT['company.profile'].intro!.lore)).toBeTruthy();
      const intro = container.querySelector('.robot-screen__controls > .sc-intro-panel') as HTMLElement;
      expect(intro.classList.contains('sc-intro-panel--collapsible')).toBe(true);
      expect(intro.style.getPropertyValue('--color-accent-a')).toBe(getTraitColorStyle('company')['--color-accent-a' as never]);
    });

    it('a member with no name is a tile named by its id', () => {
      useLocaleStore.getState().updateRobot(localeId, 'r1', { name: '' });
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(tiles(container)).toEqual(['Tidal Wisp', 'r1', 'Brine Hawk', 'Kelp Runner']);
    });
  });

  describe('the All form (whole fleet)', () => {
    beforeEach(openAll);

    it('is "All Probes" under the fleet-wide eyebrow, in the Deck\'s colour, with every robot as a tile', () => {
      const { container } = render(<CompanyScreen />);
      expect(screen.getByRole('heading', { name: human('probe.all') })).toBeTruthy();
      expect(within(column(container) as HTMLElement).getByText(human('company.detail.allForm'))).toBeTruthy();
      expect(tiles(container)).toEqual(NAMES);
      expect(rootOf(container).style.getPropertyValue('--color-accent-a')).toBe(getTraitColorStyle('header')['--color-accent-a' as never]);
    });

    it('shares "12 of 12 probes" and marks no halo', () => {
      render(<CompanyScreen />);
      expect(screen.getByText('12 of 12 probes')).toBeTruthy();
      expect(screen.getByText(CONTENT['company.detail.signal'].options!.all.human)).toBeTruthy();
      expect(screen.queryByText(CONTENT['company.detail.signal'].options!.company.human)).toBeNull();
    });

    it('states the broadcast with all twelve', () => {
      render(<CompanyScreen />);
      expect(screen.getByText(fill('company.detail.broadcastNote', { n: '12' }))).toBeTruthy();
    });

    it('has no Rename and no Delete', () => {
      render(<CompanyScreen />);
      expect(screen.queryByRole('button', { name: /rename/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('opens the All Probes intro as an expander, in the Deck trait', () => {
      const { container } = render(<CompanyScreen />);
      expect(screen.getByText(CONTENT['probe.all'].intro!.lore)).toBeTruthy();
      const intro = container.querySelector('.robot-screen__controls > .sc-intro-panel') as HTMLElement;
      expect(intro.style.getPropertyValue('--color-accent-a')).toBe(getTraitColorStyle('header')['--color-accent-a' as never]);
    });

    it('an empty roster is an empty form, not a crash', () => {
      useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
      const { container } = render(<CompanyScreen />);
      expect(tiles(container)).toEqual([]);
      expect(screen.getByText(CONTENT['company.detail.broadcastNote.none'].human)).toBeTruthy();
      expect(screen.getByRole('tablist', { name: human('probe.all') })).toBeTruthy();
      expect(screen.getByTestId('signature-array-layer-stub-0').getAttribute('data-disabled')).toBe('');
    });
  });

  describe('which entity the screen is for', () => {
    it('is the selected company when there is one, else the All form', () => {
      openCompany(RUST.id);
      const { rerender } = render(<CompanyScreen />);
      expect(screen.getByRole('heading', { name: 'Rust Syndicate' })).toBeTruthy();

      act(() => useUIStore.getState().selectAllRobots());
      rerender(<CompanyScreen />);
      expect(screen.getByRole('heading', { name: human('probe.all') })).toBeTruthy();
    });

    it('switches company in place, re-deriving the tiles', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      act(() => openCompany('blue'));
      expect(screen.getByRole('heading', { name: 'Blue Crew' })).toBeTruthy();
      expect(tiles(container)).toEqual(['Slate Finch', 'Ember Moth']);
    });

    it('renders nothing for a selected id that names no company (a stale selection)', () => {
      openCompany('gone');
      const { container } = render(<CompanyScreen />);
      expect(container.firstChild).toBeNull();
    });

    it('follows a robot moved into the company: a new tile appears', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r11', RUST.id));
      expect(tiles(container)).toContain('Reed Sparrow');
      expect(screen.getByText('5 of 12 probes')).toBeTruthy();
    });
  });

  describe('deleting the company', () => {
    // Crawford, 2026-10-11: deleting a company leaves you on Companies (ConsolePanel then shows the roster
    // board, since no company is selected), not on Probes → All Probes.
    it('leaves you on the Companies page: the company is gone, nothing is selected, and the tile stays Companies', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);

      fireEvent.click(screen.getByRole('button', { name: /^delete\b/i }));
      act(() => fireEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0]));

      expect(useLocaleStore.getState().getCompanyById(localeId, RUST.id)).toBeUndefined();
      expect(useUIStore.getState().selectedCompanyId).toBeNull();
      expect(useUIStore.getState().allProbesSelected).toBe(false);
      expect(useUIStore.getState().activeHubTile).toBe('companies');
    });
  });

  describe('the controls: SectionTabs over the four sections', () => {
    it('is a tablist named after the company, with the four sections in order', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      const row = screen.getByRole('tablist', { name: 'Rust Syndicate' });
      expect(within(row).getAllByRole('tab').map((t) => t.textContent)).toEqual([LEVELS, COMPOSITION, ENVELOPE, SOURCE]);
    });

    it('names the All form\'s tablist "All Probes"', () => {
      openAll();
      render(<CompanyScreen />);
      expect(screen.getByRole('tablist', { name: human('probe.all') })).toBeTruthy();
    });

    it('opens on Source, Core Oscillator, with only that panel in the DOM', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      expect(mounted()).toEqual(['signature-array-layer-stub-0']);
    });

    it.each<[string, string]>([
      [LEVELS, 'audio-setting-section-stub'],
      [COMPOSITION, 'ping-controls-composition-stub'],
      [ENVELOPE, 'ping-contour-drawer-stub'],
    ])('picking %s mounts only its panel', (name, stub) => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      pick(name);
      expect(mounted()).toEqual([stub]);
    });

    it('shares the open section with the robot screen (selectedSection), and cleans its sub-tab on a pick', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      pick(COMPOSITION);
      expect(useUIStore.getState().selectedSection).toBe('melody');
      expect(useUIStore.getState().selectedSubsection).toBeNull();
    });

    it('shows each section\'s values from resolveCompanyOptions (the first member)', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      pick(LEVELS);
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-master-volume')).toBe('0.7');
      pick(COMPOSITION);
      expect(screen.getByTestId('ping-controls-composition-stub').getAttribute('data-density')).toBe('42');
    });

    it('Changing Volume calls applyVolume once per member and records only masterVolume in lastEditedOptions', () => {
      openCompany(RUST.id);
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      render(<CompanyScreen />);
      pick(LEVELS);

      fireEvent.click(screen.getByText('probe-volume'));

      expect(spy).toHaveBeenCalledTimes(4);
      expect(spy.mock.calls.map((c) => c[0].id).sort()).toEqual(['r0', 'r1', 'r2', 'r3']);
      expect(spy.mock.calls.every((c) => c[2] === 55)).toBe(true);
      expect(useLocaleStore.getState().getCompanyById(localeId, RUST.id)?.lastEditedOptions).toEqual({ masterVolume: 0.55 });
    });

    it('on the All form, the same edit reaches all twelve and is recorded on the locale, not on a company', () => {
      openAll();
      const spy = vi.spyOn(robotOptionsActions, 'applyVolume').mockImplementation(() => {});
      render(<CompanyScreen />);
      pick(LEVELS);

      fireEvent.click(screen.getByText('probe-volume'));

      expect(spy).toHaveBeenCalledTimes(12);
      expect(useLocaleStore.getState().getLocaleById(localeId)?.allRobotsLastEditedOptions?.masterVolume).toBeCloseTo(0.55, 5);
      expect(useLocaleStore.getState().getCompanyById(localeId, RUST.id)?.lastEditedOptions).toBeUndefined();
    });

    it('a company with no members shows every panel disabled, in the desaturated trait style', () => {
      seedFleet(0);
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      pick(LEVELS);
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-disabled')).toBe('');
      const section = container.querySelector('.robot-screen__section') as HTMLElement;
      expect(section.style.getPropertyValue('--color-accent-a')).toBe(getDisabledTraitColorStyle('output')['--color-accent-a' as never]);
    });

    it('a company with a member shows the panels enabled, in the full trait style', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      pick(LEVELS);
      expect(screen.getByTestId('audio-setting-section-stub').getAttribute('data-disabled')).toBeNull();
      const section = container.querySelector('.robot-screen__section') as HTMLElement;
      expect(section.style.getPropertyValue('--color-accent-a')).toBe(getTraitColorStyle('output')['--color-accent-a' as never]);
    });
  });

  describe('the phone shell', () => {
    beforeEach(() => {
      shell.current = 'phone';
    });

    it('swaps the column for the small band: a swatch, the name and the count', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(column(container)).toBeNull();
      const b = band(container) as HTMLElement;
      expect(within(b).getByRole('heading', { name: 'Rust Syndicate' })).toBeTruthy();
      expect(b.querySelector('.company-screen__swatch')).toBeTruthy();
      expect(b.textContent).toContain(fill('probe.roster.count', { n: '4' }));
      expect(rootOf(container).classList.contains('robot-screen--phone')).toBe(true);
    });

    it('counts one member in the singular, and the All form by the whole fleet', () => {
      seedFleet(1);
      openCompany(RUST.id);
      const { container, unmount } = render(<CompanyScreen />);
      expect((band(container) as HTMLElement).textContent).toContain(CONTENT['probe.roster.count.one'].human);
      unmount();

      act(() => useUIStore.getState().selectAllRobots());
      openAll();
      const all = render(<CompanyScreen />);
      expect((band(all.container) as HTMLElement).textContent).toContain(fill('probe.roster.count', { n: '12' }));
    });

    it('keeps the member tiles and Rename / Delete, and the same tabs', () => {
      openCompany(RUST.id);
      const { container } = render(<CompanyScreen />);
      expect(tiles(container)).toHaveLength(4);
      expect(screen.getByRole('button', { name: /^rename\b/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /^delete\b/i })).toBeTruthy();
      expect(screen.getByRole('tablist', { name: 'Rust Syndicate' })).toBeTruthy();
    });

    it('the All form has no Rename / Delete here either', () => {
      openAll();
      render(<CompanyScreen />);
      expect(screen.queryByRole('button', { name: /rename|delete/i })).toBeNull();
    });

    it('moving between shells keeps the open section', () => {
      openCompany(RUST.id);
      render(<CompanyScreen />);
      pick(ENVELOPE);
      act(() => shell.set('desk'));
      expect(mounted()).toEqual(['ping-contour-drawer-stub']);
    });
  });
});
