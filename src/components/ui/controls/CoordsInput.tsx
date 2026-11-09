import { memo } from 'react';

import { DualLabel } from './DualLabel';
import { TextInput } from './TextInput';
import type { CoordsInputSchema, TextInputSchema } from '@/types/controls';
import { labels } from '@/content';
import './CoordsInput.css';

/** The two fields' entries. A null axis is a field left blank: the caller decides what a blank means (the off screen's
 *  editor and Foundry draw it at random on a commit). */
export interface CoordsValue {
  x: number | null;
  y: number | null;
}

interface CoordsInputProps {
  schema: CoordsInputSchema;
  value: CoordsValue;
  onChange: (value: CoordsValue) => void;
  /** Passed to both fields' TextInput: false drops their facades, for a caller whose own panel frames them. */
  facade?: boolean;
}

/** One field's entry as a coordinate: null when it is blank, undefined when it is no coordinate the world can hold. A
 *  native number input sanitizes an invalid keystroke (e.g. stray letters, or a lone "-" mid-way to a negative) to an
 *  empty string rather than leaving the raw text in place, so it reads as blank, never NaN. A blank field is allowed so a
 *  sign flip is easy (found at docs/tasks/OFF_SCREEN_CONSOLE.md's "editor" checkpoint). Coordinates are integers
 *  system-wide (see docs/specs/archive/SECTOR_SETTINGS.md) — a decimal is rounded rather than rejected, so it still lands
 *  on something — and safe integers, the bound the world link reads, so every plot this sends a retransmit to is one its
 *  link decodes back (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R23). */
function coordinateOf(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  const rounded = Math.round(Number(raw));
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

/**
 * X/Y coordinate entry composing two TextInput instances. Coordinates are
 * integers system-wide (docs/specs/archive/SECTOR_SETTINGS.md) — a decimal entry is
 * rounded to the nearest integer before onChange fires. A cleared field calls
 * onChange with null for its axis; an entry past the safe integers does not
 * call onChange.
 */
function CoordsInputInner({ schema, value, onChange, facade = true }: CoordsInputProps) {
  const xSchema: TextInputSchema = { id: `${schema.id}.x`, type: 'textInput', ...labels('sector.coords.x') };
  const ySchema: TextInputSchema = { id: `${schema.id}.y`, type: 'textInput', ...labels('sector.coords.y') };

  function handleX(raw: string) {
    const x = coordinateOf(raw);
    if (x !== undefined) onChange({ ...value, x });
  }

  function handleY(raw: string) {
    const y = coordinateOf(raw);
    if (y !== undefined) onChange({ ...value, y });
  }

  return (
    <div className="sc-coords-input">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} help={schema.help} />
      <div className="sc-coords-input__fields">
        <TextInput schema={xSchema} value={value.x === null ? '' : String(value.x)} onChange={handleX} numeric facade={facade} />
        <TextInput schema={ySchema} value={value.y === null ? '' : String(value.y)} onChange={handleY} numeric facade={facade} />
      </div>
    </div>
  );
}

// React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 9) — every prop is a primitive,
// a stable schema object, or the CoordsValue object (compared shallowly — a caller replacing it
// wholesale on any real change is the expected usage).
export const CoordsInput = memo(CoordsInputInner);
