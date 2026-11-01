import { AudioEngine } from '../engine/AudioEngine';
import { useAudioStore } from '../stores/audioStore';
import { resetHarmony } from '../engine/harmonySystem';
import { reRegisterAllRobotsAudio } from './spawnSystem';
import { pauseWorkLoop, resumeWorkLoop } from './workLoop';
import { useUIStore } from '../stores/uiStore';
import { startLocaleSystems } from './worldTransition';
import { getActiveLocaleId } from '../utils/localeHelpers';
import { pauseWorldTimelines, resumeWorldTimelines } from '../animation/timelineMap';
import { fadeOffScreen, restoreOffScreen } from '../animation/offScreenTheatre';
import { hasHeardWorld, markHeardWorld } from '../utils/deviceFlags';
import { getWorldState, setWorldState } from './worldState';

/** The cold start under way, which a second power-on press joins (F1); null when none is. */
let coldStart: Promise<void> | null = null;

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
    if (getWorldState() !== 'running') return;
    pauseWorkLoop();
    pauseWorldTimelines();
    AudioEngine.pause();
    useUIStore.getState().setPowerOff();
    setWorldState('paused');
  },

  /** The other half of pause(): the context first (sound returns from where it stopped), then the world timelines,
   *  then the loop clock, then the power flag — the reverse of pause(). A no-op unless the world is paused. */
  resume() {
    if (getWorldState() !== 'paused') return;
    AudioEngine.resume();
    resumeWorldTimelines();
    resumeWorkLoop();
    useUIStore.getState().setPowerOn();
    setWorldState('running');
  },

  // High-level power-on sequence, two ways (spec assumption 5). From a pause: resume, nothing starts. Otherwise
  // the world was built as a still frame (WorldView mounts in both power states and its mount effect builds it with
  // its systems held back), so this is where it comes alive: audio first, every robot's voice registered by start(),
  // then the lifecycle tick, work loop and swells for the active locale. Last, the power flag flips, which reveals
  // the chrome. The first cold start on a device also writes the heard-a-world flag — the off screen's gate
  // (assumption 7) — so from the next power-off on, the chooser shows. A world replaced during a pause is cold
  // too: the change tore the paused one down (worldTransition's killAll), so start() runs in full and its
  // Tone.start() wakes the suspended context.
  //
  // Before either path, the off screen's fade (assumption 18): the screen and its veil tween to transparent and
  // this awaits them, so the veil is gone before the power flag unmounts the screen and nothing shows unveiled under
  // the chrome. First, not between the wake and the flag: while the fade runs the world is still paused or cold, so
  // a second flip in that window finds the states as they were — resuming first and flipping the flag later would
  // let a pause() land in between and leave the flag on over a paused world. The fade resolves at once when no
  // screen is mounted. A GSAP timeline that resolves a promise, nothing more: the audio is woken here, after it.
  //
  // After the fade, a world already running is left alone: the rocker stays clickable through its sequence, so a
  // second "on" press can land after the first one's start or resume, and running the cold branch again would
  // release and rebuild every voice mid-music, reset the harmony and restart the loop
  // (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R18). A press whose fade ends while another press's cold start is
  // still under way (a slow phone) finds the world neither running nor paused, so it joins that start rather than
  // running a second one, and resolves or rejects with it (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F1).
  async powerOnSequence() {
    await fadeOffScreen();
    if (getWorldState() === 'running') return;
    if (getWorldState() === 'paused') {
      this.resume();
      return;
    }
    if (coldStart) return coldStart;
    coldStart = this.coldStart().finally(() => {
      coldStart = null;
    });
    return coldStart;
  },

  async coldStart() {
    try {
      await this.start();
    } catch (err) {
      // The screen faded for a start that did not happen: give it back, opaque and taking input, rather than leave it
      // invisible over the glass (R19). The failure is still the caller's.
      restoreOffScreen();
      throw err;
    }
    // startLocaleSystems writes 'running' itself, as it does for a live rebuild.
    startLocaleSystems(getActiveLocaleId());
    if (!hasHeardWorld()) markHeardWorld();
    useUIStore.getState().setPowerOn();
  }
};

/** Test seam: back to a fresh page's `cold`. Never called by the app. */
export function __resetPowerControllerForTest(): void {
  setWorldState('cold');
  coldStart = null;
}

export default powerController;
