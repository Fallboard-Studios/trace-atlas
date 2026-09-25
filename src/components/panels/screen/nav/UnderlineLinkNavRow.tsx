import { useState } from 'react';

import { UnderlineLink } from '@/components/ui/controls/UnderlineLink';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';
import './UnderlineLinkNavRow.css';

interface UnderlineLinkNavRowProps {
  node: NavTreeNodeSchema;
  onClick: () => void;
  /** Resolved trait/robot color — either this node's own, or its nearest ancestor's (docs/specs/
   *  NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.2). Passed straight through to UnderlineLink. */
  color: string;
}

/**
 * The tree row chrome for the two deepest nav-tree levels (docs/specs/
 * NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §5.3) — a transparent <button> click target (mirroring
 * Button.css's own .sc-button split) wrapping a plain DualLabel (humanLabel only, no loreLabel —
 * matching every existing tree row) and an UnderlineLink beneath it, in place of the full
 * CabinetBox+Button chrome branch/entity rows still use. `popped` is computed exactly like
 * Button.tsx's own hover/focus/press wiring — no `disabled` concept for a nav row.
 */
export function UnderlineLinkNavRow({ node, onClick, color }: UnderlineLinkNavRowProps) {
  const accessibleName = resolveAccessibleName(node);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const popped = hovered || focused || pressed;

  return (
    <button
      type="button"
      className="sc-underline-link-nav-row"
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
      <UnderlineLink popped={popped} timelineKey={`underline-link-${node.id}`} color={color} />
    </button>
  );
}

export default UnderlineLinkNavRow;
