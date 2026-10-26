/**
 * Shared per-field apply functions for every editable Robot Options field (Roadmap Phase 10) —
 * extracted verbatim from what was, until this phase, inline handler logic in
 * RobotDisplaySection.tsx/PingControlsDrawer.tsx/PingContourDrawer.tsx/SignatureArrayDrawer.tsx.
 * Nothing about what an edit does changes here, only where the code lives: both the single-robot
 * drawers (via RobotOptionsTab.tsx) and the company-broadcast panel (CompanyOptionsSection.tsx)
 * call these same functions — the single-robot call site calls once, the company call site loops
 * across every member robot. See docs/specs/archive/COMPANIES.md §4.
 *
 * Every function takes (robot, localeId, value) — never reads uiStore, never touches anything
 * beyond localeStore/AudioEngine/lfoEngine/regenerateMelody. Selection state is a caller concern.
 */
import { applyRobotLinkToEngine, primeRobotLinks } from './robotLfoLinks';
import { useLocaleStore } from '@/stores/localeStore';
import { AudioEngine } from '@/engine/AudioEngine';
import { regenerateMelody } from '@/engine/regenerateMelody';
import { PAN_DISPLAY_SCALE, PAN_MAX, PAN_MIN, SEND_DISPLAY_SCALE } from '@/constants';
import { clampSend } from '@/utils/clampSend';
import { engineKeyOf, type RobotSendField } from '@/data/robotSends';
import { buildClickTrackMelody } from '@/engine/clickTrack';
import type { StepperWithToggleValue } from '@/components/ui/controls/StepperWithToggle';
import type { Robot, ADSREnvelope, AudioAttributes } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type { RobotLfoTargetId, LfoLink } from '@/types/lfo';

/**
 * The swell tick's time as the engine call's trailing argument, only when there is one
 * (docs/specs/BEATCLOCK_TRANSPORT_TIME.md). Four helpers below take `time?` because the swell tick writes through
 * them; a hand edit passes none, and its engine call stays exactly the call it always was, with no trailing undefined.
 */
function timeArg(time: number | undefined): [] | [number] {
  return time === undefined ? [] : [time];
}

// ========================================
// AUDIO SETTING / VOLUME (RobotDisplaySection.tsx today)
// ========================================

export function applyAudioMode(robot: Robot, localeId: string, value: Robot['audioMode']): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { audioMode: value });
}

// Volume displays 0-100% but stores 0..1 (Robot.masterVolume). Also updates AudioEngine's live
// masterVolume cache directly (not just the store) — scheduleNote's velocity lookup caches
// masterVolume on a robot's first note and never re-reads the store afterward, so without this
// the slider moves but has no audible effect until the cache is separately invalidated.
export function applyVolume(robot: Robot, localeId: string, pct: number, time?: number): void {
  const value = pct / 100;
  useLocaleStore.getState().updateRobot(localeId, robot.id, { masterVolume: value });
  AudioEngine.updateRobotMasterVolume(robot.id, value, ...timeArg(time));
}

// Pan displays -100..100 but stores -1..1 (Robot.pan), the same split as Volume. Only meaningful with
// Auto off — with Auto on the slider is read-only and never calls this. Clamped here as well as in
// localeStore.updateRobot so the engine never receives a value the store would have refused
// (docs/specs/ROBOT_PAN.md §1.2).
export function applyPan(robot: Robot, localeId: string, display: number): void {
  const value = Math.max(PAN_MIN, Math.min(PAN_MAX, display / PAN_DISPLAY_SCALE));
  useLocaleStore.getState().updateRobot(localeId, robot.id, { pan: value });
  AudioEngine.updateRobotPan(robot.id, value);
}

// One pair for the five sends (Reverb, Delay, Grit, Shimmer, Double), keyed by field (docs/specs/ROBOT_SEND_TABLE.md
// §1.3). A send displays 0-100 % but stores 0..1 (Robot.reverbSend and the rest), the Volume split
// (docs/specs/ROBOT_SENDS.md §1.5, docs/specs/ROBOT_EFFECT_SENDS.md §1.5). A hand edit cancels a swell on the same
// robot at the CALLER (RobotScreen / useCompanyOptions), exactly where handleVolumeChange does; the swell tick itself
// writes through applySendValue (via writeRobotValue), so the cancel cannot live here (it would cancel itself). A NaN
// display number is dropped whole: neither the store nor the engine sees it.
export function applySend(robot: Robot, localeId: string, field: RobotSendField, pct: number): void {
  applySendValue(robot, localeId, field, pct / SEND_DISPLAY_SCALE);
}

