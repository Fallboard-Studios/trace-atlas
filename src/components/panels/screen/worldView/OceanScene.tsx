import React, { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import './OceanScene.css';
import { TerrainLayer } from './TerrainLayer';
import { WaterColumn } from './WaterColumn';
import { LightShafts } from './LightShafts';

import { Robot } from '@/components/robot/Robot'
import { useLocaleStore } from '@/stores/localeStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { stopRobotLifecycle } from '@/systems/robotSystems';
import { initializeLocale } from '@/systems/worldTransition';
import { consumeSessionSharePayload } from '@/utils/sessionShareUtils';
import { applySessionPayload } from '@/utils/sessionDiff';
import { Factory } from '@/components/actors/Factory';
import { Scenery } from '@/components/actors/scenery/Scenery';
import { PipeBridges } from '@/components/actors/scenery/pipeBridges';
import { BubbleLayer } from '@/components/actors/BubbleLayer';
import { isBubbleEligible } from '@/components/actors/factoryVariants';
import { getRecipeRow } from '@/systems/factoryPlacementSystem';
import { getStations } from '@/systems/stations';
import { ChargingStation } from '@/components/stations/ChargingStation';
import { ActorType, type Actor } from '@/types/Actor';
import { setRef, deleteRef } from '@/utils/refs';

import colorTheme from '@/constants/colorTheme.json';
import { hslToString } from '@/utils/colorUtils';

// ========================================
// TYPES & INTERFACES
// ========================================
interface OceanSceneProps {
  width?: number;
  height?: number;
  localTime?: number;
}

// ========================================
// SCENE LAYER
// ========================================

interface SceneLayerProps {
  /** Which of the six layers — becomes `data-scene-layer`, keyed on by tests and the perf harness. */
  name: 'back' | 'robots-back' | 'mid' | 'bubbles' | 'robots' | 'front';
  width: number;
  height: number;
  /** A layer whose content moves every frame — promoted to its own compositor layer (OceanScene.css). */
  moving?: boolean;
  children: React.ReactNode;
}

/**
 * One of the scene's stacked `<svg>` layers. All six share the viewBox and the "slice" (cover)
 * fit, and OceanScene.css makes each fill the same box, so their coordinate systems map to the
 * same pixels — a robot at scene (x, y) in either robots layer sits exactly over scene (x, y) in
 * the factory layers.
 */
function SceneLayer({ name, width, height, moving = false, children }: SceneLayerProps) {
  const className = ['ocean-scene__layer', moving && 'ocean-scene__layer--moving'].filter(Boolean).join(' ');
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      data-scene-layer={name}
      width={width}
      height={height}
      // "slice" (cover), not the default "meet" (contain) — the back layer's background rect fills
      // the whole viewBox, and it must never be smaller than the tablet screen in either
      // direction. slice scales the scene UP until both dimensions cover the box, centered,
      // cropping whichever axis overflows — never scaled down to fit with letterbox bars outside
      // it. The SVG's own default overflow:hidden (and .world-view's, WorldView.css) clips the
      // crop; nothing scrolls.
      preserveAspectRatio="xMidYMid slice"
    >
      {children}
    </svg>
  );
}

/** Registers the dissolve copies' group for the work loop (getRef('robot-dissolve-layer')). */
function registerDissolveLayer(el: SVGGElement | null): void {
  if (el) setRef('robot-dissolve-layer', el);
  else deleteRef('robot-dissolve-layer');
}

// ========================================
// DEPTH TINTS
// ========================================

type TintSlot = 'A' | 'B' | 'C' | 'D';

/**
 * The four full-screen depth tints (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.10, the depth-tint
 * sketch gate, Crawford 2026-10-08): A over the background buildings, B over the back robot row,
 * C over the midground, D over the front robot row. Each runs top → bottom from `top` to
 * vent.shadow at `alpha`. Only B and C sit between the two robot rows, so their total (40 %) is
 * the haze a robot gains or loses at a row switch.
 */
const DEPTH_TINTS: Record<TintSlot, { top: string; alpha: number }> = {
  A: { top: '#0c1c4f', alpha: 0.06 },
  B: { top: '#0c1c4f', alpha: 0.25 },
  C: { top: hslToString(colorTheme.vent.shadow), alpha: 0.2 },
  D: { top: hslToString(colorTheme.vent.shadow), alpha: 0.1 },
};

/** A tint's gradient, for the `<defs>` of the layer that draws its rect. */
function TintGradient({ slot }: { slot: TintSlot }) {
  const { top, alpha } = DEPTH_TINTS[slot];
  return (
    <linearGradient id={`depth-tint-${slot}`} x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor={top} stopOpacity={alpha} />
      <stop offset="100%" stopColor={hslToString(colorTheme.vent.shadow)} stopOpacity={alpha} />
    </linearGradient>
  );
}

