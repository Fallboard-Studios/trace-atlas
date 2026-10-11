import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 21 (spec §1.5): the roster board — the head (All Probes, + New
 * Company), one intro, then a row per group from rosterRows(): the company's name box and count, then its
 * member tiles. No filter.
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

// Spied, still delegating: the board calls rosterRows once in its own body on every render, so the
// call count is the board's render count — a Profiler would also count the tiles, which re-render on
// their own robot's writes by design (the backlog item 27 pattern RobotsTab used).
vi.mock('@/utils/rosterRows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/rosterRows')>();
  return { ...actual, rosterRows: vi.fn(actual.rosterRows) };
});

// Spied the same way: each tile face calls useRobotMeta once per render, so the calls naming a robot
// count that robot's tile renders.
vi.mock('./useRobotMeta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useRobotMeta')>();
  return { ...actual, useRobotMeta: vi.fn(actual.useRobotMeta) };
});

import { RosterBoard } from './RosterBoard';
import { useRobotMeta } from './useRobotMeta';
import { rosterRows } from '@/utils/rosterRows';
import { CONTENT, fill } from '@/content';
import { MAX_COMPANIES } from '@/constants';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import type { Company } from '@/types/Company';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';

const localeId = getActiveLocaleId();
const FREELANCE = CONTENT['company.assign'].options.freelance.human;
const ALL_PROBES = CONTENT['probe.all'].human;
const NEW_COMPANY = CONTENT['nav.entity.newCompany'].human;

function makeRobot(id: string, companyId?: string): Robot {
  return {
    id,
    name: `Unit ${id}`,
    identityColor: '#ae5378',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' },
    octaveRange: [3, 4],
    createdAt: 0,
    masterVolume: 0.7,
    docking: 'active',
    activity: 'working',
    batteryLevel: 80,
    audioMode: 'none',
    gemSeed: 1,
    companyId,
  } as unknown as Robot;
}

const company = (id: string, name: string, color = '#428d95'): Company => ({ id, name, color, robotIds: [] });

/** Seeds the locale: companies in order, then robots (assigned through the store, as the app does). */
function seed(companies: Company[], robots: Robot[]) {
  useLocaleStore.getState().setLocaleData(localeId, { companies, robots } as unknown as Partial<Locale>);
}

const rows = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.roster-board__row')];
const rowNamed = (name: string) => screen.getByRole('group', { name });
const tileNames = (row: HTMLElement) => [...row.querySelectorAll('.roster-tile__name')].map((n) => n.textContent);
const countOf = (row: HTMLElement) => row.querySelector('.roster-board__count')?.textContent;

beforeEach(() => {
  shell.set('desk');
  useUIStore.setState(useUIStore.getInitialState(), true);
  seed([], []);
  vi.mocked(rosterRows).mockClear();
});

