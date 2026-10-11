import { describe, it, expect } from 'vitest';
import * as deckCameraConstants from './deckCamera';

// Deck-camera follow, Task 4 (docs/specs/DECK_CAMERA_FOLLOW.md §1.6).
describe('deck camera follow constants', () => {
  it('holds a followed robot for 20 s', () => {
    expect(deckCameraConstants.DECK_CAMERA_FOLLOW_MS).toBe(20000);
  });

  it('rests 8 s between a follow ending and the next pick', () => {
    expect(deckCameraConstants.DECK_CAMERA_COOLDOWN_MS).toBe(8000);
  });

  it('prefers robots with more than 50 % battery', () => {
    expect(deckCameraConstants.DECK_CAMERA_MIN_BATTERY_PCT).toBe(50);
  });

  it.each(['DECK_CAMERA_FOLLOW_MS', 'DECK_CAMERA_COOLDOWN_MS', 'DECK_CAMERA_MIN_BATTERY_PCT'] as const)(
    '%s is a finite positive number',
    (name) => {
      const value = deckCameraConstants[name];
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    },
  );

  it('the battery threshold is a percentage, below 100 so a full robot can still qualify', () => {
    expect(deckCameraConstants.DECK_CAMERA_MIN_BATTERY_PCT).toBeLessThan(100);
  });

  it('a follow outlasts a cooldown (the camera spends more time on a robot than between them)', () => {
    expect(deckCameraConstants.DECK_CAMERA_FOLLOW_MS).toBeGreaterThan(deckCameraConstants.DECK_CAMERA_COOLDOWN_MS);
  });

  it('keeps the two constants that are unchanged', () => {
    expect(deckCameraConstants.DECK_CAMERA_PAN_S).toBe(1.4);
    expect(deckCameraConstants.DECK_CAMERA_TIMELINE_ID).toBe('deck-camera');
  });

  it('no longer exports the station-cut chance (the lifecycle cut is gone)', () => {
    expect(deckCameraConstants).not.toHaveProperty('DECK_CAMERA_STATION_CHANCE');
  });
});
