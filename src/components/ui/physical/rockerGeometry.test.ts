import { describe, it, expect } from 'vitest';

import {
  ROCKER_FACES,
  ROCKER_VIEWBOX_HEIGHT,
  RIDGE_Y,
  RIDGE_ORIGIN_PERCENT,
  LIGHT_REST_ANGLE,
  LIGHT_PRESSED_ANGLE,
  LIGHT_PERSPECTIVE,
  POWER_GLYPH,
  POWER_GLYPH_PRESSED,
  POWER_GLYPH_ORIGIN,
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

/*
 * The power glyph is printed on the bottom face, so it takes that face's pose: the bottom face is flat at rest and
 * drawn foreshortened and narrower at its far edge when pressed, turned about the ridge. A mark printed on it
 * follows by the face's own bilinear map, so that is the oracle: the glyph's pose (a scale about the ridge) must
 * put the glyph's centre line where the face's map does. Measured in Chrome before this existed: the glyph's top
 * and bottom landed ~3 viewBox units too high when pressed, because it was scaled about its own centre and moved
 * by a separate y tween.
 */
const pointsOf = (points: string) => points.trim().split(/\s+/).map((pair) => pair.split(',').map(Number) as [number, number]);

/** Where a point on the bottom face at rest lands when the face is at `pose` (its four points: TL, TR, BR, BL). */
function mapThroughFace(rest: [number, number][], pose: [number, number][], x: number, y: number): [number, number] {
  const [rTL, rTR, , rBL] = rest;
  const s = (x - rTL[0]) / (rTR[0] - rTL[0]);
  const t = (y - rTL[1]) / (rBL[1] - rTL[1]);
  const [TL, TR, BR, BL] = pose;
  const top = [TL[0] + s * (TR[0] - TL[0]), TL[1] + s * (TR[1] - TL[1])];
  const bottom = [BL[0] + s * (BR[0] - BL[0]), BL[1] + s * (BR[1] - BL[1])];
  return [top[0] + t * (bottom[0] - top[0]), top[1] + t * (bottom[1] - top[1])];
}

describe('the power glyph rides the bottom face', () => {
  const bottom = face('rocker-bottom');
  const rest = pointsOf(bottom.rest);
  const pressed = pointsOf(bottom.pressed);
  const centre = { x: POWER_GLYPH.x + POWER_GLYPH.width / 2, y: POWER_GLYPH.y + POWER_GLYPH.height / 2 };
  /** The glyph's pose applied to a point: a scale about POWER_GLYPH_ORIGIN. */
  const posed = (x: number, y: number): [number, number] => [
    POWER_GLYPH_ORIGIN.x + (x - POWER_GLYPH_ORIGIN.x) * POWER_GLYPH_PRESSED.scaleX,
    POWER_GLYPH_ORIGIN.y + (y - POWER_GLYPH_ORIGIN.y) * POWER_GLYPH_PRESSED.scaleY,
  ];

  it('is the own rect of the face at rest: the nested svg sits on the bottom face, clear of the ridge', () => {
    expect(POWER_GLYPH.y).toBeGreaterThan(RIDGE_Y);
    expect(POWER_GLYPH.y + POWER_GLYPH.height).toBeLessThan(Math.max(...rest.map((p) => p[1])));
  });

  it('turns about the ridge, on the face centre line', () => {
    expect(POWER_GLYPH_ORIGIN.y).toBe(RIDGE_Y);
    expect(POWER_GLYPH_ORIGIN.x).toBe(50);
  });

  it('is foreshortened by the same factor as the far edge of the face: (pressed far edge - ridge) / (rest far edge - ridge)', () => {
    const farRest = Math.max(...rest.map((p) => p[1]));
    const farPressed = Math.max(...pressed.map((p) => p[1]));
    expect(POWER_GLYPH_PRESSED.scaleY).toBeCloseTo((farPressed - RIDGE_Y) / (farRest - RIDGE_Y), 5);
    expect(POWER_GLYPH_PRESSED.scaleY).toBeLessThan(1);
  });

  it('is narrowed by the width of the face where the glyph sits, not at its far edge', () => {
    const t = (centre.y - RIDGE_Y) / (Math.max(...rest.map((p) => p[1])) - RIDGE_Y);
    const ridgeWidth = pressed[1][0] - pressed[0][0];
    const farWidth = pressed[2][0] - pressed[3][0];
    const restWidth = rest[1][0] - rest[0][0];
    expect(POWER_GLYPH_PRESSED.scaleX).toBeCloseTo((ridgeWidth + (farWidth - ridgeWidth) * t) / restWidth, 5);
    expect(POWER_GLYPH_PRESSED.scaleX).toBeLessThan(1);
    expect(POWER_GLYPH_PRESSED.scaleX).toBeGreaterThan(farWidth / restWidth); // wider than the far edge: the glyph is nearer the ridge
  });

  it('puts the glyph centre where the own map of the face puts a mark printed there', () => {
    const [fx, fy] = mapThroughFace(rest, pressed, centre.x, centre.y);
    const [gx, gy] = posed(centre.x, centre.y);
    expect(gx).toBeCloseTo(fx, 5);
    expect(gy).toBeCloseTo(fy, 5);
  });

  it('puts the top and bottom centre-line points of the glyph where the map of the face does', () => {
    for (const y of [POWER_GLYPH.y, POWER_GLYPH.y + POWER_GLYPH.height]) {
      const [fx, fy] = mapThroughFace(rest, pressed, centre.x, y);
      const [gx, gy] = posed(centre.x, y);
      // y is exact; x is within a few hundredths: the face tapers, a single scale cannot, so only the centre row is exact.
      expect(Math.abs(gx - fx)).toBeLessThan(0.05);
      expect(gy).toBeCloseTo(fy, 5);
    }
  });

  it('keeps every corner of the glyph within a unit and a half of the map of the face (a scale cannot narrow one edge more than the other)', () => {
    for (const [x, y] of [[POWER_GLYPH.x, POWER_GLYPH.y], [POWER_GLYPH.x + POWER_GLYPH.width, POWER_GLYPH.y], [POWER_GLYPH.x, POWER_GLYPH.y + POWER_GLYPH.height], [POWER_GLYPH.x + POWER_GLYPH.width, POWER_GLYPH.y + POWER_GLYPH.height]]) {
      const [fx, fy] = mapThroughFace(rest, pressed, x, y);
      const [gx, gy] = posed(x, y);
      expect(Math.abs(gx - fx)).toBeLessThan(1.5);
      expect(Math.abs(gy - fy)).toBeLessThan(1.5);
    }
  });
});
