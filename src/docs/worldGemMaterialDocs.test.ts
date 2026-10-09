import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

// Phase 44 — World Gem Material (docs/specs/WORLD_GEM_MATERIAL.md, docs/tasks Tasks 21-22).
// Makes the docs criteria executable: BUILDING_DESIGN.md / ROBOT_DESIGN.md / PERFORMANCE.md describe
// the shipped material, and every identifier they name still exists in the source.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

/** The text under a heading, up to the next heading of the same or a shallower level. */
function section(doc: string, heading: string): string {
  const level = heading.match(/^#+/)![0].length;
  const start = doc.indexOf(`\n${heading}\n`);
  expect(start, `heading "${heading}" exists`).toBeGreaterThanOrEqual(0);
  const body = doc.slice(start + 1);
  const next = new RegExp(`\\n#{1,${level}} `).exec(body.slice(heading.length));
  return next ? body.slice(0, heading.length + next.index) : body;
}

const MATERIAL = 'src/components/actors/material/worldGemMaterial.ts';

describe('BUILDING_DESIGN.md "Color System" describes the world gem material (Task 21)', () => {
  let colorSystem = '';
  let material = '';
  beforeAll(() => {
    colorSystem = section(read('docs/BUILDING_DESIGN.md'), '## Color System');
    material = section(colorSystem, '### World Gem Material (Phase 44)');
  });

  it('is a subsection of Color System, after Applying Colour', () => {
    expect(colorSystem.indexOf('### Applying Colour')).toBeLessThan(colorSystem.indexOf('### World Gem Material (Phase 44)'));
  });

  it('names the ring, its three tones, the hour\'s light vector, the hairline and what is left alone', () => {
    expect(material).toMatch(/bevel ring/i);
    expect(material).toMatch(/three tones/i);
    expect(material).toContain('worldLightVector');
    expect(material).toMatch(/not the robots'|instead of the robots'/);
    expect(material).toContain('GEM_LIGHT');
    expect(material).toMatch(/hairline/i);
    expect(material).toMatch(/left alone|left exactly as they are/i);
  });

  it('records the numbers the sketch ruled: 8 px ring, 1.5 px hairline, 0.6 roof boxes, 1 px floor', () => {
    expect(material).toMatch(/\b8 px\b/);
    expect(material).toMatch(/\b1\.5 px\b/);
    expect(material).toMatch(/0\.6/);
    expect(material).toMatch(/\b1 px\b/);
  });

  it('names the six WORLD_GEM switches, in the order the source declares them', () => {
    const declared = [...read(MATERIAL).match(/export const WORLD_GEM = \{([^}]*)\}/)![1].matchAll(/(\w+): true/g)].map((m) => m[1]);
    expect(declared).toHaveLength(6);
    let at = 0;
    for (const piece of declared) {
      const found = material.indexOf(`\`${piece}\``, at);
      expect(found, `Color System names the \`${piece}\` switch after the previous one`).toBeGreaterThanOrEqual(at);
      at = found;
    }
  });

  it('says the terrain ring is built on an extended outline, not the drawn polygon', () => {
    expect(material).toContain('terrainRingOutline');
    expect(material).toMatch(/does not hold|cannot hold|can't hold/i);
  });

  const symbols: Array<[symbol: string, file: string]> = [
    ['worldLightVector', MATERIAL],
    ['worldBevel', MATERIAL],
    ['ringFacets', MATERIAL],
    ['hairline', MATERIAL],
    ['WORLD_GEM', MATERIAL],
    ['WORLD_BEVEL_PX', MATERIAL],
    ['HAIRLINE_PX', MATERIAL],
    ['ROOF_BOX_BEVEL_FACTOR', MATERIAL],
    ['RING_MIN_PX', MATERIAL],
    ['GemRing', 'src/components/actors/material/GemRing.tsx'],
    ['facetMultiplier', 'src/components/actors/scenery/gemShape.tsx'],
    ['gemOutlineStroke', 'src/components/actors/scenery/gemShape.tsx'],
    ['quantizeShade', 'src/components/robot/gem/gemShading.ts'],
    ['terrainRingOutline', 'src/components/panels/screen/worldView/terrainRingOutline.ts'],
  ];

  it.each(symbols)('names %s, which exists in %s', (symbol, file) => {
    expect(material, `Color System names ${symbol}`).toContain(symbol);
    expect(read(file), `${file} defines ${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`));
  });
});

