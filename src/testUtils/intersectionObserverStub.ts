import { getSectionRef } from '@/utils/sectionRefs';

/**
 * Test-only IntersectionObserver stub, shared across every view's content-component test suite
 * (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 7 onward) — jsdom has no real
 * IntersectionObserver, and useSectionObserver.ts (Task 6) constructs one directly. Mirrors
 * useSectionObserver.test.ts's own local mock, hoisted here once it needed reusing across
 * SettingsContent/FleetParamsContent/RobotOptionsTab/CompanyOptionsSection's own test suites
 * instead of duplicating the same ~20 lines in each.
 */
type StubEntry = { target: Element; isIntersecting: boolean; boundingClientRect?: Partial<DOMRect> };
type StubCallback = (entries: StubEntry[]) => void;

class StubIntersectionObserver {
  static instances: StubIntersectionObserver[] = [];
  callback: StubCallback;
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: StubCallback) {
    this.callback = callback;
    StubIntersectionObserver.instances.push(this);
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

/** Call in `beforeEach` — installs the stub and clears any instances from a previous test. */
export function installIntersectionObserverStub(): void {
  StubIntersectionObserver.instances = [];
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = StubIntersectionObserver;
}

/** Fires an intersection entry for `target` on every stub observer currently watching it. */
export function fireIntersection(target: Element, isIntersecting: boolean, top = 0): void {
  for (const observer of StubIntersectionObserver.instances) {
    if (observer.observed.includes(target)) {
      observer.callback([{ target, isIntersecting, boundingClientRect: { top } }]);
    }
  }
}

/** Simulates a section's registered anchor (src/utils/sectionRefs.ts) scrolling into view — the
 *  common case a content-component test needs: "pretend the user scrolled near this section." */
export function approachSection(id: string): void {
  const el = getSectionRef(id);
  if (!el) throw new Error(`approachSection: no ref registered for "${id}" — has it mounted yet?`);
  fireIntersection(el, true, 0);
}
