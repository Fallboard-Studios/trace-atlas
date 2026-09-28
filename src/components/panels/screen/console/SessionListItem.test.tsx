import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/utils/sessionDiff', () => ({
  applySessionPayload: vi.fn(),
}));
vi.mock('@/utils/sessionStorageEngine', () => ({
  deleteNamedSession: vi.fn(),
  deleteUnsavedHistory: vi.fn(),
  listNamedSessionAutosaves: vi.fn(() => []),
  listUnsavedLastAutosaves: vi.fn(() => []),
}));

import { SessionListItem } from './SessionListItem';
import { useSessionStore } from '@/stores/sessionStore';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession, deleteUnsavedHistory, listNamedSessionAutosaves } from '@/utils/sessionStorageEngine';
import { LAST_UNSAVED_SESSION_KEY } from '@/types/session';
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
  vi.mocked(listNamedSessionAutosaves).mockReturnValue([]);
  useSessionStore.setState({ currentLoadedSessionName: null, viewingUnsavedHistory: false });
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

  it('label reads "{name} Primary Save" when currently loaded', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.getByText('Deep Dive Primary Save')).toBeTruthy();
  });

  it('label stays plain when NOT currently loaded, even while a different session is loaded', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Some Other Session' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.getByText('Deep Dive')).toBeTruthy();
    expect(screen.queryByText('Deep Dive Primary Save')).toBeNull();
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

describe('SessionListItem -- named entry, autosave subrows (drill-down)', () => {
  it('renders no subrows when NOT currently loaded, even if it has stored history', () => {
    vi.mocked(listNamedSessionAutosaves).mockReturnValue([
      { name: 'Deep Dive', savedAt: Date.now(), payload: fakePayload },
    ]);
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(screen.queryByText(/Autosave from/)).toBeNull();
  });

  it('renders up to its own history as indented subrows when currently loaded', () => {
    vi.mocked(listNamedSessionAutosaves).mockReturnValue([
      { name: 'Deep Dive', savedAt: Date.now(), payload: fakePayload },
      { name: 'Deep Dive', savedAt: Date.now() - 1000, payload: fakePayload },
    ]);
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    // Each subrow's label appears twice: once as its own span, once as the Load button's visible
    // human label (DualLabel renders humanLabel as text, not just an aria-label).
    expect(screen.getAllByText(/Autosave from/).length).toBe(4);
  });

  it('fetches subrow history keyed by this entry\'s own name', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    expect(listNamedSessionAutosaves).toHaveBeenCalledWith('Deep Dive');
  });

  it('clicking Load on a subrow keeps the parent session "current" (stays loaded, not null)', () => {
    vi.mocked(listNamedSessionAutosaves).mockReturnValue([
      { name: 'Deep Dive', savedAt: Date.now(), payload: fakePayload },
    ]);
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    fireEvent.click(screen.getByRole('button', { name: /Load Autosave from/i }));

    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Deep Dive');
  });

  it('a subrow has no Delete button', () => {
    vi.mocked(listNamedSessionAutosaves).mockReturnValue([
      { name: 'Deep Dive', savedAt: Date.now(), payload: fakePayload },
    ]);
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

    // Only the parent row's own Delete button should exist.
    expect(screen.getAllByRole('button', { name: /^Delete/i }).length).toBe(1);
  });
});

describe('SessionListItem -- the unsaved-history row', () => {
  function makeUnsavedEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
    return { name: LAST_UNSAVED_SESSION_KEY, savedAt: Date.now(), payload: fakePayload, ...overrides };
  }

  it('renders the "AttenuationStyle @ (x, y) (Autosaved Session)" label, unsuffixed by name', () => {
    render(<SessionListItem entry={makeUnsavedEntry()} />);
    expect(screen.getByText('Iron Drift @ (12, -34) (Autosaved Session)')).toBeTruthy();
  });

  it('never shows "Primary Save", even when viewingUnsavedHistory is true', () => {
    useSessionStore.setState({ viewingUnsavedHistory: true });
    render(<SessionListItem entry={makeUnsavedEntry()} />);
    expect(screen.queryByText(/Primary Save/)).toBeNull();
  });

  it('clicking Load applies the payload, sets viewingUnsavedHistory true, and clears currentLoadedSessionName', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'some-other-session' });
    render(<SessionListItem entry={makeUnsavedEntry()} />);
    fireEvent.click(screen.getByRole('button', { name: /Load Iron Drift @ \(12, -34\)/i }));

    expect(applySessionPayload).toHaveBeenCalledWith(fakePayload);
    expect(useSessionStore.getState().viewingUnsavedHistory).toBe(true);
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });

  it('renders no subrows until loaded (viewingUnsavedHistory false)', () => {
    render(<SessionListItem entry={makeUnsavedEntry()} />);
    expect(screen.queryByText(/Autosave from/)).toBeNull();
  });

  it('renders its own history as subrows once viewingUnsavedHistory is true', async () => {
    const { listUnsavedLastAutosaves } = await import('@/utils/sessionStorageEngine');
    vi.mocked(listUnsavedLastAutosaves).mockReturnValue([
      { name: LAST_UNSAVED_SESSION_KEY, savedAt: Date.now(), payload: fakePayload },
      { name: LAST_UNSAVED_SESSION_KEY, savedAt: Date.now() - 1000, payload: fakePayload },
    ]);
    useSessionStore.setState({ viewingUnsavedHistory: true });
    render(<SessionListItem entry={makeUnsavedEntry()} />);

    expect(screen.getAllByText(/Autosave from/).length).toBe(4);
  });

  it('has a Delete button that clears the whole bucket via deleteUnsavedHistory', () => {
    const onChange = vi.fn();
    render(<SessionListItem entry={makeUnsavedEntry()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Iron Drift @ \(12, -34\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteUnsavedHistory).toHaveBeenCalledTimes(1);
    expect(deleteNamedSession).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('SessionListItem -- indented prop', () => {
  it('an indented row never renders a Delete button', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} indented />);
    expect(screen.queryByRole('button', { name: /Delete/i })).toBeNull();
  });

  it('an indented row shows only its own "Autosave from" label, never a further-nested subrow, even if currently loaded', () => {
    vi.mocked(listNamedSessionAutosaves).mockReturnValue([
      { name: 'Deep Dive', savedAt: Date.now(), payload: fakePayload },
    ]);
    useSessionStore.setState({ currentLoadedSessionName: 'Deep Dive' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} indented />);

    expect(screen.getAllByText(/Autosave from/).length).toBe(2);
    expect(listNamedSessionAutosaves).not.toHaveBeenCalled();
  });
});
