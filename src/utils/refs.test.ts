import { describe, it, expect, afterEach } from 'vitest';
import { setRef, getRef, deleteRef, clearRefs } from './refs';

function fakeSvgGElement(): SVGGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
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
