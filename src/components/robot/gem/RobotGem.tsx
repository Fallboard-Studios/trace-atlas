// ========================================
// IMPORTS
// ========================================
import { memo } from 'react';

import { gemWidth, GEM_CANVAS_H, type GemPart, type GemPoint, type RobotGem as RobotGemGeometry } from './polygon';
import type { GemPalette, GemPartPaint } from './gemPalette';

// ========================================
// TYPES
// ========================================
interface RobotGemProps {
  /** getRobotGem(robot.gemSeed) — runtime-only geometry. */
  gem: RobotGemGeometry;
  /** Every colour, resolved (gemPalette) — this component computes none. */
  palette: GemPalette;
  /** Light opacity: lamp intensity × battery dim. */
  lightOpacity: number;
  /** Body scale from octave range/envelope, about the canvas centre. */
  scale: number;
}

// ========================================
// HELPERS
// ========================================
const FACET_STROKE_WIDTH = 0.25;
const LINE_WIDTH = 0.8;
const BACKING_STROKE_WIDTH = 0.5;
const LIGHT_HALO_R = 3;
const LIGHT_HALO_OPACITY = 0.18;
const LIGHT_CORE_R = 1.4;

const r2 = (n: number) => Number(n.toFixed(2));
const points = (pts: readonly GemPoint[]) => pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
const ORBITER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

function BevelledPart({ part, paint, className, lightOpacity, lightColor }: {
  part: GemPart;
  paint: GemPartPaint;
  className: string;
  lightOpacity?: number;
  lightColor?: string;
}) {
  const { pts, inner } = part;
  return (
    <g className={`gem__part ${className}`} transform={`translate(${r2(part.x)} ${r2(part.y)})`}>
      {pts.map((p, i) => {
        const j = (i + 1) % pts.length;
        return (
          <polygon
            key={i}
            className="gem__facet"
            points={points([p, pts[j], inner[j], inner[i]])}
            fill={paint.facets[i]}
            stroke={paint.stroke}
            strokeWidth={FACET_STROKE_WIDTH}
            strokeLinejoin="round"
          />
        );
      })}
      <polygon className="gem__face" points={points(inner)} fill={paint.face} />
      {part.lines.map((line, i) => (
        <polyline
          key={i}
          className="gem__line"
          points={points(line)}
          fill="none"
          stroke={paint.line}
          strokeWidth={LINE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {part.lights.map(([x, y], i) => (
        <g key={i} className="gem__light" opacity={lightOpacity}>
          <circle cx={r2(x)} cy={r2(y)} r={LIGHT_HALO_R} fill={lightColor} opacity={LIGHT_HALO_OPACITY} />
          <circle cx={r2(x)} cy={r2(y)} r={LIGHT_CORE_R} fill={lightColor} />
        </g>
      ))}
    </g>
  );
}

// ========================================
// COMPONENT
// ========================================
/**
 * RobotGem — draw-only memo for a gem polygon robot (Roadmap Phase 39). Z order is DOM order:
 * backing, four orbiters, mid--left, mid--right, top. Geometry from getRobotGem, colours from
 * gemPalette; nothing here derives either. The root <g> GSAP animates lives in Robot.tsx, outside.
 */
export const RobotGem = memo(function RobotGem({ gem, palette, lightOpacity, scale }: RobotGemProps) {
  const cx = gemWidth(gem) / 2;
  const cy = GEM_CANVAS_H / 2;
  const { backing } = gem;

  return (
    <g className="gem" transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}>
      <g className="gem__part gem__backing" transform={`translate(${r2(backing.x)} ${r2(backing.y)})`}>
        <polygon
          className="gem__face"
          points={points(backing.pts)}
          fill={palette.backing.face}
          stroke={palette.backing.stroke}
          strokeWidth={BACKING_STROKE_WIDTH}
        />
      </g>
      {gem.orbiters.map((part, i) => (
        <BevelledPart
          key={ORBITER_CORNERS[i]}
          part={part}
          paint={palette.orbiters[i]}
          className={`gem__orbiter gem__orbiter--${ORBITER_CORNERS[i]}`}
        />
      ))}
      <BevelledPart part={gem.midLeft} paint={palette.midLeft} className="gem__mid gem__mid--left" />
      <BevelledPart part={gem.midRight} paint={palette.midRight} className="gem__mid gem__mid--right" />
      <BevelledPart part={gem.top} paint={palette.top} className="gem__top" lightOpacity={lightOpacity} lightColor={palette.light} />
    </g>
  );
});