// The stored-fraction form, for the swell tick (docs/tasks/ROBOT_SENDS.md Task 12). A display percent does not
// round-trip every double (0.007 * 100 / 100 is not 0.007), and a swell must land on its base exactly, so the
// tick hands the 0..1 fraction over directly. A NaN is dropped whole, as above.
export function applySendValue(robot: Robot, localeId: string, field: RobotSendField, fraction: number, time?: number): void {
  if (Number.isNaN(fraction)) return;
  const value = clampSend(fraction);
  useLocaleStore.getState().updateRobot(localeId, robot.id, { [field]: value });
  AudioEngine.updateRobotSends(robot.id, { [engineKeyOf(field)]: value }, ...timeArg(time));
}

// Auto off: hold the SOUND where the robot is now — the engine's live auto value becomes `pan` in the same
// write that flips the flag, so the slider never jumps and one field suffices. The robot itself keeps
// moving; only the panner stops following it. Auto on: flag only (`pan` is ignored while Auto, and not
// diffed); the engine ramps back to the live position and hands the robot to the tick again.
export function applyPanAuto(robot: Robot, localeId: string, auto: boolean): void {
  if (auto) {
    useLocaleStore.getState().updateRobot(localeId, robot.id, { panAuto: true });
    AudioEngine.updateRobotPan(robot.id, null);
    return;
  }
  const live = AudioEngine.getLivePan(robot.id) ?? robot.pan;
  useLocaleStore.getState().updateRobot(localeId, robot.id, { panAuto: false, pan: live });
  AudioEngine.updateRobotPan(robot.id, live);
}

// ========================================
// PING CONTROLS (PingControlsDrawer.tsx today)
// ========================================

export function applyDensity(robot: Robot, localeId: string, density: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicDensity: density });
  regenerateMelody({ ...robot, rhythmicDensity: density }, localeId);
}

export function applyPitchRepeat(robot: Robot, localeId: string, value: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { pitchRepeat: value });
  regenerateMelody({ ...robot, pitchRepeat: value }, localeId);
}

// Robot Performance (docs/specs/ROBOT_PERFORMANCE.md §1.5). Dynamics is a playback scale read on every note, so it
// writes the field only: no melody regeneration and no engine call. Rests and Accents are baked into the melody's
// events, so they regenerate on applyPitchRepeat's shape (the new value spread in, since `robot` is the stale prop).
export function applyDynamics(robot: Robot, localeId: string, value: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { dynamics: value });
}

export function applyRests(robot: Robot, localeId: string, value: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { rests: value });
  regenerateMelody({ ...robot, rests: value }, localeId);
}

export function applyAccents(robot: Robot, localeId: string, value: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { accents: value });
  regenerateMelody({ ...robot, accents: value }, localeId);
}

// Number-in: active is a derived, enforced consequence of value > 0, never
// independently settable (docs/specs/archive/STEPPER_TO_SLIDER.md) — the caller (a bare
// SliderLinear, post-toggle-removal) only ever has the raw number.
export function applyMotifLength(robot: Robot, localeId: string, value: number): void {
  const next: StepperWithToggleValue = { active: value > 0, value };
  useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicMotifLength: next });
  regenerateMelody({ ...robot, rhythmicMotifLength: next }, localeId);
}

export function applyNoteVariance(robot: Robot, localeId: string, value: number): void {
  const next: StepperWithToggleValue = { active: value > 0, value };
  useLocaleStore.getState().updateRobot(localeId, robot.id, { noteVariance: next });
  regenerateMelody({ ...robot, noteVariance: next }, localeId);
}

/** Testing-only override — see clickTrackActive on Robot.ts and src/engine/clickTrack.ts.
 *  Never writes to `robot.melody`: turning the click track off re-registers the exact melody
 *  already in the store, not a freshly generated one. */
export function applyClickTrackActive(robot: Robot, localeId: string, active: boolean): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, { clickTrackActive: active });
  const melody = active ? buildClickTrackMelody(robot.octaveRange[0]) : robot.melody;
  AudioEngine.registerRobotMelody(robot.id, melody);
}

// Keeps min <= max at all times — the same guard PingControlsDrawer's two independent
// SliderLinears have always needed (no minStepsBetweenThumbs dual-thumb-slider enforcement
// here). Octave range is one of the five melody-formula inputs (Roadmap Phase 31), so both
// functions now regenerate the melody with the UPDATED range, matching applyDensity's shape —
// this closes a pre-existing gap: octave-range edits never touched melody before this phase.
export function applyOctaveMin(robot: Robot, localeId: string, value: number): void {
  const [, octMax] = robot.octaveRange;
  const next: [number, number] = [Math.min(value, octMax), octMax];
  useLocaleStore.getState().updateRobot(localeId, robot.id, { octaveRange: next });
  regenerateMelody({ ...robot, octaveRange: next }, localeId);
}

