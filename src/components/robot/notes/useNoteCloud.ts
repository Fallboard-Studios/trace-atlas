// ========================================
// useNoteCloud (docs/specs/ROBOT_NOTE_CLOUD.md §1.3–§1.6)
// ========================================
// One robot's note cloud in one render context: listens for the robot's drawn notes (noteCloudModel's
// subscribeDrawnNotes) and places a bar for each on the front or behind belt of the two layers React rendered round
// the robot's svg (NoteCloudLayers.tsx). The layers are found, not passed: the box that holds them carries
// `data-note-cloud`, and the hook reaches it from its root inside the svg. Everything that decides what a note
// becomes is in the pure modules beside it (noteCloudModel, noteRows); this hook only listens, places and moves.
//
// Never imports AudioEngine or Tone: the notes arrive through noteEvents, audio to visual only.

// ========================================
// IMPORTS
// ========================================
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';

import {
  NOTE_CROSSING_SECONDS,
  NOTE_KNOWN_AHEAD_SECONDS,
  NOTE_NOW,
  NOTE_QUANTUM_DEGREES,
  NOTE_QUANTUM_UNITS,
} from '../../../constants';
import { killTimeline, setTimeline } from '../../../animation/timelineMap';
import { getWorldState } from '../../../systems/worldState';
import { isNoteCloudEnabled } from '../../../utils/debugParams';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import type { RobotGem } from '../gem/polygon';
import { clearNoteCloudModel, subscribeDrawnNotes } from './noteCloudModel';
import { noteLength, noteMask, noteRowGeometry, noteThickness, rollBox, type NoteRowGeometry } from './noteRows';

// ========================================
// TYPES
// ========================================
export interface UseNoteCloudOptions {
  /** A node inside the robot's svg (`g.gem`); the layers are found from it with `closest('[data-note-cloud]')`. */
  root: RefObject<SVGGElement | null>;
  robotId: string;
  context: 'world' | 'avatar';
  /** False on a card or roster tile: the hook registers nothing. */
  enabled: boolean;
  /** The robot's seeded geometry and its body scale, which together size the roll (§1.3). */
  gem: RobotGem;
  scale: number;
  /** The colour the next note wears (noteColor); read when a note is placed, so an edit colours only later notes. */
  color: string;
  /** Screen pixels per canvas unit, for the 4-pixel floor. A getter, read when a note arrives: no layout read. */
  pxPerUnit: () => number;
}

type Side = 'front' | 'behind';

/** A note on a belt. Its place is kept in "unwrapped belt" units, so its x on the roll at belt time t is
 *  `start - t × speed` whatever the belt's wraps. What was last written is kept to skip a write that changes nothing. */
interface LiveNote {
  el: HTMLElement;
  row: number;
  length: number;
  start: number;
  written: string;
}

// ========================================
// HELPERS
// ========================================
/** A number for a style string: four decimals, so the DOM carries no float noise. */
const n4 = (value: number) => Number(value.toFixed(4));
/** A value snapped to a quantum (§7.2 A7), as a style number. */
const snap = (value: number, quantum: number) => n4(Math.round(value / quantum) * quantum);

