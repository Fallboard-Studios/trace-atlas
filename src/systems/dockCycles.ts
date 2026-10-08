/**
 * Per-robot count of Docked landings. robotSystems.ts advances it on every Docked landing and
 * threads it into the lifecycle snapshot, where it seeds pitch drift. (Its second reader, the legacy
 * off-screen dock position, went with the work loop's stations — Phase 43 Task 24.) Live state
 * only: never replayed or persisted.
 */
const dockCycleCounters = new Map<string, number>();

/** Docked landings so far for this robot (0 if it has never docked). */
export function getDockCycleCount(robotId: string): number {
  return dockCycleCounters.get(robotId) ?? 0;
}

/** Count one more Docked landing for this robot and return the new count. */
export function recordDockLanding(robotId: string): number {
  const next = getDockCycleCount(robotId) + 1;
  dockCycleCounters.set(robotId, next);
  return next;
}
