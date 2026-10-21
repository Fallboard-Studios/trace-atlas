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

// Robot Effect Sends T6 (docs/specs/ROBOT_EFFECT_SENDS.md §1.4): a reservation site primes all five sends, so a robot is
// never re-reserved without its Grit, Shimmer and Double. Every updateRobotSends call in a file that reserves a voice
// passes the five keys; a file that only edits sends (an action, the session restore) passes the ones it changes.
const PRIME_KEYS = ['reverb', 'delay', 'grit', 'shimmer', 'double'] as const;

/** The argument object of every `.updateRobotSends(id, { ... })` call in `text`. */
function primeArguments(text: string): string[] {
  return [...text.matchAll(/\.updateRobotSends\([^,]+,\s*\{([^}]*)\}/g)].map((m) => m[1]);
}

describe('every reservation site primes all five sends (Robot Effect Sends T6)', () => {
  const reservingFiles = sourceFiles(srcRoot)
    .map((path) => ({ file: relative(srcRoot, path).split('\\').join('/'), text: withoutComments(readFileSync(path, 'utf8')) }))
    .filter(({ text }) => callCount(text, 'reserveVoice') > 0);

  it('reads the prime arguments of the reservation sites, so an empty scan cannot pass', () => {
    const primes = reservingFiles.flatMap(({ text }) => primeArguments(text));
    expect(reservingFiles.map(({ file }) => file).sort()).toEqual(['engine/AudioEngine.ts', 'systems/spawnSystem.ts']);
    expect(primes.length).toBeGreaterThanOrEqual(4);
  });

  it('passes reverb, delay, grit, shimmer and double at every prime in a file that reserves', () => {
    const missing = reservingFiles.flatMap(({ file, text }) =>
      primeArguments(text).flatMap((args) =>
        PRIME_KEYS.filter((key) => !new RegExp(`\\b${key}\\s*:`).test(args)).map((key) => `${file}: { ${args.trim()} } lacks ${key}`),
      ),
    );
    expect(missing).toEqual([]);
  });

  it('the argument reader itself finds a missing key (a prime of two keys fails)', () => {
    const args = primeArguments('x.updateRobotSends(robot.id, { reverb: robot.reverbSend, delay: robot.delaySend });');
    expect(args).toHaveLength(1);
    expect(PRIME_KEYS.filter((key) => !new RegExp(`\\b${key}\\s*:`).test(args[0]))).toEqual(['grit', 'shimmer', 'double']);
  });
});
