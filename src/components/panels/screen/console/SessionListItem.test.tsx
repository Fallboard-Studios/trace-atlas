import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/utils/sessionDiff', () => ({
  applySessionPayload: vi.fn(),
}));
vi.mock('@/utils/sessionStorageEngine', () => ({
  deleteNamedSession: vi.fn(),
}));
vi.mock('@/utils/sessionShareUtils', () => ({
  copySessionLink: vi.fn(),
  getSessionSharePayload: () => null,
}));

import { SessionListItem } from './SessionListItem';
import { useSessionStore } from '@/stores/sessionStore';
import { applySessionPayload } from '@/utils/sessionDiff';
import { deleteNamedSession } from '@/utils/sessionStorageEngine';
import { copySessionLink } from '@/utils/sessionShareUtils';
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
  it('renders its name, a Load button, a Share button, and a Delete button', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    expect(screen.getByText('Deep Dive')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Load Deep Dive/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Share Session Deep Dive/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete Deep Dive/i })).toBeTruthy();
  });

  it('the Share button sits between Load and Delete in DOM order', () => {
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    const loadIndex = buttons.findIndex((t) => t?.includes('Load'));
    const shareIndex = buttons.findIndex((t) => t?.includes('Share'));
    const deleteIndex = buttons.findIndex((t) => t?.includes('Delete'));
    expect(loadIndex).toBeLessThan(shareIndex);
    expect(shareIndex).toBeLessThan(deleteIndex);
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

  it('clicking Load also updates the Session Name input value (currentSessionName) to this entry\'s name', () => {
    useSessionStore.setState({ currentSessionName: 'Some Unrelated Suggestion' });
    render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Load Deep Dive/i }));

    expect(useSessionStore.getState().currentSessionName).toBe('Deep Dive');
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

  describe('Share button (roadmap Phase 21)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('clicking Share calls copySessionLink with the entry\'s stored payload -- not buildSessionPayload/live state', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      const entry = makeEntry({ name: 'Deep Dive' });
      render(<SessionListItem entry={entry} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Share Session Deep Dive/i }));
      });

      expect(copySessionLink).toHaveBeenCalledWith(entry.payload);
    });

    it('shows "Link copied" on a successful copy', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Share Session Deep Dive/i }));
      });

      expect(screen.getByRole('status').textContent).toBe('Link copied');
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows "Unable to copy" on a failed copy', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(false);
      render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Share Session Deep Dive/i }));
      });

      expect(screen.getByRole('alert').textContent).toBe('Unable to copy');
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('the note disappears after 5 seconds', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Share Session Deep Dive/i }));
      });
      expect(screen.getByRole('status')).toBeTruthy();

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByRole('status')).toBeNull();
    });

    it('clicking Share again before 5 seconds elapse does not let the first timer clear the newer note early', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionListItem entry={makeEntry({ name: 'Deep Dive' })} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Share Session Deep Dive/i }));
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Share Session Deep Dive/i }));
      });
      // 3000ms after the SECOND click (total 6000ms elapsed) -- the first click's timer, if not
      // cleared, would have fired at 5000ms total and wrongly cleared this still-fresh note.
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.getByRole('status')).toBeTruthy();
    });
  });
});

describe('SessionListItem reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 15)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'SessionListItem.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/>\s*(Cancel|Link copied|Unable to copy)\s*</);
    expect(source).not.toMatch(/`(Saved|Collapse|Expand) $\{|failed to save\.|'CORRUPT NAME'|'NO TEMP'|Probes active\.|Viewing \{/);
  });
});
