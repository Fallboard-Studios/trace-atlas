import { describe, it, expect, beforeEach } from 'vitest';

import {
  saveNamedSession,
  saveAutosaveSlot,
  deleteNamedSession,
  deleteAutosaveSlot,
  listSessions,
  loadSession,
  saveNamedSessionAutosave,
  listNamedSessionAutosaves,
  saveUnsavedAutosave,
  promoteUnsavedHistoryOnBoot,
  listUnsavedLastAutosaves,
  STORAGE_KEY,
} from './sessionStorageEngine';
import type { SessionPayload } from '../types/session';

function makePayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    version: 1,
    attenuationStyleName: 'Test Style',
    coordinates: { x: 0, y: 0 },
    globalAudio: {} as SessionPayload['globalAudio'],
    robotOverrides: {},
    companyDiffs: {},
    userCreatedCompanies: [],
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('saveNamedSession / loadSession / deleteNamedSession', () => {
  it('saving under a new name creates a retrievable entry', () => {
    const payload = makePayload();
    saveNamedSession('foo', payload);
    expect(loadSession('foo')).toEqual(payload);
  });

  it('saving under an existing name overwrites it in place, leaving exactly one entry', () => {
    saveNamedSession('foo', makePayload({ coordinates: { x: 1, y: 1 } }));
    saveNamedSession('foo', makePayload({ coordinates: { x: 2, y: 2 } }));

    expect(loadSession('foo')).toEqual(makePayload({ coordinates: { x: 2, y: 2 } }));
    const names = listSessions().filter((e) => e.name === 'foo');
    expect(names.length).toBe(1);
  });

  it('saving under a second name leaves both entries intact', () => {
    saveNamedSession('foo', makePayload());
    saveNamedSession('bar', makePayload({ attenuationStyleName: 'Bar Style' }));

    expect(loadSession('foo')?.attenuationStyleName).toBe('Test Style');
    expect(loadSession('bar')?.attenuationStyleName).toBe('Bar Style');
    expect(listSessions().map((e) => e.name).sort()).toEqual(['bar', 'foo']);
  });

  it('deleteNamedSession removes only that entry', () => {
    saveNamedSession('foo', makePayload());
    saveNamedSession('bar', makePayload());
    deleteNamedSession('foo');

    expect(loadSession('foo')).toBeUndefined();
    expect(loadSession('bar')).toBeDefined();
  });

  it('deleteNamedSession never touches an autosave slot of the same name', () => {
    saveAutosaveSlot('draft', makePayload({ attenuationStyleName: 'Draft Style' }));
    saveNamedSession('draft', makePayload({ attenuationStyleName: 'Named Style' }));
    deleteNamedSession('draft');

    expect(loadSession('draft')).toEqual(makePayload({ attenuationStyleName: 'Draft Style' }));
  });

  it('loadSession returns undefined for a name that was never saved', () => {
    expect(loadSession('never-saved')).toBeUndefined();
  });
});

describe('deleteAutosaveSlot', () => {
  it('removes a rotating slot', () => {
    saveAutosaveSlot('rotating', makePayload());
    deleteAutosaveSlot('unsaved-0');

    expect(loadSession('unsaved-0')).toBeUndefined();
  });

  it('removes the draft slot', () => {
    saveAutosaveSlot('draft', makePayload());
    deleteAutosaveSlot('draft');

    expect(loadSession('draft')).toBeUndefined();
  });

  it('never touches a named entry, even one sharing the same slot-id-shaped string', () => {
    saveAutosaveSlot('draft', makePayload({ attenuationStyleName: 'Draft Style' }));
    saveNamedSession('draft', makePayload({ attenuationStyleName: 'Named Style' }));
    deleteAutosaveSlot('draft');

    expect(loadSession('draft')).toEqual(makePayload({ attenuationStyleName: 'Named Style' }));
  });

  it('never touches other populated autosave slots', () => {
    for (let i = 0; i < 3; i++) saveAutosaveSlot('rotating', makePayload({ coordinates: { x: i, y: i } }));
    deleteAutosaveSlot('unsaved-1');

    expect(loadSession('unsaved-0')).toEqual(makePayload({ coordinates: { x: 0, y: 0 } }));
    expect(loadSession('unsaved-1')).toBeUndefined();
    expect(loadSession('unsaved-2')).toEqual(makePayload({ coordinates: { x: 2, y: 2 } }));
  });

  it('deleting an empty slot is a harmless no-op', () => {
    expect(() => deleteAutosaveSlot('unsaved-3')).not.toThrow();
    expect(loadSession('unsaved-3')).toBeUndefined();
  });

  it('a later rotating write can still land on a deleted slot once the FIFO cursor comes back around', () => {
    for (let i = 0; i < 5; i++) saveAutosaveSlot('rotating', makePayload({ coordinates: { x: i, y: i } }));
    deleteAutosaveSlot('unsaved-2');
    saveAutosaveSlot('rotating', makePayload({ coordinates: { x: 99, y: 99 } })); // wraps to slot 0

    expect(loadSession('unsaved-2')).toBeUndefined(); // cursor hasn't come back around to slot 2 yet
    expect(loadSession('unsaved-0')).toEqual(makePayload({ coordinates: { x: 99, y: 99 } }));
  });
});

