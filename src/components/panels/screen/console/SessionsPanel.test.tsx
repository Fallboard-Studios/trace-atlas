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
import { CONTENT } from '@/content';

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
      expect(screen.getByRole('button', { name: /^Share live$/i })).toBeTruthy();
    });

    it('clicking Share calls copySessionLink with buildSessionPayload() -- live state, not listSessions()/storage', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionsPanel />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Share live$/i }));
      });

      expect(buildSessionPayload).toHaveBeenCalled();
      expect(copySessionLink).toHaveBeenCalledWith({ ...fakePayload, seq: 0 });
    });

    it('shows "Link copied" on success and "Unable to copy" on failure', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionsPanel />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Share live$/i }));
      });
      expect(screen.getByRole('status').textContent).toBe('Link copied');

      vi.mocked(copySessionLink).mockResolvedValue(false);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Share live$/i }));
      });
      expect(screen.getByRole('alert').textContent).toBe('Unable to copy');
    });

    it('the note auto-dismisses after 5 seconds', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SessionsPanel />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Share live$/i }));
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
      expect(screen.getByRole('button', { name: /^Reset to Factory Settings$/i })).toBeTruthy();
    });

    it('clicking it opens a confirmation dialog without clearing anything yet', () => {
      render(<SessionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: /save session/i }));
      fireEvent.click(screen.getByRole('button', { name: /^Reset to Factory Settings$/i }));

      expect(localStorage.getItem(STORAGE_KEY)).toContain('Test Session');
      expect(screen.getByText('Test Session')).toBeTruthy();
    });

    it('confirming clears ALL of localStorage (not just the sessions key) and empties the visible list', () => {
      localStorage.setItem('some-unrelated-key', 'should also be wiped');
      render(<SessionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: /save session/i }));
      expect(screen.getByText('Test Session')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /^Reset to Factory Settings$/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Clear Local Storage' }));

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem('some-unrelated-key')).toBeNull();
      expect(screen.queryByText('Test Session')).toBeNull();
    });

    it('confirming also clears currentLoadedSessionName back to null', () => {
      useSessionStore.setState({ currentLoadedSessionName: 'Test Session' });
      render(<SessionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^Reset to Factory Settings$/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Clear Local Storage' }));

      expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    });

    it('cancelling the dialog leaves storage and the list untouched', () => {
      render(<SessionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: /save session/i }));

      fireEvent.click(screen.getByRole('button', { name: /^Reset to Factory Settings$/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(localStorage.getItem(STORAGE_KEY)).toContain('Test Session');
      expect(screen.getByText('Test Session')).toBeTruthy();
    });
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 17 follow-up (Crawford, 2026-10-10: the sketch's Save & Share, its
// copy, single-line faces on this panel only): the name, Save Session and Share live in one row; a
// Saved Sessions label over the list; a Factory Reset label over a full-width Reset to Factory Settings.
describe('SessionsPanel — the sketch\'s layout', () => {
  const saveOne = () => fireEvent.click(screen.getByRole('button', { name: CONTENT['session.save'].human }));

  it('the name, Save Session and Share live share one row, in that order', () => {
    const { container } = render(<SessionsPanel />);
    const row = container.querySelector('.sessions-panel__save-row')!;
    expect(row).not.toBeNull();
    const input = screen.getByRole('textbox', { name: CONTENT['session.name'].human });
    const save = screen.getByRole('button', { name: CONTENT['session.save'].human });
    const share = screen.getByRole('button', { name: CONTENT['session.shareLive'].human });
    for (const el of [input, save, share]) expect(row.contains(el)).toBe(true);
    expect(input.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('every button on the panel has the single-line face, with no lore — its own three and a row\'s three', () => {
    const { container } = render(<SessionsPanel />);
    saveOne();
    for (const button of screen.getAllByRole('button').filter((b) => !b.classList.contains('sc-help__trigger'))) {
      expect(button.querySelector('.sc-button__label'), button.getAttribute('aria-label') ?? '').not.toBeNull();
      expect(button.querySelector('.sc-dual-label')).toBeNull();
    }
    for (const key of ['session.save', 'session.shareLive', 'session.load', 'session.share', 'session.delete'] as const) {
      const lore = CONTENT[key].lore;
      if (lore) expect(container.textContent, key).not.toContain(lore);
    }
  });

  it('the saved list sits under its own label row, Stored Traces / Saved Sessions', () => {
    const { container } = render(<SessionsPanel />);
    saveOne();
    const group = container.querySelector('.sessions-panel__saved')!;
    expect(group).not.toBeNull();
    expect(group.querySelector('.sc-dual-label')?.textContent).toContain(CONTENT['session.saved'].human);
    expect(group.querySelector('.sc-dual-label')?.textContent).toContain(CONTENT['session.saved'].lore);
    expect(group.contains(screen.getByRole('button', { name: /^Load Test Session$/ }))).toBe(true);
  });

  it('with nothing saved there is no Saved Sessions label over an empty list', () => {
    render(<SessionsPanel />);
    expect(screen.queryByText(CONTENT['session.saved'].human)).toBeNull();
  });

  it('the reset sits under its own label row, Factory Reset / Clear Local Storage, and reads Reset to Factory Settings', () => {
    const { container } = render(<SessionsPanel />);
    const group = container.querySelector('.sessions-panel__reset')!;
    expect(group).not.toBeNull();
    const label = group.querySelector('.sc-dual-label')!;
    expect(label.textContent).toContain(CONTENT['session.clearStorage'].lore);
    expect(label.textContent).toContain(CONTENT['session.clearStorage'].human);
    const button = screen.getByRole('button', { name: CONTENT['session.clearStorage.action'].human });
    expect(group.contains(button)).toBe(true);
    expect(button.textContent).toBe(CONTENT['session.clearStorage.action'].human);
  });

  it('the reset comes last, after the list', () => {
    const { container } = render(<SessionsPanel />);
    saveOne();
    const saved = container.querySelector('.sessions-panel__saved')!;
    const reset = container.querySelector('.sessions-panel__reset')!;
    expect(saved.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('SessionsPanel — the clear confirm stays inside the screen (the UI Shell guardrail)', () => {
  afterEach(() => {
    document.getElementById('screen-viewport')?.remove();
  });

  it('portals into #screen-viewport when the screen exists', () => {
    const viewport = document.createElement('div');
    viewport.id = 'screen-viewport';
    document.body.appendChild(viewport);
    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: CONTENT['session.clearStorage.action'].human }));
    expect(viewport.contains(screen.getByRole('alertdialog'))).toBe(true);
  });

  it('with no screen it opens in place, never as a child of <body>', () => {
    const { container } = render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: CONTENT['session.clearStorage.action'].human }));
    expect(container.contains(screen.getByRole('alertdialog'))).toBe(true);
  });
});

describe('SessionsPanel — the clear confirm reads, and gives focus back', () => {
  it('Escape gives focus back to the reset button that opened it', async () => {
    render(<SessionsPanel />);
    const reset = screen.getByRole('button', { name: CONTENT['session.clearStorage.action'].human });
    act(() => reset.focus());
    fireEvent.click(reset);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(reset);
  });
});
