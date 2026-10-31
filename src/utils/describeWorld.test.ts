import { describe, it, expect } from 'vitest';
import { describeWorld } from './describeWorld';

/*
 * docs/tasks/OFF_SCREEN.md Task 9 (spec assumption 8): one name for a world, shared by the off screen's Current
 * row, its readout and (Task 33) Foundry's status line. Two shapes, byte-exact: `AS · (x, y)` for a world that
 * is nothing but its seed, and `<label> · AS (x, y)` when a save or preset name fronts it.
 */
describe('describeWorld', () => {
  it('names a bare world "AS · (x, y)"', () => {
    expect(describeWorld({ attenuationStyleName: 'kr1nd4ra', coordinates: { x: 12, y: 68 } })).toBe('kr1nd4ra · (12, 68)');
  });

  it('puts a save or preset name in front: "<label> · AS (x, y)"', () => {
    expect(describeWorld({ attenuationStyleName: 'dusk', coordinates: { x: 12, y: 68 } }, 'Dusk Run')).toBe('Dusk Run · dusk (12, 68)');
  });

  it('renders negative coordinates with the plain minus the Seeds status line uses, in both shapes', () => {
    expect(describeWorld({ attenuationStyleName: 'tr3nch-2', coordinates: { x: -30, y: -30 } })).toBe('tr3nch-2 · (-30, -30)');
    expect(describeWorld({ attenuationStyleName: 'qb9mezm3', coordinates: { x: -84, y: 131 } }, 'Vessport Null')).toBe(
      'Vessport Null · qb9mezm3 (-84, 131)',
    );
  });

  it('renders a negative zero as 0', () => {
    expect(describeWorld({ attenuationStyleName: 'a', coordinates: { x: -0, y: 0 } })).toBe('a · (0, 0)');
  });

  it('an empty label is no label', () => {
    expect(describeWorld({ attenuationStyleName: 'a', coordinates: { x: 1, y: 2 } }, '')).toBe('a · (1, 2)');
  });

  it('passes the name and the label through exactly: spaces, punctuation and case are kept', () => {
    expect(describeWorld({ attenuationStyleName: 'Pelagos 7!', coordinates: { x: 29, y: -14 } }, 'Night, all freelance')).toBe(
      'Night, all freelance · Pelagos 7! (29, -14)',
    );
  });

  it('is pure: the same identity always gives the same string and the identity is not mutated', () => {
    const identity = { attenuationStyleName: 'n40dh8p8', coordinates: { x: 29, y: -14 } };
    const before = structuredClone(identity);
    expect(describeWorld(identity)).toBe(describeWorld(identity));
    expect(identity).toEqual(before);
  });
});
