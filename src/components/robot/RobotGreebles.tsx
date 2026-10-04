// ========================================
// IMPORTS
// ========================================
import { memo } from 'react';
import type { Greeble } from '../../types/Robot';
import type { GreebleSlot } from './greebleSlots';

// ========================================
// TYPES
// ========================================
/** Colour-only from accent/shadow + the hardware greys (docs/specs/ROBOT_GREEBLES.md §1.3) —
 *  deliberately narrower than RobotColors: no primary/secondary/highlight, and no identityColor. */
interface GreebleColors {
  accent: string;
  shadow: string;
}

interface RobotGreeblesProps {
  greebles: Greeble[];
  slots: readonly GreebleSlot[];
  colors: GreebleColors;
}

// ========================================
// CONSTANTS
// ========================================
export const KIND_COUNT = 5;
export const KIND_NAMES = ['panel', 'tank', 'dish', 'antenna', 'decal'] as const;
const HARDWARE_GREY = '#6a6384';
/** A slot can be wider/taller than any part should actually draw at (see the 12x6 and 14x5 slots
 *  in greebleSlots.ts) — parts cap at this size regardless of the slot box they sit in. */
const MAX_PART_SIZE = 8;

// ========================================
// VOCABULARY — each kind draws ≤ 2 elements, relative to its own slot's (0,0) origin.
// ========================================
function drawPanel(w: number, h: number, colors: GreebleColors) {
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={colors.accent} opacity={0.9} />
      <line x1={-w / 2 + 1} y1={0} x2={w / 2 - 1} y2={0} stroke={colors.shadow} strokeWidth={0.8} />
    </>
  );
}

function drawTank(w: number, h: number, colors: GreebleColors) {
  const r = Math.min(w, h) / 4;
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={r} fill={colors.accent} />
      <rect x={-w / 2 + 1} y={-h / 2 + 1} width={w - 2} height={h / 3} rx={r} fill={HARDWARE_GREY} opacity={0.6} />
    </>
  );
}

function drawDish(w: number, h: number, colors: GreebleColors) {
  const r = Math.min(w, h) / 2;
  return (
    <>
      <circle cx={0} cy={0} r={r} fill={colors.accent} />
      <path d={`M ${-r * 0.7},${-r * 0.7} A ${r},${r} 0 0 1 ${r * 0.7},${-r * 0.7}`} fill="none" stroke={colors.shadow} strokeWidth={0.8} />
    </>
  );
}

function drawAntenna(_w: number, h: number, colors: GreebleColors) {
  return (
    <>
      <line x1={0} y1={h / 2} x2={0} y2={-h / 2} stroke={colors.accent} strokeWidth={1.2} />
      <circle cx={0} cy={-h / 2} r={1.3} fill={colors.shadow} />
    </>
  );
}

function drawDecal(w: number, h: number, colors: GreebleColors) {
  return <polygon points={`${-w / 2},${h / 2} 0,${-h / 2} ${w / 2},${h / 2}`} fill={colors.accent} />;
}

const DRAW_KIND = [drawPanel, drawTank, drawDish, drawAntenna, drawDecal] as const;

// ========================================
// COMPONENT
// ========================================
/**
 * RobotGreebles — stateless vocabulary renderer for a robot's seeded, permanent hardware set
 * (Roadmap Phase 37). Shapes place this as an opaque node; it is the only thing that knows about
 * kinds or slots. No per-part state, no keys beyond index — the array never reorders.
 */
export const RobotGreebles = memo(function RobotGreebles({ greebles = [], slots, colors }: RobotGreeblesProps) {
  return (
    <g className="greebles">
      {greebles.map((g, i) => {
        const slot = slots[g.slot];
        if (!slot) return null;
        const kindName = KIND_NAMES[g.kind];
        const draw = DRAW_KIND[g.kind];
        if (!kindName || !draw) return null;
        const w = Math.min(slot.w, MAX_PART_SIZE);
        const h = Math.min(slot.h, MAX_PART_SIZE);
        return (
          <g key={i} className={`greeble greeble--${kindName}`} transform={`translate(${slot.x},${slot.y})`}>
            {draw(w, h, colors)}
          </g>
        );
      })}
    </g>
  );
});
