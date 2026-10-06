// ========================================
// IMPORTS
// ========================================
import { memo, useState, type Ref } from 'react';

import { gemWidth, GEM_CANVAS_H, type GemPart, type GemPoint, type RobotGem as RobotGemGeometry } from './polygon';
import type { GemPalette, GemPartPaint } from './gemPalette';
import { facetPaths, linesPath } from './gemPaths';
import type { HaloStop } from './haloDials';

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

/** The Top/Mid line-width dials and the fixed strip opacity RobotBody computes
 *  (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.2/§1.4): each body line's `.gem__lines` width is its
 *  own dial; its `.gem__strip` is ⅓ as wide at `stripOpacity`. */
export interface RobotGemBodyLines {
  top: number;
  midLeft: number;
  midRight: number;
  stripOpacity: number;
}

/** The halo RobotBody computes (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.1/§1.4): one ellipse
 *  behind the Mids filled by a six-stop radial gradient — the envelope laid along the radius in the
 *  company colour. `gradientId` is per rendered instance (`halo-${context}-${robotId}`): the world
 *  and the avatar show one robot at once and a shared id would paint the wrong gradient.
 *  Amendment (2026-10-06, Crawford): the halo only ever appears while a robot's orbiters are
 *  spawning or despawning, so `RobotGem` renders it (`<defs>` + `ellipse.gem__halo`) only when
 *  `orbiters.motion` is true — cards never spawn/despawn, so cards never render a halo at all. In
 *  the motion contexts (world/avatar) React still writes every attribute at mount; the hook that
 *  owns them afterwards (Task 8) keeps opacity at 0 outside an arc. */
export interface RobotGemHalo {
  color: string;
  rx: number;
  ry: number;
  stops: HaloStop[];
  /** Battery dim (daylight is deliberately absent). */
  opacity: number;
  gradientId: string;
}

/** `data-line` on a `.gem__strip` — which flicker trigger tuple it answers to (useStripFlicker). */
type StripLine = 'top' | 'midLeft' | 'midRight' | 'orbiters';

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
  /** Top/Mid line widths and strip opacity (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.4). */
  bodyLines: RobotGemBodyLines;
  /** The gradient halo behind the Mids (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.4). */
  halo: RobotGemHalo;
  /** The ripple ellipse (animated contexts only, Task 11's `decorateArc`) — world/avatar pass this;
   *  cards never do, and `orbiters.motion` already gates the whole halo subtree out for them. */
  ripple?: RobotGemRipple;
  /** Forwarded to the root `g.gem` — the `useOrbiterMotion` hook's GSAP scope (Task 8). */
  ref?: Ref<SVGGElement>;
}

/** The ripple's gradient id only — Task 11's `decorateArc` owns every stop/opacity after mount
 *  (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.4). */
export interface RobotGemRipple {
  gradientId: string;
}

// ========================================
// HELPERS
// ========================================
const FACET_STROKE_WIDTH = 0.25;
const BACKING_STROKE_WIDTH = 0.5;
const LIGHT_HALO_R = 3;
const LIGHT_HALO_OPACITY = 0.18;
const LIGHT_CORE_R = 1.4;

const r2 = (n: number) => Number(n.toFixed(2));
/** Gradient stop offset as SVG wants it: a percentage, 2 dp (the sketch's `stop()` formatting). */
const pct = (offset: number) => `${(offset * 100).toFixed(2)}%`;
const points = (pts: readonly GemPoint[]) => pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
const ORBITER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

function BevelledPart({ part, paint, className, lightOpacity, lightColor, lineWidth, strip }: {
  part: GemPart;
  paint: GemPartPaint;
  className: string;
  lightOpacity?: number;
  lightColor?: string;
  lineWidth: number;
  /** The lit centre stroke in `palette.light`, ⅓ of the line's width. `line` names the flicker
   *  trigger it answers to; `data-base` carries the dial opacity so a flicker timeline can restore it. */
  strip?: { opacity: number; color: string; line: StripLine };
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
          data-line={strip.line}
          data-base={strip.opacity}
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
          strip={{ opacity: orbiters.stripOpacity, color: palette.light, line: 'orbiters' }}
        />
      </g>
    </g>
  );
}

const ALL_CORNERS = [0, 1, 2, 3] as const;

