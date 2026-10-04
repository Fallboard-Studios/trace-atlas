// ========================================
// IMPORTS
// ========================================
import { memo } from 'react';
import type { Pos } from './greebleSlots';

// ========================================
// TYPES
// ========================================
interface RobotLayerSocketsProps {
  positions: readonly [Pos, Pos];
  opacities: readonly [number, number];
  glass: string;
  sheen: string;
  housing: string;
}

// ========================================
// COMPONENT
// ========================================
/**
 * RobotLayerSockets — draw-only memo for the two always-present identity sockets (Coaxial,
 * Harmonic). Each socket is a housing ring (always visible, outside the opacity group) plus a
 * glass/sheen pair whose opacity carries the layer's live gain (Roadmap Phase 38).
 */
export const RobotLayerSockets = memo(function RobotLayerSockets({ positions, opacities, glass, sheen, housing }: RobotLayerSocketsProps) {
  return (
    <g className="sockets">
      {positions.map((p, i) => (
        <g key={i} className={`socket socket--${i === 0 ? 'coaxial' : 'harmonic'}`} transform={`translate(${p.x},${p.y})`}>
          <circle r={3} fill="none" stroke={housing} strokeWidth={1} />
          <g opacity={opacities[i]}>
            <circle r={2.2} fill={glass} />
            <circle cy={-0.6} r={1.1} fill={sheen} />
          </g>
        </g>
      ))}
    </g>
  );
});
