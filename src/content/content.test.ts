/**
 * The content guard (docs/specs/CONTENT_LAYER.md §1.7, Task 18) — what keeps the content module
 * honest after the migration:
 *   - every key is referenced from somewhere in src/ outside src/content/ (dead copy is a smell:
 *     either a consumer was lost, or the key was never wired);
 *   - every entry has a non-empty human name;
 *   - keys follow the grammar and start with an area from the closed list;
 *   - two entries in the same area never carry an identical human+lore pair (a duplicate concept).
 * The "no `[c]` placeholder anywhere" assertion lands with Task 17, the review gate that removes
 * them — until then the placeholders sit verbatim in src/content on purpose.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CONTENT, CONTENT_AREAS, type ContentKey } from './index';

const SRC = resolve(__dirname, '..');
const CONTENT_DIR = resolve(__dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every source file outside src/content (tests included — a key used only by a test is still a smell, but
 *  the guard is about app reachability, so tests are excluded here). */
const consumerSource = walk(SRC)
  .filter((p) => !p.startsWith(CONTENT_DIR) && !/\.test\.(ts|tsx)$/.test(p))
  .map((p) => ({ rel: relative(SRC, p), text: readFileSync(p, 'utf8') }));
const allConsumerText = consumerSource.map((f) => f.text).join('\n');

const keys = Object.keys(CONTENT) as ContentKey[];

describe('content guard', () => {
  it('every key is referenced from src/ outside src/content', () => {
    const unreferenced = keys.filter((k) => !allConsumerText.includes(`'${k}'`) && !allConsumerText.includes(`"${k}"`)).sort();
    expect(unreferenced, `unreferenced content keys:\n  ${unreferenced.join('\n  ')}`).toEqual([]);
  });

  it('every entry has a non-empty human name', () => {
    const empty = keys.filter((k) => !CONTENT[k].human || CONTENT[k].human.trim() === '');
    expect(empty).toEqual([]);
  });

  it('keys follow the grammar and start with an area from the closed list', () => {
    const grammar = /^[a-z]+(\.[a-zA-Z0-9]+){1,3}$/;
    const bad = keys.filter((k) => !grammar.test(k) || !(CONTENT_AREAS as readonly string[]).includes(k.split('.')[0]));
    expect(bad).toEqual([]);
  });

  it('keys are never surface-named (…Row / …Heading / …Accordion / …Panel)', () => {
    const surfaceNamed = keys.filter((k) => /\.(row|heading|accordion|panel)$/i.test(k));
    expect(surfaceNamed).toEqual([]);
  });

  it('no two entries in the same area carry an identical human + lore pair (duplicate concept)', () => {
    // Known, deliberate exceptions — parallel controls whose copy happens to match today. Listed in
    // the inventory's conflicts table so the review gate (Task 17) can give them distinct lore.
    const ALLOWED = new Set(['fleet.hpf.resonance ≡ fleet.lpf.resonance', 'fleet.lpf.resonance ≡ fleet.hpf.resonance']);
    const seen = new Map<string, ContentKey>();
    const dupes: string[] = [];
    for (const k of keys) {
      const e = CONTENT[k] as { human: string; lore?: string };
      if (e.lore === undefined) continue; // a bare human word (e.g. "Cutoff" on two filters) is allowed to recur
      const sig = `${k.split('.')[0]}|${e.human}|${e.lore}`;
      const prior = seen.get(sig);
      if (prior && !ALLOWED.has(`${prior} ≡ ${k}`)) dupes.push(`${prior} ≡ ${k}`);
      else if (!prior) seen.set(sig, k);
    }
    expect(dupes).toEqual([]);
  });
});