describe('saveAutosaveSlot', () => {
  it('rotating mode fills all 5 slots across 5 calls, in order', () => {
    for (let i = 0; i < 5; i++) {
      saveAutosaveSlot('rotating', makePayload({ coordinates: { x: i, y: i } }));
    }
    const entries = listSessions().filter((e) => e.name.startsWith('unsaved-'));
    expect(entries.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(loadSession(`unsaved-${i}`)).toEqual(makePayload({ coordinates: { x: i, y: i } }));
    }
  });

  it('a 6th rotating write overwrites the oldest slot (slot 0), never touching a named entry', () => {
    saveNamedSession('keep-me', makePayload({ attenuationStyleName: 'Named' }));
    for (let i = 0; i < 6; i++) {
      saveAutosaveSlot('rotating', makePayload({ coordinates: { x: i, y: i } }));
    }
    expect(loadSession('unsaved-0')).toEqual(makePayload({ coordinates: { x: 5, y: 5 } }));
    expect(loadSession('unsaved-1')).toEqual(makePayload({ coordinates: { x: 1, y: 1 } }));
    expect(loadSession('unsaved-4')).toEqual(makePayload({ coordinates: { x: 4, y: 4 } }));
    expect(loadSession('keep-me')?.attenuationStyleName).toBe('Named');
  });

  it('the rotation cursor keeps advancing correctly across an 11th write (wraps twice)', () => {
    for (let i = 0; i < 11; i++) {
      saveAutosaveSlot('rotating', makePayload({ coordinates: { x: i, y: i } }));
    }
    // 11 writes, 5 slots: slot (11 % 5 =) 1 holds the most recent (i=10); slot 0 holds i=10-1=9's
    // predecessor cycle -- concretely: slots filled in order 0,1,2,3,4,0,1,2,3,4,0 -> slot 0 = i=10.
    expect(loadSession('unsaved-0')).toEqual(makePayload({ coordinates: { x: 10, y: 10 } }));
    expect(loadSession('unsaved-1')).toEqual(makePayload({ coordinates: { x: 6, y: 6 } }));
  });

  it('draft mode writes a single slot that a repeat call overwrites in place', () => {
    saveAutosaveSlot('draft', makePayload({ attenuationStyleName: 'First Draft' }));
    saveAutosaveSlot('draft', makePayload({ attenuationStyleName: 'Second Draft' }));

    expect(loadSession('draft')).toEqual(makePayload({ attenuationStyleName: 'Second Draft' }));
    expect(listSessions().filter((e) => e.name === 'draft').length).toBe(1);
  });

  it('draft and rotating writes never collide with each other', () => {
    saveAutosaveSlot('draft', makePayload({ attenuationStyleName: 'Draft' }));
    saveAutosaveSlot('rotating', makePayload({ attenuationStyleName: 'Rotating 0' }));

    expect(loadSession('draft')?.attenuationStyleName).toBe('Draft');
    expect(loadSession('unsaved-0')?.attenuationStyleName).toBe('Rotating 0');
  });
});

describe('listSessions', () => {
  it('returns both named entries and populated autosave slots', () => {
    saveNamedSession('my-save', makePayload());
    saveAutosaveSlot('rotating', makePayload());
    saveAutosaveSlot('draft', makePayload());

    const names = listSessions().map((e) => e.name).sort();
    expect(names).toEqual(['draft', 'my-save', 'unsaved-0']);
  });

  it('returns an empty array when nothing has been saved', () => {
    expect(listSessions()).toEqual([]);
  });
});

describe('saveNamedSessionAutosave / listNamedSessionAutosaves', () => {
  it('a 4th autosave for a session evicts the oldest, leaving exactly 3', () => {
    saveNamedSession('foo', makePayload());
    for (let i = 0; i < 4; i++) {
      saveNamedSessionAutosave('foo', makePayload({ coordinates: { x: i, y: i } }));
    }
    const history = listNamedSessionAutosaves('foo');
    expect(history.length).toBe(3);
    expect(history.map((e) => e.payload.coordinates.x).sort()).toEqual([1, 2, 3]);
  });

  it("writing one session's autosaves never touches a different session's history", () => {
    saveNamedSession('foo', makePayload());
    saveNamedSession('bar', makePayload());
    for (let i = 0; i < 4; i++) saveNamedSessionAutosave('foo', makePayload({ coordinates: { x: i, y: i } }));
    saveNamedSessionAutosave('bar', makePayload({ coordinates: { x: 99, y: 99 } }));

    expect(listNamedSessionAutosaves('bar').length).toBe(1);
    expect(listNamedSessionAutosaves('bar')[0].payload.coordinates.x).toBe(99);
  });

  it('listNamedSessionAutosaves returns [] for a session with no autosave history', () => {
    saveNamedSession('foo', makePayload());
    expect(listNamedSessionAutosaves('foo')).toEqual([]);
  });

  it('listNamedSessionAutosaves sorts newest first by savedAt', () => {
    saveNamedSession('foo', makePayload());
    saveNamedSessionAutosave('foo', makePayload({ coordinates: { x: 1, y: 1 } }));
    saveNamedSessionAutosave('foo', makePayload({ coordinates: { x: 2, y: 2 } }));

    const history = listNamedSessionAutosaves('foo');
    expect(history[0].savedAt).toBeGreaterThanOrEqual(history[1].savedAt);
  });
});

