import { describe, it, expect, beforeEach } from 'vitest';

import { saveNamedSession, deleteNamedSession, listSessions, loadSession, STORAGE_KEY } from './sessionStorageEngine';
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
