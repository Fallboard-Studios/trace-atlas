import { describe, it, expect } from 'vitest';
import { describeLoading, describeWorld } from './describeWorld';
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
      expect(describeWorld({ ...plot, theme: 'float', aspects: {} })).toBe('tr3nch-2 · (-30, -30) · Float');
    });

    it('the picks append their names joined with " + ", in the list\'s order', () => {
      expect(describeWorld({ ...plot, theme: 'float', aspects: { melody: ['hypnotic', 'mechanical'] } })).toBe(
        'tr3nch-2 · (-30, -30) · Float · Hypnotic + Mechanical',
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
        describeWorld({ ...plot, theme: 'anchor', aspects: { distance: ['remote'], melody: ['hypnotic'], envelope: ['plucked', 'held'] } }),
      ).toBe(
        `tr3nch-2 · (-30, -30) · Anchor · Hypnotic · ${name('home.off.envelope.plucked')} + ${name('home.off.envelope.held')} · ${name('home.off.distance.remote')}`,
      );
    });

    it('an id from another family is left out of a family segment, as an unknown id is', () => {
      // @ts-expect-error the type rejects it since review R15; the run-time check stays for untrusted input (a stale save)
      expect(describeWorld({ ...plot, theme: 'classic', aspects: { envelope: ['hypnotic'] } })).toBe('tr3nch-2 · (-30, -30)');
    });

    it('a labelled world carries the tail after the plot', () => {
      expect(describeWorld({ attenuationStyleName: 'dusk', coordinates: { x: 12, y: 68 }, theme: 'anchor', aspects: { melody: ['hypnotic'] } }, 'Dusk Run')).toBe(
        'Dusk Run · dusk (12, 68) · Anchor · Hypnotic',
      );
    });

    it('reads every name from content, so a copy change moves the readout', () => {
      const tail = describeWorld({ ...plot, theme: 'shatter', aspects: { melody: ['hypnotic', 'mechanical', 'wandering'] } });
      expect(tail).toBe(
        `tr3nch-2 · (-30, -30) · ${labels('home.off.theme.shatter').humanLabel} · ${labels('home.off.melody.hypnotic').humanLabel} + ${labels('home.off.melody.mechanical').humanLabel} + ${labels('home.off.melody.wandering').humanLabel}`,
      );
      for (const theme of ['classic', 'float', 'anchor', 'tide', 'shatter'] as const) {
        expect(labels(`home.off.theme.${theme}`).humanLabel.length).toBeGreaterThan(0);
      }
    });

    it('an identity with no loading (a pick built from a bare name and plot) reads as before', () => {
      expect(describeWorld(plot)).toBe('tr3nch-2 · (-30, -30)');
      expect(describeWorld(plot, 'Night')).toBe('Night · tr3nch-2 (-30, -30)');
    });

    // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R30: a theme is one of the five ids, not any key an object answers to.
    it('a theme named like an Object prototype key reads as Classic', () => {
      for (const theme of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
        // @ts-expect-error the type rejects it; the run-time check is for untrusted input (a hand-edited save)
        expect(describeWorld({ ...plot, theme, aspects: { melody: ['hypnotic'] } })).toBe('tr3nch-2 · (-30, -30) · Hypnotic');
      }
    });

    it('an unknown theme id reads as Classic', () => {
      // @ts-expect-error the type rejects it; the run-time check is for untrusted input (a stale save)
      expect(describeWorld({ ...plot, theme: 'stormy', aspects: {} })).toBe('tr3nch-2 · (-30, -30)');
    });
  });

  // docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 4: the loading tail on its own, for the off screen's
  // selected row ("Harbour Song · Float"), which also names Classic when the row's own theme was another.
  describe('describeLoading', () => {
    it('is the tail describeWorld carries, without the head: empty for Classic with no picks', () => {
      expect(describeLoading('classic', {})).toBe('');
      expect(describeLoading('float', { melody: ['hypnotic', 'wandering'], distance: ['remote'] })).toBe(
        `${labels('home.off.theme.float').humanLabel} · ${labels('home.off.melody.hypnotic').humanLabel} + ${labels('home.off.melody.wandering').humanLabel} · ${labels('home.off.distance.remote').humanLabel}`,
      );
      expect(describeLoading('classic', { melody: ['hypnotic'] })).toBe(labels('home.off.melody.hypnotic').humanLabel);
    });

    it('with nameTheme, names the theme even when it is Classic', () => {
      const classic = labels('home.off.theme.classic').humanLabel;
      expect(describeLoading('classic', {}, { nameTheme: true })).toBe(classic);
      expect(describeLoading('classic', { melody: ['hypnotic'] }, { nameTheme: true })).toBe(
        `${classic} · ${labels('home.off.melody.hypnotic').humanLabel}`,
      );
      expect(describeLoading('float', {}, { nameTheme: true })).toBe(labels('home.off.theme.float').humanLabel);
      expect(describeLoading('classic', {}, { nameTheme: false })).toBe('');
    });

    it('with nameTheme, an unknown theme id is still left out', () => {
      // @ts-expect-error the type rejects it; the run-time check is for untrusted input (a stale save)
      expect(describeLoading('stormy', {}, { nameTheme: true })).toBe('');
    });
  });

  // R30: a save edited by hand reaches the off screen's readout through loadSession, unchecked. A world it cannot read
  // the plot of is named without one, never a crash: applying it keeps the loaded plot (retransmitWorld's
  // attenuationStyleOnly mode), so no plot is the honest name.
  describe('a world with no readable plot', () => {
    const unread = (coordinates: unknown) => ({ attenuationStyleName: 'dusk', coordinates }) as unknown as Parameters<typeof describeWorld>[0];

    it('names a payload with no coordinates by its seed alone, bare and labelled', () => {
      expect(describeWorld(unread(undefined))).toBe('dusk');
      expect(describeWorld(unread(undefined), 'Dusk Run')).toBe('Dusk Run · dusk');
    });

    it('treats null, an empty object, a half plot and non-number values as no plot', () => {
      for (const coordinates of [null, {}, { x: 12 }, { y: 68 }, { x: '12', y: '68' }, { x: null, y: 4 }]) {
        expect(describeWorld(unread(coordinates)), JSON.stringify(coordinates)).toBe('dusk');
      }
    });

    it('still carries the loading tail after the seed', () => {
      const identity = { ...unread(undefined), theme: 'float' as const, aspects: { melody: ['hypnotic' as const] } };
      expect(describeWorld(identity, 'Dusk Run')).toBe('Dusk Run · dusk · Float · Hypnotic');
    });

    it('a plot of zeros is a plot', () => {
      expect(describeWorld({ attenuationStyleName: 'a', coordinates: { x: 0, y: 0 } })).toBe('a · (0, 0)');
    });
  });
});
