import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Profiler } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { MetaBox, WorldLine } from './MetaBox';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAttenuationStyleStore, DEFAULT_LOCALE_ID } from '@/stores/attenuationStyleStore';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { getRobotColorStyle } from '@/utils/traitColors';
import { CONTENT } from '@/content';
import { JOB_TYPE_LABELS, DOCKING_STATE_LABELS, UNASSIGNED_JOB_LABEL } from '@/data/robotSelectionConfig';
import type { Robot } from '@/types/Robot';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 8 (spec §1.7): the meta box, the Deck's glow-glass well bottom-left,
 * carries the world line — NavStatusBlock's telemetry, moved here verbatim with its tests (the first
 * describe below is NavStatusBlock.test.tsx's). Desk shell, Deck only: on a branch the breadcrumb takes
 * the corner, and on the phone the world line shows in PhoneBar's well (PhoneBar.test.tsx).
 */

const UI_INITIAL_STATE = useUIStore.getState();
const AUDIO_INITIAL_STATE = useAudioStore.getState();
const LOCALE_INITIAL_STATE = useLocaleStore.getState();
const ATTENUATION_STYLE_INITIAL_STATE = useAttenuationStyleStore.getState();
const realMatchMedia = window.matchMedia;

/** useShell's one min-width query: `desk` decides whether it matches. */
function stubShell(desk: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduced-motion') ? false : desk,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function makeRobot(id: string, overrides: Partial<Robot> = {}): Robot {
  return { id, audioMode: 'none', ...overrides } as Robot;
}

function resetStores() {
  useUIStore.setState(UI_INITIAL_STATE, true);
  useAudioStore.setState(AUDIO_INITIAL_STATE, true);
  useLocaleStore.setState(LOCALE_INITIAL_STATE, true);
  useAttenuationStyleStore.setState(ATTENUATION_STYLE_INITIAL_STATE, true);
}

beforeEach(() => {
  resetStores();
  stubShell(true);
  // The default Attenuation Style's own name is randomized/seed-derived (seedUtils.ts) unless
  // overridden — pin it to a known value so the seed-row assertions below aren't flaky.
  useAttenuationStyleStore.setState((s) => ({
    attenuationStyles: s.attenuationStyles.map((p) =>
      p.id === s.currentAttenuationStyleId ? { ...p, name: 'Pelagos' } : p,
    ),
  }));
  useLocaleStore.setState((s) => ({
    locales: {
      ...s.locales,
      [DEFAULT_LOCALE_ID]: {
        ...s.locales[DEFAULT_LOCALE_ID],
        coordinates: { x: 12, y: 68 },
        robots: [
          makeRobot('r1'),
          makeRobot('r2'),
          makeRobot('r3', { audioMode: 'mute' }),
        ],
      },
    },
  }));
  useAudioStore.setState({ soundingRobotIds: ['r1'], robotLoad: 1 });
  useUIStore.setState({ activeLocaleLocalTime: 14.5, activeLocaleTemperature: -45 });
});
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
});

