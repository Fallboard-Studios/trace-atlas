import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

let lastOnComplete: (() => void) | undefined;

vi.mock('gsap', () => ({
  default: {
    timeline: vi.fn((config?: { onComplete?: () => void }) => {
      lastOnComplete = config?.onComplete;
      return { to: vi.fn(), kill: vi.fn() };
    }),
  },
}));

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

import gsap from 'gsap';
import { useLfoTargetGroup, NEUTRAL_LFO_VALUE, type LfoTargetGroupField } from './useLfoTargetGroup';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import type { LfoValue } from '@/types/controls';

function lfo(rate: number): LfoValue {
  return { shape: 'sine', rate, depth: 50 };
}

const FIELDS: LfoTargetGroupField[] = [
  { field: 'low', label: 'Low', lfoValue: lfo(1) },
  { field: 'mid', label: 'Mid', lfoValue: lfo(2) },
  { field: 'high', label: 'High', lfoValue: lfo(3) },
];

// Fires the most recently created transition timeline's onComplete, simulating the
// (today 0-duration) scaffold finishing — see useLfoTargetGroup.ts's select().
function flushTransition() {
  act(() => {
    lastOnComplete?.();
  });
}

describe('useLfoTargetGroup', () => {
  beforeEach(() => {
    lastOnComplete = undefined;
  });

  afterEach(() => {
    // Unmount before clearing mocks — otherwise an unmount-triggered killTimeline call
    // (from React Testing Library's own auto-cleanup, which runs after this hook per its
    // outer/root registration) lands after clearAllMocks and leaks into the next test.
    cleanup();
    vi.clearAllMocks();
  });

  it("defaults selected to the first field on mount, its display showing that field's value/label", () => {
    const { result } = renderHook(() => useLfoTargetGroup({ groupId: 'audioRig.eq3', fields: FIELDS }));
    expect(result.current.selected).toBe('low');
    expect(result.current.isTargeted('low')).toBe(true);
    expect(result.current.isTargeted('mid')).toBe(false);
    expect(result.current.displayValue).toEqual(lfo(1));
    expect(result.current.displayLabel).toBe('Low');
    expect(result.current.transitioning).toBe(false);
  });

  it('selecting the already-targeted field is a no-op — no timeline created', () => {
    const { result } = renderHook(() => useLfoTargetGroup({ groupId: 'audioRig.eq3', fields: FIELDS }));
    act(() => result.current.select('low'));
    expect(setTimeline).not.toHaveBeenCalled();
    expect(killTimeline).not.toHaveBeenCalled();
    expect(result.current.transitioning).toBe(false);
  });

  it('selecting a new field sets transitioning true synchronously, before the timeline completes', () => {
    const { result } = renderHook(() => useLfoTargetGroup({ groupId: 'audioRig.eq3', fields: FIELDS }));
    act(() => result.current.select('mid'));
    expect(result.current.transitioning).toBe(true);
    // Neutral placeholder while transitioning — never the outgoing or incoming field's real
    // values (rate/depth/shape all reset). The label itself stays showing the still-
    // committed field's name throughout — only the values blank out, not the whole control,
    // so the display never flickers empty/unlabeled mid-transition.
    expect(result.current.displayValue).toEqual(NEUTRAL_LFO_VALUE);
    expect(result.current.displayLabel).toBe('Low');
    // Committed selection (and the targeted row it drives) hasn't moved yet — deferred update.
    expect(result.current.selected).toBe('low');
    expect(result.current.isTargeted('low')).toBe(true);
  });

  it('commits the new selection and clears transitioning together once the timeline completes', () => {
    const { result } = renderHook(() => useLfoTargetGroup({ groupId: 'audioRig.eq3', fields: FIELDS }));
    act(() => result.current.select('mid'));
    flushTransition();
    expect(result.current.selected).toBe('mid');
    expect(result.current.transitioning).toBe(false);
    expect(result.current.displayValue).toEqual(lfo(2));
    expect(result.current.displayLabel).toBe('Mid');
    expect(result.current.isTargeted('mid')).toBe(true);
    expect(result.current.isTargeted('low')).toBe(false);
  });

  it('registers the transition timeline in timelineMap under `lfo-target-group-${groupId}`', () => {
    const { result } = renderHook(() => useLfoTargetGroup({ groupId: 'audioRig.eq3', fields: FIELDS }));
    act(() => result.current.select('mid'));
    expect(setTimeline).toHaveBeenCalledWith('lfo-target-group-audioRig.eq3', expect.anything());
  });

  it('kills any in-flight transition timeline before starting a new one', () => {
    const { result } = renderHook(() => useLfoTargetGroup({ groupId: 'audioRig.eq3', fields: FIELDS }));
    act(() => result.current.select('mid'));
    act(() => result.current.select('high'));
    expect(killTimeline).toHaveBeenCalledWith('lfo-target-group-audioRig.eq3');
  });

  it('falls back to the new fields[0] when the currently-selected field disappears from a new fields prop', () => {
    const { result, rerender } = renderHook(
      ({ fields }: { fields: LfoTargetGroupField[] }) => useLfoTargetGroup({ groupId: 'robotOptions.layer2', fields }),
      { initialProps: { fields: FIELDS } },
    );
    act(() => result.current.select('high'));
    flushTransition();
    expect(result.current.selected).toBe('high');

    const withoutHigh = FIELDS.filter((f) => f.field !== 'high');
    rerender({ fields: withoutHigh });

    expect(result.current.selected).toBe('low');
    expect(result.current.transitioning).toBe(false);
  });

  it('does not fall back when the currently-selected field is still present in a new fields prop', () => {
    const { result, rerender } = renderHook(
      ({ fields }: { fields: LfoTargetGroupField[] }) => useLfoTargetGroup({ groupId: 'robotOptions.layer1', fields }),
      { initialProps: { fields: FIELDS } },
    );
    act(() => result.current.select('mid'));
    flushTransition();

    rerender({ fields: [...FIELDS] });

    expect(result.current.selected).toBe('mid');
  });

  it('calls killTimeline for `lfo-target-group-${groupId}` on unmount', () => {
    const { unmount } = renderHook(() => useLfoTargetGroup({ groupId: 'robotOptions.volume', fields: FIELDS }));
    unmount();
    expect(killTimeline).toHaveBeenCalledWith('lfo-target-group-robotOptions.volume');
  });

  it('uses a GSAP timeline (not a raw timer) for the transition scaffold', () => {
    const { result } = renderHook(() => useLfoTargetGroup({ groupId: 'audioRig.eq3', fields: FIELDS }));
    act(() => result.current.select('mid'));
    expect(gsap.timeline).toHaveBeenCalled();
  });
});

describe('useLfoTargetGroup reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 16)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'useLfoTargetGroup.ts'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]|'Power (on|off)'|'Mutation'|`(Increment|Decrement) \$\{|Held off by Audio Load|>Power off\?<|All audio will stop\./);
    expect(source).not.toMatch(/^\s+(triangle|sine|square|sawtooth): '[A-Z]/m);
  });
});
