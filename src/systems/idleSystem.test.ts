// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NoiseFunction2D } from 'simplex-noise';

import { pickDestination, handleRobotIdle, pickExitDestination } from './idleSystem';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { RobotState, DockingState } from '../types/Robot';
import type { Robot } from '../types/Robot';

/** General-purpose mock: returns a pseudo-random value in [-1, 1]. */
const mockNoiseMap: NoiseFunction2D = () => Math.random() * 2 - 1;

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'idle-test-robot',
    compositionSeed: 0.5,
    identityColor: '#428d95',
    greebles: [],
    state: RobotState.Idle,
    position: { x: 100, y: 100 },
    destination: null,
    direction: 'right',
    melody: [],
    audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, filterFreq: 800, waveform: 'sine' },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: DockingState.Active,
    batteryLevel: 100,
    ...overrides,
  };
}

// ========================================
// TESTS
// ========================================

describe('idleSystem', () => {
  describe('pickDestination', () => {
    it('generates destination within world bounds', () => {
      const destination = pickDestination(mockNoiseMap, 0, 0);
      expect(destination.x).toBeGreaterThanOrEqual(0);
      expect(destination.x).toBeLessThanOrEqual(1920);
      expect(destination.y).toBeGreaterThanOrEqual(0);
      expect(destination.y).toBeLessThanOrEqual(1080);
    });

    it('generates destination with margin from edges', () => {
      const WORLD_MARGIN = 100;
      const destination = pickDestination(mockNoiseMap, 0, 0);

      // Should be at least WORLD_MARGIN from edges
      expect(destination.x).toBeGreaterThanOrEqual(WORLD_MARGIN);
      expect(destination.x).toBeLessThanOrEqual(1920 - WORLD_MARGIN);
      expect(destination.y).toBeGreaterThanOrEqual(WORLD_MARGIN);
      expect(destination.y).toBeLessThanOrEqual(1080 - WORLD_MARGIN);
    });

    it('generates varied destinations (not all the same)', () => {
      const destinations = Array.from({ length: 20 }, (_, i) => pickDestination(mockNoiseMap, 0, i));
      const uniqueX = new Set(destinations.map((d) => Math.round(d.x)));
      const uniqueY = new Set(destinations.map((d) => Math.round(d.y)));

      // Should have variety
      expect(uniqueX.size).toBeGreaterThan(10);
      expect(uniqueY.size).toBeGreaterThan(10);
    });

    it('generates destinations in center area (not just edges)', () => {
      const destinations = Array.from({ length: 100 }, (_, i) => pickDestination(mockNoiseMap, 0, i));

      // At least some should be in center region (away from all edges)
      const centerRegion = destinations.filter(
        (d) =>
          d.x > 500 &&
          d.x < 1420 &&
          d.y > 300 &&
          d.y < 780
      );

      expect(centerRegion.length).toBeGreaterThanOrEqual(20); // Should have good distribution
    });

    it('uses full available space (not clustered)', () => {
      const destinations = Array.from({ length: 100 }, (_, i) => pickDestination(mockNoiseMap, 0, i));

      // Check distribution across quadrants
      const leftHalf = destinations.filter((d) => d.x < 960).length;
      const rightHalf = destinations.filter((d) => d.x >= 960).length;
      const topHalf = destinations.filter((d) => d.y < 540).length;
      const bottomHalf = destinations.filter((d) => d.y >= 540).length;

      // Should be roughly evenly distributed (within 30/70 split)
      expect(leftHalf).toBeGreaterThan(30);
      expect(leftHalf).toBeLessThan(70);
      expect(rightHalf).toBeGreaterThan(30);
      expect(rightHalf).toBeLessThan(70);
      expect(topHalf).toBeGreaterThan(30);
      expect(topHalf).toBeLessThan(70);
      expect(bottomHalf).toBeGreaterThan(30);
      expect(bottomHalf).toBeLessThan(70);
    });
  });

  describe('pickDestination — yRange', () => {
    it('draws y from the provided range instead of the full world height', () => {
      const yRange = { min: 700, max: 750 };
      const destinations = Array.from({ length: 20 }, (_, i) => pickDestination(mockNoiseMap, 0, i, yRange));

      for (const d of destinations) {
        expect(d.y).toBeGreaterThanOrEqual(700);
        expect(d.y).toBeLessThanOrEqual(750);
      }
    });

    it('defaults to the full margin-clamped world height when no yRange is given', () => {
      const destination = pickDestination(mockNoiseMap, 0, 0);
      expect(destination.y).toBeGreaterThanOrEqual(100);
      expect(destination.y).toBeLessThanOrEqual(980);
    });
  });

  describe('pickExitDestination', () => {
    it('always exits straight down through the bottom edge, preserving x', () => {
      expect(pickExitDestination({ x: 50, y: 400 })).toEqual({ x: 50, y: 1080 + 150 });
    });

    it('exits via the bottom even from near the top edge', () => {
      expect(pickExitDestination({ x: 960, y: 50 })).toEqual({ x: 960, y: 1080 + 150 });
    });

    it('exits via the bottom even from near the right edge', () => {
      expect(pickExitDestination({ x: 1870, y: 400 })).toEqual({ x: 1870, y: 1080 + 150 });
    });

    it('returns a point genuinely outside the world bounds, below the bottom edge', () => {
      const dest = pickExitDestination({ x: 960, y: 540 }); // dead center
      expect(dest.y).toBeGreaterThan(1080);
    });
  });

  describe('handleRobotIdle — docking guard', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it.each([DockingState.Docked, DockingState.Docking, DockingState.Departing])(
      'is a no-op for an Idle robot whose docking is %s',
      (docking) => {
        const robot = makeRobot({ state: RobotState.Idle, docking });
        useLocaleStore.setState((s) => ({
          locales: { ...s.locales, [DEFAULT_LOCALE_ID]: { ...s.locales[DEFAULT_LOCALE_ID], robots: [robot] } },
        }));

        handleRobotIdle(DEFAULT_LOCALE_ID, robot.id);

        const after = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
        expect(after).toEqual(robot); // untouched — state, position, destination all unchanged
      }
    );

    // backlog.md #12: most robots spawn Docked, so Robot.tsx's unconditional mount-time
    // handleRobotIdle call hit this guard — an expected, common precondition-not-met — on 10 of
    // 12 robots every locale load, logged as a console.warn and dominating the console with
    // React's dev-mode component-stack dump on top of each one. Only a genuinely missing robot
    // (the store lookup itself failing) is actually unexpected and worth a warning.
    it.each([DockingState.Docked, DockingState.Docking, DockingState.Departing])(
      'does NOT warn for the ordinary case — an Idle robot whose docking is %s (ordinary, expected precondition, not a bug)',
      (docking) => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const robot = makeRobot({ state: RobotState.Idle, docking });
        useLocaleStore.setState((s) => ({
          locales: { ...s.locales, [DEFAULT_LOCALE_ID]: { ...s.locales[DEFAULT_LOCALE_ID], robots: [robot] } },
        }));

        handleRobotIdle(DEFAULT_LOCALE_ID, robot.id);

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      }
    );

    it('does NOT warn for a non-Idle robot state either (Moving, Interacting, etc. — also an ordinary precondition)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const robot = makeRobot({ state: RobotState.Moving, docking: DockingState.Active });
      useLocaleStore.setState((s) => ({
        locales: { ...s.locales, [DEFAULT_LOCALE_ID]: { ...s.locales[DEFAULT_LOCALE_ID], robots: [robot] } },
      }));

      handleRobotIdle(DEFAULT_LOCALE_ID, robot.id);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('DOES warn when the robot genuinely cannot be found in the store — the actually-unexpected case', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      handleRobotIdle(DEFAULT_LOCALE_ID, 'robot-does-not-exist');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('robot-does-not-exist');
      warnSpy.mockRestore();
    });
  });

  describe('handleRobotIdle — battery/return-aware y-bounds', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    function setupRobot(overrides: Partial<Robot>): Robot {
      const robot = makeRobot(overrides);
      useLocaleStore.setState((s) => ({
        locales: { ...s.locales, [DEFAULT_LOCALE_ID]: { ...s.locales[DEFAULT_LOCALE_ID], robots: [robot] } },
      }));
      return robot;
    }

    it('confines a robot below BATTERY_LOWER_THIRD_THRESHOLD to the lower third of the world view', () => {
      const robot = setupRobot({ batteryLevel: 14 });

      handleRobotIdle(DEFAULT_LOCALE_ID, robot.id);

      const destY = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.destination?.y;
      expect(destY).toBeGreaterThanOrEqual(720);
      expect(destY).toBeLessThanOrEqual(980);
    });

    it('confines a returning robot to the bottom half of the world view, regardless of battery', () => {
      const robot = setupRobot({ batteryLevel: 100 });

      handleRobotIdle(DEFAULT_LOCALE_ID, robot.id, { isReturning: true });

      const destY = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.destination?.y;
      expect(destY).toBeGreaterThanOrEqual(540);
      expect(destY).toBeLessThanOrEqual(980);
    });

    it('isReturning wins over the low-battery lower-third confinement when both would apply', () => {
      const robot = setupRobot({ batteryLevel: 10 }); // also below the lower-third threshold

      handleRobotIdle(DEFAULT_LOCALE_ID, robot.id, { isReturning: true });

      const destY = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.destination?.y;
      expect(destY).toBeGreaterThanOrEqual(540); // bottom half, not the narrower lower third
    });
  });
});
