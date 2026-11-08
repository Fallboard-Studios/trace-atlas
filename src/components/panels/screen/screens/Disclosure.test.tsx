import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/*
 * docs/tasks/OFF_SCREEN_CONSOLE.md Task 2 (spec §1.4): the off screen's collapsible section — a muted, single-face
 * header button over a body that is in the DOM only while open. The open state is the caller's.
 */
import { Disclosure } from './Disclosure';
import type { ButtonSchema } from '@/types/controls';

const SCHEMA: ButtonSchema = { id: 'testSection', type: 'button' };

function renderDisclosure(open: boolean, onToggle = vi.fn(), title = 'Section · Harbour Song · 4') {
  const result = render(
    <Disclosure schema={SCHEMA} title={title} open={open} onToggle={onToggle}>
      <p>the body</p>
    </Disclosure>,
  );
  return { ...result, onToggle };
}

const header = () => screen.getByRole('button');

describe('Disclosure', () => {
  it('closed: the header says so and the body is not in the DOM', () => {
    renderDisclosure(false);
    expect(header().getAttribute('aria-expanded')).toBe('false');
    const bodyId = header().getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    expect(document.getElementById(bodyId!)).toBeNull();
    expect(screen.queryByText('the body')).toBeNull();
  });

  it('open: the body is in the DOM under the id the header controls', () => {
    renderDisclosure(true);
    expect(header().getAttribute('aria-expanded')).toBe('true');
    const body = document.getElementById(header().getAttribute('aria-controls')!);
    expect(body).not.toBeNull();
    expect(body!.textContent).toBe('the body');
  });

  it('the header keeps its id as it opens and closes', () => {
    const { rerender, onToggle } = renderDisclosure(false);
    const closedId = header().getAttribute('aria-controls');
    rerender(
      <Disclosure schema={SCHEMA} title="t" open onToggle={onToggle}>
        <p>the body</p>
      </Disclosure>,
    );
    expect(header().getAttribute('aria-controls')).toBe(closedId);
  });

  it('a click calls onToggle and nothing else: the open state is the caller’s', () => {
    const { onToggle } = renderDisclosure(false);
    fireEvent.click(header());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('the body')).toBeNull();
  });

  it('the title is the header’s face and its accessible name, and follows the prop', () => {
    const { rerender, onToggle } = renderDisclosure(false);
    expect(header().textContent).toBe('Section · Harbour Song · 4');
    expect(header().getAttribute('aria-label')).toBe('Section · Harbour Song · 4');
    rerender(
      <Disclosure schema={SCHEMA} title="Section · Current · 4" open={false} onToggle={onToggle}>
        <p>the body</p>
      </Disclosure>,
    );
    expect(header().textContent).toBe('Section · Current · 4');
    expect(header().getAttribute('aria-label')).toBe('Section · Current · 4');
  });

  it('the header is flat (muted), whatever the schema asks', () => {
    renderDisclosure(false);
    expect(header().classList.contains('sc-button--muted')).toBe(true);
    expect(header().querySelector('[class*="sc-cabinet-box"]')).toBeNull();
  });
});
