import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 containers row)
// ========================================

const BOX_SAT = 35;
const BOX_L = 30;
const LABEL_SIZE = 7;

/**
 * Containers (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a pyramid of box rows — each row above
 * the bottom one fewer box than the row below, row-staggered by a seeded 0-10 offset — alternating
 * the style's accent pair per box, each with a seeded-lit label square. Box hue comes from the
 * accent pair, not `body.base` (§1.9), but the placement-time shift (`actor.config.hueShift`/
 * `.satShift`, folded like every other body-bearing family — §1.8, roadmap Phase 42 Task 14) is
 * still applied on top via `applyColorShift`'s `shift` argument, so a retransmit still moves
 * containers along with the rest of the skyline.
 */
export const containers: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth, accent }) => {
  const { x, y } = actor.position;
  const p = params.containers;
  if (!p) return <g data-scenery="containers" />;
  const { cols, rows, boxW, boxH, rowOffsets, labelLitRoll } = p;

  const bodyShift = { hueShift: actor.config?.hueShift ?? 0, satShift: actor.config?.satShift ?? 0 };
  const ambient = ((eastL + westL) / 2) * cap;

  let globalIndex = 0;

  return (
    <g data-scenery="containers">
      {Array.from({ length: rows }, (_, row) => {
        const boxCount = Math.max(1, cols - row);
        const rowWidth = boxCount * boxW;
        const rowOffset = rowOffsets[row] ?? 0;
        const rowStartX = x - rowWidth / 2 + rowOffset;
        const rowBottomY = y - row * boxH;
        const rowTopY = rowBottomY - boxH;

        return (
          <g key={row} data-container-row={row}>
            {Array.from({ length: boxCount }, (_, col) => {
              const index = globalIndex++;
              const hue = col % 2 === 0 ? accent.primary : accent.secondary;
              const boxBase = { h: hue, s: BOX_SAT, l: BOX_L };
              const boxFill = applyColorShift(boxBase, bodyShift, ambient);
              const boxX = rowStartX + col * boxW;
              const labelLit = !!labelLitRoll[index];
              const labelFill = labelLit
                ? lamp(colorTheme.indicator.powered, nightDepth)
                : applyColorShift(colorTheme.indicator.off, NO_SHIFT, 1);

              return (
                <g key={col}>
                  <rect data-container="box" x={boxX} y={rowTopY} width={boxW} height={boxH} fill={boxFill} />
                  <rect
                    data-container="label"
                    x={boxX + boxW / 2 - LABEL_SIZE / 2}
                    y={rowTopY + boxH / 2 - LABEL_SIZE / 2}
                    width={LABEL_SIZE}
                    height={LABEL_SIZE}
                    fill={labelFill}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
};
