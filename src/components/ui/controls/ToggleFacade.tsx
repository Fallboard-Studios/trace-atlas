import { memo, type ReactNode } from 'react';

import './ToggleFacade.css';

interface ToggleFacadeProps {
  /** The toggle's current value: shows `on` when true, `off` when false. */
  value: boolean;
  /** Facade content when the toggle is off — a glyph, a word, a DualLabel; any node. */
  off: ReactNode;
  /** Facade content when the toggle is on. */
  on: ReactNode;
}

/**
 * Facade content for a `Toggle` whose face changes with its state. A control whose content changes
 * holds the size of its LARGEST content, so flipping it never resizes the box or shifts what sits beside
 * it (Crawford, 2026-10-03). Every state's content is a real child, all stacked in ONE grid cell
 * (ToggleFacade.css), so the cell is as wide and as tall as the biggest; every state but the current one
 * is merely `visibility: hidden`. No JS measuring, so any lore or language variant sizes itself, and the
 * content can be anything — a ☰ glyph or a two-line DualLabel.
 *
 * aria-hidden: the switch this sits inside already carries the accessible name (its aria-label) and the
 * state (aria-checked), so the face is decoration for assistive tech — which also means the hidden
 * states are never announced.
 */
function ToggleFacadeInner({ value, off, on }: ToggleFacadeProps) {
  return (
    <span className="sc-toggle-facade" aria-hidden="true">
      <span className="sc-toggle-facade__state" data-current={value ? undefined : ''}>{off}</span>
      <span className="sc-toggle-facade__state" data-current={value ? '' : undefined}>{on}</span>
    </span>
  );
}

export const ToggleFacade = memo(ToggleFacadeInner);
