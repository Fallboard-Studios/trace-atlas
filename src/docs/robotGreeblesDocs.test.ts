import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/ROBOT_GREEBLES.md Tasks 8-9. A docs-only task has no behaviour to test, so this
// makes its acceptance criteria executable: (1) the second guardrail carve-out lands identically
// in both instruction files and documents exactly the two non-audio layers (identity colour and
// the greeble set), (2) the live docs name real code, and (3) the roadmap records Phase 37.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

describe('the second guardrail carve-out (Task 8)', () => {
  const claudeMd = read('CLAUDE.md');
  const copilotMd = read('.github/copilot-instructions.md');

  function visualMappingLine(text: string): string {
    const line = text.split('\n').find((l) => l.trimStart().startsWith('- Visual Mapping:'));
    expect(line, 'a Visual Mapping guardrail line exists').toBeDefined();
    return line!;
  }

  it('CLAUDE.md and .github/copilot-instructions.md carry an identical Visual Mapping guardrail line', () => {
    expect(visualMappingLine(claudeMd)).toBe(visualMappingLine(copilotMd));
  });

  it('the guardrail names both non-audio layers: identityColor (window + lamp) and the seeded greeble set', () => {
    const line = visualMappingLine(claudeMd);
    expect(line).toContain('identityColor');
    expect(line).toContain('window');
    expect(line).toContain('lamp');
    expect(line).toContain('greebles');
    expect(line).toContain('Non-audio layers');
  });

  it('ROBOT_DESIGN.md has a "Non-audio layers" section (renamed from "Identity layer") naming exactly two layers', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    expect(doc).not.toContain('## Identity layer');
    const at = doc.indexOf('## Non-audio layers');
    expect(at, 'Non-audio layers section exists').toBeGreaterThan(-1);
    const nextHeading = doc.indexOf('\n## ', at + 1);
    const section = doc.slice(at, nextHeading === -1 ? undefined : nextHeading);
    expect(section).toContain('window glass');
    expect(section).toContain('lamp');
    expect(section).toContain('greeble');
  });

  it('the Forbidden Patterns section names both non-audio exceptions (colour and shape/placement)', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    const at = doc.indexOf('## Forbidden Patterns');
    expect(at).toBeGreaterThan(-1);
    const section = doc.slice(at);
    expect(section).toMatch(/identityColor/);
    expect(section).toMatch(/greeble/i);
    expect(section).toContain('Non-audio layers');
  });
});

/** Every .md file under docs/, recursively, relative to repoRoot with forward slashes. */
function allDocFiles(dir = 'docs'): string[] {
  const abs = resolve(repoRoot, dir);
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) return allDocFiles(rel);
    return rel.endsWith('.md') ? [rel] : [];
  });
}

describe('live docs carry no stale "Identity layer" claim (Task 8/9)', () => {
  // Historical records, deliberately exempt: the spec/plan for this and the prior phase
  // (describing the old heading as part of their own survey/history), the idea/intent
  // one-pagers, and the roadmap (a record of what shipped under the old name at the time).
  const exempt = new Set([
    'docs/specs/ROBOT_LIVE_VISUALS.md',
    'docs/tasks/ROBOT_LIVE_VISUALS.md',
    'docs/specs/ROBOT_GREEBLES.md',
    'docs/tasks/ROBOT_GREEBLES.md',
    'docs/ideas/robot-visual-rework.md',
    'docs/intent/robot-live-visuals.md',
    'docs/intent/robot-greebles.md',
    'docs/todo/roadmap.md',
  ]);

  const docsWithStaleHeading = allDocFiles()
    .filter((doc) => !doc.startsWith('docs/specs/archive/') && !doc.startsWith('docs/tasks/archive/'))
    .filter((doc) => !exempt.has(doc))
    .filter((doc) => read(doc).includes('"Identity layer"'));

  it('no live reference doc still points at the old "Identity layer" heading', () => {
    expect(docsWithStaleHeading, docsWithStaleHeading.join(', ')).toEqual([]);
  });
});

