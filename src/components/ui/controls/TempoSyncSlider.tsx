import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { SliderLinear } from './SliderLinear';
import { TempoSyncToggle } from './TempoSyncToggle';
import { isNoteValue, noteValueBeats, noteValueEquals, type NoteValue } from '@/data/noteValues';
import { formatNoteValue } from '@/utils/formatNoteValue';
import type { SliderLinearSchema } from '@/types/controls';
import './TempoSyncSlider.css';

interface TempoSyncSliderProps {
  /** The Free-mode schema as today (id/labels/min/max/step/unit). Sync mode derives its own from it. */
  schema: SliderLinearSchema;
  freeValue: number;
  /** undefined = Free. */
  syncValue: NoteValue | undefined;
  /** The allowed list at the current tempo, in slider order (the caller supplies allowedLaneNoteValues / allowedDelayNoteValues). */
  allowed: readonly NoteValue[];
  onFreeChange: (value: number) => void;
  onSyncChange: (value: NoteValue) => void;
  /** Toggle flipped — the caller's store action performs the Free <-> Sync conversion (spec §1.5). */
  onModeChange: (sync: boolean) => void;
  disabled?: boolean;
  swelling?: boolean;
}

/**
 * Index of `sync` in `allowed`, or — when a tempo change has pushed it out of the list — the stop
 * nearest it in beats (the list's slow or fast end, whichever the note ran past). Direction-agnostic
 * on purpose: lane lists run slow -> fast and Delay lists short -> long, and this component knows
 * neither. Display-only; nothing is written back, so moving the tempo back restores the stored note.
 */
function displayIndex(sync: NoteValue, allowed: readonly NoteValue[]): number {
  const exact = allowed.findIndex((a) => noteValueEquals(a, sync));
  if (exact >= 0) return exact;
  const target = noteValueBeats(sync);
  let best = 0;
  for (let i = 1; i < allowed.length; i++) {
    if (Math.abs(noteValueBeats(allowed[i]) - target) < Math.abs(noteValueBeats(allowed[best]) - target)) best = i;
  }
  return best;
}

/**
 * Rate / Delay Time slider with its Free | Sync (Float | Anchored) toggle in a row of its own under it
 * (docs/specs/FREE_SYNC_TOGGLE.md §1.4). A composition like LfoLink, not a 15th primitive: one
 * SliderLinear plus a TempoSyncToggle, store-free and tempo-free. Free renders the caller's schema as-is.
 * Sync reuses the same slider with the allowed notes as its stops — value = index into `allowed`,
 * readout = the note's name — so the caller owns tempo (it passes `allowed`) and the store owns the
 * Free <-> Sync conversion (it handles `onModeChange`).
 */
function TempoSyncSliderInner({ schema, freeValue, syncValue: storedSync, allowed, onFreeChange, onSyncChange, onModeChange, disabled, swelling }: TempoSyncSliderProps) {
  // An unrecognised stored `sync` is Free everywhere else (the resolvers, spec assumption 9), so the
  // audio is running Free; showing Anchored over it would lie. Validated once here, so every use below
  // sees either a real note or undefined.
  const syncValue = isNoteValue(storedSync) ? storedSync : undefined;
  const synced = syncValue !== undefined;

  // Memoized on [schema, allowed] only: `syncValue` changes on every step and must not rebuild it.
  const syncSchema: SliderLinearSchema = useMemo(
    () => ({
      ...schema,
      id: `${schema.id}.sync`,
      min: 0,
      // Never less than 1: Radix positions the thumb by dividing by (max - min), so a zero-width
      // range yields NaN. A list with fewer than two stops is shown disabled below, so the phantom
      // second stop is unreachable.
      max: Math.max(1, allowed.length - 1),
      step: 1,
      unit: undefined,
      // useEasedControlValue hands formatValue a fractional value mid-ease, hence the round.
      formatValue: (index: number) => {
        const note = allowed[Math.round(index)];
        return note ? formatNoteValue(note) : '';
      },
    }),
    [schema, allowed],
  );
  const syncIndex = useMemo(() => (syncValue ? displayIndex(syncValue, allowed) : 0), [syncValue, allowed]);

  // Stable handlers via the `latest` ref pattern (LfoLink's own precedent) — written in an effect,
  // not during render. They read `allowed` here so a step always indexes the list on screen.
  const latest = useRef({ allowed, onFreeChange, onSyncChange, onModeChange });
  useEffect(() => {
    latest.current = { allowed, onFreeChange, onSyncChange, onModeChange };
  });

  const handleFreeChange = useCallback((value: number) => latest.current.onFreeChange(value), []);
  const handleSyncChange = useCallback((index: number) => {
    const note = latest.current.allowed[index];
    if (note) latest.current.onSyncChange(note);
  }, []);
  const handleModeChange = useCallback((next: boolean) => latest.current.onModeChange(next), []);

  // One stop (or none) leaves nothing to choose between; the toggle stays usable so the lane can still go Free.
  const sliderDisabled = disabled || (synced && allowed.length < 2);

  return (
    <div className="sc-tempo-sync">
      <div className="sc-tempo-sync__slider">
        {/* Keyed per mode: SliderLinear eases any external value change over 250 ms, and a Free value
            and a Sync index are different spaces — easing across the switch would sweep the thumb and
            flash meaningless note names. A fresh instance lands on its value immediately. */}
        <SliderLinear
          key={synced ? 'sync' : 'free'}
          schema={synced ? syncSchema : schema}
          value={synced ? syncIndex : freeValue}
          onChange={synced ? handleSyncChange : handleFreeChange}
          disabled={sliderDisabled}
          swelling={swelling}
        />
      </div>
      <TempoSyncToggle schemaId={schema.id} synced={synced} onChange={handleModeChange} disabled={disabled} />
    </div>
  );
}

// React.memo — every prop is a primitive, a stable schema object, the NoteValue object / allowed list
// (the caller memoises the list on bpm), or a callback.
export const TempoSyncSlider = memo(TempoSyncSliderInner);
