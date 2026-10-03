// ========================================
// IMPORTS
// ========================================
import React from 'react';

// ========================================
// TYPES
// ========================================
interface ShapeParams {
  torsoAspect: number;
  appendageLength: number;
  scaleBias: number;
}

interface MicroVariants {
  stripes?: boolean;
  smooth?: boolean;
  spikes?: boolean;
}

interface RobotSVGProps {
  colors: { primary: string; secondary: string; accent: string };
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
 * RobotIndustrial - Boxy, mechanical design for industrial synth voices
 * Heavy industrial construction with layered armor plates
 */
export const RobotIndustrial = React.memo(function RobotIndustrial({ colors, scale, detailLevel, shapeParams, dimOpacity = 1 }: RobotSVGProps) {
  const torsoAspect = shapeParams?.torsoAspect ?? 1;
  const scaleBias = shapeParams?.scaleBias ?? 0;
  const overall = scale * (1 + scaleBias);

  return (
    <g transform={`scale(${overall})`}>
      <g transform={`scale(${torsoAspect},1)`}>
      <svg viewBox="0 0 96 72" width={96} height={72}>
        {/* Base hull - layered rectangular sections */}
        <path d="M 8,8 L 12,12 H 68 L 72,8 H 88 L 92,12 V 60 L 88,64 H 72 L 68,60 H 12 L 8,64 Z" fill={colors.primary} />

        {/* Top armor plate */}
        <path d="M 12,12 H 68 V 28 H 12 Z" fill={colors.primary} />
        <path d="M 12,12 H 68 L 67,13 H 13 Z" fill="#a9adb0" opacity="0.6" />
        <path d="M 12,28 H 68 L 67,27 H 13 Z" fill="#000000" opacity="0.3" />

        {/* Bottom armor plate */}
        <path d="M 12,44 H 68 V 60 H 12 Z" fill={colors.primary} />
        <path d="M 12,44 H 68 L 67,45 H 13 Z" fill="#a9adb0" opacity="0.6" />
        <path d="M 12,60 H 68 L 67,59 H 13 Z" fill="#000000" opacity="0.3" />

        {/* Right section */}
        <rect x="72" y="20" width="16" height="32" fill={colors.primary} />
        <path d="M 72,20 H 88 L 87,21 H 73 Z" fill="#a9adb0" opacity="0.6" />
        <path d="M 72,52 H 88 L 87,51 H 73 Z" fill="#000000" opacity="0.3" />

        {/* Central viewport — dims as battery drains */}
        <g opacity={dimOpacity}>
          <rect x="20" y="20" width="16" height="12" fill="#78cce2" opacity="0.8" />
          <path d="M 20,20 L 21,21 H 35 L 36,20 Z" fill="#b3e5f2" opacity="0.6" />
        </g>

        {/* Corner rivets - top section */}
        <circle cx="14" cy="14" r="1.5" fill="#4f5458" />
        <circle cx="66" cy="14" r="1.5" fill="#4f5458" />
        <circle cx="14" cy="26" r="1.5" fill="#4f5458" />
        <circle cx="66" cy="26" r="1.5" fill="#4f5458" />

        {/* Corner rivets - bottom section */}
        <circle cx="14" cy="46" r="1.5" fill="#4f5458" />
        <circle cx="66" cy="46" r="1.5" fill="#4f5458" />
        <circle cx="14" cy="58" r="1.5" fill="#4f5458" />
        <circle cx="66" cy="58" r="1.5" fill="#4f5458" />

        {detailLevel > 0.5 && (
          <g className="details">
            {/* Vent panel */}
            <rect x="44" y="18" width="12" height="16" fill="#6a6384" opacity="0.8" />
            <path d="M 44,18 L 45,19 H 55 L 56,18 Z" fill="#928ba9" opacity="0.6" />
            <path d="M 44,34 L 45,33 H 55 L 56,34 Z" fill="#3b374d" opacity="0.6" />
            {/* Vent slats */}
            <path d="M 46,22 H 54" stroke="#928ba9" strokeWidth="1" opacity="0.5" />
            <path d="M 46,26 H 54" stroke="#928ba9" strokeWidth="1" opacity="0.5" />
            <path d="M 46,30 H 54" stroke="#928ba9" strokeWidth="1" opacity="0.5" />

            {/* Status indicator — housing stays fixed; only the light glow dims as battery drains */}
            <rect x="76" y="28" width="8" height="16" fill="#818589" />
            <g opacity={dimOpacity}>
              <rect x="78" y="32" width="4" height="8" fill="#39ff14" opacity="0.8" />
              <rect x="78" y="32" width="4" height="4" fill="#a2ff8a" opacity="0.7" />
            </g>

            {/* Warning stripes */}
            <rect x="20" y="48" width="8" height="4" fill={colors.accent} opacity="0.6" />
            <rect x="52" y="48" width="8" height="4" fill={colors.accent} opacity="0.6" />
          </g>
        )}
      </svg>
      </g>
    </g>
  );
});
