import { describe, it, expect } from 'vitest';
import { describeWorld } from './describeWorld';
import { labels } from '@/content';

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

  // band-table T28 (docs/specs/OFF_SCREEN.md assumption 17): the theme and aspects tail, names from content.
  describe('the theme and aspects tail', () => {
    const plot = { attenuationStyleName: 'tr3nch-2', coordinates: { x: -30, y: -30 } };

    it('Classic with no picks is the bare shape, unchanged', () => {
      expect(describeWorld({ ...plot, theme: 'classic', aspects: {} })).toBe('tr3nch-2 · (-30, -30)');
      expect(describeWorld({ ...plot, theme: 'classic', aspects: { melody: [] } })).toBe('tr3nch-2 · (-30, -30)');
    });

    it('a theme other than Classic appends its name', () => {
      expect(describeWorld({ ...plot, theme: 'calm', aspects: {} })).toBe('tr3nch-2 · (-30, -30) · Calm');
    });

    it('the picks append their names joined with " + ", in the list\'s order', () => {
      expect(describeWorld({ ...plot, theme: 'calm', aspects: { melody: ['hypnotic', 'mechanical'] } })).toBe(
        'tr3nch-2 · (-30, -30) · Calm · Hypnotic + Mechanical',
      );
    });

    it('picks under Classic append without a theme segment', () => {
      expect(describeWorld({ ...plot, theme: 'classic', aspects: { melody: ['wandering'] } })).toBe('tr3nch-2 · (-30, -30) · Wandering');
    });

    // docs/tasks/OFF_SCREEN_REVISIONS.md Task 7: Envelope and Distance join the tail, one segment per family, in family
    // order whatever order the record lists them in. The names are stand-in content, read from it.
    it('joins every family in family order, each its own segment', () => {
      const name = (key: Parameters<typeof labels>[0]) => labels(key).humanLabel;
      expect(
        describeWorld({ ...plot, theme: 'bold', aspects: { distance: ['remote'], melody: ['hypnotic'], envelope: ['plucked', 'held'] } }),
      ).toBe(
        `tr3nch-2 · (-30, -30) · Bold · Hypnotic · ${name('home.off.envelope.plucked')} + ${name('home.off.envelope.held')} · ${name('home.off.distance.remote')}`,
      );
    });

    it('an id from another family is left out of a family segment, as an unknown id is', () => {
      expect(describeWorld({ ...plot, theme: 'classic', aspects: { envelope: ['hypnotic'] } })).toBe('tr3nch-2 · (-30, -30)');
    });

    it('a labelled world carries the tail after the plot', () => {
      expect(describeWorld({ attenuationStyleName: 'dusk', coordinates: { x: 12, y: 68 }, theme: 'bold', aspects: { melody: ['hypnotic'] } }, 'Dusk Run')).toBe(
        'Dusk Run · dusk (12, 68) · Bold · Hypnotic',
      );
    });

    it('reads every name from content, so a copy change moves the readout', () => {
      const tail = describeWorld({ ...plot, theme: 'perilous', aspects: { melody: ['hypnotic', 'mechanical', 'wandering'] } });
      expect(tail).toBe(
        `tr3nch-2 · (-30, -30) · ${labels('home.off.theme.perilous').humanLabel} · ${labels('home.off.melody.hypnotic').humanLabel} + ${labels('home.off.melody.mechanical').humanLabel} + ${labels('home.off.melody.wandering').humanLabel}`,
      );
      for (const theme of ['classic', 'calm', 'bold', 'adventurous', 'perilous'] as const) {
        expect(labels(`home.off.theme.${theme}`).humanLabel.length).toBeGreaterThan(0);
      }
    });

    it('an identity with no loading (a pick built from a bare name and plot) reads as before', () => {
      expect(describeWorld(plot)).toBe('tr3nch-2 · (-30, -30)');
      expect(describeWorld(plot, 'Night')).toBe('Night · tr3nch-2 (-30, -30)');
    });
  });
});
