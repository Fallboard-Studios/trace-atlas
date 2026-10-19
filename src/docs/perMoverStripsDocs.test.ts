import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PERFORMANCE_DOC, cells, num, read, repoRoot, sectionMatching } from './perfDocTables';

// docs/tasks/PER_MOVER_REVIEW_FOLLOWUPS.md R5, option (3): separate the bubble strips from the other movers. A
// measurement has no behaviour to test, so this makes its record executable: every run is in a table with its stock
// window, the acceptance rule is applied row by row against the medians the section states, the medians and gaps
// agree with the accepted rows, and the reading quotes the gaps the table gives.

const HEADING =
  /^## Per-Mover Compositor Layers — review follow-up R5, option 3: the strips separated \((\d{4}-\d{2}-\d{2})\)$/m;
const R5_HEADING =
  /^## Per-Mover Compositor Layers — review follow-up R5: bubble strips drawing \(\d{4}-\d{2}-\d{2}\)$/m;
const DECK_HEADING = /^## Deck scroller compositing — the desktop A\/B \(\d{4}-\d{2}-\d{2}\)$/m;
const PLAN_DOC = 'docs/tasks/PER_MOVER_REVIEW_FOLLOWUPS.md';

const CONDITIONS = [
  'bubbles present',
  'circles detached, strips kept',
  'strips detached (circles with them)',
];
const RUN_COLUMNS = [
  'Run',
  'Build',
  'stock Compositor::Update (ms)',
  'accepted',
  'window 2 busy (ms)',
  'Paint (ms)',
  'Compositor::Update (ms)',
  'Layerize (ms)',
  'frames',
];
const GAP_COLUMNS = ['busy', 'Paint', 'Compositor::Update', 'Layerize'] as const;
const RUN_KEY: Record<(typeof GAP_COLUMNS)[number], string> = {
  busy: 'window 2 busy (ms)',
  Paint: 'Paint (ms)',
  'Compositor::Update': 'Compositor::Update (ms)',
  Layerize: 'Layerize (ms)',
};
/** Under this a 30 s window was truncated (30 × 60 × 0.5). */
const MIN_FRAMES = 900;

type Build = 'main' | 'branch';
interface Run {
  name: string;
  build: Build;
  stock: number;
  accepted: boolean;
  values: Record<string, number>;
}

const section = () => sectionMatching(HEADING);

/** The rows of the first table after a `###` heading. */
function tableAfter(s: string, heading: string): string[][] {
  const at = s.indexOf(`### ${heading}\n`);
  expect(at, `a "### ${heading}" table`).toBeGreaterThanOrEqual(0);
  const lines = s.slice(at).split('\n').slice(1);
  const start = lines.findIndex((l) => l.startsWith('|'));
  const out: string[][] = [];
  for (let j = start; j < lines.length && lines[j].startsWith('|'); j++) out.push(cells(lines[j]));
  return out;
}