// ========================================
// HOOK
// ========================================
export function useNoteCloud({ root, robotId, context, enabled, gem, scale, color, pxPerUnit }: UseNoteCloudOptions): void {
  const reducedMotion = prefersReducedMotion();
  const colorRef = useRef(color);
  const pxPerUnitRef = useRef(pxPerUnit);
  useLayoutEffect(() => {
    colorRef.current = color;
    pxPerUnitRef.current = pxPerUnit;
  });

  // The roll, the layers and the listener. A gem or body-scale change re-runs it and rebuilds the roll at once,
  // dropping the notes in flight (Task 24 puts a fade round it).
  useEffect(() => {
    if (!enabled || reducedMotion || !isNoteCloudEnabled() || typeof window === 'undefined') return;
    const box = root.current?.closest('[data-note-cloud]');
    const wrappers = {
      front: box?.querySelector<HTMLElement>(':scope > .note-layer--front') ?? null,
      behind: box?.querySelector<HTMLElement>(':scope > .note-layer--behind') ?? null,
    };
    const belts = {
      front: wrappers.front?.querySelector<HTMLElement>(':scope > .note-layer__belt') ?? null,
      behind: wrappers.behind?.querySelector<HTMLElement>(':scope > .note-layer__belt') ?? null,
    };
    if (!wrappers.front || !wrappers.behind || !belts.front || !belts.behind) return;
    const layers = [wrappers.front, wrappers.behind];

    const roll = rollBox(gem, scale);
    const speed = roll.w / NOTE_CROSSING_SECONDS; // canvas units a second
    const nowX = roll.w * (1 - NOTE_NOW);
    const mask = noteMask(NOTE_KNOWN_AHEAD_SECONDS);

    // The thickness and the rows follow the screen scale; re-derived only when it has changed (a number compare).
    let px = Number.NaN;
    let thickness = 0;
    let rows: NoteRowGeometry = noteRowGeometry(roll, 0);
    const fit = () => {
      const next = pxPerUnitRef.current();
      if (next === px) return;
      px = next;
      thickness = noteThickness(roll.h, px);
      rows = noteRowGeometry(roll, thickness);
      for (const layer of layers) {
        layer.style.left = `${n4(roll.x)}px`;
        layer.style.top = `${n4(roll.y - rows.pad)}px`;
        layer.style.width = `${n4(roll.w)}px`;
        layer.style.height = `${n4(roll.h + 2 * rows.pad)}px`;
        layer.style.setProperty('mask-image', mask);
        layer.style.setProperty('-webkit-mask-image', mask);
      }
    };
    fit();

    // The belt (§1.6): one linear, repeating tween moves both belts left by the roll's width each crossing, and its
    // onUpdate is the one pass a frame over the live notes. A note is placed once on a belt and its place there
    // changes only when the belt wraps (when the tween repeats, the belts jump back a roll's width and every note is
    // re-based by the same, so nothing on screen jumps). The row's wave and the fan move it across its row, written
    // only when it moves by a whole quantum. Its whole life hangs off this registered 'world' timeline, so a power-off
    // pause freezes the cloud mid-flight.
    const beltEls = [belts.front, belts.behind];
    const live: LiveNote[] = [];
    const key = `note-belt-${context}-${robotId}`;
    let beltTime = 0; // the belt's playhead, as its last render left it

    const writeBelts = (time: number) => {
      const x = n4(-(time % NOTE_CROSSING_SECONDS) * speed);
      for (const belt of beltEls) belt.style.transform = `translate(${x}px, 0px)`;
    };

    /** Settles a note on its row for where it is at belt time `time`; writes only a changed, quantised place. */
    const settle = (note: LiveNote, time: number) => {
      const x = note.start - time * speed; // its left end on the roll
      const across = (x + note.length / 2) / roll.w;
      const onBelt = n4(note.start - Math.floor(time / NOTE_CROSSING_SECONDS) * roll.w);
      const y = snap(rows.y(note.row, across), NOTE_QUANTUM_UNITS);
      const tilt = snap(rows.tilt(note.row, across), NOTE_QUANTUM_DEGREES);
      const transform = `translate(${onBelt}px, ${y}px) rotate(${tilt}deg)`;
      if (transform === note.written) return;
      note.written = transform;
      note.el.style.transform = transform;
    };

    const idle = () => {
      for (const layer of layers) layer.style.display = 'none';
      for (const belt of beltEls) belt.style.willChange = '';
      tween.pause();
    };

    const wake = () => {
      for (const layer of layers) layer.style.display = 'block';
      for (const belt of beltEls) belt.style.willChange = 'transform';
      tween.play();
    };

    const pass = () => {
      beltTime = tween.totalTime();
      writeBelts(beltTime);
      for (let i = live.length - 1; i >= 0; i--) {
        const note = live[i];
        if (note.start - beltTime * speed + note.length < 0) {
          note.el.remove();
          live.splice(i, 1);
        } else {
          settle(note, beltTime);
        }
      }
      if (live.length === 0) idle();
    };

    const clock = { t: 0 };
    const tween = gsap.to(clock, {
      t: NOTE_CROSSING_SECONDS,
      duration: NOTE_CROSSING_SECONDS,
      ease: 'none',
      repeat: -1,
      paused: true,
      onUpdate: pass,
    });
    setTimeline(key, tween as unknown as ReturnType<typeof gsap.timeline>, 'world');
    idle();

    const unsubscribe = subscribeDrawnNotes(robotId, (note, event) => {
      if (document.hidden || getWorldState() !== 'running') return;
      fit();
      const length = noteLength(note.duration, roll.w, thickness);
      const left = nowX + Math.max(0, event.lead) * speed;

      const bar = document.createElement('div');
      bar.className = 'note';
      bar.style.width = `${n4(length)}px`;
      bar.style.height = `${n4(thickness)}px`;
      bar.style.borderRadius = `${n4(thickness / 2)}px`;
      bar.style.backgroundColor = colorRef.current;
      const hot = document.createElement('div');
      hot.className = 'note__hot';
      bar.appendChild(hot);

      const placed: LiveNote = { el: bar, row: note.row, length, start: left + beltTime * speed, written: '' };
      settle(placed, beltTime);
      const side: Side = note.layer;
      belts[side]!.appendChild(bar);
      live.push(placed);
      if (live.length === 1) wake();
    });

    return () => {
      unsubscribe();
      killTimeline(key);
      belts.front!.replaceChildren();
      belts.behind!.replaceChildren();
      for (const layer of layers) layer.style.display = '';
      // A rebuilt roll's new belt starts from the left of its roll, as its playhead does.
      for (const belt of beltEls) {
        belt.style.transform = '';
        belt.style.willChange = '';
      }
    };
  }, [root, robotId, context, enabled, reducedMotion, gem, scale]);

  // The model outlives an effect re-run and the avatar's mount: only the world body's unmount, keyed on the robot
  // alone, forgets the robot's range and run (plan, Architecture Decisions).
  useEffect(() => {
    if (context !== 'world') return;
    return () => clearNoteCloudModel(robotId);
  }, [robotId, context]);
}
