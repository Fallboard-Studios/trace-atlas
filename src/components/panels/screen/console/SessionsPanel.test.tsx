import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const fakePayload = { marker: 'fake-payload' };
let payloadCounter = 0;

vi.mock('@/utils/sessionDiff', () => ({
  buildSessionPayload: vi.fn(() => ({ ...fakePayload, seq: payloadCounter++ })),
  applySessionPayload: vi.fn(),
}));

import { SessionsPanel } from './SessionsPanel';
import { useSessionStore } from '@/stores/sessionStore';
import { STORAGE_KEY } from '@/utils/sessionStorageEngine';

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
});
