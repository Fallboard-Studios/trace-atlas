// ========================================
// useNoteCloud (docs/specs/ROBOT_NOTE_CLOUD.md §1.3–§1.6; docs/tasks/ROBOT_NOTE_CLOUD.md Tasks 13–15)
// ========================================
// The harness renders what Robot.tsx renders round a body: a data-note-cloud box holding the two note layers either
// side of an svg, with the hook's root (a `g`) inside the svg. Events go in through emitRobotNote, as the engine
// sends them. Real GSAP: the belt is a registered timeline whose time the tests set by hand.
import { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';

vi.unmock('gsap');

// The note cloud's ?notes=off switch is read once at load; the flag lets a case turn it off.
const noteCloudSwitch = vi.hoisted(() => ({ on: true }));
vi.mock('@/utils/debugParams', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/debugParams')>()),
  isNoteCloudEnabled: () => noteCloudSwitch.on,
}));

import { useNoteCloud } from './useNoteCloud';
import { NoteCloudLayer } from './NoteCloudLayers';
import { clearNoteCloudModel } from './noteCloudModel';
import { noteLength, noteRowGeometry, noteThickness, rollBox } from './noteRows';
import { getRobotGem } from '../gem/polygon';
import { emitRobotNote, getNotePreviewSeconds, hasRobotNoteListener, type RobotNoteEvent } from '@/engine/noteEvents';
import { setWorldState } from '@/systems/worldState';
import {
  getTimeline,
  getTimelineScope,
  killAllTimelines,
  pauseWorldTimelines,
  resumeWorldTimelines,
} from '@/animation/timelineMap';
import {
  NOTE_COOL_SECONDS,
  NOTE_CROSSING_SECONDS,
  NOTE_HOT_IN_SECONDS,
  NOTE_KNOWN_AHEAD_SECONDS,
  NOTE_NOW,
  NOTE_PEAK_STRENGTH,
  NOTE_QUANTUM_UNITS,
  NOTE_WAKE_SECONDS,
} from '@/constants';

// ========================================
// FIXTURES
// ========================================
const GEM_SEED = 20261004;
const GEM = getRobotGem(GEM_SEED);

interface HarnessProps {
  robotId?: string;
  context?: 'world' | 'avatar';
  enabled?: boolean;
  scale?: number;
  color?: string;
  px?: number;
  placing?: boolean;
}

function Harness({ robotId = 'r1', context = 'world', enabled = true, scale = 1, color = '#ff0000', px = 1, placing }: HarnessProps) {
  const root = useRef<SVGGElement>(null);
  useNoteCloud({ root, robotId, context, enabled, gem: GEM, scale, color, pxPerUnit: () => px, placing });
  return (
    <div data-note-cloud="">
      <NoteCloudLayer side="behind" />
      <svg>
        <g ref={root} />
      </svg>
      <NoteCloudLayer side="front" />
    </div>
  );
}

/** Start times a second apart, so two notes never make a run of repeats unless a case means them to. */
let clock = 0;
function noteEvent(note: string, overrides: Partial<RobotNoteEvent> = {}): RobotNoteEvent {
  clock += 1;
  return { lead: 0.2, duration: 0.25, at: clock, note, ...overrides };
}

const bars = (container: HTMLElement, side: 'front' | 'behind') =>
  [...container.querySelectorAll(`.note-layer--${side} .note-layer__belt > .note`)] as HTMLElement[];
const allBars = (container: HTMLElement) => [...bars(container, 'front'), ...bars(container, 'behind')];

/** The bar's place on its belt, read back from its transform. */
function translateOf(bar: HTMLElement): { x: number; y: number } {
  const match = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/.exec(bar.style.transform);
  if (!match) throw new Error(`no translate in "${bar.style.transform}"`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

/** The belt's registered timeline for robot r1 in the world context. */
const belt = (id = 'r1', context = 'world') => getTimeline(`note-belt-${context}-${id}`);

/** Moves the belt's playhead on by `seconds`, as the ticker would. */
function advance(seconds: number, id = 'r1') {
  const tl = belt(id);
  if (!tl) throw new Error('no belt timeline');
  tl.totalTime(tl.totalTime() + seconds);
}

/** Counts writes to one style property of one element (an own accessor over the prototype's). */
function countWrites(el: HTMLElement, prop: 'transform' | 'opacity' | 'left') {
  let proto: object | null = Object.getPrototypeOf(el.style);
  let desc: PropertyDescriptor | undefined;
  while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, prop))) proto = Object.getPrototypeOf(proto);
  if (!desc?.set || !desc.get) throw new Error(`no accessor for ${prop}`);
  const { get, set } = desc;
  const counter = { writes: 0 };
  Object.defineProperty(el.style, prop, {
    configurable: true,
    get() { return get.call(this); },
    set(value) { counter.writes++; set.call(this, value); },
  });
  return counter;
}