function TintRect({ slot, width, height }: { slot: TintSlot; width: number; height: number }) {
  return (
    <rect
      data-depth-tint={slot}
      x="0"
      y="0"
      width={width}
      height={height}
      fill={`url(#depth-tint-${slot})`}
      pointerEvents="none"
    />
  );
}

// ========================================
// COMPONENT
// ========================================

/**
 * Root scene component. Renders six stacked SVG layers (roadmap 17.2.5; Phase 43 J4, spec §1.10),
 * back to front: static `back` (water, ridge, background factories, tint A), the moving back robot
 * row `robots-back`, static `mid` (tint B, midground factories, tint C, the ground line), the
 * moving bubble layer (every building's vent bubbles), the moving front robot row `robots`, and
 * static `front` (tint D, foreground factories). Kicks off factory placement, robot spawning and
 * factory production scheduling on mount.
 *
 * Why layers: the idle paint localizer (scripts/perf/idle-paint.mjs) found the old single <svg>
 * repainting all sixty factories at full viewport size on every frame, because the robots and
 * bubbles that move every frame shared its paint layer. The moving layers are compositor layers
 * of their own now (OceanScene.css), so a transform write repaints only a dozen robots or a
 * handful of circles; the factory layers repaint once a second, on the lighting tick.
 *
 * Z-order is the old order with one change: bubbles from every row rise behind the robots and
 * below the foreground factories (foreground-row bubbles used to pass in front of the robots —
 * Crawford chose behind, 2026-10-02). J4 adds the back robot row behind the midground: the old
 * `back` layer split in two around it, and the four depth tints replaced the old two gradients.
 *
 * No layer takes clicks (OceanScene.css): every layer is full-screen, so one that did would block
 * all those under it. `.robot` takes them, in either row.
 *
 * @param width           - SVG viewBox width in pixels (default 1920).
 * @param height          - SVG viewBox height in pixels (default 1080).
 */
