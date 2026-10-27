import { beforeEach, describe, expect, it, vi } from 'vitest';

let currentMeasure = 0;

const callbacks: Array<(time: number) => void> = [];
const scheduleRepeatMock = vi.fn<(interval: string, cb: (time: number) => void) => string>((_interval, cb) => {
  callbacks.push(cb);
  return `schedule-${callbacks.length}`;
});
const cancelScheduleMock = vi.fn<(id: string) => void>();

// harmonySystem.ts now goes through beatClock.ts's own scheduleRepeat/cancelSchedule exports
// (docs/specs/archive/HARMONY_PALETTE_SEQUENCING.md §1.5) instead of a locally-owned transport interface,
// so this is the only mock this file needs — no more mockTransport, no more vi.mock('tone', ...).
vi.mock('./beatClock', () => ({
  getCurrentMeasure: () => currentMeasure,
  scheduleRepeat: (interval: string, cb: (time: number) => void) => scheduleRepeatMock(interval, cb),
  cancelSchedule: (id: string) => cancelScheduleMock(id),
}));

let getAvailableNotes: () => string[];
let setAvailableNotes: (notes: [string, string, string, string, string, string, string, string]) => void;
let resetHarmony: () => void;
let scheduleHarmonyCycle: () => void;
let stopHarmonyCycle: () => void;

describe('harmonySystem', () => {
  beforeEach(async () => {
    currentMeasure = 0;
    callbacks.length = 0;
    scheduleRepeatMock.mockClear();
    cancelScheduleMock.mockClear();
    vi.resetModules();
    ({
      getAvailableNotes,
      setAvailableNotes,
      resetHarmony,
      scheduleHarmonyCycle,
      stopHarmonyCycle,
    } = await import('./harmonySystem'));
  });

  it('returns palette copies and respects manual overrides', () => {
    const original = getAvailableNotes();
    expect(original).toHaveLength(8);
    const custom = ['A1', 'B1', 'C2', 'D2', 'E2', 'F2', 'G2', 'A2'] as const;
    setAvailableNotes([...custom]);
    const updated = getAvailableNotes();
    expect(updated).toEqual(custom);
    updated.push('X');
    expect(getAvailableNotes()).toHaveLength(8);
  });

  it('resetHarmony restores the first palette entry', () => {
    setAvailableNotes(['A1', 'B1', 'C2', 'D2', 'E2', 'F2', 'G2', 'A2']);
    expect(getAvailableNotes()[0]).not.toBe('C');

    resetHarmony();
    expect(getAvailableNotes()).toEqual(['C', 'G', 'E', 'D', 'B', 'C', 'E', 'G']);
  });

  it('schedules the harmony cycle once, on a 2-measure interval', () => {
    scheduleHarmonyCycle();
    expect(scheduleRepeatMock).toHaveBeenCalledTimes(1);
    // '2m' must come from MEASURES_PER_PALETTE_ENTRY, not an independently-written literal
    // (docs/specs/archive/HARMONY_PALETTE_SEQUENCING.md §1.4) — this is the regression guard for that.
    expect(scheduleRepeatMock).toHaveBeenCalledWith('2m', expect.any(Function));
  });

  it('warns and no-ops on a second scheduleHarmonyCycle call without an intervening stop', () => {
    scheduleHarmonyCycle();
    scheduleHarmonyCycle();
    expect(scheduleRepeatMock).toHaveBeenCalledTimes(1);
  });

  it('advances the palette as the transport measure advances', () => {
    scheduleHarmonyCycle();
    currentMeasure = 10; // floor(10/2) % 12 = index 5
    callbacks[0]?.(0);
    expect(getAvailableNotes()[0]).toBe('A');
  });

  it('does not reassign the palette when the computed index has not changed', () => {
    scheduleHarmonyCycle();
    setAvailableNotes(['Z', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z']); // prove a no-op tick leaves this alone
    currentMeasure = 1; // floor(1/2) % 12 = 0 — same index the module already started on
    callbacks[0]?.(0);
    expect(getAvailableNotes()).toEqual(['Z', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z']);
  });

  it('wraps back to the first entry and keeps advancing correctly past one full lap', () => {
    // Regression guard for "don't assume the palette's length" — these assertions are pinned to
    // known note content at each measure, not to a restated `% 12` in the test itself, so they
    // fail loudly (wrong note) rather than silently if the wrap math or the palette data drifts.
    scheduleHarmonyCycle();

    currentMeasure = 22; // floor(22/2) % 12 = 11 — last entry before the wrap
    callbacks[0]?.(0);
    expect(getAvailableNotes()[0]).toBe('E');

    currentMeasure = 24; // floor(24/2) % 12 = 0 — one full lap, wraps back to the first entry
    callbacks[0]?.(0);
    expect(getAvailableNotes()).toEqual(['C', 'G', 'E', 'D', 'B', 'C', 'E', 'G']);

    currentMeasure = 30; // floor(30/2) % 12 = 3 — proves it keeps advancing past the wrap, not stuck
    callbacks[0]?.(0);
    expect(getAvailableNotes()[0]).toBe('F');
  });

  it('stops the harmony cycle and clears the scheduled entry via cancelSchedule', () => {
    scheduleHarmonyCycle();
    const scheduledId = scheduleRepeatMock.mock.results[0]?.value as string;

    stopHarmonyCycle();
    expect(cancelScheduleMock).toHaveBeenCalledWith(scheduledId);

    scheduleHarmonyCycle();
    expect(scheduleRepeatMock).toHaveBeenCalledTimes(2);
  });
});
