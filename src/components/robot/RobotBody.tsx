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
import { useLocaleStore } from '../../stores/localeStore';
import { getActiveLocaleId } from '../../utils/localeHelpers';
import { RobotGem, type RobotGemOrbiters, type RobotGemBodyLines, type RobotGemHalo, type RobotGemRipple } from './gem/RobotGem';
import { useOrbiterMotion } from './gem/useOrbiterMotion';
import { useHaloMotion } from './gem/useHaloMotion';
import { useStripFlicker, type StripLine, type FlickerTrigger } from './gem/useStripFlicker';
import { getRobotGem } from './gem/polygon';
import { gemPalette } from './gem/gemPalette';
import { batteryFacetContrast } from './gem/gemShading';
import { orbiterDials } from './gem/orbiterDials';
import { orbiterPlan } from './gem/orbiterMotion';
import { haloDials } from './gem/haloDials';
import { bodyLineDials, BODY_STRIP_OPACITY } from './gem/bodyLineDials';

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
 *
 * Phase 41 (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.5) adds two more memos beside it, each with
 * its own inputs: the halo (volume, envelope, identity and the company colour — the one non-audio
 * visual input, read with a narrow selector so a company rename never re-renders the body) and
 * the Top/Mid line widths (the gain-LFO link depths). In world/avatar, `useHaloMotion` owns the
 * halo's attributes after mount (its `decorateArc` feeds `useOrbiterMotion`'s spawn/despawn hop,
 * which is the halo's only moment of visibility — amendment, 2026-10-06) and `useStripFlicker`
 * plays each line's two-second flicker on its own trigger tuple. On cards (no `motion`) neither
 * hook runs — `enabled: false` returns before touching GSAP — and the halo never renders at all.
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

  // Company colour — the halo's one non-audio input (spec Assumption 2). The selector returns a
  // single string, so only a colour change of *this* robot's company re-renders the body.
  const localeId = getActiveLocaleId();
  const companyColor = useLocaleStore((s) => s.locales[localeId]?.companies?.find((c) => c.id === robot.companyId)?.color);

  // Halo only — volume, envelope, identity and company colour (spec §1.1). Its own memo so a
  // waveform, layer or composition edit never recomputes it.
  const { masterVolume, identityColor } = robot;
  const { adsr } = robot.audioAttributes;
  const haloDial = useMemo(
    () => haloDials({ masterVolume, identityColor, audioAttributes: { adsr } }, companyColor),
    [masterVolume, adsr, identityColor, companyColor],
  );

  // Body line widths only — the gain-LFO link depths (spec §1.2). `lfoLinks` is replaced wholesale
  // on edit, so the reference is the dependency.
  const bodyLines = useMemo<RobotGemBodyLines>(
    () => ({ ...bodyLineDials(robot.lfoLinks), stripOpacity: BODY_STRIP_OPACITY }),
    [robot.lfoLinks],
  );

  // Flicker triggers only — each line's own tuple (spec §1.4, Task 13): a change in any of a
  // line's values restarts that line's two-second flicker, and no other line's.
  const flickerTriggers = useMemo<Record<StripLine, FlickerTrigger>>(() => {
    const links = robot.lfoLinks;
    const top = links?.['layer0.gain'];
    const midLeft = links?.['layer1.gain'];
    const midRight = links?.['layer2.gain'];
    const layers = robot.audioAttributes.layers;
    return {
      top: [top?.depth, top?.lane],
      midLeft: [midLeft?.depth, midLeft?.lane, layers?.[1]?.gain],
      midRight: [midRight?.depth, midRight?.lane, layers?.[2]?.gain],
      orbiters: [robot.noteVariance?.value, robot.pitchRepeat],
    };
  }, [robot.lfoLinks, robot.audioAttributes.layers, robot.noteVariance, robot.pitchRepeat]);

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

  // The ellipse is stretched with the canvas (rx = radius × widthFactor, spec §1.1 "Shape").
  // Opacity: cards never render the halo at all (RobotGem gates it on orbiters.motion), so its
  // value there is moot; in world/avatar it starts at 0 (amendment: no idle baseline — the halo
  // is invisible except during a spawn/despawn arc) and `useHaloMotion` owns it from mount on.
  // Gradient id per rendered instance.
  const halo: RobotGemHalo = {
    color: haloDial.color,
    rx: haloDial.radius * gem.widthFactor,
    ry: haloDial.radius,
    stops: haloDial.stops,
    opacity: motion !== undefined ? 0 : dimOpacity,
    gradientId: `halo-${motion ?? 'card'}-${robot.id}`,
  };
  const ripple: RobotGemRipple | undefined = motion !== undefined ? { gradientId: `ripple-${motion}-${robot.id}` } : undefined;

  const gemRef = useRef<SVGGElement>(null);
  const motionEnabled = motion !== undefined;

  const { decorateArc } = useHaloMotion({
    root: gemRef,
    robotId: robot.id,
    context: motion ?? 'world',
    halo: { rx: halo.rx, ry: halo.ry, stops: halo.stops },
    dimOpacity,
    enabled: motionEnabled,
  });

  useOrbiterMotion({
    root: gemRef,
    robotId: robot.id,
    context: motion ?? 'world',
    gem,
    plan,
    dials: composition,
    enabled: motionEnabled,
    decorateArc,
  });

  useStripFlicker({
    root: gemRef,
    robotId: robot.id,
    context: motion ?? 'world',
    gemSeed: robot.gemSeed,
    triggers: flickerTriggers,
    enabled: motionEnabled,
  });

  return (
    <RobotGem
      ref={gemRef}
      gem={gem}
      palette={palette}
      lightOpacity={lightOpacity}
      scale={ignoreScale ? 1 : audio.scale}
      orbiters={orbiters}
      bodyLines={bodyLines}
      halo={halo}
      ripple={ripple}
    />
  );
});
