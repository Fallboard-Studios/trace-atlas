import { describe, it, expect } from 'vitest';

import {
  ROCKER_FACES,
  ROCKER_VIEWBOX_HEIGHT,
  RIDGE_Y,
  RIDGE_ORIGIN_PERCENT,
  LIGHT_REST_ANGLE,
  LIGHT_PRESSED_ANGLE,
  LIGHT_PERSPECTIVE,
} from './rockerGeometry';

/*
 * The rocker's face geometry (moved out of PowerRockerSwitch.tsx) and what the light derives from it: the
 * light lies on the top face, so at rest it is tilted by the same foreshortening the face is drawn with, and
 * flat when the face is. Derived, not typed in twice, so the light cannot drift from the face it sits on.
 */
const ys = (points: string) => points.trim().split(/\s+/).map((pair) => Number(pair.split(',')[1]));
const face = (name: string) => ROCKER_FACES.find((f) => f.className === name)!;

describe('ROCKER_FACES', () => {
  it('has the eight faces, each with a rest and a pressed point set', () => {
    expect(ROCKER_FACES.map((f) => f.className)).toEqual([
      'rocker-top-edge', 'rocker-top', 'rocker-top-left', 'rocker-top-right',
      'rocker-bottom-edge', 'rocker-bottom', 'rocker-bottom-left', 'rocker-bottom-right',
    ]);
    for (const f of ROCKER_FACES) {
      expect(f.rest).toMatch(/^(\d+,\d+\s*){4}$/);
      expect(f.pressed).toMatch(/^(\d+,\d+\s*){4}$/);
    }
  });
});

describe('the ridge', () => {
  it('is where the top face meets the bottom face: the y both draw as their shared edge', () => {
    expect(Math.max(...ys(face('rocker-top').rest))).toBe(RIDGE_Y);
    expect(Math.min(...ys(face('rocker-bottom').rest))).toBe(RIDGE_Y);
  });

  it('is the light\'s pivot as a percentage of the rocker\'s height', () => {
    expect(RIDGE_ORIGIN_PERCENT).toBeCloseTo((RIDGE_Y / ROCKER_VIEWBOX_HEIGHT) * 100, 5);
    expect(RIDGE_ORIGIN_PERCENT).toBeGreaterThan(0);
    expect(RIDGE_ORIGIN_PERCENT).toBeLessThan(100);
  });
});

describe('the light\'s angles', () => {
  const restHeight = RIDGE_Y - Math.min(...ys(face('rocker-top').rest));
  const flatHeight = RIDGE_Y - Math.min(...ys(face('rocker-top').pressed));

  it('is flat when the top face is flat (pressed)', () => {
    expect(LIGHT_PRESSED_ANGLE).toBe(0);
  });

  it('is tilted forward at rest by the foreshortening the top face is drawn with: cos(angle) = rest height / flat height', () => {
    expect(restHeight).toBeLessThan(flatHeight);
    expect(Math.cos((LIGHT_REST_ANGLE * Math.PI) / 180)).toBeCloseTo(restHeight / flatHeight, 3);
  });

  it('tilts the top edge away (a positive rotateX), a believable few tens of degrees', () => {
    expect(LIGHT_REST_ANGLE).toBeGreaterThan(20);
    expect(LIGHT_REST_ANGLE).toBeLessThan(60);
  });

  it('has a perspective deep enough that the tilt reads as a surface, not a fisheye', () => {
    expect(LIGHT_PERSPECTIVE).toBeGreaterThan(100);
  });
});
