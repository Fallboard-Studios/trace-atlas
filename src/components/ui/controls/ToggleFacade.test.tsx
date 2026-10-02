import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { ToggleFacade } from './ToggleFacade';

// A control whose content changes holds the size of its LARGEST content (Crawford, 2026-10-03), so
// flipping it never resizes it. jsdom computes no layout, so the contract tested here is the markup
// the CSS sizes from (ToggleFacade.css.test.ts pins the CSS; the real sizes were measured in Chrome).

const facade = (container: HTMLElement) => container.querySelector('.sc-toggle-facade') as HTMLElement;

describe('ToggleFacade', () => {
  it('shows only the current content as text: the off content when the value is false', () => {
    const { container } = render(<ToggleFacade value={false} off="Float" on="Anchored" />);
    expect(facade(container).textContent).toBe('Float');
  });

  it('shows only the current content as text: the on content when the value is true', () => {
    const { container } = render(<ToggleFacade value={true} off="Float" on="Anchored" />);
    expect(facade(container).textContent).toBe('Anchored');
  });

  it.each([false, true])('carries BOTH contents as sizer attributes when the value is %s', (value) => {
    const { container } = render(<ToggleFacade value={value} off="☰" on="✕" />);
    expect(facade(container).getAttribute('data-off')).toBe('☰');
    expect(facade(container).getAttribute('data-on')).toBe('✕');
  });

  it('keeps the sizer attributes identical across a flip, so the box cannot differ between states', () => {
    const { container, rerender } = render(<ToggleFacade value={false} off="Float" on="Anchored" />);
    const before = [facade(container).getAttribute('data-off'), facade(container).getAttribute('data-on')];
    rerender(<ToggleFacade value={true} off="Float" on="Anchored" />);
    expect([facade(container).getAttribute('data-off'), facade(container).getAttribute('data-on')]).toEqual(before);
  });

  it('never puts the other state\'s content in the DOM text', () => {
    const { container } = render(<ToggleFacade value={false} off="Float" on="Anchored" />);
    expect(container.textContent).not.toContain('Anchored');
  });

  it('is hidden from assistive tech — the switch it sits in carries the name and the state', () => {
    const { container } = render(<ToggleFacade value={false} off="Float" on="Anchored" />);
    expect(facade(container).getAttribute('aria-hidden')).toBe('true');
  });
});
