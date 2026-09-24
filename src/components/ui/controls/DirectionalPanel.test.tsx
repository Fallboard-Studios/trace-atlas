import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Mocked the same way every other CabinetBox consumer's own test file does
// (Button/Toggle/RadioButton) — isolates this file's
// assertions about DirectionalPanel's own facade-vs-nested wiring from
// CabinetBox's already-proven internals (11.1.1/this phase's own Task 1).
vi.mock('./CabinetBox', () => ({
  CabinetBox: ({ timelineKey, children }: { timelineKey: string; children?: React.ReactNode }) => (
    <div data-testid="cabinet-box" data-timeline-key={timelineKey}>{children}</div>
  ),
}));

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so render-count tests (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 11) can tell whether DirectionalPanel's render body actually
// re-executed — useResponsivePanelOrientation() is called unconditionally on
// every render (per this component's own "both hooks always called" comment).
vi.mock('./useResponsivePanelOrientation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useResponsivePanelOrientation')>();
  return { ...actual, useResponsivePanelOrientation: vi.fn(actual.useResponsivePanelOrientation) };
});

import { DirectionalPanel } from './DirectionalPanel';
import { useResponsivePanelOrientation } from './useResponsivePanelOrientation';
import type { DirectionalPanelSchema } from '@/types/controls';

/** Controllable ResizeObserver mock — same shape as useAutoPanelOrientation.test.ts's own,
 *  overriding the repo's no-op polyfill (vitest.setup.ts) for the duration of each test here. */
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}

  fire(width: number, height: number) {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

let originalResizeObserver: typeof ResizeObserver;

/**
 * Stubs window.matchMedia so the mobile (max-width: 640px) and tablet
 * (max-width: 1024px) queries can be controlled independently — same shape
 * as useCabinetBoxHeight.test.ts's own stubMatchMedia, since 'responsive'
 * orientation resolves through useResponsivePanelOrientation's shared tier
 * detection, not a ResizeObserver.
 */
function stubMatchMedia(initial: { mobile: boolean; tablet: boolean }) {
  const state = { ...initial };
  function queryKind(query: string): 'mobile' | 'tablet' {
    return query.includes('640px') ? 'mobile' : 'tablet';
  }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return state[queryKind(query)];
      },
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  });
}