/** The belt's offset, read back from its transform (0 before it has one). */
function beltX(container: HTMLElement, side: 'front' | 'behind' = 'front'): number {
  const el = container.querySelector(`.note-layer--${side} .note-layer__belt`) as HTMLElement;
  const match = /translate\((-?[\d.e-]+)px/.exec(el.style.transform);
  return match ? Number(match[1]) : 0;
}

beforeEach(() => {
  noteCloudSwitch.on = true;
  setReducedMotion(false);
  setWorldState('running');
  for (const id of ['r1', 'r2']) clearNoteCloudModel(id);
  // The ticker never moves a belt on its own here: the tests set its time by hand.
  gsap.globalTimeline.pause();
});

afterEach(() => {
  cleanup();
  delete (document as unknown as { hidden?: boolean }).hidden;
  killAllTimelines();
  setWorldState('cold');
  gsap.globalTimeline.resume();
});

// ========================================
// TASK 13: a triggered note places a bar
// ========================================
describe('useNoteCloud — a note places a bar (Task 13)', () => {
  it('C4 (an even pitch class) places one bar in the front layer, in the given colour', () => {
    const { container } = render(<Harness color="#ff0000" />);
    emitRobotNote('r1', noteEvent('C4'));
    expect(bars(container, 'front')).toHaveLength(1);
    expect(bars(container, 'behind')).toHaveLength(0);
    expect(bars(container, 'front')[0].style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('F4 (an odd pitch class) goes behind', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('F4'));
    expect(bars(container, 'behind')).toHaveLength(1);
    expect(bars(container, 'front')).toHaveLength(0);
  });

  it('each bar holds its white copy, and the bar is sized by noteRows', () => {
    const { container } = render(<Harness px={1} />);
    emitRobotNote('r1', noteEvent('C4', { duration: 0.5 }));
    const [bar] = bars(container, 'front');
    expect(bar.querySelectorAll(':scope > .note__hot')).toHaveLength(1);
    const roll = rollBox(GEM, 1);
    const thick = noteThickness(roll.h, 1);
    expect(parseFloat(bar.style.height)).toBeCloseTo(thick, 3);
    expect(parseFloat(bar.style.width)).toBeCloseTo(noteLength(0.5, roll.w, thick), 3);
  });

  it('a small stage grows the bar to hold its 4 pixels', () => {
    const { container } = render(<Harness px={0.1} />);
    emitRobotNote('r1', noteEvent('C4'));
    const [bar] = bars(container, 'front');
    expect(parseFloat(bar.style.height)).toBeCloseTo(4 / 0.1, 3);
  });

  // The avatar's scale is NaN until its box is first measured (its --note-fit-scale is unset).
  it('a scale not yet known sizes the wrappers once, at the mount, and not again on each note', () => {
    const { container } = render(<Harness px={Number.NaN} />);
    const wrapper = container.querySelector('.note-layer--front') as HTMLElement;
    const writes = countWrites(wrapper, 'left');
    emitRobotNote('r1', noteEvent('C4'));
    emitRobotNote('r1', noteEvent('D4'));
    expect(writes.writes).toBe(0);
    const roll = rollBox(GEM, 1);
    expect(parseFloat(bars(container, 'front')[0].style.height)).toBeCloseTo(noteThickness(roll.h, Number.NaN), 3);
  });

  it('places the bar lead seconds of travel right of now, on its row', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4', { lead: 0.2, duration: 0.25 }));
    const [bar] = bars(container, 'front');
    const roll = rollBox(GEM, 1);
    const speed = roll.w / NOTE_CROSSING_SECONDS;
    const nowX = roll.w * (1 - NOTE_NOW);
    expect(translateOf(bar).x).toBeCloseTo(nowX + 0.2 * speed, 2);
    // The first note sits at mid-height (row 0), within the quantum its transform is written to (Task 14).
    const thick = noteThickness(roll.h, 1);
    const len = noteLength(0.25, roll.w, thick);
    const rows = noteRowGeometry(roll, thick);
    const rowY = rows.y(0, (nowX + 0.2 * speed + len / 2) / roll.w);
    expect(Math.abs(translateOf(bar).y - rowY)).toBeLessThanOrEqual(NOTE_QUANTUM_UNITS / 2);
  });

  it('a longer lead places the bar further right', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4', { lead: 0.1 }));
    emitRobotNote('r1', noteEvent('D4', { lead: 0.4 }));
    const [early, late] = bars(container, 'front');
    expect(translateOf(late).x).toBeGreaterThan(translateOf(early).x);
  });

  it('sizes both wrappers to the roll, grown by the rows pad above and below', () => {
    const { container } = render(<Harness />);
    const roll = rollBox(GEM, 1);
    const rows = noteRowGeometry(roll, noteThickness(roll.h, 1));
    for (const side of ['front', 'behind'] as const) {
      const wrapper = container.querySelector(`.note-layer--${side}`) as HTMLElement;
      expect(parseFloat(wrapper.style.left)).toBeCloseTo(roll.x, 3);
      expect(parseFloat(wrapper.style.top)).toBeCloseTo(roll.y - rows.pad, 3);
      expect(parseFloat(wrapper.style.width)).toBeCloseTo(roll.w, 3);
      expect(parseFloat(wrapper.style.height)).toBeCloseTo(roll.h + 2 * rows.pad, 3);
    }
  });

  it('another robot\'s note places nothing', () => {
    const { container } = render(<Harness robotId="r1" />);
    emitRobotNote('r2', noteEvent('C4'));
    expect(allBars(container)).toHaveLength(0);
  });

  it('a repeat (same pitch and length, straight after) places nothing', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', { lead: 0.2, duration: 0.25, at: 100, note: 'C4' });
    emitRobotNote('r1', { lead: 0.2, duration: 0.25, at: 100.25, note: 'C4' });
    expect(allBars(container)).toHaveLength(1);
  });

  it('a hidden document places nothing', () => {
    const { container } = render(<Harness />);
    setHidden(true);
    emitRobotNote('r1', noteEvent('C4'));
    expect(allBars(container)).toHaveLength(0);
    setHidden(false);
    emitRobotNote('r1', noteEvent('D4'));
    expect(allBars(container)).toHaveLength(1);
  });

  it.each(['paused', 'cold'] as const)('a world that is %s places nothing', (state) => {
    const { container } = render(<Harness />);
    setWorldState(state);
    emitRobotNote('r1', noteEvent('C4'));
    expect(allBars(container)).toHaveLength(0);
  });

  it('enabled: false places nothing and registers no listener', () => {
    const { container } = render(<Harness enabled={false} />);
    expect(hasRobotNoteListener('r1')).toBe(false);
    emitRobotNote('r1', noteEvent('C4'));
    expect(allBars(container)).toHaveLength(0);
  });

  it('reduced motion registers no listener', () => {
    setReducedMotion(true);
    render(<Harness />);
    expect(hasRobotNoteListener('r1')).toBe(false);
  });

  it('?notes=off registers no listener', () => {
    noteCloudSwitch.on = false;
    render(<Harness />);
    expect(hasRobotNoteListener('r1')).toBe(false);
  });

  it('with no note layers to find it registers no listener', () => {
    function Bare() {
      const root = useRef<SVGGElement>(null);
      useNoteCloud({ root, robotId: 'r1', context: 'world', enabled: true, gem: GEM, scale: 1, color: '#fff', pxPerUnit: () => 1 });
      return <svg><g ref={root} /></svg>;
    }
    render(<Bare />);
    expect(hasRobotNoteListener('r1')).toBe(false);
  });

  it('a colour change keeps the bar already placed, in its own colour; the next bar wears the new one', () => {
    const { container, rerender } = render(<Harness color="#ff0000" />);
    emitRobotNote('r1', noteEvent('C4'));
    const [first] = bars(container, 'front');
    rerender(<Harness color="#00ff00" />);
    expect(bars(container, 'front')).toEqual([first]);
    expect(first.style.backgroundColor).toBe('rgb(255, 0, 0)');
    emitRobotNote('r1', noteEvent('D4'));
    expect(bars(container, 'front')).toHaveLength(2);
    expect(bars(container, 'front')[1].style.backgroundColor).toBe('rgb(0, 255, 0)');
  });

  it('unmount removes every bar and the listener', () => {
    const { container, unmount } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    emitRobotNote('r1', noteEvent('F4'));
    const belts = [...container.querySelectorAll('.note-layer__belt')];
    expect(allBars(container)).toHaveLength(2);
    unmount();
    for (const belt of belts) expect(belt.children).toHaveLength(0);
    expect(hasRobotNoteListener('r1')).toBe(false);
  });

  // The model is cleared only when a world body unmounts for good (plan, Architecture Decisions). Seen through the
  // repeat rule: a note identical to the last, straight after it, is dropped while the model remembers the last.
  describe('the model is cleared by the world body\'s unmount', () => {
    const first = { lead: 0.2, duration: 0.25, at: 200, note: 'C4' };
    const repeat = { lead: 0.2, duration: 0.25, at: 200.25, note: 'C4' };

    it('a world cloud\'s unmount clears it: the repeat after a re-mount is drawn', () => {
      const { unmount } = render(<Harness context="world" />);
      emitRobotNote('r1', first);
      unmount();
      const { container } = render(<Harness context="world" />);
      emitRobotNote('r1', repeat);
      expect(allBars(container)).toHaveLength(1);
    });

    it('an avatar cloud\'s unmount clears nothing: the repeat is dropped', () => {
      const { unmount } = render(<Harness context="avatar" />);
      emitRobotNote('r1', first);
      unmount();
      const { container } = render(<Harness context="avatar" />);
      emitRobotNote('r1', repeat);
      expect(allBars(container)).toHaveLength(0);
    });

    it('a re-size (a scale edit) clears nothing: the repeat is dropped', () => {
      const { container, rerender } = render(<Harness context="world" scale={1} />);
      emitRobotNote('r1', first);
      rerender(<Harness context="world" scale={1.2} />);
      getTimeline('note-resize-world-r1')!.progress(1); // the roll rebuilt at its new size (Task 24)
      emitRobotNote('r1', repeat);
      expect(allBars(container)).toHaveLength(0);
    });
  });
});

