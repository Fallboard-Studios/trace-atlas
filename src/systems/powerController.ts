import { AudioEngine } from '../engine/AudioEngine';
import { useAudioStore } from '../stores/audioStore';
import { resetHarmony } from '../engine/harmonySystem';
import { reRegisterAllRobotsAudio } from './spawnSystem';
import { pauseWorkLoop, resumeWorkLoop } from './workLoop';
import { useUIStore } from '../stores/uiStore';
import { startLocaleSystems } from './worldTransition';
import { getActiveLocaleId } from '../utils/localeHelpers';
import { pauseWorldTimelines, resumeWorldTimelines } from '../animation/timelineMap';
import { hasHeardWorld, markHeardWorld } from '../utils/deviceFlags';

/**
 * Where the world is (docs/specs/OFF_SCREEN.md assumption 5): `cold` — built as a still frame, nothing has started
 * (a fresh page, or a world loaded while the tablet was off); `running`; `paused` — frozen in place by the rocker,
 * waiting to resume. Module state, not Zustand: it mirrors the audio graph, which is runtime, and must never persist.
 */
export type WorldState = 'cold' | 'running' | 'paused';
let worldState: WorldState = 'cold';

/**
 * powerController centralizes power on/off side effects so components stay thin.
 */
export const powerController = {
  async start() {
    await AudioEngine.start();
    AudioEngine.setBPM(useAudioStore.getState().bpm);
    resetHarmony();
    reRegisterAllRobotsAudio(getActiveLocaleId());
  },

  /**
   * Power is a pause (docs/specs/OFF_SCREEN.md assumption 5): freeze the running world in place and flip the power
   * state off. The work loop's clock stops first (no site cooldown runs out while the tablet is off), then every
   * `'world'` timeline (the robots freeze mid-glide), then the AudioContext — the transport, the BeatClock's measure
   * tick (and with it the battery lifecycle, the harmony and the swells), every LFO, voice and tail stop together.
   * Nothing is torn down: the lifecycle subscription stands (its tick is frozen with the context), no voice is
   * released, no robot moves. The rocker's return animation is the caller's. A no-op unless the world is running.
   */
  pause() {
    if (worldState !== 'running') return;
    pauseWorkLoop();
    pauseWorldTimelines();
    AudioEngine.pause();
    useUIStore.getState().setPowerOff();
    worldState = 'paused';
  },

  /** The other half of pause(): the context first (sound returns from where it stopped), then the world timelines,
   *  then the loop clock, then the power flag — the reverse of pause(). A no-op unless the world is paused. */
  resume() {
    if (worldState !== 'paused') return;
    AudioEngine.resume();
    resumeWorldTimelines();
    resumeWorkLoop();
    useUIStore.getState().setPowerOn();
    worldState = 'running';
  },

  /**
   * A different world was loaded (a pick on the off screen, Roll, Retransmit, a session Load): whatever was running or
   * paused has been torn down by worldTransition's own paths, so the next flip starts cold. Called by those paths
   * (docs/tasks/OFF_SCREEN.md Task 8), never by the screen.
   */
  noteWorldReplaced() {
    worldState = 'cold';
  },

  getWorldState(): WorldState {
    return worldState;
  },

  /** @deprecated Task 6 alias for the rocker's confirm flow until Task 7 removes the dialog; `pause()` is the call. */
  async shutdown() {
    this.pause();
  },

  // High-level power-on sequence, two ways (spec assumption 5). From a pause: resume, nothing starts. Otherwise
  // the world was built as a still frame (WorldView mounts in both power states and its mount effect builds it with
  // its systems held back), so this is where it comes alive: audio first, every robot's voice registered by start(),
  // then the lifecycle tick, work loop and swells for the active locale. Last, the power flag flips, which reveals
  // the chrome. The first cold start on a device also writes the heard-a-world flag — the off screen's gate
  // (assumption 7) — so from the next power-off on, the chooser shows.
  async powerOnSequence() {
    if (worldState === 'paused') {
      this.resume();
      return;
    }
    await this.start();
    startLocaleSystems(getActiveLocaleId());
    if (!hasHeardWorld()) markHeardWorld();
    useUIStore.getState().setPowerOn();
    worldState = 'running';
  }
};

/** Test seam: back to a fresh page's `cold`. Never called by the app. */
export function __resetPowerControllerForTest(): void {
  worldState = 'cold';
}

export default powerController;
