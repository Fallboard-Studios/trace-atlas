import { AudioEngine } from '../engine/AudioEngine';
import { useAudioStore } from '../stores/audioStore';
import { resetHarmony } from '../engine/harmonySystem';
import { reRegisterAllRobotsAudio } from './spawnSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopWorkLoop } from './workLoop';
import { useUIStore } from '../stores/uiStore';
import { useLocaleStore } from '../stores/localeStore';
import { getActiveLocaleId } from '../utils/localeHelpers';
import { swallow } from '../utils/helpers';
import { DEV_TUNING } from '../constants';

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
    stopRobotLifecycle();
    // The work loop's timelines and site state go too; initializeLocale restarts it on power-on
    // and adopts the remounted robots (Phase 43, spec §1.1).
    stopWorkLoop();
    AudioEngine.killAll();
    try {
      useLocaleStore.getState().setLocaleData(getActiveLocaleId(), { actors: [] });
    } catch (e) {
      if (DEV_TUNING) swallow(e, 'powerController.setActors');
    }
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

  // High-level power-on sequence that mounts UI in caller when appropriate.
  async powerOnSequence() {
    await this.start();
    useUIStore.getState().setPowerOn();
  }
};

export default powerController;
