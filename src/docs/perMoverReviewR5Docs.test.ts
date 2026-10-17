import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COLUMNS,
  IDX,
  PERFORMANCE_DOC,
  median3,
  read,
  repoRoot,
  resultsTables,
  rowFor,
  sectionMatching,
  verdictRows,
} from './perfDocTables';

// docs/tasks/PER_MOVER_REVIEW_FOLLOWUPS.md R5 (spec §7 Q3). A measurement task has no behaviour to test, so this makes its
// acceptance criteria executable: PERFORMANCE.md carries "Per-Mover Compositor Layers — review follow-up R5" with three
// alternated rounds per side, medians and ranges that agree with those rounds, verdicts that AGREE WITH THE NUMBERS (a miss
// cannot be written up as a pass), and the stop-and-report wording a miss needs.

const HEADING = /^## Per-Mover Compositor Layers — review follow-up R5: bubble strips drawing \((\d{4}-\d{2}-\d{2})\)$/m;
const PLAN_DOC = 'docs/tasks/PER_MOVER_REVIEW_FOLLOWUPS.md';
const section = () => sectionMatching(HEADING);

const KEYS = { busy: 'busy', paint: 'Paint', memory: 'Layer memory' } as const;

describe('PERFORMANCE.md review follow-up R5 (bubble strips drawing)', () => {
  it('has the dated section, after the Task 20 gate and before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const heading = HEADING.exec(text);
    expect(heading).not.toBeNull();
    expect(text.indexOf('## Per-Mover Compositor Layers — the Task 20 gate')).toBeLessThan(heading!.index);
    expect(text.indexOf('## Recording a new baseline')).toBeGreaterThan(heading!.index);
  });

  it('has two results tables, main then branch, each with exactly three rounds in the gate columns', () => {
    const tables = resultsTables(section());
    expect(tables).toHaveLength(2);
    for (const table of tables) {
      expect(table.header).toEqual([...COLUMNS]);
      expect(table.rounds).toHaveLength(3);
      for (const round of table.rounds) {
        expect(round).toHaveLength(COLUMNS.length);
        for (const value of round) expect(Number.isFinite(value) && value >= 0).toBe(true);
      }
    }
  });

  it('states a median and a min–max for every column of both tables that agree with the rounds', () => {
    for (const table of resultsTables(section())) {
      COLUMNS.forEach((name, i) => {
        const [a, b, c] = table.rounds.map((r) => r[i]);
        expect(table.median[i], `${name} median`).toBe(median3(a, b, c));
        expect(table.range[i], `${name} min–max`).toEqual([Math.min(a, b, c), Math.max(a, b, c)]);
      });
    }
  });

  it('keeps redrawn area and screens/frame consistent in every round', () => {
    for (const table of resultsTables(section())) {
      for (const round of table.rounds) {
        expect(round[IDX['screens/frame']]).toBeCloseTo(round[IDX['redrawn px²/frame']] / (1280 * 900), 2);
      }
    }
  });

  it('measures a window that is long enough to hold the bubbles drawing: about 30 s of frames in every round', () => {
    for (const table of resultsTables(section())) {
      for (const round of table.rounds) expect(round[IDX.frames]).toBeGreaterThan(1500);
    }
  });

  it('records the three gate criteria, each with a PASS or MISS result', () => {
    const rows = verdictRows(section());
    for (const key of Object.values(KEYS)) {
      const row = rowFor(rows, key);
      expect(row, `${key} row`).toHaveLength(4);
      expect(row[3], `${key} result`).toMatch(/^(PASS|MISS)\b/);
    }
  });

  it('writes every verdict so that it agrees with the tables above it', () => {
    const [main, branch] = resultsTables(section());
    const rows = verdictRows(section());
    const result = (key: string) => rowFor(rows, key)[3].slice(0, 4);

    // "within main's spread" — at or under the top of main's min–max (the Task 20 gate's rule).
    expect(result(KEYS.busy), 'busy within main spread').toBe(
      branch.median[IDX['busy (ms)']] <= main.range[IDX['busy (ms)']][1] ? 'PASS' : 'MISS',
    );
    expect(result(KEYS.paint), 'Paint within main spread').toBe(
      branch.median[IDX['Paint (ms)']] <= main.range[IDX['Paint (ms)']][1] ? 'PASS' : 'MISS',
    );

    const memory = rowFor(rows, KEYS.memory);
    const mb = (cell: string) => Number(/([\d.]+) MB/.exec(cell)?.[1]);
    expect(Number.isFinite(mb(memory[0])) && Number.isFinite(mb(memory[1])), 'layer memory cells carry "<n> MB"').toBe(true);
    expect(result(KEYS.memory), 'layer memory ≤ main').toBe(mb(memory[1]) <= mb(memory[0]) ? 'PASS' : 'MISS');
  });

  it('puts main and branch medians in the verdict rows, equal to the tables', () => {
    const [main, branch] = resultsTables(section());
    const rows = verdictRows(section());
    const busy = rowFor(rows, KEYS.busy);
    expect(busy[0]).toContain(String(main.median[IDX['busy (ms)']]));
    expect(busy[1]).toContain(String(branch.median[IDX['busy (ms)']]));
    const paint = rowFor(rows, KEYS.paint);
    expect(paint[0]).toContain(String(main.median[IDX['Paint (ms)']]));
    expect(paint[1]).toContain(String(branch.median[IDX['Paint (ms)']]));
  });

  it('names the builds and the method: both bundles, the world, the viewport, the window, the flags, the hygiene', () => {
    const text = section();
    expect(text, 'main bundle').toMatch(/index-CVUy7kf3\.js/);
    expect(text, 'a second, branch bundle').toMatch(/index-(?!CVUy7kf3)[A-Za-z0-9_-]{8}\.js/);
    expect(text, 'a commit hash').toMatch(/\b[0-9a-f]{8}\b/);
    expect(text, 'the world link').toMatch(/\?session=/);
    expect(text, 'the viewport').toMatch(/1280 ?[×x] ?900/);
    expect(text, 'the harness command').toMatch(/npm run perf:idle/);
    expect(text, 'the command line waits for bubbles').toMatch(/npm run perf:idle[^\n]*--bubbles 5/);
    expect(text, 'the command line asserts the world is undimmed').toMatch(/npm run perf:idle[^\n]*--expect-dimmed no/);
    expect(text, 'the command line holds the long window').toMatch(/npm run perf:idle[^\n]*--window 30000/);
    expect(text, 'alternated').toMatch(/alternat/i);
    expect(text).toMatch(/foreground/i);
    expect(text, 'orphaned Chrome 0 before, then 0 after, in one sentence').toMatch(
      /orphaned[^.\n]*count 0 before[^.\n]*\b0 after/i,
    );
  });

  it('says the world has bubbles, and why it is not the Task 20 world', () => {
    const text = section();
    expect(text, 'the bubble circle count of the world').toMatch(/135 bubble circles/);
    expect(text, 'the Task 20 world had none').toMatch(/Task 20[^.\n]*(0|no|zero) bubble circles/i);
  });

  it('records the compositor-layer and bubble-layer readouts of both sides', () => {
    const text = section();
    expect(text.match(/Compositor layers: \d+/g)?.length, 'one layer readout per side').toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/Bubble layers: 1 \(/);
    expect(text).toMatch(/Bubble layers: 18 \(/);
    expect(text).toMatch(/Mover layers: 0/);
    expect(text).toMatch(/Mover layers: [1-9]\d*/);
    expect(text, 'Compositor::Update and Layerize are recorded, not gated').toMatch(/Compositor::Update[^.\n]*not gated/i);
  });

  it('records that the Paint column does not see the bubbles move, with the counts it rests on', () => {
    const text = section();
    expect(text).toMatch(/Bubble paints/i);
    expect(text, 'a hypothesis is labelled as one').toMatch(/hypothes|not proved|unproved/i);
  });

  it('names the trace-buffer finding: a window over 6 s was cut short until invalidation tracking was dropped', () => {
    const text = section();
    expect(text).toMatch(/invalidation tracking/i);
    expect(text).toMatch(/325 frames/);
    expect(text).toMatch(/1799|1800|1801/);
  });

  it('does not act on a miss: it stops for Crawford and says what the options are', () => {
    const text = section();
    if (/\bMISS\b/.test(text)) {
      expect(text, 'a miss stops for Crawford instead of being acted on').toMatch(/Crawford/);
      expect(text.split('\n').slice(0, 4).join('\n'), 'the opening says the run stopped').toMatch(/the run stopped here, not acted on/i);
      expect(text, 'and a closing heading says it again').toMatch(/^### Stopped here, not acted on$/m);
      expect(text, 'spec Q3 names the reaction').toMatch(/Q3/);
    }
  });

  it('links the spec and the follow-up plan relatively, and the plan carries R5', () => {
    const text = section();
    expect(text).toMatch(/\]\(specs\/PER_MOVER_COMPOSITOR_LAYERS\.md\)/);
    expect(text).toMatch(/\]\(tasks\/PER_MOVER_REVIEW_FOLLOWUPS\.md\)/);
    expect(existsSync(resolve(repoRoot, PLAN_DOC))).toBe(true);
    expect(read(PLAN_DOC)).toMatch(/\*\*R5: Bubble strips with bubbles actually drawing/);
  });
});
