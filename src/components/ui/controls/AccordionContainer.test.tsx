import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Local gsap mock (overrides vitest.setup.ts's shared one, same as
// CabinetBox.test.tsx's own) — records each timeline step's method/target/
// vars in call order and fires onComplete synchronously, so the
// make-room-then-fade / fade-then-collapse sequencing tests below can assert
// the exact order animateTo() queues steps in, not just that a timeline was
// created.
let timelineCalls: Array<{ method: 'set' | 'to'; target: unknown; vars: Record<string, unknown> }> = [];
vi.mock('gsap', () => {
  const chainable = {
    set: (target: unknown, vars: Record<string, unknown>) => {
      timelineCalls.push({ method: 'set', target, vars });
      return chainable;
    },
    to: (target: unknown, vars: Record<string, unknown>) => {
      timelineCalls.push({ method: 'to', target, vars });
      if (typeof vars.onComplete === 'function') (vars.onComplete as () => void)();
      return chainable;
    },
  };
  return { default: { timeline: vi.fn(() => chainable) } };
});

// Mocked the same way Button.test.tsx/Toggle.test.tsx/RadioButton.test.tsx mock
// CabinetBox — keeps this file's assertions about AccordionContainer's own
// wiring (which box gets which popped/boxHeight/timelineKey/skipMountAnimation)
// isolated from CabinetBox's already-proven internals (11.1.1). None of the
// existing tests below depend on CabinetBox's real rendering (title/indicator
// text, aria-expanded, the content-height tween all live outside it or pass
// through via `children`), so the mock is safe for the whole file.
vi.mock('./CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, boxHeight, skipMountAnimation, children }: {
    popped: boolean | number; timelineKey: string; boxHeight?: number; skipMountAnimation?: boolean;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="cabinet-box"
      data-timeline-key={timelineKey}
      data-popped={String(popped)}
      data-box-height={boxHeight}
      data-skip-mount-animation={String(!!skipMountAnimation)}
    >
      {children}
    </div>
  ),
}));

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 10) can tell whether AccordionContainer's render body actually
// re-executed — withActiveClass('sc-accordion', open) is called
// unconditionally in the render body.
vi.mock('./activeClass', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./activeClass')>();
  return { ...actual, withActiveClass: vi.fn(actual.withActiveClass) };
});

import { useState, type CSSProperties, type ReactNode } from 'react';
import { AccordionContainer, CABINET_ACCORDION_TRIGGER_HEIGHT } from './AccordionContainer';
import { CABINET_TOGGLE_BOX_SIZE } from './Toggle';
import { getAccordionDuration, ACCORDION_DURATION } from './accordionAnimation';
import { withActiveClass } from './activeClass';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import type { AccordionSchema } from '@/types/controls';

const schema: AccordionSchema = { id: 'pingControls', type: 'accordion', humanLabel: 'Ping Controls' };

function stubMatchMedia(prefersReducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') && prefersReducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

/** Stubs the measured height of an accordion's `.sc-accordion__content-inner` — what animateTo() tweens open to (the
 *  inner wrapper's laid-out box; see AccordionContainer.tsx's measureContentHeight). `heightOf` receives that element, so a
 *  test can report a height only once its children have actually mounted. Every other element measures 0, as in jsdom. */
function stubContentHeight(heightOf: (inner: Element) => number) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.classList.contains('sc-accordion__content-inner') ? heightOf(this) : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) } as DOMRect;
  });
}

/** Test-only controlled wrapper (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 4) — AccordionContainer no longer owns
 *  its own open/closed state, so every test drives it through a small stateful harness, matching how a real caller
 *  (a view's derived-open-section logic) would. `fireEvent.click` on the trigger still exercises the full round trip:
 *  click -> handleValueChange -> onOpenChange -> this wrapper's setState -> re-render with the new `open` prop -> the
 *  component's own [open] effect animates the transition — nothing about that path is mocked out. */
function Controlled({ initialOpen = false, accordionSchema = schema, style, children }: {
  initialOpen?: boolean; accordionSchema?: AccordionSchema; style?: CSSProperties; children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <AccordionContainer schema={accordionSchema} open={open} onOpenChange={setOpen} style={style}>
      {children}
    </AccordionContainer>
  );
}

describe('getAccordionDuration', () => {
  it('returns 0 when prefers-reduced-motion is set', () => {
    expect(getAccordionDuration(true)).toBe(0);
  });

  it('returns the animated duration otherwise', () => {
    expect(getAccordionDuration(false)).toBe(ACCORDION_DURATION);
    expect(getAccordionDuration(false)).toBeGreaterThan(0);
  });
});

