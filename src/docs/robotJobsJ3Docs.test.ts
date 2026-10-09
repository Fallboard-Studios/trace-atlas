import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CARRY_SHRINK,
  FAN_PING_SCALE,
  FAN_RADIUS,
  FAN_SPREAD_DEG,
  FLICKER_OPACITY,
  FLICKER_SPARKS,
  HOVER_GATHER_RADIUS,
  HOVER_PULSE_SCALE,
  MOVE_APPROACH_FRACTION,
  MOVE_APPROACH_MAX_SECONDS,
  RING_RADIUS,
  RING_RADIUS_JITTER,
  RING_REVOLUTIONS,
  TRACE_STAGGER,
} from '../constants';
import { JOB_MOVES } from '../animation/jobMoves/jobMoveTable';
import { RING_SEGMENTS } from '../animation/jobMoves/ring';
import { CARRY_SPACING } from '../animation/jobMoves/carry';
import { FACTORY_HOST_JOBS, SCENERY_HOST_JOBS } from '../systems/jobHosts';
import { JobType } from '../types/Robot';

// docs/tasks/ROBOT_JOBS_AND_STATIONS.md Task 31 (J3 docs). A docs task has no behaviour to test,
// so this makes its criteria executable: ANIMATION_SYSTEM.md gets a job moves section whose job
// table matches `JOB_MOVES`; BUILDING_DESIGN.md gets a job → host → move table whose host lists
// match `FACTORY_HOST_JOBS`/`SCENERY_HOST_JOBS`, and loses its J1-era stale lines; the spec and
// intent get `> **Shipped (J3)**` lines; the roadmap and ROBOT_LIFECYCLE.md stop calling J3 future
// work. Named identifiers are spot-checked against source, word-bounded, as in the J2 docs test.

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

