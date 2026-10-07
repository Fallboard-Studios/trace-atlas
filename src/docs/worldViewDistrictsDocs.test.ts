import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/WORLD_VIEW_DISTRICTS.md Task 10 (D1 docs + roadmap). A docs task has no behaviour to
// test, so this makes its acceptance criteria executable: BUILDING_DESIGN.md's "Placement & Rows
// (runtime)" section is replaced by a "Districts" section (recipe shape, anchors, the ground-lock
// invariant, config.district), "Atmospheric Depth" is corrected to ROW_L_CAP "now applied", and a
// Derelict paragraph exists; PROCEDURAL_GENERATION.md's call-site table and Gotchas gain the new
// dataIds and the accepted world-generation break; ANIMATION_SYSTEM.md's scene-layers paragraph
// names terrain/water as static-layer content; the roadmap's Phase 42 entry carries D1 shipped +
// Not Doing; CLAUDE.md's BUILDING_DESIGN.md reference line mentions districts; the spec folds in
// the plan-time `config.district`/`getRecipeRow` correction.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

describe('BUILDING_DESIGN.md: Placement & Rows → Districts', () => {
  const doc = read('docs/BUILDING_DESIGN.md');

  it('no longer has the old "Placement & Rows (runtime)" heading', () => {
    expect(doc).not.toMatch(/^## Placement & Rows \(runtime\)$/m);
  });

  it('has a "Districts" heading', () => {
    expect(doc).toMatch(/^## Districts$/m);
  });

  it('the Districts section documents the recipe shape, anchors, the ground-lock invariant, and config.district', () => {
    const at = doc.indexOf('## Districts');
    const next = doc.indexOf('\n## ', at + 1);
    const section = doc.slice(at, next === -1 ? undefined : next);
    expect(section).toContain('DistrictRow');
    expect(section).toMatch(/anchor/i);
    expect(section).toMatch(/ground[- ]lock/i);
    expect(section).toContain('config.district');
    expect(section).toContain('getRecipeRow');
  });

  it('does not describe FACTORY_ROWS as the current placement mechanism', () => {
    expect(doc).not.toContain('FACTORY_ROWS');
    expect(doc).not.toContain('getRowConfig');
    expect(doc).not.toMatch(/\bplaceFactories\b/);
  });

  it('"Atmospheric Depth" is corrected to ROW_L_CAP and says the cap is now applied', () => {
    const at = doc.indexOf('### Atmospheric Depth');
    expect(at).toBeGreaterThan(-1);
    const next = doc.indexOf('\n## ', at);
    const section = doc.slice(at, next === -1 ? undefined : next);
    expect(section).toContain('ROW_L_CAP');
    expect(section).toMatch(/now applied/i);
  });

  it('has a Derelict paragraph describing the render-time effect', () => {
    const at = doc.search(/^###? Derelict$/m);
    expect(at).toBeGreaterThan(-1);
    const section = doc.slice(at, doc.indexOf('\n## ', at) === -1 ? undefined : doc.indexOf('\n## ', at));
    expect(section).toMatch(/nightDepth/);
    expect(section).toMatch(/DERELICT_L_CAP|0\.55/);
  });
});

describe('PROCEDURAL_GENERATION.md: new dataIds and the accepted break', () => {
  const doc = read('docs/PROCEDURAL_GENERATION.md');

  it.each(["'locale.district'", "'terrain.ridge.run'", "'terrain.ground.run'", "'actor.derelict'"])(
    'the call-site table names %s',
    (dataId) => {
      expect(doc).toContain(dataId);
    },
  );

  it('a Gotcha records the accepted world-generation break from retiring FACTORY_ROWS', () => {
    const gotchasAt = doc.indexOf('## Gotchas');
    expect(gotchasAt).toBeGreaterThan(-1);
    const section = doc.slice(gotchasAt);
    expect(section).toMatch(/FACTORY_ROWS/);
    expect(section).toMatch(/break|breaking/i);
  });
});

describe('ANIMATION_SYSTEM.md: scene layers gain terrain/water', () => {
  const doc = read('docs/ANIMATION_SYSTEM.md');

  it('the scene-layers paragraph names terrain and water as static-layer content on the lighting tick', () => {
    const at = doc.indexOf('### Scene layers');
    expect(at).toBeGreaterThan(-1);
    const next = doc.indexOf('\n### ', at + 1);
    const section = doc.slice(at, next === -1 ? undefined : next);
    expect(section).toMatch(/terrain/i);
    expect(section).toMatch(/water/i);
    expect(section).toMatch(/lighting tick/i);
  });
});

describe('the roadmap: Phase 42 carries D1 shipped and a Not Doing list', () => {
  const roadmap = read('docs/todo/roadmap.md');
  const at = roadmap.indexOf('## 42. World View Districts');
  const next = roadmap.indexOf('\n## 43.', at);
  const phase = roadmap.slice(at, next === -1 ? undefined : next);

  it('the Phase 42 heading exists', () => {
    expect(at).toBeGreaterThan(-1);
  });

  it('records D1 as shipped, D2/D3 as planned', () => {
    expect(phase).toMatch(/D1[^.\n]*shipped/i);
    expect(phase).toMatch(/D2.*D3.*planned|D2\/D3.*planned/i);
  });

  it('has a Not Doing list carrying the spec/intent out-of-scope items', () => {
    expect(phase).toContain('### Not Doing');
    const notDoingAt = phase.indexOf('### Not Doing');
    const notDoing = phase.slice(notDoingAt).toLowerCase();
    for (const item of ['coast framing', 'legacy', 'saved', 'audio']) {
      expect(notDoing, `Not Doing mentions ${item}`).toContain(item);
    }
  });

  it('links intent, spec, plan and sketch', () => {
    for (const link of [
      'docs/intent/world-view-districts.md',
      'docs/specs/WORLD_VIEW_DISTRICTS.md',
      'docs/tasks/WORLD_VIEW_DISTRICTS.md',
      'docs/sketches/world-view-districts.html',
    ]) {
      expect(phase, `Phase 42 links ${link}`).toContain(link);
    }
  });
});

describe('CLAUDE.md: the BUILDING_DESIGN.md reference line mentions districts', () => {
  it.each(['CLAUDE.md', '.github/copilot-instructions.md'])('%s', (file) => {
    const line = read(file).split('\n').find((l) => l.includes('`docs/BUILDING_DESIGN.md`'));
    expect(line).toBeDefined();
    expect(line).toMatch(/district/i);
  });
});

describe('the spec folds in the plan-time config.district / getRecipeRow correction', () => {
  const spec = read('docs/specs/WORLD_VIEW_DISTRICTS.md');

  it('§1.2 names config.district alongside config.row', () => {
    const at = spec.indexOf('### 1.2 Recipes');
    const next = spec.indexOf('\n### 1.3', at);
    const section = spec.slice(at, next === -1 ? undefined : next);
    expect(section).toContain('config.district');
  });

  it('§1.8 names getRecipeRow(district, row)', () => {
    const at = spec.indexOf('### 1.8 Scenery actors');
    const next = spec.indexOf('\n### 1.9', at);
    const section = spec.slice(at, next === -1 ? undefined : next);
    expect(section).toContain('getRecipeRow');
  });
});