/** Five evenly-spaced placeholder offsets for the ripple gradient's initial stops — all at opacity
 *  0 (never shown) until `decorateArc` (Task 11) starts writing real ones each frame of an arc. */
const RIPPLE_INITIAL_OFFSETS = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * The halo subtree (`<defs>` + `ellipse.gem__halo`, plus the ripple in motion contexts) —
 * `RobotGem` only ever mounts this when `orbiters.motion` is true (cards never spawn/despawn, so
 * cards never render a halo at all, Phase 41 amendment). Two owners, never both (spec Assumption
 * 3): React writes every attribute once at mount, then freezes its own copy of `halo`/`ripple` in a
 * lazy `useState` initializer and keeps rendering *that* on every later re-render, so a
 * volume/envelope edit that bumps the `halo` prop never fights `useHaloMotion`'s GSAP tween for
 * the same attributes. (A ref would do the same freezing, but reading `ref.current` during render
 * is a lint error — `react-hooks/refs` — so the frozen copy lives in state instead, set once via
 * `useState`'s initializer function, which React never calls again after mount.)
 */
function HaloLayer({ cx, cy, halo, ripple }: { cx: number; cy: number; halo: RobotGemHalo; ripple?: RobotGemRipple }) {
  const [frozen] = useState<{ halo: RobotGemHalo; ripple?: RobotGemRipple }>(() => ({ halo, ripple }));

  return (
    <>
      <defs>
        <radialGradient id={frozen.halo.gradientId}>
          {frozen.halo.stops.map((stop, i) => (
            <stop key={i} offset={pct(stop.offset)} stopColor={frozen.halo.color} stopOpacity={stop.opacity} />
          ))}
        </radialGradient>
        {frozen.ripple && (
          <radialGradient id={frozen.ripple.gradientId}>
            {RIPPLE_INITIAL_OFFSETS.map((offset, i) => (
              <stop key={i} offset={pct(offset)} stopColor={frozen.halo.color} stopOpacity={0} />
            ))}
          </radialGradient>
        )}
      </defs>
      <ellipse className="gem__halo" cx={cx} cy={cy} rx={frozen.halo.rx} ry={frozen.halo.ry} fill={`url(#${frozen.halo.gradientId})`} opacity={frozen.halo.opacity} />
      {frozen.ripple && (
        <ellipse className="gem__ripple" cx={cx} cy={cy} rx={frozen.halo.rx} ry={frozen.halo.ry} fill={`url(#${frozen.ripple.gradientId})`} opacity={0} />
      )}
    </>
  );
}

// ========================================
// COMPONENT
// ========================================
/**
 * RobotGem — draw-only memo for a gem polygon robot (Roadmap Phase 39/40/41). Z order is DOM order:
 * backing, halo (its <defs> gradient then the ellipse), mid--left, mid--right, docked orbiters, top
 * — the halo reads as light from behind the body, orbiters sit nestled between Mid and Top (Phase 40
 * amendment). Geometry from getRobotGem, colours from gemPalette, orbiter dials/layout, the Top/Mid
 * line dials and the halo (Phase 41) from RobotBody; nothing here derives any of them. No SVG
 * filter anywhere: the gradient stops alone carry the halo's softness (spec Assumption 5).
 */
export const RobotGem = memo(function RobotGem({ gem, palette, lightOpacity, scale, orbiters, bodyLines, halo, ripple, ref }: RobotGemProps) {
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
      {orbiters.motion && <HaloLayer cx={cx} cy={cy} halo={halo} ripple={ripple} />}
      <BevelledPart
        part={gem.midLeft}
        paint={palette.midLeft}
        className="gem__mid gem__mid--left"
        lineWidth={bodyLines.midLeft}
        strip={{ opacity: bodyLines.stripOpacity, color: palette.light, line: 'midLeft' }}
      />
      <BevelledPart
        part={gem.midRight}
        paint={palette.midRight}
        className="gem__mid gem__mid--right"
        lineWidth={bodyLines.midRight}
        strip={{ opacity: bodyLines.stripOpacity, color: palette.light, line: 'midRight' }}
      />
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
        lineWidth={bodyLines.top}
        strip={{ opacity: bodyLines.stripOpacity, color: palette.light, line: 'top' }}
      />
    </g>
  );
});
