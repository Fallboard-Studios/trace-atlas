import { useState } from 'react';

import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';
import './NavCabinetRow.css';

/** First-pass resting height/pop distance for this row's own bare CabinetBox — carried over
 *  unchanged from UnderlineLink's own UNDERLINE_POP_DISTANCE/4px-tall-bar values (docs/specs/
 *  NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §4 — Crawford has already flagged he's unsure this
 *  reads well this thin; tune later, don't silently change it now). */
const NAV_CABINET_ROW_BOX_HEIGHT = 4;
const NAV_CABINET_ROW_POP_DISTANCE = 4;

interface NavCabinetRowProps {
  node: NavTreeNodeSchema;
  onClick: () => void;
  /** Resolved trait/robot color — either this node's own, or its nearest ancestor's (unchanged
   *  from the prior UnderlineLinkNavRow — see NavTreeNode.tsx's own resolvedColor). Passed
   *  straight through to CabinetBox's color prop. */
  color: string;
}

/**
 * The tree row chrome for the two deepest nav-tree levels (docs/specs/
 * NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md §1.4/§5.2) — a transparent <button> click target
 * (mirroring Button.css's own .sc-button split) wrapping a plain DualLabel (humanLabel only, no
 * loreLabel) and one bare, textless, full-width CabinetBox beneath it, replacing the prior
 * UnderlineLinkNavRow's flat translating bar with the same oblique-pop mechanism every other
 * interactive control in the design system uses. `popped` is computed exactly like Button.tsx's
 * own hover/focus/press wiring — no `disabled` concept for a nav row.
 * `enforceMinTouchHeight={false}`: this CabinetBox is not itself the touch target — the <button>
 * wrapping it is — see CabinetBox.tsx's own doc comment and spec §1.3.
 */
export function NavCabinetRow({ node, onClick, color }: NavCabinetRowProps) {
  const accessibleName = resolveAccessibleName(node);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const popped = hovered || focused || pressed;

  return (
    <button
      type="button"
      className="sc-nav-cabinet-row"
      aria-label={accessibleName}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <DualLabel humanLabel={node.humanLabel} />
      <CabinetBox
        popped={popped}
        timelineKey={`cabinet-nav-row-${node.id}`}
        color={color}
        boxHeight={NAV_CABINET_ROW_BOX_HEIGHT}
        popDistance={NAV_CABINET_ROW_POP_DISTANCE}
        enforceMinTouchHeight={false}
      />
    </button>
  );
}

export default NavCabinetRow;
