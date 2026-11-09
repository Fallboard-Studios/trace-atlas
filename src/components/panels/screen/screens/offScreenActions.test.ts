import { describe, it, expect } from 'vitest';

/*
 * docs/tasks/OFF_SCREEN_CONSOLE.md Task 7 (spec §1.5, §4): the action row's dim matrix — which of Save, Rename,
 * Delete and Share (in the row since Checkpoint A, lit whenever no change waits) act on the selected row, as one pure
 * function, so the table is pinned here row by row.
 */
import { actionRow, type ActionRowKind } from './offScreenActions';

const KINDS: ActionRowKind[] = ['current', 'save', 'preset', 'new'];

describe('actionRow (spec §1.5)', () => {
  it('Current: Save while it is unsaved, never Rename or Delete', () => {
    expect(actionRow('current', true, false)).toEqual({
      save: true,
      rename: false,
      delete: false,
      share: true,
    });
    expect(actionRow('current', false, false)).toEqual({
      save: false,
      rename: false,
      delete: false,
      share: true,
    });
  });

  it('a save: Save while the live world differs from it; Rename and Delete always', () => {
    expect(actionRow('save', true, false)).toEqual({
      save: true,
      rename: true,
      delete: true,
      share: true,
    });
    expect(actionRow('save', false, false)).toEqual({
      save: false,
      rename: true,
      delete: true,
      share: true,
    });
  });

  it('a preset: Save always, as a fresh save; no Rename or Delete, it is no save', () => {
    expect(actionRow('preset', true, false)).toEqual({
      save: true,
      rename: false,
      delete: false,
      share: true,
    });
    expect(actionRow('preset', false, false)).toEqual({
      save: true,
      rename: false,
      delete: false,
      share: true,
    });
  });

  it('New Transmission: the same as a preset', () => {
    expect(actionRow('new', true, false)).toEqual({
      save: true,
      rename: false,
      delete: false,
      share: true,
    });
    expect(actionRow('new', false, false)).toEqual({
      save: true,
      rename: false,
      delete: false,
      share: true,
    });
  });

  it('while a change waits under the wash, all four are dimmed, whatever the row and the dirty read', () => {
    for (const kind of KINDS) {
      for (const dirty of [true, false]) {
        expect(actionRow(kind, dirty, true)).toEqual({
          save: false,
          rename: false,
          delete: false,
          share: false,
        });
      }
    }
  });
});
