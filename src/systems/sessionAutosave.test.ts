import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fakePayload = { version: 1 as const, marker: 'fake-payload' };

vi.mock('../utils/sessionDiff', () => ({
  buildSessionPayload: vi.fn(() => fakePayload),
}));
vi.mock('../utils/sessionStorageEngine', () => ({
  saveAutosaveSlot: vi.fn(),
}));

import { startSessionAutosave, stopSessionAutosave, SESSION_AUTOSAVE_INTERVAL_MS } from './sessionAutosave';
import { useSessionStore } from '../stores/sessionStore';
import { buildSessionPayload } from '../utils/sessionDiff';
import { saveAutosaveSlot } from '../utils/sessionStorageEngine';

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
    expect(saveAutosaveSlot).not.toHaveBeenCalled();
  });

  it('with no session loaded, 5 consecutive ticks write "rotating" 5 times', () => {
    startSessionAutosave();
    for (let i = 0; i < 5; i++) vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    expect(saveAutosaveSlot).toHaveBeenCalledTimes(5);
    for (const call of vi.mocked(saveAutosaveSlot).mock.calls) {
      expect(call[0]).toBe('rotating');
      expect(call[1]).toBe(fakePayload);
    }
  });

  it('a 6th tick still writes "rotating" (the slot engine, not this module, owns the FIFO wrap)', () => {
    startSessionAutosave();
    for (let i = 0; i < 6; i++) vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);
    expect(saveAutosaveSlot).toHaveBeenCalledTimes(6);
    expect(vi.mocked(saveAutosaveSlot).mock.calls[5][0]).toBe('rotating');
  });

  it('with a session loaded, ticks write "draft" and never call saveNamedSession-shaped ("rotating") writes', () => {
    useSessionStore.getState().setCurrentLoadedSessionName('my-saved-session');
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    expect(saveAutosaveSlot).toHaveBeenCalledTimes(1);
    expect(saveAutosaveSlot).toHaveBeenCalledWith('draft', fakePayload);
  });

  it('switching currentLoadedSessionName to a different name between ticks still writes "draft" (not a new mode)', () => {
    useSessionStore.getState().setCurrentLoadedSessionName('session-a');
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    useSessionStore.getState().setCurrentLoadedSessionName('session-b');
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    expect(saveAutosaveSlot).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveAutosaveSlot).mock.calls[0][0]).toBe('draft');
    expect(vi.mocked(saveAutosaveSlot).mock.calls[1][0]).toBe('draft');
  });

  it('switching from loaded back to unloaded between ticks switches the mode back to "rotating"', () => {
    useSessionStore.getState().setCurrentLoadedSessionName('session-a');
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    useSessionStore.getState().setCurrentLoadedSessionName(null);
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

    expect(vi.mocked(saveAutosaveSlot).mock.calls[0][0]).toBe('draft');
    expect(vi.mocked(saveAutosaveSlot).mock.calls[1][0]).toBe('rotating');
  });

  it('calling startSessionAutosave twice does not double the tick rate (idempotent)', () => {
    startSessionAutosave();
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);
    expect(saveAutosaveSlot).toHaveBeenCalledTimes(1);
  });

  it('stopSessionAutosave stops all further writes', () => {
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);
    expect(saveAutosaveSlot).toHaveBeenCalledTimes(1);

    stopSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS * 3);
    expect(saveAutosaveSlot).toHaveBeenCalledTimes(1);
  });

  it('calling stopSessionAutosave when never started does not throw', () => {
    expect(() => stopSessionAutosave()).not.toThrow();
  });

  it('each tick calls buildSessionPayload exactly once', () => {
    startSessionAutosave();
    vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);
    expect(buildSessionPayload).toHaveBeenCalledTimes(1);
  });
});
