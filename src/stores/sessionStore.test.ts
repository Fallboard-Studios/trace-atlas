import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { useSessionStore, isWorldDirty, isPayloadDirty, nextSaveName } from './sessionStore';
import { useAudioStore } from './audioStore';
import { listSessions, loadSession, saveNamedSession } from '../utils/sessionStorageEngine';
import { buildSessionPayload } from '../utils/sessionDiff';
import { generateCompanyName } from '../systems/spawnSystem';

/** The suggestion Math.random yields when every sample it takes returns `r`. */
const suggestionAt = (r: number) => generateCompanyName(() => r * 2 - 1, 0);

/** How many Math.random calls one suggestion makes (its noise map is Math.random, one call per sample), counted from
 *  the real name draw rather than written down, so a change in the even draw's sample count moves it too. */
const SAMPLES_PER_NAME = (() => {
  let samples = 0;
  generateCompanyName(() => { samples++; return 0; }, 0);
  return samples;
})();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sessionStore', () => {
  it('has no viewingUnsavedHistory field or setViewingUnsavedHistory action (regression guard, cut feature)', () => {
    expect(useSessionStore.getState()).not.toHaveProperty('viewingUnsavedHistory');
    expect(useSessionStore.getState()).not.toHaveProperty('setViewingUnsavedHistory');
  });

  it('currentLoadedSessionName defaults to null on every fresh store creation', () => {
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });

  it('setCurrentLoadedSessionName sets the loaded name', () => {
    useSessionStore.getState().setCurrentLoadedSessionName('some-saved-session');
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('some-saved-session');
  });

  it('setCurrentLoadedSessionName accepts null to clear it back to unloaded', () => {
    useSessionStore.getState().setCurrentLoadedSessionName('some-saved-session');
    useSessionStore.getState().setCurrentLoadedSessionName(null);
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });

  it('the setter has no side effects beyond the store\'s own state (no AudioEngine or storage calls)', () => {
    localStorage.clear();
    expect(() => useSessionStore.getState().setCurrentLoadedSessionName('another-loaded')).not.toThrow();
    expect(listSessions()).toEqual([]);
  });
});

/*
 * The off screen's Save (docs/specs/OFF_SCREEN_CONSOLE.md §1.5): one button, no name field. nextSaveName is the name it
 * writes: the loaded save's when one is loaded, else a fresh "Adjective Noun" no save has. keepCurrentWorld(name) saves
 * the live world under it and marks it loaded. The session name the deleted name input held went at the console's code
 * review (2026-11-10): with no input, it only ever mirrored the loaded name or held a suggestion.
 */
