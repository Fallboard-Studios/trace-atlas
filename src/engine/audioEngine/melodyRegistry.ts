// ========================================
// THE MELODY REGISTRY (docs/specs/MELODY_JOURNEY.md §1.7; roadmap 92 Tasks 13, 14 and 28)
// ========================================
// What each robot plays: the melody it registered, its entries by step, and its developed entries for the positions
// it read most recently. AudioEngine owns the store reads (which robot, the world key, the bpm band) and hands them in,
// so nothing here reads a store or schedules a note.
import type { MelodyEvent, Robot } from '../../types/Robot';
import type { MusicPosition } from '../beatClock';
import { buildClickTrackMelody } from '../clickTrack';
import { journeyPosition, robotJourney } from '../melodyJourney';
import { calmLimit, developMelody } from '../melodyDevelopment';

/** One event a robot plays on a step, as stepNotes reads it. */
export interface MelodyEventEntry {
  robotId: string;
  event: MelodyEvent;
  /** True when this event is the earliest `startStep` within its motif-tiling
   * repeat window (computed once at registration — see registerMelody). */
  isGroupAccent?: boolean;
  /** True when this entry belongs to the substituted click-track melody (registerMelody): a tempo reference
   * is never humanized. */
  clickTrack?: boolean;
}

/** One robot's registration (melody journey Tasks 13, 14): the melody it registered (the click track's while that is
 *  on), the ids of the events carrying the motif accent, the click-track flag, its entries by step, built once here,
 *  and its developed entries by step for the positions it read most recently (entriesOnStep). */
interface RegisteredRobot {
  melody: MelodyEvent[];
  accented: ReadonlySet<string>;
  clickTrack: boolean;
  byStep: Map<number, MelodyEventEntry[]>;
  developed: Map<string, Map<number, MelodyEventEntry[]>>;
}

/** How many developed positions a robot keeps (melody journey §1.7): the trigger and the early announcement read
 *  measures either side of a bar line, and a position moves at most twice a measure. */
const DEVELOPED_KEPT = 4;

// Per robot, in registration order: a step's notes are gathered robot by robot in this order, and a re-registered
// robot moves to the end, so the order notes reach the polyphony cap in is the order robots registered.
const melodyRegistry = new Map<string, RegisteredRobot>();

/**
 * Registers `melody` for `robotId`, replacing any earlier registration and moving the robot to the end of the order.
 * `robot` is the stored robot, if any: while its `clickTrackActive` is on the click-track pattern is registered in
 * place of `melody`, and its Motif Length places the motif-group accent.
 */
export function registerMelody(robotId: string, melody: MelodyEvent[], robot: Robot | undefined): void {
  // Purge any existing registration for this robot before adding the new one, so this is idempotent
  // regardless of call site (no duplicate triggers) and the robot moves to the end of the order.
  melodyRegistry.delete(robotId);

  const effectiveMelody = robot?.clickTrackActive
    ? buildClickTrackMelody(robot.octaveRange[0])
    : melody;

  // Motif-group accent: computed once here (not per-tick) so it stays off the
  // scheduling hot path. Only meaningful when the robot's Motif Length toggle
  // is active — scatter mode has no repeat windows to accent. Skipped entirely for the
  // click track — it's a flat, unaccented test pulse, not the robot's own motif structure.
  const motif = robot?.rhythmicMotifLength;
  const accentedStartSteps = new Set<number>();
  if (motif?.active && !robot?.clickTrackActive) {
    const windowLength = Math.max(1, motif.value);
    const earliestInWindow = new Map<number, number>(); // window index -> earliest startStep
    effectiveMelody.forEach((event) => {
      const windowIndex = Math.floor((event.startStep - 1) / windowLength);
      const current = earliestInWindow.get(windowIndex);
      if (current === undefined || event.startStep < current) {
        earliestInWindow.set(windowIndex, event.startStep);
      }
    });
    earliestInWindow.forEach((step) => accentedStartSteps.add(step));
  }

  const clickTrack = robot?.clickTrackActive === true;
  const accented = new Set<string>();
  const byStep = new Map<number, MelodyEventEntry[]>();
  effectiveMelody.forEach((event) => {
    const isGroupAccent = accentedStartSteps.has(event.startStep);
    if (isGroupAccent) accented.add(event.id);
    const entries = byStep.get(event.startStep) || [];
    entries.push({ robotId, event, isGroupAccent, ...(clickTrack ? { clickTrack: true } : {}) });
    byStep.set(event.startStep, entries);
  });
  melodyRegistry.set(robotId, { melody: effectiveMelody, accented, clickTrack, byStep, developed: new Map() });
}

