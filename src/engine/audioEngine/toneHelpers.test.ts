import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({ Gain: vi.fn(), NotAFunction: 'not-a-constructor' }));

import { getToneCtor, makeStubFilter } from './toneHelpers';

describe('getToneCtor', () => {
  it('returns the constructor when it exists and is a function', async () => {
    const Tone = await import('tone');
    expect(getToneCtor('Gain')).toBe(Tone.Gain);
  });

  it('returns undefined when the named export exists but is not a function', () => {
    expect(getToneCtor('NotAFunction')).toBeUndefined();
  });
});

describe('makeStubFilter', () => {
  it('carries settable frequency and Q params and a type, so headless bus-filter updates have something to write to', () => {
    const stub = makeStubFilter();
    expect(stub.frequency).toEqual({ value: expect.any(Number) });
    expect(stub.Q).toEqual({ value: expect.any(Number) });
    expect(stub.type).toBe('lowpass');
  });

  it('returns a fresh object each call (no shared mutable params between robots)', () => {
    const a = makeStubFilter();
    const b = makeStubFilter();
    a.frequency!.value = 99;
    expect(b.frequency!.value).not.toBe(99);
  });
});
