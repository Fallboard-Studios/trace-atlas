/**
 * Robot LFO-link priming (docs/tasks/LFO_BANK.md Task 9) — pushes a robot's stored lane links to
 * the bank engine (lfoEngine.ts). No cap/policy concept here (the robot-LFO cap was removed
 * outright, Task 2) — every stored link is primed unconditionally.
 */
import { lfoEngine } from '@/engine/lfoEngine';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId, type LfoLink } from '@/types/lfo';
import type { Robot } from '@/types/Robot';

/** Push one target's stored link to the bank engine — the single call both a user edit
 *  (robotOptionsActions.applyLayerLfoLink) and priming (this module) route through. */
export function applyRobotLinkToEngine(robotId: string, target: RobotLfoTargetId, link: LfoLink): void {
  lfoEngine.linkTarget(target, link, robotId);
}

/**
 * Re-apply one robot's stored lane links to the engine. A target the robot has no entry for is
 * skipped, never synthesized from a default — an untouched robot should look untouched.
 */
export function primeRobotLinks(robot: Robot, targets: readonly RobotLfoTargetId[] = ROBOT_LFO_TARGET_IDS): void {
  const links = robot.lfoLinks;
  if (!links) return;
  for (const target of targets) {
    const link = links[target];
    if (link) applyRobotLinkToEngine(robot.id, target, link);
  }
}

/** Prime every robot in a roster once — no round-robin ordering needed (unlike the old
 *  primeRosterLfos): the robot-LFO cap this ordering protected against is gone (Task 2). */
export function primeRosterLinks(robots: readonly Robot[]): void {
  for (const robot of robots) primeRobotLinks(robot);
}
