import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

import { setSectionRef, getSectionRef, clearSectionRef, scrollToSection, scrollToSectionSettled } from './sectionRefs';
import { setTimeline } from '@/animation/timelineMap';

function makeEl(): HTMLElement {
  const el = document.createElement('div');
  el.scrollIntoView = vi.fn();
  return el;
}

describe('sectionRefs — setSectionRef/getSectionRef/clearSectionRef (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 5)', () => {
  afterEach(() => {
    clearSectionRef('probes.r1.volume');
    clearSectionRef('probes.r1.melody');
  });

  it('round-trips a registered element', () => {
    const el = makeEl();
    setSectionRef('probes.r1.volume', el);
    expect(getSectionRef('probes.r1.volume')).toBe(el);
  });

  it('returns undefined for an id that was never registered', () => {
    expect(getSectionRef('probes.r1.melody')).toBeUndefined();
  });

  it('clearSectionRef removes only its own entry, leaving others untouched', () => {
    const volumeEl = makeEl();
    const melodyEl = makeEl();
    setSectionRef('probes.r1.volume', volumeEl);
    setSectionRef('probes.r1.melody', melodyEl);

    clearSectionRef('probes.r1.volume');

    expect(getSectionRef('probes.r1.volume')).toBeUndefined();
    expect(getSectionRef('probes.r1.melody')).toBe(melodyEl);
  });

  it('setSectionRef replaces a stale entry under the same id — no leak across a robot/company switch', () => {
    const first = makeEl();
    const second = makeEl();
    setSectionRef('probes.r1.volume', first);

    setSectionRef('probes.r1.volume', second);

    expect(getSectionRef('probes.r1.volume')).toBe(second);
  });

  it('clearSectionRef is a no-op, not a throw, for an id that was never registered', () => {
    expect(() => clearSectionRef('probes.r1.envelope')).not.toThrow();
  });
});

describe('scrollToSection (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 5)', () => {
  afterEach(() => {
    clearSectionRef('probes.r1.volume');
  });

  it('scrolls the registered element into view instantly (no GSAP tween)', () => {
    const el = makeEl();
    setSectionRef('probes.r1.volume', el);

    scrollToSection('probes.r1.volume');

    expect(el.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto', block: 'start' }));
  });

  it('is a no-op, not a throw, when no ref is registered for that id yet — content that has not lazy-mounted should not crash a click', () => {
    expect(() => scrollToSection('probes.never-mounted.volume')).not.toThrow();
  });

  it('never registers a GSAP timeline — the jump is instant, never animated', () => {
    const el = makeEl();
    setSectionRef('probes.r1.volume', el);

    scrollToSection('probes.r1.volume');

    expect(setTimeline).not.toHaveBeenCalled();
  });
});

describe('scrollToSectionSettled — corrective re-scroll after layout settles (bug: the initial scroll routinely landed away from the target once its lazy-mounted content grew the page around it afterward)', () => {
  let rafCallbacks: FrameRequestCallback[] = [];

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
  });

  afterEach(() => {
    clearSectionRef('probes.r1.volume');
    vi.unstubAllGlobals();
  });

  function flushOneRaf() {
    const pending = rafCallbacks;
    rafCallbacks = [];
    pending.forEach((cb) => cb(0));
  }

  it('scrolls immediately, once, before any rAF fires', () => {
    const el = makeEl();
    setSectionRef('probes.r1.volume', el);

    scrollToSectionSettled('probes.r1.volume');

    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not scroll again until two animation frames have elapsed', () => {
    const el = makeEl();
    setSectionRef('probes.r1.volume', el);
    scrollToSectionSettled('probes.r1.volume');
    vi.mocked(el.scrollIntoView).mockClear();

    flushOneRaf();

    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls a second, corrective time after two animation frames have elapsed', () => {
    const el = makeEl();
    setSectionRef('probes.r1.volume', el);
    scrollToSectionSettled('probes.r1.volume');
    vi.mocked(el.scrollIntoView).mockClear();

    flushOneRaf();
    flushOneRaf();

    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('calls onDone only after the corrective re-scroll, never before', () => {
    const el = makeEl();
    setSectionRef('probes.r1.volume', el);
    const onDone = vi.fn();

    scrollToSectionSettled('probes.r1.volume', onDone);
    expect(onDone).not.toHaveBeenCalled();

    flushOneRaf();
    expect(onDone).not.toHaveBeenCalled();

    flushOneRaf();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not throw when no ref is registered, and still calls onDone once settled', () => {
    const onDone = vi.fn();

    expect(() => scrollToSectionSettled('probes.never-mounted.volume', onDone)).not.toThrow();
    flushOneRaf();
    flushOneRaf();

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
