import { describe, expect, it } from 'vitest';

import { PERFORMANCE_DOC, cells, read, sectionMatching } from './perfDocTables';

// The Pixel A/B that the Task 21 listen left open (docs/tasks/PER_MOVER_REVIEW_FOLLOWUPS.md, "Open before merge" item
// 3). A by-ear measurement has no behaviour to test, so this keeps its record honest: every listen is in the table,
// the decision says what was and was not established, the Task 21 orientation is corrected here rather than by
// rewriting that section, and the crackle `main` shares is filed where it can be found.

const HEADING =
  /^## Per-Mover Compositor Layers — the Pixel A\/B: not separable on the phone \((\d{4}-\d{2}-\d{2})\)$/m;
const TASK21_HEADING =
  /^## Per-Mover Compositor Layers — the Task 21 Pixel listen \(\d{4}-\d{2}-\d{2}\)$/m;
const BACKLOG = 'docs/todo/backlog.md';

const section = () => sectionMatching(HEADING);

/** The listens table: the rows after its `| Listen |` header. */
function listens(s: string): string[][] {
  const lines = s.split('\n');
  const start = lines.findIndex((l) => l.startsWith('|') && cells(l)[0] === 'Listen');
  expect(start, 'a listens table').toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  for (let j = start + 2; j < lines.length && lines[j].startsWith('|'); j++)
    rows.push(cells(lines[j]));
  return rows;
}

describe('PERFORMANCE.md: the Pixel A/B of the per-mover branch against main', () => {
  it('has the dated section after the Task 21 listen it follows up, before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const at = HEADING.exec(text)!.index;
    expect(at).toBeGreaterThan(TASK21_HEADING.exec(text)!.index);
    expect(text.indexOf('## Recording a new baseline')).toBeGreaterThan(at);
  });

  it('puts every listen in the table: Task 21, both branch runs and the main run, each with its build', () => {
    const rows = listens(section());
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const builds = rows.map((r) => r[1]);
    expect(builds.filter((b) => b === '`main`')).toHaveLength(1);
    expect(builds.filter((b) => /^branch\b/.test(b))).toHaveLength(3);
    expect(rows.some((r) => /Task 21/.test(r[0]))).toBe(true);
  });

  it('decides as Crawford did: the A/B is not separable on this instrument, and the gate is his call, not a pass', () => {
    const decision = /^\*\*Decision \((\d{4}-\d{2}-\d{2})\): ([^\n]*)$/m.exec(section());
    expect(decision, 'a dated decision paragraph').not.toBeNull();
    expect(decision![2]).toMatch(/Crawford/);
    expect(decision![2]).toMatch(/not separable/);
    expect(decision![2]).not.toMatch(/\bPASS\b/);
  });

  it('says what the screenshots establish: underruns, not clipping, on both builds', () => {
    const s = section();
    expect(s).toMatch(/fin ok/);
    expect(s).toMatch(/`main` (also )?underruns|`main` crackles/);
  });

  it('corrects the Task 21 orientation here, without rewriting that section', () => {
    expect(section()).toMatch(
      /^\*\*Correction to the Task 21 section above\.\*\*[^\n]*\*\*portrait\*\*/m
    );
    expect(sectionMatching(TASK21_HEADING), 'the older section stands as written').toMatch(
      /landscape/
    );
  });

  it('files the crackle main shares as its own backlog item, and the section points to it', () => {
    expect(section()).toMatch(/backlog item 27/);
    expect(read(BACKLOG)).toMatch(
      /^### 27\. Audio: Phone Playback Underruns at Light Load, `main` Included$/m
    );
  });
});
