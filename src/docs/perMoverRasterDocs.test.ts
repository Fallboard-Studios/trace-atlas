import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PERFORMANCE_DOC,
  median3,
  num,
  read,
  repoRoot,
  resultsTables,
  sectionMatching,
} from './perfDocTables';

// docs/tasks/DOCUMENT_REPAINT.md Phase 5 (option b): the re-rastered area column. A measurement task has no behaviour
// to test, so this makes its record executable, the way perMoverGateDocs.test.ts does for the gate: PERFORMANCE.md
// carries "Per-Mover Compositor Layers — the re-rastered area column" with three alternated rounds per side, medians
// and ranges that agree with the rounds, both area columns consistent with their px² over the 1280 × 900 viewport,
// the paint-clip columns reproducing the gate re-run on the same builds (the check that the wiring changed nothing
// else), the floor explained, and the column stated as recorded, not gated.

const HEADING =
  /^## Per-Mover Compositor Layers — the re-rastered area column \((\d{4}-\d{2}-\d{2})\)$/m;
const RERUN_HEADING =
  /^## Per-Mover Compositor Layers — the Task 20 gate, re-run with the frame wrappers left out \(\d{4}-\d{2}-\d{2}\)$/m;
const PLAN_DOC = 'docs/tasks/DOCUMENT_REPAINT.md';

const COLUMNS = [
  'rastered px²/frame',
  'rastered screens/frame',
  'unresolved raster layers',
  'late layers',
  'redrawn px²/frame',
  'screens/frame',
  'busy (ms)',
  'Paint (ms)',
  'Compositor::Update (ms)',
  'Layerize (ms)',
  'frames',
];
const IDX = Object.fromEntries(COLUMNS.map((name, i) => [name, i])) as Record<string, number>;
const VIEWPORT_PX = 1280 * 900;

const section = () => sectionMatching(HEADING);

