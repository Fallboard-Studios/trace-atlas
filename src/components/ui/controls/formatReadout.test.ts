import { describe, it, expect } from 'vitest';

import { fixedReadout } from './formatReadout';

describe('fixedReadout', () => {
  it('reads whole hertz: no decimal, no kHz, float noise rounded away', () => {
    const hz = fixedReadout(0, 'Hz');
    expect(hz(3152.859)).toBe('3153Hz');
    expect(hz(20)).toBe('20Hz');
    expect(hz(19999.9999)).toBe('20000Hz');
    expect(hz(4999.999999999999)).toBe('5000Hz');
  });

  it('reads a seconds value in whole milliseconds through scale', () => {
    const ms = fixedReadout(0, ' ms', 1000);
    expect(ms(0.012)).toBe('12 ms');
    expect(ms(0.001)).toBe('1 ms');
    expect(ms(0.2)).toBe('200 ms');
    expect(ms(0.35)).toBe('350 ms');
    expect(ms(1)).toBe('1000 ms');
  });

  it('rounds half a millisecond up, so the minimum never reads as 0 ms', () => {
    expect(fixedReadout(0, ' ms', 1000)(0.0005)).toBe('1 ms');
  });

  it('keeps trailing zeros at two decimals', () => {
    const s = fixedReadout(2, 's');
    expect(s(2.4)).toBe('2.40s');
    expect(s(0.1)).toBe('0.10s');
    expect(s(10)).toBe('10.00s');
    expect(s(0.07999)).toBe('0.08s');
  });

  it('appends no unit when none is given', () => {
    const q = fixedReadout(2);
    expect(q(3.15278)).toBe('3.15');
    expect(q(0.5)).toBe('0.50');
    expect(q(20)).toBe('20.00');
  });

  it('formats an eased fractional value like any other', () => {
    expect(fixedReadout(0, 'Hz')(3152.4)).toBe('3152Hz');
  });
});
