import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildBusFilter,
  glideBusFilter,
  isNativeBusFilter,
  resolveBusFilterCutoff,
  resolveBusFilterQ,
  resolveBusFilterType,
} from './busFilter';
import { devWarn } from '../../utils/helpers';
import type { RobotFilterType } from '@/types/Robot';

vi.mock('../../utils/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/helpers')>()),
  devWarn: vi.fn(),
}));

/** A native AudioParam as far as the bus filter writes it; `hold: false` is a browser without cancelAndHoldAtTime. */
function fakeParam(value: number, { hold = true } = {}) {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    ...(hold ? { cancelAndHoldAtTime: vi.fn() } : {}),
  };
}

/** The raw context's BiquadFilterNode at the Web Audio defaults. */
function fakeBiquad({ hold = true } = {}) {
  return {
    type: 'lowpass',
    frequency: fakeParam(350, { hold }),
    Q: fakeParam(1, { hold }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

const OPTIONS = { frequency: 900, Q: 4, type: 'highpass' as RobotFilterType };

describe('resolveBusFilterCutoff', () => {
  it('returns a stored cutoff as it is', () => {
    expect(resolveBusFilterCutoff(900)).toBe(900);
    expect(resolveBusFilterCutoff(20)).toBe(20);
    expect(resolveBusFilterCutoff(20000)).toBe(20000);
  });

  it('falls back to the 1200 Hz default when nothing is stored or the value is not a number', () => {
    expect(resolveBusFilterCutoff(undefined)).toBe(1200);
    expect(resolveBusFilterCutoff(NaN)).toBe(1200);
  });

  it('reads 0 as "no filter" and opens the cutoff to the top of the band', () => {
    expect(resolveBusFilterCutoff(0)).toBe(20000);
  });

  it('treats a negative stored cutoff like 0, never a negative frequency', () => {
    expect(resolveBusFilterCutoff(-5)).toBe(20000);
  });
});

describe('resolveBusFilterQ', () => {
  it('returns a stored resonance as it is', () => {
    expect(resolveBusFilterQ(6)).toBe(6);
    expect(resolveBusFilterQ(0.1)).toBe(0.1);
  });

  it('falls back to Q 1 when nothing is stored or the value is NaN', () => {
    expect(resolveBusFilterQ(undefined)).toBe(1);
    expect(resolveBusFilterQ(NaN)).toBe(1);
  });
});

describe('resolveBusFilterType', () => {
  it.each<RobotFilterType>(['lowpass', 'bandpass', 'highpass'])('returns the stored type %s as it is', (type) => {
    expect(resolveBusFilterType(type)).toBe(type);
  });

  it('falls back to lowpass when nothing is stored', () => {
    expect(resolveBusFilterType(undefined)).toBe('lowpass');
  });

  it('falls back to lowpass for an unrecognised type (a stale payload)', () => {
    expect(resolveBusFilterType('notch' as RobotFilterType)).toBe('lowpass');
  });
});

// docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md G2a (Task 12): the bus filter is the raw context's own biquad, not a
// Tone.Filter wrapping the same biquad in 14 more nodes.
describe('buildBusFilter', () => {
  beforeEach(() => {
    vi.mocked(devWarn).mockClear();
  });

  it('returns the raw context biquad with the cutoff, resonance and type applied, and builds no Tone Filter', () => {
    const biquad = fakeBiquad();
    const FilterCtor = vi.fn();
    const filter = buildBusFilter({ rawContext: { createBiquadFilter: () => biquad as never }, FilterCtor: FilterCtor as never }, OPTIONS);

    expect(filter).toBe(biquad);
    expect(biquad.frequency.value).toBe(900);
    expect(biquad.Q.value).toBe(4);
    expect(biquad.type).toBe('highpass');
    expect(FilterCtor).not.toHaveBeenCalled();
    expect(isNativeBusFilter(filter!)).toBe(true);
    expect(devWarn).not.toHaveBeenCalled();
  });

  it('falls back to the Tone Filter with the same options when the raw context has no createBiquadFilter', () => {
    const toneFilter = { frequency: { value: 900 } };
    const FilterCtor = vi.fn(function Filter() { return toneFilter; });

    const filter = buildBusFilter({ rawContext: {}, FilterCtor: FilterCtor as never }, OPTIONS);

    expect(filter).toBe(toneFilter);
    expect(FilterCtor).toHaveBeenCalledWith(OPTIONS);
    expect(isNativeBusFilter(filter!)).toBe(false);
  });

  it('falls back the same way with no raw context at all, and returns null with no Filter constructor either', () => {
    const FilterCtor = vi.fn(function Filter() { return {}; });
    expect(buildBusFilter({ FilterCtor: FilterCtor as never }, OPTIONS)).not.toBeNull();
    expect(buildBusFilter({}, OPTIONS)).toBeNull();
  });

  it('warns once per module about the fallback, however many robots reserve', async () => {
    vi.resetModules();
    const fresh = await import('./busFilter');
    const helpers = await import('../../utils/helpers');
    vi.mocked(helpers.devWarn).mockClear();
    const FilterCtor = vi.fn(function Filter() { return {}; });

    fresh.buildBusFilter({ rawContext: {}, FilterCtor: FilterCtor as never }, OPTIONS);
    fresh.buildBusFilter({ rawContext: {}, FilterCtor: FilterCtor as never }, OPTIONS);

    expect(FilterCtor).toHaveBeenCalledTimes(2);
    expect(helpers.devWarn).toHaveBeenCalledTimes(1);
  });

  it('reads only a biquad it built as native: a Tone Filter or a plain stub is not', () => {
    expect(isNativeBusFilter(fakeBiquad() as never)).toBe(false);
    expect(isNativeBusFilter({ frequency: { value: 1 } } as never)).toBe(false);
  });
});

describe('glideBusFilter', () => {
  const native = (opts = {}) => {
    const biquad = fakeBiquad(opts);
    const filter = buildBusFilter({ rawContext: { createBiquadFilter: () => biquad as never } }, OPTIONS) as BiquadFilterNode;
    return { biquad, filter };
  };

  it('glides the cutoff and the resonance from the start time over the ramp, held where they are, and sets the type', () => {
    const { biquad, filter } = native();

    glideBusFilter(filter, { frequency: 500, Q: 2, type: 'bandpass' }, 0.05, 10);

    expect(biquad.frequency.cancelAndHoldAtTime).toHaveBeenCalledWith(10);
    expect(biquad.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(500, 10.05);
    expect(biquad.Q.cancelAndHoldAtTime).toHaveBeenCalledWith(10);
    expect(biquad.Q.linearRampToValueAtTime).toHaveBeenCalledWith(2, 10.05);
    expect(biquad.type).toBe('bandpass');
  });

  it('writes only the fields given', () => {
    const { biquad, filter } = native();

    glideBusFilter(filter, { Q: 6 }, 0.05, 1);

    expect(biquad.frequency.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(biquad.frequency.cancelAndHoldAtTime).not.toHaveBeenCalled();
    expect(biquad.Q.linearRampToValueAtTime).toHaveBeenCalledWith(6, 1.05);
    expect(biquad.type).toBe('highpass');
  });

  it('without cancelAndHoldAtTime, cancels from the start and pins the current value there before the ramp', () => {
    const { biquad, filter } = native({ hold: false });

    glideBusFilter(filter, { frequency: 2000 }, 0.05, 3);

    expect(biquad.frequency.cancelScheduledValues).toHaveBeenCalledWith(3);
    expect(biquad.frequency.setValueAtTime).toHaveBeenCalledWith(900, 3);
    expect(biquad.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(2000, 3.05);
  });

  it('never writes a value that is not finite into the live graph', () => {
    const { biquad, filter } = native();

    glideBusFilter(filter, { frequency: NaN, Q: Infinity }, 0.05, 1);

    expect(biquad.frequency.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(biquad.Q.linearRampToValueAtTime).not.toHaveBeenCalled();
  });
});
