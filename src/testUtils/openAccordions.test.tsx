import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { openAllAccordions } from './openAccordions';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import type { AccordionSchema } from '@/types/controls';

// AccordionContainer registers each expand/collapse timeline in timelineMap and drives a GSAP
// height tween — neither matters to what this helper does (it only clicks triggers), so the
// registry is mocked out the same way AccordionContainer.test.tsx's own is, and vitest.setup.ts's
// shared GSAP mock covers the tween.
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Radix's own real, rendered trigger (a <button class="sc-accordion__trigger" aria-expanded>) is
// what this helper has to find — a hand-rolled fake would only prove the fake works. Each schema
// needs a distinct id: it keys both the Radix item and the timelineMap entry.
const schema = (id: string, humanLabel: string): AccordionSchema => ({ id, type: 'accordion', humanLabel });

const expandedOf = (name: string) => screen.getByRole('button', { name: new RegExp(name) }).getAttribute('aria-expanded');

describe('openAllAccordions', () => {
  it('expands every collapsed accordion in the tree', () => {
    render(
      <>
        <AccordionContainer schema={schema('a', 'Alpha')}><p>alpha body</p></AccordionContainer>
        <AccordionContainer schema={schema('b', 'Bravo')}><p>bravo body</p></AccordionContainer>
        <AccordionContainer schema={schema('c', 'Charlie')}><p>charlie body</p></AccordionContainer>
      </>,
    );
    expect(['Alpha', 'Bravo', 'Charlie'].map(expandedOf)).toEqual(['false', 'false', 'false']);

    openAllAccordions();

    expect(['Alpha', 'Bravo', 'Charlie'].map(expandedOf)).toEqual(['true', 'true', 'true']);
  });

  it('leaves an already-open accordion open instead of toggling it closed', () => {
    render(
      <>
        <AccordionContainer schema={schema('a', 'Alpha')} defaultOpen><p>alpha body</p></AccordionContainer>
        <AccordionContainer schema={schema('b', 'Bravo')}><p>bravo body</p></AccordionContainer>
      </>,
    );

    openAllAccordions();

    expect(expandedOf('Alpha')).toBe('true');
    expect(expandedOf('Bravo')).toBe('true');
  });

  it('is idempotent — calling it again does not collapse anything', () => {
    render(<AccordionContainer schema={schema('a', 'Alpha')}><p>alpha body</p></AccordionContainer>);

    openAllAccordions();
    openAllAccordions();

    expect(expandedOf('Alpha')).toBe('true');
  });

  it('never clicks a button that is not an accordion trigger', () => {
    const onClick = vi.fn();
    render(
      <>
        <button type="button" aria-expanded="false" onClick={onClick}>Disclosure that is not an accordion</button>
        <AccordionContainer schema={schema('a', 'Alpha')}><p>alpha body</p></AccordionContainer>
      </>,
    );

    openAllAccordions();

    expect(onClick).not.toHaveBeenCalled();
    expect(expandedOf('Alpha')).toBe('true');
  });

  it('only opens accordions under the given root, leaving the rest of the document untouched', () => {
    const { container } = render(
      <>
        <div data-testid="scope">
          <AccordionContainer schema={schema('in', 'Inside')}><p>inside body</p></AccordionContainer>
        </div>
        <AccordionContainer schema={schema('out', 'Outside')}><p>outside body</p></AccordionContainer>
      </>,
    );
    const scope = container.querySelector<HTMLElement>('[data-testid="scope"]')!;

    openAllAccordions(scope);

    expect(expandedOf('Inside')).toBe('true');
    expect(expandedOf('Outside')).toBe('false');
  });

  it('opens an accordion nested inside another accordion\'s content', () => {
    render(
      <AccordionContainer schema={schema('outer', 'Outer')}>
        <AccordionContainer schema={schema('inner', 'Inner')}><p>inner body</p></AccordionContainer>
      </AccordionContainer>,
    );

    openAllAccordions();

    expect(expandedOf('Outer')).toBe('true');
    expect(expandedOf('Inner')).toBe('true');
  });

  it('does nothing, without throwing, when there are no accordions at all', () => {
    render(<p>nothing collapsible here</p>);

    expect(() => openAllAccordions()).not.toThrow();
  });
});
