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
  NOTE_COOL_SECONDS,
  NOTE_CROSSING_SECONDS,
  NOTE_EBB_SECONDS,
  NOTE_HOT_COLOR,
  NOTE_HOT_IN_SECONDS,
  NOTE_KNOWN_AHEAD_SECONDS,
  NOTE_NOW,
  NOTE_QUANTUM_DEGREES,
  NOTE_QUANTUM_UNITS,
  NOTE_WAKE_SECONDS,
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
  /** How strongly the whole cloud shows, 0 to 1 (§1.7, noteStrength): the layers' opacity, eased to on a change. At
   *  0 no note is placed, though the model still counts it. */
  strength: number;
}

type Side = 'front' | 'behind';

/** A note on a belt. Its place is kept in "unwrapped belt" units, so its x on the roll at belt time t is
 *  `start - t × speed` whatever the belt's wraps. It sounds from belt time `soundsAt` for `duration` seconds. What
 *  was last written is kept to skip a write that changes nothing. */
interface LiveNote {
  el: HTMLElement;
  hot: HTMLElement;
  row: number;
  length: number;
  start: number;
  soundsAt: number;
  duration: number;
  written: string;
  hotWritten: number;
}

// ========================================
// HELPERS
// ========================================
/** A number for a style string: four decimals, so the DOM carries no float noise. */
const n4 = (value: number) => Number(value.toFixed(4));
/** A value snapped to a quantum (§7.2 A7), as a style number. */
const snap = (value: number, quantum: number) => n4(Math.round(value / quantum) * quantum);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** How white a note is `since` seconds after it started sounding (§1.4): clear before, opaque over
 *  NOTE_HOT_IN_SECONDS, held for its `duration`, clear again over NOTE_COOL_SECONDS. Two decimals. */
function hotLevel(since: number, duration: number): number {
  const rise = clamp01(since / NOTE_HOT_IN_SECONDS);
  const fall = clamp01(1 - (since - duration) / NOTE_COOL_SECONDS);
  return Number(Math.min(rise, fall).toFixed(2));
}

