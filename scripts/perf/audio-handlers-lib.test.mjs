// Tests for the pure tally behind `npm run perf:audio-handlers` (scripts/perf/audio-handlers.mjs, backlog 27 T1).
// The Chrome/CDP plumbing is not unit-tested; it is verified by a real run (see docs/PERFORMANCE.md).
import { describe, expect, it } from 'vitest';

import {
  NOTE_NO_HANDLERS,
  NOTE_NO_RENDER,
  formatHandlerTable,
  tallyHandlers,
} from './audio-handlers-lib.mjs';

// ========================================
// HELPERS
// ========================================

const AUDIO = { pid: 1, tid: 10 };
const OTHER = { pid: 1, tid: 99 };

/** One render quantum's `RealtimeAudioDestinationHandler::Render`, a complete ('X') event. */
const render = (ts, dur, thread = AUDIO) => ({
  ...thread,
  ph: 'X',
  cat: 'webaudio',
  name: 'RealtimeAudioDestinationHandler::Render',
  ts,
  dur,
  args: { frames: 128 },
});

/** One node's `AudioHandler::ProcessIfNecessary`, in Chrome's shape: the instance in `this`, the class in `node type`. */
const handler = (type, id, ts, dur, thread = AUDIO) => ({
  ...thread,
  ph: 'X',
  cat: 'disabled-by-default-webaudio.audionode',
  name: 'AudioHandler::ProcessIfNecessary',
  ts,
  dur,
  args: { this: id, 'node type': type },
});

/**
 * Two quanta, three classes, one nested pair, one event on another thread:
 *   quantum 1 (0–1000):    Gain 0xa 100–400 (holds Biquad 0xb 150–350), Oscillator 0xo 500–600
 *   quantum 2 (2000–3000): Gain 0xa 2100–2250, Gain 0xc 2300–2450, Biquad 0xb 2500–2600, Oscillator 0xo 2650–2990
 *   off-thread:            Gain 0xz 100–600 on tid 99 (ignored)
 * Self times: Gain 100 + 150 + 150 = 400, Biquad 200 + 100 = 300, Oscillator 100 + 340 = 440; Render 2000.
 */
function fixture() {
  return [
    render(0, 1000),
    handler('GainNode', '0xa', 100, 300),
    handler('BiquadFilterNode', '0xb', 150, 200),
    handler('OscillatorNode', '0xo', 500, 100),
    render(2000, 1000),
    handler('GainNode', '0xa', 2100, 150),
    handler('GainNode', '0xc', 2300, 150),
    handler('BiquadFilterNode', '0xb', 2500, 100),
    handler('OscillatorNode', '0xo', 2650, 340),
    handler('GainNode', '0xz', 100, 500, OTHER),
  ];
}

const byName = (tally, name) => tally.classes.find((c) => c.name === name);

// ========================================
// tallyHandlers
// ========================================

