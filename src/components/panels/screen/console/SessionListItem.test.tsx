import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const rebuiltPayload = { marker: 'rebuilt-live-state' };

vi.mock('@/utils/sessionDiff', () => ({
  applySessionPayload: vi.fn(),
  buildSessionPayload: vi.fn(() => rebuiltPayload),
}));
vi.mock('@/utils/sessionStorageEngine', () => ({
  deleteNamedSession: vi.fn(),
  saveNamedSession: vi.fn(),
  deleteAutosaveSlot: vi.fn(),
}));

import { SessionListItem } from './SessionListItem';
import { useSessionStore } from '@/stores/sessionStore';
import { applySessionPayload, buildSessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession, saveNamedSession, deleteAutosaveSlot } from '@/utils/sessionStorageEngine';
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

  it('an autosave-slot entry renders "AttenuationStyle @ (x, y) (Autosaved Session)", a Load button (unsuffixed), and a Delete button', () => {
    render(<SessionListItem entry={makeEntry({ name: 'unsaved-0' })} />);
    expect(screen.getByText('Iron Drift @ (12, -34) (Autosaved Session)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Load Iron Drift @ \(12, -34\)/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete Iron Drift @ \(12, -34\)/i })).toBeTruthy();
  });

  it('the draft slot renders the same "AttenuationStyle @ (x, y) (Autosaved Session)" label, with its own Delete button too', () => {
    render(<SessionListItem entry={makeEntry({ name: 'draft' })} />);
    expect(screen.getByText('Iron Drift @ (12, -34) (Autosaved Session)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete Iron Drift @ \(12, -34\)/i })).toBeTruthy();
  });

  it('two autosave-slot entries from different worlds show distinct labels', () => {
    const { unmount } = render(<SessionListItem entry={makeEntry({
      name: 'unsaved-1',
      payload: { attenuationStyleName: 'Null Guild', coordinates: { x: 0, y: 0 } } as unknown as SessionEntry['payload'],
    })} />);
    expect(screen.getByText('Null Guild @ (0, 0) (Autosaved Session)')).toBeTruthy();
    unmount();

    render(<SessionListItem entry={makeEntry({ name: 'unsaved-2' })} />);
    expect(screen.getByText('Iron Drift @ (12, -34) (Autosaved Session)')).toBeTruthy();
  });

  it('a named entry never shows the "(Autosaved Session)" suffix', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    expect(screen.queryByText(/Autosaved Session/)).toBeNull();
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

  it('when this entry is the currently-loaded session, the Load button becomes "Update {name}" instead', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.queryByRole('button', { name: /^Load Deep Dive/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Update Deep Dive/i })).toBeTruthy();
  });

  it('a different (not-currently-loaded) named entry still shows Load, even while another session is loaded', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Some Other Session' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.getByRole('button', { name: /Load Deep Dive/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Update Deep Dive/i })).toBeNull();
  });

  it('an autosave-slot entry never shows "Update", even if currentLoadedSessionName happens to match its raw name', () => {
    // Shouldn't occur in practice (loading an autosave slot always sets currentLoadedSessionName
    // to null), but guards against isCurrentlyLoaded ever keying off the raw slot id.
    useSessionStore.setState({ currentLoadedSessionName: 'unsaved-0' });
    render(<SessionListItem entry={makeEntry({ name: 'unsaved-0' })} />);

    expect(screen.queryByRole('button', { name: /Update/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^Load/i })).toBeTruthy();
  });

  it('clicking Update saves the current live state back into this same named entry, without reloading it', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    const onChange = vi.fn();
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Update Deep Dive/i }));

    expect(buildSessionPayload).toHaveBeenCalledTimes(1);
    expect(saveNamedSession).toHaveBeenCalledWith('Deep Dive', rebuiltPayload);
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clicking Update does not change currentLoadedSessionName', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    fireEvent.click(screen.getByRole('button', { name: /Update Deep Dive/i }));

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

  it('deleting an autosave-slot entry opens the same confirmation dialog, without deleting anything yet', () => {
    render(<SessionListItem entry={makeEntry({ name: 'unsaved-0' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Iron Drift @ \(12, -34\)/i }));

    expect(screen.getByText(/Delete Iron Drift @ \(12, -34\)\?/i)).toBeTruthy();
    expect(deleteAutosaveSlot).not.toHaveBeenCalled();
    expect(deleteNamedSession).not.toHaveBeenCalled();
  });

  it('confirming deletes the autosave slot via deleteAutosaveSlot (not deleteNamedSession) and calls onChange', () => {
    const onChange = vi.fn();
    render(<SessionListItem entry={makeEntry({ name: 'unsaved-0' })} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Iron Drift @ \(12, -34\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteAutosaveSlot).toHaveBeenCalledWith('unsaved-0');
    expect(deleteNamedSession).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('cancelling an autosave-slot delete leaves it untouched', () => {
    render(<SessionListItem entry={makeEntry({ name: 'draft' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Iron Drift @ \(12, -34\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteAutosaveSlot).not.toHaveBeenCalled();
    expect(screen.getByText('Iron Drift @ (12, -34) (Autosaved Session)')).toBeTruthy();
  });
});
