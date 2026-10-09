// ========================================
// IMPORTS
// ========================================
import { memo, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { RobotBody } from './RobotBody';
import { setRef, deleteRef } from '../../utils/refs';
import { useUIStore } from '../../stores/uiStore';
import { useLocaleStore } from '../../stores/localeStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../../stores/attenuationStyleStore';
import { onRobotMounted } from '../../systems/workLoop';

// ========================================
// TYPES
// ========================================
interface RobotProps {
  robotId: string;
}

// ========================================
// COMPONENT
// ========================================
/**
 * Robot - Main robot component with positioning, selection, and interaction
 * Handles click events and stores SVG ref for GSAP animations
 *
 * IMPORTANT: The top-level <g> has NO React-managed `transform` attribute.
 * GSAP is the single source of truth for all transforms (position, rotation)
 * on this element. React re-renders must never overwrite GSAP's SVG
 * transform attribute. Robots have no discernible front (Roadmap Phase 40,
 * docs/specs/ORBITING_POLYGONS.md §1.6) and no longer mirror on direction
 * change — only x/y and the swim tilt's rotation are GSAP-owned.
 *
 * Takes `robotId`, not the whole `Robot` object (docs/todo/backlog.md #27 follow-up, 2026-09-15)
 * — looks its own robot up directly via `useLocaleStore` (`.find()` returns the existing array
 * element, same reference across renders unless THIS robot specifically changed), the same fix
 * already applied to RobotSelectionCard. Before this, OceanScene handed every `<Robot>` its
 * `Robot` object directly from a `.map()` over the whole locale's `robots` array; `updateRobot`
 * (localeStore.ts) hands back a new top-level `robots` array reference on *every* write to *any*
 * robot in the locale (battery ticks, audio swells, field edits), so OceanScene's own re-render —
 * and by extension every `<Robot>` beneath it, none of which were memoized — fired constantly,
 * even though robot movement itself is fully GSAP/ref-driven and invisible to React (see the
 * mount-only effect below) and so was never actually the source of that churn.
 */
export const Robot = memo(function Robot({ robotId }: RobotProps) {
  const ref = useRef<SVGGElement>(null);
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const selectRobot = useUIStore((s) => s.selectRobot);
  const activeHubTile = useUIStore((s) => s.activeHubTile);
  const setActiveHubTile = useUIStore((s) => s.setActiveHubTile);
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const localeId = useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.currentLocaleId ?? '');
  const robot = useLocaleStore((s) => s.locales[localeId]?.robots?.find((r) => r.id === robotId));
  const isSelected = selectedRobotId === robotId;
  // Roadmap Phase 10 — independent of isSelected; reuses the same .robot.selected glow (see
  // OceanScene.css) rather than a second visual language for "highlighted." Only a specific
  // selected company glows its members — "All" (the default selection, uiStore's
  // allRobotsSelected, selectedCompanyId null) glows nobody, since a highlight on every robot
  // would mark nothing apart.
  const isCompanyMember = selectedCompanyId !== null && robot?.companyId === selectedCompanyId;

  // useGSAP fires before paint (like useLayoutEffect), preventing a single frame at (0,0).
  // Intentionally run this effect only on mount so GSAP owns transforms.
  // Depends on `robotId` (the prop, always defined), not `robot.id` — `robot` itself can be
  // transiently undefined (see the defensive `if (!robot)` below), and hooks must run
  // unconditionally regardless.
  useGSAP(() => {
    if (ref.current && robot) {
      setRef(`robot-${robotId}`, ref.current);
      gsap.set(ref.current, {
        x: robot.position.x,
        y: robot.position.y,
        transformOrigin: '50% 50%',
      });
      // The work loop takes it from here (Phase 43, spec §1.7): hidden in its station if Docked,
      // out of it if 'exiting', else on to work — also the whole remount and power-on story.
      onRobotMounted(localeId, robotId);
    }
    return () => deleteRef(`robot-${robotId}`);
  }, { scope: ref, dependencies: [robotId] });

  // Defensive only — OceanScene only ever renders a robotId that exists in the locale's roster
  // (fixed at 12, created once at locale load, never removed).
  if (!robot) return null;

  // Roadmap Phase 8: clicking a robot in the world view also opens the Robots hub tile, but only
  // from the main hub grid (activeHubTile === null) — once any tile is already open, the user is
  // already where they meant to go, so the active tile is left alone. Console.tsx renders nothing
  // at all in that state (docs/specs/HEADER_HUB_CONSOLIDATION.md §1.7) — with no .console element
  // present to block anything, this click reaches WorldView for free, no pointer-events
  // special-casing needed the way the old console--grid mechanism once provided.
  const handleClick = () => {
    selectRobot(robot.id);
    if (activeHubTile === null) setActiveHubTile('robots');
  };

  const className = ['robot', isSelected && 'selected', isCompanyMember && 'isCompanyMember']
    .filter(Boolean)
    .join(' ');

  // Phase 43 J4 (spec §1.10): the id is what a layer switch's dissolve copy (an SVG `<use>` in the
  // other robot row) points at. `.robot__row` carries the back row's scale (BACK_LAYER_SCALE), set
  // by the work loop about the gem canvas centre — the frame sceneToOrbiterLocal assumes — so it
  // never shares a transform with the swim's x/y/rotation on this group.
  return (
    <g
      ref={ref}
      id={`world-robot-${robotId}`}
      className={className}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <g className="robot__row">
        <RobotBody robot={robot} motion="world" />
      </g>
    </g>
  );
});
