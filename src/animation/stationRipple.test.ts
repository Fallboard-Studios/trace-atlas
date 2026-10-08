// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

import {
  playStationRipple,
  stationRippleKey,
  stationRippleStops,
  STATION_RIPPLE_HOLE,
  STATION_RIPPLE_WIDTH,
} from './stationRipple';
import { getTimeline, killAllTimelines } from './timelineMap';
import { RIPPLE_OPACITY } from '../components/robot/gem/haloRipple';
import { setRef, clearRefs } from '../utils/refs';
import { STATION_ARC_SECONDS } from '../constants';

// Real tween values: vitest.setup.ts mocks gsap globally.
vi.unmock('gsap');

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const STATION_ID = 'station-1';

/** The front fragment's ripple: a circle and a five-stop gradient, as ChargingStation draws it. */
function mountFront(stationId = STATION_ID) {
  const svg = document.body.appendChild(document.createElementNS(SVG_NS, 'svg'));
  const front = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  const defs = front.appendChild(document.createElementNS(SVG_NS, 'defs'));
  const gradient = defs.appendChild(document.createElementNS(SVG_NS, 'radialGradient'));
  gradient.setAttribute('id', `station-ripple-${stationId}`);
  const stops = Array.from({ length: 5 }, () => gradient.appendChild(document.createElementNS(SVG_NS, 'stop')));
  const circle = front.appendChild(document.createElementNS(SVG_NS, 'circle'));
  circle.setAttribute('class', 'station__ripple');
  circle.setAttribute('opacity', '0');
  setRef(`station-front-${stationId}`, front);
  return { front, circle, stops };
}

const ringAt = (kind: 'spawn' | 'despawn', u: number) => stationRippleStops(kind, u)[2].offset;

beforeAll(() => gsap.globalTimeline.pause());
afterAll(() => gsap.globalTimeline.resume());
afterEach(() => {
  killAllTimelines();
  clearRefs();
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('stationRippleStops (spec §1.6 — one whole cycle per arc, ring width 0.2)', () => {
  it('spawn (an exit) runs outward from the hole to the edge; despawn (an entry) runs inward', () => {
    expect(ringAt('spawn', 0)).toBeCloseTo(STATION_RIPPLE_HOLE, 9);
    expect(ringAt('spawn', 0.5)).toBeCloseTo((STATION_RIPPLE_HOLE + 1) / 2, 9);
    expect(ringAt('spawn', 0.25)).toBeLessThan(ringAt('spawn', 0.75));
    expect(ringAt('despawn', 0)).toBeCloseTo(1, 9);
    expect(ringAt('despawn', 0.5)).toBeCloseTo((STATION_RIPPLE_HOLE + 1) / 2, 9);
    expect(ringAt('despawn', 0.25)).toBeGreaterThan(ringAt('despawn', 0.75));
  });

  it('five stops: clear, ring edge, ring peak, ring edge, clear — the ring clamped inside [hole, 1]', () => {
    const s = stationRippleStops('spawn', 0.5);
    const pos = (STATION_RIPPLE_HOLE + 1) / 2;
    expect(s.map((x) => x.offset)).toEqual([0, pos - STATION_RIPPLE_WIDTH, pos, pos + STATION_RIPPLE_WIDTH, 1].map((v) => expect.closeTo(v, 9)));
    expect(s.map((x) => x.opacity)).toEqual([0, 0, RIPPLE_OPACITY, 0, 0]);
    const nearHole = stationRippleStops('spawn', 0.05);
    expect(nearHole[1].offset).toBe(STATION_RIPPLE_HOLE);
    const nearEdge = stationRippleStops('spawn', 0.95);
    expect(nearEdge[3].offset).toBe(1);
  });

  it('fades in over the first 10 % of the arc and out over the last 10 %', () => {
    expect(stationRippleStops('spawn', 0)[2].opacity).toBe(0);
    expect(stationRippleStops('spawn', 0.05)[2].opacity).toBeCloseTo(RIPPLE_OPACITY / 2, 9);
    expect(stationRippleStops('despawn', 0.97)[2].opacity).toBeCloseTo(RIPPLE_OPACITY * 0.3, 9);
    expect(stationRippleStops('despawn', 1)[2].opacity).toBe(0);
  });
});

describe('playStationRipple', () => {
  it("plays the station's ripple over the arc in the moving robot's colour, then clears it", () => {
    const { circle, stops } = mountFront();
    const tl = playStationRipple(STATION_ID, 'spawn', '#ff8800', STATION_ARC_SECONDS)!;
    expect(tl).toBeTruthy();
    expect(getTimeline(stationRippleKey(STATION_ID))).toBe(tl);
    expect(tl.duration()).toBeCloseTo(STATION_ARC_SECONDS, 6);

    tl.progress(0.5);
    for (const stop of stops) expect(stop.getAttribute('stop-color')).toBe('#ff8800');
    expect(Number(gsap.getProperty(circle, 'opacity'))).toBe(1);
    const expected = stationRippleStops('spawn', 0.5);
    stops.forEach((stop, i) => {
      expect(Number.parseFloat(stop.getAttribute('offset')!)).toBeCloseTo(expected[i].offset * 100, 3);
      expect(Number(stop.getAttribute('stop-opacity'))).toBeCloseTo(expected[i].opacity, 3);
    });

    tl.progress(1);
    expect(Number(gsap.getProperty(circle, 'opacity'))).toBe(0);
    expect(getTimeline(stationRippleKey(STATION_ID))).toBeUndefined();
  });

  it('a ripple already running wins: the new one is skipped (twelve exits at world open play one)', () => {
    const { stops } = mountFront();
    const first = playStationRipple(STATION_ID, 'spawn', '#ff8800', STATION_ARC_SECONDS)!;
    first.progress(0.3);
    expect(playStationRipple(STATION_ID, 'despawn', '#00ff00', STATION_ARC_SECONDS)).toBeNull();
    expect(getTimeline(stationRippleKey(STATION_ID))).toBe(first);
    first.progress(0.5);
    expect(stops[2].getAttribute('stop-color')).toBe('#ff8800');
    // Once it has finished, the next one plays.
    first.progress(1);
    expect(playStationRipple(STATION_ID, 'despawn', '#00ff00', STATION_ARC_SECONDS)).not.toBeNull();
  });

  it('runs for the duration it is given (the reduced-motion arc never asks, but the length is the caller\'s)', () => {
    const { stops } = mountFront();
    const tl = playStationRipple(STATION_ID, 'despawn', '#fff', 2.5)!;
    expect(tl.duration()).toBeCloseTo(2.5, 6);
    tl.time(1.25); // half way: the ring is half way in
    expect(Number.parseFloat(stops[2].getAttribute('offset')!)).toBeCloseTo(stationRippleStops('despawn', 0.5)[2].offset * 100, 3);
  });

  it('each station has its own ripple', () => {
    mountFront('station-0');
    mountFront('station-2');
    expect(playStationRipple('station-0', 'spawn', '#fff', STATION_ARC_SECONDS)).not.toBeNull();
    expect(playStationRipple('station-2', 'spawn', '#fff', STATION_ARC_SECONDS)).not.toBeNull();
  });

  it('no mounted station front: nothing to drive, null and no timeline', () => {
    expect(playStationRipple(STATION_ID, 'spawn', '#fff', STATION_ARC_SECONDS)).toBeNull();
    expect(getTimeline(stationRippleKey(STATION_ID))).toBeUndefined();
  });
});