// ========================================
// HOOK
// ========================================
export function useNoteCloud({ root, robotId, context, enabled, gem, scale, color, pxPerUnit, strength }: UseNoteCloudOptions): void {
  const reducedMotion = prefersReducedMotion();
  const colorRef = useRef(color);
  const pxPerUnitRef = useRef(pxPerUnit);
  useLayoutEffect(() => {
    colorRef.current = color;
    pxPerUnitRef.current = pxPerUnit;
  });
  // The strength the layers are at or easing to, and the two wrappers while the roll is built (null when it is not).
  const strengthRef = useRef(strength);
  const layersRef = useRef<HTMLElement[] | null>(null);
  const strengthKey = `note-strength-${context}-${robotId}`;
  // The size the roll is built at or is fading to (the latest gem and scale), the built cloud's rebuild (null when it
  // is not built), and whether a re-size's fade has yet to reach its rebuild.
  const sizeRef = useRef({ gem, scale });
  const rebuildRef = useRef<(() => void) | null>(null);
  const resizePendingRef = useRef(false);

  // The roll, the layers, the belt and the listener. A gem or body-scale change does not re-run this: the re-size
  // effect below fades the layers out, calls the rebuild, and fades them back (§1.5).
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
    layersRef.current = layers;
    for (const layer of layers) layer.style.opacity = String(strengthRef.current);

    // The roll at the latest size; the rebuild replaces all three.
    let roll = rollBox(sizeRef.current.gem, sizeRef.current.scale);
    let speed = roll.w / NOTE_CROSSING_SECONDS; // canvas units a second
    let nowX = roll.w * (1 - NOTE_NOW);
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
      if (transform !== note.written) {
        note.written = transform;
        note.el.style.transform = transform;
      }
      // White while it sounds, from the belt's own time: no tween and no timer per note.
      const level = hotLevel(time - note.soundsAt, note.duration);
      if (level !== note.hotWritten) {
        note.hotWritten = level;
        note.hot.style.opacity = String(level);
      }
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

    /** A new belt tween from the left of its roll (playhead 0), registered under 'world' in place of any before it. */
    const makeBelt = () => {
      const belt = gsap.to({ t: 0 }, {
        t: NOTE_CROSSING_SECONDS,
        duration: NOTE_CROSSING_SECONDS,
        ease: 'none',
        repeat: -1,
        paused: true,
        onUpdate: pass,
      });
      setTimeline(key, belt as unknown as ReturnType<typeof gsap.timeline>, 'world');
      return belt;
    };
    let tween = makeBelt();
    idle();

    /** Drops every note and leaves the belts at the left of the roll, idle. */
    const clearNotes = () => {
      live.length = 0;
      belts.front!.replaceChildren();
      belts.behind!.replaceChildren();
      for (const belt of beltEls) belt.style.transform = '';
      beltTime = 0;
    };

    // The rebuild (§1.5, §7.2 A6), called by the re-size fade once the layers are out: the roll at the latest size,
    // the notes in flight dropped, a new belt from the left of the new roll.
    rebuildRef.current = () => {
      clearNotes();
      roll = rollBox(sizeRef.current.gem, sizeRef.current.scale);
      speed = roll.w / NOTE_CROSSING_SECONDS;
      nowX = roll.w * (1 - NOTE_NOW);
      px = Number.NaN;
      fit();
      tween = makeBelt();
      idle();
    };

    const unsubscribe = subscribeDrawnNotes(robotId, (note, event) => {
      // The model has counted it already (the run and the range), drawn or not.
      if (document.hidden || getWorldState() !== 'running' || strengthRef.current === 0) return;
      fit();
      const length = noteLength(note.duration, roll.w, thickness);
      const lead = Math.max(0, event.lead);
      const left = nowX + lead * speed;

      const bar = document.createElement('div');
      bar.className = 'note';
      bar.style.width = `${n4(length)}px`;
      bar.style.height = `${n4(thickness)}px`;
      bar.style.borderRadius = `${n4(thickness / 2)}px`;
      bar.style.backgroundColor = colorRef.current;
      const hot = document.createElement('div');
      hot.className = 'note__hot';
      hot.style.backgroundColor = NOTE_HOT_COLOR;
      bar.appendChild(hot);

      const placed: LiveNote = {
        el: bar,
        hot,
        row: note.row,
        length,
        start: left + beltTime * speed,
        soundsAt: beltTime + lead,
        duration: note.duration,
        written: '',
        hotWritten: 0, // clear, as the stylesheet draws it
      };
      settle(placed, beltTime);
      const side: Side = note.layer;
      belts[side]!.appendChild(bar);
      live.push(placed);
      if (live.length === 1) wake();
    });

    return () => {
      unsubscribe();
      killTimeline(key);
      // A re-size fade in flight is killed by the strength timeline's own cleanup; its rebuild finds nothing.
      layersRef.current = null;
      rebuildRef.current = null;
      resizePendingRef.current = false;
      clearNotes();
      for (const layer of layers) layer.style.display = '';
      for (const belt of beltEls) belt.style.willChange = '';
    };
  }, [root, robotId, context, enabled, reducedMotion]);

  // A re-size never pops (§1.5, §7.2 A6): a gem or body-scale change fades both layers out over NOTE_WAKE_SECONDS,
  // rebuilds the roll at the latest size (the notes in flight are dropped), and fades them back to the strength over
  // NOTE_WAKE_SECONDS, all on the strength timeline. A second change mid-fade replaces it, starting from wherever the
  // layers are; the rebuild always reads the latest size. A colour edit changes neither and starts nothing.
  useEffect(() => {
    if (sizeRef.current.gem === gem && sizeRef.current.scale === scale) return;
    sizeRef.current = { gem, scale };
    const layers = layersRef.current;
    if (!layers) return; // not built: the next build reads the latest size
    resizePendingRef.current = true;
    const fade = gsap.timeline();
    fade
      .to(layers, { opacity: 0, duration: NOTE_WAKE_SECONDS, ease: 'sine.inOut' })
      .call(() => {
        resizePendingRef.current = false;
        rebuildRef.current?.();
      })
      .to(layers, { opacity: () => strengthRef.current, duration: NOTE_WAKE_SECONDS, ease: 'sine.inOut' });
    setTimeline(strengthKey, fade, 'world');
  }, [gem, scale, strengthKey]);

  // Strength (§1.7): a change eases both wrappers' opacity from wherever they are to the new strength, on a
  // registered 'world' tween, so a power-off pause holds it: a rise over NOTE_WAKE_SECONDS, a fall over
  // NOTE_EBB_SECONDS. Never a step. A new change replaces the tween in flight (setTimeline kills the old one), except
  // a re-size fade that has yet to rebuild: that one comes back to the new strength itself.
  useEffect(() => {
    if (strength === strengthRef.current) return;
    strengthRef.current = strength;
    const layers = layersRef.current;
    if (!layers || resizePendingRef.current) return;
    const from = Number(layers[0].style.opacity);
    const tween = gsap.to(layers, {
      opacity: strength,
      duration: strength > from ? NOTE_WAKE_SECONDS : NOTE_EBB_SECONDS,
      ease: 'sine.inOut',
    });
    setTimeline(strengthKey, tween as unknown as ReturnType<typeof gsap.timeline>, 'world');
  }, [strength, strengthKey]);

  // The strength tween goes with the hook.
  useEffect(() => () => killTimeline(strengthKey), [strengthKey]);

  // The model outlives an effect re-run and the avatar's mount: only the world body's unmount, keyed on the robot
  // alone, forgets the robot's range and run (plan, Architecture Decisions).
  useEffect(() => {
    if (context !== 'world') return;
    return () => clearNoteCloudModel(robotId);
  }, [robotId, context]);
}
