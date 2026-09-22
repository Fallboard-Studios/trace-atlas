import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Local gsap mock, overriding vitest.setup.ts's global noop for this file — same precedent
// CabinetBox.test.tsx already establishes: the global mock's own top-level `set` is a plain
// no-op (not a vi.fn()), so it can't be asserted against directly. Mirrors the global mock's full
// shape (this tree also renders Button -> CabinetBox, which calls gsap.timeline().fromTo() on its
// own mount) so every other component's own gsap usage keeps working unmodified — only the
// top-level `set` is swapped for a spy.
const gsapSetMock = vi.fn();
vi.mock('gsap', () => {
  const noop = () => {
    const obj = {
      set: () => obj,
      to: () => obj,
      fromTo: () => obj,
      call: () => obj,
      eventCallback: () => obj,
      kill: () => {},
    };
    return obj;
  };
  return {
    default: {
      timeline: () => noop(),
      set: (...args: unknown[]) => gsapSetMock(...args),
      to: () => {},
      fromTo: () => {},
      delayedCall: () => ({ kill: () => {} }),
      utils: { selector: () => () => [] },
    },
  };
});

// Lightweight stand-in for CompanyManager (the real thing renders a whole RadioButton row plus
// TextInputs — irrelevant to this panel's own responsive-shell logic; same "mock a real, heavy
// child" precedent AccordionContainer.test.tsx uses for CabinetBox).
vi.mock('@/components/company/CompanyManager', () => ({
  CompanyManager: () => <div data-testid="company-manager-mock" />,
}));

import { RobotFilterPanel } from './RobotFilterPanel';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import { useUIStore } from '@/stores/uiStore';

/** Same shape as useResponsivePanelOrientation.test.ts's own stubMatchMedia — this component
 *  reads the same useCabinetTier() tier detection (mobile: max-width 640px, tablet: max-width
 *  1024px, desktop: neither). */
