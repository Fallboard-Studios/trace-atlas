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

/** One field's entry as a coordinate, or null when it is none. A native number input sanitizes an invalid keystroke
 *  (e.g. stray letters) to an empty string rather than leaving the raw text in place, so blank is guarded the same as
 *  NaN — neither is a real coordinate. Coordinates are integers system-wide (see docs/specs/archive/SECTOR_SETTINGS.md)
 *  — a decimal is rounded rather than rejected, so it still lands on something — and safe integers, the bound the world
 *  link reads, so every plot this sends a retransmit to is one its link decodes back
 *  (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R23). */
function coordinateOf(raw: string): number | null {
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return null;
  const rounded = Math.round(parsed);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

/**
 * X/Y coordinate entry composing two TextInput instances. Coordinates are
 * integers system-wide (docs/specs/archive/SECTOR_SETTINGS.md) — a decimal entry is
 * rounded to the nearest integer before onChange fires. A non-numeric entry,
 * or one past the safe integers, does not call onChange.
 */
function CoordsInputInner({ schema, value, onChange }: CoordsInputProps) {
  const xSchema: TextInputSchema = { id: `${schema.id}.x`, type: 'textInput', ...labels('sector.coords.x') };
  const ySchema: TextInputSchema = { id: `${schema.id}.y`, type: 'textInput', ...labels('sector.coords.y') };

  function handleX(raw: string) {
    const x = coordinateOf(raw);
    if (x !== null) onChange({ ...value, x });
  }

  function handleY(raw: string) {
    const y = coordinateOf(raw);
    if (y !== null) onChange({ ...value, y });
  }

  return (
    <div className="sc-coords-input">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />
      <div className="sc-coords-input__fields">
        <TextInput schema={xSchema} value={String(value.x)} onChange={handleX} numeric />
        <TextInput schema={ySchema} value={String(value.y)} onChange={handleY} numeric />
      </div>
    </div>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 9) — every prop is a primitive,
// a stable schema object, or the CoordsValue object (compared shallowly — a caller replacing it
// wholesale on any real change is the expected usage).
export const CoordsInput = memo(CoordsInputInner);
