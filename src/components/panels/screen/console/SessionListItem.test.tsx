import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/utils/sessionDiff', () => ({
  applySessionPayload: vi.fn(),
}));
vi.mock('@/utils/sessionStorageEngine', () => ({
  deleteNamedSession: vi.fn(),
}));

import { SessionListItem } from './SessionListItem';
import { useSessionStore } from '@/stores/sessionStore';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession } from '@/utils/sessionStorageEngine';
import type { SessionEntry } from '@/types/session';

const fakePayload = {
  attenuationStyleName: 'Iron Drift',
  coordinates: { x: 12, y: -34 },
} as unknown as SessionEntry['payload'];

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return { name: 'My Saved Session', savedAt: Date.now(), payload: fakePayload, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ currentLoadedSessionName: null });
});

describe('SessionListItem', () => {
  it('a named entry renders its name, a Load button, and a Delete button', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    expect(screen.getByText('Deep Dive')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Load Deep Dive/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete Deep Dive/i })).toBeTruthy();
  });

  it('an autosave-slot entry renders "AttenuationStyle @ (x, y)" (derived from its own payload) and a Load button only, no Delete', () => {
    render(<SessionListItem entry={makeEntry({ name: 'unsaved-0' })} />);
    expect(screen.getByText('Iron Drift @ (12, -34)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Load Iron Drift @ \(12, -34\)/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Delete/i })).toBeNull();
  });

  it('the draft slot renders the same "AttenuationStyle @ (x, y)" label, with no Delete button', () => {
    render(<SessionListItem entry={makeEntry({ name: 'draft' })} />);
    expect(screen.getByText('Iron Drift @ (12, -34)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Delete/i })).toBeNull();
  });

  it('two autosave-slot entries from different worlds show distinct labels', () => {
    const { unmount } = render(<SessionListItem entry={makeEntry({
      name: 'unsaved-1',
      payload: { attenuationStyleName: 'Null Guild', coordinates: { x: 0, y: 0 } } as unknown as SessionEntry['payload'],
    })} />);
    expect(screen.getByText('Null Guild @ (0, 0)')).toBeTruthy();
    unmount();

    render(<SessionListItem entry={makeEntry({ name: 'unsaved-2' })} />);
    expect(screen.getByText('Iron Drift @ (12, -34)')).toBeTruthy();
  });

  it('clicking Load on a named entry applies the payload immediately (no confirmation) and sets currentLoadedSessionName to its name', () => {
    const entry = makeEntry({ name: 'Deep Dive' });
    render(<SessionListItem entry={entry} />);
    fireEvent.click(screen.getByRole('button', { name: /Load Deep Dive/i }));

    expect(applySessionPayload).toHaveBeenCalledWith(fakePayload);
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Deep Dive');
  });

  it('clicking Load on an autosave-slot entry applies the payload and sets currentLoadedSessionName to null', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'some-other-session' });
    render(<SessionListItem entry={makeEntry({ name: 'unsaved-0' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Load Iron Drift @ \(12, -34\)/i }));

    expect(applySessionPayload).toHaveBeenCalledWith(fakePayload);
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });

  it('clicking Delete opens a confirmation dialog without deleting anything yet', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Deep Dive/i }));

    expect(screen.getByText(/Delete Deep Dive\?/i)).toBeTruthy();
    expect(deleteNamedSession).not.toHaveBeenCalled();
  });

  it('confirming the dialog deletes the entry and calls onChange', () => {
    const onChange = vi.fn();
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Deep Dive/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteNamedSession).toHaveBeenCalledWith('Deep Dive');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('cancelling the dialog leaves the entry untouched', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Deep Dive/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteNamedSession).not.toHaveBeenCalled();
    expect(screen.getByText('Deep Dive')).toBeTruthy();
  });
});
