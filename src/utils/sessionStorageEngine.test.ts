import { describe, it, expect, beforeEach } from 'vitest';

import {
  saveNamedSession,
  deleteNamedSession,
  listSessions,
  loadSession,
  renameNamedSession,
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

describe('renameNamedSession (off-screen console Task 1)', () => {
  /** Seeds entries straight into storage with an old `savedAt`, so a rename that stamps
   *  `Date.now()` shows. */
  function seed(entries: Record<string, { savedAt: number; payload: SessionPayload }>): void {
    const named = Object.fromEntries(
      Object.entries(entries).map(([name, e]) => [name, { name, savedAt: e.savedAt, payload: e.payload }]),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ named }));
  }

  it('re-keys the entry under the new name, keeping savedAt and payload and updating name', () => {
    const payload = makePayload({ attenuationStyleName: 'Old Style', coordinates: { x: 3, y: -4 } });
    seed({ old: { savedAt: 1234, payload } });

    expect(renameNamedSession('old', 'new')).toBe(true);

    expect(listSessions()).toEqual([{ name: 'new', savedAt: 1234, payload }]);
    expect(loadSession('old')).toBeUndefined();
    expect(loadSession('new')).toEqual(payload);
  });

  it('leaves every other entry as it was', () => {
    const other = makePayload({ attenuationStyleName: 'Other' });
    seed({ old: { savedAt: 1, payload: makePayload() }, other: { savedAt: 2, payload: other } });

    renameNamedSession('old', 'new');

    expect(listSessions().find((e) => e.name === 'other')).toEqual({ name: 'other', savedAt: 2, payload: other });
    expect(listSessions().map((e) => e.name).sort()).toEqual(['new', 'other']);
  });

  it('returns false and writes nothing when the old name has no entry', () => {
    seed({ kept: { savedAt: 5, payload: makePayload() } });
    const before = localStorage.getItem(STORAGE_KEY);

    expect(renameNamedSession('missing', 'new')).toBe(false);

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(loadSession('new')).toBeUndefined();
  });

  it('returns false and writes nothing when the new name is taken, both entries unchanged', () => {
    const fromPayload = makePayload({ attenuationStyleName: 'From' });
    const takenPayload = makePayload({ attenuationStyleName: 'Taken' });
    seed({ from: { savedAt: 10, payload: fromPayload }, taken: { savedAt: 20, payload: takenPayload } });
    const before = localStorage.getItem(STORAGE_KEY);

    expect(renameNamedSession('from', 'taken')).toBe(false);

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(loadSession('from')).toEqual(fromPayload);
    expect(loadSession('taken')).toEqual(takenPayload);
  });

  it('returns false and writes nothing when the new name is the old name', () => {
    seed({ same: { savedAt: 7, payload: makePayload() } });
    const before = localStorage.getItem(STORAGE_KEY);

    expect(renameNamedSession('same', 'same')).toBe(false);

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('treats names that match Object prototype keys as plain names', () => {
    const payload = makePayload();
    seed({ old: { savedAt: 3, payload } });

    expect(renameNamedSession('constructor', 'other')).toBe(false);
    expect(renameNamedSession('old', 'toString')).toBe(true);

    expect(listSessions()).toEqual([{ name: 'toString', savedAt: 3, payload }]);
  });

  it('returns false and leaves corrupted storage alone, never throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');

    expect(() => renameNamedSession('old', 'new')).not.toThrow();
    expect(renameNamedSession('old', 'new')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not valid json');
  });
});

describe('storage shape (regression guard, cut autosave-history feature)', () => {
  it('the persisted blob has exactly one top-level key, "named" -- no autosave-history fields', () => {
    saveNamedSession('foo', makePayload());

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(Object.keys(raw)).toEqual(['named']);
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

describe('leftover autosave-history data from before this phase does not throw (regression guard, cut feature)', () => {
  it('ignores namedAutosaves/unsavedCurrent/unsavedLast keys left over from a dev build of the now-cut autosave-history feature', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        named: { foo: { name: 'foo', savedAt: 1, payload: makePayload() } },
        namedAutosaves: { foo: [{ name: 'foo', savedAt: 2, payload: makePayload() }] },
        unsavedCurrent: [{ name: '__last-unsaved-session__', savedAt: 3, payload: makePayload() }],
        unsavedLast: [{ name: '__last-unsaved-session__', savedAt: 4, payload: makePayload() }],
      }),
    );

    expect(() => listSessions()).not.toThrow();
    expect(listSessions().map((e) => e.name)).toEqual(['foo']);
  });

  it('parses storage with only the pre-Phase-20 old autosave/nextRotatingIndex keys without throwing', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ named: {}, autosave: { draft: { name: 'draft', savedAt: 1, payload: makePayload() } }, nextRotatingIndex: 0 }),
    );

    expect(() => listSessions()).not.toThrow();
    expect(listSessions()).toEqual([]);
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