function stubMatchMedia(initial: { mobile: boolean; tablet: boolean }) {
  const state = { ...initial };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      get matches() {
        if (query.includes('prefers-reduced-motion')) return false;
        return query.includes('640px') ? state.mobile : state.tablet;
      },
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe('RobotFilterPanel', () => {
  beforeEach(() => {
    stubMatchMedia({ mobile: false, tablet: false }); // desktop by default
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useUIStore.getState().selectAllRobots();
  });

  it("renders CompanyManager's own content regardless of tier", () => {
    render(<RobotFilterPanel />);
    expect(screen.getByTestId('company-manager-mock')).toBeTruthy();
  });

  // docs/tasks/NAV_LAYOUT_REWRITE.md Task 18 — this component's filter controls were already
  // never behind an AccordionContainer (its responsive shell is its own GSAP slide-over, not an
  // accordion; verified against the actual source, not the task doc's own description, which
  // assumed a since-superseded accordion). This guard locks that in explicitly, matching this
  // migration's own "confirm zero remaining AccordionContainer" convention for every consumer.
  it('renders no accordion anywhere — filter controls are always reachable, no collapsed section to open first', () => {
    const { container } = render(<RobotFilterPanel />);
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
  });

  describe('desktop tier', () => {
    it('renders no toggle button', () => {
      render(<RobotFilterPanel />);
      expect(screen.queryByRole('button', { name: /^show companies$/i })).toBeNull();
    });

    it("carries data-tier='desktop' on its own root", () => {
      const { container } = render(<RobotFilterPanel />);
      expect(container.querySelector('.robot-filter-panel')?.getAttribute('data-tier')).toBe('desktop');
    });

    it('does not sync gsap transform state on mount — desktop never transforms', () => {
      render(<RobotFilterPanel />);
      expect(gsapSetMock).not.toHaveBeenCalled();
    });
  });

  describe('slide-in bug fix — mount-time gsap transform sync (§1.1)', () => {
    it('syncs gsap\'s own xPercent state to the CSS closed-state baseline on mount, at mobile tier', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<RobotFilterPanel />);
      const panel = container.querySelector('.robot-filter-panel');
      expect(gsapSetMock).toHaveBeenCalledWith(panel, { xPercent: -100 });
    });

    it('syncs gsap\'s own xPercent state to the CSS closed-state baseline on mount, at tablet tier', () => {
      stubMatchMedia({ mobile: false, tablet: true });
      const { container } = render(<RobotFilterPanel />);
      const panel = container.querySelector('.robot-filter-panel');
      expect(gsapSetMock).toHaveBeenCalledWith(panel, { xPercent: -100 });
    });

    it('syncs exactly once on mount, not on every render', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const { rerender } = render(<RobotFilterPanel />);
      rerender(<RobotFilterPanel />);
      // Filtered to xPercent calls specifically — gsapSetMock also observes Button's own
      // CabinetBox skew-sync gsap.set() calls (a real, unrelated, mount-only gsap.set() consumer
      // rendered in this same tree), which would otherwise make a raw call-count assertion here
      // brittle against changes to CabinetBox's own gsap usage.
      const xPercentCalls = gsapSetMock.mock.calls.filter(([, vars]) => vars && 'xPercent' in (vars as object));
      expect(xPercentCalls).toHaveLength(1);
    });
  });

  // Bugfix, found live: resizing mobile -> desktop left GSAP's inline xPercent: -100 on the panel
  // (nothing ever cleared it), so the desktop sidebar — which is never meant to be transformed —
  // stayed hidden unless the panel happened to be open when the window grew.
  describe('resizing across the mobile/desktop boundary', () => {
    /** Like stubMatchMedia, but hands back a resize() that flips the tier and fires the
     *  registered 'change' listeners, the way a real viewport resize would. */
    function stubResizableMatchMedia(initial: { mobile: boolean; tablet: boolean }) {
      const state = { ...initial };
      const listeners = new Set<() => void>();
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          get matches() {
            if (query.includes('prefers-reduced-motion')) return false;
            return query.includes('640px') ? state.mobile : state.tablet;
          },
          media: query,
          addEventListener: (_: string, l: () => void) => listeners.add(l),
          removeEventListener: (_: string, l: () => void) => listeners.delete(l),
        })),
      });
      return (next: { mobile: boolean; tablet: boolean }) => {
        Object.assign(state, next);
        act(() => { listeners.forEach((l) => l()); });
      };
    }

    const transformClears = () => gsapSetMock.mock.calls.filter(
      ([, vars]) => vars && (vars as { clearProps?: string }).clearProps === 'transform',
    );

    it('clears the panel\'s GSAP transform when going from mobile to desktop, so the sidebar is visible', () => {
      const resize = stubResizableMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<RobotFilterPanel />);
      const panel = container.querySelector('.robot-filter-panel');
      expect(transformClears()).toHaveLength(0);

      resize({ mobile: false, tablet: false });

      expect(container.querySelector('.robot-filter-panel')?.getAttribute('data-tier')).toBe('desktop');
      expect(gsapSetMock).toHaveBeenCalledWith(panel, { clearProps: 'transform' });
    });

    it('does not clear anything when mounting straight into desktop — there is no transform to clear', () => {
      stubResizableMatchMedia({ mobile: false, tablet: false });
      render(<RobotFilterPanel />);
      expect(transformClears()).toHaveLength(0);
    });

    it('closes an open panel when it goes to desktop, and re-parks it off-screen when coming back to mobile', () => {
      const resize = stubResizableMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<RobotFilterPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^show companies$/i }));
      expect(container.querySelector('.robot-filter-panel')?.classList.contains('isActive')).toBe(true);

      resize({ mobile: false, tablet: false });
      expect(container.querySelector('.robot-filter-panel')?.classList.contains('isActive')).toBe(false);

      gsapSetMock.mockClear();
      resize({ mobile: true, tablet: true });
      const panel = container.querySelector('.robot-filter-panel');
      expect(gsapSetMock).toHaveBeenCalledWith(panel, { xPercent: -100 });
      // Back on mobile it reads as closed (Show button, no isActive) — matching where it's parked.
      expect(panel?.classList.contains('isActive')).toBe(false);
      expect(screen.getByRole('button', { name: /^show companies$/i })).toBeTruthy();
    });

    it('kills any in-flight slide timeline when leaving mobile for desktop', () => {
      const resize = stubResizableMatchMedia({ mobile: true, tablet: true });
      render(<RobotFilterPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^show companies$/i }));
      vi.mocked(killTimeline).mockClear();

      resize({ mobile: false, tablet: false });

      expect(killTimeline).toHaveBeenCalledWith('robot-filter-panel');
    });
  });

  describe('mobile/tablet tiers', () => {
    it('renders a toggle button at mobile tier', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<RobotFilterPanel />);
      expect(screen.getByRole('button', { name: /^show companies$/i })).toBeTruthy();
    });

    it('renders a toggle button at tablet tier', () => {
      stubMatchMedia({ mobile: false, tablet: true });
      render(<RobotFilterPanel />);
      expect(screen.getByRole('button', { name: /^show companies$/i })).toBeTruthy();
    });

    it("carries data-tier='mobile'/'tablet' on its own root, matching the stubbed query", () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<RobotFilterPanel />);
      expect(container.querySelector('.robot-filter-panel')?.getAttribute('data-tier')).toBe('mobile');
    });

    it('starts closed — no isActive class on the panel root', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<RobotFilterPanel />);
      expect(container.querySelector('.robot-filter-panel')?.classList.contains('isActive')).toBe(false);
    });

    it('adds the isActive class when the toggle is clicked, and removes it when the close button is clicked', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<RobotFilterPanel />);

      fireEvent.click(screen.getByRole('button', { name: /^show companies$/i }));
      expect(container.querySelector('.robot-filter-panel')?.classList.contains('isActive')).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: /^hide companies$/i }));
      expect(container.querySelector('.robot-filter-panel')?.classList.contains('isActive')).toBe(false);
    });

    it('registers a GSAP timeline (under its own dedicated key) via setTimeline when the toggle opens the panel', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<RobotFilterPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^show companies$/i }));
      // setTimeline is also called by Button's own internal CabinetBox (an unrelated pop
      // animation) — filter to this panel's own key so the assertion is specific to its slide.
      expect(setTimeline).toHaveBeenCalledWith('robot-filter-panel', expect.anything());
    });

    // The panel used to auto-close whenever selectedCompanyId/allRobotsSelected changed — removed
    // (Crawford's own request, 2026-09-18): it now closes only via its own Hide button.
    describe('stays open across selection changes (no auto-close)', () => {
      function openPanel() {
        stubMatchMedia({ mobile: true, tablet: true });
        const utils = render(<RobotFilterPanel />);
        fireEvent.click(screen.getByRole('button', { name: /^show companies$/i }));
        const panel = () => utils.container.querySelector('.robot-filter-panel');
        expect(panel()?.classList.contains('isActive')).toBe(true);
        return { ...utils, panel };
      }

      it('stays open when a company is selected', () => {
        const { panel } = openPanel();
        act(() => { useUIStore.getState().selectCompany('c1'); });
        expect(panel()?.classList.contains('isActive')).toBe(true);
      });

      it('stays open when "All" (selectAllRobots) is chosen', () => {
        const { panel } = openPanel();
        act(() => { useUIStore.getState().selectAllRobots(); });
        expect(panel()?.classList.contains('isActive')).toBe(true);
      });

      it('does not start a slide animation when the selection changes', () => {
        openPanel();
        vi.mocked(setTimeline).mockClear();
        act(() => { useUIStore.getState().selectCompany('c1'); });
        expect(setTimeline).not.toHaveBeenCalledWith('robot-filter-panel', expect.anything());
      });

      it('still closes via its own close button', () => {
        const { panel } = openPanel();
        act(() => { useUIStore.getState().selectCompany('c1'); });
        fireEvent.click(screen.getByRole('button', { name: /^hide companies$/i }));
        expect(panel()?.classList.contains('isActive')).toBe(false);
      });
    });
  });

  describe('close button + Show/Hide Companies labels (§1.2)', () => {
    it('renders "Show Companies" as the toggle\'s accessible name, before opening, at mobile/tablet tier', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<RobotFilterPanel />);
      expect(screen.getByRole('button', { name: /^show companies$/i })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^hide companies$/i })).toBeNull();
    });

    it('renders no toggle or close button at desktop tier', () => {
      render(<RobotFilterPanel />); // desktop by default (beforeEach)
      expect(screen.queryByRole('button', { name: /^hide companies$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^show companies$/i })).toBeNull();
    });

    it('renders a "Hide Companies" close button, before CompanyManager in document order, once opened', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<RobotFilterPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^show companies$/i }));

      const close = screen.getByRole('button', { name: /^hide companies$/i });
      expect(close).toBeTruthy();
      const panel = container.querySelector('.robot-filter-panel');
      const companyManager = screen.getByTestId('company-manager-mock');
      // Node.compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING (4) means `companyManager`
      // comes after `close` in document order.
      expect(panel?.contains(close)).toBe(true);
      expect(close.compareDocumentPosition(companyManager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('the "Show Companies" toggle is replaced by the close button while open, and returns once closed', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<RobotFilterPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^show companies$/i })); // open
      expect(screen.queryByRole('button', { name: /^show companies$/i })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /^hide companies$/i })); // close
      expect(screen.getByRole('button', { name: /^show companies$/i })).toBeTruthy();
    });

    it('renders exactly one "Hide Companies" button while open', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<RobotFilterPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^show companies$/i }));
      expect(screen.getAllByRole('button', { name: /^hide companies$/i })).toHaveLength(1);
    });

    it('clicking "Hide Companies" closes the panel', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const { container } = render(<RobotFilterPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^show companies$/i })); // open
      expect(container.querySelector('.robot-filter-panel')?.classList.contains('isActive')).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: /^hide companies$/i }));
      expect(container.querySelector('.robot-filter-panel')?.classList.contains('isActive')).toBe(false);
    });
  });

  it('kills its GSAP timeline on unmount', async () => {
    const { killTimeline } = await import('@/animation/timelineMap');
    stubMatchMedia({ mobile: true, tablet: true });
    const { unmount } = render(<RobotFilterPanel />);
    unmount();
    expect(killTimeline).toHaveBeenCalled();
  });

  // Bugfix, found live (docs/todo/backlog.md #27 follow-up) — same class as CompanyManager's own
  // documented fix: RobotsTab re-renders on every audio-swell tick (~8-9x/sec), and this panel
  // takes zero props, so a memo boundary is correct and sufficient (an empty prop list can never
  // differ) — it still re-renders normally when its own useCabinetTier subscription changes.
  it('is a React.memo-wrapped component', () => {
    expect((RobotFilterPanel as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
