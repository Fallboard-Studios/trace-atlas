import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/ROBOT_LIVE_VISUALS.md Tasks 12-13. A docs-only task has no behaviour to test, so this
// makes its acceptance criteria executable: (1) the guardrail amendment lands identically in both
// instruction files and documents exactly the window glass + lamp carve-out, (2) the stale "13 hue"
// doc line is gone everywhere, (3) the live docs name real code, and (4) the roadmap records Phase 36.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

describe('the guardrail amendment (Task 12)', () => {
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

  // Superseded by Phase 37 (src/docs/robotGreeblesDocs.test.ts "Task 8"): a second non-audio
  // layer (the seeded greeble set) joined identityColor, and the ROBOT_DESIGN.md heading this
  // test originally pinned ("Identity layer") was renamed to "Non-audio layers" to hold both.
  // Kept here, loosened to what's still true post-rename, rather than deleted outright.
  it('the guardrail still names identityColor on window glass + lamp (now alongside a second non-audio layer)', () => {
    const line = visualMappingLine(claudeMd);
    expect(line).toContain('identityColor');
    expect(line).toContain('window');
    expect(line).toContain('lamp');
  });

  it('ROBOT_DESIGN.md documents the window glass + lamp identity-colour carve-out (now under "Non-audio layers")', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    const at = doc.indexOf('## Non-audio layers');
    expect(at, 'Non-audio layers section exists').toBeGreaterThan(-1);
    const nextHeading = doc.indexOf('\n## ', at + 1);
    const section = doc.slice(at, nextHeading === -1 ? undefined : nextHeading);
    expect(section).toContain('window glass');
    expect(section).toContain('lamp');
  });

  it('the Forbidden Patterns entry scopes the static-palette ban to the body, carving out identityColor', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    const at = doc.indexOf('## Forbidden Patterns');
    expect(at).toBeGreaterThan(-1);
    const section = doc.slice(at);
    expect(section).toMatch(/static\/fixed color palette.*\*\*body\*\*/i);
    expect(section).toContain('identityColor');
  });

  it('no live doc or instruction file still says "13 hue" (now 18, Task 12)', () => {
    for (const doc of ['CLAUDE.md', '.github/copilot-instructions.md', 'docs/ROBOT_DESIGN.md']) {
      expect(read(doc), doc).not.toMatch(/13 hue/);
    }
  });

  it('spawnSystem.ts and Robot.ts no longer say "13 hue" (now 18)', () => {
    expect(read('src/systems/spawnSystem.ts')).not.toMatch(/13 hue/);
    expect(read('src/types/Robot.ts')).not.toMatch(/13 hue/);
  });

  it('Robot.ts\'s identityColor comment documents the window glass + lamp carve-out, not "UI chrome only"', () => {
    const file = read('src/types/Robot.ts');
    const at = file.indexOf('identityColor: string;');
    const commentStart = file.lastIndexOf('/**', at);
    const comment = file.slice(commentStart, at);
    expect(comment).toContain('window glass');
    expect(comment).toContain('lamp');
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

describe('live docs carry no stale visualAudioMap claims (Task 13)', () => {
  // Historical records, deliberately exempt: the plan/spec for THIS removal (describing the old
  // state as the thing being removed), the idea/intent one-pagers (interview-stage records that
  // keep their original content, same precedent as world-palette-pull.md's), and the roadmap
  // entry (a record of what shipped, same treatment Phase 35's entry gives the set-aside hull).
  const exempt = new Set([
    'docs/specs/ROBOT_LIVE_VISUALS.md',
    'docs/tasks/ROBOT_LIVE_VISUALS.md',
    'docs/ideas/robot-visual-rework.md',
    'docs/intent/robot-live-visuals.md',
    'docs/todo/roadmap.md',
  ]);

  const docsWithMentions = [...allDocFiles(), 'CLAUDE.md', '.github/copilot-instructions.md']
    .filter((doc) => !doc.startsWith('docs/specs/archive/') && !doc.startsWith('docs/tasks/archive/'))
    .filter((doc) => !exempt.has(doc))
    .filter((doc) => read(doc).includes('visualAudioMap'));

  it('no live reference doc still names visualAudioMap as current', () => {
    expect(docsWithMentions, docsWithMentions.join(', ')).toEqual([]);
  });
});

describe('the live docs name real code (Task 13)', () => {
  const symbols: Array<[symbol: string, file: string]> = [
    ['bodyShapeFromAdsr', 'src/components/robot/robotVisualHelpers.ts'],
    ['calculateBodyScale', 'src/components/robot/robotVisualHelpers.ts'],
    ['calculateLampIntensity', 'src/components/robot/robotVisualHelpers.ts'],
    ['BODY_SCALE_MIN', 'src/components/robot/robotVisualHelpers.ts'],
    ['LAMP_MIN', 'src/components/robot/robotVisualHelpers.ts'],
    ['BODY_NORMALISER', 'src/components/robot/robotVisualHelpers.ts'],
  ];

  it.each(symbols)('%s exists in %s', (symbol, file) => {
    expect(existsSync(resolve(repoRoot, file)), `${file} exists`).toBe(true);
    expect(read(file), `${file} defines ${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`));
  });

  it('docs/ROBOT_DESIGN.md names every one of the live-mapping symbols above', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    for (const [symbol] of symbols) expect(doc, `ROBOT_DESIGN.md names ${symbol}`).toContain(symbol);
  });
});

describe('the roadmap records Phase 36 (Task 13)', () => {
  it('has a Phase 36 — Robot Live Visuals entry linking idea, intent, spec and plan', () => {
    const roadmap = read('docs/todo/roadmap.md');
    expect(roadmap).toMatch(/^## 36\. Robot Live Visuals$/m);
    const phase = roadmap.slice(roadmap.indexOf('## 36. Robot Live Visuals'));
    expect(phase).toContain('docs/ideas/robot-visual-rework.md');
    expect(phase).toContain('docs/intent/robot-live-visuals.md');
    expect(phase).toContain('docs/specs/ROBOT_LIVE_VISUALS.md');
    expect(phase).toContain('docs/tasks/ROBOT_LIVE_VISUALS.md');
    expect(phase).toContain('### About');
    expect(phase).toContain('### Not Doing');
  });
});

describe('intent and spec carry Shipped headers (Task 13)', () => {
  it('docs/intent/robot-live-visuals.md is marked Shipped, linking the spec and plan', () => {
    const doc = read('docs/intent/robot-live-visuals.md');
    expect(doc).toMatch(/^> \*\*Shipped \(roadmap Phase 36/m);
    expect(doc).toContain('docs/specs/ROBOT_LIVE_VISUALS.md');
    expect(doc).toContain('docs/tasks/ROBOT_LIVE_VISUALS.md');
  });

  it('docs/specs/ROBOT_LIVE_VISUALS.md is marked Shipped', () => {
    const doc = read('docs/specs/ROBOT_LIVE_VISUALS.md');
    expect(doc).toMatch(/\*\*Shipped \(roadmap Phase 36/);
  });

  it('the series one-pager ticks branch 1 (live visuals) as shipped', () => {
    const doc = read('docs/ideas/robot-visual-rework.md');
    const at = doc.indexOf('**Live visuals**');
    expect(at, 'branch 1 entry exists').toBeGreaterThan(-1);
    const entry = doc.slice(at, doc.indexOf('\n2.', at));
    expect(entry).toMatch(/shipped/i);
  });
});
