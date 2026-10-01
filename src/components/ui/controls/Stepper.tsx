import { memo } from 'react';

import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import type { StepperSchema } from '@/types/controls';
import { fill } from '@/content';
import './Stepper.css';

interface StepperProps {
  schema: StepperSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** Integer +/- control. Controlled — clamps to schema.min/max, steps by
 *  schema.step (default 1), never calls onChange with an out-of-bounds value. */
function StepperInner({ schema, value, onChange, disabled }: StepperProps) {
  const step = schema.step ?? 1;
  const accessibleName = resolveAccessibleName(schema);

  function decrement() {
    const next = value - step;
    if (next < schema.min) return;
    onChange(next);
  }

  function increment() {
    const next = value + step;
    if (next > schema.max) return;
    onChange(next);
  }

  return (
    <div className="sc-stepper">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <div className="sc-stepper__controls">
        <button
          type="button"
          className="sc-stepper__btn"
          aria-label={fill('ui.stepper.decrement', { name: accessibleName })}
          onClick={decrement}
          disabled={disabled || value <= schema.min}
        >
          −
        </button>
        <span className="sc-stepper__value">{formatDisplayValue(value)}</span>
        <button
          type="button"
          className="sc-stepper__btn"
          aria-label={fill('ui.stepper.increment', { name: accessibleName })}
          onClick={increment}
          disabled={disabled || value >= schema.max}
        >
          +
        </button>
      </div>
    </div>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 8) — every prop is a primitive
// or stable schema object; the default shallow compare is correct.
export const Stepper = memo(StepperInner);
