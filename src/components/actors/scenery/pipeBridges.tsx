import React from 'react';

import colorTheme from '../../../constants/colorTheme.json';
import { hslToString } from '../../../utils/colorUtils';
import { pipeBridgeLayout } from './pipeBridgeLayout';
import type { Actor } from '../../../types/Actor';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 "Pipe bridges")
// ========================================

/** This family's one fixed colour — no lighting tick, no stored shift (§1.8, structural). */
const BAR_FILL = hslToString(colorTheme.shell.shadow);

interface PipeBridgesProps {
  /** One depth group's factory actors (not scenery) — `OceanScene` passes each depth's own list. */
  factories: Actor[];
}

/**
 * Derived pipe bridges (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9, roadmap Phase 42 Task 15): for
 * each pair of x-adjacent factories in the same recipe row whose facade gap is 60–260, a bar
 * spanning the gap (+10 each side) and a post down to the lower of the two bases. No actor is
 * created — this is a pure render-time derivation from the factories already placed; the
 * geometry, and its reading of the spec's bar height, is `pipeBridgeLayout` (pipeBridgeLayout.ts).
 */
export const PipeBridges: React.FC<PipeBridgesProps> = ({ factories }) => (
  <g data-scenery="pipe-bridges">
    {pipeBridgeLayout(factories).map(({ key, bar, post }) => (
      <g key={key} data-pipe-bridge="">
        <rect data-pipe-bridge-part="bar" x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={BAR_FILL} />
        <rect data-pipe-bridge-part="post" x={post.x} y={post.y} width={post.width} height={post.height} fill={BAR_FILL} />
      </g>
    ))}
  </g>
);
