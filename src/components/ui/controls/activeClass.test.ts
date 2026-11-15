import { describe, it, expect } from 'vitest';

import { withActiveClass, withFeaturedClass, withHeldOffClass } from './activeClass';

describe('withActiveClass', () => {
  it('appends isActive when active is true', () => {
    expect(withActiveClass('sc-toggle', true)).toBe('sc-toggle isActive');
  });

  it('returns the base class unchanged when active is false', () => {
    expect(withActiveClass('sc-toggle', false)).toBe('sc-toggle');
  });
});

// docs/specs/CONTENT_LAYOUT.md §1.4 — a featured control's cell wears sc-featured.
describe('withFeaturedClass', () => {
  it('appends sc-featured when the schema is featured', () => {
    expect(withFeaturedClass('x', { featured: true })).toBe('x sc-featured');
  });

  it('returns the base class unchanged when the schema has no featured flag', () => {
    expect(withFeaturedClass('x', {})).toBe('x');
  });

  it('returns the base class unchanged when featured is false', () => {
    expect(withFeaturedClass('x', { featured: false })).toBe('x');
  });

  it('returns the base class unchanged when there is no schema', () => {
    expect(withFeaturedClass('x', undefined)).toBe('x');
  });

  it('composes with withHeldOffClass in either order', () => {
    const featured = { featured: true };
    expect(withFeaturedClass(withHeldOffClass('x', true), featured)).toBe('x sc-held-off sc-featured');
    expect(withHeldOffClass(withFeaturedClass('x', featured), true)).toBe('x sc-featured sc-held-off');
    expect(withFeaturedClass(withHeldOffClass('x', false), featured)).toBe('x sc-featured');
    expect(withHeldOffClass(withFeaturedClass('x', {}), true)).toBe('x sc-held-off');
  });
});
