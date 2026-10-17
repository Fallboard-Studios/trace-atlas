// Tests for the pure world-state helpers behind `npm run perf:idle` (scripts/perf/idle-paint.mjs):
// whether a run was taken with the world dimmed (a hub tile open), and what the bubble layers cost.
// Roadmap Phase 53 review follow-ups R5 and R6 (docs/tasks/PER_MOVER_REVIEW_FOLLOWUPS.md). The Chrome/CDP
// plumbing is not unit-tested; it is verified by a real run (see docs/PERFORMANCE.md).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BUBBLES_IN_FLIGHT,
  DIMMED_PROBE,
  bubbleLayerStats,
  checkDimmed,
  dimmedReading,
  paintTotalsFor,
  parseExpectDimmed,
} from './world-state-lib.mjs';

const MB = 1024 * 1024;

// ========================================
// DIMMED
// ========================================

describe('dimmedReading', () => {
  it('reads the probe value: true is dimmed, false is undimmed', () => {
    expect(dimmedReading(true)).toBe('dimmed');
    expect(dimmedReading(false)).toBe('undimmed');
  });

  it('reads a page with no world view (null or undefined) as its own state, never as undimmed', () => {
    expect(dimmedReading(null)).toBe('no world view');
    expect(dimmedReading(undefined)).toBe('no world view');
  });

  it('does not coerce other values (a string or a number is not a reading)', () => {
    expect(dimmedReading('')).toBe('no world view');
    expect(dimmedReading(1)).toBe('no world view');
    expect(dimmedReading(0)).toBe('no world view');
  });
});

describe('parseExpectDimmed', () => {
  it('defaults to any when the option is absent', () => {
    expect(parseExpectDimmed(undefined)).toBe('any');
  });

  it('accepts yes, no and any', () => {
    expect(parseExpectDimmed('yes')).toBe('yes');
    expect(parseExpectDimmed('no')).toBe('no');
    expect(parseExpectDimmed('any')).toBe('any');
  });

  it('rejects anything else, naming the value and the choices', () => {
    expect(() => parseExpectDimmed('true')).toThrow(/"true".*yes.*no.*any/s);
    expect(() => parseExpectDimmed('')).toThrow(/yes.*no.*any/s);
    expect(() => parseExpectDimmed('YES')).toThrow(/yes.*no.*any/s);
  });
});

describe('checkDimmed', () => {
  it('accepts any reading when nothing is expected, including a page with no world view', () => {
    for (const reading of ['dimmed', 'undimmed', 'no world view']) expect(checkDimmed(reading, 'any')).toBeNull();
  });

  it('with yes, accepts only a dimmed run', () => {
    expect(checkDimmed('dimmed', 'yes')).toBeNull();
  });

  it('with yes, rejects an undimmed run and says what it read', () => {
    expect(checkDimmed('undimmed', 'yes')).toMatch(/expected.*dimmed.*undimmed/is);
  });

  it('with yes, rejects a page with no world view (the attribute is absent because the element is)', () => {
    expect(checkDimmed('no world view', 'yes')).toMatch(/no world view/i);
  });

  it('with no, accepts only an undimmed run', () => {
    expect(checkDimmed('undimmed', 'no')).toBeNull();
    expect(checkDimmed('dimmed', 'no')).toMatch(/expected.*undimmed.*dimmed/is);
    expect(checkDimmed('no world view', 'no')).toMatch(/no world view/i);
  });

  it('a message always names the reading it rejected, so a log line says why the run was thrown away', () => {
    expect(checkDimmed('undimmed', 'yes')).toContain('undimmed');
    expect(checkDimmed('dimmed', 'no')).toContain('dimmed');
  });
});

describe('DIMMED_PROBE', () => {
  it('is an expression that asks the world view for data-dimmed and yields null when there is none', () => {
    expect(DIMMED_PROBE).toContain('.world-view');
    expect(DIMMED_PROBE).toContain('data-dimmed');
    expect(DIMMED_PROBE).toContain('null');
  });
});

// ========================================
// BUBBLES
// ========================================

