import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md Task 20. A measurement task has no behaviour to test, so this makes its
// acceptance criteria executable: PERFORMANCE.md carries "Per-Mover Compositor Layers — the Task 20 gate" with three
// alternated rounds per side, a median and a min–max row that agree with those rounds, the gate verdicts, and the
// verdicts AGREE WITH THE NUMBERS (a miss cannot be written up as a pass, nor the reverse). Task 22's
// perMoverLayersDocs guard covers the rest of the phase's docs; this file stays about the gate.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) =>
  readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

const PERFORMANCE_DOC = 'docs/PERFORMANCE.md';
const PLAN_DOC = 'docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md';
const HEADING = /^## Per-Mover Compositor Layers — the Task 20 gate \((\d{4}-\d{2}-\d{2})\)$/m;
const COLUMNS = [
  'redrawn px²/frame',
  'screens/frame',
  'unresolved Paints',
  'busy (ms)',
  'Paint (ms)',
  'Compositor::Update (ms)',
  'Layerize (ms)',
  'frames',
];
const IDX = Object.fromEntries(COLUMNS.map((name, i) => [name, i])) as Record<string, number>;

/** The gate `##` section, up to the next `##` heading. */
function gateSection(): string {
  const text = read(PERFORMANCE_DOC);
  const match = HEADING.exec(text);
  expect(match, `${PERFORMANCE_DOC} has the "Task 20 gate" heading`).not.toBeNull();
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
const median3 = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y)[1];

interface ResultsTable {
  header: string[];
  rounds: number[][];
  median: number[];
  range: Array<[number, number]>;
}

/** Every results table in a section: a `Round` header row, rounds 1-3, a Median row and a Min–max row. */
function resultsTables(section: string): ResultsTable[] {
  const lines = section.split('\n');
  const tables: ResultsTable[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('|') || cells(lines[i])[0] !== 'Round') continue;
    const header = cells(lines[i]).slice(1);
    const body: string[][] = [];
    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) body.push(cells(lines[j]));
    const rounds = body.filter((r) => /^[1-9]$/.test(r[0])).map((r) => r.slice(1).map(num));
    const medianRow = body.find((r) => r[0] === 'Median');
    const rangeRow = body.find((r) => r[0] === 'Min–max');
    expect(medianRow, 'a Median row').toBeDefined();
    expect(rangeRow, 'a Min–max row').toBeDefined();
    const range = rangeRow!.slice(1).map((c) => {
      const [lo, hi] = c.split('–').map(num);
      return [lo, hi] as [number, number];
    });
    tables.push({ header, rounds, median: medianRow!.slice(1).map(num), range });
  }
  return tables;
}

/** The verdict table: rows keyed by their first cell, as [main, branch, limit, result] cells. */
function verdictRows(section: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  let inTable = false;
  for (const line of section.split('\n')) {
    if (line.startsWith('|') && cells(line)[0] === 'Gate criterion') {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) break;
    const row = cells(line);
    if (/^-+$/.test(row[0])) continue;
    rows.set(row[0], row.slice(1));
  }
  return rows;
}

const VERDICT_KEYS = {
  screens: 'screens/frame',
  busy: 'busy',
  paint: 'Paint',
  memory: 'Layer memory',
} as const;

const rowFor = (rows: Map<string, string[]>, startsWith: string) => {
  const key = [...rows.keys()].find((k) => k.startsWith(startsWith));
  expect(key, `a verdict row starting "${startsWith}"`).toBeDefined();
  return rows.get(key!)!;
};

