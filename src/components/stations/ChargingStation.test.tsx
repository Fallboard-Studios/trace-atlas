import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';

import { ChargingStation, type StationFragment } from './ChargingStation';
import { chargingColorsKey } from './stationOccupancy';
import { stationPaint, stationShapeCount } from './stationPaint';
import { getStationRoll, stationDials, stationGeometry, STATION_REFERENCE_DIALS } from './stationGem';
import { gemMidLitFace } from '../robot/gem/gemPalette';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { STATION_SHAPE_BUDGET } from '@/constants';
import { getStations, type Station } from '@/systems/stations';
import { spawnInitialRoster } from '@/systems/spawnSystem';
import type { Robot, RobotActivity } from '@/types/Robot';
import { getRef, clearRefs } from '@/utils/refs';

// ========================================
// HELPERS
// ========================================
const STATION: Station = { id: 'station-0', center: { x: 600, y: 320 }, port: { x: 600, y: 320 }, capacity: 6, gemSeed: 424242 };
const OTHER: Station = { ...STATION, id: 'station-1', center: { x: 1300, y: 400 }, port: { x: 1300, y: 400 }, gemSeed: 77 };
const FRAGMENTS: StationFragment[] = ['l4', 'l3', 'front'];

function robot(id: string, identityColor: string, stationId?: string, activity?: RobotActivity): Robot {
  return {
    id,
    identityColor,
    position: { x: 0, y: 0 },
    batteryLevel: 80,
    docking: 'active',
    ...(stationId ? { stationId } : {}),
    ...(activity ? { activity } : {}),
  } as Robot;
}

function setRobots(robots: Robot[]) {
  useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots, actors: [] } } });
}

function renderAll(station: Station = STATION) {
  return render(
    <svg>
      {FRAGMENTS.map((f) => (
        <ChargingStation key={f} localeId={DEFAULT_LOCALE_ID} station={station} fragment={f} />
      ))}
    </svg>,
  );
}

/** Drawn shapes: every graphic element outside <defs>. */
const drawn = (root: Element) => Array.from(root.querySelectorAll('path, circle, polygon, rect, polyline, ellipse, line')).filter((el) => !el.closest('defs'));

