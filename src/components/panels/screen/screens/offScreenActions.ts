// The off screen's action row (docs/specs/OFF_SCREEN_CONSOLE.md §1.5, §4): which of Save, Rename and Delete act on the
// selected row. A pure function of the row, its dirty read and the waiting change, so the table is pinned directly
// (offScreenActions.test.ts) and OffScreen.tsx only reads it. True is enabled; an inert button is dimmed in place.

/** What the selected row is: Current, a save, or New Transmission (the editor's pick). The presets went at
 *  docs/tasks/OFF_SCREEN_CONSOLE.md's Checkpoint A. */
export type ActionRowKind = 'current' | 'save' | 'new';

export interface ActionRow {
  save: boolean;
  rename: boolean;
  delete: boolean;
}

/**
 * The dim matrix. `dirty` is the selected row's: Current's against its save, or the live world's against the selected
 * save (New Transmission is always savable, as a fresh save). `waiting` is a change under the wash: the
 * rows show a world that is not yet live, so nothing acts on it.
 */
export function actionRow(kind: ActionRowKind, dirty: boolean, waiting: boolean): ActionRow {
  if (waiting) return { save: false, rename: false, delete: false };
  const isSave = kind === 'save';
  return {
    save: kind === 'new' || dirty,
    rename: isSave,
    delete: isSave,
  };
}
