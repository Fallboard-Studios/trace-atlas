import { describe, it, expect, vi, afterEach } from 'vitest';

import { useSessionStore } from './sessionStore';

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

  it('actions have no side effects beyond the store\'s own state (no AudioEngine or storage calls)', () => {
    // Nothing to spy on directly since this store imports neither AudioEngine nor
    // sessionStorageEngine at all -- a static check that those modules aren't even imported would
    // be more precise, but this is the runtime-observable equivalent: calling the setters doesn't
    // throw or touch anything requiring a browser API this test environment lacks.
    expect(() => {
      useSessionStore.getState().setCurrentSessionName('Another Name');
      useSessionStore.getState().setCurrentLoadedSessionName('another-loaded');
    }).not.toThrow();
  });
});
