import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { useSessionStore, isWorldDirty } from './sessionStore';
import { useAudioStore } from './audioStore';
import { listSessions, loadSession, saveNamedSession } from '../utils/sessionStorageEngine';
import { buildSessionPayload } from '../utils/sessionDiff';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sessionStore', () => {
  it('has no viewingUnsavedHistory field or setViewingUnsavedHistory action (regression guard, cut feature)', () => {
    expect(useSessionStore.getState()).not.toHaveProperty('viewingUnsavedHistory');
    expect(useSessionStore.getState()).not.toHaveProperty('setViewingUnsavedHistory');
  });

  it('currentSessionName is a non-empty generated name on store creation', () => {
    expect(useSessionStore.getState().currentSessionName).toEqual(expect.any(String));
    expect(useSessionStore.getState().currentSessionName.length).toBeGreaterThan(0);
  });

  it('currentSessionName looks like the "Adjective Noun" word-list shape (two capitalized words)', () => {
    expect(useSessionStore.getState().currentSessionName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('currentLoadedSessionName defaults to null on every fresh store creation', () => {
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });

  it('setCurrentSessionName updates only currentSessionName', () => {
    const before = useSessionStore.getState().currentLoadedSessionName;
    useSessionStore.getState().setCurrentSessionName('My Custom Name');
    expect(useSessionStore.getState().currentSessionName).toBe('My Custom Name');
    expect(useSessionStore.getState().currentLoadedSessionName).toBe(before);
  });

  it('setCurrentLoadedSessionName updates only currentLoadedSessionName', () => {
    const before = useSessionStore.getState().currentSessionName;
    useSessionStore.getState().setCurrentLoadedSessionName('some-saved-session');
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('some-saved-session');
    expect(useSessionStore.getState().currentSessionName).toBe(before);
  });

  it('setCurrentLoadedSessionName accepts null to clear it back to unloaded', () => {
    useSessionStore.getState().setCurrentLoadedSessionName('some-saved-session');
    useSessionStore.getState().setCurrentLoadedSessionName(null);
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });

  it('the two setters have no side effects beyond the store\'s own state (no AudioEngine or storage calls)', () => {
    // Nothing to spy on directly: calling the setters doesn't throw or touch anything requiring a
    // browser API this test environment lacks, and storage stays as it was.
    localStorage.clear();
    expect(() => {
      useSessionStore.getState().setCurrentSessionName('Another Name');
      useSessionStore.getState().setCurrentLoadedSessionName('another-loaded');
    }).not.toThrow();
    expect(listSessions()).toEqual([]);
  });
});

/*
 * Keep (docs/tasks/OFF_SCREEN.md Task 14, spec assumption 14): one button, no name field. keepCurrentWorld saves the
 * live world under the loaded save's name when one is loaded, else under the suggestion the Comms Save already
 * proposes, marks it loaded and returns the name. isWorldDirty is what dims Keep: false only when the loaded save's
 * stored payload equals the live world now — both sides normalised, so an untouched reload reads clean.
 */
describe('keepCurrentWorld', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ currentSessionName: 'Quiet Harbour', currentLoadedSessionName: null });
  });

  it('saves the live world under the suggested name when no save is loaded, marks it loaded, and returns the name', () => {
    const name = useSessionStore.getState().keepCurrentWorld();
    expect(name).toBe('Quiet Harbour');
    expect(listSessions().map((s) => s.name)).toEqual(['Quiet Harbour']);
    expect(loadSession('Quiet Harbour')).toEqual(JSON.parse(JSON.stringify(buildSessionPayload())));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Quiet Harbour');
    expect(useSessionStore.getState().currentSessionName).toBe('Quiet Harbour');
  });

  it('saves under the loaded name when one is loaded — overwriting that row, not adding one — and ignores the suggestion', () => {
    saveNamedSession('Dusk Run', { ...buildSessionPayload(), swellFrequency: 1 });
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    const name = useSessionStore.getState().keepCurrentWorld();
    expect(name).toBe('Dusk Run');
    expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
    expect(loadSession('Dusk Run')?.swellFrequency).toBe(buildSessionPayload().swellFrequency);
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
  });

  it('keeping twice writes one row, not two', () => {
    useSessionStore.getState().keepCurrentWorld();
    useSessionStore.getState().keepCurrentWorld();
    expect(listSessions()).toHaveLength(1);
  });

  it('trims the name, and a blank suggestion (emptied in Comms) falls back to a fresh generated one — never an unnamed row', () => {
    useSessionStore.setState({ currentSessionName: '  Quiet Harbour  ' });
    expect(useSessionStore.getState().keepCurrentWorld()).toBe('Quiet Harbour');
    localStorage.clear();
    useSessionStore.setState({ currentSessionName: '   ', currentLoadedSessionName: null });
    const name = useSessionStore.getState().keepCurrentWorld();
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(listSessions().map((s) => s.name)).toEqual([name]);
  });
});

describe('detachLoadedSession', () => {
  beforeEach(() => {
    useSessionStore.setState({ currentSessionName: 'Dusk Run', currentLoadedSessionName: 'Dusk Run' });
  });

  it("forgets the loaded save and, when the name input still carries that save's name, suggests afresh", () => {
    useSessionStore.getState().detachLoadedSession();
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(useSessionStore.getState().currentSessionName).not.toBe('Dusk Run');
    expect(useSessionStore.getState().currentSessionName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('leaves a name the user typed alone', () => {
    useSessionStore.setState({ currentSessionName: 'My Own Name' });
    useSessionStore.getState().detachLoadedSession();
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(useSessionStore.getState().currentSessionName).toBe('My Own Name');
  });

  it('is a no-op when nothing is loaded', () => {
    useSessionStore.setState({ currentSessionName: 'Quiet Harbour', currentLoadedSessionName: null });
    useSessionStore.getState().detachLoadedSession();
    expect(useSessionStore.getState().currentSessionName).toBe('Quiet Harbour');
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });
});

describe('isWorldDirty', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ currentSessionName: 'Quiet Harbour', currentLoadedSessionName: null });
  });

  it('is true when no save is loaded: a world that came from a seed, a preset or a link is not kept yet', () => {
    expect(isWorldDirty()).toBe(true);
  });

  it('is false right after a keep — the stored payload equals the live world after both sides are normalised', () => {
    useSessionStore.getState().keepCurrentWorld();
    expect(isWorldDirty()).toBe(false);
  });

  it('is true once the world changes after a keep, and false again after keeping again', () => {
    useSessionStore.getState().keepCurrentWorld();
    useAudioStore.setState({ swellFrequency: useAudioStore.getState().swellFrequency + 1 });
    expect(isWorldDirty()).toBe(true);
    useSessionStore.getState().keepCurrentWorld();
    expect(isWorldDirty()).toBe(false);
  });

  it('is false for a loaded save that equals the live world, even one written by the Comms Save path', () => {
    saveNamedSession('Dusk Run', buildSessionPayload());
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    expect(isWorldDirty()).toBe(false);
  });

  it('is true when the loaded save differs from the live world', () => {
    saveNamedSession('Dusk Run', { ...buildSessionPayload(), swellFrequency: 1 });
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    expect(isWorldDirty()).toBe(true);
  });

  it('is true when the loaded name no longer exists in storage (deleted in Comms, or a Factory Reset)', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Ghost' });
    expect(isWorldDirty()).toBe(true);
  });
});
