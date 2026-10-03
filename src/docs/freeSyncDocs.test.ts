import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/FREE_SYNC_TOGGLE.md Task 15. A docs task has no behaviour to test, so this makes its two
// acceptance criteria executable: (1) the LIVE docs no longer carry the claims the Free | Sync work made
// stale, and (2) every code symbol a doc now leans on exists in the source file it is attributed to
// ("every doc claim names a file and function that exist"). Archived specs/tasks/intent docs and the
// dated investigation notes under docs/todo are history, not live claims, and are deliberately out of scope.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

/** The living docs: docs/*.md and docs/reference/*.md (the CLAUDE.md reference set). */
const liveDocs = ['docs', 'docs/reference'].flatMap((dir) =>
  readdirSync(resolve(repoRoot, dir))
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(dir, name).replace(/\\/g, '/')),
);

describe('live docs carry no stale locale-BPM claims', () => {
  // BPM moved from the locale to the Attenuation Style (spec §1.7): the functions below were deleted,
  // and the tempo is no longer seeded per locale.
  // Assembled from fragments on purpose: docs/tasks/FREE_SYNC_TOGGLE.md Task 4's criterion is that a
  // repo-wide grep for these names under src/ returns nothing, and this file is under src/.
  const deletedNames = [
    ['generate', 'LocaleBpm'],
    ['locale', 'BpmSeed'],
    ['syncBpmTo', 'CurrentLocale'],
    ['LOCALE_BPM_', 'SEED_RANGE'],
  ].map((parts) => parts.join(''));

  it.each(liveDocs)('%s names no deleted locale-BPM symbol', (doc) => {
    const text = read(doc);
    for (const name of deletedNames) expect(text, `${doc} mentions ${name}`).not.toContain(name);
  });

  it.each(liveDocs)('%s does not say the tempo is seeded per locale', (doc) => {
    const text = read(doc);
    expect(text, doc).not.toMatch(/seeded per[- ]locale/i);
    expect(text, doc).not.toMatch(/locale-seeded(,| transport| tempo| BPM)/i);
  });

  it('PROCEDURAL_GENERATION.md no longer lists BPM among the values a locale pin leaves random', () => {
    expect(read('docs/PROCEDURAL_GENERATION.md')).not.toMatch(/robots, BPM, temperature/);
  });

  it('GLOBAL_CHAIN_GRID.md gives Delay Time its real 0–10 s range, not the stale 0–1', () => {
    const row = read('docs/reference/GLOBAL_CHAIN_GRID.md')
      .split('\n')
      .find((line) => line.startsWith('| Delay |') && line.includes('delayTime'));
    expect(row).toBeDefined();
    expect(row).toContain('seconds, 0–10');
    expect(row).not.toMatch(/seconds, 0–1(?!\d)/);
  });
});

/** Every code symbol a doc now names, and the source file it must really live in. */
const SYNC_CLAIMS: Array<{ doc: string; symbols: Array<[symbol: string, file: string]> }> = [
  {
    doc: 'docs/AUDIO_SYSTEM.md',
    symbols: [
      ['generateAttenuationStyleBpm', 'src/utils/bpmSeed.ts'],
      ['BPM_SEED_RANGE', 'src/utils/bpmSeed.ts'],
      ['regenerateBpmFromSeed', 'src/stores/audioStore.ts'],
      ['reapplyTempoSyncedValues', 'src/stores/audioStore.ts'],
      ['applyGlobalAudioToEngine', 'src/stores/audioStore.ts'],
      ['setLfoBankLaneSyncMode', 'src/stores/audioStore.ts'],
      ['replaceLfoBankLane', 'src/stores/audioStore.ts'],
      ['setDelaySyncMode', 'src/stores/audioStore.ts'],
      ['resolveLaneRateHz', 'src/utils/tempoSync.ts'],
      ['resolveLaneForEngine', 'src/utils/tempoSync.ts'],
      ['resolveLfoBankForEngine', 'src/utils/tempoSync.ts'],
      ['resolveDelayTimeSeconds', 'src/utils/tempoSync.ts'],
      ['isLaneRunning', 'src/utils/tempoSync.ts'],
      ['allowedLaneNoteValues', 'src/utils/tempoSync.ts'],
      ['allowedDelayNoteValues', 'src/utils/tempoSync.ts'],
      ['RATE_DRIFT_APPLIES_TO_SYNCED', 'src/utils/tempoSync.ts'],
      ['pickSeedNoteValue', 'src/utils/tempoSync.ts'],
      ['NOTE_VALUES', 'src/data/noteValues.ts'],
      ['isNoteValue', 'src/data/noteValues.ts'],
      ['LFO_BANK_SYNC_ODDS', 'src/utils/globalAudioSeed.ts'],
      ['LFO_BANK_SYNC_BAND_ORDER', 'src/utils/globalAudioSeed.ts'],
      ['DELAY_SYNC_ODDS', 'src/utils/globalAudioSeed.ts'],
      ['DELAY_TIME_RANGE_SECONDS', 'src/types/globalAudio.ts'],
    ],
  },
  { doc: 'docs/PROCEDURAL_GENERATION.md', symbols: [['generateAttenuationStyleBpm', 'src/utils/bpmSeed.ts']] },
  { doc: 'docs/DUPLICATE_VALUE_AUDIT.md', symbols: [['generateAttenuationStyleBpm', 'src/utils/bpmSeed.ts']] },
  {
    doc: 'docs/reference/GLOBAL_CHAIN_GRID.md',
    symbols: [
      ['DELAY_TIME_RANGE_SECONDS', 'src/types/globalAudio.ts'],
      ['resolveDelayTimeSeconds', 'src/utils/tempoSync.ts'],
    ],
  },
  {
    doc: 'docs/reference/SLIDER_VALUES.md',
    symbols: [
      ['bpmSeed.ts', 'src/utils/bpmSeed.ts'],
      ['LFO_BANK_SYNC_ODDS', 'src/utils/globalAudioSeed.ts'],
      ['DELAY_SYNC_ODDS', 'src/utils/globalAudioSeed.ts'],
      ['NOTE_VALUES', 'src/data/noteValues.ts'],
    ],
  },
  {
    doc: 'docs/COMPONENT_LIBRARY.md',
    symbols: [
      ['TempoSyncSlider', 'src/components/ui/controls/TempoSyncSlider.tsx'],
      ['TempoSyncToggle', 'src/components/ui/controls/TempoSyncToggle.tsx'],
      ['ToggleFacade', 'src/components/ui/controls/ToggleFacade.tsx'],
      ['formatValue', 'src/types/controls.ts'],
    ],
  },
  {
    doc: 'docs/SESSION_STORAGE.md',
    symbols: [
      ['sanitizeLaneSync', 'src/utils/sessionDiff.ts'],
      ['sanitizeDelaySync', 'src/utils/sessionDiff.ts'],
      ['NOTE_VALUE_BY_CODE', 'src/utils/sessionShareUtils.ts'],
      ['isNoteValue', 'src/data/noteValues.ts'],
    ],
  },
];

