import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const fakePayload = { marker: 'fake-payload' };
let payloadCounter = 0;

vi.mock('@/utils/sessionDiff', () => ({
  buildSessionPayload: vi.fn(() => ({ ...fakePayload, seq: payloadCounter++ })),
  applySessionPayload: vi.fn(),
}));
vi.mock('@/utils/sessionShareUtils', () => ({
  copySessionLink: vi.fn(),
  getSessionSharePayload: () => null,
}));

import { SessionsPanel } from './SessionsPanel';
import { useSessionStore } from '@/stores/sessionStore';
import { STORAGE_KEY } from '@/utils/sessionStorageEngine';
import { buildSessionPayload } from '@/utils/sessionDiff';
import { copySessionLink } from '@/utils/sessionShareUtils';

beforeEach(() => {
  localStorage.clear();
  payloadCounter = 0;
  useSessionStore.setState({ currentSessionName: 'Test Session', currentLoadedSessionName: null });
});

describe('SessionsPanel', () => {
  it('the Session Name input shows a non-empty generated value on first render', () => {
    render(<SessionsPanel />);
    const input = screen.getByRole('textbox', { name: /session name/i }) as HTMLInputElement;
    expect(input.value.length).toBeGreaterThan(0);
  });

  it('clicking Save Session builds a payload, saves it under the current name, and the row appears immediately', () => {
    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    expect(screen.getByText('Test Session')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Test Session');
  });

  it('saving again under the same name updates the existing row in place -- no duplicate appears', () => {
    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    expect(screen.getAllByText('Test Session').length).toBe(1);
  });

  it('renaming the input before saving produces a second, separate row', () => {
    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    fireEvent.change(screen.getByRole('textbox', { name: /session name/i }), { target: { value: 'Second Session' } });
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    expect(screen.getByText('Test Session')).toBeTruthy();
    expect(screen.getByText('Second Session')).toBeTruthy();
  });

  it('a successful save shows a "Saved <name> at <time>" confirmation', () => {
    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    expect(screen.getByText(/^Saved Test Session at /)).toBeTruthy();
  });

  it('a failed save shows a failure message and logs the error, without touching the saved list', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    expect(screen.getByText('Test Session failed to save.')).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalled();

    setItemSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('the save-confirmation banner uses date+time formatting (month/day present, not just a bare time)', () => {
    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    expect(screen.getByText(/^Saved Test Session at [A-Za-z]{3} \d{1,2}, /)).toBeTruthy();
  });

  it('never renders a row for leftover promoted unsaved history in storage (regression guard, cut feature)', () => {
    // Writes the raw pre-removal storage shape directly (not via sessionStorageEngine's own
    // now-deleted-by-Task-4 autosave functions) to simulate a developer's leftover localStorage
    // data from testing this branch before this task's removal -- see spec §5.3 criterion 3/§7 item 3.
    const leftoverBlob = {
      named: {},
      namedAutosaves: {},
      unsavedCurrent: [],
      unsavedLast: [{ name: '__last-unsaved-session__', savedAt: Date.now(), payload: { attenuationStyleName: 'Null Guild', coordinates: { x: 4, y: -7 } } }],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leftoverBlob));

    render(<SessionsPanel />);
    expect(screen.queryAllByRole('button', { name: /^Load/i }).length).toBe(0);
    expect(screen.queryByText('__last-unsaved-session__')).toBeNull();
    expect(screen.queryByText(/Null Guild/)).toBeNull();
  });

  it('the Save Session button is disabled when the name is blank', () => {
    useSessionStore.setState({ currentSessionName: '' });
    render(<SessionsPanel />);
    expect((screen.getByRole('button', { name: /save session/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('deleting a listed session (via its own row) removes it from the panel', () => {
    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));
    expect(screen.getByText('Test Session')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Delete Test Session/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByText('Test Session')).toBeNull();
  });

  describe('Share Session (roadmap Phase 21)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders a Share Session button next to Save Session', () => {
      render(<SessionsPanel />);
      expect(screen.getByRole('button', { name: /^Share Session$/i })).toBeTruthy();
    });

    it('clicking Share calls copySessionLink with buildSessionPayload() -- live state, not listSessions()/storage', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionsPanel />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Share Session$/i }));
      });

      expect(buildSessionPayload).toHaveBeenCalled();
      expect(copySessionLink).toHaveBeenCalledWith({ ...fakePayload, seq: 0 });
    });

    it('shows "Link copied" on success and "Unable to copy" on failure', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionsPanel />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Share Session$/i }));
      });
      expect(screen.getByRole('status').textContent).toBe('Link copied');

      vi.mocked(copySessionLink).mockResolvedValue(false);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Share Session$/i }));
      });
      expect(screen.getByRole('alert').textContent).toBe('Unable to copy');
    });

    it('the note auto-dismisses after 5 seconds', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionsPanel />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Share Session$/i }));
      });
      expect(screen.getByRole('status')).toBeTruthy();

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('Clear Local Storage', () => {
    it('renders a "Clear Local Storage" button', () => {
      render(<SessionsPanel />);
      expect(screen.getByRole('button', { name: /clear local storage/i })).toBeTruthy();
    });

    it('clicking it opens a confirmation dialog without clearing anything yet', () => {
      render(<SessionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: /save session/i }));
      fireEvent.click(screen.getByRole('button', { name: /clear local storage/i }));

      expect(localStorage.getItem(STORAGE_KEY)).toContain('Test Session');
      expect(screen.getByText('Test Session')).toBeTruthy();
    });

    it('confirming clears ALL of localStorage (not just the sessions key) and empties the visible list', () => {
      localStorage.setItem('some-unrelated-key', 'should also be wiped');
      render(<SessionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: /save session/i }));
      expect(screen.getByText('Test Session')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /clear local storage/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Clear Local Storage' }));

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem('some-unrelated-key')).toBeNull();
      expect(screen.queryByText('Test Session')).toBeNull();
    });

    it('confirming also clears currentLoadedSessionName back to null', () => {
      useSessionStore.setState({ currentLoadedSessionName: 'Test Session' });
      render(<SessionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: /clear local storage/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Clear Local Storage' }));

      expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    });

    it('cancelling the dialog leaves storage and the list untouched', () => {
      render(<SessionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: /save session/i }));

      fireEvent.click(screen.getByRole('button', { name: /clear local storage/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(localStorage.getItem(STORAGE_KEY)).toContain('Test Session');
      expect(screen.getByText('Test Session')).toBeTruthy();
    });
  });
});

describe('SessionsPanel reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 15)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'SessionsPanel.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/>\s*(Cancel|Link copied|Unable to copy)\s*</);
    expect(source).not.toMatch(/`(Saved|Collapse|Expand) $\{|failed to save\.|'CORRUPT NAME'|'NO TEMP'|Probes active\.|Viewing \{/);
  });
});