describe('BUILDING_DESIGN.md "Scenery families" carries the per-family ring/hairline table (Task 21)', () => {
  let scenery = '';
  let treatment = '';
  beforeAll(() => {
    scenery = section(read('docs/BUILDING_DESIGN.md'), '## Scenery families');
    treatment = section(scenery, '### World gem treatment');
  });

  /** family, the WORLD_GEM switches its renderer reads, whether the row says ring / hairline */
  const FAMILIES: Array<[kind: string, switches: string[], ring: boolean, hairline: boolean]> = [
    ['tank', ['massScenery'], true, false],
    ['wall', ['massScenery'], true, false],
    ['dome', ['massScenery', 'members'], true, true],
    ['containers', ['massScenery'], true, false],
    ['scaffold', ['massScenery', 'members'], true, true],
    ['wreck', ['massScenery'], true, false],
    ['vent', ['massScenery'], true, false],
    ['crane', ['massScenery', 'members'], true, true],
    ['pylon', ['members'], false, true],
    ['beacon', ['members'], false, true],
    ['pipeline', ['others'], false, true],
    ['turbine', ['others'], false, true],
    ['tether', ['others'], false, true],
    ['floodlight', ['others'], false, true],
    ['dish', ['others'], false, true],
    ['boulder', [], false, false],
  ];

  const row = (kind: string): string[] => {
    const line = treatment.split('\n').find((l) => l.startsWith(`| ${kind} |`));
    expect(line, `the table has a row for ${kind}`).toBeDefined();
    return line!.split('|').slice(1, -1).map((c) => c.trim());
  };

  it('covers exactly the sixteen families the section lists', () => {
    const listed = scenery.match(/`tank · crane[^`]*`/)![0].replace(/`/g, '').split(/\s*·\s*|\s+/).filter((w) => /^[a-z]+$/.test(w));
    expect(listed.sort()).toEqual(FAMILIES.map(([k]) => k).sort());
  });

  it.each(FAMILIES)('%s: row names ring / hairline as the renderer does, and the switches it reads', (kind, switches, ring, hairline) => {
    const [family, ringCell, hairlineCell, switchCell] = row(kind);
    expect(family).toBe(kind);
    expect(ringCell === '—', `${kind} ring cell`).toBe(!ring);
    expect(hairlineCell === '—', `${kind} hairline cell`).toBe(!hairline);
    const documented = switchCell === '—' ? [] : switchCell.split(/\s*,\s*/).map((s) => s.replace(/`/g, ''));
    expect(documented.sort()).toEqual([...switches].sort());

    // The documented switches are exactly the ones the renderer file reads.
    const source = read(`src/components/actors/scenery/renderers/${kind}.tsx`);
    const read_ = [...source.matchAll(/WORLD_GEM\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(read_)].sort(), `${kind}.tsx reads`).toEqual([...switches].sort());
  });

  it('notes the pipe bridges (not a scenery actor) and the silhouette widening', () => {
    expect(treatment).toContain('pipeBridges.tsx');
    expect(read('src/components/actors/scenery/pipeBridges.tsx')).toContain('WORLD_GEM.others');
    expect(treatment).toContain('midgroundSilhouettes');
    expect(read('src/systems/midgroundSilhouettes.ts')).toContain('HAIRLINE_PX');
  });

  it('records the crane hanger as a rect now, whatever the switches', () => {
    expect(treatment).toMatch(/hanger/i);
    expect(treatment).toMatch(/<rect>|rect/);
  });
});

describe('BUILDING_DESIGN.md "The 90/45 test helper" records the ring exemption (Task 21)', () => {
  let helper = '';
  beforeAll(() => {
    helper = section(section(read('docs/BUILDING_DESIGN.md'), '## Scenery families'), '### The 90/45 test helper');
  });

  it('mentions data-gem="ring" and that the helper skips it', () => {
    expect(helper).toContain('data-gem="ring"');
    expect(helper).toMatch(/skipped|exempt/i);
  });

  it('is true: sceneryTestHelpers skips a [data-gem="ring"] subtree', () => {
    expect(read('src/components/actors/scenery/sceneryTestHelpers.ts')).toContain('[data-gem="ring"]');
  });

  it('says only the ring is exempt: hairlined shapes are still checked', () => {
    expect(helper).toMatch(/hairline/i);
  });
});

describe('BUILDING_DESIGN.md "Rooftop Greebles" entries note the ring and hairline (Task 21)', () => {
  let greebles = '';
  beforeAll(() => {
    greebles = section(read('docs/BUILDING_DESIGN.md'), '### Rooftop Greebles');
  });
  const entry = (name: string) => section(greebles, `#### ${name}`);
  /** Whole word: "ring" alone also matches "appearing". */
  const RING = /\brings?\b/i;

  it.each([
    ['Machinery', RING],
    ['Antennae', /hairline/i],
    ['Water Tower', RING],
    ['Water Tower', /hairline/i],
    ['Cupola', /hairline/i],
    ['Crown Spire', RING],
    ['Crown Spire', /hairline/i],
    ['Pitched Roof', RING],
    ['Steppe Roof', RING],
  ] as Array<[string, RegExp]>)('%s mentions %s', (name, pattern) => {
    expect(entry(name)).toMatch(pattern);
  });

  it('says the roof rings are 0.6 x the building\'s and need the hour\'s light', () => {
    expect(greebles).toMatch(/0\.6/);
    expect(greebles).toContain('ctx.light');
    expect(read('src/components/actors/greebles/rooftopGreebles.tsx')).toContain('ctx.light');
  });
});

describe('ROBOT_DESIGN.md "Bevel and shading" records what the world shares (Task 21)', () => {
  let shading = '';
  beforeAll(() => {
    shading = section(read('docs/ROBOT_DESIGN.md'), '## Bevel and shading');
  });

  it.each(['quantizeShade', 'inset', 'edgeNormals', 'bevelDepth', 'worldLightVector', 'GEM_LIGHT'])('names %s', (name) => {
    expect(shading).toContain(name);
  });

  it('says the world lights by the hour, not by GEM_LIGHT, and shares bevelDepth\'s one cap', () => {
    expect(shading).toMatch(/world/i);
    expect(shading).toMatch(/hour/i);
    expect(shading).toMatch(/18 %|18%/);
    expect(shading).toContain('BUILDING_DESIGN.md');
  });

  it.each([
    ['bevelDepth', 'src/components/robot/gem/polygon.ts'],
    ['inset', 'src/components/robot/gem/polygon.ts'],
    ['edgeNormals', 'src/components/robot/gem/polygon.ts'],
  ])('%s is exported by %s', (name, file) => {
    expect(read(file)).toMatch(new RegExp(`export (function|const) ${name}\\b`));
  });

  it('bevelDepth takes the depth parameter the docs rely on', () => {
    expect(read('src/components/robot/gem/polygon.ts')).toMatch(/export function bevelDepth\(w: number, h: number, depth = GEM_BEVEL_DEPTH\)/);
  });
});

describe('PERFORMANCE.md carries the Phase 44 gate (Task 19/21)', () => {
  const perf = read('docs/PERFORMANCE.md');

  it('has a World Gem Material gate section', () => {
    expect(perf).toMatch(/^## World Gem Material — the Task 19 perf gate \(\d{4}-\d{2}-\d{2}, Phase 44\)$/m);
  });

  it('records both commits, the three pinned worlds and a verdict', () => {
    const gate = section(perf, perf.match(/^## World Gem Material — the Task 19 perf gate.*$/m)![0]);
    for (const needle of ['6802c8b4', 'dense', 'ventfield', 'yard', '**Verdict:**']) expect(gate, needle).toContain(needle);
  });
});

describe('the transition snapshots are gone; the switch-off tests assert plainly (Task 21)', () => {
  const BEVEL0_TESTS = [
    'src/components/actors/Factory.bevel0.test.tsx',
    'src/components/actors/scenery/Scenery.bevel0.test.tsx',
    'src/components/actors/scenery/pipeBridges.bevel0.test.tsx',
    'src/components/panels/screen/worldView/TerrainLayer.bevel0.test.tsx',
  ];
  const SNAPSHOT_DIRS = [
    'src/components/actors/__snapshots__',
    'src/components/actors/scenery/__snapshots__',
    'src/components/panels/screen/worldView/__snapshots__',
  ];

  it.each(SNAPSHOT_DIRS)('%s no longer exists (nothing else in it was a snapshot of this phase)', (dir) => {
    expect(existsSync(resolve(repoRoot, dir))).toBe(false);
  });

  it.each(BEVEL0_TESTS)('%s still exists and asserts through worldGemTraces, not a snapshot', (file) => {
    const source = read(file);
    expect(source).not.toContain('toMatchSnapshot');
    expect(source).toContain('worldGemTraces');
  });

  it.each(BEVEL0_TESTS)('%s no longer says Task 21 will delete it', (file) => {
    expect(read(file)).not.toMatch(/Task 21 deletes|snapshot (file )?beside this test/i);
  });

});

describe('the roadmap, backlog and idea doc record Phase 44 (Task 22)', () => {
  const roadmap = read('docs/todo/roadmap.md');
  const at = roadmap.indexOf('## 44. World Gem Material');
  const next = roadmap.indexOf('\n## 45.', at);
  const phase = at === -1 ? '' : roadmap.slice(at, next === -1 ? undefined : next);

  it('the roadmap has a Phase 44 entry linking idea, intent, spec, plan and sketch', () => {
    expect(at, 'Phase 44 entry exists').toBeGreaterThanOrEqual(0);
    for (const link of ['docs/ideas/world-gem-material.md', 'docs/intent/world-gem-material.md', 'docs/specs/WORLD_GEM_MATERIAL.md', 'docs/tasks/WORLD_GEM_MATERIAL.md', 'docs/sketches/gem-factories.html']) {
      expect(phase, `Phase 44 links ${link.replace('docs/', '')}`).toContain(link.replace('docs/', ''));
    }
  });

  it('no longer says the intent, spec and plan are not started, or that a ruling is still open', () => {
    expect(phase).not.toMatch(/spec and plan not started/i);
    expect(phase).not.toMatch(/Still open:/);
    expect(phase).not.toMatch(/next session starts at/i);
  });

  it('records the status, the perf gate verdict and the manual check still owed (Task 20)', () => {
    expect(phase).toMatch(/Built|Shipped/);
    expect(phase).toMatch(/perf gate/i);
    expect(phase).toMatch(/passed/i);
    expect(phase).toContain('PERFORMANCE.md');
    expect(phase).toMatch(/\*\*Still owed: Task 20\*\*/);
  });

  it('records the three rulings that superseded the idea doc and the rooftop rule', () => {
    expect(phase).toMatch(/hairline/i);
    expect(phase).toMatch(/terrain is (ruled )?in|terrain ring/i);
    expect(phase).toMatch(/six (other )?families|everything (else )?solid/i);
    expect(phase).toMatch(/roof/i);
    expect(phase).toContain('0.6');
  });

  it('says backlog item 9 moved to the archive', () => {
    const supersedes = section(phase, '### Supersedes');
    expect(supersedes).toMatch(/item 9/);
    expect(supersedes).toMatch(/archive/i);
  });

  it('backlog.md no longer carries item 9, and its neighbours are untouched', () => {
    const backlog = read('docs/todo/backlog.md');
    expect(backlog).not.toMatch(/^### 9\. /m);
    expect(backlog).toMatch(/^### 7\. /m);
    expect(backlog).toMatch(/^### 10\. /m);
  });

  it('the backlog archive carries item 9 in numeric order, closed by Phase 44', () => {
    const archive = read('docs/todo/archive/backlog-archive.md');
    const item = (n: number) => archive.search(new RegExp(`^## ${n}\\. `, 'm'));
    expect(item(9), 'item 9 is in the archive').toBeGreaterThanOrEqual(0);
    expect(item(8)).toBeLessThan(item(9));
    expect(item(9)).toBeLessThan(item(12));
    const entry = archive.slice(item(9), item(12));
    expect(entry).toContain('Better Building Details');
    expect(entry).toMatch(/\*\*Closed\*\*/);
    expect(entry).toContain('Phase 44');
  });

  it('the idea doc is headed as superseded in part, pointing at the intent\'s rulings', () => {
    const head = read('docs/ideas/world-gem-material.md').slice(0, 1400);
    expect(head).toMatch(/Superseded/);
    expect(head).toContain('intent/world-gem-material.md');
    expect(head).toContain('Supersedes the idea doc');
    expect(head).not.toMatch(/not started/i);
  });

  it('the intent doc\'s own header no longer says the spec and plan are not started', () => {
    const head = read('docs/intent/world-gem-material.md').slice(0, 900);
    expect(head).not.toMatch(/not started/i);
    expect(head).toContain('specs/WORLD_GEM_MATERIAL.md');
    expect(head).toContain('tasks/WORLD_GEM_MATERIAL.md');
  });

  it('CLAUDE.md\'s BUILDING_DESIGN.md reference line names the world gem material', () => {
    const line = read('CLAUDE.md').split('\n').find((l) => l.includes('`docs/BUILDING_DESIGN.md`'));
    expect(line).toBeDefined();
    expect(line).toMatch(/world gem material/i);
    expect(line).toContain('Phase 44');
  });

  it('keeps the reference line\'s earlier phases (42 districts, 43 jobs) in place', () => {
    const line = read('CLAUDE.md').split('\n').find((l) => l.includes('`docs/BUILDING_DESIGN.md`'))!;
    expect(line).toContain('Phase 42');
    expect(line).toContain('Phase 43');
  });
});
