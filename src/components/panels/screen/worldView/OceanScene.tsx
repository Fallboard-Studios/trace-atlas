import React, { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import './OceanScene.css';
import { TerrainLayer } from './TerrainLayer';
import { WaterColumn } from './WaterColumn';

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
import { ActorType, type Actor } from '@/types/Actor';

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
  /** Which of the four layers — becomes `data-scene-layer`, keyed on by tests and the perf harness. */
  name: 'back' | 'robots' | 'bubbles' | 'front';
  width: number;
  height: number;
  /** A layer whose content moves every frame — promoted to its own compositor layer (OceanScene.css). */
  moving?: boolean;
  children: React.ReactNode;
}

/**
 * One of the scene's stacked `<svg>` layers. All four share the viewBox and the "slice" (cover)
 * fit, and OceanScene.css makes each fill the same box, so their coordinate systems map to the
 * same pixels — a robot at scene (x, y) in the robots layer sits exactly over scene (x, y) in the
 * factory layers.
 */
function SceneLayer({ name, width, height, moving = false, children }: SceneLayerProps) {
  const className = [
    'ocean-scene__layer',
    moving && 'ocean-scene__layer--moving',
    name === 'robots' && 'ocean-scene__layer--robots',
  ].filter(Boolean).join(' ');
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

// ========================================
// COMPONENT
// ========================================

/**
 * Root scene component. Renders four stacked SVG layers (roadmap 17.2.5): a static back layer
 * (background → midground factories with the depth-gradient overlays between them), the moving
 * bubble layer (every building's vent bubbles), the moving robot layer, and a static front layer
 * (foreground factories). Kicks off factory placement, robot spawning and factory production
 * scheduling on mount.
 *
 * Why layers: the idle paint localizer (scripts/perf/idle-paint.mjs) found the old single <svg>
 * repainting all sixty factories at full viewport size on every frame, because the robots and
 * bubbles that move every frame shared its paint layer. The moving layers are compositor layers
 * of their own now (OceanScene.css), so a transform write repaints only a dozen robots or a
 * handful of circles; the factory layers repaint once a second, on the lighting tick.
 *
 * Z-order is the old order with one change: bubbles from every row rise behind the robots and
 * below the foreground factories (foreground-row bubbles used to pass in front of the robots —
 * Crawford chose behind, 2026-10-02).
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
  const robotIds = useLocaleStore(useShallow((s) => (s.locales[localeId]?.robots ?? []).map((r) => r.id)));
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
      {/* Static back layer: ocean floor, background → midground factories, depth gradients. */}
      <SceneLayer name="back" width={width} height={height}>
        <defs>
          {/* Gradients between factory rows */}
          <linearGradient id="gradient-0-1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0c1c4f" stopOpacity=".7" />
            <stop offset="100%" stopColor={hslToString(colorTheme.vent.shadow)} stopOpacity=".7" />
          </linearGradient>
          <linearGradient id="gradient-1-2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={hslToString(colorTheme.vent.shadow)} stopOpacity=".5" />
            <stop offset="100%" stopColor={hslToString(colorTheme.vent.shadow)} stopOpacity=".5" />
          </linearGradient>
        </defs>

        {/* Water column (§1.5): vertical gradient + surface glow, replacing the old flat
            backgroundColor rect. */}
        <WaterColumn localeId={localeId} width={width} height={height} />

        {/* Seabed ridge (docs/specs/WORLD_VIEW_DISTRICTS.md §1.3), drawn before every
            factory so background-row towers can stand in front of it. */}
        <TerrainLayer localeId={localeId} part="ridge" width={width} height={height} />

        {/* Factory rows rendered back-to-front for proper depth perception */}
        {/* Background-row factories (rendered furthest back) */}
        <g id="factory-background-layer">
          {backgroundActors.map(renderActor)}
        </g>
        <PipeBridges factories={backgroundFactories} />
        {/* Gradient between background and midground layers */}
        <rect
          id="gradient-back-mid"
          x="0"
          y="0"
          width={width}
          height={height}
          fill="url(#gradient-0-1)"
          pointerEvents="none"
        />

        <g id="factory-midground-layer">
          {midgroundActors.map(renderActor)}
        </g>
        <PipeBridges factories={midgroundFactories} />
        {/* Gradient between midground and foreground layers */}
        <rect
          id="gradient-mid-front"
          x="0"
          y="0"
          width={width}
          height={height}
          fill="url(#gradient-1-2)"
          pointerEvents="none"
        />

        {/* Stepped ground line (§1.3), drawn after the mid/front gradient so midground
            bases bury under it rather than floating above it. */}
        <TerrainLayer localeId={localeId} part="ground" width={width} height={height} />
      </SceneLayer>

      {/* Moving: every building's AND vent's bubbles, all rows (BubbleStream timelines), behind
          the robots (docs/specs/WORLD_VIEW_DISTRICTS.md §1.11). */}
      <SceneLayer name="bubbles" width={width} height={height} moving>
        <BubbleLayer actors={actors} totalBuildings={bubbleBuildingCount} />
      </SceneLayer>

      {/* Moving: the robots (GSAP-driven transforms, Robot.tsx). The one layer that takes clicks. */}
      <SceneLayer name="robots" width={width} height={height} moving>
        <g id="robot-layer">
          {robotIds.map((id) => (
            <Robot key={id} robotId={id} />
          ))}
        </g>
      </SceneLayer>

      {/* Static front layer: foreground-row factories (rendered closest to viewer). */}
      <SceneLayer name="front" width={width} height={height}>
        <g id="factory-foreground-layer">
          {foregroundActors.map(renderActor)}
        </g>
        <PipeBridges factories={foregroundFactories} />
        <g id="ui-layer" />
      </SceneLayer>
    </div>
  );
}
