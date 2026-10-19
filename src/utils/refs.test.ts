import { describe, it, expect, expectTypeOf, afterEach } from 'vitest';
import { setRef, getRef, deleteRef, clearRefs, type RefElement } from './refs';

function fakeSvgGElement(): SVGGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
}

function fakeDivElement(): HTMLDivElement {
  return document.createElement('div');
}

afterEach(() => {
  clearRefs();
});

describe('setRef / getRef', () => {
  it('round-trips a stored element', () => {
    const el = fakeSvgGElement();
    setRef('robot-1', el);
    expect(getRef('robot-1')).toBe(el);
  });

  it('returns undefined for an unset key', () => {
    expect(getRef('never-set')).toBeUndefined();
  });
});

describe('deleteRef', () => {
  it('removes a previously-set key', () => {
    const el = fakeSvgGElement();
    setRef('robot-1', el);
    deleteRef('robot-1');
    expect(getRef('robot-1')).toBeUndefined();
  });

  it('is a safe no-op on an already-absent key', () => {
    expect(() => deleteRef('never-set')).not.toThrow();
  });
});

describe('clearRefs', () => {
  it('empties the registry — every previously-set key becomes undefined', () => {
    setRef('robot-1', fakeSvgGElement());
    setRef('robot-2', fakeSvgGElement());
    clearRefs();
    expect(getRef('robot-1')).toBeUndefined();
    expect(getRef('robot-2')).toBeUndefined();
  });
});

// docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.4 (roadmap Phase 53, Task 8). A robot's registered
// element becomes the HTML wrapper of its mover, and the dissolve slot a div, so the registry holds
// any SVG or HTML element. Type-only: nothing about keys, lookup or cleanup changes.
describe('RefElement', () => {
  it('round-trips an HTMLDivElement and an SVGGElement side by side', () => {
    const wrapper = fakeDivElement();
    const group = fakeSvgGElement();
    setRef('robot-1', wrapper);
    setRef('station-front-1', group);
    expect(getRef('robot-1')).toBe(wrapper);
    expect(getRef('station-front-1')).toBe(group);
    expect(getRef('robot-1') instanceof HTMLDivElement).toBe(true);
    expect(getRef('station-front-1') instanceof SVGGElement).toBe(true);
  });

  it('a key can be re-registered with an element of the other kind', () => {
    const group = fakeSvgGElement();
    const wrapper = fakeDivElement();
    setRef('robot-1', group);
    setRef('robot-1', wrapper);
    expect(getRef('robot-1')).toBe(wrapper);
  });

  it('deleteRef and clearRefs remove HTML elements as they remove SVG ones', () => {
    setRef('robot-dissolve-layer', fakeDivElement());
    setRef('robot-2', fakeDivElement());
    deleteRef('robot-dissolve-layer');
    expect(getRef('robot-dissolve-layer')).toBeUndefined();
    expect(getRef('robot-2')).toBeDefined();
    clearRefs();
    expect(getRef('robot-2')).toBeUndefined();
  });

  it('is typed as the union of SVG and HTML elements, in and out', () => {
    expectTypeOf<RefElement>().toEqualTypeOf<SVGElement | HTMLElement>();
    expectTypeOf(setRef).parameter(1).toEqualTypeOf<RefElement>();
    expectTypeOf(getRef).returns.toEqualTypeOf<RefElement | undefined>();
  });
});
