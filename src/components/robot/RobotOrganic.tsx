// ========================================
// IMPORTS
// ========================================
import React from 'react';

// ========================================
// TYPES
// ========================================
interface ShapeParams {
  torsoAspect: number;
}

interface MicroVariants {
  stripes?: boolean;
  smooth?: boolean;
  spikes?: boolean;
}

interface RobotSVGProps {
  colors: { primary: string; secondary: string; accent: string; highlight: string; shadow: string };
  scale: number;
  detailLevel: number; // 0-1, controls decoration complexity
  shapeParams?: ShapeParams;
  microVariants?: MicroVariants;
  greebleCount?: number;
  greebleSize?: number;
  greeblePersistence?: number;
  greeblePlacementBias?: number;
  /** Opacity multiplier (1 = full brightness) for the viewport/status light — dims as battery drains. */
  dimOpacity?: number;
}

// ========================================
// COMPONENT
// ========================================
/**
 * RobotOrganic - Rounded, biomechanical design for polyphonic synth voices
 * Industrial construction with curved organic hull
 */
export const RobotOrganic = React.memo(function RobotOrganic({ colors, scale, detailLevel, shapeParams, dimOpacity = 1 }: RobotSVGProps) {
  const torsoAspect = shapeParams?.torsoAspect ?? 1;

  return (
    <g transform={`translate(48,36) scale(${scale}) translate(-48,-36)`}>
      <g transform={`scale(${torsoAspect},1)`}>
      <svg viewBox="0 0 96 72" width={96} height={72}>
        {/* Base hull - organic curved shape */}
        <ellipse cx="48" cy="36" rx="36" ry="28" fill={colors.primary} />

        {/* Hull highlight - curved upper */}
        <ellipse cx="48" cy="28" rx="32" ry="16" fill={colors.highlight} opacity="0.5" />

        {/* Hull shadow - curved lower */}
        <ellipse cx="48" cy="44" rx="32" ry="16" fill={colors.shadow} opacity="0.2" />

        {/* Central viewport - circular — dims as battery drains */}
        <g opacity={dimOpacity}>
          <circle cx="32" cy="36" r="12" fill="#78cce2" opacity="0.8" />
          <circle cx="32" cy="32" r="8" fill="#b3e5f2" opacity="0.6" />
          <circle cx="34" cy="30" r="3" fill="#e0ffff" opacity="0.8" />
        </g>

        {/* Segmentation rivets */}
        <circle cx="20" cy="20" r="1.5" fill="#4f5458" />
        <circle cx="64" cy="20" r="1.5" fill="#4f5458" />
        <circle cx="20" cy="52" r="1.5" fill="#4f5458" />
        <circle cx="64" cy="52" r="1.5" fill="#4f5458" />

        {detailLevel > 0.5 && (
          <g className="details">
            {/* Panel seam lines */}
            <ellipse cx="48" cy="36" rx="28" ry="20" fill="none" stroke={colors.accent} strokeWidth="1" opacity="0.4" />
            <ellipse cx="48" cy="36" rx="20" ry="14" fill="none" stroke={colors.accent} strokeWidth="1" opacity="0.3" />

            {/* Bio-vent detail */}
            <ellipse cx="56" cy="36" rx="6" ry="8" fill="#6a6384" opacity="0.8" />
            <ellipse cx="56" cy="34" rx="4" ry="3" fill="#928ba9" opacity="0.5" />

            {/* Status light — dims as battery drains */}
            <g opacity={dimOpacity}>
              <circle cx="60" cy="24" r="3" fill="#39ff14" opacity="0.8" />
              <circle cx="60" cy="23" r="2" fill="#a2ff8a" opacity="0.9" />
            </g>
          </g>
        )}
      </svg>
      </g>
    </g>
  );
});
