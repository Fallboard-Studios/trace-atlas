import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Phase 39 — Gem Polygon Robots (docs/specs/GEM_POLYGON_ROBOTS.md §1.8, docs/tasks Tasks 12–13).
// Replaces the Phase 36/37/38 robot docs tests: the identity guardrail is rewritten (identity is
// now the body, not three carve-outs on a hand-drawn shape), and the docs must not describe the
// deleted window glass, sockets or greebles as current.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

/** Orbiting Polygons spec §1.8 / Visual Mapping rewrite (Roadmap Phase 40, docking redesign). */
const GUARDRAIL =
  '- Visual Mapping: "A robot\'s body is seeded, permanent gem-polygon geometry (derived from `Robot.gemSeed`) ' +
  'in its `identityColor` — identity and seed, not audio. Audio and composition settings reach the body only ' +
  'through the dials listed in ROBOT_DESIGN.md, each continuous or animated, never a pop. The backing, Mids and ' +
  'Top keep their seeded polygon count, sides and boundary-line layout on every edit; orbiters may attach and ' +
  'detach by their hop, never popping. Day/night lightness and battery dimming remain the two overlay exceptions."';

const STALE = [/greeble/i, /socket/i, /window glass/i, /non-audio carriers/i];

function visualMappingLine(text: string): string {
  const line = text.split('\n').find((l) => l.trimStart().startsWith('- Visual Mapping:'));
  expect(line, 'a Visual Mapping guardrail line exists').toBeDefined();
  return line!.trim();
}

describe('the identity guardrail is rewritten for gem robots (Task 12)', () => {
  it.each(['CLAUDE.md', '.github/copilot-instructions.md'])('%s carries the spec §1.8 Visual Mapping line', (file) => {
    expect(visualMappingLine(read(file))).toBe(GUARDRAIL);
  });

  it('both instruction files carry the identical line', () => {
    expect(visualMappingLine(read('CLAUDE.md'))).toBe(visualMappingLine(read('.github/copilot-instructions.md')));
  });

  it.each(['CLAUDE.md', '.github/copilot-instructions.md', 'src/types/Robot.ts'])('%s no longer describes the deleted carriers (greebles, sockets, window glass)', (file) => {
    const text = read(file);
    for (const stale of STALE) expect(text, `${file} matches ${stale}`).not.toMatch(stale);
  });

  it('ROBOT_DESIGN.md no longer describes the deleted carriers or the hand-drawn shape files', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    for (const stale of [...STALE, /RobotSleek|RobotAngular|RobotOrganic|RobotIndustrial/, /in progress/i]) {
      expect(doc, `ROBOT_DESIGN.md matches ${stale}`).not.toMatch(stale);
    }
  });

  it('Robot.ts\'s identityColor comment says identity colours the gem body and points at the gem seed', () => {
    const src = read('src/types/Robot.ts');
    const at = src.indexOf('identityColor: string;');
    const comment = src.slice(src.lastIndexOf('/**', at), at);
    expect(comment).toMatch(/gem/i);
    expect(comment).toContain('gemSeed');
    expect(comment).not.toMatch(/ADSR\/waveform-derived/);
  });
});

