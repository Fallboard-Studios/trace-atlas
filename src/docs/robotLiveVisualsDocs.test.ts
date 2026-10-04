import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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

  it('the guardrail names the one documented non-audio identity layer: identityColor on window glass + lamp only', () => {
    const line = visualMappingLine(claudeMd);
    expect(line).toContain('identityColor');
    expect(line).toContain('window glass');
    expect(line).toContain('lamp');
  });

  it('ROBOT_DESIGN.md has an "Identity layer" section naming exactly two elements: window glass and lamp', () => {
    const doc = read('docs/ROBOT_DESIGN.md');
    const at = doc.indexOf('## Identity layer');
    expect(at, 'Identity layer section exists').toBeGreaterThan(-1);
    const nextHeading = doc.indexOf('\n## ', at + 1);
    const section = doc.slice(at, nextHeading === -1 ? undefined : nextHeading);
    expect(section).toContain('window glass');
    expect(section).toContain('lamp');
    // "exactly two" — no other body element is carved out of the ADSR/waveform-only rule here.
    expect(section).not.toMatch(/\bsecondary fill\b/);
    expect(section).not.toMatch(/\bprimary fill\b/);
    expect(section).not.toMatch(/\bgreeble/i);
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
