// ========================================
// useNoteCloud (docs/specs/ROBOT_NOTE_CLOUD.md §1.3–§1.6; docs/tasks/ROBOT_NOTE_CLOUD.md Tasks 13–15)
// ========================================
// The harness renders what Robot.tsx renders round a body: a data-note-cloud box holding the two note layers either
// side of an svg, with the hook's root (a `g`) inside the svg. Events go in through emitRobotNote, as the engine
// sends them. Real GSAP: the belt is a registered timeline whose time the tests set by hand.
import { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

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
import { emitRobotNote, hasRobotNoteListener, type RobotNoteEvent } from '@/engine/noteEvents';
import { setWorldState } from '@/systems/worldState';
import { killAllTimelines } from '@/animation/timelineMap';
import { NOTE_CROSSING_SECONDS, NOTE_NOW } from '@/constants';

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
}

function Harness({ robotId = 'r1', context = 'world', enabled = true, scale = 1, color = '#ff0000', px = 1 }: HarnessProps) {
  const root = useRef<SVGGElement>(null);
  useNoteCloud({ root, robotId, context, enabled, gem: GEM, scale, color, pxPerUnit: () => px });
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

beforeEach(() => {
  noteCloudSwitch.on = true;
  setReducedMotion(false);
  setWorldState('running');
  for (const id of ['r1', 'r2']) clearNoteCloudModel(id);
});

afterEach(() => {
  cleanup();
  delete (document as unknown as { hidden?: boolean }).hidden;
  killAllTimelines();
  setWorldState('cold');
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

  it('places the bar lead seconds of travel right of now, on its row', () => {
    const { container } = render(<Harness />);
    emitRobotNote('r1', noteEvent('C4', { lead: 0.2, duration: 0.25 }));
    const [bar] = bars(container, 'front');
    const roll = rollBox(GEM, 1);
    const speed = roll.w / NOTE_CROSSING_SECONDS;
    const nowX = roll.w * (1 - NOTE_NOW);
    expect(translateOf(bar).x).toBeCloseTo(nowX + 0.2 * speed, 2);
    // The first note sits at mid-height (row 0).
    const thick = noteThickness(roll.h, 1);
    const len = noteLength(0.25, roll.w, thick);
    const rows = noteRowGeometry(roll, thick);
    expect(translateOf(bar).y).toBeCloseTo(rows.y(0, (nowX + 0.2 * speed + len / 2) / roll.w), 2);
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

  it('a body-scale change rebuilds the roll at once: the notes in flight go, the wrappers re-size', () => {
    const { container, rerender } = render(<Harness scale={1} />);
    emitRobotNote('r1', noteEvent('C4'));
    rerender(<Harness scale={1.5} />);
    expect(allBars(container)).toHaveLength(0);
    const wrapper = container.querySelector('.note-layer--front') as HTMLElement;
    expect(parseFloat(wrapper.style.width)).toBeCloseTo(rollBox(GEM, 1.5).w, 3);
    emitRobotNote('r1', noteEvent('D4'));
    expect(allBars(container)).toHaveLength(1);
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

    it('an effect re-run (a scale edit) clears nothing: the repeat is dropped', () => {
      const { container, rerender } = render(<Harness context="world" scale={1} />);
      emitRobotNote('r1', first);
      rerender(<Harness context="world" scale={1.2} />);
      emitRobotNote('r1', repeat);
      expect(allBars(container)).toHaveLength(0);
    });
  });
});