describe('MetaBox — the world line (NavStatusBlock’s telemetry, moved verbatim)', () => {
  it('renders the seed row as "Viewing {AttenuationStyle} @ ({x}, {y})."', () => {
    render(<MetaBox />);
    expect(screen.getByText('Viewing Pelagos @ (12, 68).')).toBeTruthy();
  });

  it('renders the robot-count row as "{emitting} of {maxAudible} Probes active."', () => {
    render(<MetaBox />);
    // r1 is sounding+audible ("emitting"); r2 is audible but outside soundingRobotIds ("limited");
    // r3 is muted ("disabled") — only r1 counts. robotLoad: 1 (Full) -> maxAudibleRobots = MAX_ROBOTS.
    expect(screen.getByText(/^1 of \d+ Probes active\.$/)).toBeTruthy();
  });

  // The clock sits in its own span (the min-width below), so the row's text is read off the field, not matched
  // as one text node.
  const timeField = () => document.querySelector('.world-line__field')!.textContent;

  it('renders the time/temp row as "{HH}:{MM} {temp}°C"', () => {
    render(<MetaBox />);
    expect(timeField()).toBe('14:30 -45°C');
  });

  // Found by the mutation check: 14.5 is a whole minute, so rounding the minute up passed the moved tests.
  it.each([
    [7.26, '07:15'], // 15.6 minutes: the clock floors, never rounds up
    [23.999, '23:59'],
    [null, '00:00'], // no clock yet reads midnight
    [25, '23:00'], // the hour clamps to the day
  ])('formats the clock at the edges (%s -> %s)', (localTime, clock) => {
    useUIStore.setState({ activeLocaleLocalTime: localTime });
    render(<MetaBox />);
    expect(timeField()).toBe(`${clock} -45°C`);
  });

  it('falls back to "NO TEMP" when temperature is null', () => {
    useUIStore.setState({ activeLocaleTemperature: null });
    render(<MetaBox />);
    expect(timeField()).toBe('14:30 NO TEMP');
  });

  it('counts every robot as emitting when the Audio Load budget system is not running (soundingRobotIds empty)', () => {
    useAudioStore.setState({ soundingRobotIds: [] });
    render(<MetaBox />);
    // r1 and r2 are audible (not muted, no solo active); r3 stays disabled (muted).
    expect(screen.getByText(/^2 of \d+ Probes active\.$/)).toBeTruthy();
  });

  it('respects solo: only the soloed robot is audible, regardless of soundingRobotIds', () => {
    useLocaleStore.setState((s) => ({
      locales: {
        ...s.locales,
        [DEFAULT_LOCALE_ID]: {
          ...s.locales[DEFAULT_LOCALE_ID],
          robots: [makeRobot('r1', { audioMode: 'solo' }), makeRobot('r2')],
        },
      },
    }));
    useAudioStore.setState({ soundingRobotIds: ['r1', 'r2'] });
    render(<MetaBox />);
    expect(screen.getByText(/^1 of \d+ Probes active\.$/)).toBeTruthy();
  });
});

describe('MetaBox — the Deck’s well on the desk shell', () => {
  it('reads as one status line: time and temperature, probes emitting, then the place', () => {
    render(<MetaBox />);
    const box = screen.getByRole('status');
    expect(box.classList.contains('meta-box')).toBe(true);
    expect(Array.from(box.querySelectorAll('.world-line__field')).map((f) => f.textContent)).toEqual([
      '14:30 -45°C',
      expect.stringMatching(/^1 of \d+ Probes active\.$/),
      'Viewing Pelagos @ (12, 68).',
    ]);
  });

  it.each(['robots', 'audioRig', 'settings', 'companies'] as const)('renders nothing while %s is open (the breadcrumb has the corner)', (tile) => {
    useUIStore.setState({ activeHubTile: tile });
    const { container } = render(<MetaBox />);
    expect(container.firstChild).toBeNull();
  });

  it('comes back on returning to the Deck', () => {
    useUIStore.setState({ activeHubTile: 'audioRig' });
    render(<MetaBox />);
    act(() => useUIStore.getState().setActiveHubTile(null));
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders nothing on the phone shell: PhoneBar’s well carries the world line there', () => {
    stubShell(false);
    const { container } = render(<MetaBox />);
    expect(container.firstChild).toBeNull();
  });

  it('WorldLine alone is the same three fields with no well around them (what PhoneBar shows)', () => {
    stubShell(false);
    const { container } = render(<WorldLine />);
    expect(container.querySelector('.meta-box')).toBeNull();
    expect(Array.from(container.querySelectorAll('.world-line__field')).map((f) => f.textContent)[0]).toBe('14:30 -45°C');
  });
});

