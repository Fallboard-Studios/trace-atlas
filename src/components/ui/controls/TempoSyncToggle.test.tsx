import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TempoSyncToggle } from './TempoSyncToggle';
import { CONTENT } from '@/content';

const FREE_WORD = CONTENT['ui.tempoSync'].options.free.lore;
const SYNC_WORD = CONTENT['ui.tempoSync'].options.sync.lore;
const TOGGLE_NAME = CONTENT['ui.tempoSync'].human;

const facade = () => screen.getByRole('switch').querySelector('.sc-toggle-facade') as HTMLElement;

describe('TempoSyncToggle', () => {
  it('is a switch named from content (Tempo Sync), checked exactly when synced', () => {
    const { rerender } = render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={false} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: TOGGLE_NAME }).getAttribute('aria-checked')).toBe('false');
    rerender(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={true} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: TOGGLE_NAME }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps one accessible name across both states — the state is aria-checked, not the name', () => {
    const { rerender } = render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={false} onChange={() => {}} />);
    const freeName = screen.getByRole('switch').getAttribute('aria-label');
    rerender(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={true} onChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe(freeName);
  });

  it('shows the current mode\'s lore word as text: Float when Free, Anchored when synced', () => {
    const { rerender } = render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={false} onChange={() => {}} />);
    expect(screen.getByRole('switch').textContent).toBe(FREE_WORD);
    rerender(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={true} onChange={() => {}} />);
    expect(screen.getByRole('switch').textContent).toBe(SYNC_WORD);
  });

  it.each([false, true])('holds one size across modes: both words ride on the facade as sizers (synced = %s)', (synced) => {
    render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={synced} onChange={() => {}} />);
    expect(facade().getAttribute('data-off')).toBe(FREE_WORD);
    expect(facade().getAttribute('data-on')).toBe(SYNC_WORD);
  });

  it('clicking when Free calls onChange(true), and when synced calls onChange(false)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('is controlled: it does not flip on its own until the caller changes `synced`', () => {
    render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={false} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('can be disabled', () => {
    const onChange = vi.fn();
    render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
