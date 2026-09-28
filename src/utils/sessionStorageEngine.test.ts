import { describe, it, expect, beforeEach } from 'vitest';

import {
  saveNamedSession,
  saveAutosaveSlot,
  deleteNamedSession,
  listSessions,
  loadSession,
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
