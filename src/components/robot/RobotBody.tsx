// ========================================
// IMPORTS
// ========================================
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';

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
import { registerArcDecorator, deleteArcDecorator } from '../../animation/robotMotionRegistry';
import { getActiveLocaleId } from '../../utils/localeHelpers';
import { RobotGem, type RobotGemOrbiters, type RobotGemBodyLines, type RobotGemHalo } from './gem/RobotGem';
import { useOrbiterMotion } from './gem/useOrbiterMotion';
import { useHaloMotion } from './gem/useHaloMotion';
import { useStripFlicker, type StripLine, type FlickerTrigger } from './gem/useStripFlicker';
import { getRobotGem } from './gem/polygon';
import { gemPalette } from './gem/gemPalette';
import { batteryFacetContrast } from './gem/gemShading';
import { orbiterDials } from './gem/orbiterDials';
import { orbiterPlan } from './gem/orbiterMotion';
import { bodyLineDials, BODY_STRIP_OPACITY } from './gem/bodyLineDials';
import { useNoteCloud } from './notes/useNoteCloud';
import { noteColor } from './notes/noteRows';
import { getStageScale } from '../panels/screen/worldView/useStageFit';
import { noteStrength } from './notes/noteStrength';
import {
  getSingledOutRobotId,
  isRobotNotesWoken,
  sleepRobotNotes,
  subscribeSingledOut,
  subscribeWokenNotes,
  wakeRobotNotes,
} from '../../systems/robotAttention';
import { BACK_LAYER_SCALE, NOTE_DIM, NOTE_PEAK_STRENGTH } from '../../constants';

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

/** What a card and an avatar subscribe to for the world's attention: nothing. */
const subscribeNothing = () => () => {};

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
 * Phase 41 (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.5) adds the halo and a memo for the Top/Mid
 * line widths (the gain-LFO link depths). The halo's only input is its colour — the company colour
 * (the one non-audio visual input, read with a narrow selector so a company rename never re-renders
 * the body), else the identity colour — and nothing audio sizes it. `useHaloMotion`'s `decorateArc`
 * is registered (world only) for the work loop's station exit/entry arcs (Phase 43), its only
 * caller (the density-driven orbiter attach/detach hop stopped decorating on 2026-10-06), so the
 * halo's waves show only as a robot exits or enters a station. `useStripFlicker` plays each line's
 * two-second flicker on its own trigger tuple. On cards (no `motion`) the orbiter and flicker hooks
 * are disabled — `enabled: false` returns before touching GSAP — and the halo never renders at all.
 */