function runsFor(s: string, condition: string): Run[] {
  const [header, , ...body] = tableAfter(s, `Window 2, ${condition}`);
  expect(header).toEqual(RUN_COLUMNS);
  return body.map((row) => {
    const at = (name: string) => row[RUN_COLUMNS.indexOf(name)];
    const build = at('Build') === '`main`' ? 'main' : 'branch';
    expect(['`main`', 'branch']).toContain(at('Build'));
    return {
      name: at('Run'),
      build,
      stock: num(at('stock Compositor::Update (ms)')),
      accepted: at('accepted') === 'yes',
      values: Object.fromEntries(RUN_COLUMNS.slice(4).map((name) => [name, num(at(name))])),
    };
  });
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const allRuns = () => CONDITIONS.flatMap((c) => runsFor(section(), c));
const stockMedian = (build: Build) =>
  median(
    allRuns()
      .filter((r) => r.build === build)
      .map((r) => r.stock)
  );

/** "1891 → 1923 (+32)" → [1891, 1923, 32]. */
const parseGap = (cell: string) => {
  const m = /^(-?[\d.]+) → (-?[\d.]+) \(([+-]?[\d.]+)\)$/.exec(cell);
  expect(m, `a "main → branch (gap)" cell: ${cell}`).not.toBeNull();
  return [Number(m![1]), Number(m![2]), Number(m![3])];
};

describe('PERFORMANCE.md: R5 option (3), the bubble strips separated from the other movers', () => {
  it('has the dated section, after R5 and the deck scroller A/B, before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const at = HEADING.exec(text)!.index;
    expect(at).toBeGreaterThan(R5_HEADING.exec(text)!.index);
    expect(at).toBeGreaterThan(DECK_HEADING.exec(text)!.index);
    expect(text.indexOf('## Recording a new baseline')).toBeGreaterThan(at);
  });

  it('puts every run in a table, both builds under every condition, each window untruncated', () => {
    for (const c of CONDITIONS) {
      const runs = runsFor(section(), c);
      for (const b of ['main', 'branch'] as const) {
        expect(
          runs.filter((r) => r.build === b && r.accepted).length,
          `${c}: ${b}`
        ).toBeGreaterThanOrEqual(3);
      }
      for (const r of runs) expect(r.values.frames, r.name).toBeGreaterThanOrEqual(MIN_FRAMES);
    }
    const names = allRuns().map((r) => `${r.name}`);
    expect(new Set(names).size, 'run names are unique').toBe(names.length);
  });

  it('states the stock medians the rule uses, and applies the ±10 % rule to every row', () => {
    const s = section();
    const m = stockMedian('main');
    const b = stockMedian('branch');
    expect(s).toContain(`\`main\` ${m} ms and the branch ${b} ms`);
    for (const r of allRuns()) {
      const med = r.build === 'main' ? m : b;
      expect(r.accepted, `${r.name}: stock ${r.stock} against ${med}`).toBe(
        Math.abs(r.stock - med) <= 0.1 * med
      );
    }
    expect(
      allRuns().some((r) => !r.accepted),
      'the rejected runs are shown, not dropped'
    ).toBe(true);
  });

  it('has a medians table that agrees with the accepted rows, with the gap as branch minus main', () => {
    const s = section();
    const [header, , ...body] = tableAfter(s, 'Medians of the accepted runs, and the gap');
    expect(header.slice(0, 3)).toEqual(['Window 2 condition', '`main` runs', 'branch runs']);
    expect(body.map((r) => r[0])).toEqual(CONDITIONS);
    for (const row of body) {
      const runs = runsFor(s, row[0]).filter((r) => r.accepted);
      const main = runs.filter((r) => r.build === 'main');
      const branch = runs.filter((r) => r.build === 'branch');
      expect(num(row[1])).toBe(main.length);
      expect(num(row[2])).toBe(branch.length);
      GAP_COLUMNS.forEach((col, i) => {
        const [mv, bv, gap] = parseGap(row[3 + i]);
        expect(mv, `${row[0]} ${col} main`).toBe(median(main.map((r) => r.values[RUN_KEY[col]])));
        expect(bv, `${row[0]} ${col} branch`).toBe(
          median(branch.map((r) => r.values[RUN_KEY[col]]))
        );
        expect(gap).toBeCloseTo(bv - mv, 6);
      });
    }
  });

  it('quotes the Compositor::Update and busy gaps it reads, as the medians table gives them', () => {
    const s = section();
    const [, , ...body] = tableAfter(s, 'Medians of the accepted runs, and the gap');
    const gap = (row: string[], col: number) => Math.round(parseGap(row[3 + col])[2]);
    const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;
    const cu = body.map((r) => signed(gap(r, 2)));
    const busy = body.map((r) => signed(gap(r, 0)));
    expect(s).toContain(`Compositor::Update gap ${cu.join(' → ')} ms`);
    expect(s).toContain(`busy gap ${busy.join(' → ')} ms`);
  });

  it('says what it does not decide, and leaves R5 as recorded', () => {
    const s = section();
    expect(s).toMatch(/Crawford/);
    expect(s).toMatch(/R5 section above stands as written/);
    expect(s).toMatch(/window 2/);
    expect(s, 'the window-position confound is named').toMatch(/same window position/);
  });

  it('records the decision as a dated paragraph, and the plan carries it on R5', () => {
    const decision =
      /^\*\*Decision \((\d{4}-\d{2}-\d{2})\): Crawford accepts R5's busy MISS\.\*\*([^\n]*)$/m.exec(
        section()
      );
    expect(decision, 'a dated decision paragraph').not.toBeNull();
    expect(decision![2], 'no bubble redesign follows from it').toMatch(/no bubble redesign/i);
    expect(read(PLAN_DOC)).toMatch(/\*\*ACCEPTED by Crawford, (\d{4}-\d{2}-\d{2})\*\*/);
  });

  it('names the builds, the harness, the world and the hygiene', () => {
    const s = section();
    expect(s).toContain('index-CVUy7kf3.js');
    expect(s).toContain('index-BSuw5Pa7.js');
    expect(s).toMatch(/`2d05d6d8`/);
    expect(s).toMatch(/`1eb022d2`/);
    expect(s).toMatch(/\(-100, -100\)/);
    expect(s).toMatch(/npm run perf:idle/);
    expect(s).toMatch(/--only detach-bubble-strips/);
    expect(s).toMatch(/--window 30000/);
    expect(s).toMatch(/foreground/i);
    expect(s, 'orphaned Chrome 0 before, then 0 after, in one sentence').toMatch(
      /orphaned[^.\n]*count 0 before[^.\n]*\b0 after/i
    );
  });

  it('links the plan relatively, and the plan points back', () => {
    const s = section();
    expect(s).toMatch(/\]\(tasks\/PER_MOVER_REVIEW_FOLLOWUPS\.md\)/);
    expect(s).toMatch(/perMoverStripsDocs\.test\.ts/);
    expect(existsSync(resolve(repoRoot, PLAN_DOC))).toBe(true);
    expect(read(PLAN_DOC)).toMatch(/option \(3\)[^\n]*the strips separated/i);
  });
});
