/**
 * Shared per-field apply functions for every editable Robot Options field (Roadmap Phase 10) —
 * extracted verbatim from what was, until this phase, inline handler logic in
 * RobotDisplaySection.tsx/PingControlsDrawer.tsx/PingContourDrawer.tsx/SignatureArrayDrawer.tsx.
 * Nothing about what an edit does changes here, only where the code lives: both the single-robot
 * drawers (via RobotOptionsTab.tsx) and the company-broadcast panel (CompanyOptionsSection.tsx)
 * call these same functions — the single-robot call site calls once, the company call site loops
 * across every member robot. See docs/specs/COMPANIES.md §4.
 *
 * Every function takes (robot, localeId, value) — never reads uiStore, never touches anything
 * beyond localeStore/AudioEngine/lfoEngine/regenerateMelody. Selection state is a caller concern.
 */
import { useLocaleStore } from '@/stores/localeStore';
import { AudioEngine } from '@/engine/AudioEngine';
import { lfoEngine } from '@/engine/lfoEngine';
import { regenerateMelody } from '@/engine/regenerateMelody';
import { buildClickTrackMelody } from '@/engine/clickTrack';
import type { StepperWithToggleValue } from '@/components/ui/controls/StepperWithToggle';
import type { Robot, ADSREnvelope } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type { LfoValue } from '@/types/controls';
import type { RobotLfoTargetId } from '@/types/lfo';

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
export function applyVolume(robot: Robot, localeId: string, pct: number): void {
  const value = pct / 100;
  useLocaleStore.getState().updateRobot(localeId, robot.id, { masterVolume: value });
  AudioEngine.updateRobotMasterVolume(robot.id, value);
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

// Number-in: active is a derived, enforced consequence of value > 0, never
// independently settable (docs/specs/STEPPER_TO_SLIDER.md) — the caller (a bare
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
export function applyAdsr(robot: Robot, localeId: string, adsr: ADSREnvelope): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, adsr },
  });
  AudioEngine.updateVoiceEnvelope(robot.id, adsr);
}

// ========================================
// SIGNATURE ARRAY (SignatureArrayDrawer.tsx today)
// ========================================

/** Continuous params (gain, detune, phase, pulseWidth): live, no gap in audio. Gain is also how
 *  Coaxial/Harmonic are muted (gain: 0) — a live update on the existing voice, not a rebuild;
 *  AudioEngine.ts's filterAudibleLayers only excludes a muted layer from the composite voice the
 *  next time something else triggers a real rebuild (applyLayersStructural). */
export function applyLayersContinuous(robot: Robot, localeId: string, layers: OscillatorLayer[]): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, layers },
  });
  AudioEngine.updateVoiceLayerParams(robot.id, layers);
}

/** Structural changes (type) — may cause a brief audio gap while the voice rebuilds. Muting a
 *  layer (gain: 0) goes through applyLayersContinuous instead — see its own doc comment. */
export function applyLayersStructural(robot: Robot, localeId: string, layers: OscillatorLayer[]): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, layers },
  });
  AudioEngine.reReserveVoice(robot.id);
}

/** Shared by every per-layer LFO frame (Gain/Detune/Phase/Interval) and, via applyVolumeLfo
 *  above, Volume's own LFO frame — mirrors audioStore.ts's setGlobalLfo pattern, robot-scoped:
 *  store write plus the matching lfoEngine calls, connecting/starting only when rate > 0. */
export function applyLayerLfo(robot: Robot, localeId: string, target: RobotLfoTargetId, value: LfoValue): void {
  const nextLfoSettings = { ...robot.lfoSettings, [target]: value } as Robot['lfoSettings'];
  useLocaleStore.getState().updateRobot(localeId, robot.id, { lfoSettings: nextLfoSettings });
  lfoEngine.setLfoShape(target, value.shape, robot.id);
  lfoEngine.setLfoRate(target, value.rate, robot.id);
  lfoEngine.setLfoDepth(target, value.depth, robot.id);
  if (value.rate > 0) {
    if (lfoEngine.connectLfoTarget(target, robot.id)) lfoEngine.start(target, robot.id);
  } else {
    lfoEngine.disconnectLfoTarget(target, robot.id);
    lfoEngine.stop(target, robot.id);
  }
}
