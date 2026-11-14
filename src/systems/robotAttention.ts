// ========================================
// robotAttention (docs/specs/ROBOT_NOTE_CLOUD.md §1.7)
// ========================================
// Which robot the player has turned to, for the followed-robot marker: the robot under the pointer, else the one
// the Deck camera follows. (The note cloud's woken set and dim went with the world cloud, §8.4.) Runtime module
// state, read through useSyncExternalStore (getX / subscribeX, the shape of deckCamera's followed-robot pair). Never
// Zustand: the pointer moves far more often than anything the stores hold should change. It names robots only and
// never reaches the engine.

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

function singledOutChanged(): void {
  const next = getSingledOutRobotId();
  if (next === lastSingledOut) return;
  lastSingledOut = next;
  for (const listener of [...singledOutListeners]) listener();
}

// ========================================
// THE SINGLED-OUT ROBOT
// ========================================
/** The robot under the pointer, or null when the pointer leaves it (§1.7, §7.2 A5: whatever the pointer type). */
export function setPointedRobot(robotId: string | null): void {
  pointedId = robotId;
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
