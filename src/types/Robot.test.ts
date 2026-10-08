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

describe('the legacy wandering and job scorer are gone (Phase 43 Task 24)', () => {
  it('lifecycleVisuals.ts and idleSystem.ts no longer exist', () => {
    const files = walk(SRC).map((p) => relative(SRC, p).replace(/\\/g, '/'));
    expect(files.filter((f) => /^systems\/(lifecycleVisuals|idleSystem)\.(test\.)?ts$/.test(f))).toEqual([]);
  });

  it('no file in src/ names a deleted identifier or the retired idle.target.* dataIds', () => {
    const stale = new RegExp(
      '\\b(lifecycleVisuals|idleSystem|RobotState|scoreJobAffinities|assignJob|JOB_MAX_ROBOTS_PER_TYPE|' +
        'BATTERY_LOWER_THIRD_THRESHOLD|pickExitDestination|pickDestination|initRobotIdleCounter|handleRobotIdle|' +
        'handleRobotArrival|cancelPendingIdleDelay)\\b|idle\\.target\\.',
    );
    // The J2 docs test (Task 27) names them too: it checks ROBOT_LIFECYCLE.md keeps them only in
    // its "Removed in Phase 43" history section.
    const docsTest = resolve(SRC, 'docs', 'robotJobsJ2Docs.test.ts');
    const offenders = walk(SRC)
      .filter((p) => p !== THIS_FILE && p !== docsTest)
      .filter((p) => stale.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p))
      .sort();
    expect(offenders, `files still naming legacy identifiers:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
