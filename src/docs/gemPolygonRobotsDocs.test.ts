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

/** Spec §1.8, with the two dials stated as built (lights: layer gain + release; scale: register + attack). */
const GUARDRAIL =
  '- Visual Mapping: "A robot\'s body is seeded, permanent gem-polygon geometry (derived from `Robot.gemSeed`) ' +
  'in its `identityColor` — identity and seed, not audio. Audio reaches the body only through continuous dials ' +
  'defined in ROBOT_DESIGN.md: the two Top lights (layer gain and release), each Mid polygon\'s lit level (its ' +
  'layer\'s gain) and the body scale (octave register and attack). Day/night lightness and battery dimming remain ' +
  'the two overlay exceptions. No count, side, line or position may change on an audio edit."';

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

  it('Robot.ts\'s identityColor comment says identity colours the gem body and points at the gem seed', () => {
    const src = read('src/types/Robot.ts');
    const at = src.indexOf('identityColor: string;');
    const comment = src.slice(src.lastIndexOf('/**', at), at);
    expect(comment).toMatch(/gem/i);
    expect(comment).toContain('gemSeed');
    expect(comment).not.toMatch(/ADSR\/waveform-derived/);
  });
});
