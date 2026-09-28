import { describe, it, expect } from 'vitest';

import { isAutosaveSlotName, AUTOSAVE_ROTATING_SLOT_IDS } from './session';

describe('isAutosaveSlotName', () => {
  it('is true for every rotating slot id', () => {
    for (const id of AUTOSAVE_ROTATING_SLOT_IDS) expect(isAutosaveSlotName(id)).toBe(true);
  });

  it('is true for the draft slot', () => {
    expect(isAutosaveSlotName('draft')).toBe(true);
  });

  it('is false for a user-chosen saved name', () => {
    expect(isAutosaveSlotName('My Cool Session')).toBe(false);
  });

  it('is false for a name that merely starts with "unsaved-" but isn\'t an exact slot id', () => {
    expect(isAutosaveSlotName('unsaved-99')).toBe(false);
  });
});