describe('MetaBox — renders only when its line changes', () => {
  function countRenders() {
    const counter = { renders: 0 };
    render(
      <Profiler id="meta" onRender={() => counter.renders++}>
        <MetaBox />
      </Profiler>,
    );
    return counter;
  }

  // updateRobot replaces the robots array on every battery tick and swell; the line shows only a count.
  it('does not re-render on a robot change that leaves the emitting count alone (a battery tick)', () => {
    const counter = countRenders();
    const before = counter.renders;
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { batteryLevel: 40 } as Partial<Robot>));
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r2', { batteryLevel: 30 } as Partial<Robot>));
    expect(counter.renders).toBe(before);
  });

  it('re-renders with the new count when a robot is muted', () => {
    countRenders();
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { audioMode: 'mute' }));
    expect(screen.getByText(/^0 of \d+ Probes active\.$/)).toBeTruthy();
  });

  it('re-renders with the new count when the sounding set changes', () => {
    countRenders();
    act(() => useAudioStore.setState({ soundingRobotIds: [] }));
    expect(screen.getByText(/^2 of \d+ Probes active\.$/)).toBeTruthy();
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 24 (spec §1.7): robots carry no text box in the world, so a selected
// robot's line (name · job · state) and a selected company's line (name · count) read here, under the
// world line, the latest selection on top.
describe('MetaBox — the selection lines', () => {
  const ROBOT_ACCENT = '#ae5378';
  const COMPANY_ACCENT = '#b5502a';
  const robotBody = (name: string, job = 'acousticSurvey', docking = 'active') =>
    `${name} · ${JOB_TYPE_LABELS[job as keyof typeof JOB_TYPE_LABELS].humanLabel} · ${DOCKING_STATE_LABELS[docking as keyof typeof DOCKING_STATE_LABELS].humanLabel}`;

  beforeEach(() => {
    const fleet = (id: string, name: string, companyId?: string) =>
      makeRobot(id, { name, identityColor: ROBOT_ACCENT, job: 'acousticSurvey', docking: 'active', activity: 'working', companyId } as Partial<Robot>);
    useLocaleStore.setState((s) => ({
      locales: {
        ...s.locales,
        [DEFAULT_LOCALE_ID]: {
          ...s.locales[DEFAULT_LOCALE_ID],
          robots: [fleet('r1', 'Tidal Wisp', 'c1'), fleet('r2', 'Coral Drift', 'c1'), fleet('r3', 'Brine Hawk')],
          companies: [
            { id: 'c1', name: 'Rust Syndicate', color: COMPANY_ACCENT, robotIds: ['r1', 'r2'] },
            { id: 'c2', name: 'Blue Crew', color: '#3355aa', robotIds: [] },
          ],
        },
      },
    }));
  });

  const lines = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.selection-line')];
  const bodies = (container: HTMLElement) => lines(container).map((l) => l.querySelector('.selection-line__body')!.textContent);
  const captions = (container: HTMLElement) => lines(container).map((l) => l.querySelector('.selection-line__caption')!.textContent);
  const pick = (patch: Partial<ReturnType<typeof useUIStore.getState>>) => act(() => useUIStore.setState(patch));

  it('has no selection line with nothing selected: the world line alone', () => {
    const { container } = render(<MetaBox />);
    expect(lines(container)).toHaveLength(0);
    expect(screen.getByRole('status').children).toHaveLength(1);
  });

  it('a selected robot reads name · job · docking state, captioned as a probe', () => {
    pick({ selectedRobotId: 'r1' });
    const { container } = render(<MetaBox />);
    expect(bodies(container)).toEqual([robotBody('Tidal Wisp')]);
    expect(captions(container)).toEqual([CONTENT['nav.status.selectedRobot'].human]);
  });

  it('a robot with no job yet reads the unassigned job', () => {
    useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { job: undefined } as Partial<Robot>);
    pick({ selectedRobotId: 'r1' });
    const { container } = render(<MetaBox />);
    expect(bodies(container)[0]).toBe(`Tidal Wisp · ${UNASSIGNED_JOB_LABEL.humanLabel} · ${DOCKING_STATE_LABELS.active.humanLabel}`);
  });

  it("a robot with no name reads by its id, as the roster's tile does", () => {
    useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { name: '' } as Partial<Robot>);
    pick({ selectedRobotId: 'r1' });
    const { container } = render(<MetaBox />);
    expect(bodies(container)).toEqual([robotBody('r1')]);
  });

  it('keeps the order of picks made while the box was hidden (a branch open): the latest is on top when it returns', () => {
    pick({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    const { container } = render(<MetaBox />);
    pick({ selectedCompanyId: 'c1' });
    pick({ activeHubTile: null });
    expect(captions(container)).toEqual([CONTENT['nav.status.selectedCompany'].human, CONTENT['nav.status.selectedRobot'].human]);
  });

  it('a selected company reads name · member count, captioned as a company', () => {
    pick({ selectedCompanyId: 'c1' });
    const { container } = render(<MetaBox />);
    expect(bodies(container)).toEqual(['Rust Syndicate · 2 probes']);
    expect(captions(container)).toEqual([CONTENT['nav.status.selectedCompany'].human]);
  });

  it.each([
    ['c2', 'Blue Crew · 0 probes'],
  ])('counts a company by its members: %s reads %s', (id, body) => {
    pick({ selectedCompanyId: id });
    const { container } = render(<MetaBox />);
    expect(bodies(container)).toEqual([body]);
  });

  it('counts one member in the singular', () => {
    useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r2', null);
    pick({ selectedCompanyId: 'c1' });
    const { container } = render(<MetaBox />);
    expect(bodies(container)).toEqual(['Rust Syndicate · 1 probe']);
  });

  it('All Probes is not a company: it adds no line', () => {
    pick({ allProbesSelected: true });
    const { container } = render(<MetaBox />);
    expect(lines(container)).toHaveLength(0);
  });

  it('the world line stays first, the selection lines under it', () => {
    pick({ selectedRobotId: 'r1', selectedCompanyId: 'c1' });
    render(<MetaBox />);
    const box = screen.getByRole('status');
    expect(box.children).toHaveLength(3);
    expect(box.children[0].querySelector('.world-line')).toBeTruthy();
    expect(box.children[0].classList.contains('meta-box__line')).toBe(true); // the block MetaBox.css cuts with an ellipsis
    expect(box.children[1].classList.contains('selection-line')).toBe(true);
  });

  it('with both selected, the latest picked is on top: a company after a robot', () => {
    pick({ selectedRobotId: 'r1' });
    const { container } = render(<MetaBox />);
    pick({ selectedCompanyId: 'c1' });
    expect(captions(container)).toEqual([CONTENT['nav.status.selectedCompany'].human, CONTENT['nav.status.selectedRobot'].human]);
  });

  it('and a robot after a company', () => {
    pick({ selectedCompanyId: 'c1' });
    const { container } = render(<MetaBox />);
    pick({ selectedRobotId: 'r1' });
    expect(captions(container)).toEqual([CONTENT['nav.status.selectedRobot'].human, CONTENT['nav.status.selectedCompany'].human]);
  });

  it('picking another robot brings the robot line back on top', () => {
    pick({ selectedRobotId: 'r1' });
    const { container } = render(<MetaBox />);
    pick({ selectedCompanyId: 'c1' });
    pick({ selectedRobotId: 'r3' });
    expect(captions(container)[0]).toBe(CONTENT['nav.status.selectedRobot'].human);
    expect(bodies(container)[0]).toBe(robotBody('Brine Hawk'));
  });

  it('mounted with both already selected, the robot is on top', () => {
    pick({ selectedRobotId: 'r1', selectedCompanyId: 'c1' });
    const { container } = render(<MetaBox />);
    expect(captions(container)).toEqual([CONTENT['nav.status.selectedRobot'].human, CONTENT['nav.status.selectedCompany'].human]);
  });

  it('clearing the top line leaves the other', () => {
    pick({ selectedRobotId: 'r1' });
    const { container } = render(<MetaBox />);
    pick({ selectedCompanyId: 'c1' });
    pick({ selectedCompanyId: null });
    expect(captions(container)).toEqual([CONTENT['nav.status.selectedRobot'].human]);
  });

  it("each line wears its own accent: the robot's identityColor, the company's colour", () => {
    pick({ selectedRobotId: 'r1', selectedCompanyId: 'c1' });
    const { container } = render(<MetaBox />);
    const [robotLine, companyLine] = lines(container);
    const accentOf = (color: string) => String(getRobotColorStyle(color)['--color-accent' as never]);
    expect(robotLine.style.getPropertyValue('--color-accent')).toBe(accentOf(ROBOT_ACCENT));
    expect(companyLine.style.getPropertyValue('--color-accent')).toBe(accentOf(COMPANY_ACCENT));
    expect(accentOf(ROBOT_ACCENT)).not.toBe(accentOf(COMPANY_ACCENT));
  });

  it('a selected id that names nothing adds no line (a stale selection)', () => {
    pick({ selectedRobotId: 'gone', selectedCompanyId: 'gone' });
    const { container } = render(<MetaBox />);
    expect(lines(container)).toHaveLength(0);
  });

  it('follows the store: a rename and a member leaving show at once', () => {
    pick({ selectedRobotId: 'r1', selectedCompanyId: 'c1' });
    const { container } = render(<MetaBox />);
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { name: 'Brine Moth', docking: 'docked' } as Partial<Robot>));
    act(() => useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r2', null));
    expect(bodies(container)).toEqual([robotBody('Brine Moth', 'acousticSurvey', 'docked'), 'Rust Syndicate · 1 probe']);
  });

  it('adds no line off the Deck, as before: the breadcrumb has the corner', () => {
    pick({ selectedRobotId: 'r1', activeHubTile: 'robots' });
    const { container } = render(<MetaBox />);
    expect(container.firstChild).toBeNull();
  });

  it('does not re-render on another robot’s battery tick while a robot and a company are selected', () => {
    pick({ selectedRobotId: 'r1', selectedCompanyId: 'c1' });
    const counter = { renders: 0 };
    render(
      <Profiler id="meta" onRender={() => counter.renders++}>
        <MetaBox />
      </Profiler>,
    );
    const before = counter.renders;
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r3', { batteryLevel: 12 } as Partial<Robot>));
    expect(counter.renders).toBe(before);
  });
});

describe('MetaBox.css — the glow-glass well bottom-left of the Deck', () => {
  const css = readFileSync(resolve(__dirname, 'MetaBox.css'), 'utf8');
  const paneCss = readFileSync(resolve(__dirname, '../console/ContentPane.css'), 'utf8');
  const declaration = (body: string | null, property: string) => body?.match(new RegExp(`(?:^|\\s)${property}:\\s*([^;]+);`))?.[1].trim();

  it('sits in the corner the content surface and the breadcrumb use on the other views', () => {
    const box = getCssRuleBody(css, '.meta-box');
    const pane = getCssRuleBody(paneCss, '.content-pane');
    expect(declaration(box, 'position')).toBe('absolute');
    expect(declaration(box, 'left')).toBe(declaration(pane, 'left'));
    expect(declaration(box, 'bottom')).toBe(declaration(pane, 'bottom'));
  });

  it('is a well in the shared tokens, a readout that never takes a click meant for the world', () => {
    const box = getCssRuleBody(css, '.meta-box');
    expect(box).toContain('background: var(--well-background);');
    expect(box).toContain('box-shadow: var(--well-inset), inset 0 0 8px var(--color-accent);');
    expect(box).toContain('border: 1px solid var(--color-accent);');
    expect(box).toContain('pointer-events: none;');
  });

  it('holds one line, cut short with an ellipsis rather than wrapping or overflowing the screen', () => {
    const box = getCssRuleBody(css, '.meta-box');
    for (const d of ['white-space: nowrap;', 'overflow: hidden;', 'text-overflow: ellipsis;']) expect(box).toContain(d);
    expect(declaration(box, 'max-width')).toMatch(/var\(--nav-panel-width\)/);
  });
});

describe('the clock holds its width (Crawford, 2026-10-10: the time display changes width on updates, resizing its container)', () => {
  const css = readFileSync(resolve(__dirname, 'MetaBox.css'), 'utf8');
  const clock = () => document.querySelector('.world-line__clock');

  it.each([
    [14.5, '14:30'],
    [11.25, '11:15'],
    [0, '00:00'],
    [null, '00:00'],
    [23.999, '23:59'],
  ])('puts the clock (%s -> %s) in its own element, with only the time in it', (localTime, text) => {
    useUIStore.setState({ activeLocaleLocalTime: localTime });
    render(<MetaBox />);
    expect(clock()?.textContent).toBe(text);
  });

  it('keeps the time then the temperature in the first field, one space between, as before', () => {
    render(<MetaBox />);
    const field = document.querySelector('.world-line__field')!;
    expect(field.firstElementChild).toBe(clock());
    expect(field.textContent).toBe('14:30 -45°C');
  });

  it('draws one clock, in the world line the phone bar shares', () => {
    render(<MetaBox />);
    expect(document.querySelectorAll('.world-line__clock')).toHaveLength(1);
  });

  it('is a block with a min-width wide enough for the widest time, so a tick never resizes the well', () => {
    const body = getCssRuleBody(css, '.world-line__clock');
    expect(body).not.toBeNull();
    expect(body).toContain('display: inline-block;');
    // 4 digits and a colon: at most 5 characters of the font's "0", the widest digit.
    expect(Number(body!.match(/min-width:\s*([\d.]+)ch;/)?.[1])).toBeGreaterThanOrEqual(5);
  });

  it('sets the digits at one width each, so the times that fit the min-width are all the same width', () => {
    expect(getCssRuleBody(css, '.world-line__clock')).toContain('font-variant-numeric: tabular-nums;');
  });

  it('never wraps or shrinks below the min-width inside the one-line well', () => {
    const body = getCssRuleBody(css, '.world-line__clock');
    expect(body).toContain('white-space: nowrap;');
    expect(body).toContain('flex-shrink: 0;');
  });
});

describe('MetaBox reads its copy from src/content (docs/specs/CONTENT_LAYER.md)', () => {
  it('carries no copy literal of its own', () => {
    const source = readFileSync(resolve(__dirname, 'MetaBox.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/'CORRUPT NAME'|'NO TEMP'|Probes active\.|Viewing \{/);
  });
});
