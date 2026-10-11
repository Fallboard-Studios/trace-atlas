import { AudioEngine } from '../engine/AudioEngine';
import { useAudioStore } from '../stores/audioStore';
import { resetHarmony } from '../engine/harmonySystem';
import { reRegisterAllRobotsAudio } from './spawnSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopWorkLoop } from './workLoop';
import { useUIStore } from '../stores/uiStore';
import { startLocaleSystems } from './worldTransition';
import { getActiveLocaleId } from '../utils/localeHelpers';

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

  async shutdown() {
    // Immediate stop (no UI animation). Use this when caller already handled
    // visuals or when a hard shutdown is required.
    // stopRobotLifecycle() must run before AudioEngine.killAll() — killAll
    // triggers resetBeatClock(), which silently clears every subscribeToMeasure
    // listener; without this call first, the module's own lifecycleUnsubscribe
    // reference would go stale, and a later startRobotLifecycle() would think
    // it's "already running" and skip resubscribing, permanently killing the
    // tick after this power cycle. No robots are removed anymore — every robot
    // survives a power cycle now (docking replaces the old persists model).
    // The world itself stays too (Task 26, docs/specs/LAYOUT_REWORK.md §1.9): actors are no longer
    // emptied, because the powered-off screen's backdrop is this same still world.
    stopRobotLifecycle();
    // The work loop's timelines and site state go too; powerOnSequence restarts it on power-on
    // (Phase 43, spec §1.1).
    stopWorkLoop();
    AudioEngine.killAll();
    useUIStore.getState().setPowerOff();
  },

  /**
   * Orchestrated shutdown that stops systems and flips power state. Identical
   * to shutdown() except it never touches locale actors — kept distinct for
   * callers (e.g. PowerRockerSwitch's confirm flow) that already handle their
   * own UI feedback (the rocker return animation) around the call.
   */
  async shutdownWithAnimation() {
    stopRobotLifecycle(); // see shutdown()'s comment on why this must precede killAll()
    stopWorkLoop();
    AudioEngine.killAll();
    useUIStore.getState().setPowerOff();
  },

  // High-level power-on sequence. The world was already built (WorldView mounts in both power states
  // and its mount effect builds it with its systems held back), so this is where it comes alive:
  // audio first, every robot's voice registered by start(), then the lifecycle tick, work loop and
  // swells for the active locale. Last, the power flag flips, which reveals the chrome.
  async powerOnSequence() {
    await this.start();
    startLocaleSystems(getActiveLocaleId());
    useUIStore.getState().setPowerOn();
  }
};

export default powerController;