describe('bubbleLayerStats', () => {
  it('reads no layers as zero everywhere', () => {
    expect(bubbleLayerStats([], 1)).toEqual({ count: 0, drawing: 0, mbDrawing: 0, mbAll: 0 });
  });

  it('counts every layer, the drawing ones apart, and estimates 4 bytes per device pixel', () => {
    const stats = bubbleLayerStats(
      [
        { drawsContent: true, area: MB / 4 }, // 1 MB at DPR 1
        { drawsContent: false, area: MB / 4 },
        { drawsContent: false, area: MB / 2 }, // 2 MB
      ],
      1,
    );
    expect(stats.count).toBe(3);
    expect(stats.drawing).toBe(1);
    expect(stats.mbDrawing).toBeCloseTo(1, 6);
    expect(stats.mbAll).toBeCloseTo(4, 6);
  });

  it('is the ceiling when all strips draw: mbAll never falls below mbDrawing', () => {
    const stats = bubbleLayerStats([{ drawsContent: true, area: 1000 }, { drawsContent: false, area: 3000 }], 1);
    expect(stats.mbAll).toBeGreaterThanOrEqual(stats.mbDrawing);
  });

  it('scales the estimate by the device pixel ratio squared', () => {
    const layers = [{ drawsContent: true, area: MB / 4 }];
    expect(bubbleLayerStats(layers, 2).mbDrawing).toBeCloseTo(4, 6);
  });

  it('counts a layer with a missing, negative or non-finite area but gives it no memory', () => {
    const stats = bubbleLayerStats(
      [
        { drawsContent: true, area: Number.NaN },
        { drawsContent: true, area: -5 },
        { drawsContent: true, area: Number.POSITIVE_INFINITY },
        { drawsContent: true },
      ],
      1,
    );
    expect(stats.count).toBe(4);
    expect(stats.drawing).toBe(4);
    expect(stats.mbDrawing).toBe(0);
    expect(stats.mbAll).toBe(0);
  });

  it('treats a missing drawsContent as not drawing', () => {
    expect(bubbleLayerStats([{ area: MB / 4 }], 1).drawing).toBe(0);
  });
});

describe('paintTotalsFor', () => {
  const paintByNode = new Map([
    [10, { count: 3, ms: 1.5, area: 300 }],
    [11, { count: 2, ms: 0.5, area: 100 }],
    [12, { count: 9, ms: 9, area: 9000 }],
  ]);

  it('sums the paints of just the named nodes', () => {
    expect(paintTotalsFor(paintByNode, new Set([10, 11]))).toEqual({ paints: 5, ms: 2, area: 400 });
  });

  it('ignores a node that never painted in the window', () => {
    expect(paintTotalsFor(paintByNode, new Set([10, 99]))).toEqual({ paints: 3, ms: 1.5, area: 300 });
  });

  it('reads an empty set, or a map with none of them, as zero', () => {
    expect(paintTotalsFor(paintByNode, new Set())).toEqual({ paints: 0, ms: 0, area: 0 });
    expect(paintTotalsFor(new Map(), new Set([10]))).toEqual({ paints: 0, ms: 0, area: 0 });
  });

  it('takes any iterable of ids, not only a Set', () => {
    expect(paintTotalsFor(paintByNode, [12]).paints).toBe(9);
  });

  it('does not count a node twice when an id repeats', () => {
    expect(paintTotalsFor(paintByNode, [10, 10]).paints).toBe(3);
  });
});

describe('BUBBLES_IN_FLIGHT', () => {
  it('counts bubble circles by the same selector that ablates them, filtered on a visible opacity', () => {
    expect(BUBBLES_IN_FLIGHT).toContain('getComputedStyle');
    expect(BUBBLES_IN_FLIGHT).toContain('opacity');
    expect(BUBBLES_IN_FLIGHT).toContain('.mover--bubbles circle');
  });
});

// ========================================
// THE HARNESS USES THEM
// ========================================

describe('idle-paint.mjs uses them', () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'idle-paint.mjs'), 'utf-8');

  it('imports the helpers from the lib', () => {
    expect(source).toMatch(/from '\.\/world-state-lib\.mjs'/);
    for (const name of ['DIMMED_PROBE', 'BUBBLES_IN_FLIGHT', 'bubbleLayerStats', 'checkDimmed', 'dimmedReading', 'paintTotalsFor', 'parseExpectDimmed']) {
      expect(source, name).toContain(name);
    }
  });

  it('takes --expect-dimmed and --bubbles, and says so in --help', () => {
    expect(source).toContain("'expect-dimmed': { type: 'string' }");
    expect(source).toContain('bubbles: { type: \'string\' }');
    expect(source).toMatch(/--expect-dimmed/);
  });

  it('reports the dimmed state of every run and rejects a run that is not what was asked for', () => {
    expect(source).toContain('parseExpectDimmed(opts[\'expect-dimmed\'])');
    expect(source).toContain('dimmedReading(await evaluate(DIMMED_PROBE))');
    expect(source).toContain('checkDimmed(');
    expect(source).toMatch(/World: \$\{/);
  });

  it('checks the dimmed state again after the windows, so a tile that closed mid-run cannot pass', () => {
    const calls = source.match(/dimmedReading\(await evaluate\(DIMMED_PROBE\)\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reads the bubble layers and the bubble slot paints, and prints them', () => {
    expect(source).toContain('bubbleLayerStats(');
    expect(source).toContain('paintTotalsFor(');
    expect(source).toMatch(/Bubble layers: /);
    expect(source).toMatch(/Bubble paints/);
  });
});
