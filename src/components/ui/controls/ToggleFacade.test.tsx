import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { ToggleFacade } from './ToggleFacade';
import { DualLabel } from './DualLabel';
import { facadeCurrent, facadeStates } from '@/testUtils/toggleFacade';

// A control whose content changes holds the size of its LARGEST content (Crawford, 2026-10-03), so
// flipping it never resizes it. Every state's content is really in the DOM (all but the current one
// visibility: hidden) and they share one grid cell, so the box is as big as the biggest — which works
// for ANY content, a glyph or a two-line DualLabel. jsdom computes no layout, so the contract tested
// here is the markup the CSS sizes from (ToggleFacade.css.test.ts pins the CSS; real sizes were
// measured in Chrome).

const facade = (container: HTMLElement) => container.querySelector('.sc-toggle-facade') as HTMLElement;

describe('ToggleFacade', () => {
  it('renders BOTH states\' content as real children, off first, then on', () => {
    const { container } = render(<ToggleFacade value={false} off="Float" on="Anchored" />);
    const states = facadeStates(facade(container));
    expect(states.map((s) => s.textContent)).toEqual(['Float', 'Anchored']);
  });

  it('marks exactly one state current: the off content when the value is false', () => {
    const { container } = render(<ToggleFacade value={false} off="Float" on="Anchored" />);
    expect(facadeCurrent(facade(container))?.textContent).toBe('Float');
    expect(facade(container).querySelectorAll('[data-current]')).toHaveLength(1);
  });

  it('marks exactly one state current: the on content when the value is true', () => {
    const { container } = render(<ToggleFacade value={true} off="Float" on="Anchored" />);
    expect(facadeCurrent(facade(container))?.textContent).toBe('Anchored');
    expect(facade(container).querySelectorAll('[data-current]')).toHaveLength(1);
  });

  it('keeps both states in the DOM across a flip — only which one is current moves, so the box cannot differ', () => {
    const { container, rerender } = render(<ToggleFacade value={false} off="Float" on="Anchored" />);
    const before = facadeStates(facade(container)).map((s) => s.textContent);
    rerender(<ToggleFacade value={true} off="Float" on="Anchored" />);
    expect(facadeStates(facade(container)).map((s) => s.textContent)).toEqual(before);
    expect(facadeStates(facade(container))).toHaveLength(2);
  });

  it('takes any node as content, not just text — a two-line DualLabel keeps both its lines', () => {
    const { container } = render(
      <ToggleFacade
        value={false}
        off={<DualLabel loreLabel="Float" humanLabel="Free" />}
        on={<DualLabel loreLabel="Anchored" humanLabel="Sync" />}
      />,
    );
    const current = facadeCurrent(facade(container))!;
    expect(current.querySelector('.sc-dual-label__lore')?.textContent).toBe('Float');
    expect(current.querySelector('.sc-dual-label__human')?.textContent).toBe('Free');
    const [, on] = facadeStates(facade(container));
    expect(on.querySelector('.sc-dual-label__lore')?.textContent).toBe('Anchored');
    expect(on.querySelector('.sc-dual-label__human')?.textContent).toBe('Sync');
  });

  it('is hidden from assistive tech — the switch it sits in carries the name and the state', () => {
    const { container } = render(<ToggleFacade value={false} off="Float" on="Anchored" />);
    expect(facade(container).getAttribute('aria-hidden')).toBe('true');
  });
});
