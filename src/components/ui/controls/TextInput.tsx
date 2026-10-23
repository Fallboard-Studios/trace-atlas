import { memo } from 'react';

import { CabinetBox } from './CabinetBox';
import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import type { TextInputSchema } from '@/types/controls';
import './TextInput.css';

interface TextInputProps {
  schema: TextInputSchema;
  value: string;
  onChange: (value: string) => void;
  /** Renders as a native numeric input (type="number", inputMode="decimal")
   *  instead of plain text — for callers whose value is always a number
   *  (e.g. CoordsInput's X/Y fields). Purely a rendering concern, not part
   *  of TextInputSchema — the schema still describes generic text entry. */
  numeric?: boolean;
  disabled?: boolean;
}

/**
 * Plain schema-driven text input. Controlled — calls onChange with the raw
 * string on every keystroke, no internal buffering.
 *
 * Renders through a permanently-popped, non-animating CabinetBox facade
 * (roadmap Phase 11.1.9) — the same static-facade mechanism DirectionalPanel
 * (docs/specs/archive/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md) already uses:
 * popped={true} (a literal, never a variable) plus skipMountAnimation, so
 * CabinetBox's own unmodified mount/transition logic never actually
 * produces a tween for this instance. autoHeight lets the box's own real
 * content height (DualLabel's 1 or 2 lines, depending on which labels the
 * schema sets, plus the input row) drive the facade's size — see
 * docs/specs/archive/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.2 for why a fixed
 * breakpoint-tier height (Button's own pattern) doesn't fit every real
 * consumer here.
 *
 * Unlike DirectionalPanel, every instance renders its own facade
 * unconditionally — no nesting-context, no per-instance opt-out
 * (docs/specs/archive/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.1, confirmed intent).
 * CoordsInput composes two of these and needs no code of its own to end up
 * with two independent facades. The native <input> itself is completely
 * unaffected — no new interaction, no hover/focus/disabled-reactive pop;
 * the box is purely decorative.
 */
function TextInputInner({ schema, value, onChange, numeric, disabled }: TextInputProps) {
  return (
    <div className="sc-text-input-facade">
      <CabinetBox
        popped
        skipMountAnimation
        autoHeight
        timelineKey={`cabinet-text-input-facade-${schema.id}`}
      >
        <div className="sc-text-input">
          <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />
          <input
            type={numeric ? 'number' : 'text'}
            inputMode={numeric ? 'decimal' : undefined}
            step={numeric ? 'any' : undefined}
            className="sc-text-input__el"
            /* Bugfix, found live via a Chrome console warning on CompanyCrudControls's
               Create field: a form field with neither id nor name is a real Chrome
               best-practices flag (autofill/accessibility). schema.id is already the
               uniqueness boundary every TextInput consumer relies on (see
               CompanyCrudControls.tsx's own CREATE_NAME_SCHEMA/RENAME_NAME_SCHEMA
               comment, and CoordsInput's `${schema.id}.x`/`.y`) — reused here rather
               than inventing a second id scheme. */
            id={schema.id}
            name={schema.id}
            aria-label={resolveAccessibleName(schema)}
            placeholder={schema.placeholder}
            maxLength={schema.maxLength}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      </CabinetBox>
    </div>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 7) — every prop is a primitive
// or stable schema object; the default shallow compare is correct.
export const TextInput = memo(TextInputInner);
