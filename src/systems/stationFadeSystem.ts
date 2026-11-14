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
// Separation). Started and stopped beside the work loop (worldTransition.ts). Runtime state only, none in Zustand.

// ========================================
// IMPORTS
// ========================================
import { enterOnBar } from './workLoop';
import { AudioEngine } from '../engine/AudioEngine';
import { cancelSchedule, getTickSeconds, positionAt, scheduleRepeat } from '../engine/beatClock';
import { useLocaleStore } from '../stores/localeStore';
import { BEATS_PER_MEASURE, STATION_FADE_MIN_STEPS } from '../constants';

// ========================================
// STATE
// ========================================

/** What this system started for an 'entering' robot: its fade and its arc, or (soloed, or a Solo since) the arc
 *  alone. The scheduling record; the engine's own `stationFades` is the audio one. */
type Started = 'fade' | 'arc';

let scheduleId: string | null = null;
const started = new Map<string, Started>();

// ========================================
// THE TICK
// ========================================

function onTick(localeId: string, time: number): void {
  const at = positionAt(time);
  const tick = getTickSeconds(time);
  if (!at || tick === undefined) return;
  const left = BEATS_PER_MEASURE * 4 - (at.step - 1);
  const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];

  const entering = new Set<string>();
  for (const robot of robots) {
    if (robot.activity !== 'entering') continue;
    entering.add(robot.id);
    const soloed = robot.audioMode === 'solo';
    const was = started.get(robot.id);
    if (was === 'fade' && soloed) {
      AudioEngine.cancelStationFade(robot.id, time); // a Solo mid-fade: heard at its regular volume (spec §1.5)
      started.set(robot.id, 'arc');
    }
    if (was !== undefined || left < STATION_FADE_MIN_STEPS) continue; // started, or the hold
    const seconds = left * tick;
    if (!soloed) AudioEngine.scheduleStationFade(robot.id, time, seconds);
    // The tick runs a lookahead ahead of its audio: the arc, which starts now, runs on until the fade is heard to end.
    enterOnBar(robot.id, seconds + AudioEngine.secondsUntilHeard(time));
    started.set(robot.id, soloed ? 'arc' : 'fade');
  }
  // A robot no longer 'entering' (charging, turned back, gone) is forgotten, so its next entry starts afresh.
  for (const id of [...started.keys()]) if (!entering.has(id)) started.delete(id);
}

// ========================================
// LIFECYCLE
// ========================================

/** Start the '16n' tick for `localeId`. Idempotent: a no-op while it runs. */
export function startStationFades(localeId: string): void {
  if (scheduleId !== null) return;
  scheduleId = scheduleRepeat('16n', (time) => onTick(localeId, time));
}

/** Stop the tick and forget every robot it started. Idempotent. The engine's records go with its own teardown
 *  (killAll) or the robot's next Active landing (cancelStationFade). */
export function stopStationFades(): void {
  if (scheduleId !== null) {
    cancelSchedule(scheduleId);
    scheduleId = null;
  }
  started.clear();
}
