import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';

// Shared by the docs guards for PERFORMANCE.md's A/B sections (perMoverReviewR5Docs.test.ts, perMoverReviewR6Docs.test.ts):
// find a dated `##` section, and read its results tables (a `Round` header, rounds 1-3, a Median row, a Min–max row) and
// its verdict table. The Task 20 gate's guard (perMoverGateDocs.test.ts) predates this and keeps its own copy.

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

export const PERFORMANCE_DOC = 'docs/PERFORMANCE.md';

export const COLUMNS = [
  'redrawn px²/frame',
  'screens/frame',
  'unresolved Paints',
  'busy (ms)',
  'Paint (ms)',
  'Compositor::Update (ms)',
  'Layerize (ms)',
  'frames',
] as const;
export const IDX = Object.fromEntries(COLUMNS.map((name, i) => [name, i])) as Record<string, number>;

/** The `##` section whose heading matches, up to the next `##` heading. Fails the test, naming the doc, if there is none. */
export function sectionMatching(heading: RegExp): string {
  const text = read(PERFORMANCE_DOC);
  const match = heading.exec(text);
  expect(match, `${PERFORMANCE_DOC} has a section matching ${heading}`).not.toBeNull();
  const start = match!.index;
  const bodyStart = text.indexOf('\n', start) + 1;
  const next = text.slice(bodyStart).search(/^## /m);
  return next === -1 ? text.slice(start) : text.slice(start, bodyStart + next);
}

export const cells = (line: string) =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
export const num = (cell: string) => Number(cell.replace(/[\s,]/g, ''));
export const median3 = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y)[1];

export interface ResultsTable {
  header: string[];
  rounds: number[][];
  median: number[];
  range: Array<[number, number]>;
}

/** Every results table in a section: a `Round` header row, rounds 1-3, a Median row and a Min–max row. */
export function resultsTables(section: string): ResultsTable[] {
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
export function verdictRows(section: string): Map<string, string[]> {
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

export const rowFor = (rows: Map<string, string[]>, startsWith: string) => {
  const key = [...rows.keys()].find((k) => k.startsWith(startsWith));
  expect(key, `a verdict row starting "${startsWith}"`).toBeDefined();
  return rows.get(key!)!;
};
