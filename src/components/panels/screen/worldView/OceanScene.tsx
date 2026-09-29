import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import './OceanScene.css';

import { Robot } from '@/components/robot/Robot'
import { useLocaleStore } from '@/stores/localeStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { stopRobotLifecycle } from '@/systems/robotSystems';
import { initializeLocale } from '@/systems/worldTransition';
import { getSessionSharePayload } from '@/utils/sessionShareUtils';
import { applySessionPayload } from '@/utils/sessionDiff';
import { Factory } from '@/components/actors/Factory';
import { isBubbleEligible } from '@/components/actors/factoryVariants';
import { getRowConfig } from '@/systems/factoryPlacementSystem';
import { ActorType } from '@/types/Actor';

import colorTheme from '@/constants/colorTheme.json';
import { hslToString } from '@/utils/colorUtils';

// ========================================
// TYPES & INTERFACES
// ========================================
interface OceanSceneProps {
  width?: number;
  height?: number;
  backgroundColor?: string;
  localTime?: number;
}

// ========================================
// COMPONENT
// ========================================

/**
 * Root SVG scene component. Renders factory building layers (background →
 * midground → foreground), depth-gradient overlays, the robot layer, and the
 * debug UI overlay. Kicks off factory placement, robot spawning, factory
 * production scheduling on mount.
 *
 * @param width           - SVG viewBox width in pixels (default 1920).
 * @param height          - SVG viewBox height in pixels (default 1080).
 * @param backgroundColor - CSS colour string for the ocean background rect.
 */
export function OceanScene({
  width = 1920,
  height = 1080,
  backgroundColor = '#0a1128',
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
  const backgroundFactories = useMemo(
    () => actors.filter((a) => {
      if (a.type !== ActorType.FACTORY) return false;
      return getRowConfig(a.config?.row ?? -1)?.row === 'background';
    }),
    [actors],
  );
  const midgroundFactories = useMemo(
    () => actors.filter((a) => {
      if (a.type !== ActorType.FACTORY) return false;
      return getRowConfig(a.config?.row ?? -1)?.row === 'midground';
    }),
    [actors],
  );
  const foregroundFactories = useMemo(
    () => actors.filter((a) => {
      if (a.type !== ActorType.FACTORY) return false;
      return getRowConfig(a.config?.row ?? -1)?.row === 'foreground';
    }),
    [actors],
  );

  // Locale-wide count of bubble-eligible buildings (all rows, not just one),
  // passed to every Factory so BubbleStream can spread the aggregate
  // bubble-burst rate across all of them rather than have each one burst on
  // its own fixed interval — see Factory's totalBubbleBuildings prop doc.
  const bubbleBuildingCount = useMemo(
    () => actors.filter((a) => a.type === ActorType.FACTORY && isBubbleEligible(a.config?.purpose)).length,
    [actors],
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
  useEffect(() => {
    initializeLocale(localeId);

    const sharePayload = getSessionSharePayload();
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
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="ocean-scene"
        width={width}
        height={height}
        // "slice" (cover), not the default "meet" (contain) — the background
        // rect a few lines down fills the whole viewBox, and it must never be
        // smaller than the tablet screen in either direction. slice scales
        // the scene UP until both dimensions cover the box, centered,
        // cropping whichever axis overflows — never scaled down to fit with
        // letterbox bars outside it. The SVG's own default overflow:hidden
        // (and .world-view's, WorldView.css) clips the crop; nothing scrolls.
        preserveAspectRatio="xMidYMid slice"
      >
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

        <rect fill={backgroundColor} width={width} height={height} />

        {/* Factory rows rendered back-to-front for proper depth perception */}
        {/* Background-row factories (rendered furthest back) */}
        <g id="factory-background-layer">
          {backgroundFactories.map((actor) => (
            <Factory key={actor.id} actor={actor} totalBubbleBuildings={bubbleBuildingCount} />
          ))}
        </g>
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
          {/* full-type rows */}
          {midgroundFactories.map((actor) => (
            <Factory key={actor.id} actor={actor} totalBubbleBuildings={bubbleBuildingCount} />
          ))}
        </g>
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



        <g id="robot-layer">
          {robotIds.map((id) => (
            <Robot key={id} robotId={id} />
          ))}
        </g>
        {/* Foreground-row factories (rendered closest to viewer) */}
        <g id="factory-foreground-layer">
          {foregroundFactories.map((actor) => (
            <Factory key={actor.id} actor={actor} totalBubbleBuildings={bubbleBuildingCount} />
          ))}
        </g>
        <g id="ui-layer" />
      </svg>
    </>
  );
}