/** Removes every trace of `robotId`'s registration. */
export function unregisterMelody(robotId: string): void {
  melodyRegistry.delete(robotId);
}

/** Whether any robot has a melody registered. */
export function hasRegisteredMelodies(): boolean {
  return melodyRegistry.size > 0;
}

/** The events registered for `robotId`, grouped by step in the order the steps first appear in its melody. */
export function registeredEvents(robotId: string): MelodyEvent[] {
  const out: MelodyEvent[] = [];
  melodyRegistry.get(robotId)?.byStep.forEach((entries) => {
    entries.forEach((e) => out.push(e.event));
  });
  return out;
}

/**
 * One robot's entries on `at.step`, from its melody for `at.measure` (melody journey §1.7): the stored robot's journey
 * (robotJourney: its key and two bounds) and the registered melody's calm limit give the position, and developMelody
 * the events there. The developed events by step are kept per robot for the DEVELOPED_KEPT positions it read most
 * recently and rebuilt only when the position or an input (the floor, the seed) changes. A robot the store does not
 * hold, a Click Track robot, and a robot at position 0 play what is registered. The accent stays on the home event
 * that had it (by id); a note a change adds is never accented.
 */
function entriesOnStep(
  robotId: string,
  registered: RegisteredRobot,
  robot: Robot | undefined,
  worldKey: string,
  bpmTop: number,
  at: MusicPosition,
): MelodyEventEntry[] | undefined {
  if (registered.clickTrack || !robot) return registered.byStep.get(at.step);
  const journey = robotJourney(robot, worldKey, bpmTop);
  const bounds = { maxIntensity: journey.maxIntensity, maxTime: journey.maxTime, calmLimit: calmLimit(registered.melody) };
  const position = journeyPosition(journey.key, bounds, at.measure);
  if (position === 0) return registered.byStep.get(at.step);
  const kept = `${position}:${journey.floor}:${journey.seed}`;
  let byStep = registered.developed.get(kept);
  if (byStep) {
    // Read again: moved to the newest end, so the position being played is never the one that goes.
    registered.developed.delete(kept);
  } else {
    byStep = new Map();
    for (const event of developMelody(registered.melody, position, journey)) {
      const entries = byStep.get(event.startStep) ?? [];
      entries.push({ robotId, event, isGroupAccent: registered.accented.has(event.id) });
      byStep.set(event.startStep, entries);
    }
    // Least recently read first out: the reads either side of a bar line keep the newest.
    if (registered.developed.size >= DEVELOPED_KEPT) registered.developed.delete(registered.developed.keys().next().value!);
  }
  registered.developed.set(kept, byStep);
  return byStep.get(at.step);
}

/**
 * Every registered robot's entries on `at.step`, in registration order, each from its melody for `at.measure`
 * (entriesOnStep). `robotOf` finds the stored robot (undefined when the store does not hold it); `worldKey` and `bpmTop`
 * are the active world's key and the top of the theme's bpm band, read once per step by the caller.
 */
export function entriesForStep(
  robotOf: (robotId: string) => Robot | undefined,
  worldKey: string,
  bpmTop: number,
  at: MusicPosition,
): MelodyEventEntry[] {
  const events: MelodyEventEntry[] = [];
  melodyRegistry.forEach((registered, robotId) => {
    const onStep = entriesOnStep(robotId, registered, robotOf(robotId), worldKey, bpmTop, at);
    if (onStep) events.push(...onStep);
  });
  return events;
}