describe('deleteNamedSession cascades to its autosave history', () => {
  it('deleting a named session removes both the entry and its own autosave history', () => {
    saveNamedSession('foo', makePayload());
    saveNamedSessionAutosave('foo', makePayload());
    saveNamedSessionAutosave('foo', makePayload());

    deleteNamedSession('foo');

    expect(loadSession('foo')).toBeUndefined();
    expect(listNamedSessionAutosaves('foo')).toEqual([]);
  });

  it('deleting one session leaves a different session\'s own autosave history untouched', () => {
    saveNamedSession('foo', makePayload());
    saveNamedSession('bar', makePayload());
    saveNamedSessionAutosave('bar', makePayload({ coordinates: { x: 5, y: 5 } }));

    deleteNamedSession('foo');

    expect(listNamedSessionAutosaves('bar').length).toBe(1);
  });
});

describe('saveUnsavedAutosave / promoteUnsavedHistoryOnBoot / listUnsavedLastAutosaves', () => {
  it('a 4th unsaved autosave evicts the oldest from the current bucket, leaving exactly 3', () => {
    for (let i = 0; i < 4; i++) saveUnsavedAutosave(makePayload({ coordinates: { x: i, y: i } }));
    promoteUnsavedHistoryOnBoot();

    const history = listUnsavedLastAutosaves();
    expect(history.length).toBe(3);
    expect(history.map((e) => e.payload.coordinates.x).sort()).toEqual([1, 2, 3]);
  });

  it('listUnsavedLastAutosaves is empty until a boot promotion has happened', () => {
    saveUnsavedAutosave(makePayload());
    expect(listUnsavedLastAutosaves()).toEqual([]);
  });

  it('promotion overwrites whatever "last" held before, rather than merging', () => {
    saveUnsavedAutosave(makePayload({ coordinates: { x: 1, y: 1 } }));
    promoteUnsavedHistoryOnBoot(); // "last" now holds x:1

    saveUnsavedAutosave(makePayload({ coordinates: { x: 2, y: 2 } }));
    promoteUnsavedHistoryOnBoot(); // "last" should now hold only x:2, not both

    const history = listUnsavedLastAutosaves();
    expect(history.length).toBe(1);
    expect(history[0].payload.coordinates.x).toBe(2);
  });

  it('promotion empties the "current" bucket afterward', () => {
    saveUnsavedAutosave(makePayload());
    promoteUnsavedHistoryOnBoot();
    promoteUnsavedHistoryOnBoot(); // a second promotion with nothing new written should clear "last"

    expect(listUnsavedLastAutosaves()).toEqual([]);
  });

  it('named-session autosaves and unsaved autosaves never collide with each other', () => {
    saveNamedSession('foo', makePayload());
    saveNamedSessionAutosave('foo', makePayload({ coordinates: { x: 1, y: 1 } }));
    saveUnsavedAutosave(makePayload({ coordinates: { x: 2, y: 2 } }));
    promoteUnsavedHistoryOnBoot();

    expect(listNamedSessionAutosaves('foo').length).toBe(1);
    expect(listUnsavedLastAutosaves().length).toBe(1);
  });
});

describe('listSessions no longer mixes in autosave-shaped entries', () => {
  it('returns only named entries, even when autosave history exists', () => {
    saveNamedSession('foo', makePayload());
    saveNamedSessionAutosave('foo', makePayload());
    saveUnsavedAutosave(makePayload());
    promoteUnsavedHistoryOnBoot();

    expect(listSessions().map((e) => e.name)).toEqual(['foo']);
  });
});

describe('old-shape data from before this phase does not throw', () => {
  it('parses storage with only the old autosave/nextRotatingIndex keys without throwing', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ named: {}, autosave: { draft: { name: 'draft', savedAt: 1, payload: makePayload() } }, nextRotatingIndex: 0 }),
    );

    expect(() => listSessions()).not.toThrow();
    expect(() => listNamedSessionAutosaves('foo')).not.toThrow();
    expect(listUnsavedLastAutosaves()).toEqual([]);
  });
});

describe('fail-soft on corrupted storage', () => {
  it('listSessions returns [] and loadSession returns undefined when the stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');

    expect(() => listSessions()).not.toThrow();
    expect(listSessions()).toEqual([]);
    expect(() => loadSession('anything')).not.toThrow();
    expect(loadSession('anything')).toBeUndefined();
  });

  it('saving after corrupted storage recovers cleanly (does not throw, starts a fresh valid store)', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(() => saveNamedSession('foo', makePayload())).not.toThrow();
    expect(loadSession('foo')).toEqual(makePayload());
  });
});
