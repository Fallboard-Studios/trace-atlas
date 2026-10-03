import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TempoSyncToggle } from './TempoSyncToggle';
import { CONTENT } from '@/content';
import { facadeCurrentLabels, facadeStates } from '@/testUtils/toggleFacade';

// The toggle has TWO label pairs, and they are different things (Crawford, 2026-10-03):
//   its own label  — { human: 'Tempo Sync', lore: 'Anchoring' } — what the control IS, shown beside the box;
//   its content    — the CURRENT MODE's pair: { 'Free', 'Float' } when Free, { 'Sync', 'Anchored' } when synced.
const OWN = { lore: CONTENT['ui.tempoSync'].lore, human: CONTENT['ui.tempoSync'].human };
const FREE = { lore: CONTENT['ui.tempoSync'].options.free.lore, human: CONTENT['ui.tempoSync'].options.free.human };
const SYNC = { lore: CONTENT['ui.tempoSync'].options.sync.lore, human: CONTENT['ui.tempoSync'].options.sync.human };

const renderToggle = (synced: boolean, extra: Partial<React.ComponentProps<typeof TempoSyncToggle>> = {}) =>
  render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={synced} onChange={() => {}} {...extra} />);

describe('TempoSyncToggle — the content pairs', () => {
  it('uses the exact label tuples from content (guards a copy edit changing what the user sees)', () => {
    expect(OWN).toEqual({ lore: 'Anchoring', human: 'Tempo Sync' });
    expect(FREE).toEqual({ lore: 'Float', human: 'Free' });
    expect(SYNC).toEqual({ lore: 'Anchored', human: 'Sync' });
  });

  it('when Free, the toggle\'s content is { Float over Free }', () => {
    renderToggle(false);
    expect(facadeCurrentLabels(screen.getByRole('switch'))).toEqual(FREE);
  });

  it('when synced, the toggle\'s content is { Anchored over Sync }', () => {
    renderToggle(true);
    expect(facadeCurrentLabels(screen.getByRole('switch'))).toEqual(SYNC);
  });

  it('carries BOTH modes\' pairs in the DOM in either mode (the hidden one sizes the box), off then on', () => {
    for (const synced of [false, true]) {
      const { unmount } = renderToggle(synced);
      const [off, on] = facadeStates(screen.getByRole('switch'));
      expect(off.querySelector('.sc-dual-label__lore')?.textContent, `synced=${synced} off lore`).toBe(FREE.lore);
      expect(off.querySelector('.sc-dual-label__human')?.textContent, `synced=${synced} off human`).toBe(FREE.human);
      expect(on.querySelector('.sc-dual-label__lore')?.textContent, `synced=${synced} on lore`).toBe(SYNC.lore);
      expect(on.querySelector('.sc-dual-label__human')?.textContent, `synced=${synced} on human`).toBe(SYNC.human);
      unmount();
    }
  });
});

describe('TempoSyncToggle — its own label', () => {
  it.each([false, true])('shows { Anchoring over Tempo Sync } beside the box when synced = %s, the same in both modes', (synced) => {
    const { container } = renderToggle(synced);
    const own = container.querySelector('.sc-tempo-sync-toggle > .sc-dual-label') as HTMLElement;
    expect(own).not.toBeNull();
    expect(own.querySelector('.sc-dual-label__lore')?.textContent).toBe(OWN.lore);
    expect(own.querySelector('.sc-dual-label__human')?.textContent).toBe(OWN.human);
  });

  it('is outside the switch — the label names the control, it is not the box\'s content', () => {
    const { container } = renderToggle(false);
    const own = container.querySelector('.sc-tempo-sync-toggle > .sc-dual-label') as HTMLElement;
    expect(screen.getByRole('switch').contains(own)).toBe(false);
  });

  it('comes before the box, so it reads left to right: label, then the control', () => {
    const { container } = renderToggle(false);
    const own = container.querySelector('.sc-tempo-sync-toggle > .sc-dual-label') as HTMLElement;
    expect(own.compareDocumentPosition(screen.getByRole('switch')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is not the box\'s content: the current content never shows the toggle\'s own label', () => {
    renderToggle(false);
    expect(facadeCurrentLabels(screen.getByRole('switch'))).not.toEqual(OWN);
  });
});

describe('TempoSyncToggle — the switch', () => {
  it('is a switch named by the toggle\'s own human label (Tempo Sync), checked exactly when synced', () => {
    const { rerender } = renderToggle(false);
    expect(screen.getByRole('switch', { name: OWN.human }).getAttribute('aria-checked')).toBe('false');
    rerender(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={true} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: OWN.human }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps one accessible name across both states — the state is aria-checked, not the name', () => {
    const { rerender } = renderToggle(false);
    const freeName = screen.getByRole('switch').getAttribute('aria-label');
    rerender(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={true} onChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe(freeName);
  });

  it('clicking when Free calls onChange(true), and when synced calls onChange(false)', () => {
    const onChange = vi.fn();
    const { rerender } = renderToggle(false, { onChange });
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('is controlled: it does not flip on its own until the caller changes `synced`', () => {
    renderToggle(false);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(facadeCurrentLabels(screen.getByRole('switch'))).toEqual(FREE);
  });

  it('can be disabled', () => {
    const onChange = vi.fn();
    renderToggle(false, { onChange, disabled: true });
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
