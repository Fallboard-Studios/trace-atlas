import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PERFORMANCE_DOC,
  cells,
  median3,
  num,
  read,
  repoRoot,
  resultsTables,
  sectionMatching,
} from './perfDocTables';

// docs/tasks/DECK_SCROLLER_COMPOSITING.md T1.3: the desktop A/B of the deck scroller's two mitigations. A measurement
// task has no behaviour to test, so this makes its record executable, the way perMoverRasterDocs.test.ts does for the
// re-rastered area column: PERFORMANCE.md carries "Deck scroller compositing — the desktop A/B" with three rotated rounds
// per variant, medians and ranges that agree with the rounds, both area columns consistent with their px² over the
// viewport they were taken at, a 1600 × 900 control naming all three variants, and the reading's figures matching the
// tables it reads them from.

const HEADING = /^## Deck scroller compositing — the desktop A\/B \((\d{4}-\d{2}-\d{2})\)$/m;
const RASTER_HEADING =
  /^## Per-Mover Compositor Layers — the re-rastered area column \(\d{4}-\d{2}-\d{2}\)$/m;
const PLAN_DOC = 'docs/tasks/DECK_SCROLLER_COMPOSITING.md';

const COLUMNS = [
  'rastered px²/frame',
  'rastered screens/frame',
  'unresolved raster layers',
  'late layers',
  'redrawn px²/frame',
  'screens/frame',
  'busy (ms)',
  'Paint n',
  'Paint (ms)',
  'Compositor::Update (ms)',
  'Layerize (ms)',
  'frames',
  'long tasks',
  'shell layer frames',
  'shell layer tasks',
  'scroller layer frames',
  'scroller layer tasks',
];
const IDX = Object.fromEntries(COLUMNS.map((name, i) => [name, i])) as Record<string, number>;
const VARIANTS = ['A, stock', 'B, `will-change: scroll-position`', 'C, `contain: paint`'];
/** Device px of each emulated viewport: 1280 × 900 and 1600 × 900 at 1×, the phone's 412 × 844 at DPR 2. */
const DESKTOP_PX = 1280 * 900;
const CONTROL_PX = 1600 * 900;
const PHONE_PX = 412 * 844 * 4;
/** Below this a 30 s window was truncated (the plan's risk row: 30 × 60 × 0.5). */
const MIN_FRAMES = 30 * 60 * 0.5;

const section = () => sectionMatching(HEADING);

/** A `Variant`-keyed table (the control and the phone runs): the rows after the header whose first cell names a variant. */
function variantTable(s: string, after: string): Map<string, number[]> {
  const lines = s.slice(s.indexOf(after)).split('\n');
  const start = lines.findIndex((l) => l.startsWith('|') && cells(l)[0] === 'Variant');
  expect(start, `a Variant table after "${after}"`).toBeGreaterThanOrEqual(0);
  expect(cells(lines[start]).slice(1)).toEqual(COLUMNS);
  const rows = new Map<string, number[]>();
  for (let j = start + 2; j < lines.length && lines[j].startsWith('|'); j++) {
    const row = cells(lines[j]);
    rows.set(row[0], row.slice(1).map(num));
  }
  return rows;
}

const areasAgree = (round: number[], viewportPx: number) => {
  expect(round[IDX['rastered screens/frame']]).toBeCloseTo(
    round[IDX['rastered px²/frame']] / viewportPx,
    2
  );
  expect(round[IDX['screens/frame']]).toBeCloseTo(round[IDX['redrawn px²/frame']] / viewportPx, 2);
};

