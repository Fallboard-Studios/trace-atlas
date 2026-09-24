import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

import { setSectionRef, getSectionRef, clearSectionRef, scrollToSection } from './sectionRefs';
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