describe('RosterBoard — rows per group', () => {
  it('renders a row per company in locale order, Freelance last, each with its members and count', () => {
    seed(
      [company('iron', 'Iron Crew'), company('rust', 'Rust Syndicate'), company('tide', 'Tide Union')],
      [makeRobot('r0', 'rust'), makeRobot('r1'), makeRobot('r2', 'iron'), makeRobot('r3', 'rust'), makeRobot('r4', 'tide')],
    );
    const { container } = render(<RosterBoard />);
    expect(rows(container).map((row) => row.getAttribute('aria-label'))).toEqual(['Iron Crew', 'Rust Syndicate', 'Tide Union', FREELANCE]);
    expect(tileNames(rowNamed('Rust Syndicate'))).toEqual(['Unit r0', 'Unit r3']);
    expect(tileNames(rowNamed(FREELANCE))).toEqual(['Unit r1']);
    expect(countOf(rowNamed('Rust Syndicate'))).toBe(fill('probe.roster.count', { n: '2' }));
  });

  it('counts one member as "1 probe" and none as "0 probes", and keeps an empty company\'s row', () => {
    seed([company('iron', 'Iron Crew'), company('empty', 'New Co')], [makeRobot('r0', 'iron')]);
    render(<RosterBoard />);
    expect(countOf(rowNamed('Iron Crew'))).toBe(CONTENT['probe.roster.count.one'].human);
    expect(countOf(rowNamed('New Co'))).toBe(fill('probe.roster.count', { n: '0' }));
    expect(tileNames(rowNamed('New Co'))).toEqual([]);
    expect(countOf(rowNamed(FREELANCE))).toBe(fill('probe.roster.count', { n: '0' }));
  });

  it('renders MAX_COMPANIES companies plus Freelance as seven rows', () => {
    const companies = Array.from({ length: MAX_COMPANIES }, (_, i) => company(`c${i}`, `Company ${i}`));
    seed(companies, Array.from({ length: 12 }, (_, i) => makeRobot(`r${i}`, i < 6 ? `c${i}` : undefined)));
    const { container } = render(<RosterBoard />);
    expect(rows(container)).toHaveLength(7);
    expect(rows(container).at(-1)?.getAttribute('aria-label')).toBe(FREELANCE);
    expect(container.querySelectorAll('.roster-tile')).toHaveLength(12);
  });

  it('has no filter: no filter control, no radio, every robot on the board at once', () => {
    seed([company('iron', 'Iron Crew')], [makeRobot('r0', 'iron'), makeRobot('r1')]);
    useUIStore.getState().selectCompany('iron');
    render(<RosterBoard />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText(/filter/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Unit r1' })).toBeTruthy();
  });

  it('moves a tile to its new row when the store reassigns it, and the counts follow', () => {
    seed([company('iron', 'Iron Crew')], [makeRobot('r0'), makeRobot('r1')]);
    render(<RosterBoard />);
    act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r0', 'iron'));
    expect(tileNames(rowNamed('Iron Crew'))).toEqual(['Unit r0']);
    expect(tileNames(rowNamed(FREELANCE))).toEqual(['Unit r1']);
    expect(countOf(rowNamed('Iron Crew'))).toBe(CONTENT['probe.roster.count.one'].human);
  });
});

describe('RosterBoard — the leading cell', () => {
  it('a company\'s name box opens that company, through navActions', () => {
    seed([company('rust', 'Rust Syndicate')], [makeRobot('r0', 'rust')]);
    render(<RosterBoard />);
    fireEvent.click(within(rowNamed('Rust Syndicate')).getByRole('button', { name: 'Rust Syndicate' }));
    const s = useUIStore.getState();
    expect(s.selectedCompanyId).toBe('rust');
    expect(s.activeHubTile).toBe('companies');
    expect(s.selectedRobotId).toBeNull();
  });

  it('Freelance is a label, not a button: there is no Freelance company to open', () => {
    seed([], [makeRobot('r0')]);
    render(<RosterBoard />);
    const row = rowNamed(FREELANCE);
    expect(within(row).queryByRole('button', { name: FREELANCE })).toBeNull();
    expect(row.querySelector('.roster-board__name')?.textContent).toBe(FREELANCE);
  });

  it('a company row sits in the company\'s colour; Freelance in the companies trait colour', () => {
    seed([company('rust', 'Rust Syndicate', '#b7410e')], []);
    render(<RosterBoard />);
    const expectAccent = (row: HTMLElement, style: Record<string, unknown>) => {
      for (const [property, value] of Object.entries(style)) expect(row.style.getPropertyValue(property), property).toBe(String(value));
    };
    expectAccent(rowNamed('Rust Syndicate'), getRobotColorStyle('#b7410e') as Record<string, unknown>);
    expectAccent(rowNamed(FREELANCE), getTraitColorStyle('company') as Record<string, unknown>);
  });

  it('names a renamed company as the store does', () => {
    seed([company('rust', 'Rust Syndicate')], []);
    render(<RosterBoard />);
    act(() => useLocaleStore.getState().updateCompany(localeId, 'rust', { name: 'Rust Union' }));
    expect(rowNamed('Rust Union')).toBeTruthy();
  });
});

describe('RosterBoard — the head', () => {
  it('All Probes opens the All form: allProbesSelected, the Probes branch', () => {
    useUIStore.getState().selectCompany('x');
    render(<RosterBoard />);
    fireEvent.click(screen.getByRole('button', { name: ALL_PROBES }));
    const s = useUIStore.getState();
    expect(s.allProbesSelected).toBe(true);
    expect(s.activeHubTile).toBe('robots');
    expect(s.selectedCompanyId).toBeNull();
  });

  it('+ New Company discloses the staged create form inline, mounted only while open', () => {
    render(<RosterBoard />);
    const toggle = screen.getByRole('button', { name: NEW_COMPANY });
    // { hidden: true }: the region is `hidden` while closed, which a plain role query skips anyway, so
    // only this sees whether the form is mounted under it.
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox', { hidden: true })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const region = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(region.hidden).toBe(false);
    expect(within(region).getByRole('textbox')).toBeTruthy();
    fireEvent.click(toggle);
    expect(region.hidden).toBe(true);
    expect(screen.queryByRole('textbox', { hidden: true })).toBeNull();
  });

  it('a company created from the head gets its row, before Freelance', () => {
    render(<RosterBoard />);
    fireEvent.click(screen.getByRole('button', { name: NEW_COMPANY }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Deep Crew' } });
    fireEvent.click(screen.getByRole('button', { name: fill('company.create', { name: 'Deep Crew' }) }));
    expect(rows(document.body).map((row) => row.getAttribute('aria-label'))).toEqual(['Deep Crew', FREELANCE]);
  });

  it('the phone shell shows the short faces, keeping the full names', () => {
    shell.set('phone');
    const { container } = render(<RosterBoard />);
    const all = screen.getByRole('button', { name: ALL_PROBES });
    const create = screen.getByRole('button', { name: NEW_COMPANY });
    expect(all.textContent).toContain(CONTENT['probe.all'].short);
    expect(all.textContent).not.toContain(ALL_PROBES);
    expect(create.textContent).toContain(CONTENT['nav.entity.newCompany'].short);
    expect(container.querySelector('.roster-board--phone')).toBeTruthy();
  });

  it('opens with the Probes intro, as an expander', () => {
    render(<RosterBoard />);
    expect(screen.getByText(CONTENT['probe.root'].intro.lore)).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('ui.intro.more', { name: CONTENT['probe.root'].human }) })).toBeTruthy();
  });
});

describe('RosterBoard — re-render discipline (backlog item 27)', () => {
  it('a robot\'s volume, battery or job changing does not re-render the board', () => {
    seed([company('iron', 'Iron Crew')], [makeRobot('r0', 'iron'), makeRobot('r1')]);
    render(<RosterBoard />);
    const before = vi.mocked(rosterRows).mock.calls.length;
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r0', { masterVolume: 0.1 }));
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 12, job: 'salvage' }));
    expect(vi.mocked(rosterRows).mock.calls.length).toBe(before);
  });

  it('when the board does re-render, a tile whose robot did not change does not', () => {
    seed([company('iron', 'Iron Crew')], [makeRobot('r0'), makeRobot('r1')]);
    render(<RosterBoard />);
    const rendersOf = (id: string) => vi.mocked(useRobotMeta).mock.calls.filter(([robot]) => robot.id === id).length;
    const r0Before = rendersOf('r0');
    act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r1', 'iron'));
    expect(rendersOf('r0')).toBe(r0Before);
    expect(tileNames(rowNamed('Iron Crew'))).toEqual(['Unit r1']);
  });

  it('a reassignment does re-render it (the guard is not stuck)', () => {
    seed([company('iron', 'Iron Crew')], [makeRobot('r0')]);
    render(<RosterBoard />);
    const before = vi.mocked(rosterRows).mock.calls.length;
    act(() => useLocaleStore.getState().assignRobotToCompany(localeId, 'r0', 'iron'));
    expect(vi.mocked(rosterRows).mock.calls.length).toBeGreaterThan(before);
  });
});

