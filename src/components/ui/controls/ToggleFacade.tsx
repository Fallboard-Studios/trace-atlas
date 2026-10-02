import { memo } from 'react';

import './ToggleFacade.css';

interface ToggleFacadeProps {
  /** The toggle's current value: shows `on` when true, `off` when false. */
  value: boolean;
  /** Facade content when the toggle is off. */
  off: string;
  /** Facade content when the toggle is on. */
  on: string;
}

/**
 * Facade content for a `Toggle` whose face changes with its state (a word, an icon). A control whose
 * content changes holds the size of its LARGEST content, so flipping it never resizes the box or shifts
 * what sits beside it (Crawford, 2026-10-03). Both states' content ride along as data attributes that
 * ToggleFacade.css stacks, invisibly, in the same grid cell as the current content; the DOM text stays
 * only the current content. No JS measuring, so any lore or language variant sizes itself.
 *
 * aria-hidden: the switch this sits inside already carries the accessible name (its aria-label) and the
 * state (aria-checked), so the face is decoration for assistive tech.
 */
function ToggleFacadeInner({ value, off, on }: ToggleFacadeProps) {
  return (
    <span className="sc-toggle-facade" data-off={off} data-on={on} aria-hidden="true">
      <span className="sc-toggle-facade__current">{value ? on : off}</span>
    </span>
  );
}

export const ToggleFacade = memo(ToggleFacadeInner);