// ========================================
// TASK 14: the belt carries the notes across and takes them off
// ========================================
describe('useNoteCloud — the belt (Task 14)', () => {
  const wrappers = (container: HTMLElement) => [...container.querySelectorAll('.note-layer')] as HTMLElement[];
  const belts = (container: HTMLElement) => [...container.querySelectorAll('.note-layer__belt')] as HTMLElement[];
  const roll = rollBox(GEM, 1);
  const speed = roll.w / NOTE_CROSSING_SECONDS;

  it('idle: the belt is registered under world, paused, the wrappers hidden and the belts without will-change', () => {
    const { container } = render(<Harness />);
    expect(belt()).toBeDefined();
    expect(getTimelineScope('note-belt-world-r1')).toBe('world');
    expect(belt()!.paused()).toBe(true);
    for (const w of wrappers(container)) expect(w.style.display).toBe('none');
    for (const b of belts(container)) expect(b.style.willChange).toBe('');
  });

  it('a note shows the wrappers, readies the belts and plays the belt', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    expect(belt()!.paused()).toBe(false);
    for (const w of wrappers(container)) expect(w.style.display).toBe('block');
    for (const b of belts(container)) expect(b.style.willChange).toBe('transform');
  });

  it('the belt carries the bar left at the roll speed (the bar itself stays put on its belt)', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    const [bar] = bars(container, 'front');
    const placedX = translateOf(bar).x;
    advance(1);
    expect(beltX(container, 'front')).toBeCloseTo(-speed, 2);
    expect(beltX(container, 'behind')).toBeCloseTo(-speed, 2);
    expect(translateOf(bar).x).toBeCloseTo(placedX, 3);
  });

  it('a note still on the roll stays; past its crossing it is gone, and an empty belt goes idle', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    advance(2);
    expect(allBars(container)).toHaveLength(1);
    advance(NOTE_CROSSING_SECONDS);
    expect(allBars(container)).toHaveLength(0);
    for (const w of wrappers(container)) expect(w.style.display).toBe('none');
    for (const b of belts(container)) expect(b.style.willChange).toBe('');
    expect(belt()!.paused()).toBe(true);
  });

  it('takes a note off once its right end passes the left edge, not before', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4', { lead: 0.2, duration: 0.25 }));
    const thick = noteThickness(roll.h, 1);
    const len = noteLength(0.25, roll.w, thick);
    const startX = roll.w * (1 - NOTE_NOW) + 0.2 * speed;
    const crossing = (startX + len) / speed; // seconds until its right end reaches x = 0
    advance(crossing - 0.05);
    expect(allBars(container)).toHaveLength(1);
    advance(0.1);
    expect(allBars(container)).toHaveLength(0);
  });

  it('one note leaving keeps the belt running for the others', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    advance(3);
    emitRobotNote('r1', noteEvent('F4'));
    advance(2); // the first has crossed, the second is mid-roll
    expect(bars(container, 'front')).toHaveLength(0);
    expect(bars(container, 'behind')).toHaveLength(1);
    expect(belt()!.paused()).toBe(false);
    for (const w of wrappers(container)) expect(w.style.display).toBe('block');
  });

  it('nothing jumps when the belt wraps: a bar keeps moving left at the roll speed', () => {
    const { container } = render(<Harness />);
    advance(4.5); // an idle belt's time can stand anywhere; place the note just before a wrap
    emitRobotNote('r1', noteEvent('C4'));
    const [bar] = bars(container, 'front');
    const onScreen = () => translateOf(bar).x + beltX(container);
    const before = onScreen();
    advance(1); // crosses the 5 s wrap
    expect(onScreen()).toBeCloseTo(before - speed, 1);
  });

  it('through the straight middle, two small advances write a bar transform at most once', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    advance(1.5); // out of the right-hand fan, into the straight middle
    const [bar] = bars(container, 'front');
    const writes = countWrites(bar, 'transform');
    advance(1 / 60);
    advance(1 / 60);
    expect(writes.writes).toBeLessThanOrEqual(1);
  });

  it('a power-off pause with a note mid-flight pauses the belt; power-on plays it', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    pauseWorldTimelines();
    expect(belt()!.paused()).toBe(true);
    resumeWorldTimelines();
    expect(belt()!.paused()).toBe(false);
    expect(allBars(container)).toHaveLength(1);
  });

  it('an idle belt stays paused across a power cycle', () => {
    render(<Harness />);
    pauseWorldTimelines();
    resumeWorldTimelines();
    expect(belt()!.paused()).toBe(true);
  });

  it('unmount kills the belt', () => {
    const { unmount } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    unmount();
    expect(belt()).toBeUndefined();
  });

  it('the avatar context registers its own belt', () => {
    render(<Harness context="avatar" />);
    expect(belt('r1', 'avatar')).toBeDefined();
    expect(getTimelineScope('note-belt-avatar-r1')).toBe('world');
    expect(belt('r1', 'world')).toBeUndefined();
  });

  it('a body-scale rebuild starts the new belt at the left of its roll', () => {
    const { container, rerender } = render(<Harness scale={1} />);
    emitRobotNote('r1', noteEvent('C4'));
    advance(1);
    rerender(<Harness scale={1.5} />);
    getTimeline('note-resize-world-r1')!.progress(1); // past the fade's rebuild (Task 24)
    expect(beltX(container)).toBe(0);
    expect(belt()!.paused()).toBe(true);
    expect(belt()!.totalTime()).toBe(0);
  });
});

