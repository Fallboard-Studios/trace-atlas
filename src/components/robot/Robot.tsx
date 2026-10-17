// ========================================
// IMPORTS
// ========================================
import { memo, useRef, type CSSProperties } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { RobotBody } from './RobotBody';
import { GEM_CANVAS_H, gemViewBox, gemWidth, getRobotGem } from './gem/polygon';
import { setRef, deleteRef } from '../../utils/refs';
import { useUIStore } from '../../stores/uiStore';
import { useLocaleStore } from '../../stores/localeStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../../stores/attenuationStyleStore';
import { onRobotMounted } from '../../systems/workLoop';
import { selectEntity } from '../panels/screen/nav/navActions';
import { slotForLayer } from '../panels/screen/worldView/sceneStack';

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
 * Handles click events and stores the mover's ref for GSAP animations
 *
 * A robot is a mover (docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.3, §1.4; roadmap Phase 53): a
 * small positioned `div` that is a compositor layer of its own, holding an `<svg>` the size of the
 * robot's gem canvas, holding the robot group. The wrapper is the robot's body as far as the rest of
 * the app goes — `getRef('robot-<id>')` returns it, and the swim, the job's bob, the station arc, the
 * deck camera and the marker all read and write its x/y in scene units. Its `data-scene-slot` is the
 * robot's row (sceneStack.ts `slotForLayer`), which OceanScene.css turns into a z-index, so a robot
 * changing rows is this attribute changing, not a re-mount.
 *
 * IMPORTANT: The mover has NO React-managed `transform`. GSAP is the single source of truth for all
 * transforms (position, rotation) on it, and the `<g>` inside carries none. React re-renders must
 * never overwrite GSAP's transform. Robots have no discernible front (Roadmap Phase 40,
 * docs/specs/ORBITING_POLYGONS.md §1.6) and no longer mirror on direction change — only x/y and the
 * swim tilt's rotation are GSAP-owned.
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
  const ref = useRef<HTMLDivElement>(null);
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const selectRobot = useUIStore((s) => s.selectRobot);
  const activeHubTile = useUIStore((s) => s.activeHubTile);
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
  // The colour a member's halo wears (docs/specs/LAYOUT_REWORK.md §1.7). A string, so another company's or
  // robot's write re-renders nothing here; read only for a member, so the other eleven robots do no lookup.
  const companyColor = useLocaleStore((s) => (isCompanyMember
    ? s.locales[localeId]?.companies?.find((c) => c.id === selectedCompanyId)?.color
    : undefined));

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
  // From the Deck or the Probes tile it is a nav pick like any other (navActions): the robot's screen
  // opens and the nav list collapses to the panel's rest width (spec §1.2). On any other tile it only
  // moves the selection, which the halo shows.
  const handleClick = () => {
    if (activeHubTile === null || activeHubTile === 'robots') selectEntity({ robotId: robot.id });
    else selectRobot(robot.id);
  };

  // Selection is a halo only: the selected robot wears its own identityColor, a member of the selected
  // company the company's. The more specific selection wins when a robot is both. OceanScene.css reads
  // --halo for its drop-shadows and falls back to its old cyan where there is none.
  const halo = isSelected ? robot.identityColor : isCompanyMember ? companyColor : undefined;
  const style: CSSProperties = { cursor: 'pointer', ...(halo ? { ['--halo' as string]: halo } : null) };

  const className = ['robot', isSelected && 'selected', isCompanyMember && 'isCompanyMember']
    .filter(Boolean)
    .join(' ');

  // Phase 43 J4 (spec §1.10): the id is what a layer switch's dissolve copy (an SVG `<use>` in the
  // dissolve slot) points at. `.robot__row` carries the back row's scale (BACK_LAYER_SCALE), set
  // by the work loop about the gem canvas centre — the frame sceneToOrbiterLocal assumes — so it
  // never shares a transform with the swim's x/y/rotation, which are the mover's.
  //
  // The svg is the gem canvas, so the wrapper is exactly the canvas (OceanScene.css `.mover__svg` is a
  // block) and the swim's tilt turns about the canvas centre; `overflow="visible"` lets the halo, the
  // orbiters' flights and the job decorations draw outside it (spec §1.3). Only `.robot` takes clicks.
  const gem = getRobotGem(robot.gemSeed);
  return (
    <div
      ref={ref}
      className="mover mover--robot"
      data-robot-id={robotId}
      data-scene-slot={slotForLayer(robot.layer)}
    >
      <svg
        className="mover__svg"
        width={gemWidth(gem)}
        height={GEM_CANVAS_H}
        viewBox={gemViewBox(gem)}
        overflow="visible"
      >
        <g
          id={`world-robot-${robotId}`}
          className={className}
          onClick={handleClick}
          style={style}
        >
          <g className="robot__row">
            <RobotBody robot={robot} motion="world" />
          </g>
        </g>
      </svg>
    </div>
  );
});
