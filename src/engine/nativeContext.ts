/**
 * Tone's `rawContext` is a `standardized-audio-context` wrapper, not the browser's own AudioContext. The wrapper forwards
 * only what it implements: `baseLatency` yes, `outputLatency` and `playbackStats` no (both found missing in the real
 * browser; docs/todo/tonejs-fixes.md item 1). It keeps the native context in TypeScript-private fields, so a reader looks
 * there too. Reading a private field of a dependency is fragile, which is why every step is defensive.
 */
const NATIVE_CONTEXT_FIELDS = ['_nativeAudioContext', '_nativeContext'] as const;

/**
 * Where to read a context property, in order: the wrapper itself (a later wrapper may forward it), then the native
 * context under `_nativeAudioContext`, then under `_nativeContext` (the base-class field). Only objects are returned; a
 * field that cannot be read is skipped. Never throws.
 */
export function contextHolders(raw: unknown): object[] {
  if (!raw || typeof raw !== 'object') return [];
  const holders: object[] = [raw];
  for (const key of NATIVE_CONTEXT_FIELDS) {
    try {
      const native = (raw as Record<string, unknown>)[key];
      if (native && typeof native === 'object') holders.push(native);
    } catch {
      // An unreadable field is skipped; the next one may still answer.
    }
  }
  return holders;
}

/**
 * The first positive, finite number found under `key` on any of the context's holders (contextHolders), or undefined.
 * A 0, a negative or a non-number is "not reported" (a device's output cannot have no latency); a holder whose `key`
 * throws is skipped.
 */
export function readContextSeconds(raw: unknown, key: 'outputLatency' | 'baseLatency'): number | undefined {
  for (const holder of contextHolders(raw)) {
    try {
      const value = (holder as Record<string, unknown>)[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    } catch {
      // Skipped; the next holder may still answer.
    }
  }
  return undefined;
}