describe('ROBOT_DESIGN.md is rewritten around the gem generator (Task 13)', () => {
  const doc = read('docs/ROBOT_DESIGN.md');

  it('has the spec §1.1–§1.6 sections, in order', () => {
    const headings = doc.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());
    expect(headings).toEqual([
      'Overview',
      'The generator',
      'Bevel and shading',
      'Colour',
      'What audio drives',
      'Orbiters',
      'Non-audio overlays',
      'Render contexts',
      'Data flow',
      'Forbidden patterns',
    ]);
  });

  const symbols: Array<[symbol: string, file: string]> = [
    ['getRobotGem', 'src/components/robot/gem/polygon.ts'],
    ['generateRobotGem', 'src/components/robot/gem/polygon.ts'],
    ['bevelHolds', 'src/components/robot/gem/polygon.ts'],
    ['gemViewBox', 'src/components/robot/gem/polygon.ts'],
    ['GEM_CANVAS_H', 'src/components/robot/gem/polygon.ts'],
    ['GEM_FACET_TONES', 'src/components/robot/gem/gemShading.ts'],
    ['GEM_LIGHT', 'src/components/robot/gem/gemShading.ts'],
    ['batteryFacetContrast', 'src/components/robot/gem/gemShading.ts'],
    ['gemPalette', 'src/components/robot/gem/gemPalette.ts'],
    ['facetPaths', 'src/components/robot/gem/gemPaths.ts'],
    ['RobotGem', 'src/components/robot/gem/RobotGem.tsx'],
    ['layerLitLevel', 'src/components/robot/robotVisualHelpers.ts'],
    ['calculateBodyScale', 'src/components/robot/robotVisualHelpers.ts'],
    ['calculateLampIntensity', 'src/components/robot/robotVisualHelpers.ts'],
    ['computeBatteryDimOpacity', 'src/components/robot/robotVisualHelpers.ts'],
    ['ignoreScale', 'src/components/robot/RobotBody.tsx'],
    ['gemSeed', 'src/types/Robot.ts'],
    ['orbiterDials', 'src/components/robot/gem/orbiterDials.ts'],
    ['orbiterPlan', 'src/components/robot/gem/orbiterMotion.ts'],
    ['gemMotionViewBox', 'src/components/robot/gem/orbiterMotion.ts'],
    ['useOrbiterMotion', 'src/components/robot/gem/useOrbiterMotion.ts'],
  ];

  it.each(symbols)('names %s, which exists in %s', (symbol, file) => {
    expect(doc, `ROBOT_DESIGN.md names ${symbol}`).toContain(symbol);
    expect(read(file), `${file} defines ${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`));
  });

  it.each(['CLAUDE.md', '.github/copilot-instructions.md'])('%s describes ROBOT_DESIGN.md as the gem generator guide', (file) => {
    const line = read(file).split('\n').find((l) => l.includes('`docs/ROBOT_DESIGN.md`'));
    expect(line).toBeDefined();
    expect(line).toMatch(/gem/i);
    expect(line).not.toMatch(/SVG generation rules/);
  });
});

describe('the roadmap and the phase docs record Phase 39 (Task 13)', () => {
  it('the roadmap has a Phase 39 entry linking idea, intent, spec, plan and sketch', () => {
    const roadmap = read('docs/todo/roadmap.md');
    expect(roadmap).toMatch(/^## 39\. Gem Polygon Robots \(Branch A\)$/m);
    const phase = roadmap.slice(roadmap.indexOf('## 39. Gem Polygon Robots'));
    for (const link of ['docs/ideas/gem-polygon-robots.md', 'docs/intent/gem-polygon-robots.md', 'docs/specs/GEM_POLYGON_ROBOTS.md', 'docs/tasks/GEM_POLYGON_ROBOTS.md', 'docs/sketches/gem-polygon-robots.html']) {
      expect(phase, `Phase 39 links ${link}`).toContain(link);
    }
  });

  it.each(['docs/intent/gem-polygon-robots.md', 'docs/specs/GEM_POLYGON_ROBOTS.md', 'docs/ideas/gem-polygon-robots.md', 'docs/sketches/gem-polygon-robots.html'])('%s is marked Shipped (Phase 39)', (file) => {
    expect(read(file).slice(0, 1200)).toMatch(/Shipped \(roadmap Phase 39/);
  });

  it.each(['docs/ideas/robot-visual-rework.md', 'docs/ideas/layer-pods-and-follow-through.md'])('%s is headed as superseded by the gem robots', (file) => {
    const head = read(file).slice(0, 1200);
    expect(head).toMatch(/Superseded/);
    expect(head).toContain('gem-polygon-robots.md');
  });
});
