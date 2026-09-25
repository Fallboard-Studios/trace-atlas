import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Local gsap mock (overriding vitest.setup.ts's global noop for this file only), capturing every
// .fromTo() and .set() call so the pop tween and the instant-reposition path can both be asserted
// on directly — mirrors CabinetBox.test.tsx's own local-gsap-mock precedent.
const { fromToMock, setMock } = vi.hoisted(() => ({ fromToMock: vi.fn(), setMock: vi.fn() }));
vi.mock('gsap', () => {
  const chainable = {
    fromTo: (...args: unknown[]) => {
      fromToMock(...args);
      return chainable;
    },
  };
  return { default: { timeline: vi.fn(() => chainable), set: setMock } };
});

import { UnderlineLink } from './UnderlineLink';
import { CABINET_POP_DURATION, CABINET_POP_DURATION_OUT } from './cabinetAnimation';
import { setTimeline, killTimeline } from '@/animation/timelineMap';

/** Stubs window.matchMedia for prefers-reduced-motion — defaults to non-matching (motion allowed). */
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

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UnderlineLink', () => {
  it('renders aria-hidden, with no text content', () => {
    const { container } = render(<UnderlineLink popped={false} timelineKey="test-underline" color="#123456" />);
    const el = container.querySelector('.sc-underline-link');
    expect(el?.getAttribute('aria-hidden')).toBe('true');
    expect(el?.textContent).toBe('');
  });

  it('applies the color prop as --underline-link-color', () => {
    const { container } = render(<UnderlineLink popped={false} timelineKey="test-underline" color="#123456" />);
    const el = container.querySelector('.sc-underline-link') as HTMLElement;
    expect(el.style.getPropertyValue('--underline-link-color')).toBe('#123456');
  });

  it('registers a GSAP timeline on mount', () => {
    render(<UnderlineLink popped={true} timelineKey="test-underline" color="#123456" />);
    expect(setTimeline).toHaveBeenCalledWith('test-underline', expect.anything());
  });

  it('calls killTimeline on unmount', () => {
    const { unmount } = render(<UnderlineLink popped={false} timelineKey="test-underline" color="#123456" />);
    unmount();
    expect(killTimeline).toHaveBeenCalledWith('test-underline');
  });

  it('still registers a timeline under prefers-reduced-motion — snapped (duration 0), not skipped outright', () => {
    stubMatchMedia(true);
    render(<UnderlineLink popped={true} timelineKey="test-underline" color="#123456" />);
    expect(setTimeline).toHaveBeenCalled();
    const [, , toVars] = fromToMock.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(toVars.duration).toBe(0);
  });

  it('tweens y from 0 to 4 when popping in', () => {
    render(<UnderlineLink popped={true} timelineKey="test-underline" color="#123456" />);
    const [, fromVars, toVars] = fromToMock.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(fromVars.y).toBe(0);
    expect(toVars.y).toBe(4);
  });

  it('tweens y from 4 to 0 when popping back out', () => {
    const { rerender } = render(<UnderlineLink popped={true} timelineKey="test-underline" color="#123456" />);
    fromToMock.mockClear();

    rerender(<UnderlineLink popped={false} timelineKey="test-underline" color="#123456" />);

    const [, fromVars, toVars] = fromToMock.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(fromVars.y).toBe(4);
    expect(toVars.y).toBe(0);
  });

  it('uses CABINET_POP_DURATION (popping-in duration) when popped flips from false to true', () => {
    render(<UnderlineLink popped={true} timelineKey="test-underline" color="#123456" />);
    const [, , toVars] = fromToMock.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(toVars.duration).toBe(CABINET_POP_DURATION);
  });

  it('uses the shorter CABINET_POP_DURATION_OUT when popped flips from true to false', () => {
    const { rerender } = render(<UnderlineLink popped={true} timelineKey="test-underline" color="#123456" />);
    fromToMock.mockClear();

    rerender(<UnderlineLink popped={false} timelineKey="test-underline" color="#123456" />);

    const [, , toVars] = fromToMock.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(toVars.duration).toBe(CABINET_POP_DURATION_OUT);
  });

  it('a non-transition re-run (popped unchanged, timelineKey changing) repositions via gsap.set(), not an animated replay', () => {
    const { rerender } = render(<UnderlineLink popped={true} timelineKey="test-underline-a" color="#111111" />);
    fromToMock.mockClear();
    setMock.mockClear();
    (setTimeline as ReturnType<typeof vi.fn>).mockClear();

    rerender(<UnderlineLink popped={true} timelineKey="test-underline-b" color="#111111" />);

    expect(fromToMock).not.toHaveBeenCalled();
    expect(setTimeline).not.toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(expect.anything(), { y: 4 });
  });

  it('a real popped transition still animates normally after a non-transition reposition has occurred', () => {
    const { rerender } = render(<UnderlineLink popped={true} timelineKey="test-underline-a" color="#111111" />);
    rerender(<UnderlineLink popped={true} timelineKey="test-underline-b" color="#111111" />); // non-transition reposition
    fromToMock.mockClear();
    (setTimeline as ReturnType<typeof vi.fn>).mockClear();

    rerender(<UnderlineLink popped={false} timelineKey="test-underline-b" color="#111111" />);

    expect(fromToMock).toHaveBeenCalled();
    expect(setTimeline).toHaveBeenCalled();
  });

  it('on the very first render, animates in from the numeric opposite of the initial popped value', () => {
    render(<UnderlineLink popped={false} timelineKey="test-underline" color="#123456" />);
    const [, fromVars, toVars] = fromToMock.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(fromVars.y).toBe(4);
    expect(toVars.y).toBe(0);
  });
});