// ========================================
// TASK 15: a note is white while it sounds
// ========================================
describe('useNoteCloud — white while it sounds (Task 15)', () => {
  const LEAD = 0.2;
  const LENGTH = 0.5;
  const hotOf = (container: HTMLElement) => bars(container, 'front')[0].querySelector('.note__hot') as HTMLElement;
  const hot = (container: HTMLElement) => Number(hotOf(container).style.opacity || 0);

  function placeOne() {
    const view = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4', { lead: LEAD, duration: LENGTH }));
    return view;
  }

  it('the white copy wears the hot colour', () => {
    const { container } = placeOne();
    expect(hotOf(container).style.backgroundColor).toBe('rgb(255, 251, 230)');
  });

  it('is clear when placed and still clear before lead has passed', () => {
    const { container } = placeOne();
    expect(hot(container)).toBe(0);
    advance(LEAD / 2);
    expect(hot(container)).toBe(0);
    advance(LEAD / 2 - 0.01);
    expect(hot(container)).toBe(0);
  });

  it('turns white over NOTE_HOT_IN_SECONDS as it sounds: half way through, half white', () => {
    const { container } = placeOne();
    advance(LEAD + NOTE_HOT_IN_SECONDS / 2);
    expect(hot(container)).toBeCloseTo(0.5, 1);
  });

  it('just after it sounds it is opaque, and stays so for its length', () => {
    const { container } = placeOne();
    advance(LEAD + NOTE_HOT_IN_SECONDS + 0.01);
    expect(hot(container)).toBe(1);
    advance(LENGTH - NOTE_HOT_IN_SECONDS - 0.05);
    expect(hot(container)).toBe(1);
  });

  it('cools over NOTE_COOL_SECONDS after its length: half way, half white; at the end, clear', () => {
    const { container } = placeOne();
    advance(LEAD + LENGTH + NOTE_COOL_SECONDS / 2);
    expect(hot(container)).toBeCloseTo(0.5, 1);
    advance(NOTE_COOL_SECONDS / 2);
    expect(hot(container)).toBe(0);
  });

  it('a note shorter than the rise never reaches full white, and still cools to clear', () => {
    const view = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4', { lead: LEAD, duration: 0.02 }));
    advance(LEAD + 0.02);
    expect(hot(view.container)).toBeLessThan(1);
    advance(NOTE_COOL_SECONDS);
    expect(hot(view.container)).toBe(0);
  });

  it('writes the white copy only when its value changes: none before it sounds, none once cool', () => {
    const { container } = placeOne();
    const writes = countWrites(hotOf(container), 'opacity');
    advance(0.05);
    advance(0.05);
    expect(writes.writes).toBe(0);
    advance(LEAD + LENGTH + NOTE_COOL_SECONDS); // well past cool
    const afterCool = writes.writes;
    advance(0.05);
    advance(0.05);
    expect(writes.writes).toBe(afterCool);
  });

  it('placing a note creates no tween and no delayed call', () => {
    render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    const before = gsap.globalTimeline.getChildren(true, true, true).length;
    emitRobotNote('r1', noteEvent('D4'));
    emitRobotNote('r1', noteEvent('F4'));
    expect(gsap.globalTimeline.getChildren(true, true, true).length).toBe(before);
  });
});

