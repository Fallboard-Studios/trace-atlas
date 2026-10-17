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

// docs/tasks/PER_MOVER_REVIEW_FOLLOWUPS.md R6: the dimmed world (`data-dimmed`). A measurement task has no behaviour to
// test, so this makes its acceptance criteria executable: PERFORMANCE.md carries "Per-Mover Compositor Layers — review
// follow-up R6" with three alternated rounds per side, medians and ranges that agree with those rounds, verdicts that AGREE
// WITH THE NUMBERS (a miss cannot be written up as a pass, nor the reverse), and a record that every run was dimmed.

const HEADING = /^## Per-Mover Compositor Layers — review follow-up R6: the dimmed world \((\d{4}-\d{2}-\d{2})\)$/m;
const PLAN_DOC = 'docs/tasks/PER_MOVER_REVIEW_FOLLOWUPS.md';
const section = () => sectionMatching(HEADING);

const KEYS = { busy: 'busy', paint: 'Paint', screens: 'screens/frame' } as const;

describe('PERFORMANCE.md review follow-up R6 (the dimmed world)', () => {
  it('has the dated section, after the R5 section and before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const heading = HEADING.exec(text);
    expect(heading).not.toBeNull();
    expect(text.indexOf('## Per-Mover Compositor Layers — review follow-up R5')).toBeLessThan(heading!.index);
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

  it('measures the stock 6 s window: about 6 s of frames in every round, not a truncated trace', () => {
    for (const table of resultsTables(section())) {
      for (const round of table.rounds) {
        expect(round[IDX.frames]).toBeGreaterThan(250);
        expect(round[IDX.frames]).toBeLessThan(450);
      }
    }
  });

  it('records the three gated criteria, each with a PASS or MISS result', () => {
    const rows = verdictRows(section());
    for (const key of Object.values(KEYS)) {
      const row = rowFor(rows, key);
      expect(row, `${key} row`).toHaveLength(4);
      expect(row[3], `${key} result`).toMatch(/^(PASS|MISS)\b/);
    }
  });

  it('writes every verdict so that it agrees with the tables above it: not above main median', () => {
    const [main, branch] = resultsTables(section());
    const rows = verdictRows(section());
    const result = (key: string) => rowFor(rows, key)[3].slice(0, 4);
    const expected = (column: string) => (branch.median[IDX[column]] <= main.median[IDX[column]] ? 'PASS' : 'MISS');

    expect(result(KEYS.busy), 'busy').toBe(expected('busy (ms)'));
    expect(result(KEYS.paint), 'Paint').toBe(expected('Paint (ms)'));
    expect(result(KEYS.screens), 'screens/frame').toBe(expected('screens/frame'));
  });

  it('puts the main and branch medians in the verdict rows, equal to the tables', () => {
    const [main, branch] = resultsTables(section());
    const rows = verdictRows(section());
    const pairs: Array<[string, string]> = [
      [KEYS.busy, 'busy (ms)'],
      [KEYS.paint, 'Paint (ms)'],
      [KEYS.screens, 'screens/frame'],
    ];
    for (const [key, column] of pairs) {
      const row = rowFor(rows, key);
      expect(row[0], `${key} main`).toContain(String(main.median[IDX[column]]));
      expect(row[1], `${key} branch`).toContain(String(branch.median[IDX[column]]));
    }
  });

  it('states the screens/frame ratio the headline is judged by, to two places', () => {
    const [main, branch] = resultsTables(section());
    const ratio = branch.median[IDX['screens/frame']] / main.median[IDX['screens/frame']];
    expect(rowFor(verdictRows(section()), KEYS.screens)[3]).toContain(`${ratio.toFixed(2)} × main`);
  });

  it('names the builds and the method: both bundles, the world, the tile, the viewport, the flags, the hygiene', () => {
    const text = section();
    expect(text, 'main bundle').toMatch(/index-CVUy7kf3\.js/);
    expect(text, 'a second, branch bundle').toMatch(/index-(?!CVUy7kf3)[A-Za-z0-9_-]{8}\.js/);
    expect(text, 'a commit hash').toMatch(/\b[0-9a-f]{8}\b/);
    expect(text, 'the world of the R5 section').toMatch(/R5/);
    expect(text, 'the viewport').toMatch(/1280 ?[×x] ?900/);
    expect(text, 'the command line opens the tile').toMatch(/npm run perf:idle[^\n]*--steps "Fleet Params"/);
    expect(text, 'the command line requires the dimmed world').toMatch(/npm run perf:idle[^\n]*--expect-dimmed yes/);
    expect(text, 'the stock window, no long window').not.toMatch(/npm run perf:idle[^\n]*--window/);
    expect(text, 'alternated').toMatch(/alternat/i);
    expect(text).toMatch(/foreground/i);
    expect(text, 'orphaned Chrome 0 before, then 0 after, in one sentence').toMatch(
      /orphaned[^.\n]*count 0 before[^.\n]*\b0 after/i,
    );
  });

  it('records that every run was dimmed, and what the harness does with one that is not', () => {
    const text = section();
    expect(text, 'every run reported dimmed').toMatch(/World: dimmed/);
    expect(text, 'the rejection message of an undimmed run').toMatch(/Run rejected: expected a dimmed world, read "undimmed"/);
    expect(text, 'and the reverse').toMatch(/Run rejected: expected an undimmed world, read "dimmed"/);
  });

  it('records that both sides reached the same screen', () => {
    expect(section()).toMatch(/"heading":"Fleet Params/);
    expect(section()).toMatch(/"cabinetBoxes":58/);
  });

  it('records the compositor-layer readouts of both sides, and Compositor::Update and Layerize as recorded, not gated', () => {
    const text = section();
    expect(text.match(/Compositor layers: \d+/g)?.length, 'one layer readout per side').toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/Mover layers: 0/);
    expect(text).toMatch(/Mover layers: [1-9]\d*/);
    expect(text, 'Compositor::Update is recorded, not gated').toMatch(/Compositor::Update[^.\n]*not gated/i);
  });

  it('does not read screens/frame as a clean win: it names the unresolved Paints that bound the branch figure', () => {
    expect(section()).toMatch(/unresolved Paints/i);
  });

  it('does not act on a miss: if any gate is a MISS it stops for Crawford and says a fix is a look decision', () => {
    const text = section();
    if (/\| MISS\b/.test(text)) {
      expect(text).toMatch(/Crawford/);
      expect(text).toMatch(/not acted on|stopped|stop(s)? here/i);
      expect(text, 'a fix changes how the dimmed world is produced').toMatch(/look decision/i);
    }
  });

  it('links the spec and the follow-up plan relatively, and the plan carries R6', () => {
    const text = section();
    expect(text).toMatch(/\]\(specs\/PER_MOVER_COMPOSITOR_LAYERS\.md\)/);
    expect(text).toMatch(/\]\(tasks\/PER_MOVER_REVIEW_FOLLOWUPS\.md\)/);
    expect(existsSync(resolve(repoRoot, PLAN_DOC))).toBe(true);
    expect(read(PLAN_DOC)).toMatch(/\*\*R6: The dimmed world/);
  });
});