describe('tallyHandlers', () => {
  it('totals the Render events and counts the quanta', () => {
    const tally = tallyHandlers(fixture());
    expect(tally.renderTotalUs).toBe(2000);
    expect(tally.renderCount).toBe(2);
    expect(tally.note).toBeNull();
  });

  it('counts self time, not inclusive: a nested handler is subtracted from the one holding it', () => {
    const tally = tallyHandlers(fixture());
    expect(byName(tally, 'GainNode').selfUs).toBe(400);
    expect(byName(tally, 'BiquadFilterNode').selfUs).toBe(300);
    expect(byName(tally, 'OscillatorNode').selfUs).toBe(440);
  });

  it('subtracts only direct children, so a three-deep chain counts each level once', () => {
    const tally = tallyHandlers([
      render(0, 1000),
      handler('GainNode', '0xa', 0, 900),
      handler('BiquadFilterNode', '0xb', 100, 600),
      handler('OscillatorNode', '0xo', 200, 200),
    ]);
    expect(byName(tally, 'GainNode').selfUs).toBe(300);
    expect(byName(tally, 'BiquadFilterNode').selfUs).toBe(400);
    expect(byName(tally, 'OscillatorNode').selfUs).toBe(200);
    const total = tally.classes.reduce((sum, c) => sum + c.selfUs, 0);
    expect(total).toBe(900);
  });

  it('nests a child that starts on its parent timestamp, whatever order the trace lists them in', () => {
    // Chrome writes a complete event when it ends, so a child arrives before its parent.
    const tally = tallyHandlers([
      handler('BiquadFilterNode', '0xb', 100, 200),
      handler('GainNode', '0xa', 100, 500),
      render(0, 1000),
    ]);
    expect(byName(tally, 'GainNode').selfUs).toBe(300);
    expect(byName(tally, 'BiquadFilterNode').selfUs).toBe(200);
  });

  it('divides each class by the Render total of the same trace', () => {
    const tally = tallyHandlers(fixture());
    expect(byName(tally, 'GainNode').share).toBeCloseTo(0.2, 10);
    expect(byName(tally, 'BiquadFilterNode').share).toBeCloseTo(0.15, 10);
    expect(byName(tally, 'OscillatorNode').share).toBeCloseTo(0.22, 10);
  });

  it('counts distinct instances by the event id and divides the share among them', () => {
    const tally = tallyHandlers(fixture());
    expect(byName(tally, 'GainNode').instances).toBe(2);
    expect(byName(tally, 'GainNode').perInstanceShare).toBeCloseTo(0.1, 10);
    expect(byName(tally, 'BiquadFilterNode').instances).toBe(1);
    expect(byName(tally, 'BiquadFilterNode').perInstanceShare).toBeCloseTo(0.15, 10);
    expect(byName(tally, 'OscillatorNode').instances).toBe(1);
  });

  it('sorts the classes by share, largest first', () => {
    const tally = tallyHandlers(fixture());
    expect(tally.classes.map((c) => c.name)).toEqual(['OscillatorNode', 'GainNode', 'BiquadFilterNode']);
  });

  it('breaks a share tie by name, so the order is stable', () => {
    const tally = tallyHandlers([
      render(0, 1000),
      handler('OscillatorNode', '0xo', 100, 100),
      handler('GainNode', '0xa', 300, 100),
    ]);
    expect(tally.classes.map((c) => c.name)).toEqual(['GainNode', 'OscillatorNode']);
  });

  it('ignores an event on a thread that carries no Render', () => {
    const tally = tallyHandlers(fixture());
    // 0xz (tid 99) would make Gain 3 instances and 900 us.
    expect(byName(tally, 'GainNode').instances).toBe(2);
    expect(byName(tally, 'GainNode').selfUs).toBe(400);
  });

  it('ignores a handler event on the audio thread that sits outside every Render', () => {
    const tally = tallyHandlers([...fixture(), handler('GainNode', '0xq', 1200, 400)]);
    expect(byName(tally, 'GainNode').instances).toBe(2);
    expect(byName(tally, 'GainNode').selfUs).toBe(400);
  });

  it('keeps the shares summed at or under 1, the handler fraction of Render', () => {
    const tally = tallyHandlers(fixture());
    const sum = tally.classes.reduce((s, c) => s + c.share, 0);
    expect(sum).toBeCloseTo(0.57, 10);
    expect(sum).toBeLessThanOrEqual(1);
  });

  it('falls back to the event name for the class, and to name, thread and depth for the instance, when args are bare', () => {
    const bare = (ts, dur) => ({ ...AUDIO, ph: 'X', cat: 'webaudio', name: 'GainHandler::Process', ts, dur });
    const tally = tallyHandlers([
      render(0, 1000),
      bare(100, 200), // depth 1
      render(2000, 1000),
      bare(2100, 300), // depth 1 again: the same instance
      bare(2150, 100), // depth 2, nested in the one above: a second instance
    ]);
    const gain = byName(tally, 'GainHandler::Process');
    expect(gain.instances).toBe(2);
    expect(gain.selfUs).toBe(200 + 200 + 100);
  });

  it('skips events that are not complete events, and Render-shaped events that are not Process-shaped', () => {
    const tally = tallyHandlers([
      render(0, 1000),
      { ...handler('GainNode', '0xa', 100, 300), ph: 'I' },
      { ...AUDIO, ph: 'X', cat: 'webaudio', name: 'AudioWorkletThread::Something', ts: 500, dur: 100 },
      handler('OscillatorNode', '0xo', 600, 100),
    ]);
    expect(tally.classes.map((c) => c.name)).toEqual(['OscillatorNode']);
  });

  it('gives an empty table and the no-Render note for an empty list, with no NaN', () => {
    const tally = tallyHandlers([]);
    expect(tally).toEqual({ renderTotalUs: 0, renderCount: 0, classes: [], note: NOTE_NO_RENDER });
  });

  it('gives the no-handler note when Render events exist but no per-handler events do', () => {
    const tally = tallyHandlers([render(0, 1000), render(2000, 1000)]);
    expect(tally.renderTotalUs).toBe(2000);
    expect(tally.renderCount).toBe(2);
    expect(tally.classes).toEqual([]);
    expect(tally.note).toBe(NOTE_NO_HANDLERS);
  });

  it('gives the no-Render note when handler events exist but no Render does', () => {
    const tally = tallyHandlers([handler('GainNode', '0xa', 100, 300)]);
    expect(tally.classes).toEqual([]);
    expect(tally.note).toBe(NOTE_NO_RENDER);
  });

  it('accepts a missing or non-array input as empty', () => {
    expect(tallyHandlers(undefined).note).toBe(NOTE_NO_RENDER);
    expect(tallyHandlers(null).classes).toEqual([]);
  });

  it('names the two notes differently, and says which category to blame', () => {
    expect(NOTE_NO_RENDER).not.toBe(NOTE_NO_HANDLERS);
    expect(NOTE_NO_HANDLERS).toContain('disabled-by-default-webaudio.audionode');
  });
});

// ========================================
// formatHandlerTable
// ========================================

describe('formatHandlerTable', () => {
  it('prints one row per class, largest first, with share, instances and per-instance share', () => {
    const lines = formatHandlerTable(tallyHandlers(fixture())).split('\n');
    const rows = lines.filter((l) => /Node\b/.test(l));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^OscillatorNode\s+22\.0%\s+1\s+22\.000%$/);
    expect(rows[1]).toMatch(/^GainNode\s+20\.0%\s+2\s+10\.000%$/);
    expect(rows[2]).toMatch(/^BiquadFilterNode\s+15\.0%\s+1\s+15\.000%$/);
  });

  it('prints the handler total and the quanta under the rows', () => {
    const text = formatHandlerTable(tallyHandlers(fixture()));
    expect(text).toContain('all handlers 57.0% of Render (2 Render events)');
  });

  it('prints a table and the note for each degenerate input, never NaN', () => {
    for (const events of [[], [render(0, 1000)], [handler('GainNode', '0xa', 0, 10)]]) {
      const tally = tallyHandlers(events);
      const text = formatHandlerTable(tally);
      expect(text).toMatch(/^class\s+share\s+instances\s+per instance/);
      expect(text).toContain('(no handler rows)');
      expect(text).toContain(tally.note);
      expect(text).not.toContain('NaN');
    }
  });

  it('prints no handler total when there is no Render to divide by', () => {
    expect(formatHandlerTable(tallyHandlers([]))).not.toContain('all handlers');
    expect(formatHandlerTable(tallyHandlers([render(0, 1000)]))).toContain('all handlers 0.0% of Render (1 Render events)');
  });
});
