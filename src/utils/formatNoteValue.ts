/**
 * The readout for a tempo-synced note (docs/specs/FREE_SYNC_TOGGLE.md §1.4/§1.9): `1/8`, `1/4 triplet`,
 * `1 bar dotted`, `2 bars`. Lives here rather than in data/noteValues.ts because the words are content —
 * every one is read from `ui.noteValue.*`; only the division's digit is data.
 */
import { CONTENT, fill, optionsRecord } from '@/content';
import type { NoteValue } from '@/data/noteValues';

/** The note's name with no modifier: a fraction, the singular bar, or a plural bar count. */
function formatDivision(division: NoteValue['division']): string {
  if (division === '1') return CONTENT['ui.noteValue.bar'].human;
  if (division === '2' || division === '4') return fill('ui.noteValue.bars', { n: division });
  return fill('ui.noteValue.fraction', { n: division.slice(2) }); // '1/8' -> '8'
}

/** Straight takes no suffix, so the result never has a trailing space. */
export function formatNoteValue(nv: NoteValue): string {
  const note = formatDivision(nv.division);
  if (nv.modifier === 'straight') return note;
  const modifier = optionsRecord('ui.noteValue.modifier')[nv.modifier].humanLabel;
  return fill('ui.noteValue.modified', { note, modifier });
}