/** The table row in `text` whose first cell is `` `key` ``, or ''. */
function row(text: string, key: string): string {
  return text.split('\n').find((l) => l.startsWith(`| \`${key}\` `)) ?? '';
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

const JOBS = Object.values(JobType);

describe('ANIMATION_SYSTEM.md: the job moves section', () => {
  const doc = read('docs/ANIMATION_SYSTEM.md');
  const moves = section(doc, '### Job moves');

  it('exists, and the job timeline section points at it', () => {
    expect(moves).not.toBe('');
    expect(section(doc, '### Job timeline')).toContain('Job moves');
  });

  it.each(JOBS)("%s's row lists its JOB_MOVES steps in order", (job) => {
    const line = row(moves, job);
    expect(line, `a row for \`${job}\``).not.toBe('');
    let from = 0;
    for (const step of JOB_MOVES[job]) {
      const at = line.indexOf(step.move, from);
      expect(at, `${job}: ${step.move} after position ${from}`).toBeGreaterThanOrEqual(0);
      from = at + step.move.length;
    }
  });

  it('only Maintenance names the spark flicker', () => {
    for (const job of JOBS) {
      expect(/flicker/i.test(row(moves, job)), `${job} row`).toBe(job === JobType.Maintenance);
    }
  });

  it.each([
    ['HOVER_GATHER_RADIUS', HOVER_GATHER_RADIUS],
    ['HOVER_PULSE_SCALE', HOVER_PULSE_SCALE],
    ['TRACE_STAGGER', TRACE_STAGGER],
    ['RING_RADIUS', RING_RADIUS],
    ['RING_RADIUS_JITTER', RING_RADIUS_JITTER],
    ['RING_REVOLUTIONS', RING_REVOLUTIONS],
    ['RING_SEGMENTS', RING_SEGMENTS],
    ['FAN_RADIUS', FAN_RADIUS],
    ['FAN_SPREAD_DEG', FAN_SPREAD_DEG],
    ['FAN_PING_SCALE', FAN_PING_SCALE],
    ['CARRY_SHRINK', CARRY_SHRINK],
    ['CARRY_SPACING', CARRY_SPACING],
    ['FLICKER_OPACITY', FLICKER_OPACITY],
    ['FLICKER_SPARKS', FLICKER_SPARKS],
    ['MOVE_APPROACH_MAX_SECONDS', MOVE_APPROACH_MAX_SECONDS],
    ['MOVE_APPROACH_FRACTION', MOVE_APPROACH_FRACTION],
  ] as const)('%s is stated with its real value (%s)', (name, value) => {
    const line = moves.split('\n').find((l) => l.includes(`\`${name}\``));
    expect(line, `a line naming \`${name}\``).toBeDefined();
    expect(line).toMatch(new RegExp(`(^|[^\\d.])${String(value).replace('.', '\\.')}(?![\\d])`));
  });

  it('describes the per-robot variation stream and what it varies', () => {
    expect(moves).toContain('`${gemSeed}:work`');
    for (const field of ['order', 'ringDirection', 'radiusScale', 'traceReversed', 'phase', 'sparks']) {
      expect(moves, `names ${field}`).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });
});

describe('BUILDING_DESIGN.md: jobs, hosts and moves', () => {
  const doc = read('docs/BUILDING_DESIGN.md');
  const jobs = section(doc, '### Jobs, hosts and moves');
  const hostsOf = (job: JobType) => [
    ...Object.entries(FACTORY_HOST_JOBS).filter(([, list]) => list.includes(job)).map(([name]) => name),
    ...Object.entries(SCENERY_HOST_JOBS).filter(([, list]) => list.includes(job)).map(([name]) => name),
  ];
  const allHosts = [
    ...Object.keys(FACTORY_HOST_JOBS),
    ...Object.entries(SCENERY_HOST_JOBS).filter(([, list]) => list.length > 0).map(([name]) => name),
  ];

  it('exists inside the Robot jobs chapter', () => {
    expect(jobs).not.toBe('');
    expect(section(doc, '## Robot jobs — hosts, work sites, coverage (Phase 43)')).toContain(jobs.trim());
  });

  it.each(JOBS)("%s's row names exactly its hosts and its moves", (job) => {
    const line = row(jobs, job);
    expect(line, `a row for \`${job}\``).not.toBe('');
    for (const host of allHosts) {
      expect(line.includes(`\`${host}\``), `${job} row names \`${host}\``).toBe(hostsOf(job).includes(host));
    }
    for (const step of JOB_MOVES[job]) expect(line).toContain(step.move);
  });

  it('has a target row for every host', () => {
    for (const host of allHosts) {
      expect(row(jobs, host), `a target row for \`${host}\``).not.toBe('');
    }
  });

  it('says which point each move works and that only the pipeline has a pipe', () => {
    expect(jobs).toContain('points[0]');
    expect(jobs).toContain('points[1]');
    expect(jobs).toMatch(/only the pipeline/i);
    expect(jobs).toMatch(/derelict/i);
  });

  it('every relative link in the section resolves', () => {
    const dir = dirname(resolve(repoRoot, 'docs/BUILDING_DESIGN.md'));
    expect(relativeLinks(jobs).filter((t) => !existsSync(resolve(dir, t)))).toEqual([]);
  });

  it('drops its J1-era stale lines', () => {
    const chapter = section(doc, '## Robot jobs — hosts, work sites, coverage (Phase 43)');
    expect(chapter).not.toMatch(/lands in J2/);
    expect(chapter).not.toMatch(/160 × 120/);
    expect(chapter).not.toContain('park, points, path }');
  });
});

// [identifier, source file] — the doc names it and the source defines or exports it.
const ANIMATION_IDENTIFIERS: ReadonlyArray<readonly [string, string]> = [
  ['JOB_MOVES', 'src/animation/jobMoves/jobMoveTable.ts'],
  ['moveWindows', 'src/animation/jobMoves/jobMoveTable.ts'],
  ['stepPoint', 'src/animation/jobMoves/jobMoveTable.ts'],
  ['stepPath', 'src/animation/jobMoves/jobMoveTable.ts'],
  ['addHoverPulse', 'src/animation/jobMoves/hoverPulse.ts'],
  ['addPulsesInTurn', 'src/animation/jobMoves/hoverPulse.ts'],
  ['addTrace', 'src/animation/jobMoves/trace.ts'],
  ['addPolylineRun', 'src/animation/jobMoves/trace.ts'],
  ['traceRoute', 'src/animation/jobMoves/trace.ts'],
  ['addRing', 'src/animation/jobMoves/ring.ts'],
  ['addSparkFlicker', 'src/animation/jobMoves/ring.ts'],
  ['sparkChords', 'src/animation/jobMoves/ring.ts'],
  ['addFan', 'src/animation/jobMoves/fan.ts'],
  ['addCarry', 'src/animation/jobMoves/carry.ts'],
  ['workVariation', 'src/animation/jobMoves/variation.ts'],
  ['turnRanks', 'src/animation/jobMoves/variation.ts'],
];

const BUILDING_IDENTIFIERS: ReadonlyArray<readonly [string, string]> = [
  ['JOB_MOVES', 'src/animation/jobMoves/jobMoveTable.ts'],
  ['stepPath', 'src/animation/jobMoves/jobMoveTable.ts'],
  ['WorkPaths', 'src/systems/workSites.ts'],
  ['FACTORY_HOST_JOBS', 'src/systems/jobHosts.ts'],
  ['SCENERY_HOST_JOBS', 'src/systems/jobHosts.ts'],
];

describe.each([
  ['docs/ANIMATION_SYSTEM.md', ANIMATION_IDENTIFIERS],
  ['docs/BUILDING_DESIGN.md', BUILDING_IDENTIFIERS],
] as const)('%s: named identifiers exist in source', (path, identifiers) => {
  const doc = read(path);
  it.each(identifiers)('%s (%s)', (name, source) => {
    expect(doc, `${path} names ${name}`).toMatch(new RegExp(`\\b${name}\\b`));
    expect(read(source), `${source} defines ${name}`).toMatch(new RegExp(`\\b${name}\\b`));
  });
});

describe('spec, intent, roadmap and ROBOT_LIFECYCLE.md: J3 is shipped', () => {
  const spec = read('docs/specs/ROBOT_JOBS_AND_STATIONS.md');

  it.each([
    '### 1.5 Work sites and anchors (J1, `src/systems/workSites.ts`)',
    '### 1.9 Jobs and moves (J2: one move end to end; J3: all)',
  ])('spec %s carries a Shipped (J3) line', (heading) => {
    expect(section(spec, heading)).toMatch(/^> \*\*Shipped \(J3/m);
  });

  it('the §1.9 Shipped (J3) line records the point-role call and the pipe fallback', () => {
    const s = section(spec, '### 1.9 Jobs and moves (J2: one move end to end; J3: all)');
    const shipped = s.slice(s.search(/^> \*\*Shipped \(J3/m));
    expect(shipped).toContain('points[1]');
    expect(shipped).toMatch(/pipe/);
  });

  it('the intent carries a Shipped (J3) line', () => {
    expect(read('docs/intent/robot-jobs-and-stations.md')).toMatch(/^> \*\*Shipped \(J3/m);
  });

  it('the roadmap records J2 and J3 as merged and names J4', () => {
    const roadmap = read('docs/todo/roadmap.md');
    const at = roadmap.indexOf('## 43. Robot Jobs and Charging Stations');
    const next = roadmap.indexOf('\n## 44.', at);
    const phase = roadmap.slice(at, next === -1 ? undefined : next);
    expect(phase).toMatch(/J3[^.]*merged/i);
    expect(phase).toMatch(/J2[^.]*merged/i);
    expect(phase).not.toMatch(/J3[^.]*not started/i);
    expect(phase).not.toMatch(/unpushed, unmerged/);
    expect(phase).toMatch(/J4/);
  });

  it('ROBOT_LIFECYCLE.md no longer calls J3 future work', () => {
    expect(read('docs/ROBOT_LIFECYCLE.md')).not.toMatch(/J3 adds/);
  });
});