describe('the Free | Sync docs name real code', () => {
  for (const { doc, symbols } of SYNC_CLAIMS) {
    describe(doc, () => {
      it.each(symbols)('names %s, which exists in %s', (symbol, file) => {
        expect(existsSync(resolve(repoRoot, file)), `${file} exists`).toBe(true);
        expect(read(doc), `${doc} names ${symbol}`).toContain(symbol);
        // The symbol (or, for a file-name claim, the file itself) really is in the source file it is credited to.
        if (symbol.includes('.')) expect(file.endsWith(symbol), `${file} is ${symbol}`).toBe(true);
        else expect(read(file), `${file} defines ${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`));
      });
    });
  }
});

describe('the roadmap and the superseded BPM spec', () => {
  it('the roadmap has a Phase 33 — Free | Sync Toggle entry, with its Not Doing list', () => {
    const roadmap = read('docs/todo/roadmap.md');
    expect(roadmap).toMatch(/^## 33\. Free \| Sync Toggle$/m);
    const phase = roadmap.slice(roadmap.indexOf('## 33. Free | Sync Toggle'));
    expect(phase).toContain('### Not Doing');
    // Every item the spec's §6 puts out of scope.
    // Case-insensitive: a bullet may start with the item, capitalised.
    for (const item of ['Reverb', 'Phrase Length', 'per-target', 'Off step', 'multi-bar dotted', 're-prime']) {
      expect(phase.toLowerCase(), `Not Doing mentions ${item}`).toContain(item.toLowerCase());
    }
    expect(phase).toContain('docs/specs/FREE_SYNC_TOGGLE.md');
    expect(phase).toContain('docs/tasks/FREE_SYNC_TOGGLE.md');
  });

  it('the roadmap records that every unsaved world gets a new tempo (spec §7 risk 1)', () => {
    const roadmap = read('docs/todo/roadmap.md');
    const phase = roadmap.slice(roadmap.indexOf('## 33. Free | Sync Toggle'));
    expect(phase).toMatch(/new tempo/i);
  });

  it('BPM_CONTROL.md carries a dated superseded note atop §1.3, linking the Sync spec, and §1.3 is otherwise untouched', () => {
    const spec = read('docs/specs/archive/BPM_CONTROL.md');
    const at = spec.indexOf('### 1.3 Where seeding happens');
    expect(at).toBeGreaterThan(-1);
    const afterHeading = spec.slice(at, at + 900);
    expect(afterHeading).toMatch(/Superseded 2026-10-\d\d/);
    expect(afterHeading).toContain('FREE_SYNC_TOGGLE.md');
    // Not a rewrite: the original reasoning is still there, below the note.
    expect(spec).toContain('mirrors `dayStartTimestamp`');
    expect(spec).toContain('A subscription keyed on `currentAttenuationStyleId` would incorrectly reseed');
  });
});

describe('the Free | Sync task plan is ticked off', () => {
  const plan = read('docs/tasks/FREE_SYNC_TOGGLE.md');

  it('marks every task, 1 through 15, done', () => {
    for (let n = 1; n <= 15; n++) {
      expect(plan, `Task ${n}`).toMatch(new RegExp(`^- \\[x\\] \\*\\*Task ${n}:`, 'm'));
    }
  });

  it('leaves the manual checkpoints for Crawford (A, D, E) unticked — they are not mine to sign off', () => {
    for (const heading of ['Checkpoint A: Foundations + BPM', 'Checkpoint D: Seeded worlds carry Sync', 'Checkpoint E: Complete']) {
      const at = plan.indexOf(`### ${heading}`);
      expect(at, heading).toBeGreaterThan(-1);
      const section = plan.slice(at, plan.indexOf('\n###', at + 5) === -1 ? undefined : plan.indexOf('\n###', at + 5));
      expect(section, `${heading} still has an unticked box`).toMatch(/- \[ \]/);
    }
  });
});
