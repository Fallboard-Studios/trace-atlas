import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BACK_HOSTS_ENABLED, BACK_LAYER_SCALE, LAYER_DISSOLVE_SECONDS, LAYER_SWITCH_STEP } from '../constants';

// docs/tasks/ROBOT_JOBS_AND_STATIONS.md Task 36 (final docs). A docs task has no behaviour to test,
// so this makes its criteria executable, as the J2 and J3 docs tests do: ANIMATION_SYSTEM.md gets
// the six-layer scene stack and a layer switch section that match OceanScene.tsx and workLoop.ts;
// ROBOT_DESIGN.md the 0.75 back row; the roadmap records Phase 43 as shipped with its decisions and
// Not Doing; backlog item 8 is archived; the intent, spec, idea and sketches carry Shipped headers;
// and no doc still calls J4 future work. Named identifiers are spot-checked against source,
// word-bounded.

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

/** Roadmap Phase 43, up to Phase 44. */
function phase43(): string {
  const roadmap = read('docs/todo/roadmap.md');
  const at = roadmap.indexOf('## 43. Robot Jobs and Charging Stations');
  const next = roadmap.indexOf('\n## 44.', at);
  return roadmap.slice(at, next === -1 ? undefined : next);
}

const oceanScene = read('src/components/panels/screen/worldView/OceanScene.tsx');

describe('ANIMATION_SYSTEM.md: the scene stack', () => {
  const layers = section(read('docs/ANIMATION_SYSTEM.md'), '### Scene layers — what may move where');

  it('lists the six layers in OceanScene.tsx\'s order', () => {
    const rendered = [...oceanScene.matchAll(/<SceneLayer name="([a-z-]+)"/g)].map((m) => m[1]);
    expect(rendered).toHaveLength(6);
    const documented = layers.split('\n').filter((l) => /^\| `[a-z-]+` \|/.test(l)).map((l) => l.match(/^\| `([a-z-]+)`/)![1]);
    expect(documented).toEqual(rendered);
  });

  it('marks exactly the moving layers as moving', () => {
    const moving = [...oceanScene.matchAll(/<SceneLayer name="([a-z-]+)"[^>]*\bmoving\b/g)].map((m) => m[1]);
    for (const line of layers.split('\n').filter((l) => /^\| `[a-z-]+` \|/.test(l))) {
      const name = line.match(/^\| `([a-z-]+)`/)![1];
      expect(line.includes('| moving |'), name).toBe(moving.includes(name));
    }
  });

  it('states every depth tint with its OceanScene.tsx opacity', () => {
    const tints = [...oceanScene.matchAll(/^\s+([ABCD]): \{ top: [^}]+, alpha: ([\d.]+) \}/gm)];
    expect(tints).toHaveLength(4);
    for (const [, slot, alpha] of tints) {
      expect(layers, `tint ${slot}`).toMatch(new RegExp(`\\b${slot}\\b[^.]*?${Number(alpha).toFixed(2).replace('.', '\\.')}`));
    }
    expect(layers).not.toMatch(/four stacked/);
  });
});

