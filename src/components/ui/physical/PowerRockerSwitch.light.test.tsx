import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { useEffect } from 'react';
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

/*
 * Crawford, 2026-10-10 (sketch Q11, docs/tasks/LAYOUT_REWORK.md Task 28), then: "have the light appear to be
 * along the surface of the switch ... at rest it should be tilted forward like the surface of the switch is.
 * On click the switch rocks up, and the light should rotate and move with it ... rotating around the center of
 * the rocker switch ... use it on desktop like this."
 *
 * So on both shells the light is IN the rocker: a lens on a pivot layer laid over the button. The pivot is
 * rotated about the ridge (the rocker's centre) — tilted at rest, flat when the rocker is pressed — by the same
 * timelines, durations and eases that move the rocker's faces. The light is still the one status element, and
 * the housing it used to sit in is gone.
 */
vi.mock('@/systems/powerController', () => ({
  powerController: {
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    powerOnSequence: vi.fn().mockResolvedValue(undefined),
    shutdownWithAnimation: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

let mockIsPoweredOn = false;
vi.mock('@/stores/uiStore', () => {
  const useUIStore = (selector: unknown) => (typeof selector === 'function' ? (selector as (s: { isPoweredOn: boolean }) => unknown)({ isPoweredOn: mockIsPoweredOn }) : { isPoweredOn: mockIsPoweredOn });
  (useUIStore as unknown as { getState: () => object }).getState = () => ({ setPowerOn: vi.fn(), setPowerOff: vi.fn() });
  return { useUIStore };
});

// A recording GSAP: every set / to / fromTo is kept with its target and vars, so the test reads what the
// rocker was told to do. useGSAP runs its callback on mount (as the real one does) and contextSafe is a
// pass-through; selector resolves real DOM nodes so the faces are found.
interface Call { method: 'set' | 'to' | 'fromTo'; target: unknown; from?: Record<string, unknown>; vars: Record<string, unknown>; position?: unknown }
const calls: Call[] = [];
vi.mock('gsap', () => {
  const timeline = () => {
    const tl: Record<string, unknown> = {};
    tl.to = (target: unknown, vars: Record<string, unknown>, position?: unknown) => { calls.push({ method: 'to', target, vars, position }); return tl; };
    tl.fromTo = (target: unknown, from: Record<string, unknown>, vars: Record<string, unknown>, position?: unknown) => { calls.push({ method: 'fromTo', target, from, vars, position }); return tl; };
    tl.call = () => tl;
    tl.kill = () => undefined;
    return tl;
  };
  const gsap = {
    timeline,
    set: (target: unknown, vars: Record<string, unknown>) => { calls.push({ method: 'set', target, vars }); },
    utils: { selector: (root: Element) => (query: string) => Array.from(root.querySelectorAll(query)) },
  };
  return { default: gsap, ...gsap };
});
vi.mock('@gsap/react', () => ({
  useGSAP: (callback: () => void) => {
    useEffect(() => { callback(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return { contextSafe: <T,>(fn: T) => fn };
  },
}));

import { PowerRockerSwitch } from './PowerRockerSwitch';
import { LIGHT_PERSPECTIVE, LIGHT_PRESSED_ANGLE, LIGHT_REST_ANGLE, RIDGE_ORIGIN_PERCENT } from './rockerGeometry';
import { powerController } from '@/systems/powerController';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { getStatusLightColor } from '@/utils/statusLightColors';

function normalizeColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  return probe.style.color;
}

const pivotIn = (container: HTMLElement) => container.querySelector('.rocker-light-pivot') as HTMLElement;
const callsOn = (target: unknown) => calls.filter((c) => c.target === target);

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  mockIsPoweredOn = false;
});

describe('PowerRockerSwitch — where the light is', () => {
  it('sits on a pivot layer in the rocker\'s bezel, over the button, with no housing above the rocker', () => {
    const { container } = render(<PowerRockerSwitch />);
    expect(container.querySelector('.rocker-light-housing')).toBeNull();
    const pivot = pivotIn(container);
    expect(pivot).not.toBeNull();
    expect(container.querySelector('.rocker-bezel')?.contains(pivot)).toBe(true);
    expect(pivot.querySelector('.rocker-light')).not.toBeNull();
    expect(pivot.getAttribute('aria-hidden')).toBeNull();
  });

  it('keeps the pivot out of the button, so the light stays an announced status element', () => {
    const { container } = render(<PowerRockerSwitch />);
    expect(container.querySelector('.rocker-el')?.contains(pivotIn(container))).toBe(false);
  });

  it('has exactly one light and one button, and the light reports the power state', () => {
    const { container, getAllByRole } = render(<PowerRockerSwitch />);
    expect(container.querySelectorAll('.rocker-light')).toHaveLength(1);
    expect(getAllByRole('button')).toHaveLength(1);
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.getAttribute('role')).toBe('status');
    expect(light.getAttribute('aria-label')).toBeTruthy();
  });

  it.each([
    ['off', false, 'red'],
    ['on', true, 'green'],
  ] as const)('colours the light for the %s state from statusLightColors, with a glow', (state, powered, colour) => {
    mockIsPoweredOn = powered;
    const { container } = render(<PowerRockerSwitch />);
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.getAttribute('data-power-state')).toBe(state);
    expect(light.style.color).toBe(normalizeColor(getStatusLightColor(colour).color));
    expect(light.style.boxShadow).not.toBe('');
  });

  it('turns amber while the rocker is moving', async () => {
    const { container, getByRole } = render(<PowerRockerSwitch />);
    await fireEvent.click(getByRole('button', { name: /Power on/i }));
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.getAttribute('data-transitioning')).toBe('true');
    expect(light.style.color).toBe(normalizeColor(getStatusLightColor('amber').color));
  });
});

describe('PowerRockerSwitch — the light follows the rocker', () => {
  it('starts tilted forward, rotating about the ridge, with a perspective, before any click', () => {
    const { container } = render(<PowerRockerSwitch />);
    const sets = callsOn(pivotIn(container)).filter((c) => c.method === 'set');
    expect(sets).toHaveLength(1);
    expect(sets[0].vars).toMatchObject({
      rotateX: LIGHT_REST_ANGLE,
      transformPerspective: LIGHT_PERSPECTIVE,
      transformOrigin: `50% ${RIDGE_ORIGIN_PERCENT}%`,
    });
  });

  it('gives the first paint the same tilt from JSX, before GSAP has run', () => {
    // vitest's recording gsap does not touch the DOM, so what the pivot carries here is JSX alone.
    const { container } = render(<PowerRockerSwitch />);
    const style = pivotIn(container).style;
    expect(style.transform).toBe(`perspective(${LIGHT_PERSPECTIVE}px) rotateX(${LIGHT_REST_ANGLE}deg)`);
    expect(style.transformOrigin).toBe(`50% ${RIDGE_ORIGIN_PERCENT}%`);
  });

  it('on a click, rocks the light flat in the same tween the rocker\'s faces press in', () => {
    const { container, getByRole } = render(<PowerRockerSwitch />);
    calls.length = 0;
    fireEvent.click(getByRole('button', { name: /Power on/i }));

    const pivotTweens = callsOn(pivotIn(container)).filter((c) => c.method === 'to');
    expect(pivotTweens).toHaveLength(1);
    expect(pivotTweens[0].vars.rotateX).toBe(LIGHT_PRESSED_ANGLE);
    // Start-synced with the faces ('<'), over their duration and on their ease.
    const topFace = calls.find((c) => c.method === 'to' && (c.target as Element)?.classList?.contains('rocker-top'));
    expect(topFace).toBeDefined();
    expect(pivotTweens[0].vars.duration).toBe(topFace!.vars.duration);
    expect(pivotTweens[0].vars.ease).toBe(topFace!.vars.ease);
    expect(pivotTweens[0].position).toBe('<');
  });

  it('on the return, rocks the light back to its tilt over the faces return time, on their ease, from flat', () => {
    const { container, getByRole } = render(<PowerRockerSwitch />);
    fireEvent.click(getByRole('button', { name: /Power on/i }));
    // The power-on sequence returns the rocker in its second step (a 0.5 s delay whose onComplete is
    // returnRocker): run it, as the timeline would.
    const returnStep = calls.find((c) => c.method === 'to' && c.vars.duration === 0.5 && typeof c.vars.onComplete === 'function');
    expect(returnStep).toBeDefined();
    calls.length = 0;
    (returnStep!.vars.onComplete as () => void)();

    const pivotReturns = callsOn(pivotIn(container)).filter((c) => c.method === 'fromTo');
    expect(pivotReturns).toHaveLength(1);
    expect(pivotReturns[0].from).toMatchObject({ rotateX: LIGHT_PRESSED_ANGLE });
    expect(pivotReturns[0].vars.rotateX).toBe(LIGHT_REST_ANGLE);
    const topFace = calls.find((c) => c.method === 'fromTo' && (c.target as Element)?.classList?.contains('rocker-top'));
    expect(topFace).toBeDefined();
    expect(pivotReturns[0].vars.duration).toBe(topFace!.vars.duration);
    expect(pivotReturns[0].vars.ease).toBe(topFace!.vars.ease);
    expect(pivotReturns[0].position).toBe('<');
  });

  it('the click itself still starts the power-on sequence', () => {
    const { getByRole } = render(<PowerRockerSwitch />);
    fireEvent.click(getByRole('button', { name: /Power on/i }));
    const startStep = calls.find((c) => c.method === 'to' && c.vars.duration === 0.18 && typeof c.vars.onComplete === 'function');
    (startStep!.vars.onComplete as () => void)();
    expect(powerController.powerOnSequence).toHaveBeenCalledTimes(1);
  });
});

describe('PowerRockerSwitch.css — the pivot', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'PowerRockerSwitch.css'), 'utf-8');

  it('lays the pivot over exactly the button: inside the bezel\'s padding, and never taking a click', () => {
    const body = getCssRuleBody(css, '.rocker-light-pivot');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('pointer-events: none;');
    expect(body).toContain('inset: var(--rocker-bezel-padding);');
    expect(getCssRuleBody(css, '.rocker-bezel')).toContain('position: relative;');
  });

  it('keeps the transform out of the stylesheet: GSAP owns it', () => {
    expect(getCssRuleBody(css, '.rocker-light-pivot')).not.toMatch(/transform/);
  });

  it('lays the lens on the top face, small and centred', () => {
    const body = getCssRuleBody(css, '.rocker-light-pivot .rocker-light');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toMatch(/top:/);
    expect(body).toMatch(/width:/);
    expect(body).toContain('height: 10px;');
    // Twice the earlier 5px, grown about the same centre (22% down, plus half the old height) so it stays on the face.
    expect(body).toContain('top: calc(22% - 2.5px - var(--rocker-light-border));');
    // A thin black border around the lens (Crawford, 2026-10-10), 3px, drawn outside it: the lens keeps its size
    // and place, and the border adds to the box rather than eating the 10px.
    expect(body).toContain('--rocker-light-border: 3px;');
    expect(body).toContain('border: var(--rocker-light-border) solid #000;');
    expect(body).toContain('box-sizing: content-box;');
  });

  it('has no housing rule left', () => {
    expect(css).not.toContain('.rocker-light-housing');
  });
});

afterEach(() => {
  calls.length = 0;
});