describe('the live docs name real code (Task 9)', () => {
  const symbols: Array<[symbol: string, file: string]> = [
    ['generateGreebles', 'src/systems/spawnSystem.ts'],
    ['GREEBLE_COUNT_RANGE', 'src/systems/spawnSystem.ts'],
    ['GREEBLE_SLOTS', 'src/components/robot/greebleSlots.ts'],
    ['SLOT_COUNT', 'src/components/robot/greebleSlots.ts'],
    ['FIXTURE_BOXES', 'src/components/robot/greebleSlots.ts'],
    ['KIND_COUNT', 'src/components/robot/RobotGreebles.tsx'],
    ['RobotGreebles', 'src/components/robot/RobotGreebles.tsx'],
    ['hideGreebles', 'src/components/robot/RobotBody.tsx'],
  ];

  it.each(symbols)('%s exists in %s', (symbol, file) => {
    expect(existsSync(resolve(repoRoot, file)), `${file} exists`).toBe(true);
    expect(read(file), `${file} defines ${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`));
  });

  it('the three greeble dataIds are named in spawnSystem.ts', () => {
    const file = read('src/systems/spawnSystem.ts');
    for (const dataId of ['robot.greeble.count', 'robot.greeble.kind', 'robot.greeble.slot']) {
      expect(file, `spawnSystem.ts names ${dataId}`).toContain(dataId);
    }
  });

  it('docs/PROCEDURAL_GENERATION.md\'s dataId table names the three greeble dataIds', () => {
    const doc = read('docs/PROCEDURAL_GENERATION.md');
    for (const dataId of ['robot.greeble.count', 'robot.greeble.kind', 'robot.greeble.slot']) {
      expect(doc, `PROCEDURAL_GENERATION.md names ${dataId}`).toContain(dataId);
    }
  });

  it('docs/ROBOT_DESIGN.md names every one of the live greeble symbols above', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    for (const [symbol] of symbols) expect(doc, `ROBOT_DESIGN.md names ${symbol}`).toContain(symbol);
  });
});

describe('the roadmap records Phase 37 (Task 9)', () => {
  it('has a Phase 37 — Robot Greebles entry linking intent, spec, plan and sketch', () => {
    const roadmap = read('docs/todo/roadmap.md');
    expect(roadmap).toMatch(/^## 37\. Robot Greebles$/m);
    const phase = roadmap.slice(roadmap.indexOf('## 37. Robot Greebles'));
    expect(phase).toContain('docs/intent/robot-greebles.md');
    expect(phase).toContain('docs/specs/ROBOT_GREEBLES.md');
    expect(phase).toContain('docs/tasks/ROBOT_GREEBLES.md');
    expect(phase).toContain('docs/sketches/robot-greebles.html');
    expect(phase).toContain('### About');
    expect(phase).toContain('### Not Doing');
  });
});

describe('intent, spec and sketch carry Shipped headers (Task 9)', () => {
  it('docs/intent/robot-greebles.md is marked Shipped, linking the spec and plan', () => {
    const doc = read('docs/intent/robot-greebles.md');
    expect(doc).toMatch(/^> \*\*Shipped \(roadmap Phase 37/m);
    expect(doc).toContain('docs/specs/ROBOT_GREEBLES.md');
    expect(doc).toContain('docs/tasks/ROBOT_GREEBLES.md');
  });

  it('docs/specs/ROBOT_GREEBLES.md is marked Shipped', () => {
    const doc = read('docs/specs/ROBOT_GREEBLES.md');
    expect(doc).toMatch(/\*\*Shipped \(roadmap Phase 37/);
  });

  it('docs/sketches/robot-greebles.html records Crawford\'s sign-off, not PENDING', () => {
    const doc = read('docs/sketches/robot-greebles.html');
    expect(doc).not.toContain('PENDING CRAWFORD SIGN-OFF');
    expect(doc).toMatch(/Shipped/i);
  });

  it('the series one-pager ticks branch 2 (greebles) as shipped', () => {
    const doc = read('docs/ideas/robot-visual-rework.md');
    const at = doc.indexOf('**Greebles**');
    expect(at, 'branch 2 entry exists').toBeGreaterThan(-1);
    const entry = doc.slice(at, doc.indexOf('\n3.', at));
    expect(entry).toMatch(/shipped/i);
  });
});