describe('PERFORMANCE.md: the re-rastered area column (DOCUMENT_REPAINT.md Phase 5)', () => {
  it('has the dated section, after the gate re-run and before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const heading = HEADING.exec(text);
    expect(heading).not.toBeNull();
    expect(RERUN_HEADING.exec(text)!.index, 'after the re-run it extends').toBeLessThan(
      heading!.index
    );
    expect(text.indexOf('## Recording a new baseline')).toBeGreaterThan(heading!.index);
  });

  it('has two results tables, main then branch, each with exactly three rounds in the columns', () => {
    const tables = resultsTables(section());
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
    for (const table of resultsTables(section())) {
      COLUMNS.forEach((name, i) => {
        const [a, b, c] = table.rounds.map((r) => r[i]);
        expect(table.median[i], `${name} median`).toBe(median3(a, b, c));
        expect(table.range[i], `${name} min–max`).toEqual([Math.min(a, b, c), Math.max(a, b, c)]);
      });
    }
  });

  it('keeps both area columns consistent with their px² over the viewport, in every round', () => {
    for (const table of resultsTables(section())) {
      for (const round of table.rounds) {
        expect(round[IDX['rastered screens/frame']]).toBeCloseTo(
          round[IDX['rastered px²/frame']] / VIEWPORT_PX,
          2
        );
        expect(round[IDX['screens/frame']]).toBeCloseTo(
          round[IDX['redrawn px²/frame']] / VIEWPORT_PX,
          2
        );
      }
    }
  });

  it('has frames in every round, and main resolves every raster layer', () => {
    const [main, branch] = resultsTables(section());
    for (const table of [main, branch])
      for (const round of table.rounds) expect(round[IDX.frames]).toBeGreaterThan(300);
    for (const round of main.rounds) expect(round[IDX['unresolved raster layers']]).toBe(0);
  });

  it('reproduces the gate re-run on the paint-clip column, both sides, which is the check that the wiring changed nothing else', () => {
    const [main, branch] = resultsTables(section());
    const [rerunMain, rerunBranch] = resultsTables(sectionMatching(RERUN_HEADING));
    const rerunIdx = rerunMain.header.indexOf('screens/frame');
    expect(rerunIdx).toBeGreaterThanOrEqual(0);
    expect(
      Math.abs(main.median[IDX['screens/frame']] - rerunMain.median[rerunIdx]),
      'main'
    ).toBeLessThanOrEqual(0.05);
    expect(
      Math.abs(branch.median[IDX['screens/frame']] - rerunBranch.median[rerunIdx]),
      'branch'
    ).toBeLessThanOrEqual(0.05);
  });

  it('states the medians and the ratio it reads, to two places, in the reading', () => {
    const s = section();
    const [main, branch] = resultsTables(s);
    const m = main.median[IDX['rastered screens/frame']];
    const b = branch.median[IDX['rastered screens/frame']];
    expect(s).toContain(`main ${m.toFixed(2)}, branch ${b.toFixed(2)}`);
    expect(s).toContain(`${(b / m).toFixed(2)} × \`main\``);
  });

  it('is recorded, not gated, and does not rewrite the gate', () => {
    const s = section();
    expect(s).toMatch(/not a gate/i);
    expect(s).toMatch(/recorded, not gated/i);
    expect(s).not.toMatch(/\| Gate criterion \|/);
    expect(s).toMatch(/untouched/);
  });

  it('names the signal, the helper, the floor and the second snapshot', () => {
    const s = section();
    expect(s).toMatch(/RasterTask/);
    expect(s).toMatch(/tileData\.layerId/);
    expect(s).toMatch(/sourceFrameNumber/);
    expect(s).toMatch(/rasteredArea/);
    expect(s).toMatch(/unresolved raster layers/);
    expect(s).toMatch(/late layers/);
    expect(s).toMatch(/floor/);
    expect(s).toMatch(/raster by layer/);
    expect(s, 'the mutants are counted').toMatch(/\d+ mutants killed/);
  });

  it('names the builds and the method: both bundles, the link, the viewport, the hygiene', () => {
    const s = section();
    expect(s, 'main bundle').toMatch(/index-CVUy7kf3\.js/);
    expect(s, 'a second, branch bundle').toMatch(/index-(?!CVUy7kf3)[A-Za-z0-9_-]{8}\.js/);
    expect(s, 'a commit hash').toMatch(/\b[0-9a-f]{8}\b/);
    expect(s, 'the pinned link').toMatch(/\?session=/);
    expect(s, 'the viewport').toMatch(/1280 ?[×x] ?900/);
    expect(s, 'the harness command').toMatch(/npm run perf:idle/);
    expect(s, 'the ablation').toMatch(/--only none/);
    expect(s, 'alternated').toMatch(/alternat/i);
    expect(s).toMatch(/foreground/i);
    expect(s, 'orphaned Chrome 0 before, then 0 after, in one sentence').toMatch(
      /orphaned[^.\n]*count 0 before[^.\n]*\b0 after/i
    );
  });

  it('reads what each build is made of and says what the Paint column could not see', () => {
    const s = section();
    expect(s).toMatch(/three moving sheets/i);
    expect(s).toMatch(/no `Paint` event/);
    expect(s).toMatch(/dissolve/);
    expect(s).toMatch(/screen-content/);
    expect(s, 'the new side finding is filed, not acted on').toMatch(/not acted on/);
  });

  it('links the plan relatively, and the plan carries Phase 5', () => {
    const s = section();
    expect(s).toMatch(/\]\(tasks\/DOCUMENT_REPAINT\.md\)/);
    expect(existsSync(resolve(repoRoot, PLAN_DOC))).toBe(true);
    expect(read(PLAN_DOC)).toMatch(/^## Phase 5 — Option \(b\)/m);
  });

  it('is named in the localizer paragraph and the caveats', () => {
    const text = read(PERFORMANCE_DOC);
    expect(text).toMatch(/\*\*Re-rastered area \(DOCUMENT_REPAINT\.md Phase 5, option b\)\.\*\*/);
    expect(text, 'the RasterTask caveat distinguishes time from presence').toMatch(
      /RasterTask[^\n]*unstable[^\n]*rastered screens\/frame/
    );
  });

  it('agrees with the helper on the rule: one charge per layer per frame', () => {
    // The lib is what the harness ran; the doc describes it. Pin the description to the code's own words.
    const lib = read('scripts/perf/paint-area-lib.mjs');
    expect(lib).toMatch(/export function rasteredArea\(/);
    expect(lib).toMatch(/once for every frame in which at least one `RasterTask` ran for it/);
    expect(section()).toMatch(/once for every frame in which at least one `RasterTask` ran for it/);
    expect(num('3723624') / VIEWPORT_PX).toBeCloseTo(3.23, 2);
  });
});
