import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/todo/roadmap.md item 48 (One Day Clock). A docs task has no behaviour to test, so this makes
// its acceptance criteria executable: (1) the in-world day is described as wall-clock everywhere the
// repo states the rule, (2) the living docs name none of the symbols the phase deleted, and (3) the
// docs that describe the beat clock, the lighting helpers and the stores say what the code now does.
// The deleted names are assembled from fragments so a repo-wide grep for them under src/ stays clean.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

/** The living docs this phase rewrote. Scoped to these (not every doc) so a future doc that mentions
 *  an old name in passing does not fail the suite. History lives in specs, tasks, intent and the roadmap. */
const REWRITTEN_DOCS = [
  'docs/AUDIO_SYSTEM.md',
  'docs/BEAT_CLOCK.md',
  'docs/BUILDING_DESIGN.md',
  'docs/CONTRIBUTION_GUIDE.md',
  'docs/MELODY_SYSTEM.md',
  'docs/ROBOT_LIFECYCLE.md',
  'docs/UI_SHELL.md',
];

// DUPLICATE_VALUE_AUDIT.md is a ledger of what was found and fixed; it is allowed to name the
// constant it records as superseded (asserted separately below).
const LEDGER = 'docs/DUPLICATE_VALUE_AUDIT.md';

describe('the in-world day is wall-clock in every statement of the rule', () => {
  const claudeLine = (text: string) => text.split('\n').find((l) => l.startsWith('- Melody Logic:')) ?? '';

  it.each(['CLAUDE.md', '.github/copilot-instructions.md'])('%s: the Melody Logic guardrail says wall-clock, not 96 measures', (file) => {
    const line = claudeLine(read(file));
    expect(line, `${file} has a Melody Logic line`).not.toBe('');
    expect(line).toContain('note indices (0..7)');
    expect(line).toMatch(/wall-clock/);
    expect(line).toContain('DAY_DURATION_MS');
    expect(line).toMatch(/never tempo/);
    expect(line).not.toMatch(/96/);
  });

  it('CLAUDE.md and the Copilot instructions carry the same guardrail line', () => {
    expect(claudeLine(read('CLAUDE.md'))).toBe(claudeLine(read('.github/copilot-instructions.md')));
  });
});

describe('the rewritten docs name none of what the phase deleted, and never say measures make a day', () => {
  const deletedNames = [
    ['get', 'CurrentHour'],
    ['MEASURES_PER', '_HOUR'],
    ['DAY_CYCLE', '_MEASURES'],
    ['light', 'Measure'],
    ['gridUnitsTo', 'Duration'],
    ['load', 'ToLimits'],
    ['with', 'LoadParam'],
    ['is', 'WarmHue'],
    ['nearestAccent', 'Index'],
    ['attachFlicker', 'Animation'],
    ['pickSilhouette', 'Fill'],
    ['assertIn', 'ViewBox'],
    ['lastInteraction', 'Measure'],
    ['Locale.current', 'Measure'],
    ['96', ' measures'],
    ['96', '-measure'],
    ['0', '..95'],
    ['0', '–95'],
  ].map((parts) => parts.join(''));

  it.each(REWRITTEN_DOCS)('%s names no deleted symbol and no measure-based day', (doc) => {
    const text = read(doc);
    for (const name of deletedNames) expect(text, `${doc} mentions ${name}`).not.toContain(name);
  });

  it('the duplicate-value ledger records item 2 as superseded by the One Day Clock phase', () => {
    const text = read(LEDGER);
    const item2 = text.slice(text.indexOf('### 2.'), text.indexOf('### 3.'));
    expect(item2).toMatch(/superseded/i);
    expect(item2).toMatch(/One Day Clock|roadmap 48|Phase 48/i);
  });
});

describe('the docs say what the code now does', () => {
  it('BEAT_CLOCK.md: listeners get the real, monotonic measure and nothing derives an hour from it', () => {
    const text = read('docs/BEAT_CLOCK.md');
    expect(text).toMatch(/real, monotonic measure/);
    expect(text).toMatch(/wall-clock/);
    expect(text).not.toMatch(/wrapped/i);
    expect(text).not.toMatch(/getCurrent\w*Hour/);
  });

  it('AUDIO_SYSTEM.md: musical time is measures and beats; the day is not one of them', () => {
    const text = read('docs/AUDIO_SYSTEM.md');
    expect(text).toMatch(/1 measure = 4 beats/);
    expect(text).toMatch(/wall-clock/);
  });

  it('BUILDING_DESIGN.md: the lighting helpers take the locale hour; the flicker period is in hours', () => {
    const text = read('docs/BUILDING_DESIGN.md');
    const section = text.slice(text.indexOf('## Day/Night Cycle'), text.indexOf('### Front Corner Rendering'));
    expect(section).toContain('getLighting(hour)');
    expect(section).toContain('computeLocaleHour');
    expect(section).toContain('DAY_DURATION_MS');
    expect(text).toContain('flickerPhase');
    expect(text).toContain('getFlickerEpoch');
  });

  it('UI_SHELL.md: the uiStore field list names none of the retired dials', () => {
    const text = read('docs/UI_SHELL.md');
    for (const dial of ['activeView', 'isFullscreen', '`theme`', '`language`']) {
      expect(text, `UI_SHELL.md still lists ${dial}`).not.toContain(dial);
    }
  });

  it('CONTRIBUTION_GUIDE.md: localeStore is not described as holding a measure', () => {
    const line = read('docs/CONTRIBUTION_GUIDE.md').split('\n').find((l) => l.includes('`localeStore`')) ?? '';
    expect(line).not.toContain('`current' + 'Measure`');
  });

  it('SESSION_STORAGE.md still lists loadSession — the Off screen calls it, so item 48 leaves it alone', () => {
    expect(read('docs/SESSION_STORAGE.md')).toContain('`loadSession(name)`');
  });
});
