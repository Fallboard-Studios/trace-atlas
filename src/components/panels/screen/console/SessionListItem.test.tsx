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
import { formatSessionTimestamp } from '@/utils/helpers';
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

describe('SessionListItem -- named entry', () => {
  it('renders its name, a Load button, and a Delete button', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    expect(screen.getByText('Deep Dive')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Load Deep Dive/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete Deep Dive/i })).toBeTruthy();
  });

  it('always shows Load, never Update, even when currently loaded (regression guard for the revert)', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.queryByRole('button', { name: /Update/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Load/i })).toBeTruthy();
  });

  it('label stays plain "{name}" when currently loaded -- no "Primary Save" suffix (regression guard, cut feature)', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.getByText('Deep Dive')).toBeTruthy();
    expect(screen.queryByText(/Primary Save/)).toBeNull();
  });

  it('label stays plain when NOT currently loaded, even while a different session is loaded', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Some Other Session' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.getByText('Deep Dive')).toBeTruthy();
  });

  it('shows the entry\'s saved time, date+time formatted, next to its name', () => {
    const savedAt = new Date('2026-09-28T14:14:00').getTime();
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive', savedAt })} />);

    expect(screen.getByText(formatSessionTimestamp(savedAt))).toBeTruthy();
  });

  it('two different entries show two different saved times', () => {
    const older = new Date('2026-09-01T09:00:00').getTime();
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive', savedAt: older })} />);

    expect(screen.getByText(formatSessionTimestamp(older))).toBeTruthy();
    expect(screen.queryByText(formatSessionTimestamp(Date.now()))).toBeNull();
  });

  it('never renders autosave subrows, even when currently loaded (regression guard, cut feature)', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.queryByText(/Autosave from/)).toBeNull();
  });

  it('clicking Load re-applies the saved payload and does not write to storage', () => {
    const entry = makeEntry({ name: 'Deep Dive' });
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={entry} />);
    fireEvent.click(screen.getByRole('button', { name: /Load Deep Dive/i }));

    expect(applySessionPayload).toHaveBeenCalledWith(fakePayload);
  });

  it('clicking Load sets currentLoadedSessionName to this entry\'s name', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Load Deep Dive/i }));

    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Deep Dive');
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