export const RobotBody = memo(function RobotBody({ robot, ignoreDaylight, ignoreScale, motion }: RobotBodyProps) {
  // Day/night from the active locale's local time (0..24, written once a second by
  // AttenuationStyleView) — the same curve buildings use.
  // A body that ignores daylight (the roster's gems) reads a constant, so the once-a-second clock tick
  // does not re-render it.
  const localTime = useUIStore((s) => (ignoreDaylight ? 12 : (s.activeLocaleLocalTime ?? 12)));
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

  // The halo's waves wear the company colour, else the robot's identity colour; the gradient id is per
  // rendered instance (the world and the avatar show one robot at once).
  const halo: RobotGemHalo = {
    color: companyColor ?? (robot.identityColor || FALLBACK_IDENTITY),
    gradientId: `halo-${motion ?? 'card'}-${robot.id}`,
  };

  const gemRef = useRef<SVGGElement>(null);
  const motionEnabled = motion !== undefined;

  // 2026-10-06 (Crawford): the orbiter attach/detach hop below is density-driven (every hop today
  // traces to rhythmicDensity via orbiterDials().count), and the halo's waves are reserved for the
  // station exit/entry arcs instead — so its `decorateArc` is not wired into useOrbiterMotion.
  // Phase 43 (spec §1.8): in the world context it is registered in robotMotionRegistry for the
  // work loop, which calls it on those arcs.
  const { decorateArc } = useHaloMotion({
    root: gemRef,
    robotId: robot.id,
    context: motion ?? 'world',
    dimOpacity,
  });
  // A layout effect: the parent Robot's mount (useGSAP, also layout) hands the robot to the work
  // loop, which can play an exit arc at once and reads this decorator then (Phase 43 Task 23).
  useLayoutEffect(() => {
    if (motion !== 'world') return;
    registerArcDecorator(robot.id, decorateArc);
    return () => deleteArcDecorator(robot.id, decorateArc);
  }, [motion, robot.id, decorateArc]);

  useOrbiterMotion({
    root: gemRef,
    robotId: robot.id,
    context: motion ?? 'world',
    gem,
    plan,
    dials: composition,
    enabled: motionEnabled,
  });

  useStripFlicker({
    root: gemRef,
    robotId: robot.id,
    context: motion ?? 'world',
    gemSeed: robot.gemSeed,
    triggers: flickerTriggers,
    enabled: motionEnabled,
  });

  // Attention (docs/specs/ROBOT_NOTE_CLOUD.md §1.7), world only: a body is singled out while it is under the pointer
  // or followed by the Deck camera (robotAttention), selected, soloed or highlighted. The snapshots are booleans
  // about this robot, so the pointer moving between two other robots re-renders nothing here. A singled-out robot's
  // cloud is undimmed: `--note-dim` on the cloud's box, which both masks read, so a flip rebuilds nothing.
  const isWorld = motion === 'world';
  const isSingledOutHere = useCallback(() => isWorld && getSingledOutRobotId() === robot.id, [isWorld, robot.id]);
  const pointedOrFollowed = useSyncExternalStore(isWorld ? subscribeSingledOut : subscribeNothing, isSingledOutHere);
  const selected = useUIStore((s) => isWorld && s.selectedRobotId === robot.id);
  const singledOut = pointedOrFollowed || selected || robot.audioMode === 'solo' || robot.audioMode === 'highlight';
  useLayoutEffect(() => {
    if (!isWorld) return;
    const box = gemRef.current?.closest<HTMLElement>('[data-note-cloud]');
    box?.style.setProperty('--note-dim', String(singledOut ? 1 : NOTE_DIM));
  }, [isWorld, singledOut]);

  // Woken (§1.7): pointing at the robot (robotAttention) or selecting it wakes its notes, and it stays woken until it
  // is next in its station (`activity === 'charging'`). The Deck camera following it does not wake it. The world
  // body's unmount ends the wake (plan, Architecture Decisions: keyed on the robot id alone).
  const isWokenHere = useCallback(() => isWorld && isRobotNotesWoken(robot.id), [isWorld, robot.id]);
  const woken = useSyncExternalStore(isWorld ? subscribeWokenNotes : subscribeNothing, isWokenHere);
  useEffect(() => {
    if (isWorld && selected) wakeRobotNotes(robot.id);
  }, [isWorld, selected, robot.id]);
  useEffect(() => {
    if (isWorld && robot.activity === 'charging') sleepRobotNotes(robot.id);
  }, [isWorld, robot.activity, robot.id]);
  useEffect(() => {
    if (!isWorld) return;
    return () => sleepRobotNotes(robot.id);
  }, [isWorld, robot.id]);

  // The note cloud (docs/specs/ROBOT_NOTE_CLOUD.md §1.3–§1.8), in the world and on the desk avatar; never on a card.
  // Its colour is the company's, else the identity hue's complement. In the world a pixel on screen is the stage's
  // scale times the row's, and its strength is the battery's, or the peak while woken. The avatar is always at the
  // peak (the player turned to it by opening its screen; its box sets the dim to 1), and its pixel is the fit its box
  // wrote (`--note-fit-scale`), read from the inline style when a note arrives: no layout read.
  const rowScale = robot.layer === 'background' ? BACK_LAYER_SCALE : 1;
  useNoteCloud({
    root: gemRef,
    robotId: robot.id,
    context: motion ?? 'world',
    enabled: motionEnabled,
    gem,
    scale: ignoreScale ? 1 : audio.scale,
    color: noteColor(robot.identityColor || FALLBACK_IDENTITY, companyColor),
    pxPerUnit: isWorld
      ? () => getStageScale() * rowScale
      : () => parseFloat(gemRef.current?.closest<HTMLElement>('[data-note-cloud]')?.style.getPropertyValue('--note-fit-scale') ?? ''),
    strength: isWorld ? noteStrength(robot.batteryLevel, woken) : NOTE_PEAK_STRENGTH,
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
    />
  );
});
