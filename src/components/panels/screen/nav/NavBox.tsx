import { useId, useState } from 'react';

import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import './NavBox.css';

interface NavBoxProps {
  /** Unique within the panel (a branch); keys the box's timeline. */
  id: string;
  loreLabel?: string;
  humanLabel: string;
  /** Where you are — the open branch: fully popped, `aria-current`. */
  current?: boolean;
  onClick: () => void;
}

/**
 * One box in the nav panel (docs/specs/LAYOUT_REWORK.md §1.2): a native button over an animated
 * CabinetBox, engaged on hover / focus / press exactly as Button is (resting at CABINET_REST_POP).
 * What Button has no notion of is a box that stays out — the current branch — so out = act reads as
 * "you are here" (the depth rule, spec §3). `timelineKey` carries
 * useId() for the reason Button's does: timelineMap is keyed globally, so two boxes with one id (a remount
 * overlapping its predecessor, a test rendering twice) would share a timeline.
 */
export function NavBox({ id, loreLabel, humanLabel, current = false, onClick }: NavBoxProps) {
  const instanceId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const popped = current || hovered || focused || pressed ? true : CABINET_REST_POP;

  return (
    <button
      type="button"
      className="nav-box"
      aria-label={humanLabel}
      aria-current={current ? 'true' : undefined}
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
