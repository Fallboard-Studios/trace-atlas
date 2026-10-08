import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BOB_CYCLE_SECONDS,
  BOB_PX,
  COOLDOWN_MAX,
  COOLDOWN_MIN,
  COOLDOWN_PER_SITE,
  STATION_ARC_SECONDS,
  STATION_CAPACITY,
  STATION_PORT_SCALE,
  STATION_REDUCED_ARC_SECONDS,
  WAIT_RETRY_SECONDS,
} from '../constants';
import { ATTACH_DURATION } from '../components/robot/gem/orbiterMotion';

// docs/tasks/ROBOT_JOBS_AND_STATIONS.md Task 27 (J2 docs). A docs task has no behaviour to test,
// so this makes its acceptance criteria executable: ROBOT_LIFECYCLE.md is rewritten around the two
// state machines, the work loop, stations, recall and turn-back, with the deleted legacy named only
// in its own history section; ANIMATION_SYSTEM.md gains the registry, the job timeline, the station
// arcs and the key table; ROBOT_DESIGN.md's "job animations — not built yet" line and the orbiter
// lock; SESSION_STORAGE.md's never-persisted reasons; CLAUDE.md's ROBOT_LIFECYCLE line; and
// `> **Shipped (J2)**` lines in the spec and intent. "Every named identifier spot-checked against
// source" is the identifier table below: each name must be in the doc AND in its source file.

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

const EDITED_DOCS = [
  'docs/ROBOT_LIFECYCLE.md',
  'docs/ANIMATION_SYSTEM.md',
  'docs/ROBOT_DESIGN.md',
  'docs/SESSION_STORAGE.md',
] as const;

describe('Task 27 docs: every relative link resolves', () => {
  it.each(EDITED_DOCS)('%s', (path) => {
    const dir = dirname(resolve(repoRoot, path));
    const missing = relativeLinks(read(path)).filter((target) => !existsSync(resolve(dir, target)));
    expect(missing).toEqual([]);
  });
});