export function applyOctaveMax(robot: Robot, localeId: string, value: number): void {
  const [octMin] = robot.octaveRange;
  const next: [number, number] = [octMin, Math.max(value, octMin)];
  useLocaleStore.getState().updateRobot(localeId, robot.id, { octaveRange: next });
  regenerateMelody({ ...robot, octaveRange: next }, localeId);
}

// ========================================
// PING CONTOUR (PingContourDrawer.tsx today)
// ========================================

/** Ping Contour edits the robot's one shared audioAttributes.adsr. Always calls
 *  updateVoiceEnvelope, never reReserveVoice/reserveVoice — no audio dropout on an envelope tweak. */
export function applyAdsr(robot: Robot, localeId: string, adsr: ADSREnvelope, time?: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, adsr },
  });
  AudioEngine.updateVoiceEnvelope(robot.id, adsr, ...timeArg(time));
}

/** Portamento (the Envelope drawer's glide row): seconds each layer slides into the next note. 0 is a real
 *  value (no glide), so it is stored and sent like any other. A live `synth.portamento` write through
 *  updateVoicePortamento, never a rebuild (docs/specs/ROBOT_ARTICULATION.md §1.5). */
export function applyPortamento(robot: Robot, localeId: string, seconds: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, portamento: seconds },
  });
  AudioEngine.updateVoicePortamento(robot.id, seconds);
}

/** The robot bus filter's edits (the Source drawer's filter subsection): any of cutoff, resonance and type.
 *  Only the keys the patch actually carries are stored and sent — an explicit `undefined` is dropped, never
 *  spread over the stored value — and 0 stays a value (`filterFreq: 0` is the "no filter" sentinel). The
 *  engine's names differ (`filterFreq → frequency`, `filterQ → Q`, `filterType → type`). A live filter
 *  write, never a rebuild. */
export function applyBusFilter(
  robot: Robot,
  localeId: string,
  patch: Partial<Pick<AudioAttributes, 'filterFreq' | 'filterQ' | 'filterType'>>,
): void {
  const defined: typeof patch = {};
  const enginePatch: Parameters<typeof AudioEngine.updateRobotBusFilter>[1] = {};
  if (patch.filterFreq !== undefined) { defined.filterFreq = patch.filterFreq; enginePatch.frequency = patch.filterFreq; }
  if (patch.filterQ !== undefined) { defined.filterQ = patch.filterQ; enginePatch.Q = patch.filterQ; }
  if (patch.filterType !== undefined) { defined.filterType = patch.filterType; enginePatch.type = patch.filterType; }

  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, ...defined },
  });
  AudioEngine.updateRobotBusFilter(robot.id, enginePatch);
}

// ========================================
// SIGNATURE ARRAY (SignatureArrayDrawer.tsx today)
// ========================================

/** Continuous params (gain, detune, phase, pulseWidth): live, no gap in audio. Gain is also how
 *  Coaxial/Harmonic are muted (gain: 0) — a live update on the existing voice, not a rebuild;
 *  AudioEngine.ts's filterAudibleLayers only excludes a muted layer from the composite voice the
 *  next time something else triggers a real rebuild (applyLayersStructural). */
export function applyLayersContinuous(robot: Robot, localeId: string, layers: OscillatorLayer[], time?: number): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, layers },
  });
  AudioEngine.updateVoiceLayerParams(robot.id, layers, ...timeArg(time));
}

/** Structural changes (type) — may cause a brief audio gap while the voice rebuilds. Muting a
 *  layer (gain: 0) goes through applyLayersContinuous instead — see its own doc comment.
 *  Re-primes the robot's LFO links after the rebuild (docs/specs/LFO_BANK.md — also the
 *  stale-signal fix, inherited from LFO Load Fix §1.3): reReserveVoice disposes and reconstructs
 *  the composite voice's Tone nodes, so any link connected to the old nodes points at disposed
 *  objects until re-wired. */
export function applyLayersStructural(robot: Robot, localeId: string, layers: OscillatorLayer[]): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, layers },
  });
  AudioEngine.reReserveVoice(robot.id);
  primeRobotLinks(robot);
}

/** The LFO Bank's per-layer link edit (docs/tasks/LFO_BANK.md) — routed through the bank
 *  engine (robotLfoLinks.applyRobotLinkToEngine). */
export function applyLayerLfoLink(robot: Robot, localeId: string, target: RobotLfoTargetId, link: LfoLink): void {
  const nextLfoLinks = { ...robot.lfoLinks, [target]: link } as Robot['lfoLinks'];
  useLocaleStore.getState().updateRobot(localeId, robot.id, { lfoLinks: nextLfoLinks });
  applyRobotLinkToEngine(robot.id, target, link);
}
