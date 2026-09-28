import { describe, it, expect, beforeEach } from 'vitest';

import {
  saveNamedSession,
  deleteNamedSession,
  listSessions,
  loadSession,
  saveNamedSessionAutosave,
  listNamedSessionAutosaves,
  saveUnsavedAutosave,
  promoteUnsavedHistoryOnBoot,
  listUnsavedLastAutosaves,
  deleteUnsavedHistory,
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

  it('loadSession returns undefined for a name that was never saved', () => {
    expect(loadSession('never-saved')).toBeUndefined();
  });
});

describe('listSessions', () => {
  it('returns only named entries', () => {
    saveNamedSession('my-save', makePayload());
    saveNamedSession('another-save', makePayload());

    const names = listSessions().map((e) => e.name).sort();
    expect(names).toEqual(['another-save', 'my-save']);
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

  it('when two autosaves share the exact same millisecond, the more-recently-written one still sorts first', () => {
    saveNamedSession('foo', makePayload());
    const realNow = Date.now;
    try {
      Date.now = () => 1000;
      saveNamedSessionAutosave('foo', makePayload({ coordinates: { x: 1, y: 1 } }));
      saveNamedSessionAutosave('foo', makePayload({ coordinates: { x: 2, y: 2 } }));
    } finally {
      Date.now = realNow;
    }

    const history = listNamedSessionAutosaves('foo');
    expect(history[0].payload.coordinates.x).toBe(2);
    expect(history[1].payload.coordinates.x).toBe(1);
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

describe('deleteUnsavedHistory', () => {
  it('clears the unsavedLast bucket entirely', () => {
    saveUnsavedAutosave(makePayload());
    promoteUnsavedHistoryOnBoot();
    expect(listUnsavedLastAutosaves().length).toBe(1);

    deleteUnsavedHistory();
    expect(listUnsavedLastAutosaves()).toEqual([]);
  });

  it('never touches any named session\'s own autosave history', () => {
    saveNamedSession('foo', makePayload());
    saveNamedSessionAutosave('foo', makePayload());
    saveUnsavedAutosave(makePayload());
    promoteUnsavedHistoryOnBoot();

    deleteUnsavedHistory();

    expect(listNamedSessionAutosaves('foo').length).toBe(1);
  });

  it('is a harmless no-op when there is nothing to clear', () => {
    expect(() => deleteUnsavedHistory()).not.toThrow();
    expect(listUnsavedLastAutosaves()).toEqual([]);
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