describe('ROBOT_LIFECYCLE.md: rewritten for J2', () => {
  const doc = read('docs/ROBOT_LIFECYCLE.md');
  const history = section(doc, '## Removed in Phase 43');
  const current = doc.replace(history, '');

  it('names workLoop.ts as a source of truth and no deleted file as one', () => {
    const header = doc.slice(0, doc.indexOf('\n## '));
    expect(header).toContain('src/systems/workLoop.ts');
    expect(header).not.toContain('lifecycleVisuals.ts');
    expect(header).not.toContain('idleSystem.ts');
  });

  it('describes the two state machines: docking on the measure tick, activity on wall-clock time', () => {
    expect(doc).toMatch(/^## The Docking State Machine$/m);
    const activity = section(doc, '## The Activity State Machine');
    expect(activity).not.toBe('');
    for (const a of ['charging', 'exiting', 'transit', 'working', 'waiting', 'returning', 'entering']) {
      expect(activity, `activity section names '${a}'`).toContain(`'${a}'`);
    }
    expect(activity).toMatch(/wall-clock/i);
  });

  it('has the work loop, stations, recall and turn-back sections', () => {
    expect(section(doc, '## The Work Loop')).toContain('chooseNextSite');
    expect(section(doc, '## Charging Stations')).toContain('nearestFreeStation');
    expect(section(doc, '### Recall')).toMatch(/no cooldown/i);
    const turnBack = section(doc, '### Turn-back');
    expect(turnBack).toMatch(/hidden tab/i);
    expect(turnBack).toMatch(/20 measures/);
  });

  it('the visual seam points at the work loop, not a legacy adapter', () => {
    const seam = section(doc, '## The Visual Seam');
    expect(seam).toContain('workLoop.ts');
    expect(seam).not.toMatch(/legacy adapter keeps/i);
    for (const to of ["'recalled'", "'active'", "'docked'"]) expect(seam).toContain(to);
  });

  it('no deleted name appears outside the "Removed in Phase 43" history section', () => {
    expect(history).not.toBe('');
    const deleted = [
      'lifecycleVisuals',
      'idleSystem',
      'handleRobotIdle',
      'pickExitDestination',
      'pickDestination',
      'scoreJobAffinities',
      'assignJob',
      'JOB_MAX_ROBOTS_PER_TYPE',
      'BATTERY_LOWER_THIRD_THRESHOLD',
      'LOWER_THIRD_Y_RANGE',
      'BOTTOM_HALF_Y_RANGE',
      'RobotState',
      'isReturning',
    ];
    for (const name of deleted) {
      expect(current, `${name} outside the history section`).not.toContain(name);
      expect(history, `history names ${name}`).toContain(name);
    }
  });

  it('no stale "until J2" or "legacy adapter, until J2" wording remains', () => {
    expect(doc).not.toMatch(/until J2/);
    expect(doc).not.toMatch(/\(legacy adapter/);
  });

  it.each([
    ['STATION_PORT_SCALE', STATION_PORT_SCALE],
    ['STATION_ARC_SECONDS', STATION_ARC_SECONDS],
    ['STATION_REDUCED_ARC_SECONDS', STATION_REDUCED_ARC_SECONDS],
    ['STATION_CAPACITY', STATION_CAPACITY],
    ['WAIT_RETRY_SECONDS', WAIT_RETRY_SECONDS],
    ['COOLDOWN_PER_SITE', COOLDOWN_PER_SITE],
    ['COOLDOWN_MIN', COOLDOWN_MIN],
    ['COOLDOWN_MAX', COOLDOWN_MAX],
  ] as const)('%s is stated with its real value (%s)', (name, value) => {
    const line = doc.split('\n').find((l) => l.includes(`\`${name}\``));
    expect(line, `a line naming \`${name}\``).toBeDefined();
    expect(line).toMatch(new RegExp(`\\b${String(value).replace('.', '\\.')}\\b`));
  });
});

// [identifier, source file] — the doc names it and the source defines or exports it.
const LIFECYCLE_IDENTIFIERS: ReadonlyArray<readonly [string, string]> = [
  ['startWorkLoop', 'src/systems/workLoop.ts'],
  ['stopWorkLoop', 'src/systems/workLoop.ts'],
  ['onLifecycleChange', 'src/systems/workLoop.ts'],
  ['onRobotMounted', 'src/systems/workLoop.ts'],
  ['getSiteState', 'src/systems/workLoop.ts'],
  ['LifecycleChange', 'src/systems/workLoop.ts'],
  ['beginRecall', 'src/systems/robotSystems.ts'],
  ['beginUndocking', 'src/systems/robotSystems.ts'],
  ['landOnActive', 'src/systems/robotSystems.ts'],
  ['landOnDocked', 'src/systems/robotSystems.ts'],
  ['tickRobotLifecycle', 'src/systems/robotSystems.ts'],
  ['stepRobotLifecycle', 'src/systems/robotSystems.ts'],
  ['replayLifecycle', 'src/systems/robotSystems.ts'],
  ['chooseNextSite', 'src/systems/siteChoice.ts'],
  ['siteCooldown', 'src/systems/siteChoice.ts'],
  ['heldJobs', 'src/systems/siteChoice.ts'],
  ['getStations', 'src/systems/stations.ts'],
  ['assignStationsAtLoad', 'src/systems/stations.ts'],
  ['nearestFreeStation', 'src/systems/stations.ts'],
  ['placeRosterAtStations', 'src/systems/spawnSystem.ts'],
  ['spawnInitialRoster', 'src/systems/spawnSystem.ts'],
  ['generateSpawnPosition', 'src/systems/spawnSystem.ts'],
  ['recordDockLanding', 'src/systems/dockCycles.ts'],
  ['robotCentre', 'src/animation/jobMoves/sceneToOrbiterLocal.ts'],
  ['positionForCentre', 'src/animation/jobMoves/sceneToOrbiterLocal.ts'],
  ['buildJobTimeline', 'src/animation/jobMoves/buildJobTimeline.ts'],
  ['jobDuration', 'src/animation/jobMoves/jobDuration.ts'],
  ['playStationRipple', 'src/animation/stationRipple.ts'],
  ['chargingColorsKey', 'src/components/stations/stationOccupancy.ts'],
  ['runLoopSim', 'src/systems/lifecycleSim.ts'],
  ['runReadinessSim', 'src/systems/lifecycleSim.ts'],
];

const ANIMATION_IDENTIFIERS: ReadonlyArray<readonly [string, string]> = [
  ['registerArcDecorator', 'src/animation/robotMotionRegistry.ts'],
  ['getArcDecorator', 'src/animation/robotMotionRegistry.ts'],
  ['deleteArcDecorator', 'src/animation/robotMotionRegistry.ts'],
  ['registerOrbiterWork', 'src/animation/robotMotionRegistry.ts'],
  ['getOrbiterWork', 'src/animation/robotMotionRegistry.ts'],
  ['deleteOrbiterWork', 'src/animation/robotMotionRegistry.ts'],
  ['buildJobTimeline', 'src/animation/jobMoves/buildJobTimeline.ts'],
  ['addHoverPulse', 'src/animation/jobMoves/hoverPulse.ts'],
  ['sceneToOrbiterLocal', 'src/animation/jobMoves/sceneToOrbiterLocal.ts'],
  ['playStationRipple', 'src/animation/stationRipple.ts'],
  ['stationRippleKey', 'src/animation/stationRipple.ts'],
  ['ATTACH_DURATION', 'src/components/robot/gem/orbiterMotion.ts'],
  ['BOB_PX', 'src/constants/index.ts'],
  ['STATION_PORT_SCALE', 'src/constants/index.ts'],
];

describe.each([
  ['docs/ROBOT_LIFECYCLE.md', LIFECYCLE_IDENTIFIERS],
  ['docs/ANIMATION_SYSTEM.md', ANIMATION_IDENTIFIERS],
] as const)('%s: named identifiers exist in source', (path, identifiers) => {
  const doc = read(path);
  it.each(identifiers)('%s (%s)', (name, source) => {
    // Word-bounded both ways, so a misspelt superstring (`getOrbiterWorkX`) doesn't count.
    expect(doc, `${path} names ${name}`).toMatch(new RegExp(`\\b${name}\\b`));
    expect(read(source), `${source} defines ${name}`).toMatch(new RegExp(`\\b${name}\\b`));
  });
});

describe('ANIMATION_SYSTEM.md: registry, job timeline, station arcs, keys', () => {
  const doc = read('docs/ANIMATION_SYSTEM.md');

  it('has a robot motion registry section with lock/unlock and the owner-checked delete', () => {
    const s = section(doc, '### Robot motion registry');
    expect(s).toContain('lock()');
    expect(s).toContain('unlock()');
    expect(s).toMatch(/owner/i);
    expect(s).toMatch(/useLayoutEffect/);
  });

  it('has a job timeline section: one key per run, flights inside the duration, the counter-bob', () => {
    const s = section(doc, '### Job timeline');
    expect(s).toContain('`work-${robotId}`');
    expect(s).toContain('jobDuration(bpm)');
    expect(s).toMatch(/counter-bob/i);
    expect(s).toContain(`${ATTACH_DURATION}`);
    expect(s).toContain(`${BOB_PX}`);
    expect(s).toContain(`${BOB_CYCLE_SECONDS}`);
  });

  it('has a station arcs section with the port scale, both eases and the ripple key', () => {
    const s = section(doc, '### Station arcs');
    expect(s).toContain('`station-${robotId}`');
    expect(s).toContain('station-ripple-');
    expect(s).toContain(`${STATION_PORT_SCALE}`);
    expect(s).toMatch(/√v|sqrt/);
    expect(s).toContain('power1.in');
  });

  it('has a key table naming every work-loop key prefix', () => {
    const s = section(doc, '### Robot timeline keys');
    for (const key of ['work-', 'swim-', 'bob-wait-', 'station-', 'station-ripple-', 'orbiters-', 'orbiter-size-']) {
      expect(s, `key table names ${key}`).toContain(`\`${key}`);
    }
    expect(s).toContain('stopWorkLoop');
  });

  it('no longer points at deleted modules (interaction systems, removeSystem.ts)', () => {
    expect(doc).not.toMatch(/interaction systems/i);
    expect(doc).not.toContain('removeSystem');
  });
});

describe('ROBOT_DESIGN.md: job animations and the orbiter lock', () => {
  const doc = read('docs/ROBOT_DESIGN.md');
  const orbiters = section(doc, '## Orbiters');

  it('no longer says job animations are not built and the hook stays ignorant of them', () => {
    expect(doc).not.toMatch(/not built yet; this hook stays ignorant/);
  });

  it('the Orbiters section describes the lock, the catch-up and the world-only registration', () => {
    expect(orbiters).toContain('registerOrbiterWork');
    expect(orbiters).toMatch(/\block\b/);
    expect(orbiters).toMatch(/\bunlock\b/);
    expect(orbiters).toMatch(/catch(es)?[- ]up/i);
    expect(orbiters).toMatch(/world context/i);
    expect(orbiters).toContain('ROBOT_LIFECYCLE.md');
  });
});

describe('SESSION_STORAGE.md: never-persisted reasons', () => {
  const doc = read('docs/SESSION_STORAGE.md');
  const at = doc.indexOf('**Explicitly never persisted:**');
  const para = at === -1 ? '' : doc.slice(at, doc.indexOf('\n\n', at));

  it('names the work loop fields and cooldowns with the reason they are live visual state', () => {
    expect(para).not.toBe('');
    for (const field of ['`job`', '`activity`', '`stationId`', '`siteId`', '`position`', '`docking`', '`batteryLevel`']) {
      expect(para, `names ${field}`).toContain(field);
    }
    expect(para).toMatch(/cooldown/i);
    expect(para).toMatch(/wall-clock/i);
    expect(para).toMatch(/replay/i);
  });

  it('drops the stale "docking-state override" and "battery warning threshold" wording', () => {
    expect(para).not.toMatch(/docking-state override/);
    expect(para).not.toMatch(/battery warning threshold/);
  });
});

describe('CLAUDE.md: the ROBOT_LIFECYCLE reference line', () => {
  const line = read('CLAUDE.md').split('\n').find((l) => l.includes('`docs/ROBOT_LIFECYCLE.md`')) ?? '';

  it('describes the work loop, stations, recall and turn-back, not job affinity scoring', () => {
    expect(line).toMatch(/work loop/i);
    expect(line).toMatch(/charging stations/i);
    expect(line).toMatch(/recall/i);
    expect(line).toMatch(/turn-back/i);
    expect(line).not.toMatch(/affinity/i);
  });
});

describe('spec and intent: Shipped (J2) lines', () => {
  const spec = read('docs/specs/ROBOT_JOBS_AND_STATIONS.md');
  const intent = read('docs/intent/robot-jobs-and-stations.md');

  it.each([
    '### 1.2 Robot fields (J1, `types/Robot.ts`)',
    '### 1.6 Stations (J1 data, J2 render)',
    '### 1.7 The work loop (J2, `src/systems/workLoop.ts`)',
    '### 1.8 Orbiter and halo hand-off (J2, `src/animation/robotMotionRegistry.ts`)',
    '### 1.9 Jobs and moves (J2: one move end to end; J3: all)',
    '### 1.11 Cards and content (J2)',
  ])('spec %s carries a Shipped (J2) line', (heading) => {
    expect(section(spec, heading)).toMatch(/^> \*\*Shipped \(J2/m);
  });

  it('the §1.7 Shipped line records the no-recall-flag call and the 0.15 port scale', () => {
    const s = section(spec, '### 1.7 The work loop (J2, `src/systems/workLoop.ts`)');
    const shipped = s.slice(s.search(/^> \*\*Shipped \(J2/m));
    expect(shipped).toMatch(/recall flag/i);
    expect(shipped).toContain(`${STATION_PORT_SCALE}`);
  });

  it('the intent carries a Shipped (J2) line', () => {
    expect(intent).toMatch(/^> \*\*Shipped \(J2/m);
  });
});

describe('PROCEDURAL_GENERATION.md and the roadmap', () => {
  it('PROCEDURAL_GENERATION.md no longer promises idle/interaction behaviour from the seed', () => {
    expect(read('docs/PROCEDURAL_GENERATION.md')).not.toMatch(/idle\/interaction/);
  });

  it('the roadmap records J2 as shipped', () => {
    const roadmap = read('docs/todo/roadmap.md');
    const at = roadmap.indexOf('## 43. Robot Jobs and Charging Stations');
    const next = roadmap.indexOf('\n## 44.', at);
    const phase = roadmap.slice(at, next === -1 ? undefined : next);
    expect(phase).toMatch(/J2[^.]*shipped/i);
    expect(phase).not.toMatch(/J2–J4 not started/);
  });
});
