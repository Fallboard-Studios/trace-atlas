// ========================================
// IMPORTS
// ========================================
import { memo, type Ref } from 'react';

import { gemWidth, GEM_CANVAS_H, type GemPart, type GemPoint, type RobotGem as RobotGemGeometry } from './polygon';
import type { GemPalette, GemPartPaint } from './gemPalette';
import { facetPaths, linesPath } from './gemPaths';

// ========================================
// TYPES
// ========================================
/** The orbiter dials and seeded layout RobotBody computes (docs/specs/ORBITING_POLYGONS.md §1.3).
 *  `motion: false` (cards) renders the first `count` corners of `cornerOrder`, statically, at
 *  `scale(size)`. `motion: true` (world/avatar) renders all four corners, one copy each, ignoring
 *  `count` and `size` — `useOrbiterMotion` owns which copy is shown (attached) and its transform
 *  (Phase 40 amendment: no more depth copies — orbiters dock on the hull, they no longer pass in front of or
 *  behind it). */
export interface RobotGemOrbiters {
  lineWidth: number;
  stripOpacity: number;
  size: number;
  count: 1 | 2 | 3 | 4;
  cornerOrder: readonly number[];
  motion: boolean;
}

interface RobotGemProps {
  /** getRobotGem(robot.gemSeed) — runtime-only geometry. */
  gem: RobotGemGeometry;
  /** Every colour, resolved (gemPalette) — this component computes none. */
  palette: GemPalette;
  /** Light opacity: lamp intensity × battery dim. */
  lightOpacity: number;
  /** Body scale from octave range/envelope, about the canvas centre. */
  scale: number;
  /** Orbiter dials and layout (docs/specs/ORBITING_POLYGONS.md §1.1–§1.3). */
  orbiters: RobotGemOrbiters;
  /** Forwarded to the root `g.gem` — the `useOrbiterMotion` hook's GSAP scope (Task 8). */
  ref?: Ref<SVGGElement>;
}

// ========================================
// HELPERS
// ========================================
const FACET_STROKE_WIDTH = 0.25;
/** Mids' and Top's fixed boundary-line width — orbiters use the Note Variance dial instead. */
const BODY_LINE_WIDTH = 0.8;
const BACKING_STROKE_WIDTH = 0.5;
const LIGHT_HALO_R = 3;
const LIGHT_HALO_OPACITY = 0.18;
const LIGHT_CORE_R = 1.4;

const r2 = (n: number) => Number(n.toFixed(2));
const points = (pts: readonly GemPoint[]) => pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
const ORBITER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

