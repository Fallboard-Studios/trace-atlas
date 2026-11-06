import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { useSessionStore, isWorldDirty, isPayloadDirty } from './sessionStore';
import { useAudioStore } from './audioStore';
import { listSessions, loadSession, saveNamedSession } from '../utils/sessionStorageEngine';
import { buildSessionPayload } from '../utils/sessionDiff';
import { generateCompanyName } from '../systems/spawnSystem';

/** The suggestion Math.random yields when both its draws (the adjective, then the noun) return `r`. */
const suggestionAt = (r: number) => generateCompanyName(() => r * 2 - 1, 0);

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

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R6: with nothing loaded, Keep writes a new row. The name the session carries
  // (a suggestion, or a name typed in Comms) can already belong to a save, and that save is never overwritten.
  describe('never overwrites a save that is not the loaded one (review R6)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('with a save already named as the session and nothing loaded, Keep writes a new row and leaves that save untouched', () => {
      const other = { ...buildSessionPayload(), swellFrequency: 1 };
      saveNamedSession('Quiet Harbour', other);
      const savedAt = listSessions()[0].savedAt;

      const name = useSessionStore.getState().keepCurrentWorld();

      expect(name).not.toBe('Quiet Harbour');
      expect(loadSession('Quiet Harbour')).toEqual(JSON.parse(JSON.stringify(other)));
      expect(listSessions().find((s) => s.name === 'Quiet Harbour')?.savedAt).toBe(savedAt);
      expect(listSessions().map((s) => s.name).sort()).toEqual(['Quiet Harbour', name].sort());
      expect(useSessionStore.getState()).toMatchObject({ currentLoadedSessionName: name, currentSessionName: name });
    });

    it('skips a suggestion that names a save: the next one that names none is used', () => {
      const taken = suggestionAt(0);
      const free = suggestionAt(0.99);
      expect(free).not.toBe(taken); // precondition
      saveNamedSession(taken, buildSessionPayload());
      useSessionStore.setState({ currentSessionName: '' }); // blank: Keep draws a suggestion
      vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.99);

      expect(useSessionStore.getState().keepCurrentWorld()).toBe(free);
      expect(listSessions()).toHaveLength(2);
    });

    it('when every draw names a save, the suggestion is numbered: " 2", then " 3"', () => {
      const taken = suggestionAt(0);
      saveNamedSession(taken, buildSessionPayload());
      useSessionStore.setState({ currentSessionName: taken });
      vi.spyOn(Math, 'random').mockReturnValue(0); // every suggestion is the taken name

      expect(useSessionStore.getState().keepCurrentWorld()).toBe(taken + ' 2');
      useSessionStore.setState({ currentLoadedSessionName: null, currentSessionName: taken });
      expect(useSessionStore.getState().keepCurrentWorld()).toBe(taken + ' 3');
      expect(listSessions()).toHaveLength(3);
    });

    it('with a save loaded, Keep still overwrites that save, whatever the session is named', () => {
      saveNamedSession('Dusk Run', { ...buildSessionPayload(), swellFrequency: 1 });
      saveNamedSession('Quiet Harbour', { ...buildSessionPayload(), swellFrequency: 2 });
      useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });

      expect(useSessionStore.getState().keepCurrentWorld()).toBe('Dusk Run');
      expect(loadSession('Dusk Run')?.swellFrequency).toBe(buildSessionPayload().swellFrequency);
      expect(loadSession('Quiet Harbour')?.swellFrequency).toBe(2);
      expect(listSessions()).toHaveLength(2);
    });
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

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R6: the fresh suggestion is the next Keep's name, so it names no save either.
  it('suggests a name no save holds: a suggestion that names a save is skipped (review R6)', () => {
    localStorage.clear();
    const taken = suggestionAt(0);
    saveNamedSession(taken, { ...buildSessionPayload(), swellFrequency: 1 });
    const spy = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.99);

    useSessionStore.getState().detachLoadedSession();

    expect(useSessionStore.getState().currentSessionName).toBe(suggestionAt(0.99));
    spy.mockRestore();
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

/*
 * Keep with a snapshot (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.4): the off screen keeps the world the
 * listener powered off on, not the live one, so keepWorld saves a payload it is handed under a name it is handed and
 * touches no session field; isPayloadDirty is isWorldDirty for any payload and name.
 */
describe('keepWorld', () => {
  // A swell frequency the live world cannot have: the live one is seeded, so a fixed value collides with it now and then.
  const snapshot = () => ({ ...buildSessionPayload(), swellFrequency: (buildSessionPayload().swellFrequency ?? 0) + 10 });

  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ currentSessionName: 'Quiet Harbour', currentLoadedSessionName: 'Live Save' });
  });

  it('with a name, overwrites that save with the given payload, not the live one, and returns the name', () => {
    saveNamedSession('Dusk Run', { ...buildSessionPayload(), swellFrequency: 1 });
    expect(snapshot().swellFrequency).not.toBe(buildSessionPayload().swellFrequency); // precondition

    expect(useSessionStore.getState().keepWorld(snapshot(), 'Dusk Run')).toBe('Dusk Run');

    expect(loadSession('Dusk Run')).toEqual(JSON.parse(JSON.stringify(snapshot())));
    expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
  });

  it('with null, writes a new row under a name no save has, leaving the existing saves alone', () => {
    saveNamedSession('Quiet Harbour', { ...buildSessionPayload(), swellFrequency: 1 });

    const name = useSessionStore.getState().keepWorld(snapshot(), null);

    expect(name).not.toBe('Quiet Harbour');
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+( \d+)?$/);
    expect(loadSession(name)).toEqual(JSON.parse(JSON.stringify(snapshot())));
    expect(loadSession('Quiet Harbour')?.swellFrequency).toBe(1);
    expect(listSessions()).toHaveLength(2);
  });

  it('with a blank name, writes a new row as null does: never an unnamed row', () => {
    const name = useSessionStore.getState().keepWorld(snapshot(), '   ');
    expect(name.trim()).not.toBe('');
    expect(listSessions().map((s) => s.name)).toEqual([name]);
  });

  it('changes neither currentLoadedSessionName nor currentSessionName, with a name or without', () => {
    useSessionStore.getState().keepWorld(snapshot(), 'Dusk Run');
    useSessionStore.getState().keepWorld(snapshot(), null);
    expect(useSessionStore.getState()).toMatchObject({
      currentLoadedSessionName: 'Live Save',
      currentSessionName: 'Quiet Harbour',
    });
  });
});

describe('isPayloadDirty', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ currentSessionName: 'Quiet Harbour', currentLoadedSessionName: null });
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
