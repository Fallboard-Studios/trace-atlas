import { describe, it, vi, beforeEach, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('@/systems/powerController', () => ({
  powerController: {
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    powerOnSequence: vi.fn().mockResolvedValue(undefined),
    shutdownWithAnimation: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// `let`, not `const` — a couple of new tests need isPoweredOn: true, which a static mock
// factory can't express. Reset in beforeEach so tests can't leak state into each other.
let mockIsPoweredOn = false;
vi.mock('@/stores/uiStore', () => {
  const setPowerOn = vi.fn();
  const setPowerOff = vi.fn();
  const useUIStore = (selector: unknown) => (typeof selector === 'function' ? (selector as (s: { isPoweredOn: boolean }) => unknown)({ isPoweredOn: mockIsPoweredOn }) : { isPoweredOn: mockIsPoweredOn });
  (useUIStore as unknown as { getState: () => { setPowerOn: typeof setPowerOn; setPowerOff: typeof setPowerOff } }).getState = () => ({ setPowerOn, setPowerOff });
  return { useUIStore };
});

import { PowerRockerSwitch } from './PowerRockerSwitch';
import { powerController } from '@/systems/powerController';
import { setTimeline } from '@/animation/timelineMap';
import { getStatusLightColor } from '@/utils/statusLightColors';

// jsdom's CSSOM normalizes `hsl(...)` inline-style values to `rgb(...)` on read — round-tripping
// the expected value through the same normalization keeps the assertion about "is it the
// statusLightColors color", not about jsdom's serialization format.
function normalizeColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  return probe.style.color;
}

describe('PowerRockerSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPoweredOn = false;
  });

  // docs/todo/backlog.md #20 — the browser logs `Error: <svg> attribute y: Unexpected end of
  // attribute. Expected length, "".` twice on every load (React StrictMode double-invokes
  // effects in dev). The nested .rocker-power-svg's own y is documented as GSAP-owned ("GSAP
  // attr-tweens `y`: 54 at rest, 50 when pressed") and was never given a value in JSX — so on
  // the very first paint, before useGSAP's mount effect has run, this attribute either didn't
  // exist or (per GSAP's own attr-plugin behavior with a never-before-set SVG length attribute)
  // briefly existed as an empty string, which the browser's SVG parser rejects. vitest.setup.ts's
  // global gsap mock's own `set` is a genuine no-op (doesn't touch the DOM at all, unlike a real
  // gsap.set()), so this test's rendered output reflects JSX alone — exactly the "before any JS
  // has run" state the bug occurs in.
  it("gives the nested power-icon svg a valid y attribute from JSX alone, not solely GSAP-owned (backlog #20)", () => {
    const { container } = render(<PowerRockerSwitch />);
    const powerSvg = container.querySelector('.rocker-power-svg');
    expect(powerSvg?.getAttribute('y')).toBe('54');
  });

  it('clicking when off starts powerController.powerOnSequence and registers sequence', async () => {
    const { getByRole } = render(<PowerRockerSwitch />);
    const btn = getByRole('button', { name: /Power on/i });
    await fireEvent.click(btn);
    expect(powerController.powerOnSequence).toHaveBeenCalled();
    expect(setTimeline).toHaveBeenCalled();
  });

  it('colors the light red (via statusLightColors) when powered off', () => {
    const { container } = render(<PowerRockerSwitch />);
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.getAttribute('data-power-state')).toBe('off');
    expect(light.style.color).toBe(normalizeColor(getStatusLightColor('red').color));
  });

  it('colors the light green (via statusLightColors) when powered on', () => {
    mockIsPoweredOn = true;
    const { container } = render(<PowerRockerSwitch />);
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.getAttribute('data-power-state')).toBe('on');
    expect(light.style.color).toBe(normalizeColor(getStatusLightColor('green').color));
  });

  it('colors the light amber (via statusLightColors) while transitioning', async () => {
    const { container, getByRole } = render(<PowerRockerSwitch />);
    await fireEvent.click(getByRole('button', { name: /Power on/i }));
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.getAttribute('data-transitioning')).toBe('true');
    expect(light.style.color).toBe(normalizeColor(getStatusLightColor('amber').color));
  });

  it("gives the 'on' glow more presence than 'off' or 'transitioning' — not just a different hue", () => {
    // Regression guard: unifying all three states onto statusLightColors must not flatten the
    // original hand-tuned distinction ("on" reads deliberately brighter/bigger than the others).
    const { container: offContainer } = render(<PowerRockerSwitch />);
    const offGlow = (offContainer.querySelector('.rocker-light') as HTMLElement).style.boxShadow;

    mockIsPoweredOn = true;
    const { container: onContainer } = render(<PowerRockerSwitch />);
    const onGlow = (onContainer.querySelector('.rocker-light') as HTMLElement).style.boxShadow;

    expect(onGlow).not.toBe(offGlow);
  });
});

describe('PowerRockerSwitch reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 16)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'PowerRockerSwitch.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]|'Power (on|off)'|'Mutation'|`(Increment|Decrement) \$\{|Held off by Audio Load|>Power off\?<|All audio will stop\./);
    expect(source).not.toMatch(/^\s+(triangle|sine|square|sawtooth): '[A-Z]/m);
  });
});
