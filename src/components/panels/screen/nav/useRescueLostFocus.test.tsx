import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { useRef, useState } from 'react';

import { useRescueLostFocus } from './useRescueLostFocus';

/*
 * Code review 2026-10-11: a pick can unmount its own focused button (the entity list collapses, a deleted
 * company's form goes with its screen, a breadcrumb ancestor turns into the current segment); focus must
 * land on a live element instead of <body>.
 */

const SELECTORS = ['[data-current]', '[data-first]'] as const;

function Harness({ enabled = true, showDoomed = true, trigger = 'a' }: { enabled?: boolean; showDoomed?: boolean; trigger?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useRescueLostFocus(enabled, rootRef, SELECTORS, trigger);
  return (
    <div ref={rootRef}>
      <button data-first>first</button>
      <button data-current>current</button>
      {showDoomed && <button data-doomed>doomed</button>}
    </div>
  );
}

const q = (container: HTMLElement, selector: string) => container.querySelector<HTMLElement>(selector)!;

describe('useRescueLostFocus', () => {
  it('moves focus to the first matching target when the focused element leaves with the change', () => {
    const { container, rerender } = render(<Harness />);
    act(() => q(container, '[data-doomed]').focus());

    rerender(<Harness showDoomed={false} trigger="b" />);

    expect(document.activeElement).toBe(q(container, '[data-current]'));
  });

  it('falls back to the next selector when the first matches nothing', () => {
    function NoCurrent({ showDoomed, trigger }: { showDoomed: boolean; trigger: string }) {
      const rootRef = useRef<HTMLDivElement>(null);
      useRescueLostFocus(true, rootRef, SELECTORS, trigger);
      return (
        <div ref={rootRef}>
          <button data-first>first</button>
          {showDoomed && <button data-doomed>doomed</button>}
        </div>
      );
    }
    const { container, rerender } = render(<NoCurrent showDoomed trigger="a" />);
    act(() => q(container, '[data-doomed]').focus());

    rerender(<NoCurrent showDoomed={false} trigger="b" />);

    expect(document.activeElement).toBe(q(container, '[data-first]'));
  });

  it('does nothing while the focused element is still in the document', () => {
    const { container, rerender } = render(<Harness />);
    act(() => q(container, '[data-doomed]').focus());

    rerender(<Harness trigger="b" />);

    expect(document.activeElement).toBe(q(container, '[data-doomed]'));
  });

  it('does nothing when something else already holds focus', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    const { container, rerender } = render(<Harness />);
    act(() => q(container, '[data-doomed]').focus());
    // The doomed button leaves, but focus has moved on before the commit that notices.
    act(() => outside.focus());

    rerender(<Harness showDoomed={false} trigger="b" />);

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('does nothing when disabled', () => {
    const { container, rerender } = render(<Harness enabled={false} />);
    act(() => q(container, '[data-doomed]').focus());

    rerender(<Harness enabled={false} showDoomed={false} trigger="b" />);

    expect(document.activeElement).toBe(document.body);
  });

  it('acts once per loss: a later change with nothing lost leaves focus where it was put', () => {
    const { container, rerender } = render(<Harness />);
    act(() => q(container, '[data-doomed]').focus());
    rerender(<Harness showDoomed={false} trigger="b" />);
    act(() => q(container, '[data-first]').focus());

    rerender(<Harness showDoomed={false} trigger="c" />);

    expect(document.activeElement).toBe(q(container, '[data-first]'));
  });

  it('never throws without a root element', () => {
    function Rootless() {
      const [n] = useState(0);
      const rootRef = useRef<HTMLDivElement>(null);
      useRescueLostFocus(true, rootRef, SELECTORS, String(n));
      return <button>no root</button>;
    }
    expect(() => render(<Rootless />)).not.toThrow();
  });
});
