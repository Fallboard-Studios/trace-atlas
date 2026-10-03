/**
 * formatNoteValue — the readout for a Sync-mode slider stop (docs/specs/FREE_SYNC_TOGGLE.md §1.4/§1.9).
 * Every word comes from the content layer; the digits and the slash are data. Expected strings here are
 * built from CONTENT pieces, never retyped, so a copy edit can't break a test (and a word hardcoded in the
 * formatter can't hide behind one).
 */
import { describe, it, expect } from 'vitest';

import { formatNoteValue } from './formatNoteValue';
import { CONTENT } from '@/content';
import { NOTE_VALUES, type NoteDivision, type NoteModifier, type NoteValue } from '@/data/noteValues';

const nv = (division: NoteDivision, modifier: NoteModifier = 'straight'): NoteValue => ({ division, modifier });

const DOTTED = CONTENT['ui.noteValue.modifier'].options.dotted.human;
const TRIPLET = CONTENT['ui.noteValue.modifier'].options.triplet.human;
const ONE_BAR = CONTENT['ui.noteValue.bar'].human;
/** '{n} bars' with n filled — the multi-bar form, from the content template. */
const bars = (n: string) => CONTENT['ui.noteValue.bars'].template.replace('{n}', n);

describe('formatNoteValue — straight', () => {
  it('a fraction division reads as its fraction', () => {
    expect(formatNoteValue(nv('1/8'))).toBe('1/8');
    expect(formatNoteValue(nv('1/32'))).toBe('1/32');
    expect(formatNoteValue(nv('1/2'))).toBe('1/2');
  });

  it('one bar reads as the content\'s singular "1 bar"', () => {
    expect(formatNoteValue(nv('1'))).toBe(ONE_BAR);
  });

  it('two and four bars read through the plural template', () => {
    expect(formatNoteValue(nv('2'))).toBe(bars('2'));
    expect(formatNoteValue(nv('4'))).toBe(bars('4'));
  });

  it('a straight note carries no modifier word and no trailing space', () => {
    for (const division of ['1/32', '1/16', '1/8', '1/4', '1/2', '1', '2', '4'] as const) {
      const text = formatNoteValue(nv(division));
      expect(text).toBe(text.trim());
    }
  });
});

describe('formatNoteValue — dotted and triplet', () => {
  it('appends the modifier word to a fraction', () => {
    expect(formatNoteValue(nv('1/8', 'dotted'))).toBe(`1/8 ${DOTTED}`);
    expect(formatNoteValue(nv('1/4', 'triplet'))).toBe(`1/4 ${TRIPLET}`);
    expect(formatNoteValue(nv('1/32', 'triplet'))).toBe(`1/32 ${TRIPLET}`);
  });

  it('appends the modifier word to the singular bar — "1 bar dotted"', () => {
    expect(formatNoteValue(nv('1', 'dotted'))).toBe(`${ONE_BAR} ${DOTTED}`);
    expect(formatNoteValue(nv('1', 'triplet'))).toBe(`${ONE_BAR} ${TRIPLET}`);
  });

  it('dotted and triplet of the same division read differently', () => {
    expect(formatNoteValue(nv('1/16', 'dotted'))).not.toBe(formatNoteValue(nv('1/16', 'triplet')));
  });
});

describe('formatNoteValue — every table entry', () => {
  it('gives each of the 20 NOTE_VALUES a distinct, clean, non-empty readout', () => {
    const texts = NOTE_VALUES.map(formatNoteValue);

    expect(new Set(texts).size).toBe(NOTE_VALUES.length); // a slider stop must be tellable apart
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/undefined|null|NaN|[{}]/); // no unfilled slot or stringified hole
      expect(text).not.toMatch(/\s{2,}/); // no doubled spaces from an empty modifier
    }
  });
});

describe('formatNoteValue — reads the content layer, hardcodes no word', () => {
  /** Swap one content field for a sentinel, run `read`, and restore — proving the output follows the content. */
  function withContent<T>(key: keyof typeof CONTENT, field: 'human' | 'template', sentinel: string, read: () => T): T {
    const entry = CONTENT[key] as unknown as Record<string, string>;
    const original = entry[field];
    entry[field] = sentinel;
    try {
      return read();
    } finally {
      entry[field] = original;
    }
  }
  function withModifierWord(modifier: 'dotted' | 'triplet', sentinel: string, read: () => string): string {
    const option = CONTENT['ui.noteValue.modifier'].options[modifier] as unknown as { human: string };
    const original = option.human;
    option.human = sentinel;
    try {
      return read();
    } finally {
      option.human = original;
    }
  }

  it('the singular bar word is content\'s', () => {
    expect(withContent('ui.noteValue.bar', 'human', 'ONE-BAR-SENTINEL', () => formatNoteValue(nv('1')))).toBe('ONE-BAR-SENTINEL');
  });

  it('the plural bars template is content\'s', () => {
    expect(withContent('ui.noteValue.bars', 'template', 'BARS-{n}-SENTINEL', () => formatNoteValue(nv('4')))).toBe('BARS-4-SENTINEL');
  });

  it('the fraction template is content\'s', () => {
    expect(withContent('ui.noteValue.fraction', 'template', 'FRAC-{n}-SENTINEL', () => formatNoteValue(nv('1/16')))).toBe('FRAC-16-SENTINEL');
  });

  it('the dotted and triplet words are content\'s', () => {
    expect(withModifierWord('dotted', 'DOT-SENTINEL', () => formatNoteValue(nv('1/8', 'dotted')))).toBe('1/8 DOT-SENTINEL');
    expect(withModifierWord('triplet', 'TRI-SENTINEL', () => formatNoteValue(nv('1/8', 'triplet')))).toBe('1/8 TRI-SENTINEL');
  });

  it('the modified-note template decides the order and spacing of note and modifier', () => {
    const out = withContent('ui.noteValue.modified', 'template', '{modifier}~{note}', () => formatNoteValue(nv('1/8', 'dotted')));
    expect(out).toBe(`${DOTTED}~1/8`);
  });

  it('a straight note does not touch the modified-note template at all', () => {
    expect(withContent('ui.noteValue.modified', 'template', 'BROKEN-{note}-{modifier}', () => formatNoteValue(nv('1/8')))).toBe('1/8');
  });
});