function BevelledPart({ part, paint, className, lightOpacity, lightColor, lineWidth, strip }: {
  part: GemPart;
  paint: GemPartPaint;
  className: string;
  lightOpacity?: number;
  lightColor?: string;
  lineWidth: number;
  /** The orbiter-only centre stroke in `palette.light` (never on Mids/Top). */
  strip?: { opacity: number; color: string };
}) {
  const { pts, inner } = part;
  const lines = linesPath(part.lines);
  // Merged paths, not one element per facet/line: the moving robot layer re-rasterizes every
  // child each frame, so its cost tracks element count (docs/PERFORMANCE.md, Phase 39 Task 9).
  return (
    <g className={`gem__part ${className}`.trim()} transform={`translate(${r2(part.x)} ${r2(part.y)})`}>
      {facetPaths(pts, inner, paint.facets).map(({ fill, d }) => (
        <path
          key={fill}
          className="gem__facets"
          d={d}
          fill={fill}
          stroke={paint.stroke}
          strokeWidth={FACET_STROKE_WIDTH}
          strokeLinejoin="round"
        />
      ))}
      <polygon className="gem__face" points={points(inner)} fill={paint.face} />
      {lines && (
        <path
          className="gem__lines"
          d={lines}
          fill="none"
          stroke={paint.line}
          strokeWidth={lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {lines && strip && (
        <path
          className="gem__strip"
          d={lines}
          fill="none"
          stroke={strip.color}
          strokeWidth={r2(lineWidth / 3)}
          opacity={strip.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {part.lights.map(([x, y], i) => (
        <g key={i} className="gem__light" opacity={lightOpacity}>
          <circle cx={r2(x)} cy={r2(y)} r={LIGHT_HALO_R} fill={lightColor} opacity={LIGHT_HALO_OPACITY} />
          <circle cx={r2(x)} cy={r2(y)} r={LIGHT_CORE_R} fill={lightColor} />
        </g>
      ))}
    </g>
  );
}

/**
 * One orbiter copy. Static (`motion: false`, cards): at `scale(size)` about its own centre,
 * React-owned. Animated (`motion: true`): no transform/style on either outer group —
 * `useOrbiterMotion`'s GSAP `gsap.set` is the only writer of position, scale, opacity and display
 * (the attach/detach flight).
 */
function OrbiterCopy({ gem, palette, orbiters, corner, motion }: {
  gem: RobotGemGeometry;
  palette: GemPalette;
  orbiters: RobotGemOrbiters;
  corner: number;
  motion: boolean;
}) {
  const part = gem.orbiters[corner];
  const cx = r2(part.x + part.w / 2);
  const cy = r2(part.y + part.h / 2);
  const localProps = motion ? {} : { transform: `scale(${r2(orbiters.size)})`, style: { transformOrigin: `${cx}px ${cy}px` } };
  return (
    <g className={`gem__orbiter gem__orbiter--${ORBITER_CORNERS[corner]}`}>
      <g className="gem__orbiter-local" {...localProps}>
        <BevelledPart
          part={part}
          paint={palette.orbiters[corner]}
          className=""
          lineWidth={orbiters.lineWidth}
          strip={{ opacity: orbiters.stripOpacity, color: palette.light }}
        />
      </g>
    </g>
  );
}

const ALL_CORNERS = [0, 1, 2, 3] as const;

// ========================================
// COMPONENT
// ========================================
/**
 * RobotGem — draw-only memo for a gem polygon robot (Roadmap Phase 39/40). Z order is DOM order:
 * backing, mid--left, mid--right, docked orbiters, top — orbiters sit nestled between Mid and Top
 * (Phase 40 amendment). Geometry from getRobotGem, colours from gemPalette, orbiter dials/layout from
 * RobotBody; nothing here derives any of them.
 */
export const RobotGem = memo(function RobotGem({ gem, palette, lightOpacity, scale, orbiters, ref }: RobotGemProps) {
  const cx = gemWidth(gem) / 2;
  const cy = GEM_CANVAS_H / 2;
  const { backing } = gem;
  const shownCorners = orbiters.cornerOrder.slice(0, orbiters.count);

  return (
    <g ref={ref} className="gem" transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}>
      <g className="gem__part gem__backing" transform={`translate(${r2(backing.x)} ${r2(backing.y)})`}>
        <polygon
          className="gem__face"
          points={points(backing.pts)}
          fill={palette.backing.face}
          stroke={palette.backing.stroke}
          strokeWidth={BACKING_STROKE_WIDTH}
        />
      </g>
      <BevelledPart part={gem.midLeft} paint={palette.midLeft} className="gem__mid gem__mid--left" lineWidth={BODY_LINE_WIDTH} />
      <BevelledPart part={gem.midRight} paint={palette.midRight} className="gem__mid gem__mid--right" lineWidth={BODY_LINE_WIDTH} />
      {orbiters.motion
        ? ALL_CORNERS.map((corner) => (
            <OrbiterCopy key={ORBITER_CORNERS[corner]} gem={gem} palette={palette} orbiters={orbiters} corner={corner} motion />
          ))
        : shownCorners.map((corner) => (
            <OrbiterCopy key={ORBITER_CORNERS[corner]} gem={gem} palette={palette} orbiters={orbiters} corner={corner} motion={false} />
          ))}
      <BevelledPart
        part={gem.top}
        paint={palette.top}
        className="gem__top"
        lightOpacity={lightOpacity}
        lightColor={palette.light}
        lineWidth={BODY_LINE_WIDTH}
      />
    </g>
  );
});
