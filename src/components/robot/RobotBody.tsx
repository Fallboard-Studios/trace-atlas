// ========================================
// IMPORTS
// ========================================
import { memo, useMemo, useRef } from 'react';

import type { Robot } from '../../types/Robot';
import {
  bodyShapeFromAdsr,
  calculateBodyScale,
  calculateLampIntensity,
  computeBatteryDimOpacity,
  layerLitLevel,
  LAMP_MIN,
} from './robotVisualHelpers';
import { useUIStore } from '../../stores/uiStore';
import { RobotGem, type RobotGemOrbiters, type RobotGemBodyLines, type RobotGemHalo } from './gem/RobotGem';
import { useOrbiterMotion } from './gem/useOrbiterMotion';
import { getRobotGem } from './gem/polygon';
import { gemPalette } from './gem/gemPalette';
import { batteryFacetContrast } from './gem/gemShading';
import { orbiterDials } from './gem/orbiterDials';
import { orbiterPlan } from './gem/orbiterMotion';

// ========================================
// TYPES
// ========================================
interface RobotBodyProps {
  robot: Robot;
  /**
   * When true, renders as if local time is always neutral (no day/night dimming) — used by the
   * selection card and the detail avatar so they read the same at any time of day. Battery dim
   * is a separate, non-audio signal and is unaffected either way.
   */
  ignoreDaylight?: boolean;
  /**
   * When true, draws at scale 1 so the robot exactly fills its own canvas — the card and avatar
   * pair this with gemViewBox, fitting every robot to its tile. Body scale (octave range ×
   * attack, up to 1.69) still shows in-world, where nothing frames it.
   */
  ignoreScale?: boolean;
  /**
   * 'world' | 'avatar' enables orbiter motion — passed through to `RobotGem`'s `orbiters.motion`.
   * Not yet wired by any caller (Task 12 wires `Robot.tsx`/`RobotDisplaySection.tsx`); until then
   * every real caller stays on the static path by omitting this prop.
   */
  motion?: 'world' | 'avatar';
}

/** Same default the hand-drawn shapes applied when a fixture omitted identityColor. */
const FALLBACK_IDENTITY = '#78cce2';

/** Interim (Phase 41 Task 5 → Task 7): Phase 40's fixed 0.8 body lines with the strip transparent,
 *  so the live app stays pixel-identical until the bodyLineDials memo replaces this. */
const BODY_LINES_LEGACY: RobotGemBodyLines = { top: 0.8, midLeft: 0.8, midRight: 0.8, stripOpacity: 0 };

/** Interim (Phase 41 Task 6 → Task 7): six fully transparent stops, so the halo element exists but
 *  shows nothing until the haloDials memo replaces this. */
const HALO_LEGACY_STOPS = [0, 0.2, 0.4, 0.6, 0.8, 1].map((offset) => ({ offset, opacity: 0 }));

// ========================================
// COMPONENT
// ========================================
/**
 * RobotBody — a gem polygon robot (Roadmap Phase 39, docs/specs/GEM_POLYGON_ROBOTS.md §1.5).
 *
 * The body is seeded identity, not audio: its geometry is getRobotGem(robot.gemSeed) and its
 * colour robot.identityColor. Audio reaches it through three continuous dials only — light
 * intensity, each Mid's lit level, and scale — computed in the memo below, which nothing
 * non-audio may enter (backlog item 22: the once/sec daylight tick must not recompute it).
 */
export const RobotBody = memo(function RobotBody({ robot, ignoreDaylight, ignoreScale, motion }: RobotBodyProps) {
  // Day/night from the active locale's local time (0..24, written once a second by
  // AttenuationStyleView) — the same curve buildings use.
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);
  const daylight = ignoreDaylight ? 1 : 0.5 + 0.5 * Math.sin(((localTime - 6) / 24) * Math.PI * 2);

  // Battery is not audio — outside the memo.
  const dimOpacity = computeBatteryDimOpacity(robot.batteryLevel);

  // Audio only. Inputs: the envelope, the octave range and the layer gains.
  const audio = useMemo(() => {
    const { adsr, layers } = robot.audioAttributes;
    const octaveRange = robot.audioAttributes.octaveRange ?? robot.octaveRange;
    const bodyShape = bodyShapeFromAdsr(adsr);
    const midLit: [number, number] = [layerLitLevel(layers?.[1]?.gain), layerLitLevel(layers?.[2]?.gain)];
    return {
      scale: calculateBodyScale(octaveRange, bodyShape.scale),
      lampIntensity: calculateLampIntensity(layers, bodyShape.detail),
      // Coaxial (layers[1]) lights midLeft, Harmonic (layers[2]) midRight.
      midLit,
    };
  }, [robot.audioAttributes, robot.octaveRange]);

  // Composition only — separate from the audio memo above so an envelope edit never recomputes
  // this, and a composition edit never recomputes that (backlog item 22's same discipline).
  const composition = useMemo(
    () =>
      orbiterDials({
        rhythmicDensity: robot.rhythmicDensity,
        rhythmicMotifLength: robot.rhythmicMotifLength,
        noteVariance: robot.noteVariance,
        pitchRepeat: robot.pitchRepeat,
      }),
    [robot.rhythmicDensity, robot.rhythmicMotifLength, robot.noteVariance, robot.pitchRepeat],
  );
  // Seeded layout — a Map hit after the first render of this seed, outside both memos.
  const plan = orbiterPlan(robot.gemSeed);

  // Seeded identity — a Map hit after the first render of this seed.
  const gem = getRobotGem(robot.gemSeed);
  const palette = gemPalette(gem, robot.identityColor ?? FALLBACK_IDENTITY, daylight, audio.midLit, batteryFacetContrast(dimOpacity));
  const lightOpacity = (LAMP_MIN + (1 - LAMP_MIN) * audio.lampIntensity) * dimOpacity;

  const orbiters: RobotGemOrbiters = {
    count: composition.count,
    size: composition.size,
    lineWidth: composition.lineWidth,
    stripOpacity: composition.stripOpacity,
    cornerOrder: plan.cornerOrder,
    motion: motion !== undefined,
  };

  const halo: RobotGemHalo = {
    color: robot.identityColor ?? FALLBACK_IDENTITY,
    rx: 30,
    ry: 30,
    stops: HALO_LEGACY_STOPS,
    opacity: dimOpacity,
    gradientId: `halo-${motion ?? 'card'}-${robot.id}`,
  };

  const gemRef = useRef<SVGGElement>(null);
  useOrbiterMotion({
    root: gemRef,
    robotId: robot.id,
    context: motion ?? 'world',
    gem,
    plan,
    dials: composition,
    enabled: motion !== undefined,
  });

  return (
    <RobotGem
      ref={gemRef}
      gem={gem}
      palette={palette}
      lightOpacity={lightOpacity}
      scale={ignoreScale ? 1 : audio.scale}
      orbiters={orbiters}
      bodyLines={BODY_LINES_LEGACY}
      halo={halo}
    />
  );
});