describe('PERFORMANCE.md Task 20 gate (plan Task 20)', () => {
  it('has the dated section, placed before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const heading = HEADING.exec(text);
    expect(heading).not.toBeNull();
    expect(text.indexOf('## Recording a new baseline')).toBeGreaterThan(heading!.index);
  });

  it('has two results tables, main then branch, each with exactly three rounds in the gate columns', () => {
    const tables = resultsTables(gateSection());
    expect(tables).toHaveLength(2);
    for (const table of tables) {
      expect(table.header).toEqual(COLUMNS);
      expect(table.rounds).toHaveLength(3);
      for (const round of table.rounds) {
        expect(round).toHaveLength(COLUMNS.length);
        for (const value of round) expect(Number.isFinite(value) && value >= 0).toBe(true);
      }
    }
  });

  it('states a median and a min–max for every column of both tables that agree with the rounds', () => {
    for (const table of resultsTables(gateSection())) {
      COLUMNS.forEach((name, i) => {
        const [a, b, c] = table.rounds.map((r) => r[i]);
        expect(table.median[i], `${name} median`).toBe(median3(a, b, c));
        expect(table.range[i], `${name} min–max`).toEqual([Math.min(a, b, c), Math.max(a, b, c)]);
      });
    }
  });

  it('keeps redrawn area and screens/frame consistent in every round', () => {
    for (const table of resultsTables(gateSection())) {
      for (const round of table.rounds) {
        expect(round[IDX['screens/frame']]).toBeCloseTo(round[IDX['redrawn px²/frame']] / (1280 * 900), 2);
      }
    }
  });

  it('records the four gate criteria, each with a PASS or MISS result', () => {
    const rows = verdictRows(gateSection());
    for (const key of Object.values(VERDICT_KEYS)) {
      const row = rowFor(rows, key);
      expect(row, `${key} row`).toHaveLength(4);
      expect(row[3], `${key} result`).toMatch(/^(PASS|MISS)\b/);
    }
  });

  it('writes every verdict so that it agrees with the tables above it', () => {
    const section = gateSection();
    const [main, branch] = resultsTables(section);
    const rows = verdictRows(section);
    const result = (key: string) => rowFor(rows, key)[3].slice(0, 4);

    const mainScreens = main.median[IDX['screens/frame']];
    const branchScreens = branch.median[IDX['screens/frame']];
    expect(result(VERDICT_KEYS.screens), 'screens/frame ≤ 0.25 × main').toBe(branchScreens <= 0.25 * mainScreens ? 'PASS' : 'MISS');

    // "within main's spread" — at or under the top of main's min–max.
    const busyLimit = main.range[IDX['busy (ms)']][1];
    expect(result(VERDICT_KEYS.busy), 'busy within main spread').toBe(branch.median[IDX['busy (ms)']] <= busyLimit ? 'PASS' : 'MISS');
    const paintLimit = main.range[IDX['Paint (ms)']][1];
    expect(result(VERDICT_KEYS.paint), 'Paint within main spread').toBe(branch.median[IDX['Paint (ms)']] <= paintLimit ? 'PASS' : 'MISS');

    const memory = rowFor(rows, VERDICT_KEYS.memory);
    const mb = (cell: string) => Number(/([\d.]+) MB/.exec(cell)?.[1]);
    expect(Number.isFinite(mb(memory[0])) && Number.isFinite(mb(memory[1])), 'layer memory cells carry "<n> MB"').toBe(true);
    expect(result(VERDICT_KEYS.memory), 'layer memory ≤ main').toBe(mb(memory[1]) <= mb(memory[0]) ? 'PASS' : 'MISS');
  });

  it('states, in the headline verdict row, the ratio the criterion is judged by, to two places', () => {
    const section = gateSection();
    const [main, branch] = resultsTables(section);
    const ratio = branch.median[IDX['screens/frame']] / main.median[IDX['screens/frame']];
    expect(rowFor(verdictRows(section), VERDICT_KEYS.screens)[3], 'the screens/frame result cell').toContain(`${ratio.toFixed(2)} × main`);
  });

  it('names the builds and the method: both bundles, the link, the viewport, the clamp, the hygiene', () => {
    const section = gateSection();
    expect(section, 'main bundle').toMatch(/index-CVUy7kf3\.js/);
    expect(section, 'a second, branch bundle').toMatch(/index-(?!CVUy7kf3)[A-Za-z0-9_-]{8}\.js/);
    expect(section, 'a commit hash').toMatch(/\b[0-9a-f]{8}\b/);
    expect(section, 'the pinned link').toMatch(/\?session=/);
    expect(section, 'the viewport').toMatch(/1280 ?[×x] ?900/);
    expect(section, 'the harness command').toMatch(/npm run perf:idle/);
    expect(section, 'the ablation').toMatch(/--only none/);
    expect(section, 'the layer clamp').toMatch(/clamp/i);
    expect(section, 'alternated').toMatch(/alternat/i);
    expect(section).toMatch(/foreground/i);
    expect(section, 'orphaned Chrome 0 before, then 0 after, in one sentence').toMatch(
      /orphaned[^.\n]*count 0 before[^.\n]*\b0 after/i,
    );
  });

  it('records the compositor-layer readouts of both sides, and the unrecorded-not-gated columns', () => {
    const section = gateSection();
    expect(section.match(/Compositor layers: \d+/g)?.length, 'one layer readout per side').toBeGreaterThanOrEqual(2);
    expect(section).toMatch(/Mover layers: 0/);
    expect(section).toMatch(/Mover layers: [1-9]\d*/);
    expect(section, 'Compositor::Update is recorded, not gated').toMatch(/Compositor::Update[^.\n]*not gated/i);
  });

  it('names the stock painters of both sides and does not act on a miss', () => {
    const section = gateSection();
    expect(section).toMatch(/stock painters/i);
    if (/\bMISS\b/.test(section)) {
      expect(section, 'a miss stops for Crawford instead of being acted on').toMatch(/Crawford/);
      expect(section).toMatch(/not acted on|stopped|stop(s)? here/i);
    }
  });

  it('links the plan relatively, and the plan carries the same run', () => {
    expect(gateSection()).toMatch(/\]\(tasks\/PER_MOVER_COMPOSITOR_LAYERS\.md\)/);
    expect(existsSync(resolve(repoRoot, PLAN_DOC))).toBe(true);
    expect(read(PLAN_DOC)).toMatch(/### Task 20 — the gate/);
  });
});
