// ========================================
// THE STATION FADE SYSTEM (backlog 84)
// ========================================
// A homebound robot fades out to the bar line (docs/specs/PLAY_UNTIL_IN_THE_STATION.md §1.2 step 3, §1.4). The work
// loop's `enter` leaves an arriving robot at its port, 'entering'; this '16n' tick decides when it goes in. With half a
// measure or more left to the bar (STATION_FADE_MIN_STEPS sixteenths, inclusive) its fade starts on the tick that sees
// it; with less it holds, still playing, and the bar-line tick starts it over the whole measure. Either way the
// engine's ramp (AudioEngine.scheduleStationFade) and the loop's entry arc (workLoop.enterOnBar) run over the same
// seconds and end on the bar line, where the arc's end writes 'charging'.
//
// A transport callback, so it may call both the engine and the loop; the loop never calls the engine (Strict
// Separation). Started and stopped beside the work loop (worldTransition.ts). No record of its own beyond the repeat's
// id: whether an entry has started is read where it is kept, the engine's fade record and the loop's running arc.

// ========================================
// IMPORTS
// ========================================
import { arcRunning, enterOnBar } from './workLoop';
import { AudioEngine } from '../engine/AudioEngine';
import { cancelSchedule, getTickSeconds, positionAt, scheduleRepeat } from '../engine/beatClock';
import { useLocaleStore } from '../stores/localeStore';
import { BEATS_PER_MEASURE, STATION_FADE_MIN_STEPS } from '../constants';
import { DockingState } from '../types/Robot';

// ========================================
// STATE
// ========================================

let scheduleId: string | null = null;

// ========================================
// THE TICK
// ========================================

function onTick(localeId: string, time: number): void {
  const at = positionAt(time);
  const tick = getTickSeconds(time);
  if (!at || tick === undefined) return;
  const left = BEATS_PER_MEASURE * 4 - (at.step - 1);
  const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];

  for (const robot of robots) {
    if (robot.activity !== 'entering') continue;
    const soloed = robot.audioMode === 'solo';
    // An entry has started while the engine holds the robot's fade (gone at every Active landing) or the loop runs its
    // arc (gone at 'charging', or at the end of a turn-back's reverse). Not remembered here: a record of this system's
    // own went stale when a robot left and re-entered 'entering' between two ticks (the reverse of a turn-back ending on
    // the port while recalled again), and it then held at its port for ever (review R1).
    const fading = AudioEngine.hasStationFade(robot.id);
    if (fading && soloed) AudioEngine.cancelStationFade(robot.id, time); // a Solo mid-fade: heard at its regular volume (spec §1.5)
    if (fading || arcRunning(robot.id) || left < STATION_FADE_MIN_STEPS) continue; // started, or the hold
    // The door (roadmap 94, docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md §1.11): a Recalled robot's fade ends on its
    // hold's bar line, the one after its exit turn, so before the hold's last bar (measure hold − 1) it waits at its
    // port, still playing. Inside that bar, and from the hold on, the rule above stands.
    if (robot.docking === DockingState.Recalled && robot.dockingHoldUntilMeasure !== undefined && at.measure < robot.dockingHoldUntilMeasure - 1) {
      continue;
    }
    const seconds = left * tick;
    if (!soloed) AudioEngine.scheduleStationFade(robot.id, time, seconds);
    // The tick runs a lookahead ahead of its audio: the arc, which starts now, runs on until the fade is heard to end.
    enterOnBar(robot.id, seconds + AudioEngine.secondsUntilHeard(time));
  }
}

// ========================================
// LIFECYCLE
// ========================================

/** Start the '16n' tick for `localeId`. Idempotent: a no-op while it runs. */
export function startStationFades(localeId: string): void {
  if (scheduleId !== null) return;
  scheduleId = scheduleRepeat('16n', (time) => onTick(localeId, time));
}

/** Stop the tick. Idempotent. An entry in flight keeps its fade and its arc: the engine's records go with its own
 *  teardown (killAll) or the robot's next Active landing (cancelStationFade); the loop's arcs go with stopWorkLoop. */
export function stopStationFades(): void {
  if (scheduleId === null) return;
  cancelSchedule(scheduleId);
  scheduleId = null;
}
