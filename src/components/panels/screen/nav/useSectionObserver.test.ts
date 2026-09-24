import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/utils/sectionRefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sectionRefs')>();
  return { ...actual, scrollToSection: vi.fn(actual.scrollToSection) };
});

import { useSectionObserver } from './useSectionObserver';
import { setSectionRef, clearSectionRef, scrollToSection } from '@/utils/sectionRefs';

type MockEntry = { target: Element; isIntersecting: boolean; boundingClientRect: { top: number } };
type MockCallback = (entries: MockEntry[]) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: MockCallback;
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: MockCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((e) => e !== el);
  }
  disconnect() {
    this.disconnected = true;
    this.observed = [];
  }
}

function fireIntersection(observer: MockIntersectionObserver, entries: MockEntry[]) {
  act(() => {
    observer.callback(entries);
  });
}

function makeAnchor(id: string): HTMLElement {
  const el = document.createElement('div');
  setSectionRef(id, el);
  return el;
}

describe('useSectionObserver (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 6)', () => {
  const originalIntersectionObserver = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = originalIntersectionObserver;
    ['a', 'b', 'c'].forEach((id) => clearSectionRef(id));
    vi.restoreAllMocks();
  });

  it('observes every id\'s registered anchor', () => {
    const elA = makeAnchor('a');
    const elB = makeAnchor('b');

    renderHook(() => useSectionObserver(['a', 'b'], vi.fn()));

    const observer = MockIntersectionObserver.instances[0];
    expect(observer.observed).toContain(elA);
    expect(observer.observed).toContain(elB);
  });

  it('skips an id with no registered anchor yet, without throwing', () => {
    makeAnchor('a');
    // 'b' deliberately never registered (not lazy-mounted).

    expect(() => renderHook(() => useSectionObserver(['a', 'b'], vi.fn()))).not.toThrow();
  });

  it('calls onIntersect with an intersecting section\'s id, without ever calling scrollToSection — scrolling and scrollspy must not fight each other', () => {
    const el = makeAnchor('a');
    const onIntersect = vi.fn();
    renderHook(() => useSectionObserver(['a'], onIntersect));
    const observer = MockIntersectionObserver.instances[0];

    fireIntersection(observer, [{ target: el, isIntersecting: true, boundingClientRect: { top: 0 } }]);

    expect(onIntersect).toHaveBeenCalledWith('a');
    expect(scrollToSection).not.toHaveBeenCalled();
  });

  it('when multiple sections intersect in the same batch, calls onIntersect for the one closest to the top of the viewport', () => {
    const elA = makeAnchor('a');
    const elB = makeAnchor('b');
    const onIntersect = vi.fn();
    renderHook(() => useSectionObserver(['a', 'b'], onIntersect));
    const observer = MockIntersectionObserver.instances[0];

    fireIntersection(observer, [
      { target: elA, isIntersecting: true, boundingClientRect: { top: 120 } },
      { target: elB, isIntersecting: true, boundingClientRect: { top: 10 } },
    ]);

    expect(onIntersect).toHaveBeenCalledWith('b');
    expect(onIntersect).not.toHaveBeenCalledWith('a');
  });

  it('a section\'s hasApproached flips to true the first time it intersects', () => {
    const el = makeAnchor('a');
    const { result } = renderHook(() => useSectionObserver(['a'], vi.fn()));
    expect(result.current.hasApproached('a')).toBe(false);

    fireIntersection(MockIntersectionObserver.instances[0], [
      { target: el, isIntersecting: true, boundingClientRect: { top: 0 } },
    ]);

    expect(result.current.hasApproached('a')).toBe(true);
  });

  it('hasApproached never flips back to false once a section has scrolled out of view again', () => {
    const el = makeAnchor('a');
    const { result } = renderHook(() => useSectionObserver(['a'], vi.fn()));
    const observer = MockIntersectionObserver.instances[0];
    fireIntersection(observer, [{ target: el, isIntersecting: true, boundingClientRect: { top: 0 } }]);
    expect(result.current.hasApproached('a')).toBe(true);

    fireIntersection(observer, [{ target: el, isIntersecting: false, boundingClientRect: { top: -400 } }]);

    expect(result.current.hasApproached('a')).toBe(true);
  });

  it('does not call onIntersect for a section that leaves the viewport (isIntersecting: false), only for ones still in it', () => {
    const el = makeAnchor('a');
    const onIntersect = vi.fn();
    renderHook(() => useSectionObserver(['a'], onIntersect));
    const observer = MockIntersectionObserver.instances[0];

    fireIntersection(observer, [{ target: el, isIntersecting: false, boundingClientRect: { top: -400 } }]);

    expect(onIntersect).not.toHaveBeenCalled();
  });

  it('uses no setTimeout/setInterval/requestAnimationFrame — IntersectionObserver only (CLAUDE.md)', () => {
    const el = makeAnchor('a');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    const { result } = renderHook(() => useSectionObserver(['a'], vi.fn()));
    fireIntersection(MockIntersectionObserver.instances[0], [
      { target: el, isIntersecting: true, boundingClientRect: { top: 0 } },
    ]);
    void result;

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('disconnects its observer on unmount', () => {
    makeAnchor('a');
    const { unmount } = renderHook(() => useSectionObserver(['a'], vi.fn()));
    const observer = MockIntersectionObserver.instances[0];

    unmount();

    expect(observer.disconnected).toBe(true);
  });
});