describe('DirectionalPanel', () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  });

  it('renders its children', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel' };
    render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
      </DirectionalPanel>,
    );
    expect(screen.getByText('Low')).toBeTruthy();
  });

  it('exposes its schema id as a data-panel-id attribute, so a consumer can target one specific instance via CSS without a className prop this component deliberately never accepts', () => {
    const schema: DirectionalPanelSchema = { id: 'audioRig.eqFiltersRow', type: 'directionalPanel' };
    const { container } = render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
      </DirectionalPanel>,
    );
    expect(container.querySelector('.sc-directional-panel')?.getAttribute('data-panel-id')).toBe('audioRig.eqFiltersRow');
  });

  it('renders neither label when loreLabel/humanLabel are both absent', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel' };
    const { container } = render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
      </DirectionalPanel>,
    );
    expect(container.querySelector('.sc-dual-label')).toBeNull();
  });

  it('renders its own schema labels via an internally-composed DualLabel', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', loreLabel: 'TONAL SHAPE', humanLabel: 'EQ' };
    render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
      </DirectionalPanel>,
    );
    expect(screen.getByText('TONAL SHAPE')).toBeTruthy();
    expect(screen.getByText('EQ')).toBeTruthy();
  });

  it('renders only loreLabel when humanLabel is absent', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', loreLabel: 'TONAL SHAPE' };
    render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
      </DirectionalPanel>,
    );
    expect(screen.getByText('TONAL SHAPE')).toBeTruthy();
  });

  it('renders only humanLabel when loreLabel is absent', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', humanLabel: 'EQ' };
    render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
      </DirectionalPanel>,
    );
    expect(screen.getByText('EQ')).toBeTruthy();
  });

  it('defaults to row orientation when schema.orientation is omitted', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel' };
    const { container } = render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
      </DirectionalPanel>,
    );
    expect(container.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
  });

  it('renders data-orientation="row" when explicitly set', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', orientation: 'row' };
    const { container } = render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
      </DirectionalPanel>,
    );
    expect(container.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
  });

  it('renders data-orientation="column" when set', () => {
    const schema: DirectionalPanelSchema = { id: 'signatureArrayLayer', type: 'directionalPanel', orientation: 'column' };
    const { container } = render(
      <DirectionalPanel schema={schema}>
        <span>Layer 1</span>
      </DirectionalPanel>,
    );
    expect(container.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
  });

  it('renders multiple children in the order they were passed, regardless of orientation', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', orientation: 'column' };
    const { container } = render(
      <DirectionalPanel schema={schema}>
        <span>Low</span>
        <span>Mid</span>
        <span>High</span>
      </DirectionalPanel>,
    );
    const content = container.querySelector('.sc-directional-panel__content');
    const texts = Array.from(content?.children ?? []).map((el) => el.textContent);
    expect(texts).toEqual(['Low', 'Mid', 'High']);
  });

  describe('orientation="auto" (docs/tasks/DIRECTIONAL_PANEL_WIRING.md follow-up: row when there\'s room)', () => {
    it('renders data-orientation="column" before any measurement — the narrower, safer fallback', () => {
      const schema: DirectionalPanelSchema = { id: 'eqFiltersRow', type: 'directionalPanel', orientation: 'auto' };
      const { container } = render(
        <DirectionalPanel schema={schema}>
          <span>Low</span>
        </DirectionalPanel>,
      );
      expect(container.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    // Roadmap "Oblique Cabinetry — DirectionalPanel" — a top-level panel now
    // sits inside its own facade's CabinetBox, so "its own parent element"
    // is no longer the true DOM parent for that case specifically. Split
    // into 2 cases: nested panels are entirely unaffected (still measure
    // their true parent); top-level panels measure the facade instead — a
    // real, accepted consequence (spec §1.4), pinned here as an explicit
    // regression guard rather than left implicit. See
    // docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1.4/§5.
    it('a nested panel still observes its own true parent element, unaffected by the facade', () => {
      const outerSchema: DirectionalPanelSchema = { id: 'outer', type: 'directionalPanel' };
      const innerSchema: DirectionalPanelSchema = { id: 'inner', type: 'directionalPanel', orientation: 'auto' };
      const { container } = render(
        <DirectionalPanel schema={outerSchema}>
          <DirectionalPanel schema={innerSchema}>
            <span>Low</span>
          </DirectionalPanel>
        </DirectionalPanel>,
      );
      expect(MockResizeObserver.instances).toHaveLength(1);
      const innerRoot = container.querySelector('.sc-directional-panel .sc-directional-panel')!;
      const outerContent = container.querySelector('.sc-directional-panel__content')!;
      expect(innerRoot.parentElement).toBe(outerContent);
    });

    it('a top-level panel now observes its own facade (CabinetBox), not the true DOM parent directly', () => {
      const schema: DirectionalPanelSchema = { id: 'eqFiltersRow', type: 'directionalPanel', orientation: 'auto' };
      const { container } = render(
        <div data-testid="parent">
          <DirectionalPanel schema={schema}>
            <span>Low</span>
          </DirectionalPanel>
        </div>,
      );
      expect(MockResizeObserver.instances).toHaveLength(1);
      const panelRoot = container.querySelector('.sc-directional-panel')!;
      expect(panelRoot.parentElement?.getAttribute('data-testid')).toBe('cabinet-box');
    });

    it('flips to data-orientation="row" once the measured parent is wide enough', () => {
      const schema: DirectionalPanelSchema = { id: 'eqFiltersRow', type: 'directionalPanel', orientation: 'auto' };
      const { container } = render(
        <DirectionalPanel schema={schema}>
          <span>Low</span>
        </DirectionalPanel>,
      );
      const observer = MockResizeObserver.instances[0];

      act(() => observer.fire(1000, 200));

      expect(container.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });
  });

  // docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.2 — a fixed viewport-tier
  // orientation, distinct from 'auto''s per-parent measurement.
  describe("orientation=\"responsive\" (fixed viewport tier, not a per-parent measurement)", () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('renders data-orientation="column" when the mobile tier matches', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      const schema: DirectionalPanelSchema = { id: 'speedAutomation', type: 'directionalPanel', orientation: 'responsive' };
      const { container } = render(
        <DirectionalPanel schema={schema}>
          <span>Tempo</span>
        </DirectionalPanel>,
      );
      expect(container.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('renders data-orientation="column" when the tablet tier matches', () => {
      stubMatchMedia({ mobile: false, tablet: true });
      const schema: DirectionalPanelSchema = { id: 'speedAutomation', type: 'directionalPanel', orientation: 'responsive' };
      const { container } = render(
        <DirectionalPanel schema={schema}>
          <span>Tempo</span>
        </DirectionalPanel>,
      );
      expect(container.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('renders data-orientation="row" when neither tier matches (desktop)', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      const schema: DirectionalPanelSchema = { id: 'speedAutomation', type: 'directionalPanel', orientation: 'responsive' };
      const { container } = render(
        <DirectionalPanel schema={schema}>
          <span>Tempo</span>
        </DirectionalPanel>,
      );
      expect(container.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });

    it('constructs no ResizeObserver — a responsive panel never measures its own parent', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      const schema: DirectionalPanelSchema = { id: 'speedAutomation', type: 'directionalPanel', orientation: 'responsive' };
      render(
        <DirectionalPanel schema={schema}>
          <span>Tempo</span>
        </DirectionalPanel>,
      );
      expect(MockResizeObserver.instances).toHaveLength(0);
    });
  });

  // Roadmap "Oblique Cabinetry — DirectionalPanel". See
  // docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1.2/§1.3.
  describe('Oblique Cabinetry facade (top-level only, never nested)', () => {
    it('renders through a CabinetBox facade when top-level', () => {
      const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel' };
      const { container } = render(
        <DirectionalPanel schema={schema}>
          <span>Low</span>
        </DirectionalPanel>,
      );
      const box = container.querySelector('[data-testid="cabinet-box"]');
      expect(box).toBeTruthy();
      expect(box?.getAttribute('data-timeline-key')).toBe('cabinet-directional-panel-facade-eq3Panel');
    });

    it('renders no facade of its own when nested inside another DirectionalPanel — exactly one CabinetBox total for the pair', () => {
      const outerSchema: DirectionalPanelSchema = { id: 'outer', type: 'directionalPanel' };
      const innerSchema: DirectionalPanelSchema = { id: 'inner', type: 'directionalPanel' };
      const { container } = render(
        <DirectionalPanel schema={outerSchema}>
          <DirectionalPanel schema={innerSchema}>
            <span>Low</span>
          </DirectionalPanel>
        </DirectionalPanel>,
      );
      const boxes = container.querySelectorAll('[data-testid="cabinet-box"]');
      expect(boxes).toHaveLength(1);
      expect(boxes[0].getAttribute('data-timeline-key')).toBe('cabinet-directional-panel-facade-outer');
    });

    it('propagates nesting transitively — a panel 3 levels deep still renders no facade of its own', () => {
      const schemaA: DirectionalPanelSchema = { id: 'a', type: 'directionalPanel' };
      const schemaB: DirectionalPanelSchema = { id: 'b', type: 'directionalPanel' };
      const schemaC: DirectionalPanelSchema = { id: 'c', type: 'directionalPanel' };
      const { container } = render(
        <DirectionalPanel schema={schemaA}>
          <DirectionalPanel schema={schemaB}>
            <DirectionalPanel schema={schemaC}>
              <span>Low</span>
            </DirectionalPanel>
          </DirectionalPanel>
        </DirectionalPanel>,
      );
      const boxes = container.querySelectorAll('[data-testid="cabinet-box"]');
      expect(boxes).toHaveLength(1);
      expect(boxes[0].getAttribute('data-timeline-key')).toBe('cabinet-directional-panel-facade-a');
    });
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 11 — the conditional-benefit case, spec §1.3)', () => {
    const schema: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel' };

    it('is a React.memo-wrapped component', () => {
      expect((DirectionalPanel as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with a STABLE children reference (hoisted outside the render, not reconstructed each time)', () => {
      const stableChildren = <span>Low</span>;
      const { rerender } = render(<DirectionalPanel schema={schema}>{stableChildren}</DirectionalPanel>);
      const callsAfterMount = (useResponsivePanelOrientation as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<DirectionalPanel schema={schema}>{stableChildren}</DirectionalPanel>);
      rerender(<DirectionalPanel schema={schema}>{stableChildren}</DirectionalPanel>);

      expect((useResponsivePanelOrientation as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('DOES re-execute its render body when children is a freshly-constructed (but deep-equal) element every render — the realistic, overwhelmingly common case today (every real call site, e.g. AudioRigDrawer.tsx, constructs children inline), proving this memo alone is not a guaranteed win the way the self-contained leaf primitives are', () => {
      const { rerender } = render(<DirectionalPanel schema={schema}><span>Low</span></DirectionalPanel>);
      const callsAfterMount = (useResponsivePanelOrientation as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<DirectionalPanel schema={schema}><span>Low</span></DirectionalPanel>);

      expect((useResponsivePanelOrientation as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (schema), even with a stable children reference', () => {
      const stableChildren = <span>Low</span>;
      const { rerender } = render(<DirectionalPanel schema={schema}>{stableChildren}</DirectionalPanel>);
      const callsAfterMount = (useResponsivePanelOrientation as ReturnType<typeof vi.fn>).mock.calls.length;

      const changedSchema: DirectionalPanelSchema = { ...schema, orientation: 'column' };
      rerender(<DirectionalPanel schema={changedSchema}>{stableChildren}</DirectionalPanel>);

      expect((useResponsivePanelOrientation as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