export function OceanScene({
  width = 1920,
  height = 1080,
  localTime: _localTime,
}: OceanSceneProps) {

  const localeId = useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.currentLocaleId ?? '');
  // Ids only, via useShallow (docs/todo/backlog.md #27 follow-up, 2026-09-15) — not the whole
  // Robot objects. `updateRobot` (localeStore.ts) hands back a new top-level `robots` array
  // reference on every write to ANY robot in the locale (battery ticks, audio swells, field
  // edits), so subscribing to the raw array here forced this whole scene to re-render
  // constantly, even though robot movement itself is fully GSAP/ref-driven and invisible to React
  // (Robot.tsx's own mount-only effect) — none of that churn was ever actually needed. useShallow
  // compares the mapped array element-by-element; since each element is a plain string id, that
  // comparison is by value, so it correctly bails unless a robot was actually added/removed. Each
  // `<Robot>` now looks up its own current data by id (Robot.tsx's own fix), decoupled entirely
  // from this scene's own re-render cadence.
  //
  // One list per robot row (Phase 43 J4, spec §1.10): a robot draws in the row its `Robot.layer`
  // names, unset meaning foreground. Still ids only, so the scene re-renders when a robot changes
  // rows (its id moves list) and not for any other write.
  const frontRobotIds = useLocaleStore(useShallow((s) =>
    (s.locales[localeId]?.robots ?? []).filter((r) => r.layer !== 'background').map((r) => r.id)));
  const backRobotIds = useLocaleStore(useShallow((s) =>
    (s.locales[localeId]?.robots ?? []).filter((r) => r.layer === 'background').map((r) => r.id)));
  const actors = useLocaleStore((s) => s.locales[localeId]?.actors ?? []);

  // categorize factory actors by row — memoised so robot updates don't
  // create new array references and trigger unnecessary Factory re-renders
  const factories = useMemo(() => actors.filter((a) => a.type === ActorType.FACTORY), [actors]);
  // Scenery actors (roadmap Phase 42 Task 11, D2) share the same depth groups as factories,
  // interleaved in recipe row order (docs/specs/WORLD_VIEW_DISTRICTS.md §1.8) — one sorted
  // list per depth, by `config.row`, same as the recipe's own draw order.
  const sceneryActors = useMemo(() => actors.filter((a) => a.type === ActorType.SCENERY), [actors]);
  const depthOf = (a: Actor) => getRecipeRow(a.config?.district ?? 'dense', a.config?.row ?? -1)?.depth;
  const byRow = (a: Actor, b: Actor) => (a.config?.row ?? 0) - (b.config?.row ?? 0);
  const backgroundActors = useMemo(
    () => [...factories, ...sceneryActors].filter((a) => depthOf(a) === 'background').sort(byRow),
    [factories, sceneryActors],
  );
  const midgroundActors = useMemo(
    () => [...factories, ...sceneryActors].filter((a) => depthOf(a) === 'midground').sort(byRow),
    [factories, sceneryActors],
  );
  const foregroundActors = useMemo(
    () => [...factories, ...sceneryActors].filter((a) => depthOf(a) === 'foreground').sort(byRow),
    [factories, sceneryActors],
  );
  // Pipe bridges (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9, roadmap Phase 42 Task 15) are derived
  // from each depth's FACTORY actors only — no actor is created for them — so these lists are
  // separate from the factory+scenery lists above.
  const backgroundFactories = useMemo(() => factories.filter((a) => depthOf(a) === 'background'), [factories]);
  const midgroundFactories = useMemo(() => factories.filter((a) => depthOf(a) === 'midground'), [factories]);
  const foregroundFactories = useMemo(() => factories.filter((a) => depthOf(a) === 'foreground'), [factories]);

  // Derived from the seed and the placed actors (stations.ts caches per actors array), so this
  // re-derives only when the world is re-placed.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `actors` is the cache key getStations reads
  const stations = useMemo(() => getStations(localeId), [localeId, actors]);

  /** Dispatches a factory or scenery actor to its renderer (§1.8). */
  const renderActor = (actor: Actor) =>
    actor.type === ActorType.FACTORY
      ? <Factory key={actor.id} actor={actor} />
      : <Scenery key={actor.id} actor={actor} />;

  // Locale-wide count of bubble-eligible buildings (all rows, not just one) PLUS vents
  // (docs/specs/WORLD_VIEW_DISTRICTS.md §1.11 — vents vent bubbles too), passed to the bubble
  // layer so each BubbleStream can spread the aggregate bubble-burst rate across all of them
  // rather than have each one burst on its own fixed interval — see BubbleStream's
  // totalBuildings prop doc.
  const bubbleBuildingCount = useMemo(
    () =>
      factories.filter((a) => isBubbleEligible(a.config?.purpose)).length +
      sceneryActors.filter((a) => a.config?.kind === 'vent').length,
    [factories, sceneryActors],
  );

  // Bring the active locale online on mount — guarded factory placement + the
  // fixed 12-robot roster + robot-lifecycle tick start, via the same
  // initializeLocale helper Sector Settings' retransmit action uses, so this
  // setup logic exists in exactly one place (src/systems/worldTransition.ts).
  // It's idempotent on factories/robots (skips if the locale is already
  // populated — e.g. a power cycle where the scene unmounts/remounts but
  // actors/robots persist in the store), so calling it again here is safe.
  //
  // Immediately after, if a shareable link's ?session= payload is present
  // (roadmap Phase 21), apply its robotOverrides/companyDiffs/globalAudio on
  // top via applySessionPayload — with skipLocaleRebuild: true, since the
  // locale this initializeLocale call just built is already correct (its
  // attenuationStyleName/coordinates were pinned before the default locale
  // was even constructed, docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md §4.3) —
  // calling applySessionPayload's normal retransmitWorld path here would
  // tear that locale down and rebuild it a second time in the same boot.
  //
  // consumeSessionSharePayload, NOT getSessionSharePayload — this effect
  // reruns on every power cycle (unmount/remount, e.g. the power switch),
  // and getSessionSharePayload would keep returning the same payload forever,
  // re-applying it (re-registering every robot's melody, reapplying company
  // membership) on every power-on for as long as ?session= stays in the URL.
  // consumeSessionSharePayload returns it once per page load, then null.
  useEffect(() => {
    initializeLocale(localeId);

    const sharePayload = consumeSessionSharePayload();
    if (sharePayload) {
      applySessionPayload(sharePayload, { skipLocaleRebuild: true });
    }

    return () => {
      stopRobotLifecycle();
    };
    // Intentionally mount-only: this scene mounts once per power-on, and
    // initializeLocale itself is what changes an active locale now (Sector
    // Settings' retransmit action) — not a re-render of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Time-of-day is handled globally in App.tsx so the clock runs regardless of
  // tablet power state. OceanScene does not start its own interval.


  return (
    <div className="ocean-scene">
      {/* Static back layer: ocean floor, background factories, tint A. */}
      <SceneLayer name="back" width={width} height={height}>
        <defs>
          <TintGradient slot="A" />
        </defs>

        {/* Water column (§1.5): vertical gradient + surface glow, replacing the old flat
            backgroundColor rect. */}
        <WaterColumn localeId={localeId} width={width} height={height} />

        {/* Light shafts (docs/specs/WORLD_VIEW_DISTRICTS.md §1.12), after the water column and
            before the ridge so they read as light falling through the water onto the terrain. */}
        <LightShafts localeId={localeId} />

        {/* Seabed ridge (docs/specs/WORLD_VIEW_DISTRICTS.md §1.3), drawn before every
            factory so background-row towers can stand in front of it. */}
        <TerrainLayer localeId={localeId} part="ridge" width={width} height={height} />

        {/* Factory rows rendered back-to-front for proper depth perception */}
        {/* Background-row factories (rendered furthest back) */}
        <g id="factory-background-layer">
          {backgroundActors.map(renderActor)}
        </g>
        <PipeBridges factories={backgroundFactories} />
        {/* Tint A: over the background buildings, under the back robot row. */}
        <TintRect slot="A" width={width} height={height} />
      </SceneLayer>

      {/* Moving: the back robot row (Phase 43 J4) — robots whose `layer` is 'background', behind
          the midground, hazed by tints B–D like the buildings around them. */}
      <SceneLayer name="robots-back" width={width} height={height} moving>
        <g id="robot-back-layer">
          {backRobotIds.map((id) => (
            <Robot key={id} robotId={id} />
          ))}
        </g>
      </SceneLayer>

      {/* Static mid layer: tint B, midground factories, tint C, the ground line. */}
      <SceneLayer name="mid" width={width} height={height}>
        <defs>
          <TintGradient slot="B" />
          <TintGradient slot="C" />
        </defs>
        {/* Tint B: over the back robot row, under the midground. */}
        <TintRect slot="B" width={width} height={height} />

        <g id="factory-midground-layer">
          {midgroundActors.map(renderActor)}
        </g>
        <PipeBridges factories={midgroundFactories} />
        {/* Tint C: over the midground, under the front robot row. */}
        <TintRect slot="C" width={width} height={height} />

        {/* Stepped ground line (§1.3), drawn after tint C so midground bases bury under it rather
            than floating above it. In `mid`, not `back`: it is a midground silhouette (Task 32),
            so a back-row robot passes behind it. */}
        <TerrainLayer localeId={localeId} part="ground" width={width} height={height} />
      </SceneLayer>

      {/* Moving: every building's AND vent's bubbles, all rows (BubbleStream timelines), behind
          the robots (docs/specs/WORLD_VIEW_DISTRICTS.md §1.11). */}
      <SceneLayer name="bubbles" width={width} height={height} moving>
        <BubbleLayer actors={actors} totalBuildings={bubbleBuildingCount} />
      </SceneLayer>

      {/* Moving: the front robot row (GSAP-driven transforms, Robot.tsx) — every robot whose
          `layer` isn't 'background'. Charging stations (docs/specs/ROBOT_JOBS_AND_STATIONS.md
          §1.6) are three fragments interleaved with the robots, back to front: L4 · exiting
          robots · L3 · robots · L2 + halo + L1, so an entering robot passes between L2 and L3.
          Exits still draw in this row (spec §1.6's move of L4 and the exits to robots-back isn't
          built yet). Stations take no clicks. */}
      <SceneLayer name="robots" width={width} height={height} moving>
        <g id="station-l4-layer">
          {stations.map((s) => (
            <ChargingStation key={s.id} localeId={localeId} station={s} fragment="l4" />
          ))}
        </g>
        <g id="station-l3-layer">
          {stations.map((s) => (
            <ChargingStation key={s.id} localeId={localeId} station={s} fragment="l3" />
          ))}
        </g>
        <g id="robot-layer">
          {frontRobotIds.map((id) => (
            <Robot key={id} robotId={id} />
          ))}
        </g>
        {/* Layer-switch dissolve copies (Phase 43 J4, spec §1.10): the work loop appends an SVG
            `<use>` of a switching robot here — the front row's look of it, fading over the back
            row's. Empty in JSX, so React never touches what the loop puts in it. */}
        <g id="robot-dissolve-layer" ref={registerDissolveLayer} />
        <g id="station-front-layer">
          {stations.map((s) => (
            <ChargingStation key={s.id} localeId={localeId} station={s} fragment="front" />
          ))}
        </g>
      </SceneLayer>

      {/* Static front layer: tint D, then the foreground-row factories (closest to the viewer). */}
      <SceneLayer name="front" width={width} height={height}>
        <defs>
          <TintGradient slot="D" />
        </defs>
        {/* Tint D: over the front robot row, under the foreground. */}
        <TintRect slot="D" width={width} height={height} />
        <g id="factory-foreground-layer">
          {foregroundActors.map(renderActor)}
        </g>
        <PipeBridges factories={foregroundFactories} />
        <g id="ui-layer" />
      </SceneLayer>
    </div>
  );
}
