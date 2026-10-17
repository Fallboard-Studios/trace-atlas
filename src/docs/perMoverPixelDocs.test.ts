import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md Task 21 (the Pixel listen, Crawford's). A listen has no behaviour to
// test, so this makes its acceptance criteria executable: PERFORMANCE.md carries a dated "Task 21 Pixel listen"
// section with the run's conditions and the overlay's count, the plan ticks Task 21 with the same figures, and
// the record says plainly what was NOT measured (no `main` count was taken in the same session), so the criterion
// "the branch's count is not above main's" is never written up as a pass it did not earn (the Deck Camera Task 11
// rule). The Task 20 miss stays a miss: perMoverGateDocs.test.ts keeps pinning that.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) =>
  readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

const PERFORMANCE_DOC = 'docs/PERFORMANCE.md';
const PLAN_DOC = 'docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md';
const HEADING = /^## Per-Mover Compositor Layers — the Task 21 Pixel listen \((\d{4}-\d{2}-\d{2})\)$/m;

/** The Task 21 `##` section of PERFORMANCE.md, up to the next `##` heading. */
function listenSection(): string {
  const text = read(PERFORMANCE_DOC);
  const match = HEADING.exec(text);
  expect(match, `${PERFORMANCE_DOC} has the "Task 21 Pixel listen" heading`).not.toBeNull();
  const bodyStart = text.indexOf('\n', match!.index) + 1;
  const next = text.slice(bodyStart).search(/^## /m);
  return next === -1 ? text.slice(match!.index) : text.slice(match!.index, bodyStart + next);
}

/** Task 21's bullet in the plan, up to the next task or phase heading. */
function planTask21(): string {
  const plan = read(PLAN_DOC);
  const at = plan.search(/^- \[[ x]\] \*\*Task 21: Pixel listen/m);
  expect(at, 'the plan has Task 21').not.toBe(-1);
  const rest = plan.slice(at + 1);
  const next = rest.search(/^(- \[[ x]\] \*\*Task \d+|### |---)/m);
  return plan.slice(at, next === -1 ? undefined : at + 1 + next);
}

describe('PERFORMANCE.md Task 21 Pixel listen (plan Task 21)', () => {
  it('has the dated section, after the Task 20 gate and before "Recording a new baseline"', () => {
    const text = read(PERFORMANCE_DOC);
    const heading = HEADING.exec(text);
    expect(heading).not.toBeNull();
    expect(text.indexOf('## Per-Mover Compositor Layers — the Task 20 gate')).toBeLessThan(heading!.index);
    expect(text.indexOf('## Recording a new baseline')).toBeGreaterThan(heading!.index);
  });

  it('records the conditions: Pixel, landscape, Full Audio Load, the ?debug overlay, the pinned link, the branch', () => {
    const section = listenSection();
    expect(section).toMatch(/Pixel/);
    expect(section).toMatch(/landscape/i);
    expect(section, 'Full, not "high"').toMatch(/Full Audio Load/);
    expect(section).toMatch(/\?debug/);
    expect(section, 'the same pinned link as the gate').toMatch(/\?session=|same (pinned )?(session )?link/i);
    expect(section).toMatch(/perf\/per-mover-layers/);
    expect(section, 'a commit hash of the build listened to').toMatch(/\b[0-9a-f]{8}\b/);
  });

  it('records the length and the overlay count as numbers, and that nothing distorted or clipped', () => {
    const section = listenSection();
    expect(section, 'a duration over five minutes').toMatch(/(over|more than) five minutes|\b[5-9]\+? min|\b\d{2,}\+? min/i);
    expect(section, 'the overlay count as a figure').toMatch(/\b12\b[^.\n]*underruns|underruns[^.\n]*\b12\b/i);
    expect(section).toMatch(/no distortion/i);
    expect(section).toMatch(/no clipping|none (of them )?(caused|produced) (any )?clipping/i);
  });

  it('says plainly that no main count was taken, so the not-above-main criterion is open, never a pass', () => {
    const section = listenSection();
    expect(section, 'no main listen or count in this session').toMatch(/\bno `?main`? (listen|count)\b/i);
    expect(section, 'the criterion is flagged open or unverified').toMatch(/(open|unverified|not (met|shown|established))/i);
    expect(section, 'never written as a pass against main').not.toMatch(/not above (main|the recorded)[^.\n]*\bPASS\b/i);
    expect(section).not.toMatch(/^\|[^\n]*\bPASS\b[^\n]*underrun/im);
  });

  it('records Crawford\'s verdict, that the length differs from the spec\'s three minutes, and the Task 20 miss as standing', () => {
    const section = listenSection();
    expect(section).toMatch(/Crawford/);
    expect(section, 'his verdict in his terms').toMatch(/good to go/i);
    expect(section, 'the spec said three minutes').toMatch(/three minutes/i);
    expect(section, 'the Task 20 miss is not rewritten').toMatch(/Task 20[^.\n]*(MISS|miss)[^.\n]*(stand|remain|unchanged|not (changed|rewritten|amended))/i);
  });

  it('links the plan relatively, and the guard names itself', () => {
    expect(listenSection()).toMatch(/\]\(tasks\/PER_MOVER_COMPOSITOR_LAYERS\.md\)/);
  });
});

describe('the plan: Task 21', () => {
  it('is ticked, no longer says it was not run, and carries the same figures', () => {
    const task = planTask21();
    expect(task.startsWith('- [x] **Task 21: Pixel listen (Crawford)**')).toBe(true);
    expect(task).not.toMatch(/\*\*not run\*\*/);
    expect(task).toMatch(/\b12\b[^.\n]*underruns|underruns[^.\n]*\b12\b/i);
    expect(task, 'the main count gap is flagged in the plan too').toMatch(/\bno `?main`? (listen|count)\b/i);
  });

  it('keeps the acceptance bullet for the main comparison unticked', () => {
    const task = planTask21();
    expect(task).toMatch(/- \[ \] Both counts written here/);
  });

  it('the dated Task 20 record points forward to the listen instead of saying it is still pending', () => {
    const plan = read(PLAN_DOC);
    const at = plan.indexOf('### Task 20 — the gate');
    expect(at).not.toBe(-1);
    const record = plan.slice(at);
    expect(record, 'a dated follow-up').toMatch(/Task 21 \(Pixel listen\) ran 2026-10-17/);
  });
});
