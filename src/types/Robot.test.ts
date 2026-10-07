// ========================================
// IMPORTS
// ========================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import { DockingState } from './Robot';

// ========================================
// HELPERS
// ========================================

const SRC = resolve(__dirname, '..');
const THIS_FILE = resolve(__filename);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// ========================================
// TESTS
// ========================================

describe('DockingState (Phase 43 §1.1 — renamed so Docking no longer means leaving the dock)', () => {
  it('is exactly Docked / Undocking / Active / Recalled', () => {
    expect(DockingState).toEqual({
      Docked: 'docked',
      Undocking: 'undocking',
      Active: 'active',
      Recalled: 'recalled',
    });
  });

  it('leaves no reference to the old Docking/Departing states anywhere in src/', () => {
    // `toHaveProperty('docking')` names the Robot.docking FIELD, which keeps its name — strip it
    // before looking for the old 'docking' state value.
    const stale = /DockingState\.(Docking|Departing)\b|\bbegin(Docking|Departing)\b|['"](docking|departing)['"]/;
    const offenders = walk(SRC)
      .filter((p) => p !== THIS_FILE)
      .filter((p) => stale.test(readFileSync(p, 'utf8').replace(/Property\('docking'\)/g, '')))
      .map((p) => relative(SRC, p))
      .sort();
    expect(offenders, `files still naming the old states:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
