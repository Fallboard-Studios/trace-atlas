import { useId, useState, type CSSProperties } from 'react';

import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import './NavBox.css';

interface NavBoxProps {
  /** Unique within the panel (a branch, an entity id); keys the box's timeline. */
  id: string;
  loreLabel?: string;
  humanLabel: string;
  /** Where you are — the open branch or the selected entity: fully popped, `aria-current`. */
  current?: boolean;
  /** A disclosure's open state (+ New Company): fully popped while open, `aria-expanded`. */
  expanded?: boolean;
  /** The id of what the disclosure opens. */
  controls?: string;
  /** The box's own accent scope (getRobotColorStyle for an entity); omitted, it inherits. */
  accentStyle?: CSSProperties;
  onClick: () => void;
}

/**
 * One box in the nav panel (docs/specs/LAYOUT_REWORK.md §1.2): a native button over an animated
 * CabinetBox, engaged on hover / focus / press exactly as Button is (resting at CABINET_REST_POP).
 * What Button has no notion of is a box that stays out — the current branch or entity, or an open
 * disclosure — so out = act reads as "you are here" (the depth rule, spec §3). `timelineKey` carries
 * useId() for the reason Button's does: the phone sheet may mount a second panel.
 */
export function NavBox({ id, loreLabel, humanLabel, current = false, expanded, controls, accentStyle, onClick }: NavBoxProps) {
  const instanceId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const popped = current || expanded || hovered || focused || pressed ? true : CABINET_REST_POP;

  return (
    <button
      type="button"
      className="nav-box"
      style={accentStyle}
      aria-label={humanLabel}
      aria-current={current ? 'true' : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
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
      <CabinetBox popped={popped} timelineKey={`cabinet-nav-box-${id}-${instanceId}`}>
        <DualLabel loreLabel={loreLabel} humanLabel={humanLabel} />
      </CabinetBox>
    </button>
  );
}

export default NavBox;
