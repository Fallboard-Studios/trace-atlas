import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { DERELICT_SAT } from '../../../../constants/sceneDepth';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 scaffold row)
// ========================================

const POST_W = 6;
const LEVEL_SPACING = 60;
const LEVEL_H = 5;
const LEVEL_OVERHANG = 8;
const BRACE_THICKNESS = 4;
const LIGHT_R = 5;

/**
 * Scaffold (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a two-faced solid-lower block (the
 * body-bearing part) topped by an open frame of posts, levels and 45° braces in a checkerboard
 * of alternating bays — the ⌈bays·levels/2⌉ count the spec/plan call for. Derelict (§1.6) swaps
 * the whole frame from `shell.base` to `shell.shadow` and drops the top-corner light, same
 * "force it off" pattern `tank.tsx`/`dome.tsx` use rather than relying on `nightDepth === 0`.
 */
export const scaffold: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.scaffold;
  if (!p) return <g data-scenery="scaffold" />;
  const { w, h, bays, solidFrac } = p;
  const derelict = !!actor.config?.derelict;

  const bodyShift = { hueShift: actor.config?.hueShift ?? 0, satShift: actor.config?.satShift ?? 0 };
  const satMult = derelict ? DERELICT_SAT : 1;
  const bodyBase = { ...colorTheme.body.base, s: colorTheme.body.base.s * satMult };
  const westFill = applyColorShift(bodyBase, bodyShift, westL * cap);
  const eastFill = applyColorShift(bodyBase, bodyShift, eastL * cap);
  const frameBase = derelict ? colorTheme.shell.shadow : colorTheme.shell.base;
  const frameFill = applyColorShift(frameBase, NO_SHIFT, ((eastL + westL) / 2) * cap);

  const half = w / 2;
  const top = y - h;
  const solidH = h * solidFrac;
  const solidTop = y - solidH;
  const bayWidth = w / bays;
  const levelCount = Math.max(1, Math.floor(h / LEVEL_SPACING));

  const braces: { x0: number; y0: number; d: number }[] = [];
  for (let level = 0; level < levelCount; level++) {
    const cellBottom = y - level * LEVEL_SPACING;
    for (let bay = 0; bay < bays; bay++) {
      if ((bay + level) % 2 !== 0) continue;
      const cellX0 = x - half + bay * bayWidth;
      braces.push({ x0: cellX0, y0: cellBottom, d: Math.min(bayWidth, LEVEL_SPACING) });
    }
  }

  const half45 = BRACE_THICKNESS / 2;

  return (
    <g data-scenery="scaffold">
      <rect data-scaffold="solid" x={x - half} y={solidTop} width={half} height={solidH} fill={westFill} />
      <rect data-scaffold="solid" x={x} y={solidTop} width={half} height={solidH} fill={eastFill} />
      {Array.from({ length: bays + 1 }, (_, i) => (
        <rect
          key={`post-${i}`}
          data-scaffold="post"
          x={x - half + i * bayWidth - POST_W / 2}
          y={top}
          width={POST_W}
          height={h}
          fill={frameFill}
        />
      ))}
      {Array.from({ length: levelCount }, (_, i) => {
        const levelY = y - (i + 1) * LEVEL_SPACING;
        return (
          <rect
            key={`level-${i}`}
            data-scaffold="level"
            x={x - half - LEVEL_OVERHANG}
            y={levelY - LEVEL_H / 2}
            width={w + LEVEL_OVERHANG * 2}
            height={LEVEL_H}
            fill={frameFill}
          />
        );
      })}
      {braces.map((brace, i) => {
        const { x0, y0, d } = brace;
        const points = [
          `${x0 - half45},${y0 - half45}`,
          `${x0 + d - half45},${y0 - d - half45}`,
          `${x0 + d + half45},${y0 - d + half45}`,
          `${x0 + half45},${y0 + half45}`,
        ].join(' ');
        return <polygon key={`brace-${i}`} data-scaffold="brace" points={points} fill={frameFill} />;
      })}
      {!derelict && (
        <circle data-scaffold="light" cx={x + half} cy={top} r={LIGHT_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
      )}
    </g>
  );
};