describe('RosterBoard — layout (CSS contract)', () => {
  const css = readFileSync(resolve(__dirname, 'RosterBoard.css'), 'utf8');
  const tileCss = readFileSync(resolve(__dirname, 'RosterTile.css'), 'utf8');

  it('tiles flow right and wrap, each --roster-tile-width wide', () => {
    expect(getCssRuleBody(css, '.roster-board__tiles')).toMatch(/flex-wrap:\s*wrap/);
    expect(getCssRuleBody(tileCss, '.roster-tile')).toMatch(/width:\s*var\(--roster-tile-width\)/);
    expect(css).toMatch(/--roster-tile-width:\s*250px/);
  });

  it('the phone lists the tiles in one column, full width', () => {
    expect(getCssRuleBody(css, '.roster-board--phone .roster-board__tiles')).toMatch(/flex-direction:\s*column/);
    expect(getCssRuleBody(css, '.roster-board--phone .roster-tile')).toMatch(/width:\s*100%/);
  });
});

describe('RosterBoard reads its copy from src/content', () => {
  it('carries no copy literal of its own', () => {
    for (const file of ['RosterBoard.tsx', 'RosterTile.tsx']) {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      expect(source).not.toMatch(/(loreLabel|humanLabel|loreDescription|humanDescription)\s*:\s*['"`]/);
      expect(source).not.toMatch(/>\s*[A-Z][a-z]+[^<{]*</);
    }
  });
});
