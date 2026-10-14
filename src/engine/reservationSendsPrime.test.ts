// ========================================
// IMPORTS
// ========================================
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

// Robot Sends T4 (docs/tasks/ROBOT_SENDS.md, docs/specs/ROBOT_SENDS.md assumption 8): reserveVoice is not
// widened with the sends, so every place that reserves a voice must follow it with updateRobotSends or the
// robot comes back dry. This scan fails the build on a reservation site added without its prime.

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Comments out of the way: the doc comments here mention `reserveVoice(` and `updateRobotSends(` freely. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Method-call sites only (`.name(`), which is also what leaves each definition out of the count. */
function callCount(text: string, name: string): number {
  return (text.match(new RegExp(`\\.${name}\\(`, 'g')) ?? []).length;
}

const counts = sourceFiles(srcRoot).map((path) => {
  const text = withoutComments(readFileSync(path, 'utf8'));
  return {
    file: relative(srcRoot, path).split('\\').join('/'),
    reserves: callCount(text, 'reserveVoice'),
    primes: callCount(text, 'updateRobotSends'),
  };
});

describe('every reservation site primes the sends (Robot Sends T4)', () => {
  it('finds the known reservation sites, so an empty scan cannot pass', () => {
    const total = counts.reduce((sum, c) => sum + c.reserves, 0);
    expect(counts.find((c) => c.file === 'engine/AudioEngine.ts')?.reserves).toBe(2); // loadInstruments, reReserveVoice
    expect(counts.find((c) => c.file === 'systems/spawnSystem.ts')?.reserves).toBe(2); // spawn, reRegisterAllRobotsAudio
    expect(total).toBeGreaterThanOrEqual(4);
  });

  it('has at least as many updateRobotSends calls as reserveVoice calls in every non-test file', () => {
    const unprimed = counts.filter((c) => c.primes < c.reserves).map((c) => `${c.file}: ${c.reserves} reserve, ${c.primes} prime`);
    expect(unprimed).toEqual([]);
  });
});
