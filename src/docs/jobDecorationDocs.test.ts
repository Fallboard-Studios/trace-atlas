import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as constants from '../constants';
import { DECOR_BUILDERS } from '../animation/jobMoves/decor/jobDecor';
import { JOB_MOVES } from '../animation/jobMoves/jobMoveTable';

// docs/tasks/JOB_DECORATION.md Task 16 (docs and roadmap). A docs task has no behaviour to test, so
// this makes its criteria executable, as the Phase 43 docs tests do: ANIMATION_SYSTEM.md gets a
// "Job decorations" section whose per-job table matches JOB_MOVES and DECOR_BUILDERS and whose
// numbers are the constants'; every symbol it names exists in the file it names; ROBOT_LIFECYCLE.md
// and PERFORMANCE.md carry their lines; the roadmap records Phase 52 with links to the intent, spec,
// plan and sketch; and the intent, spec, plan and sketch say what shipped, what was measured and what
// was not (the Pixel run, the open questions Crawford has not answered).

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

/** The text from a heading line to the next heading of the same or a higher level. */
function section(doc: string, heading: string): string {
  const at = doc.indexOf(`\n${heading}\n`);
  if (at === -1) return '';
  const level = heading.match(/^#+/)![0].length;
  const rest = doc.slice(at + heading.length + 2);
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
  return heading + '\n' + (next === -1 ? rest : rest.slice(0, next));
}

/** Every relative markdown link target in `doc` (anchors and URLs left out). */
function relativeLinks(doc: string): string[] {
  const targets: string[] = [];
  for (const m of doc.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    targets.push(target);
  }
  return targets;
}

const animation = read('docs/ANIMATION_SYSTEM.md');
const decorations = section(animation, '### Job decorations');
const roadmap = read('docs/todo/roadmap.md');
const phase52 = roadmap.slice(roadmap.indexOf('## 52. Job Decorations'), roadmap.length);

describe('ANIMATION_SYSTEM.md: Job decorations', () => {
  it('exists, after Job moves and before Station arcs', () => {
    expect(decorations).not.toBe('');
    const at = (heading: string) => animation.indexOf(`\n${heading}\n`);
    expect(at('### Job moves')).toBeLessThan(at('### Job decorations'));
    expect(at('### Job decorations')).toBeLessThan(at('### Station arcs'));
  });

  it('links the decor module and every file it names', () => {
    expect(animation).toContain('(../src/animation/jobMoves/decor/jobDecor.ts)');
    for (const file of ['jobDecor', 'frames', 'polyline', 'decorTier', 'events', 'maintenanceDecor', 'ventDecor', 'inspectionDecor', 'fluidDecor', 'surveyDecor', 'salvageDecor']) {
      expect(existsSync(resolve(repoRoot, `src/animation/jobMoves/decor/${file}.ts`)), file).toBe(true);
      expect(decorations, file).toContain(`${file}.ts`);
    }
  });

  it('has a table row for every job in JOB_MOVES, and for no other', () => {
    const rows = decorations.split('\n').filter((l) => /^\| `[A-Za-z]+` \|/.test(l)).map((l) => l.match(/^\| `([A-Za-z]+)`/)![1]);
    expect(rows.sort()).toEqual(Object.keys(JOB_MOVES).sort());
    expect(Object.keys(DECOR_BUILDERS).sort()).toEqual(Object.keys(JOB_MOVES).sort());
  });

  it.each([
    ['jobDecor', ['addJobDecor', 'DECOR_BUILDERS', 'DecorContext', 'DecorRun']],
    ['frames', ['sceneToRowLocal', 'orbiterLocalToRowLocal']],
    ['polyline', ['polyAt', 'polyLen', 'polyVertices']],
    ['decorTier', ['decorTier']],
    ['maintenanceDecor', ['addMaintenanceDecor', 'sparkAt', 'flashAt']],
    ['ventDecor', ['addVentDecor', 'moteAt', 'pulseAmount']],
    ['inspectionDecor', ['addInspectionDecor', 'trailSegments', 'tickAt']],
    ['fluidDecor', ['addFluidDecor', 'dropAt', 'valveAngle']],
    ['surveyDecor', ['addSurveyDecor', 'pingArc', 'chordState']],
    ['salvageDecor', ['addSalvageDecor', 'loadScale', 'slackWire']],
  ])('%s: every named symbol exists in the file, word-bounded', (file, symbols) => {
    const source = read(`src/animation/jobMoves/decor/${file}.ts`);
    for (const symbol of symbols) {
      expect(decorations, symbol).toMatch(new RegExp(`\\b${symbol}\\b`));
      expect(source, symbol).toMatch(new RegExp(`\\b${symbol}\\b`));
    }
  });

  it('states every number as `NAME` (value) and each equals its constant', () => {
    const stated = [...decorations.matchAll(/`([A-Z][A-Z0-9_]+)` \((-?\d+(?:\.\d+)?)\)/g)];
    expect(stated.length).toBeGreaterThanOrEqual(12);
    for (const [, name, value] of stated) {
      expect((constants as Record<string, unknown>)[name], name).toBe(Number(value));
    }
  });

  it('names the counts that set each job\'s node count', () => {
    for (const name of ['VENT_MOTES', 'MAINT_SPARKS', 'INSPECT_TRAIL_SEGMENTS', 'FLUID_DROPS', 'SURVEY_ARCS']) {
      expect(decorations, name).toContain(`\`${name}\``);
    }
  });

  it('records the tier ladder as unbound, and that Full is always all', () => {
    expect(constants.DECOR_TIER_BELOW_STANDARD).toBe('all');
    expect(constants.DECOR_TIER_BELOW_FULL).toBe('all');
    expect(decorations).toMatch(/unbound/);
    expect(decorations).toMatch(/Full is always `'all'`/);
  });

  it('describes the lifecycle as built: the timeline onUpdate write, the kill wrap, no proxy tween', () => {
    expect(decorations).toMatch(/onUpdate/);
    expect(decorations).toMatch(/tl\.kill/);
    expect(decorations).not.toMatch(/proxy tween/i);
    const source = read('src/animation/jobMoves/decor/jobDecor.ts');
    expect(source).toMatch(/tl\.eventCallback\('onUpdate'/);
    expect(source).toMatch(/tl\.kill = /);
  });

  it('keeps no AudioEngine or store call in the decor sources', () => {
    for (const file of ['jobDecor', 'maintenanceDecor', 'ventDecor', 'inspectionDecor', 'fluidDecor', 'surveyDecor', 'salvageDecor']) {
      const code = read(`src/animation/jobMoves/decor/${file}.ts`).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(code, file).not.toMatch(/AudioEngine|useAudioStore|useLocaleStore/);
    }
    expect(decorations).toMatch(/Strict Separation/);
  });

  it('every relative link in the section resolves', () => {
    expect(relativeLinks(decorations).length).toBeGreaterThan(10);
    for (const target of relativeLinks(decorations)) {
      expect(existsSync(resolve(repoRoot, 'docs', target)), target).toBe(true);
    }
  });
});

describe('ROBOT_LIFECYCLE.md and PERFORMANCE.md', () => {
  it('ROBOT_LIFECYCLE.md says the work loop adds a decoration group and links the section', () => {
    const lifecycle = read('docs/ROBOT_LIFECYCLE.md');
    expect(lifecycle).toMatch(/`\.robot__work`/);
    expect(lifecycle).toContain('ANIMATION_SYSTEM.md#job-decorations');
  });

  it('PERFORMANCE.md records the Task 14 gate as missed, accepted, and the Pixel run as not done', () => {
    const perf = section(read('docs/PERFORMANCE.md'), '## Job Decorations — the Task 14 perf gate (2026-10-13, Phase 52)');
    expect(perf).not.toBe('');
    expect(perf).toMatch(/Missed on both/);
    expect(perf).toMatch(/Decision \(Crawford, 2026-10-13\): accept the miss/);
    expect(perf).toMatch(/Pixel run \(Task 15\) was not run/);
    expect(perf).not.toMatch(/Pixel is fine/);
  });
});

describe('roadmap Phase 52', () => {
  it('exists, links the intent, spec, plan and sketch, and every link resolves', () => {
    expect(phase52).not.toBe('');
    for (const link of ['../intent/job-decorations.md', '../specs/JOB_DECORATION.md', '../tasks/JOB_DECORATION.md', '../sketches/job-decorations.html']) {
      expect(phase52, link).toContain(`(${link})`);
    }
    for (const target of relativeLinks(phase52)) expect(existsSync(resolve(repoRoot, 'docs/todo', target)), target).toBe(true);
  });

  it('says what is built, what was measured and what is still owed', () => {
    expect(phase52).toMatch(/Tasks 1–14/);
    expect(phase52).toMatch(/\+11 %/);
    expect(phase52).toMatch(/Still owed/);
    expect(phase52).toMatch(/Pixel/);
  });

  it('has a Not Doing list', () => {
    expect(phase52).toMatch(/### Not Doing/);
  });
});

describe('Shipped headers and the plan', () => {
  it('the intent is headed Shipped and no longer says the spec is unwritten', () => {
    const intent = read('docs/intent/job-decorations.md');
    expect(intent.split('\n').slice(0, 6).join('\n')).toMatch(/^> \*\*Shipped \(roadmap Phase 52/m);
    expect(intent).not.toMatch(/not yet written/);
  });

  it('the spec is headed Shipped with an As Shipped section, and no longer says proposed', () => {
    const spec = read('docs/specs/JOB_DECORATION.md');
    expect(spec.slice(0, spec.indexOf('## Assumptions'))).toMatch(/^> \*\*Shipped \(roadmap Phase 52/m);
    expect(spec.slice(0, spec.indexOf('## Assumptions'))).not.toMatch(/proposed; 51 is the Guide/);
    expect(section(spec, '## As Shipped')).not.toBe('');
  });

  it('the spec\'s open questions each carry a recorded answer, and none claims Crawford confirmed one he did not', () => {
    const questions = section(read('docs/specs/JOB_DECORATION.md'), '## 7. Open Questions');
    const entries = questions.split(/\n(?=\d+\. )/).slice(1);
    expect(entries).toHaveLength(6);
    for (const entry of entries) expect(entry, entry.slice(0, 30)).toMatch(/Resolved|\*\*Recorded/);
    expect(questions).toMatch(/not separately confirmed/);
  });

  it('the sketch opens with a SHIPPED note', () => {
    expect(read('docs/sketches/job-decorations.html').split('\n').slice(0, 3).join('\n')).toMatch(/^<!doctype html>\n<!-- SHIPPED \(roadmap Phase 52/i);
  });

  it('the plan records T14 as accepted and T15 as not run, not as passed', () => {
    const plan = read('docs/tasks/JOB_DECORATION.md');
    const task15 = section(plan, '### Task 15: Pixel listen + sign-off (Crawford)');
    expect(task15).toMatch(/NOT RUN/);
    expect(task15).not.toMatch(/- \[x\]/);
    expect(plan).toMatch(/T16 docs done/);
  });

  it('no doc still calls the decorations proposed or future', () => {
    for (const path of ['docs/ANIMATION_SYSTEM.md', 'docs/ROBOT_LIFECYCLE.md', 'docs/intent/job-decorations.md']) {
      expect(read(path), path).not.toMatch(/job decorations?[^.\n]{0,40}(is|are) (still )?(to come|proposed|future)/i);
    }
  });
});
