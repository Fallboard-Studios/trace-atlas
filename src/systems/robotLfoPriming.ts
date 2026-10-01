/**
 * Robot LFO priming (docs/specs/LFO_LOAD_FIX.md §1.1, Task 6) — re-applies a robot's stored LFO
 * settings to lfoEngine, mirroring AudioEngine.start()'s global-chain priming loop for the robot
 * half it never had. Nothing walked robot.lfoSettings before this: only a user edit
 * (robotOptionsActions.applyLayerLfo) ever reached the engine, so a freshly-spawned robot's seeded
 * LFOs showed in the UI but never ran. See the spec's §1.3 call-site table for every place this
 * is invoked (spawn, re-register, the engine's post-load pass, a structural voice rebuild, and
 * session restore of an LFO override).
 */
import { lfoEngine } from '@/engine/lfoEngine';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId, type LfoSettings } from '@/types/lfo';
import type { Robot } from '@/types/Robot';

/**
 * Push one target's settings to the engine and connect/start or disconnect/stop on rate — the
 * single source of the "rate > 0 means requested" rule for robot LFOs (mirrors audioStore.ts's
 * setGlobalLfo). Shared by applyLayerLfo (a user edit) and primeRobotLfos (this module) so the
 * two paths cannot drift.
 */
export function applyRobotLfoToEngine(robotId: string, target: RobotLfoTargetId, value: LfoSettings): void {
  lfoEngine.setLfoShape(target, value.shape, robotId);
  lfoEngine.setLfoRate(target, value.rate, robotId);
  lfoEngine.setLfoDepth(target, value.depth, robotId);
  if (value.rate > 0) {
    if (lfoEngine.connectLfoTarget(target, robotId)) lfoEngine.start(target, robotId);
  } else {
    lfoEngine.disconnectLfoTarget(target, robotId);
    lfoEngine.stop(target, robotId);
  }
}

/**
 * Re-apply one robot's stored LFO settings to the engine. Requires the robot's voice to already
 * be reserved and the AudioContext running — every caller in the spec's §1.3 table guarantees
 * both. Idempotent: re-running it for an already-connected target with the same signal is a
 * no-op in lfoEngine's own connectOne. A target the robot has no entry for is skipped, never
 * synthesized from a default — an untouched robot should look untouched.
 */
export function primeRobotLfos(robot: Robot, targets: readonly RobotLfoTargetId[] = ROBOT_LFO_TARGET_IDS): void {
  const settings = robot.lfoSettings;
  if (!settings) return;
  for (const target of targets) {
    const value = settings[target];
    if (value) applyRobotLfoToEngine(robot.id, target, value);
  }
}

/**
 * Prime a whole roster in round-robin target order (spec §1.2): for each target in
 * ROBOT_LFO_TARGET_IDS order, visit every robot before moving to the next target. Request order
 * is the Load Budget's admission priority, so this spreads a capped world's admissions evenly —
 * every robot gets its first seeded-on target before any robot gets a second — rather than
 * admitting the first few robots' entire LFO sets and starving the rest of the roster.
 */
export function primeRosterLfos(robots: readonly Robot[]): void {
  for (const target of ROBOT_LFO_TARGET_IDS) {
    for (const robot of robots) {
      const value = robot.lfoSettings?.[target];
      if (value) applyRobotLfoToEngine(robot.id, target, value);
    }
  }
}