describe('PERFORMANCE.md: the deck scroller compositing desktop A/B (DECK_SCROLLER_COMPOSITING.md T1.3)', () => {
  it('has the dated section, after the re-rastered area column and before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const heading = HEADING.exec(text);
    expect(heading).not.toBeNull();
    expect(RASTER_HEADING.exec(text)!.index).toBeLessThan(heading!.index);
    expect(text.indexOf('## Recording a new baseline')).toBeGreaterThan(heading!.index);
  });

  it('has three results tables, A then B then C, each with exactly three rounds in the columns', () => {
    const s = section();
    const tables = resultsTables(s);
    expect(tables).toHaveLength(3);
    const order = VARIANTS.map((v) => s.indexOf(`### ${v}\n`));
    for (const at of order) expect(at).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const table of tables) {
      expect(table.header).toEqual(COLUMNS);
      expect(table.rounds).toHaveLength(3);
      for (const round of table.rounds) {
        expect(round).toHaveLength(COLUMNS.length);
        for (const value of round) expect(Number.isFinite(value) && value >= 0).toBe(true);
      }
    }
  });

  it('states a median and a min–max for every column of every table that agree with the rounds', () => {
    for (const table of resultsTables(section())) {
      COLUMNS.forEach((name, i) => {
        const [a, b, c] = table.rounds.map((r) => r[i]);
        expect(table.median[i], `${name} median`).toBe(median3(a, b, c));
        expect(table.range[i], `${name} min–max`).toEqual([Math.min(a, b, c), Math.max(a, b, c)]);
      });
    }
  });

  it('keeps both area columns consistent with their px² over the viewport, in every round and every single run', () => {
    const s = section();
    for (const table of resultsTables(s))
      for (const round of table.rounds) areasAgree(round, DESKTOP_PX);
    for (const row of variantTable(s, '### The control').values()) areasAgree(row, CONTROL_PX);
    for (const row of variantTable(s, '### A finding outside the plan').values())
      areasAgree(row, PHONE_PX);
  });

  it('has an untruncated 30 s window in every run', () => {
    const s = section();
    const runs = [
      ...resultsTables(s).flatMap((t) => t.rounds),
      ...variantTable(s, '### The control').values(),
      ...variantTable(s, '### A finding outside the plan').values(),
    ];
    expect(runs).toHaveLength(9 + 3 + 2);
    for (const run of runs) expect(run[IDX.frames]).toBeGreaterThanOrEqual(MIN_FRAMES);
  });

  it('has the 1600 × 900 control naming all three variants, and A and C alike there', () => {
    const control = variantTable(section(), '### The control');
    expect([...control.keys()]).toEqual(VARIANTS);
    const [a, , c] = VARIANTS.map((v) => control.get(v)!);
    expect(
      Math.abs(a[IDX['rastered screens/frame']] - c[IDX['rastered screens/frame']])
    ).toBeLessThanOrEqual(0.02);
    expect(
      Math.abs(a[IDX['shell layer frames']] - c[IDX['shell layer frames']])
    ).toBeLessThanOrEqual(2);
  });

  it('reads B as the variant that took the shell layer out, and only B as having a scroller layer at 1280 × 900', () => {
    const [a, b, c] = resultsTables(section());
    expect(b.range[IDX['shell layer frames']]).toEqual([0, 0]);
    for (const t of [a, c]) {
      expect(t.range[IDX['scroller layer frames']]).toEqual([0, 0]);
      expect(t.median[IDX['shell layer frames']]).toBeGreaterThan(0);
    }
    expect(b.median[IDX['scroller layer frames']]).toBeGreaterThan(0);
  });

  it('states the shell-layer and raster medians it reads, and B against A, exactly as the tables give them', () => {
    const s = section();
    const [a, b, c] = resultsTables(s);
    const shell = (t: typeof a) => t.median[IDX['shell layer frames']];
    expect(s).toContain(
      `A ${shell(a)} frames rastered (${a.median[IDX['shell layer tasks']]} tasks), B ${shell(b)}, C ${shell(c)}`
    );
    const r = (t: typeof a) => t.median[IDX['rastered screens/frame']].toFixed(2);
    expect(s).toContain(`A ${r(a)}, B ${r(b)}, C ${r(c)}`);
    const ratio = b.median[IDX['rastered screens/frame']] / a.median[IDX['rastered screens/frame']];
    expect(s).toContain(`${ratio.toFixed(2)} × A`);
    expect(s).toContain(
      `Busy A ${a.median[IDX['busy (ms)']]} ms (${a.range[IDX['busy (ms)']].join('–')}), B ${b.median[IDX['busy (ms)']]}, C ${c.median[IDX['busy (ms)']]}`
    );
  });

  it('is recorded, not gated, and leaves Gate 2 to Crawford with the memory cost stated', () => {
    const s = section();
    expect(s).toMatch(/recorded, not gated/i);
    expect(s).not.toMatch(/\| Gate criterion \|/);
    expect(s).toMatch(/Gate 2[^.\n]*Crawford/);
    expect(s).toMatch(/≈ 0\.7 MB at 1×/);
    expect(s, 'no variant committed').toMatch(/No variant is committed/);
  });

  it('records the finding outside the plan: stock composites the scroller at DPR ≥ 1.5 or on mobile', () => {
    const s = section();
    expect(s).toMatch(/DPR 1 and 1\.25/);
    expect(s).toMatch(/DPR 1\.5/);
    expect(s).toMatch(/mobile: true/);
    expect(s).toMatch(/low-DPI desktop/);
    const phone = variantTable(s, '### A finding outside the plan');
    expect([...phone.keys()]).toEqual(VARIANTS.slice(0, 2));
    expect(
      phone.get(VARIANTS[0])![IDX['scroller layer frames']],
      'stock already has the layer'
    ).toBeGreaterThan(0);
  });

  it('names the builds and the method: three bundles, the commits, the link, the viewport, the window, the hygiene', () => {
    const s = section();
    for (const bundle of ['index-Dil0Vyn4.js', 'index-BSuw5Pa7.js', 'index-Ds3mB9Ot.js'])
      expect(s).toContain(bundle);
    for (const port of [':4184', ':4185', ':4186']) expect(s).toContain(port);
    expect(s, 'the tip').toMatch(/`c456ee82`/);
    expect(s, 'the harness commit').toMatch(/`76927960`/);
    expect(s).toMatch(/\?session=/);
    expect(s).toMatch(/1280 × 900/);
    expect(s).toMatch(/npm run perf:idle/);
    expect(s).toMatch(/--window 30000/);
    expect(s).toMatch(/--only none/);
    expect(s).toMatch(/--raster-top/);
    expect(s).toMatch(/rotated/);
    expect(s).toMatch(/foreground/i);
    expect(s, 'orphaned Chrome 0 before, then 0 after, in one sentence').toMatch(
      /orphaned[^.\n]*count 0 before[^.\n]*\b0 after/i
    );
  });

  it('links the plan relatively, and the plan carries Phase 1 and the guard', () => {
    const s = section();
    expect(s).toMatch(/\]\(tasks\/DECK_SCROLLER_COMPOSITING\.md\)/);
    expect(s).toMatch(/deckScrollerCompositingDocs\.test\.ts/);
    expect(existsSync(resolve(repoRoot, PLAN_DOC))).toBe(true);
    expect(read(PLAN_DOC)).toMatch(/^## Phase 1 — Desktop rounds/m);
  });
});
