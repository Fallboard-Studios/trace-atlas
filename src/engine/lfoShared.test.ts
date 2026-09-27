import { describe, it, expect, vi } from 'vitest';
import { clamp, centeredSwingFromRange, connectAdditively } from './lfoShared';

describe('clamp', () => {
  it('clamps a below-range value up to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps an above-range value down to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('passes an in-range value through unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('centeredSwingFromRange', () => {
  it('bounds the swing by distance to the nearer edge — value near min', () => {
    // range [0, 100], value 10: distanceToMin=10, distanceToMax=90 -> halfSpan=10
    const swing = centeredSwingFromRange({ min: 0, max: 100 }, 10);
    expect(swing).toEqual({ min: -10, max: 10 });
  });

  it('bounds the swing by distance to the nearer edge — value near max', () => {
    // range [0, 100], value 90: distanceToMin=90, distanceToMax=10 -> halfSpan=10
    const swing = centeredSwingFromRange({ min: 0, max: 100 }, 90);
    expect(swing).toEqual({ min: -10, max: 10 });
  });

  it('gives the full half-span swing at the midpoint', () => {
    // range [0, 100], value 50: distanceToMin=50, distanceToMax=50 -> halfSpan=50
    const swing = centeredSwingFromRange({ min: 0, max: 100 }, 50);
    expect(swing).toEqual({ min: -50, max: 50 });
  });

  it('returns zero swing for a non-finite current value (NaN)', () => {
    expect(centeredSwingFromRange({ min: 0, max: 100 }, NaN)).toEqual({ min: 0, max: 0 });
  });

  it('returns zero swing for a non-finite current value (Infinity)', () => {
    expect(centeredSwingFromRange({ min: 0, max: 100 }, Infinity)).toEqual({ min: 0, max: 0 });
  });
});

describe('isAudioContextRunning', () => {
  it('returns true when the context state is running', async () => {
    vi.doMock('tone', () => ({ getContext: () => ({ state: 'running' }) }));
    vi.resetModules();
    const { isAudioContextRunning: fn } = await import('./lfoShared');
    expect(fn()).toBe(true);
    vi.doUnmock('tone');
  });

  it('returns false when the context state is suspended', async () => {
    vi.doMock('tone', () => ({ getContext: () => ({ state: 'suspended' }) }));
    vi.resetModules();
    const { isAudioContextRunning: fn } = await import('./lfoShared');
    expect(fn()).toBe(false);
    vi.doUnmock('tone');
  });

  it('returns false, not a thrown error, when getContext itself throws', async () => {
    vi.doMock('tone', () => ({
      getContext: () => {
        throw new Error('no context');
      },
    }));
    vi.resetModules();
    const { isAudioContextRunning: fn } = await import('./lfoShared');
    expect(() => fn()).not.toThrow();
    expect(fn()).toBe(false);
    vi.doUnmock('tone');
    vi.resetModules();
  });
});

describe('connectAdditively', () => {
  it('disables override before connecting, and restores the pre-connect value after', () => {
    const destination = { value: 42, override: true };
    const connect = vi.fn((dest: unknown) => {
      // Simulate Tone's real connectSignal() reset-on-connect behavior.
      (dest as { value: number }).value = 0;
    });
    const source = { connect };

    connectAdditively(source, destination);

    expect(connect).toHaveBeenCalledWith(destination);
    // override must have been set false before connect() ran.
    expect(destination.override).toBe(false);
    // the pre-connect value (42) must be restored after connect() reset it to 0.
    expect(destination.value).toBe(42);
  });

  it('does not write back a non-finite pre-connect value', () => {
    const destination = { value: NaN, override: true };
    const connect = vi.fn((dest: unknown) => {
      (dest as { value: number }).value = 0;
    });
    const source = { connect };

    connectAdditively(source, destination);

    // Guard: a non-finite pre-connect value must never be written back —
    // the post-connect value (0, from the simulated reset) stays as-is.
    expect(destination.value).toBe(0);
  });

  it('works against a Param-like destination with no override concept', () => {
    const destination: { value: number; override?: boolean } = { value: 7 };
    const connect = vi.fn((dest: unknown) => {
      (dest as { value: number }).value = 0;
    });
    const source = { connect };

    expect(() => connectAdditively(source, destination)).not.toThrow();
    expect(destination.override).toBe(false);
    expect(destination.value).toBe(7);
  });
});