// ========================================
// TESTS
// ========================================
describe('ChargingStation (Phase 43 Task 20, spec §1.6)', () => {
  beforeEach(() => {
    setRobots([]);
    useAudioStore.setState({ globalAudio: structuredClone(DEFAULT_GLOBAL_AUDIO_SETTINGS) });
  });
  afterEach(cleanup);

  it('draws each fragment as its own group at the station centre, decorative and click-through', () => {
    const { container } = renderAll();
    const groups = Array.from(container.querySelectorAll('g.station'));
    expect(groups.map((g) => g.getAttribute('data-station-fragment'))).toEqual(FRAGMENTS);
    for (const g of groups) {
      expect(g.getAttribute('data-station-id')).toBe('station-0');
      expect(g.getAttribute('transform')).toBe('translate(600 320)');
      expect(g.getAttribute('pointer-events')).toBe('none');
      expect(g.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('l4 is the one backing piece; l3 is L3; front is L2, the halo and ripple, then L1', () => {
    const { container } = renderAll();
    const paint = stationPaint(stationGeometry(getStationRoll(STATION.gemSeed), STATION_REFERENCE_DIALS), getStationRoll(STATION.gemSeed).accent, []);
    const frag = (f: StationFragment) => container.querySelector(`g[data-station-fragment="${f}"]`)!;
    expect(drawn(frag('l4')).map((el) => el.getAttribute('d'))).toEqual(paint.l4.map((s) => s.d));
    expect(drawn(frag('l3')).map((el) => el.getAttribute('d'))).toEqual(paint.l3.map((s) => s.d));
    const front = drawn(frag('front'));
    const circles = front.filter((el) => el.tagName === 'circle');
    expect(circles.map((c) => c.getAttribute('class'))).toEqual(['station__halo', 'station__ripple']);
    expect(front.slice(0, paint.l2.length).map((el) => el.getAttribute('d'))).toEqual(paint.l2.map((s) => s.d));
    expect(front.slice(paint.l2.length + 2).map((el) => el.getAttribute('d'))).toEqual(paint.l1.map((s) => s.d));
  });

  it(`stays within STATION_SHAPE_BUDGET (${STATION_SHAPE_BUDGET}) drawn shapes, empty and full (counted in the DOM)`, () => {
    for (const n of [0, 1, 3, 5, 6]) {
      setRobots(Array.from({ length: n }, (_, i) => robot(`r${i}`, Object.values(ACCENT_COLORS)[i], 'station-0', 'charging')));
      const { container, unmount } = renderAll();
      const count = drawn(container).length;
      const roll = getStationRoll(STATION.gemSeed);
      const lit = Object.values(ACCENT_COLORS).slice(0, n);
      expect(count, `${n} charging`).toBe(stationShapeCount(stationPaint(stationGeometry(roll, STATION_REFERENCE_DIALS), roll.accent, lit)));
      expect(count, `${n} charging`).toBeLessThanOrEqual(STATION_SHAPE_BUDGET);
      unmount();
    }
  });

  it("lights one slot per robot charging here, in its lit-Mid colour — not other stations' robots, not exiting ones", () => {
    setRobots([
      robot('a', ACCENT_COLORS.red, 'station-0', 'charging'),
      robot('b', ACCENT_COLORS.teal, 'station-1', 'charging'),
      robot('c', ACCENT_COLORS.lime, 'station-0', 'exiting'),
      robot('d', ACCENT_COLORS.indigo, 'station-0', 'charging'),
      robot('e', ACCENT_COLORS.pink),
    ]);
    const { container } = renderAll();
    const fills = drawn(container).map((el) => el.getAttribute('fill'));
    expect(fills).toContain(gemMidLitFace(ACCENT_COLORS.red));
    expect(fills).toContain(gemMidLitFace(ACCENT_COLORS.indigo));
    expect(fills).not.toContain(gemMidLitFace(ACCENT_COLORS.teal));
    expect(fills).not.toContain(gemMidLitFace(ACCENT_COLORS.lime));
    // Both lit slots are L3's (slots 0 and 1 fill first).
    const l3 = drawn(container.querySelector('g[data-station-fragment="l3"]')!).map((el) => el.getAttribute('fill'));
    expect(l3).toEqual(expect.arrayContaining([gemMidLitFace(ACCENT_COLORS.red), gemMidLitFace(ACCENT_COLORS.indigo)]));
  });

  it('a freshly spawned roster lights exactly its Docked robots, each at its own station (Task 21)', () => {
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    spawnInitialRoster(DEFAULT_LOCALE_ID);
    const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
    const docked = robots.filter((r) => r.docking === 'docked');
    expect(docked.length).toBeGreaterThan(0);
    let litTotal = 0;
    for (const station of getStations(DEFAULT_LOCALE_ID)) {
      const here = docked.filter((r) => r.stationId === station.id).map((r) => r.identityColor);
      const roll = getStationRoll(station.gemSeed);
      const { container, unmount } = renderAll(station);
      expect(drawn(container).length, station.id).toBe(stationShapeCount(stationPaint(stationGeometry(roll, STATION_REFERENCE_DIALS), roll.accent, here)));
      const fills = drawn(container).map((el) => el.getAttribute('fill'));
      for (const c of here) expect(fills).toContain(gemMidLitFace(c));
      litTotal += here.length;
      unmount();
    }
    expect(litTotal).toBe(docked.length);
  });

  it('chargingColorsKey: identity colours of the robots charging at one station, in roster order', () => {
    const robots = [
      robot('a', ACCENT_COLORS.red, 'station-0', 'charging'),
      robot('b', ACCENT_COLORS.teal, 'station-0', 'returning'),
      robot('c', ACCENT_COLORS.lime, 'station-0', 'charging'),
      robot('d', ACCENT_COLORS.indigo, 'station-1', 'charging'),
    ];
    expect(chargingColorsKey(robots, 'station-0')).toBe(`${ACCENT_COLORS.red},${ACCENT_COLORS.lime}`);
    expect(chargingColorsKey(robots, 'station-2')).toBe('');
    expect(chargingColorsKey(undefined, 'station-0')).toBe('');
    // Until Task 21 writes the fields, no robot has them: nothing is lit.
    expect(chargingColorsKey([robot('x', ACCENT_COLORS.red)], 'station-0')).toBe('');
  });

  it('a battery tick on an unrelated robot does not re-render the station', () => {
    setRobots([robot('a', ACCENT_COLORS.red, 'station-0', 'charging'), robot('z', ACCENT_COLORS.teal)]);
    const onRender = vi.fn();
    render(
      <Profiler id="station" onRender={onRender}>
        <svg>
          {FRAGMENTS.map((f) => (
            <ChargingStation key={f} localeId={DEFAULT_LOCALE_ID} station={STATION} fragment={f} />
          ))}
        </svg>
      </Profiler>,
    );
    const mounted = onRender.mock.calls.length;
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'z', { batteryLevel: 41 }));
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'a', { batteryLevel: 42 }));
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'z', { position: { x: 5, y: 5 } }));
    expect(onRender.mock.calls.length).toBe(mounted);
    // A robot arriving to charge here does re-render it.
    act(() => useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'z', { stationId: 'station-0', activity: 'charging' } as unknown as Partial<Robot>));
    expect(onRender.mock.calls.length).toBeGreaterThan(mounted);
  });

  it('the world rig deforms it live, without re-rolling it: an EQ3 mid drag moves the paths, the accent and slots stay', () => {
    setRobots([robot('a', ACCENT_COLORS.red, 'station-0', 'charging')]);
    const { container } = renderAll();
    const before = drawn(container).map((el) => el.getAttribute('d'));
    const fillsBefore = drawn(container).map((el) => el.getAttribute('fill'));
    act(() => useAudioStore.setState({ globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, eq3: { low: 0, mid: 12, high: 0 } } }));
    const after = drawn(container).map((el) => el.getAttribute('d'));
    expect(after).not.toEqual(before);
    expect(drawn(container).map((el) => el.getAttribute('fill'))).toEqual(fillsBefore);
    const roll = getStationRoll(STATION.gemSeed);
    const expected = stationPaint(
      stationGeometry(roll, stationDials({ hpfHz: 20, lpfHz: 20000, eqLow: 0, eqMid: 12, eqHigh: 0 })),
      roll.accent,
      [ACCENT_COLORS.red],
    );
    expect(drawn(container.querySelector('g[data-station-fragment="l4"]')!).map((el) => el.getAttribute('d'))).toEqual(expected.l4.map((s) => s.d));
  });

  it('the halo brightens with occupancy; the ripple is in place but invisible (Task 23 runs it)', () => {
    const halo = () => document.querySelector('circle.station__halo')!;
    const { unmount } = renderAll();
    const empty = Number(halo().getAttribute('opacity'));
    unmount();
    setRobots(Array.from({ length: 6 }, (_, i) => robot(`r${i}`, Object.values(ACCENT_COLORS)[i], 'station-0', 'charging')));
    renderAll();
    expect(Number(halo().getAttribute('opacity'))).toBeGreaterThan(empty);
    expect(halo().getAttribute('fill')).toBe('url(#station-halo-station-0)');
    expect(document.querySelector('radialGradient#station-halo-station-0')).not.toBeNull();
    const ripple = document.querySelector('circle.station__ripple')!;
    expect(ripple.getAttribute('opacity')).toBe('0');
    expect(ripple.getAttribute('fill')).toBe('url(#station-ripple-station-0)');
    expect(document.querySelector('radialGradient#station-ripple-station-0')).not.toBeNull();
  });

  it('two stations in one world have different looks and their own gradient ids', () => {
    const { container } = render(
      <svg>
        <ChargingStation localeId={DEFAULT_LOCALE_ID} station={STATION} fragment="front" />
        <ChargingStation localeId={DEFAULT_LOCALE_ID} station={OTHER} fragment="front" />
      </svg>,
    );
    const ids = Array.from(container.querySelectorAll('radialGradient')).map((g) => g.id);
    expect(new Set(ids).size).toBe(4);
    const [a, b] = Array.from(container.querySelectorAll('g.station')).map((g) => drawn(g).map((el) => el.getAttribute('d')).join());
    expect(a).not.toEqual(b);
  });

  it("registers the front fragment as station-front-<id> for the work loop's ripple (Task 23), and only the front", () => {
    clearRefs();
    const { container, unmount } = renderAll();
    const front = container.querySelector('g[data-station-fragment="front"]');
    expect(getRef('station-front-station-0')).toBe(front);
    unmount();
    expect(getRef('station-front-station-0')).toBeUndefined();
    // The back fragments hold no ripple: alone, they register nothing.
    render(
      <svg>
        <ChargingStation localeId={DEFAULT_LOCALE_ID} station={STATION} fragment="l4" />
        <ChargingStation localeId={DEFAULT_LOCALE_ID} station={STATION} fragment="l3" />
      </svg>,
    );
    expect(getRef('station-front-station-0')).toBeUndefined();
  });
});
