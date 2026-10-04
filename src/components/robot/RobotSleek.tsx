// ========================================
// IMPORTS
// ========================================
import React from 'react';
import { identityGlass } from './robotVisualHelpers';

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
  /** Opacity multiplier (1 = full brightness) for the window — dims as battery drains. */
  dimOpacity?: number;
  /** Robot.identityColor hex — the window glass's only non-ADSR color (docs/ROBOT_DESIGN.md "Identity layer"). */
  identityColor?: string;
  /** Opacity multiplier for the lamp, driven by live audible-layer gain; battery-composed like dimOpacity. */
  lampOpacity?: number;
  /** Seeded hardware parts (RobotGreebles), placed between the hull shadow and the window — the
   *  shape never learns about kinds or slots, just where this node sits. */
  greebles?: React.ReactNode;
}

// ========================================
// COMPONENT
// ========================================
/**
 * RobotSleek - Smooth, streamlined design for melodic synth voices
 * Industrial submarine aesthetic with curved hull sections
 */
export const RobotSleek = React.memo(function RobotSleek({ colors, scale, detailLevel, shapeParams, dimOpacity = 1, identityColor = '#78cce2', lampOpacity = 1, greebles }: RobotSVGProps) {
  const torsoAspect = shapeParams?.torsoAspect ?? 1;
  const { glass, sheen } = identityGlass(identityColor);

  return (
    <g transform={`translate(48,36) scale(${scale}) translate(-48,-36)`}>
      <g transform={`scale(${torsoAspect},1)`}>
        <svg viewBox="0 0 96 72" width={96} height={72}>
          {/* Base hull - streamlined curved shape */}
          <path
            d="M 8,16 L 12,12 H 72 L 80,20 V 52 L 72,60 H 12 L 8,56 Z"
            fill={colors.primary}
          />

          {/* Hull highlight */}
          <path
            d="M 8,16 L 9,17 H 71 L 79,25 V 20 L 72,13 H 13 L 9,17 L 8,16 Z"
            fill={colors.highlight}
            opacity="0.6"
          />

          {/* Hull shadow */}
          <path
            d="M 8,56 L 9,55 H 71 L 79,47 V 52 L 72,59 H 13 L 9,55 L 8,56 Z"
            fill={colors.shadow}
            opacity="0.3"
          />

          {greebles}

          {/* Window — carries the identity colour; dims as battery drains */}
          <g className="window" opacity={dimOpacity}>
            <ellipse cx="24" cy="36" rx="8" ry="10" fill={glass} opacity="0.8" />
            <ellipse cx="24" cy="34" rx="6" ry="4" fill={sheen} opacity="0.6" />
          </g>

          {/* Corner rivets */}
          <circle cx="14" cy="14" r="1.5" fill="#4f5458" />
          <circle cx="70" cy="14" r="1.5" fill="#4f5458" />
          <circle cx="14" cy="58" r="1.5" fill="#4f5458" />
          <circle cx="70" cy="58" r="1.5" fill="#4f5458" />

          {/* Lamp — identity-coloured, always visible, lit by live audible-layer gain */}
          <g className="lamp" opacity={lampOpacity}>
            <circle cx="70" cy="36" r="3.5" fill={glass} />
            <circle cx="70" cy="35" r="2" fill={sheen} />
          </g>

          {detailLevel > 0.5 && (
            <g className="details">
              {/* Panel lines */}
              <path d="M 40,12 L 40,60" stroke={colors.accent} strokeWidth="1" opacity="0.4" />
              <path d="M 60,12 L 60,60" stroke={colors.accent} strokeWidth="1" opacity="0.4" />

              {/* Vent detail */}
              <rect x="48" y="28" width="12" height="16" fill="#6a6384" opacity="0.8" />
              <path d="M 48,28 L 49,29 H 59 L 60,28 Z" fill="#928ba9" opacity="0.6" />
              <path d="M 48,44 L 49,43 H 59 L 60,44 Z" fill="#3b374d" opacity="0.6" />
              {/* Vent slats */}
              <path d="M 50,32 H 58" stroke="#928ba9" strokeWidth="1" opacity="0.5" />
              <path d="M 50,36 H 58" stroke="#928ba9" strokeWidth="1" opacity="0.5" />
              <path d="M 50,40 H 58" stroke="#928ba9" strokeWidth="1" opacity="0.5" />
            </g>
          )}
        </svg>
      </g>
    </g>
  );
});
