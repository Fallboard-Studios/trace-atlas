import { memo } from 'react';

import { DualLabel } from './DualLabel';
import { TextInput } from './TextInput';
import type { CoordsInputSchema, TextInputSchema } from '@/types/controls';
import { labels } from '@/content';
import './CoordsInput.css';

export interface CoordsValue {
  x: number;
  y: number;
}

interface CoordsInputProps {
  schema: CoordsInputSchema;
  value: CoordsValue;
  onChange: (value: CoordsValue) => void;
}

/**
 * X/Y coordinate entry composing two TextInput instances. Coordinates are
 * integers system-wide (docs/specs/SECTOR_SETTINGS.md) — a decimal entry is
 * rounded to the nearest integer before onChange fires. A non-numeric entry
 * does not call onChange.
 */
function CoordsInputInner({ schema, value, onChange }: CoordsInputProps) {
  const xSchema: TextInputSchema = { id: `${schema.id}.x`, type: 'textInput', ...labels('sector.coords.x') };
  const ySchema: TextInputSchema = { id: `${schema.id}.y`, type: 'textInput', ...labels('sector.coords.y') };

  function handleX(raw: string) {
    // A native number input sanitizes an invalid keystroke (e.g. stray
    // letters) to an empty string rather than leaving the raw text in
    // place, so guard blank the same as NaN — neither is a real coordinate.
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    // Coordinates are integers system-wide (see docs/specs/SECTOR_SETTINGS.md) —
    // round rather than reject, so a typed decimal still lands on something.
    onChange({ ...value, x: Math.round(parsed) });
  }

  function handleY(raw: string) {
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    onChange({ ...value, y: Math.round(parsed) });
  }

  return (
    <div className="sc-coords-input">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <div className="sc-coords-input__fields">
        <TextInput schema={xSchema} value={String(value.x)} onChange={handleX} numeric />
        <TextInput schema={ySchema} value={String(value.y)} onChange={handleY} numeric />
      </div>
    </div>
  );
}

// React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 9) — every prop is a primitive,
// a stable schema object, or the CoordsValue object (compared shallowly — a caller replacing it
// wholesale on any real change is the expected usage).
export const CoordsInput = memo(CoordsInputInner);
