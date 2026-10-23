import { Profiler } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { MetaBox, WorldLine } from './MetaBox';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAttenuationStyleStore, DEFAULT_LOCALE_ID } from '@/stores/attenuationStyleStore';
import type { Robot } from '@/types/Robot';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 8 (spec §1.7): the meta box, the Deck's glow-glass well at the top (moved from bottom-left, 2026-10-10),
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
    const box = document.querySelector('.meta-box') as HTMLElement;
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
    expect(document.querySelector('.meta-box')).not.toBeNull();
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

describe('the clock holds its width (Crawford, 2026-10-10: the time display changes width on updates, resizing its container)', () => {
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
});

describe('the probe count and the temperature hold their widths too (Crawford, 2026-10-10: so the whole box does not keep changing width)', () => {
  it('puts the temperature in its own element, with only the reading in it', () => {
    render(<MetaBox />);
    expect(document.querySelector('.world-line__temp')?.textContent).toBe('-45°C');
  });

  it('puts "NO TEMP" in the same element before the first reading', () => {
    useUIStore.setState({ activeLocaleTemperature: null });
    render(<MetaBox />);
    expect(document.querySelector('.world-line__temp')?.textContent).toBe('NO TEMP');
  });

  it('puts the probe count in its own element, the whole sentence', () => {
    render(<MetaBox />);
    expect(document.querySelector('.world-line__count')?.textContent).toMatch(/^1 of \d+ Probes active\.$/);
  });

  it('keeps the text of each field as it was: clock and temperature, then the count', () => {
    render(<MetaBox />);
    const fields = Array.from(document.querySelectorAll('.world-line__field')).map((f) => f.textContent);
    expect(fields[0]).toBe('14:30 -45°C');
    expect(fields[1]).toMatch(/^1 of \d+ Probes active\.$/);
  });

  it('draws one of each in the world line the phone bar shares', () => {
    render(<MetaBox />);
    expect(document.querySelectorAll('.world-line__temp')).toHaveLength(1);
    expect(document.querySelectorAll('.world-line__count')).toHaveLength(1);
  });
});