describe('ANIMATION_SYSTEM.md: the layer switch', () => {
  const doc = read('docs/ANIMATION_SYSTEM.md');
  const sw = section(doc, '### Layer switch');
  const keys = section(doc, '### Robot timeline keys');

  it('exists, and the overview links its module', () => {
    expect(sw).not.toBe('');
    expect(doc).toContain('(../src/animation/layerSwitch.ts)');
  });

  it.each([
    ['BACK_LAYER_SCALE', BACK_LAYER_SCALE],
    ['LAYER_SWITCH_STEP', LAYER_SWITCH_STEP],
    ['LAYER_DISSOLVE_SECONDS', LAYER_DISSOLVE_SECONDS],
  ] as const)('states %s with its real value (%s)', (name, value) => {
    expect(sw).toMatch(new RegExp(`\`${name}\` \\(${String(value).replace('.', '\\.')}( s)?\\)`));
  });

  it('says the front copy fades in both directions', () => {
    expect(sw).toMatch(/front\s+copy fades and the\s+back robot stays opaque/);
  });

  it('BACK_HOSTS_ENABLED is stated as true, as it is', () => {
    expect(BACK_HOSTS_ENABLED).toBe(true);
    expect(sw).toContain('`BACK_HOSTS_ENABLED` (true)');
  });

  it('the key table has the dissolve key, and stopWorkLoop names every LOOP_KEY_PREFIXES entry', () => {
    expect(keys).toMatch(/^\| `` `dissolve-\$\{robotId\}` `` \|/m);
    const source = read('src/systems/workLoop.ts');
    const prefixes = [...source.match(/LOOP_KEY_PREFIXES = \[([^\]]+)\]/)![1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    const stopLine = keys.slice(keys.indexOf('`stopWorkLoop` kills'));
    for (const p of prefixes) expect(stopLine, p).toContain(`\`${p}\``);
  });

  it('the station arcs say the exit plays in the back row', () => {
    expect(section(doc, '### Station arcs')).toMatch(/exit plays in the \*\*back robot row\*\*/);
  });
});

describe('ROBOT_DESIGN.md: the back row', () => {
  const contexts = section(read('docs/ROBOT_DESIGN.md'), '## Render contexts');

  it('states the 0.75 scale on .robot__row and that it is no robot overlay', () => {
    expect(contexts).toContain(`\`BACK_LAYER_SCALE\` (${BACK_LAYER_SCALE})`);
    expect(contexts).toContain('`.robot__row`');
    expect(contexts).toMatch(/day\/night and battery stay the only two/);
  });

  it('its scaled body-scale range is the real product', () => {
    expect(contexts).toContain(`${(0.735 * BACK_LAYER_SCALE).toFixed(2)}–${(1.69 * BACK_LAYER_SCALE).toFixed(2)}`);
  });
});

// [identifier, source file] — the doc names it and the source defines or exports it.
const IDENTIFIERS: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> = [
  ['docs/ANIMATION_SYSTEM.md', [
    ['findLayerSwitchPoint', 'src/animation/layerSwitch.ts'],
    ['dissolveRunLength', 'src/animation/layerSwitch.ts'],
    ['robotBoxAt', 'src/animation/layerSwitch.ts'],
    ['getMidgroundSilhouettes', 'src/systems/midgroundSilhouettes.ts'],
    ['legTo', 'src/systems/workLoop.ts'],
    ['moveToRow', 'src/systems/workLoop.ts'],
    ['dropLeg', 'src/systems/workLoop.ts'],
    ['killLegs', 'src/systems/workLoop.ts'],
    ['LOOP_KEY_PREFIXES', 'src/systems/workLoop.ts'],
    ['onRobotMounted', 'src/systems/workLoop.ts'],
    ['layerScale', 'src/systems/workLoop.ts'],
    ['markLayerSwitching', 'src/animation/robotMotionRegistry.ts'],
    ['isLayerSwitching', 'src/animation/robotMotionRegistry.ts'],
    ['clearLayerSwitching', 'src/animation/robotMotionRegistry.ts'],
    ['DEPTH_TINTS', 'src/components/panels/screen/worldView/OceanScene.tsx'],
    ['robot-dissolve-layer', 'src/components/panels/screen/worldView/OceanScene.tsx'],
    ['data-dissolve-copy', 'src/systems/workLoop.ts'],
    ['world-robot-', 'src/components/robot/Robot.tsx'],
    ['robot__row', 'src/components/robot/Robot.tsx'],
    ['BACK_HOSTS_ENABLED', 'src/constants/index.ts'],
  ]],
  ['docs/ROBOT_DESIGN.md', [
    ['BACK_LAYER_SCALE', 'src/constants/index.ts'],
    ['robot__row', 'src/components/robot/Robot.tsx'],
  ]],
  ['docs/ROBOT_LIFECYCLE.md', [
    ['BACK_HOSTS_ENABLED', 'src/constants/index.ts'],
    ['BACK_LAYER_SCALE', 'src/constants/index.ts'],
    ['PARK_CLEARANCE', 'src/constants/index.ts'],
  ]],
  ['docs/BUILDING_DESIGN.md', [
    ['getMidgroundSilhouettes', 'src/systems/midgroundSilhouettes.ts'],
    ['BACK_HOSTS_ENABLED', 'src/constants/index.ts'],
  ]],
];

describe.each(IDENTIFIERS)('%s: named J4 identifiers exist in source', (path, identifiers) => {
  const doc = read(path);
  it.each(identifiers)('%s (%s)', (name, source) => {
    const word = new RegExp(`(?<![\\w-])${name.replace(/[-]/g, '\\-')}(?![\\w-])`);
    expect(doc, `${path} names ${name}`).toMatch(word);
    expect(read(source), `${source} defines ${name}`).toMatch(word);
  });
});

describe.each([
  'src/systems/midgroundSilhouettes.test.tsx',
  'src/utils/svgElementExtent.ts',
  'src/components/actors/scenery/pipeBridgeLayout.ts',
  'src/animation/layerSwitch.test.ts',
])('a file the docs name exists: %s', (path) => {
  it('exists', () => expect(existsSync(resolve(repoRoot, path))).toBe(true));
});

describe('no doc calls J4 future work', () => {
  it.each([
    ['docs/ROBOT_LIFECYCLE.md', /J4 adds/],
    ['docs/BUILDING_DESIGN.md', /until the depth-layers branch|whether or not J4 ships|ineligible until J4|in J4 can't move/],
    ['docs/intent/robot-jobs-and-stations.md', /J4 \(depth layers\) is still to come/],
    ['docs/todo/roadmap.md', /J4 \([^)]*\) is next/],
    ['CLAUDE.md', /production cooldowns/],
  ] as const)('%s', (path, stale) => {
    expect(read(path)).not.toMatch(stale);
  });
});

describe('Shipped headers', () => {
  const spec = read('docs/specs/ROBOT_JOBS_AND_STATIONS.md');

  it('the spec opens with Phase 43 complete and §1.10 carries a Shipped (J4) line', () => {
    expect(spec.slice(0, spec.indexOf('## Assumptions'))).toMatch(/^> \*\*Shipped \(Phase 43 complete/m);
    expect(section(spec, '### 1.10 Depth layers (J4, `OceanScene.tsx`)')).toMatch(/^> \*\*Shipped \(J4/m);
  });

  it('the intent and the idea carry Shipped lines', () => {
    expect(read('docs/intent/robot-jobs-and-stations.md')).toMatch(/^> \*\*Shipped \(J4/m);
    expect(read('docs/ideas/robot-jobs-and-stations.md')).toMatch(/^> \*\*Shipped \(Phase 43/m);
  });

  it.each([
    'docs/sketches/robot-charging-station.html',
    'docs/sketches/robot-jobs-and-stations.html',
    'docs/sketches/robot-depth-tint.html',
  ])('%s opens with a SHIPPED note', (path) => {
    expect(read(path).split('\n').slice(0, 3).join('\n')).toMatch(/^<!doctype html>\n<!-- SHIPPED \(roadmap Phase 43/i);
  });

  it('the Pixel run is recorded on Full, not "high"', () => {
    expect(read('docs/PERFORMANCE.md')).toMatch(/on the Full Audio Load Budget/);
    expect(read('docs/tasks/ROBOT_JOBS_AND_STATIONS.md')).not.toMatch(/"High" isn't one of/);
  });
});

describe('roadmap and backlog', () => {
  it('Phase 43 records J4 as merged, with its PR, decisions and Not Doing', () => {
    const phase = phase43();
    expect(phase).toMatch(/J4[^.]*merged/i);
    expect(phase).toContain('#544');
    expect(phase).toContain('### Decisions made while building');
    expect(phase).toContain('### Not Doing (and why)');
    expect(phase).not.toMatch(/not started/);
  });

  it('backlog item 8 has moved to the archive', () => {
    expect(read('docs/todo/backlog.md')).not.toMatch(/^### 8\. /m);
    const archived = section(read('docs/todo/archive/backlog-archive.md'), '## 8. Visuals: Job Animations');
    expect(archived).toMatch(/^\*\*Closed\*\* 2026-10-08 by roadmap Phase 43/m);
  });
});

describe('every relative link in the docs Task 36 touched resolves', () => {
  it.each([
    'docs/ANIMATION_SYSTEM.md',
    'docs/ROBOT_DESIGN.md',
    'docs/ROBOT_LIFECYCLE.md',
    'docs/BUILDING_DESIGN.md',
    'docs/intent/robot-jobs-and-stations.md',
    'docs/ideas/robot-jobs-and-stations.md',
    'docs/specs/ROBOT_JOBS_AND_STATIONS.md',
    'docs/todo/archive/backlog-archive.md',
  ])('%s', (path) => {
    const dir = dirname(resolve(repoRoot, path));
    expect(relativeLinks(read(path)).filter((t) => !existsSync(resolve(dir, t)))).toEqual([]);
  });

  it('the roadmap\'s Phase 43 links resolve', () => {
    const dir = resolve(repoRoot, 'docs/todo');
    expect(relativeLinks(phase43()).filter((t) => !existsSync(resolve(dir, t)))).toEqual([]);
  });
});
