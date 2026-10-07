import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift, clamp } from '../../../../utils/colorUtils';
import { NO_SHIFT } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 wreck row)
// ========================================

/** Deck rail thickness, scene units. */
const DECK_RAIL_H = 5;
/** Deckhouse height. */
const DECKHOUSE_H = 46;
/** Funnel height, stacked on the deckhouse. */
const FUNNEL_H = 40;
/** Funnel width — not given explicitly by §1.9; a fixed fraction of the deckhouse width. */
const FUNNEL_W_FRAC = 0.35;
/** Dead porthole radius. */
const PORTHOLE_R = 6;
/** Keel shadow strip height. */
const KEEL_SHADOW_H = 10;
/** Body saturation is forced to 6 (§1.9: "body body.base sat 6") — a wreck's paint has weathered
 *  to near-grey, same "forced sat" pattern boulder.tsx's BOULDER_BASE_SAT uses. */
const WRECK_BODY_SAT = 6;
/** The row's own cap multiplier on top of ctx.cap (§1.9: "cap x 0.5") — a wreck has no
 *  `config.derelict` flag (always-derelict is the renderer's rule, not a flag, per the Task 17
 *  amendment), so it cannot ride `DERELICT_L_CAP` through `Scenery.tsx`; it folds its own 0.5
 *  directly instead. */
const WRECK_CAP_MULT = 0.5;

/**
 * Wreck (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a stern block and a 45°-raked bow, a deck
 * rail, a deckhouse with a funnel, a row of dead (unlit) portholes, and a keel shadow. Always
 * derelict by construction — no lit element anywhere, at any `nightDepth`, and no stored shift
 * (structural, §1.8): the hull reads as weathered grey at every hour.
 */
export const wreck: SceneryRenderer = ({ actor, params, cap, eastL, westL }) => {
  const { x, y } = actor.position;
  const p = params.wreck;
  if (!p) return <g data-scenery="wreck" />;
  const { w, h, deckhouseFrac, portholes } = p;

  const effectiveCap = cap * WRECK_CAP_MULT;
  const avgL = (eastL + westL) / 2;
  const bodyBase = { ...colorTheme.body.base, s: clamp(WRECK_BODY_SAT, 0, 100) };

  const top = y - h;
  // "45° raked bow (x1 - h)" — x1 is the hull's right edge; the raked edge starts h short of it,
  // so its horizontal and vertical run are both exactly h.
  const x1 = x + w / 2;
  const splitX = x1 - h;

  const hullWestPoints = [`${x - w / 2},${y}`, `${x - w / 2},${top}`, `${splitX},${top}`, `${splitX},${y}`].join(' ');
  const bowPoints = [`${splitX},${top}`, `${x1},${y}`, `${splitX},${y}`].join(' ');

  const westFill = applyColorShift(bodyBase, NO_SHIFT, westL * effectiveCap);
  const eastFill = applyColorShift(bodyBase, NO_SHIFT, eastL * effectiveCap);
  const railFill = applyColorShift(colorTheme.shell.shadow, NO_SHIFT, avgL * effectiveCap);
  const superstructureFill = applyColorShift(colorTheme.shell.shadow, NO_SHIFT, avgL * effectiveCap);
  const portholeFill = applyColorShift(colorTheme.shadowDepth, NO_SHIFT, effectiveCap);
  const keelFill = applyColorShift(colorTheme.shadowDepth, NO_SHIFT, avgL * effectiveCap);

  const deckY = top - DECK_RAIL_H;
  const deckW = w - h; // the flat deck's own width, before the raked bow
  const deckhouseW = deckhouseFrac * w;
  const deckhouseX = x - w / 2 + deckW / 2 - deckhouseW / 2;
  const deckhouseTop = deckY - DECKHOUSE_H;
  const funnelW = deckhouseW * FUNNEL_W_FRAC;

  const portholeSpan = deckW - PORTHOLE_R * 4;
  const portholeStartX = x - w / 2 + PORTHOLE_R * 2;
  const portholeY = top + h / 2;

  return (
    <g data-scenery="wreck">
      <polygon data-wreck="hull-west" points={hullWestPoints} fill={westFill} />
      <polygon data-wreck="bow" points={bowPoints} fill={eastFill} />
      <rect data-wreck="deck-rail" x={x - w / 2} y={deckY} width={deckW} height={DECK_RAIL_H} fill={railFill} />
      <rect data-wreck="deckhouse" x={deckhouseX} y={deckhouseTop} width={deckhouseW} height={DECKHOUSE_H} fill={superstructureFill} />
      <rect
        data-wreck="funnel"
        x={deckhouseX + deckhouseW / 2 - funnelW / 2}
        y={deckhouseTop - FUNNEL_H}
        width={funnelW}
        height={FUNNEL_H}
        fill={superstructureFill}
      />
      {Array.from({ length: portholes }, (_, i) => {
        const t = portholes === 1 ? 0.5 : i / (portholes - 1);
        return (
          <circle
            key={i}
            data-wreck="porthole"
            cx={portholeStartX + t * portholeSpan}
            cy={portholeY}
            r={PORTHOLE_R}
            fill={portholeFill}
          />
        );
      })}
      <rect data-wreck="keel-shadow" x={x - w / 2} y={y - KEEL_SHADOW_H} width={w} height={KEEL_SHADOW_H} fill={keelFill} />
    </g>
  );
};
