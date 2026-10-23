import { memo } from 'react';
import { HelpPopover } from './HelpPopover';
import type { ContentHelp } from '@/content';
import './DualLabel.css';

interface DualLabelProps {
  loreLabel?: string;
  humanLabel?: string;
  /** The control's help (docs/specs/LAYOUT_REWORK.md §1.4): a "?" after the label opens it. Pass it
   *  only from a label row that is not itself inside a button. */
  help?: ContentHelp;
}

/**
 * Renders whichever subset of the lore/human label pair is present — used
 * standalone for display-only rows (Robot Name, Job Data, ...) and composed
 * internally by every other control primitive for its own label rendering.
 * With `help`, the last line gains the "?" — beside the name, never inside
 * its span, so the name's own element still reads exactly the name.
 */
function DualLabelInner({ loreLabel, humanLabel, help }: DualLabelProps) {
  if (!loreLabel && !humanLabel) return null;
  const helpButton = help ? <HelpPopover help={help} humanLabel={humanLabel} loreLabel={loreLabel} /> : null;
  const lore = loreLabel && <span className="sc-dual-label__lore">{loreLabel}</span>;
  const human = humanLabel && <span className="sc-dual-label__human">{humanLabel}</span>;
  return (
    <div className="sc-dual-label">
      {helpButton && !humanLabel ? <span className="sc-dual-label__line">{lore}{helpButton}</span> : lore}
      {helpButton && humanLabel ? <span className="sc-dual-label__line">{human}{helpButton}</span> : human}
    </div>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 6) — every prop is a plain string or the
// content entry's own `help` object, pulled directly off a stable schema object, so the default shallow
// compare is correct. Composed internally by every other primitive; its own benefit is realized once its
// parent primitive is memoized and bails (so DualLabel is never even reached).
export const DualLabel = memo(DualLabelInner);
