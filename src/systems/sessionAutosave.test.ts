import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fakePayload = { version: 1 as const, marker: 'fake-payload' };

vi.mock('../utils/sessionDiff', () => ({
  buildSessionPayload: vi.fn(() => fakePayload),
}));
vi.mock('../utils/sessionStorageEngine', () => ({
  saveNamedSessionAutosave: vi.fn(),
  saveUnsavedAutosave: vi.fn(),
  promoteUnsavedHistoryOnBoot: vi.fn(),
}));

import { startSessionAutosave, stopSessionAutosave, SESSION_AUTOSAVE_INTERVAL_MS } from './sessionAutosave';
import { useSessionStore } from '../stores/sessionStore';
import { buildSessionPayload } from '../utils/sessionDiff';
import { saveNamedSessionAutosave, saveUnsavedAutosave, promoteUnsavedHistoryOnBoot } from '../utils/sessionStorageEngine';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useSessionStore.setState({ currentLoadedSessionName: null });
});

afterEach(() => {
  stopSessionAutosave();
  vi.useRealTimers();
});

describe('sessionAutosave', () => {
  it('does not write anything before the first interval elapses', () => {
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS - 1);
    expect(saveUnsavedAutosave).not.toHaveBeenCalled();
    expect(saveNamedSessionAutosave).not.toHaveBeenCalled();
  });

  it('with no session loaded, 5 consecutive ticks call saveUnsavedAutosave 5 times, never saveNamedSessionAutosave', () => {
    startSessionAutosave();
    for (let i = 0; i < 5; i++) vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    expect(saveUnsavedAutosave).toHaveBeenCalledTimes(5);
    expect(saveNamedSessionAutosave).not.toHaveBeenCalled();
    for (const call of vi.mocked(saveUnsavedAutosave).mock.calls) {
      expect(call[0]).toBe(fakePayload);
    }
  });

  it('with a session loaded, ticks call saveNamedSessionAutosave with that session\'s name, never saveUnsavedAutosave', () => {
    useSessionStore.getState().setCurrentLoadedSessionName('my-saved-session');
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    expect(saveNamedSessionAutosave).toHaveBeenCalledTimes(1);
    expect(saveNamedSessionAutosave).toHaveBeenCalledWith('my-saved-session', fakePayload);
    expect(saveUnsavedAutosave).not.toHaveBeenCalled();
  });

  it("switching which named session is loaded mid-run writes subsequent ticks into the newly-loaded session's own history", () => {
    useSessionStore.getState().setCurrentLoadedSessionName('session-a');
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    useSessionStore.getState().setCurrentLoadedSessionName('session-b');
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    expect(saveNamedSessionAutosave).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveNamedSessionAutosave).mock.calls[0][0]).toBe('session-a');
    expect(vi.mocked(saveNamedSessionAutosave).mock.calls[1][0]).toBe('session-b');
  });

  it('switching from loaded back to unloaded between ticks switches the write target back to the unsaved bucket', () => {
    useSessionStore.getState().setCurrentLoadedSessionName('session-a');
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    useSessionStore.getState().setCurrentLoadedSessionName(null);
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    expect(saveNamedSessionAutosave).toHaveBeenCalledTimes(1);
    expect(saveUnsavedAutosave).toHaveBeenCalledTimes(1);
  });

  it('calling startSessionAutosave twice does not double the tick rate (idempotent)', () => {
    startSessionAutosave();
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);
    expect(saveUnsavedAutosave).toHaveBeenCalledTimes(1);
  });

  it('stopSessionAutosave stops all further writes', () => {
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);
    expect(saveUnsavedAutosave).toHaveBeenCalledTimes(1);

    stopSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS * 3);
    expect(saveUnsavedAutosave).toHaveBeenCalledTimes(1);
  });

  it('calling stopSessionAutosave when never started does not throw', () => {
    expect(() => stopSessionAutosave()).not.toThrow();
  });

  it('each tick calls buildSessionPayload exactly once', () => {
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);
    expect(buildSessionPayload).toHaveBeenCalledTimes(1);
  });

  it('startSessionAutosave calls promoteUnsavedHistoryOnBoot exactly once', () => {
    startSessionAutosave();
    expect(promoteUnsavedHistoryOnBoot).toHaveBeenCalledTimes(1);
  });

  it('promoteUnsavedHistoryOnBoot runs before any tick could fire (called synchronously, not deferred to the interval)', () => {
    startSessionAutosave();
    expect(promoteUnsavedHistoryOnBoot).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS - 1);
    expect(promoteUnsavedHistoryOnBoot).toHaveBeenCalledTimes(1);
  });

  it('calling startSessionAutosave a second time in a row does not call promoteUnsavedHistoryOnBoot again (idempotency guard covers it)', () => {
    startSessionAutosave();
    startSessionAutosave();
    expect(promoteUnsavedHistoryOnBoot).toHaveBeenCalledTimes(1);
  });
});
