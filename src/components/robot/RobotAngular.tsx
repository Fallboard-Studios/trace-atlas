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
  /** Opacity multiplier (1 = full brightness) for the viewport — dims as battery drains. */
  dimOpacity?: number;
  /** Robot.identityColor hex — the window glass's only non-ADSR color (docs/ROBOT_DESIGN.md "Non-audio layers"). */
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
 * RobotAngular - Sharp, geometric design for angular synth voices
 * Industrial hexagonal hull with aggressive angles
 */
export const RobotAngular = React.memo(function RobotAngular({ colors, scale, detailLevel, shapeParams, dimOpacity = 1, identityColor = '#78cce2', lampOpacity = 1, greebles }: RobotSVGProps) {
  const torsoAspect = shapeParams?.torsoAspect ?? 1;
  const { glass, sheen } = identityGlass(identityColor);

  return (
    <g transform={`translate(48,36) scale(${scale}) translate(-48,-36)`}>
      <g transform={`scale(${torsoAspect},1)`}>
        <svg viewBox="0 0 96 72" width={96} height={72}>
          {/* Base hull - hexagonal segmented */}
          <polygon
            points="16,36 24,12 72,12 80,36 72,60 24,60"
            fill={colors.primary}
          />

          {/* Hull highlights */}
          <polygon
            points="16,36 24,13 72,13 79,36 78,36 71,14 25,14 17,36"
            fill={colors.highlight}
            opacity="0.6"
          />

          {/* Hull shadows */}
          <polygon
            points="16,36 24,59 72,59 79,36 78,36 71,58 25,58 17,36"
            fill={colors.shadow}
            opacity="0.3"
          />

          {greebles}

          {/* Viewport - diamond shape — carries the identity colour; dims as battery drains */}
          <g className="window" opacity={dimOpacity}>
            <polygon points="36,36 44,28 52,36 44,44" fill={glass} opacity="0.8" />
            <polygon points="36,36 44,29 52,36 44,32" fill={sheen} opacity="0.6" />
          </g>

          {/* Corner rivets */}
          <circle cx="26" cy="16" r="1.5" fill="#4f5458" />
          <circle cx="70" cy="16" r="1.5" fill="#4f5458" />
          <circle cx="26" cy="56" r="1.5" fill="#4f5458" />
          <circle cx="70" cy="56" r="1.5" fill="#4f5458" />

          {/* Lamp — identity-coloured, always visible, lit by live audible-layer gain */}
          <g className="lamp" opacity={lampOpacity}>
            <circle cx="73" cy="36" r="3" fill={glass} />
            <circle cx="73" cy="35" r="1.8" fill={sheen} />
          </g>

          {detailLevel > 0.5 && (
            <g className="details">
              {/* Panel divider lines */}
              <line x1="48" y1="12" x2="48" y2="60" stroke={colors.accent} strokeWidth="1" opacity="0.4" />
              <line x1="24" y1="36" x2="72" y2="36" stroke={colors.accent} strokeWidth="1" opacity="0.4" />

              {/* Warning stripes */}
              <polygon points="56,20 64,20 62,24 58,24" fill={colors.accent} opacity="0.7" />
              <polygon points="56,48 64,48 62,52 58,52" fill={colors.accent} opacity="0.7" />

              {/* Vent panels */}
              <rect x="60" y="28" width="8" height="16" fill="#6a6384" opacity="0.8" />
              <path d="M 60,28 L 61,29 H 67 L 68,28 Z" fill="#928ba9" opacity="0.6" />
            </g>
          )}
        </svg>
      </g>
    </g>
  );
});
