// ========================================
// IMPORTS
// ========================================
import { memo, useMemo } from 'react';

import type { Robot, AudioAttributes, WaveformType } from '../../types/Robot';
import {
  selectRobotShape,
  generateColors,
  shapeParamsFromAudio,
  bodyShapeFromAdsr,
  calculateBodyScale,
  calculateLampIntensity,
  LAMP_MIN,
  applyLightnessMultiplier,
  computeBatteryDimOpacity,
} from './robotVisualHelpers';
import type { RobotColors, RobotSVGComponent, ShapeParams, MicroVariants } from './robotVisualHelpers';
import { useUIStore } from '../../stores/uiStore';
import { RobotGreebles } from './RobotGreebles';
import { GREEBLE_SLOTS } from './greebleSlots';

// ========================================
// TYPES
// ========================================
interface RobotBodyProps {
  robot: Robot;
  /**
   * When true, renders as if local time is always neutral (no day/night dimming) — used by the
   * Robot Selection card thumbnail (Roadmap Phase 8) so it reads consistently regardless of the
   * active locale's time of day. Battery dim (computeBatteryDimOpacity, below) is a separate,
   * non-audio signal and is unaffected either way. In-world Robot.tsx instances don't pass this,
   * so their day/night behavior is unchanged.
   */
  ignoreDaylight?: boolean;
  /** Hides the seeded greeble set — passed only by RobotSelectionCard's 64px card thumbnail;
   *  the detail avatar and in-world robots show parts (docs/specs/ROBOT_GREEBLES.md §1.4). */
  hideGreebles?: boolean;
}

// ========================================
// COMPONENT
// ========================================
/**
 * RobotBody - Selects appropriate robot shape variant and calculates visual properties
 * from audio attributes. Memoized to prevent unnecessary recalculations.
 */
export const RobotBody = memo(function RobotBody({ robot, ignoreDaylight, hideGreebles }: RobotBodyProps) {
  // Derive lightness from the active locale's local time so robots track the
  // same day/night cycle as buildings. activeLocaleLocalTime is a 0..24 float
  // written by AttenuationStyleView every second. ignoreDaylight fixes this at a
  // neutral 1 (full brightness) instead, for contexts where the thumbnail
  // must look the same regardless of time of day (RobotSelectionCard).
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);
  const lightnessMultiplier = ignoreDaylight
    ? 1
    : 0.5 + 0.5 * Math.sin(((localTime - 6) / 24) * Math.PI * 2);

  // Window/status-light dim — battery-driven, deliberately kept separate from
  // the audio-derived `visual` memo below (battery isn't an audio attribute).
  const dimOpacity = computeBatteryDimOpacity(robot.batteryLevel);

  // Identity colour is seeded, not audio-derived — read outside the memo, same reasoning as
  // battery/daylight above. Confined to the window glass and lamp (docs/ROBOT_DESIGN.md
  // "Identity layer").
  const identityColor = robot.identityColor;

  // Everything audio-derived — no lightnessMultiplier anywhere in this memo or its
  // dependency array. `lightnessMultiplier` is read in exactly one place downstream
  // (`applyLightnessMultiplier`, below, outside the memo) — confirmed directly via a search of
  // robotVisualHelpers.ts (nothing else reads it) while writing
  // docs/specs/ROBOT_BODY_LIGHTING_RERENDER.md (backlog item 22). Folding the once/sec lighting
  // tick into this memo used to force the whole audio→shape/greeble pipeline to recompute every
  // second for no reason.
  const audioVisual = useMemo(() => {
    const { adsr } = robot.audioAttributes;
    const octaveRange = robot.audioAttributes.octaveRange ?? robot.octaveRange;

    // Roadmap Phase 9: OscillatorLayer.type is WaveformType only now ('noise' removed), so this
    // no longer needs to guard against an impossible value — just a plain fallback.
    const layerType = robot.audioAttributes.layers?.[0]?.type;
    const waveform = layerType ?? robot.audioAttributes.waveform;
    const attrsForColor = { ...robot.audioAttributes, waveform } as AudioAttributes;

    // Pre-lightness colors — `applyLightnessMultiplier` is applied fresh every render, below.
    const baseColors = generateColors(attrsForColor);

    // Live replacement for the old spawn-time snapshot: scale/roundness/detail from the
    // current envelope, so Robot Options edits reach the body (Phase 36).
    const bodyShape = bodyShapeFromAdsr(adsr);
    const adsrTorso = Math.max(0.7, Math.min(1.3, 0.85 + (bodyShape.roundness - 0.5) * 0.6));
    const shapeParams = {
      torsoAspect: adsrTorso, // blended with register below after fromAudio is computed
    };

    const fromAudio = shapeParamsFromAudio(robot.audioAttributes, octaveRange);
    const microVariants = fromAudio.microVariants;
    // Blend ADSR-driven torsoAspect (70%) with register-driven torsoAspect (30%)
    // so bass robots are visibly wider even when their sustain says otherwise.
    shapeParams.torsoAspect = Math.max(0.7, Math.min(1.3,
      adsrTorso * 0.7 + fromAudio.shapeParams.torsoAspect * 0.3
    ));

    const detail = bodyShape.detail;
    const lampIntensity = calculateLampIntensity(robot.audioAttributes.layers, detail);

    return {
      Component: selectRobotShape(waveform),
      waveform,
      baseColors,
      scale: calculateBodyScale(octaveRange, bodyShape.scale),
      detailLevel: detail,
      shapeParams,
      microVariants,
      lampIntensity,
    };
  }, [robot.audioAttributes, robot.octaveRange]) as {
    Component: RobotSVGComponent;
    waveform: WaveformType;
    baseColors: RobotColors;
    scale: number;
    detailLevel: number;
    shapeParams: ShapeParams;
    microVariants: MicroVariants;
    lampIntensity: number;
  };

  // Battery is not audio — composed with the memoised lampIntensity outside the memo, same
  // reasoning as dimOpacity above.
  const lampOpacity = (LAMP_MIN + (1 - LAMP_MIN) * audioVisual.lampIntensity) * dimOpacity;

  // Cheap — recomputed every render/tick, same as Factory.tsx's own body/belt fills
  // (docs/specs/FACTORY_LIGHTING_RERENDER.md's staticVisual precedent).
  const colors = applyLightnessMultiplier(audioVisual.baseColors, lightnessMultiplier);

  const { Component, scale, detailLevel, shapeParams, microVariants } = audioVisual;

  // robot.greebles is seeded hardware, not audio — built outside the memo, same reasoning as
  // identityColor/dimOpacity/lampOpacity above. hideGreebles is a render-context override only
  // (RobotSelectionCard's 64px card thumbnail), like ignoreDaylight.
  const greebles = hideGreebles ? undefined : (
    <RobotGreebles greebles={robot.greebles} slots={GREEBLE_SLOTS[audioVisual.waveform]} colors={colors} />
  );

  return (
    <Component
      colors={colors}
      scale={scale}
      detailLevel={detailLevel}
      shapeParams={shapeParams}
      microVariants={microVariants}
      dimOpacity={dimOpacity}
      identityColor={identityColor}
      lampOpacity={lampOpacity}
      greebles={greebles}
    />
  );
});
