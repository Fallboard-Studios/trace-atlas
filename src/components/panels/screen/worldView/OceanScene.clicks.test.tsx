import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// Phase 43 Task 33 (spec §1.10 "Clicks"): six full-screen <svg> layers stack over one another, and
// the front robots layer and the static front layer sit above the back robot row. jsdom does no hit
// testing, but it does cascade and inherit `pointer-events`, so this file loads the real
// OceanScene.css, renders the real <Robot> in both rows, and checks the browser's rule from the
// DOM: a click reaches a back-row robot only if nothing drawn above it takes pointer events — so
// every node in the scene outside a `.robot` must resolve to `none` — and the robot itself must
// resolve to something else. Then the click is dispatched and must select the robot.

// Robot.tsx's own click routing is what's under test, not the gem or the work loop — the same
// boundary Robot.test.tsx draws.
vi.mock('@/components/robot/RobotBody', () => ({
  RobotBody: ({ robot }: { robot: { id: string } }) => <rect data-robot-body={robot.id} width="10" height="10" />,
}));
vi.mock('@/systems/workLoop', () => ({ onRobotMounted: vi.fn() }));
// Drawn, so the inherited-pointer-events check covers the station fragments too.
vi.mock('@/components/stations/ChargingStation', () => ({
  ChargingStation: (props: { station: { id: string }; fragment: string }) => (
    <rect data-station-mock={props.station.id} data-fragment={props.fragment} width="10" height="10" />
  ),
}));
vi.mock('@/components/actors/BubbleLayer', () => ({ BubbleLayer: () => <circle data-bubble-stub r="4" /> }));
vi.mock('@/systems/worldTransition', () => ({ initializeLocale: vi.fn() }));
vi.mock('@/systems/robotSystems', () => ({ stopRobotLifecycle: vi.fn() }));
const { consumeSessionSharePayloadMock } = vi.hoisted(() => ({ consumeSessionSharePayloadMock: vi.fn(() => null) }));
vi.mock('@/utils/sessionShareUtils', () => ({
  getSessionSharePayload: () => null,
  consumeSessionSharePayload: () => consumeSessionSharePayloadMock(),
}));
vi.mock('@/utils/sessionDiff', () => ({ applySessionPayload: vi.fn() }));

import { OceanScene } from './OceanScene';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import type { Robot as RobotType } from '@/types/Robot';

function makeRobot(overrides: Partial<RobotType> = {}): RobotType {
  return {
    id: 'r1',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 80,
    ...overrides,
  } as RobotType;
}

const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'OceanScene.css'), 'utf-8');
let style: HTMLStyleElement;
beforeAll(() => {
  style = document.createElement('style');
  style.textContent = cssSource;
  document.head.appendChild(style);
});
afterAll(() => style.remove());

const pointerEvents = (el: Element) => getComputedStyle(el).pointerEvents;

describe('OceanScene clicks through the stacked layers (Phase 43 Task 33)', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({
      locales: {
        [DEFAULT_LOCALE_ID]: {
          ...DEFAULT_LOCALE,
          robots: [makeRobot({ id: 'front-bot' }), makeRobot({ id: 'back-bot', layer: 'background' })],
          actors: [],
        },
      },
    });
    useUIStore.getState().selectRobot(null);
    useUIStore.getState().setActiveHubTile(null);
  });

  it('the stylesheet is live in this document (the checks below would pass vacuously without it)', () => {
    const { container } = render(<OceanScene />);
    expect(pointerEvents(container.querySelector('svg.ocean-scene__layer')!)).toBe('none');
  });

  it('nothing in the scene outside a robot takes pointer events — no layer, tint, building group or station', () => {
    const { container } = render(<OceanScene />);
    const scene = container.querySelector('.ocean-scene')!;
    const outsideRobots = Array.from(scene.querySelectorAll('*')).filter((el) => !el.closest('.robot'));
    // The six layers, the tints, the row groups and the stations are all in the list.
    expect(outsideRobots.filter((el) => el.matches('svg.ocean-scene__layer'))).toHaveLength(6);
    expect(outsideRobots.some((el) => el.hasAttribute('data-station-mock'))).toBe(true);
    for (const el of outsideRobots) {
      expect({ el: el.tagName + (el.id ? `#${el.id}` : ''), pe: pointerEvents(el) }).toEqual({
        el: el.tagName + (el.id ? `#${el.id}` : ''),
        pe: 'none',
      });
    }
  });

  it('both rows\' robots take pointer events, down to their drawn shapes', () => {
    const { container } = render(<OceanScene />);
    for (const id of ['back-bot', 'front-bot']) {
      const body = container.querySelector(`[data-robot-body="${id}"]`)!;
      expect(body).not.toBeNull();
      expect(pointerEvents(body.closest('.robot')!)).not.toBe('none');
      expect(pointerEvents(body)).not.toBe('none');
    }
  });

  it('a click on a back-row robot selects it', () => {
    const { container } = render(<OceanScene />);
    const body = container.querySelector('[data-robot-body="back-bot"]')!;
    expect(body.closest('svg.ocean-scene__layer')!.getAttribute('data-scene-layer')).toBe('robots-back');
    fireEvent.click(body);
    expect(useUIStore.getState().selectedRobotId).toBe('back-bot');
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });

  it('a click on a front-row robot still selects it', () => {
    const { container } = render(<OceanScene />);
    const body = container.querySelector('[data-robot-body="front-bot"]')!;
    expect(body.closest('svg.ocean-scene__layer')!.getAttribute('data-scene-layer')).toBe('robots');
    fireEvent.click(body);
    expect(useUIStore.getState().selectedRobotId).toBe('front-bot');
  });
});
