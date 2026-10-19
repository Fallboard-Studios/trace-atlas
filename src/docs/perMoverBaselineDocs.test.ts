import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md Task 4. A measurement task has no behaviour to test, so this makes
// its acceptance criteria executable: PERFORMANCE.md carries a "Pre-change baseline for Phase 53" section with
// three rounds, a median row and a min-max row that agree with those rounds, and the method facts that make the
// numbers repeatable (build, commit, link, viewport, hygiene). Task 22's perMoverLayersDocs guard covers the rest
// of the phase's docs; this file stays about the baseline.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) =>
  readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

const PERFORMANCE_DOC = 'docs/PERFORMANCE.md';
const HEADING = /^## Pre-change baseline for Phase 53 — Per-Mover Compositor Layers \((\d{4}-\d{2}-\d{2})\)$/m;
/** The columns the plan's Task 4 names, plus the frame count that makes redrawn area per frame checkable. */
const COLUMNS = [
  'redrawn px²/frame',
  'screens/frame',
  'busy (ms)',
  'Paint (ms)',
  'Compositor::Update (ms)',
  'Layerize (ms)',
  'frames',
];

/** The baseline `##` section, up to the next `##` heading. */
function baselineSection(): string {
  const text = read(PERFORMANCE_DOC);
  const match = HEADING.exec(text);
  expect(match, `${PERFORMANCE_DOC} has the "Pre-change baseline for Phase 53" heading`).not.toBeNull();
  const start = match!.index;
  const bodyStart = text.indexOf('\n', start) + 1;
  const next = text.slice(bodyStart).search(/^## /m);
  return next === -1 ? text.slice(start) : text.slice(start, bodyStart + next);
}

const cells = (line: string) =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
const num = (cell: string) => Number(cell.replace(/[\s,]/g, ''));

interface ResultsTable {
  header: string[];
  rounds: number[][];
  median: number[];
  range: Array<[number, number]>;
}

/** The results table: header, rounds 1-3, then a Median row and a Min–max row (`a–b` cells). */
function resultsTable(section: string): ResultsTable {
  const rows = section
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map(cells);
  const headerAt = rows.findIndex((r) => r[0] === 'Round');
  expect(headerAt, 'the results table has a "Round" header row').toBeGreaterThanOrEqual(0);
  const header = rows[headerAt].slice(1);
  const body = rows.slice(headerAt + 2); // skip the |---| separator
  const rounds = body.filter((r) => /^[1-9]$/.test(r[0])).map((r) => r.slice(1).map(num));
  const medianRow = body.find((r) => r[0] === 'Median');
  const rangeRow = body.find((r) => r[0] === 'Min–max');
  expect(medianRow, 'a Median row').toBeDefined();
  expect(rangeRow, 'a Min–max row').toBeDefined();
  const range = rangeRow!.slice(1).map((c) => {
    const [lo, hi] = c.split('–').map(num);
    return [lo, hi] as [number, number];
  });
  return { header, rounds, median: medianRow!.slice(1).map(num), range };
}

const median3 = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y)[1];

describe('PERFORMANCE.md pre-change baseline for Phase 53 (plan Task 4)', () => {
  it('has the dated section, placed before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const heading = HEADING.exec(text);
    expect(heading).not.toBeNull();
    expect(text.indexOf('## Recording a new baseline')).toBeGreaterThan(heading!.index);
  });

  it('has exactly three rounds, in the plan\'s columns', () => {
    const table = resultsTable(baselineSection());
    expect(table.header).toEqual(COLUMNS);
    expect(table.rounds).toHaveLength(3);
    for (const round of table.rounds) {
      expect(round).toHaveLength(COLUMNS.length);
      for (const value of round) expect(Number.isFinite(value) && value >= 0).toBe(true);
    }
  });

  it('states a median and a min–max for every column that agree with the three rounds', () => {
    const table = resultsTable(baselineSection());
    expect(table.median).toHaveLength(COLUMNS.length);
    expect(table.range).toHaveLength(COLUMNS.length);
    COLUMNS.forEach((name, i) => {
      const [a, b, c] = table.rounds.map((r) => r[i]);
      expect(table.median[i], `${name} median`).toBe(median3(a, b, c));
      expect(table.range[i], `${name} min–max`).toEqual([Math.min(a, b, c), Math.max(a, b, c)]);
    });
  });

  it('keeps redrawn area and screens/frame consistent with each other in every round', () => {
    // screens/frame = px²/frame over the 1280 × 900 viewport at 1× (1 152 000 px²), to the table's 2 places.
    const table = resultsTable(baselineSection());
    for (const [px, screens] of table.rounds.map((r) => [r[0], r[1]])) {
      expect(screens).toBeCloseTo(px / (1280 * 900), 2);
    }
  });

  it('reads like a stock idle window: some paint, and a plausible frame count for a 6 s window', () => {
    const table = resultsTable(baselineSection());
    for (const round of table.rounds) {
      expect(round[0], 'redrawn px²/frame').toBeGreaterThan(0);
      expect(round[6], 'frames').toBeGreaterThan(60);
      expect(round[6], 'frames').toBeLessThanOrEqual(400);
    }
  });

  it('names what makes the run repeatable: commit, served bundle, link, viewport, window', () => {
    const section = baselineSection();
    expect(section, 'a commit hash').toMatch(/\b[0-9a-f]{8}\b/);
    expect(section, 'the served bundle').toMatch(/index-[A-Za-z0-9_-]{8}\.js/);
    expect(section, 'the pinned link').toMatch(/\?session=/);
    expect(section, 'the pinned world').toMatch(/alpha/);
    expect(section, 'the viewport').toMatch(/1280 ?[×x] ?900/);
    expect(section, 'the window').toMatch(/6 s/);
    expect(section, 'the harness command').toMatch(/npm run perf:idle/);
    expect(section, 'the ablation').toMatch(/--only none/);
  });

  it('records the hygiene: foreground, one at a time, zero orphaned Chrome before and after', () => {
    const section = baselineSection();
    expect(section).toMatch(/foreground/i);
    expect(section).toMatch(/one (run|call) at a time/i);
    expect(section, 'orphaned Chrome 0 before, then 0 after, in one sentence').toMatch(
      /orphaned[^.\n]*count 0 before[^.\n]*\b0 after/i,
    );
  });

  it('records the compositor-layer readout the later A/B compares against', () => {
    const section = baselineSection();
    expect(section).toMatch(/Compositor layers: \d+/);
    expect(section).toMatch(/MB/);
    expect(section).toMatch(/Mover layers: 0/);
  });

  it('carries the metric caveats forward instead of presenting the numbers as device pixels', () => {
    const section = baselineSection();
    expect(section).toMatch(/scene units|1920 ?[×x] ?1080/);
    // PERFORMANCE.md lives in docs/, so it links the plan relatively.
    expect(section).toMatch(/\]\(tasks\/PER_MOVER_COMPOSITOR_LAYERS\.md\)/);
    expect(existsSync(resolve(repoRoot, 'docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md'))).toBe(true);
  });

  it('the file it guards exists', () => {
    expect(existsSync(resolve(repoRoot, PERFORMANCE_DOC))).toBe(true);
  });
});
