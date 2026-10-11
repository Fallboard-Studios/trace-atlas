import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

import { PowerRockerSwitch } from './PowerRockerSwitch';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';

/*
 * Crawford, 2026-10-10 (sketch Q11, docs/tasks/LAYOUT_REWORK.md Task 28): on the phone shell the power
 * switch's light is IN the rocker, a lens set into its upper face; the desk shell keeps the recessed housing
 * above the rocker. The light is the same element in both (its colours, glow and pulse are unchanged); only
 * its place differs, and the shell is useShell()'s, the app's one switch.
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

import { powerController } from '@/systems/powerController';
import { getStatusLightColor } from '@/utils/statusLightColors';

const realMatchMedia = window.matchMedia;
const listeners = new Set<() => void>();
let deskWidth = false;

/** A matchMedia whose desk query (useShell's min-width) answers `deskWidth`; flip() fires `change`. */
function stubShell(desk: boolean) {
  deskWidth = desk;
  listeners.clear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() { return /min-width/.test(query) ? deskWidth : false; },
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }),
  });
}
const flipTo = (desk: boolean) => act(() => { deskWidth = desk; listeners.forEach((cb) => cb()); });

function normalizeColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  return probe.style.color;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPoweredOn = false;
});
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
});

describe('PowerRockerSwitch — the light on the phone shell', () => {
  beforeEach(() => stubShell(false));

  it('has no recessed housing: the light is not a separate pocket above the rocker', () => {
    const { container } = render(<PowerRockerSwitch />);
    expect(container.querySelector('.rocker-light-housing')).toBeNull();
  });

  it('sets the light inside the rocker\'s bezel, beside the button that is the click target', () => {
    const { container } = render(<PowerRockerSwitch />);
    const bezel = container.querySelector('.rocker-bezel');
    const light = container.querySelector('.rocker-light');
    expect(light).not.toBeNull();
    expect(bezel?.contains(light)).toBe(true);
    expect(container.querySelector('.rocker-panel')?.classList.contains('rocker-panel--in-button')).toBe(true);
  });

  it('keeps the light out of the button: a status element inside a button is not announced as one', () => {
    const { container } = render(<PowerRockerSwitch />);
    expect(container.querySelector('.rocker-el')?.querySelector('.rocker-light')).toBeNull();
  });

  it('still reports the power state to assistive tech, and there is exactly one light and one button', () => {
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
  ] as const)('colours the in-button light for the %s state from statusLightColors', (state, powered, colour) => {
    mockIsPoweredOn = powered;
    const { container } = render(<PowerRockerSwitch />);
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.getAttribute('data-power-state')).toBe(state);
    expect(light.style.color).toBe(normalizeColor(getStatusLightColor(colour).color));
    expect(light.style.boxShadow).not.toBe('');
  });

  it('turns the in-button light amber while the rocker is moving, and clicking the rocker still powers on', async () => {
    const { container, getByRole } = render(<PowerRockerSwitch />);
    await fireEvent.click(getByRole('button', { name: /Power on/i }));
    expect(powerController.powerOnSequence).toHaveBeenCalled();
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.getAttribute('data-transitioning')).toBe('true');
    expect(light.style.color).toBe(normalizeColor(getStatusLightColor('amber').color));
  });
});

describe('PowerRockerSwitch — the light on the desk shell', () => {
  beforeEach(() => stubShell(true));

  it('keeps the recessed housing above the rocker, with the light in it', () => {
    const { container } = render(<PowerRockerSwitch />);
    const housing = container.querySelector('.rocker-light-housing');
    expect(housing).not.toBeNull();
    expect(housing?.querySelector('.rocker-light')).not.toBeNull();
    expect(container.querySelector('.rocker-bezel')?.querySelector('.rocker-light')).toBeNull();
    expect(container.querySelector('.rocker-panel')?.classList.contains('rocker-panel--in-button')).toBe(false);
  });

  it('colours the housed light exactly as before', () => {
    mockIsPoweredOn = true;
    const { container } = render(<PowerRockerSwitch />);
    const light = container.querySelector('.rocker-light') as HTMLElement;
    expect(light.style.color).toBe(normalizeColor(getStatusLightColor('green').color));
  });
});

describe('PowerRockerSwitch — the shell changes under it', () => {
  it('moves the light into the rocker when the window narrows to the phone, and back out when it widens', () => {
    stubShell(true);
    const { container } = render(<PowerRockerSwitch />);
    expect(container.querySelector('.rocker-light-housing')).not.toBeNull();
    flipTo(false);
    expect(container.querySelector('.rocker-light-housing')).toBeNull();
    expect(container.querySelector('.rocker-bezel .rocker-light')).not.toBeNull();
    flipTo(true);
    expect(container.querySelector('.rocker-light-housing .rocker-light')).not.toBeNull();
    expect(container.querySelector('.rocker-bezel .rocker-light')).toBeNull();
  });

  it('keeps the light\'s power state across the move', () => {
    mockIsPoweredOn = true;
    stubShell(true);
    const { container } = render(<PowerRockerSwitch />);
    flipTo(false);
    expect((container.querySelector('.rocker-light') as HTMLElement).getAttribute('data-power-state')).toBe('on');
  });
});

describe('PowerRockerSwitch.css — the in-button light', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'PowerRockerSwitch.css'), 'utf-8');

  it('makes the bezel the light\'s positioning context', () => {
    expect(getCssRuleBody(css, '.rocker-panel--in-button .rocker-bezel')).toContain('position: relative;');
  });

  it('lays the light over the rocker\'s upper face as a small lens, never taking a click', () => {
    const body = getCssRuleBody(css, '.rocker-panel--in-button .rocker-light');
    expect(body).not.toBeNull();
    expect(body).toContain('position: absolute;');
    expect(body).toContain('pointer-events: none;');
    expect(body).toMatch(/top:/);
    expect(body).toMatch(/width:/);
    expect(body).toMatch(/height:/);
  });
});