describe('AccordionContainer', () => {
  beforeEach(() => {
    stubMatchMedia(false);
    timelineCalls = [];
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders its own schema title via DualLabel in the trigger', () => {
    render(<Controlled>Content</Controlled>);
    expect(screen.getByText('Ping Controls')).toBeTruthy();
  });

  it('toggles aria-expanded on its trigger when clicked', () => {
    render(<Controlled>Content</Controlled>);
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('registers a GSAP timeline via setTimeline on expand', () => {
    render(<Controlled>Content</Controlled>);
    fireEvent.click(screen.getByRole('button'));
    expect(setTimeline).toHaveBeenCalled();
  });

  it('calls killTimeline on unmount', () => {
    const { unmount } = render(<Controlled>Content</Controlled>);
    unmount();
    expect(killTimeline).toHaveBeenCalled();
  });

  it('still opens/closes under prefers-reduced-motion, snapping instead of animating', () => {
    stubMatchMedia(true);
    render(<Controlled>Content</Controlled>);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    // Still opens (aria-expanded flips) even though the transition snaps.
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(setTimeline).toHaveBeenCalled();
  });

  it('renders a decorative +/- open-state indicator to the left of the label, showing + when closed', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    const indicator = container.querySelector('.sc-accordion__indicator');
    expect(indicator).toBeTruthy();
    expect(indicator?.getAttribute('aria-hidden')).toBe('true');
    expect(indicator?.textContent).toBe('+');
  });

  it('flips the open-state indicator to − when expanded', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    fireEvent.click(screen.getByRole('button'));
    const indicator = container.querySelector('.sc-accordion__indicator');
    expect(indicator?.textContent).toBe('−');
  });

  // Roadmap 11.1.7 — the trigger's only direct child is now the outer facade
  // CabinetBox, not the indicator/label directly; the same left-to-right
  // ordering guarantee holds one level deeper, inside .sc-accordion__row. See
  // docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.1/§5.
  it('places the indicator (toggle box) before the label within the trigger row, not after', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    const row = container.querySelector('.sc-accordion__row');
    const children = Array.from(row?.children ?? []);
    const toggleBoxIndex = children.findIndex((el) => el.querySelector('.sc-accordion__indicator'));
    const labelIndex = children.findIndex((el) => el.classList.contains('sc-dual-label'));
    expect(toggleBoxIndex).toBeGreaterThanOrEqual(0);
    expect(toggleBoxIndex).toBeLessThan(labelIndex);
  });

  it('renders no status light in the trigger — removed, no longer useful once every caller\'s own domain concept went away', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    expect(container.querySelector('.sc-accordion__light')).toBeNull();
  });

  it('sets the content height to auto on mount when open is true, so it is not visually collapsed despite aria-expanded="true"', () => {
    const { container } = render(<Controlled initialOpen>Content</Controlled>);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    const content = container.querySelector('.sc-accordion__content') as HTMLElement;
    expect(content.style.height).toBe('auto');
  });

  it('leaves the content height unset on mount when open is false (the default)', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    const content = container.querySelector('.sc-accordion__content') as HTMLElement;
    expect(content.style.height).toBe('');
  });

  it('always renders its children, regardless of open state — mounting is entirely the caller\'s concern now (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 4)', () => {
    render(<Controlled>Content</Controlled>);
    expect(screen.getByText('Content')).toBeTruthy();
  });

  // Roadmap 11.1.7 — two nested CabinetBoxes: a permanently-popped facade
  // wrapping the whole row, and a small state-keyed toggle box in place of the
  // old plain +/- glyph. See docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.

  function facadeBox(container: HTMLElement) {
    return container.querySelector(`[data-timeline-key="cabinet-accordion-facade-${schema.id}"]`);
  }

  function toggleBox(container: HTMLElement) {
    return container.querySelector(`[data-timeline-key="cabinet-accordion-toggle-${schema.id}"]`);
  }

  it('renders exactly 2 CabinetBox instances — a facade and a toggle box, with distinct timelineKeys', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    expect(screen.getAllByTestId('cabinet-box')).toHaveLength(2);
    expect(facadeBox(container)).toBeTruthy();
    expect(toggleBox(container)).toBeTruthy();
  });

  it('keeps the facade permanently popped, before and after opening the section', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    expect(facadeBox(container)?.getAttribute('data-popped')).toBe('true');
    fireEvent.click(screen.getByRole('button'));
    expect(facadeBox(container)?.getAttribute('data-popped')).toBe('true');
    fireEvent.click(screen.getByRole('button'));
    expect(facadeBox(container)?.getAttribute('data-popped')).toBe('true');
  });

  it('passes skipMountAnimation and CABINET_ACCORDION_TRIGGER_HEIGHT to the facade, never to the toggle box', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    expect(facadeBox(container)?.getAttribute('data-skip-mount-animation')).toBe('true');
    expect(facadeBox(container)?.getAttribute('data-box-height')).toBe(String(CABINET_ACCORDION_TRIGGER_HEIGHT));
    expect(toggleBox(container)?.getAttribute('data-skip-mount-animation')).toBe('false');
  });

  it('mirrors open state on the toggle box\'s popped prop, exactly as the old plain indicator glyph did', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    expect(toggleBox(container)?.getAttribute('data-popped')).toBe('false');
    fireEvent.click(screen.getByRole('button'));
    expect(toggleBox(container)?.getAttribute('data-popped')).toBe('true');
  });

  it('sizes the toggle box with Toggle\'s own exported CABINET_TOGGLE_BOX_SIZE constant, not a redeclared number', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    expect(toggleBox(container)?.getAttribute('data-box-height')).toBe(String(CABINET_TOGGLE_BOX_SIZE));
  });

  it('renders the +/- glyph inside the toggle box specifically, not directly inside the facade', () => {
    const { container } = render(<Controlled>Content</Controlled>);
    const indicator = container.querySelector('.sc-accordion__indicator');
    // The toggle box is itself nested inside the facade (§1.1), so the
    // facade's own subtree *does* contain the indicator too — the
    // meaningful check is which cabinet-box the indicator's nearest
    // ancestor is, not merely "is it somewhere under the facade."
    expect(indicator?.closest('[data-testid="cabinet-box"]')).toBe(toggleBox(container));
  });

  // Requested follow-up: content must never be visible while a sibling
  // section is still mid-reposition — open makes room (height) before
  // fading content in, close fades content out before collapsing.
  describe('height/opacity sequencing', () => {
    function contentEls(container: HTMLElement) {
      return {
        content: container.querySelector('.sc-accordion__content'),
        inner: container.querySelector('.sc-accordion__content-inner'),
      };
    }

    it('on open, animates height to the target before fading the content in', () => {
      const { container } = render(<Controlled>Content</Controlled>);
      const { content, inner } = contentEls(container);
      fireEvent.click(screen.getByRole('button'));

      const heightStepIndex = timelineCalls.findIndex(
        (c) => c.method === 'to' && c.target === content && 'height' in c.vars,
      );
      const fadeStepIndex = timelineCalls.findIndex(
        (c) => c.method === 'to' && c.target === inner && c.vars.opacity === 1,
      );
      expect(heightStepIndex).toBeGreaterThanOrEqual(0);
      expect(fadeStepIndex).toBeGreaterThan(heightStepIndex);
    });

    it('tweens open to the content\'s own laid-out height, not scrollHeight — scrollHeight counts the last box\'s popped-out overhang that height:auto drops, which made every open end in a 2-3 px snap', () => {
      // scrollHeight (200) includes the ~2.5 px front-face overhang; the inner wrapper's real box is 197.5.
      const scroll = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(200);
      const rect = stubContentHeight(() => 197.5);
      try {
        const { container } = render(<Controlled initialOpen>Content</Controlled>);
        fireEvent.click(screen.getByRole('button')); // close
        timelineCalls = [];
        fireEvent.click(screen.getByRole('button')); // reopen

        const content = container.querySelector('.sc-accordion__content');
        const heightStep = timelineCalls.find((c) => c.method === 'to' && c.target === content && 'height' in c.vars);
        expect(heightStep?.vars.height).toBe(197.5);
      } finally {
        scroll.mockRestore();
        rect.mockRestore();
      }
    });

    it('on close, fades the content out before animating height back to 0', () => {
      const { container } = render(<Controlled initialOpen>Content</Controlled>);
      const { content, inner } = contentEls(container);
      fireEvent.click(screen.getByRole('button'));

      const fadeStepIndex = timelineCalls.findIndex(
        (c) => c.method === 'to' && c.target === inner && c.vars.opacity === 0,
      );
      const heightStepIndex = timelineCalls.findIndex(
        (c) => c.method === 'to' && c.target === content && c.vars.height === 0,
      );
      expect(fadeStepIndex).toBeGreaterThanOrEqual(0);
      expect(heightStepIndex).toBeGreaterThan(fadeStepIndex);
    });
  });

  // docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 4 — `open` is now a controlled prop; the
  // single-open-accordion model (spec §1.5) means most closes are driven by a SIBLING's own click
  // setting shared selection state, not a click on this section's own trigger, so the component
  // must react to an externally-changed `open` prop exactly as it does to its own click.
  describe('controlled open/onOpenChange (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 4)', () => {
    it('has no internal open/closed state — a parent re-render with a new `open` value alone (no click) flips aria-expanded', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}>Content</AccordionContainer>,
      );
      expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');

      rerender(<AccordionContainer schema={schema} open onOpenChange={onOpenChange}>Content</AccordionContainer>);

      expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    });

    it('toggling `open` externally (no click) triggers the same animateTo tween a click would', () => {
      const onOpenChange = vi.fn();
      const { container, rerender } = render(
        <AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}>Content</AccordionContainer>,
      );
      const content = container.querySelector('.sc-accordion__content');

      rerender(<AccordionContainer schema={schema} open onOpenChange={onOpenChange}>Content</AccordionContainer>);

      expect(setTimeline).toHaveBeenCalled();
      const heightStep = timelineCalls.find((c) => c.method === 'to' && c.target === content && 'height' in c.vars);
      expect(heightStep).toBeTruthy();
    });

    it('externally closing (open -> false with no click) fades and collapses, same as a click-driven close', () => {
      const onOpenChange = vi.fn();
      const { container, rerender } = render(
        <AccordionContainer schema={schema} open onOpenChange={onOpenChange}>Content</AccordionContainer>,
      );
      const content = container.querySelector('.sc-accordion__content');
      timelineCalls = [];

      rerender(<AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}>Content</AccordionContainer>);

      const heightStep = timelineCalls.find((c) => c.method === 'to' && c.target === content && c.vars.height === 0);
      expect(heightStep).toBeTruthy();
    });

    it('does not animate on mount, whichever value `open` starts at', () => {
      render(<AccordionContainer schema={schema} open onOpenChange={vi.fn()}>Content</AccordionContainer>);
      expect(setTimeline).not.toHaveBeenCalled();
    });

    it('clicking the trigger calls onOpenChange with the next value instead of managing its own state', () => {
      const onOpenChange = vi.fn();
      render(<AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}>Content</AccordionContainer>);

      fireEvent.click(screen.getByRole('button'));

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    it('a click has no visible effect at all if the parent ignores onOpenChange (fully controlled, not merely defaulted)', () => {
      render(<AccordionContainer schema={schema} open={false} onOpenChange={vi.fn()}>Content</AccordionContainer>);
      const trigger = screen.getByRole('button');

      fireEvent.click(trigger);

      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5.1) — an optional `style` prop
  // for trait-color scoping (getTraitColorStyle/getRobotColorStyle, src/utils/traitColors.ts).
  // Applied to the outer Accordion.Root (.sc-accordion) so every descendant CabinetBox inside this
  // section inherits the custom properties via ordinary CSS cascade.
  describe('style prop', () => {
    it('applies a caller-supplied style to the outer Accordion.Root element', () => {
      const { container } = render(
        <Controlled style={{ '--color-accent-a': '#428d95' } as CSSProperties}>Content</Controlled>,
      );
      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#428d95');
    });

    it('applies both custom properties a real trait-color style object carries', () => {
      const { container } = render(
        <Controlled style={{ '--color-accent-a': '#428d95', '--color-accent-b': '#41ad9f' } as CSSProperties}>
          Content
        </Controlled>,
      );
      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#428d95');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#41ad9f');
    });

    it('renders with no inline style at all when the prop is omitted — every existing consumer is unaffected', () => {
      const { container } = render(<Controlled>Content</Controlled>);
      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.getAttribute('style')).toBeNull();
    });
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 10)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((AccordionContainer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('a bare-string children call shape does not re-execute its render body on a re-render with identical props — a string literal is already Object.is-stable, so this is the guaranteed bail-out case', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}>Content</AccordionContainer>,
      );
      const callsAfterMount = (withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}>Content</AccordionContainer>);
      rerender(<AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}>Content</AccordionContainer>);

      expect((withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (open)', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}>Content</AccordionContainer>,
      );
      const callsAfterMount = (withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<AccordionContainer schema={schema} open onOpenChange={onOpenChange}>Content</AccordionContainer>);

      expect((withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('the element-children call shape (an inline-constructed ReactNode, not a bare string) still re-executes on a re-render even with every other prop unchanged — the conditional-benefit case spec §1.3 describes, same caveat Toggle.test.tsx\'s own Task 7 test documents', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}><span>Content</span></AccordionContainer>,
      );
      const callsAfterMount = (withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<AccordionContainer schema={schema} open={false} onOpenChange={onOpenChange}><span>Content</span></AccordionContainer>);

      expect((withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