describe('nextSaveName', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ currentLoadedSessionName: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('is the loaded save’s name when one is loaded, trimmed', () => {
    useSessionStore.setState({ currentLoadedSessionName: '  Dusk Run  ' });
    expect(nextSaveName()).toBe('Dusk Run');
  });

  it('with nothing loaded, is a fresh "Adjective Noun" (two capitalised words)', () => {
    expect(nextSaveName()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('a blank loaded name falls back to a fresh one: never an unnamed row', () => {
    useSessionStore.setState({ currentLoadedSessionName: '   ' });
    expect(nextSaveName()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R6: with nothing loaded, Save writes a new row, never over another save.
  it('skips a suggestion that names a save: the next one that names none is used', () => {
    const taken = suggestionAt(0);
    const free = suggestionAt(0.99);
    expect(free).not.toBe(taken); // precondition
    saveNamedSession(taken, buildSessionPayload());
    // The first name's samples land on the taken one; every later sample on the free one.
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < SAMPLES_PER_NAME; i++) random.mockReturnValueOnce(0);
    random.mockReturnValue(0.99);
    expect(nextSaveName()).toBe(free);
  });

  it('when every draw names a save, the suggestion is numbered: " 2", then " 3"', () => {
    const taken = suggestionAt(0);
    saveNamedSession(taken, buildSessionPayload());
    vi.spyOn(Math, 'random').mockReturnValue(0); // every suggestion is the taken name
    expect(nextSaveName()).toBe(taken + ' 2');
    saveNamedSession(taken + ' 2', buildSessionPayload());
    expect(nextSaveName()).toBe(taken + ' 3');
  });

  it('with a save loaded, is that save’s name even when other saves exist', () => {
    saveNamedSession('Dusk Run', buildSessionPayload());
    saveNamedSession('Quiet Harbour', buildSessionPayload());
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    expect(nextSaveName()).toBe('Dusk Run');
  });
});

describe('keepCurrentWorld', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ currentLoadedSessionName: null });
  });

  it('saves the live world under the name it is given and marks it loaded', () => {
    useSessionStore.getState().keepCurrentWorld('Quiet Harbour');
    expect(listSessions().map((s) => s.name)).toEqual(['Quiet Harbour']);
    expect(loadSession('Quiet Harbour')).toEqual(JSON.parse(JSON.stringify(buildSessionPayload())));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Quiet Harbour');
  });

  it('over the loaded save, overwrites that row rather than adding one, leaving other saves alone', () => {
    saveNamedSession('Dusk Run', { ...buildSessionPayload(), swellFrequency: 1 });
    saveNamedSession('Quiet Harbour', { ...buildSessionPayload(), swellFrequency: 2 });
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    useSessionStore.getState().keepCurrentWorld(nextSaveName());
    expect(loadSession('Dusk Run')?.swellFrequency).toBe(buildSessionPayload().swellFrequency);
    expect(loadSession('Quiet Harbour')?.swellFrequency).toBe(2);
    expect(listSessions()).toHaveLength(2);
  });

  it('saving twice with nothing loaded at first writes one row, not two', () => {
    useSessionStore.getState().keepCurrentWorld(nextSaveName());
    useSessionStore.getState().keepCurrentWorld(nextSaveName());
    expect(listSessions()).toHaveLength(1);
  });

  it('a storage that refuses the write throws, and the loaded name stays as it was', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => useSessionStore.getState().keepCurrentWorld('Quiet Harbour')).toThrow();
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('isWorldDirty', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ currentLoadedSessionName: null });
  });

  it('is true when no save is loaded: a world that came from a seed, a preset or a link is not kept yet', () => {
    expect(isWorldDirty()).toBe(true);
  });

  it('is false right after a keep — the stored payload equals the live world after both sides are normalised', () => {
    useSessionStore.getState().keepCurrentWorld(nextSaveName());
    expect(isWorldDirty()).toBe(false);
  });

  it('is true once the world changes after a keep, and false again after keeping again', () => {
    useSessionStore.getState().keepCurrentWorld(nextSaveName());
    useAudioStore.setState({ swellFrequency: useAudioStore.getState().swellFrequency + 1 });
    expect(isWorldDirty()).toBe(true);
    useSessionStore.getState().keepCurrentWorld(nextSaveName());
    expect(isWorldDirty()).toBe(false);
  });

  it('is false for a loaded save that equals the live world, whoever wrote it', () => {
    saveNamedSession('Dusk Run', buildSessionPayload());
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    expect(isWorldDirty()).toBe(false);
  });

  it('is true when the loaded save differs from the live world', () => {
    saveNamedSession('Dusk Run', { ...buildSessionPayload(), swellFrequency: 1 });
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    expect(isWorldDirty()).toBe(true);
  });

  it('is true when the loaded name no longer exists in storage (a Factory Reset)', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Ghost' });
    expect(isWorldDirty()).toBe(true);
  });
});

/* isPayloadDirty is isWorldDirty for any payload and name (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.4). */
describe('isPayloadDirty', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ currentLoadedSessionName: null });
  });

  it('is false for a payload equal to its stored save, after both sides are normalised', () => {
    const payload = { ...buildSessionPayload(), swellFrequency: 3 };
    saveNamedSession('Dusk Run', payload);
    expect(isPayloadDirty(payload, 'Dusk Run')).toBe(false);
  });

  it('is true for a payload that differs from its stored save, though the live world equals it', () => {
    saveNamedSession('Dusk Run', buildSessionPayload());
    expect(isPayloadDirty({ ...buildSessionPayload(), swellFrequency: (buildSessionPayload().swellFrequency ?? 0) + 10 }, 'Dusk Run')).toBe(true);
  });

  it('is true for a null name, and for a name with no save', () => {
    expect(isPayloadDirty(buildSessionPayload(), null)).toBe(true);
    expect(isPayloadDirty(buildSessionPayload(), 'Ghost')).toBe(true);
  });

  it('agrees with isWorldDirty for the live payload and the loaded name', () => {
    saveNamedSession('Dusk Run', buildSessionPayload());
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    expect(isPayloadDirty(buildSessionPayload(), 'Dusk Run')).toBe(isWorldDirty());
    useAudioStore.setState({ swellFrequency: useAudioStore.getState().swellFrequency + 1 });
    expect(isPayloadDirty(buildSessionPayload(), 'Dusk Run')).toBe(isWorldDirty());
    expect(isWorldDirty()).toBe(true);
  });
});
