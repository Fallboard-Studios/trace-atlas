import { describe, it, expect } from 'vitest';
import { DEFAULT_LOADING, loadingOf } from './loadingIdentity';

/*
 * docs/specs/OFF_SCREEN.md assumption 10: a payload's loading, read leniently. A payload is untrusted JSON (a version 1
 * or 2 save, a hand-edited file, a link's blob), so any value may stand where a pick should. These pin what reaches the
 * world from such a payload; docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R30 leaves the dropping of every non-id to
 * canonicalAspects alone.
 */
describe('loadingOf', () => {
  it('reads a whole, valid loading as it is', () => {
    expect(loadingOf({ theme: 'calm', aspects: { melody: ['wandering'], voice: ['woody', 'glassy'] } })).toEqual({
      theme: 'calm',
      aspects: { melody: ['wandering'], voice: ['glassy', 'woody'] },
    });
  });

  it('reads no loading, and an unknown theme, as Classic with nothing dealt', () => {
    expect(loadingOf({})).toEqual(DEFAULT_LOADING);
    expect(loadingOf({ theme: 'stormy' })).toEqual(DEFAULT_LOADING);
    expect(loadingOf({ theme: 'constructor', aspects: null })).toEqual(DEFAULT_LOADING);
  });

  it('drops picks that are not strings, keeping the family ids among them in canonical order', () => {
    const aspects = { melody: [1, null, 'wandering', { id: 'hypnotic' }, true, 'hypnotic', ['mechanical'], undefined] };
    expect(loadingOf({ theme: 'calm', aspects })).toEqual({ theme: 'calm', aspects: { melody: ['hypnotic', 'wandering'] } });
  });

  it('a family list of nothing but non-strings, or not a list, is no family', () => {
    expect(loadingOf({ aspects: { envelope: [0, null, {}], distance: 'far', voice: ['woody'] } })).toEqual({
      theme: 'classic',
      aspects: { voice: ['woody'] },
    });
  });

  it('drops an unknown family, and another family’s id within a family', () => {
    expect(loadingOf({ aspects: { tempo: ['fast'], envelope: ['hypnotic', 'held'] } })).toEqual({
      theme: 'classic',
      aspects: { envelope: ['held'] },
    });
  });
});