// ========================================
// TASK 22: the cloud's opacity is the peak strength (the ease went once the battery bands made it constant)
// ========================================
describe('useNoteCloud — the peak strength (Task 22)', () => {
  it('mounts at NOTE_PEAK_STRENGTH, with no fade', () => {
    const { container } = render(<Harness />);
    const opacities = [...container.querySelectorAll('.note-layer')].map((w) => Number((w as HTMLElement).style.opacity));
    expect(opacities).toEqual([NOTE_PEAK_STRENGTH, NOTE_PEAK_STRENGTH]);
    expect(getTimeline('note-resize-world-r1')).toBeUndefined();
  });
});

// ========================================
// TASK 17a–17c: the battery bands — the placing switch
// ========================================
describe('useNoteCloud — the placing switch (Task 17b)', () => {
  const opacities = (container: HTMLElement) =>
    [...container.querySelectorAll('.note-layer')].map((w) => Number((w as HTMLElement).style.opacity));

  it('places by default', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4'));
    expect(allBars(container)).toHaveLength(1);
  });

  it('while placing is false an event places no bar', () => {
    const { container } = render(<Harness placing={false} />);
    emitRobotNote('r1', noteEvent('C4'));
    emitRobotNote('r1', noteEvent('B3'));
    expect(allBars(container)).toHaveLength(0);
  });

  it('turning it false leaves the notes in flight on their belts, moving, at the layers\' strength', () => {
    const { container, rerender } = render(<Harness placing />);
    emitRobotNote('r1', noteEvent('C4'));
    emitRobotNote('r1', noteEvent('B3'));
    const [front] = bars(container, 'front');
    const beltBefore = beltX(container);
    rerender(<Harness placing={false} />);
    expect(allBars(container)).toHaveLength(2);
    expect(opacities(container)).toEqual([NOTE_PEAK_STRENGTH, NOTE_PEAK_STRENGTH]);
    expect(getTimeline('note-resize-world-r1')).toBeUndefined();
    advance(1);
    expect(beltX(container)).toBeLessThan(beltBefore);
    expect(front.isConnected).toBe(true);
    emitRobotNote('r1', noteEvent('D4'));
    expect(allBars(container)).toHaveLength(2);
  });

  it('the notes in flight still leave at the left edge, and the cloud goes idle', () => {
    const { container, rerender } = render(<Harness placing />);
    emitRobotNote('r1', noteEvent('C4'));
    rerender(<Harness placing={false} />);
    advance(NOTE_CROSSING_SECONDS + 1);
    expect(allBars(container)).toHaveLength(0);
    for (const layer of container.querySelectorAll<HTMLElement>('.note-layer')) expect(layer.style.display).toBe('none');
  });

  it('turning it true again places the next note', () => {
    const { container, rerender } = render(<Harness placing={false} />);
    emitRobotNote('r1', noteEvent('C4'));
    rerender(<Harness placing />);
    emitRobotNote('r1', noteEvent('D4'));
    expect(allBars(container)).toHaveLength(1);
  });

  it('a run counted while not placing is honoured: the second of the run is still a repeat', () => {
    const { container, rerender } = render(<Harness placing={false} />);
    emitRobotNote('r1', { lead: 0.2, duration: 0.25, at: 400, note: 'C4' });
    rerender(<Harness placing />);
    emitRobotNote('r1', { lead: 0.2, duration: 0.25, at: 400.25, note: 'C4' });
    expect(allBars(container)).toHaveLength(0);
    emitRobotNote('r1', { lead: 0.2, duration: 0.25, at: 400.5, note: 'C4' });
    expect(allBars(container)).toHaveLength(1);
  });

  it('a switch re-runs nothing: the belt is the same timeline before and after', () => {
    const { rerender } = render(<Harness placing />);
    const before = belt();
    rerender(<Harness placing={false} />);
    rerender(<Harness placing />);
    expect(belt()).toBe(before);
  });
});

