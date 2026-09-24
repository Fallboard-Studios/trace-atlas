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
// The first-open start is a timeline `.call()` fired on GSAP's next tick (see the 'deferred one GSAP tick' block below).
// Default: fire it immediately, so every other test sees the resulting tween synchronously, exactly as before.
let deferredStarts: Array<() => void> = [];
let runStartsImmediately = true;
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
    call: (fn: () => void) => {
      if (runStartsImmediately) fn();
      else deferredStarts.push(fn);
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

import { useEffect, useState, type CSSProperties } from 'react';
import { AccordionContainer, CABINET_ACCORDION_TRIGGER_HEIGHT } from './AccordionContainer';
import { CABINET_TOGGLE_BOX_SIZE } from './Toggle';
import { getAccordionDuration, ACCORDION_DURATION, FIRST_OPEN_MAX_SETTLE_TICKS } from './accordionAnimation';
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
    deferredStarts = [];
    runStartsImmediately = true;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders its own schema title via DualLabel in the trigger', () => {
    render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    expect(screen.getByText('Ping Controls')).toBeTruthy();
  });

  it('toggles aria-expanded on its trigger when clicked', () => {
    render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('registers a GSAP timeline via setTimeline on expand', () => {
    render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    fireEvent.click(screen.getByRole('button'));
    expect(setTimeline).toHaveBeenCalled();
  });

  it('calls killTimeline on unmount', () => {
    const { unmount } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    unmount();
    expect(killTimeline).toHaveBeenCalled();
  });

  it('still opens/closes under prefers-reduced-motion, snapping instead of animating', () => {
    stubMatchMedia(true);
    render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    // Still opens (aria-expanded flips) even though the transition snaps.
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(setTimeline).toHaveBeenCalled();
  });

  it('renders a decorative +/- open-state indicator to the left of the label, showing + when closed', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    const indicator = container.querySelector('.sc-accordion__indicator');
    expect(indicator).toBeTruthy();
    expect(indicator?.getAttribute('aria-hidden')).toBe('true');
    expect(indicator?.textContent).toBe('+');
  });

  it('flips the open-state indicator to − when expanded', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    fireEvent.click(screen.getByRole('button'));
    const indicator = container.querySelector('.sc-accordion__indicator');
    expect(indicator?.textContent).toBe('−');
  });

  // Roadmap 11.1.7 — the trigger's only direct child is now the outer facade
  // CabinetBox, not the indicator/label directly; the same left-to-right
  // ordering guarantee holds one level deeper, inside .sc-accordion__row. See
  // docs/specs/OBLIQUE_CABINETRY_ACCORDION_CONTAINER.md §1.1/§5.
  it('places the indicator (toggle box) before the label within the trigger row, not after', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    const row = container.querySelector('.sc-accordion__row');
    const children = Array.from(row?.children ?? []);
    const toggleBoxIndex = children.findIndex((el) => el.querySelector('.sc-accordion__indicator'));
    const labelIndex = children.findIndex((el) => el.classList.contains('sc-dual-label'));
    expect(toggleBoxIndex).toBeGreaterThanOrEqual(0);
    expect(toggleBoxIndex).toBeLessThan(labelIndex);
  });

  it('renders no status light in the trigger — removed, no longer useful once every caller\'s own domain concept went away', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    expect(container.querySelector('.sc-accordion__light')).toBeNull();
  });

  it('sets the content height to auto on mount when defaultOpen is true, so it is not visually collapsed despite aria-expanded="true"', () => {
    const { container } = render(<AccordionContainer schema={schema} defaultOpen>Content</AccordionContainer>);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    const content = container.querySelector('.sc-accordion__content') as HTMLElement;
    expect(content.style.height).toBe('auto');
  });

  it('leaves the content height unset on mount when defaultOpen is false (the default)', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    const content = container.querySelector('.sc-accordion__content') as HTMLElement;
    expect(content.style.height).toBe('');
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
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    expect(screen.getAllByTestId('cabinet-box')).toHaveLength(2);
    expect(facadeBox(container)).toBeTruthy();
    expect(toggleBox(container)).toBeTruthy();
  });

  it('keeps the facade permanently popped, before and after opening the section', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    expect(facadeBox(container)?.getAttribute('data-popped')).toBe('true');
    fireEvent.click(screen.getByRole('button'));
    expect(facadeBox(container)?.getAttribute('data-popped')).toBe('true');
    fireEvent.click(screen.getByRole('button'));
    expect(facadeBox(container)?.getAttribute('data-popped')).toBe('true');
  });

  it('passes skipMountAnimation and CABINET_ACCORDION_TRIGGER_HEIGHT to the facade, never to the toggle box', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    expect(facadeBox(container)?.getAttribute('data-skip-mount-animation')).toBe('true');
    expect(facadeBox(container)?.getAttribute('data-box-height')).toBe(String(CABINET_ACCORDION_TRIGGER_HEIGHT));
    expect(toggleBox(container)?.getAttribute('data-skip-mount-animation')).toBe('false');
  });

  it('mirrors open state on the toggle box\'s popped prop, exactly as the old plain indicator glyph did', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    expect(toggleBox(container)?.getAttribute('data-popped')).toBe('false');
    fireEvent.click(screen.getByRole('button'));
    expect(toggleBox(container)?.getAttribute('data-popped')).toBe('true');
  });

  it('sizes the toggle box with Toggle\'s own exported CABINET_TOGGLE_BOX_SIZE constant, not a redeclared number', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
    expect(toggleBox(container)?.getAttribute('data-box-height')).toBe(String(CABINET_TOGGLE_BOX_SIZE));
  });

  it('renders the +/- glyph inside the toggle box specifically, not directly inside the facade', () => {
    const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
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
      const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
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
        const { container } = render(<AccordionContainer schema={schema} defaultOpen>Content</AccordionContainer>);
        fireEvent.click(screen.getByRole('button')); // close
        timelineCalls = [];
        fireEvent.click(screen.getByRole('button')); // reopen — the synchronous path

        const content = container.querySelector('.sc-accordion__content');
        const heightStep = timelineCalls.find((c) => c.method === 'to' && c.target === content && 'height' in c.vars);
        expect(heightStep?.vars.height).toBe(197.5);
      } finally {
        scroll.mockRestore();
        rect.mockRestore();
      }
    });

    it('on close, fades the content out before animating height back to 0', () => {
      const { container } = render(<AccordionContainer schema={schema} defaultOpen>Content</AccordionContainer>);
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

  // Roadmap 17.2.2 (docs/specs/ACCORDION_LAZY_MOUNT.md) — a section's children are not built until it is first
  // opened, and then stay mounted. The probe below counts its own mounts and holds local state, so a test can
  // tell "never mounted" from "mounted once and kept" from "remounted".
  describe('lazy mount (docs/specs/ACCORDION_LAZY_MOUNT.md)', () => {
    let probeMounts = 0;
    function Probe({ label = 'probe' }: { label?: string }) {
      const [bumps, setBumps] = useState(0);
      useEffect(() => { probeMounts += 1; }, []);
      return (
        <div data-testid={`${label}-body`}>
          <span>{label} bumped {bumps}</span>
          <button type="button" onClick={() => setBumps((n) => n + 1)}>bump {label}</button>
        </div>
      );
    }

    const triggerOf = (name = 'Ping Controls') => screen.getByRole('button', { name: new RegExp(name) });

    beforeEach(() => { probeMounts = 0; });

    it('renders none of its children while it has never been opened', () => {
      const { container } = render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
      expect(probeMounts).toBe(0);
      expect(screen.queryByTestId('probe-body')).toBeNull();
      // The wrapper stays: the height tween and Radix's aria-controls both need it, only its children are conditional.
      expect(container.querySelector('.sc-accordion__content')).toBeTruthy();
      expect(container.querySelector('.sc-accordion__content-inner')?.childElementCount).toBe(0);
    });

    it('mounts its children on the first open', () => {
      render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
      fireEvent.click(triggerOf());
      expect(screen.getByTestId('probe-body')).toBeTruthy();
      expect(probeMounts).toBe(1);
    });

    it('measures the content only after it has mounted, so the height tween targets its real height', () => {
      // Only reports a height once the probe is actually in the DOM — a synchronous measure taken before the
      // children mount would read 0 here and tween to nothing (the failure mode spec §1.3 exists to prevent).
      const spy = stubContentHeight((inner) => (inner.querySelector('[data-testid="probe-body"]') ? 240 : 0));
      try {
        const { container } = render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
        const content = container.querySelector('.sc-accordion__content');
        fireEvent.click(triggerOf());

        const heightStep = timelineCalls.find((c) => c.method === 'to' && c.target === content && 'height' in c.vars);
        expect(heightStep?.vars.height).toBe(240);
      } finally {
        spy.mockRestore();
      }
    });

    it('registers exactly one timeline for the first open, and one per later toggle — the deferred animation never double-fires', () => {
      // Only the section's own timeline key — a first open also registers a short-lived `-start` handle beside it.
      const ownTimelines = () => vi.mocked(setTimeline).mock.calls.filter(([key]) => key === 'accordion-pingControls').length;
      render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
      fireEvent.click(triggerOf());
      expect(ownTimelines()).toBe(1);
      fireEvent.click(triggerOf()); // close
      expect(ownTimelines()).toBe(2);
      fireEvent.click(triggerOf()); // reopen
      expect(ownTimelines()).toBe(3);
    });

    it('keeps its children mounted, and their local state, after being closed and reopened', () => {
      render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
      fireEvent.click(triggerOf());
      fireEvent.click(screen.getByRole('button', { name: 'bump probe' }));
      expect(screen.getByText('probe bumped 1')).toBeTruthy();

      fireEvent.click(triggerOf()); // close — hides, does not unmount
      expect(screen.getByTestId('probe-body')).toBeTruthy();
      expect(triggerOf().getAttribute('aria-expanded')).toBe('false');

      fireEvent.click(triggerOf()); // reopen
      expect(probeMounts).toBe(1);
      expect(screen.getByText('probe bumped 1')).toBeTruthy();
    });

    it('still animates a reopen (a timeline is registered) even though nothing is mounted again', () => {
      render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
      fireEvent.click(triggerOf());
      fireEvent.click(triggerOf());
      vi.mocked(setTimeline).mockClear();
      timelineCalls = [];

      fireEvent.click(triggerOf());

      expect(setTimeline).toHaveBeenCalledTimes(1);
      expect(timelineCalls.some((c) => c.method === 'to' && 'height' in c.vars)).toBe(true);
    });

    it('mounts children immediately when defaultOpen is true, without waiting for a click', () => {
      render(<AccordionContainer schema={schema} defaultOpen><Probe /></AccordionContainer>);
      expect(screen.getByTestId('probe-body')).toBeTruthy();
      expect(probeMounts).toBe(1);
    });

    it('opening one section mounts only that section — a sibling that was never opened stays empty', () => {
      const other: AccordionSchema = { id: 'pingContour', type: 'accordion', humanLabel: 'Ping Contour' };
      render(
        <>
          <AccordionContainer schema={schema}><Probe label="alpha" /></AccordionContainer>
          <AccordionContainer schema={other}><Probe label="beta" /></AccordionContainer>
        </>,
      );

      fireEvent.click(triggerOf('Ping Controls'));

      expect(screen.getByTestId('alpha-body')).toBeTruthy();
      expect(screen.queryByTestId('beta-body')).toBeNull();
    });

    it('renders the latest children on first open, not the ones it was first given while closed', () => {
      const { rerender } = render(<AccordionContainer schema={schema}><span>first content</span></AccordionContainer>);
      rerender(<AccordionContainer schema={schema}><span>second content</span></AccordionContainer>);
      expect(screen.queryByText('first content')).toBeNull();
      expect(screen.queryByText('second content')).toBeNull();

      fireEvent.click(triggerOf());

      expect(screen.getByText('second content')).toBeTruthy();
      expect(screen.queryByText('first content')).toBeNull();
    });

    it('mounts and snaps (zero-duration tween) on the first open under prefers-reduced-motion', () => {
      stubMatchMedia(true);
      const { container } = render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
      const content = container.querySelector('.sc-accordion__content');

      fireEvent.click(triggerOf());

      expect(screen.getByTestId('probe-body')).toBeTruthy();
      const heightStep = timelineCalls.find((c) => c.method === 'to' && c.target === content && 'height' in c.vars);
      expect(heightStep?.vars.duration).toBe(0);
    });

    it('keeps aria-expanded correct on a never-opened section, and once opened aria-controls points at the always-rendered content wrapper', () => {
      render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
      const trigger = triggerOf();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      // Radix's collapsible trigger only sets aria-controls while open (`context.open ? contentId : undefined`) —
      // existing behavior, unchanged by lazy mounting, so a never-opened section has none.
      expect(trigger.getAttribute('aria-controls')).toBeNull();

      fireEvent.click(trigger);

      const controlsId = trigger.getAttribute('aria-controls');
      expect(controlsId).toBeTruthy();
      expect(document.getElementById(controlsId!)?.classList.contains('sc-accordion__content')).toBe(true);
    });

    it('unmounting after a first open still cleans its timeline up', () => {
      const { unmount } = render(<AccordionContainer schema={schema}><Probe /></AccordionContainer>);
      fireEvent.click(triggerOf());
      vi.mocked(killTimeline).mockClear();
      unmount();
      expect(killTimeline).toHaveBeenCalled();
    });
  });

  // Roadmap 17.2.2, task 8 (smoothness). Measured in real Chrome: a freshly-mounted section's controls do heavy work
  // (the mount, then a second wave once their ResizeObservers fire) while its height tween's clock is already running,
  // so the two heaviest sections opened in 3 frames instead of ~12, with a visible height snap at the end. The first
  // open therefore waits, tick by tick on GSAP's own clock, until the section's height stops changing, then builds
  // the tween from "now" against the settled height.
  describe('first-open start waits for the section to settle (smoothness)', () => {
    const START_KEY = 'accordion-pingControls-start';
    const heightTweens = () => timelineCalls.filter((c) => c.method === 'to' && 'height' in c.vars);
    // One GSAP tick: fire whatever start callbacks are pending (each may schedule the next tick's own).
    const tickOnce = () => {
      const starts = deferredStarts;
      deferredStarts = [];
      starts.forEach((fn) => fn());
    };
    const tickUntilIdle = (max = 50) => {
      for (let i = 0; i < max && deferredStarts.length; i++) tickOnce();
    };
    const trigger = () => screen.getByRole('button', { name: /Ping Controls/ });

    beforeEach(() => {
      deferredStarts = [];
      runStartsImmediately = false;
    });

    afterEach(() => {
      runStartsImmediately = true;
      deferredStarts = [];
    });

    it('builds no tween at click time on a first open — the start waits for the next tick', () => {
      render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);

      fireEvent.click(trigger());

      expect(heightTweens()).toHaveLength(0);
      expect(deferredStarts).toHaveLength(1);
      // Registered under its own key so a toggle or unmount can cancel it.
      expect(setTimeline).toHaveBeenCalledWith(START_KEY, expect.anything());
      // ...but the content itself is already mounted and in the DOM for that first paint.
      expect(screen.getByText('body')).toBeTruthy();
    });

    it('builds the height tween once the tick fires, targeting the content\'s measured height', () => {
      const spy = stubContentHeight((inner) => (inner.querySelector('span') ? 180 : 0));
      try {
        render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);
        fireEvent.click(trigger());

        tickUntilIdle();

        expect(heightTweens()).toHaveLength(1);
        expect(heightTweens()[0].vars.height).toBe(180);
      } finally {
        spy.mockRestore();
      }
    });

    it('cancels the pending start when the section is toggled closed before the tick — a stale start must not reopen it', () => {
      render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);
      fireEvent.click(trigger());
      vi.mocked(killTimeline).mockClear();

      fireEvent.click(trigger()); // close before the deferred start fires

      expect(killTimeline).toHaveBeenCalledWith(START_KEY);
    });

    it('cancels the pending start when unmounted before the tick', () => {
      const { unmount } = render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);
      fireEvent.click(trigger());
      vi.mocked(killTimeline).mockClear();

      unmount();

      expect(killTimeline).toHaveBeenCalledWith(START_KEY);
    });

    it('does not defer a reopen — the content is already mounted, so its tween is built in the click\'s own tick', () => {
      render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);
      fireEvent.click(trigger());
      tickUntilIdle();
      fireEvent.click(trigger()); // close
      timelineCalls = [];
      deferredStarts = [];

      fireEvent.click(trigger()); // reopen

      expect(deferredStarts).toHaveLength(0);
      expect(heightTweens()).toHaveLength(1);
    });

    it('still builds a zero-duration (snap) tween on a first open under prefers-reduced-motion', () => {
      stubMatchMedia(true);
      render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);
      fireEvent.click(trigger());

      tickUntilIdle();

      expect(heightTweens()[0].vars.duration).toBe(0);
    });

    it('keeps waiting while the height is still changing, and animates once two consecutive ticks agree', () => {
      const readings = [100, 240, 240];
      let read = 0;
      const spy = stubContentHeight((inner) => (inner.querySelector('span') ? readings[Math.min(read++, readings.length - 1)] : 0));
      try {
        render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);
        fireEvent.click(trigger());

        tickOnce(); // reads 100 — nothing to compare against yet
        expect(heightTweens()).toHaveLength(0);
        tickOnce(); // reads 240 — it grew, so it is not settled
        expect(heightTweens()).toHaveLength(0);
        tickOnce(); // reads 240 again — settled
        expect(heightTweens()).toHaveLength(1);
        expect(heightTweens()[0].vars.height).toBe(240);
      } finally {
        spy.mockRestore();
      }
    });

    it('gives up waiting after a fixed number of ticks and animates anyway, if the height never settles', () => {
      let read = 0;
      const spy = stubContentHeight((inner) => (inner.querySelector('span') ? 100 + read++ : 0)); // a different height every read — never stable
      try {
        render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);
        fireEvent.click(trigger());

        for (let i = 0; i < FIRST_OPEN_MAX_SETTLE_TICKS - 1; i++) tickOnce();
        expect(heightTweens()).toHaveLength(0);

        tickOnce(); // the cap
        expect(heightTweens()).toHaveLength(1);
      } finally {
        spy.mockRestore();
      }
    });

    it('cancelling mid-wait — a close after some ticks but before it settled — stops the polling for good', () => {
      render(<AccordionContainer schema={schema}><span>body</span></AccordionContainer>);
      fireEvent.click(trigger());
      tickOnce();
      vi.mocked(killTimeline).mockClear();

      fireEvent.click(trigger()); // close mid-wait

      expect(killTimeline).toHaveBeenCalledWith(START_KEY);
    });
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5.1) — an optional `style` prop
  // for trait-color scoping (getTraitColorStyle/getRobotColorStyle, src/utils/traitColors.ts).
  // Applied to the outer Accordion.Root (.sc-accordion) so every descendant CabinetBox inside this
  // section inherits the custom properties via ordinary CSS cascade.
  describe('style prop', () => {
    it('applies a caller-supplied style to the outer Accordion.Root element', () => {
      const { container } = render(
        <AccordionContainer schema={schema} style={{ '--color-accent-a': '#428d95' } as CSSProperties}>
          Content
        </AccordionContainer>,
      );
      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#428d95');
    });

    it('applies both custom properties a real trait-color style object carries', () => {
      const { container } = render(
        <AccordionContainer
          schema={schema}
          style={{ '--color-accent-a': '#428d95', '--color-accent-b': '#41ad9f' } as CSSProperties}
        >
          Content
        </AccordionContainer>,
      );
      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#428d95');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#41ad9f');
    });

    it('renders with no inline style at all when the prop is omitted — every existing consumer is unaffected', () => {
      const { container } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
      const root = container.querySelector('.sc-accordion') as HTMLElement;
      expect(root.getAttribute('style')).toBeNull();
    });
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 10)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((AccordionContainer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('a bare-string children call shape does not re-execute its render body on a re-render with identical props — a string literal is already Object.is-stable, so this is the guaranteed bail-out case', () => {
      const { rerender } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
      const callsAfterMount = (withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<AccordionContainer schema={schema}>Content</AccordionContainer>);
      rerender(<AccordionContainer schema={schema}>Content</AccordionContainer>);

      expect((withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (defaultOpen)', () => {
      const { rerender } = render(<AccordionContainer schema={schema}>Content</AccordionContainer>);
      const callsAfterMount = (withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<AccordionContainer schema={schema} defaultOpen>Content</AccordionContainer>);

      expect((withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('the element-children call shape (an inline-constructed ReactNode, not a bare string) still re-executes on a re-render even with every other prop unchanged — the conditional-benefit case spec §1.3 describes, same caveat Toggle.test.tsx\'s own Task 7 test documents', () => {
      const { rerender } = render(<AccordionContainer schema={schema}><span>Content</span></AccordionContainer>);
      const callsAfterMount = (withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<AccordionContainer schema={schema}><span>Content</span></AccordionContainer>);

      expect((withActiveClass as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
