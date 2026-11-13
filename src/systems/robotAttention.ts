// ========================================
// robotAttention (docs/specs/ROBOT_NOTE_CLOUD.md §1.7)
// ========================================
// Which robot the player has turned to, for the note cloud and the marker: the robot under the pointer, and the
// robots whose notes attention has woken. Runtime module state, read through useSyncExternalStore (getX /
// subscribeX, the shape of deckCamera's followed-robot pair). Never Zustand: the pointer moves far more often than
// anything the stores hold should change. It names robots only and never reaches the engine.

import { getFollowedRobotId, subscribeFollowedRobot } from '../animation/deckCamera';

// ========================================
// STATE
// ========================================
let pointedId: string | null = null;
/** The singled-out id the subscribers were last told of, so a set that changes nothing calls nobody. */
let lastSingledOut: string | null = null;
const singledOutListeners = new Set<() => void>();
/** Held only while the singled-out id has a subscriber. */
let releaseCamera: (() => void) | null = null;

const woken = new Set<string>();
const wokenListeners = new Set<() => void>();

const notify = (listeners: Set<() => void>) => {
  for (const listener of [...listeners]) listener();
};

function singledOutChanged(): void {
  const next = getSingledOutRobotId();
  if (next === lastSingledOut) return;
  lastSingledOut = next;
  notify(singledOutListeners);
}

// ========================================
// THE SINGLED-OUT ROBOT
// ========================================
/**
 * The robot under the pointer, or null when the pointer leaves it (§1.7, §7.2 A5: whatever the pointer type).
 * Pointing at a robot also wakes its notes.
 */
export function setPointedRobot(robotId: string | null): void {
  pointedId = robotId;
  if (robotId !== null) wakeRobotNotes(robotId);
  singledOutChanged();
}

/** The robot under the pointer, if any. */
export function getPointedRobotId(): string | null {
  return pointedId;
}

/** The singled-out robot (§1.7): the one under the pointer, else the one the Deck camera follows, else null. */
export function getSingledOutRobotId(): string | null {
  return pointedId ?? getFollowedRobotId();
}

/** Calls `listener` whenever the singled-out id changes, and only then; returns the unsubscribe. */
export function subscribeSingledOut(listener: () => void): () => void {
  if (singledOutListeners.size === 0) {
    lastSingledOut = getSingledOutRobotId();
    releaseCamera = subscribeFollowedRobot(singledOutChanged);
  }
  singledOutListeners.add(listener);
  return () => {
    if (!singledOutListeners.delete(listener) || singledOutListeners.size > 0) return;
    releaseCamera?.();
    releaseCamera = null;
  };
}

// ========================================
// THE WOKEN SET
// ========================================
/** Wakes a robot's notes: full strength whatever its battery, until it is next in its station (§1.7). */
export function wakeRobotNotes(robotId: string): void {
  if (woken.has(robotId)) return;
  woken.add(robotId);
  notify(wokenListeners);
}

/** Ends a robot's wake (it is in its station, or its body has gone). */
export function sleepRobotNotes(robotId: string): void {
  if (!woken.delete(robotId)) return;
  notify(wokenListeners);
}

export function isRobotNotesWoken(robotId: string): boolean {
  return woken.has(robotId);
}

/** Calls `listener` whenever any robot is woken or slept; returns the unsubscribe. */
export function subscribeWokenNotes(listener: () => void): () => void {
  wokenListeners.add(listener);
  return () => {
    wokenListeners.delete(listener);
  };
}