// ========================================
// TASK 24: an edit that re-sizes the roll never pops
// ========================================
describe('useNoteCloud — a re-size under a fade (Task 24)', () => {
  const FADE_KEY = 'note-resize-world-r1';
  const fadeTimeline = () => getTimeline(FADE_KEY);
  const frontWrapper = (container: HTMLElement) => container.querySelector('.note-layer--front') as HTMLElement;
  const width = (container: HTMLElement) => parseFloat(frontWrapper(container).style.width);
  const opacities = (container: HTMLElement) =>
    [...container.querySelectorAll('.note-layer')].map((w) => Number((w as HTMLElement).style.opacity));
  /** Where the fade-out ends and the rebuild happens: half the fade timeline (out, then back in). */
  const PAST_FADE_OUT = 0.6;

  it('straight after a scale change the wrappers keep their old size and the bar in flight is still there', () => {
    const { container, rerender } = render(<Harness scale={1} />);
    emitRobotNote('r1', noteEvent('C4'));
    rerender(<Harness scale={1.5} />);
    expect(width(container)).toBeCloseTo(rollBox(GEM, 1).w, 3);
    expect(allBars(container)).toHaveLength(1);
    expect(getTimelineScope(FADE_KEY)).toBe('world');
  });

  it('the fade out and back in each take NOTE_WAKE_SECONDS', () => {
    const { rerender } = render(<Harness scale={1} />);
    rerender(<Harness scale={1.5} />);
    expect(fadeTimeline()!.duration()).toBeCloseTo(2 * NOTE_WAKE_SECONDS, 5);
  });

  it('past the fade-out the wrappers have the new size, faded out, with no bars; a new note lands on the new roll', () => {
    const { container, rerender } = render(<Harness scale={1} />);
    emitRobotNote('r1', noteEvent('C4'));
    rerender(<Harness scale={1.5} />);
    fadeTimeline()!.progress(PAST_FADE_OUT);
    expect(width(container)).toBeCloseTo(rollBox(GEM, 1.5).w, 3);
    expect(allBars(container)).toHaveLength(0);
    expect(opacities(container)[0]).toBeLessThan(0.5);
    emitRobotNote('r1', noteEvent('D4'));
    expect(allBars(container)).toHaveLength(1);
  });

  it('at its end the wrappers are back at the peak strength', () => {
    const { container, rerender } = render(<Harness scale={1} />);
    rerender(<Harness scale={1.5} />);
    fadeTimeline()!.progress(1);
    expect(opacities(container)).toEqual([NOTE_PEAK_STRENGTH, NOTE_PEAK_STRENGTH]);
  });

  it('a second scale change mid-fade ends at the latest size, with one fade timeline', () => {
    const { container, rerender } = render(<Harness scale={1} />);
    rerender(<Harness scale={1.5} />);
    const first = fadeTimeline()!;
    first.progress(0.25);
    rerender(<Harness scale={2} />);
    const second = fadeTimeline()!;
    expect(second).not.toBe(first);
    expect(gsap.globalTimeline.getChildren(false, true, true)).not.toContain(first);
    second.progress(1);
    expect(width(container)).toBeCloseTo(rollBox(GEM, 2).w, 3);
    expect(opacities(container)).toEqual([NOTE_PEAK_STRENGTH, NOTE_PEAK_STRENGTH]);
  });

  it('a colour edit starts no fade and keeps the bar', () => {
    const { container, rerender } = render(<Harness color="#ff0000" />);
    emitRobotNote('r1', noteEvent('C4'));
    rerender(<Harness color="#00ff00" />);
    expect(fadeTimeline()).toBeUndefined();
    expect(allBars(container)).toHaveLength(1);
  });

  it('a disabled cloud starts no fade on a scale change', () => {
    const { rerender } = render(<Harness enabled={false} scale={1} />);
    rerender(<Harness enabled={false} scale={1.5} />);
    expect(fadeTimeline()).toBeUndefined();
  });

  it('enabled later, the cloud is built at the latest size', () => {
    const { container, rerender } = render(<Harness enabled={false} scale={1} />);
    rerender(<Harness enabled={false} scale={1.5} />);
    rerender(<Harness enabled scale={1.5} />);
    expect(width(container)).toBeCloseTo(rollBox(GEM, 1.5).w, 3);
  });

  it('unmount mid-fade kills the fade, and the rebuild never runs', () => {
    const { container, rerender, unmount } = render(<Harness scale={1} />);
    rerender(<Harness scale={1.5} />);
    const fade = fadeTimeline()!;
    const wrapper = frontWrapper(container);
    unmount();
    expect(fadeTimeline()).toBeUndefined();
    expect(() => fade.progress(1)).not.toThrow();
    expect(parseFloat(wrapper.style.width)).toBeCloseTo(rollBox(GEM, 1).w, 3);
  });
});

// ========================================
// TASK 35: the cloud asks for the run-in, and the mask opens the right-hand fan (spec §1.9, §1.4)
// ========================================
describe('useNoteCloud — the early notes (Task 35)', () => {
  /** Half the run-in from the roll's right edge to "now", less the lead every note already has (§1.9, split at
   *  Gate 4): (1.125 − 0.2) / 2 s. */
  const PREVIEW = (NOTE_NOW * NOTE_CROSSING_SECONDS - NOTE_KNOWN_AHEAD_SECONDS) / 2;

  it('mounting a cloud asks the engine for half the run-in: 0.4625 s', () => {
    expect(getNotePreviewSeconds()).toBe(0);
    render(<Harness />);
    expect(PREVIEW).toBeCloseTo(0.4625, 10);
    expect(getNotePreviewSeconds()).toBeCloseTo(0.4625, 10);
  });

  it('with ?notes=off nothing asks', () => {
    noteCloudSwitch.on = false;
    render(<Harness />);
    expect(getNotePreviewSeconds()).toBe(0);
  });

  it('under reduced motion nothing asks', () => {
    setReducedMotion(true);
    render(<Harness />);
    expect(getNotePreviewSeconds()).toBe(0);
  });

  it('a disabled cloud, and one with no layers to find, ask nothing', () => {
    function Bare() {
      const root = useRef<SVGGElement>(null);
      useNoteCloud({ root, robotId: 'r1', context: 'world', enabled: true, gem: GEM, scale: 1, color: '#fff', pxPerUnit: () => 1 });
      return <svg><g ref={root} /></svg>;
    }
    render(<Harness enabled={false} />);
    render(<Bare />);
    expect(getNotePreviewSeconds()).toBe(0);
  });

  it('the ask stands while any cloud is mounted, and the last to go withdraws it', () => {
    const world = render(<Harness robotId="r1" context="world" />);
    const avatar = render(<Harness robotId="r1" context="avatar" />);
    world.unmount();
    expect(getNotePreviewSeconds()).toBeCloseTo(PREVIEW, 10);
    avatar.unmount();
    expect(getNotePreviewSeconds()).toBe(0);
  });

  it('a re-run of the cloud (enabled off, then on) leaves one ask, not two', () => {
    const { rerender, unmount } = render(<Harness />);
    rerender(<Harness enabled={false} />);
    expect(getNotePreviewSeconds()).toBe(0);
    rerender(<Harness enabled />);
    expect(getNotePreviewSeconds()).toBeCloseTo(PREVIEW, 10);
    unmount();
    expect(getNotePreviewSeconds()).toBe(0);
  });

  it('the wrappers\' mask ends clear where an early note is first known (90.75%), so it fades in from there', () => {
    // "now" at 77.5%, plus (0.2 + 0.4625) s of a 5 s crossing: 77.5 + 13.25
    const { container } = render(<Harness />);
    for (const side of ['front', 'behind'] as const) {
      const wrapper = container.querySelector(`.note-layer--${side}`) as HTMLElement;
      const mask = wrapper.style.getPropertyValue('-webkit-mask-image') || wrapper.style.getPropertyValue('mask-image');
      expect(mask).toMatch(/transparent 90\.75%\)$/);
    }
  });

  it('an event with a 1.2 s lead places its bar right of the roll, and the belt brings its left end to now as the lead passes', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4', { lead: 1.2 }));
    const [bar] = bars(container, 'front');
    const roll = rollBox(GEM, 1);
    expect(translateOf(bar).x).toBeGreaterThan(roll.w);
    advance(1.2);
    expect(translateOf(bar).x + beltX(container)).toBeCloseTo(roll.w * (1 - NOTE_NOW), 1);
  });
});
