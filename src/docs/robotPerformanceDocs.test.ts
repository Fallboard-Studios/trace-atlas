import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MIN_LEAD, HUMANIZE_MAX_MS } from '@/constants';

// docs/todo/roadmap.md item 50.5 (Robot Performance), docs/tasks/ROBOT_PERFORMANCE.md Task 17. A docs task has
// no behaviour to test, so this makes its acceptance criteria executable (robotArticulationDocs.test.ts is the
// pattern):
//   (1) the source-scan guardrail: nothing on the robot body reads Dynamics, Rests, Accents, a rest, a mark or
//       Humanize (Visual Mapping: performance reaches the body through no dial);
//   (2) every symbol the spec and the updated docs cite exists in source, so a rename cannot leave a stale doc;
//   (3) the scheduling invariant: MIN_LEAD less the largest Humanize offset still leaves the 50 ms lead CLAUDE.md asks for;
//   (4) the docs say what the code now does (MELODY_SYSTEM's MelodyEvent block names `rest` and `mark`;
//       SESSION_STORAGE names the four persisted fields).
// Groups (1) to (3) are green from the moment Phase 3 lands. Group (4)'s doc-text cases are written against the
// text Task 19 produces, so a case is RED until Task 19 lands. That is intended.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

/** Every file under `relative` (or the file itself), recursively; tests, fixtures and non-code files excluded. */
function sourceFiles(relative: string): string[] {
  const absolute = resolve(repoRoot, relative);
  if (statSync(absolute).isFile()) return [relative];
  return readdirSync(absolute).flatMap((entry) => {
    const child = `${relative}/${entry}`;
    if (statSync(resolve(repoRoot, child)).isDirectory()) return sourceFiles(child);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [child] : [];
  });
}

/** Source with comments removed, so a comment that names a field is not a read of it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

// ========================================
// (1) THE SOURCE-SCAN GUARDRAIL
// ========================================

describe('nothing on the robot body reads a performance field (Visual Mapping is unchanged)', () => {
  const bodyFiles = [...sourceFiles('src/components/robot/gem'), ...sourceFiles('src/components/robot/RobotBody.tsx')];

  it('scans the gem folder and RobotBody, not an empty list', () => {
    expect(bodyFiles).toContain('src/components/robot/RobotBody.tsx');
    expect(bodyFiles).toContain('src/components/robot/gem/bodyLineDials.ts');
    expect(bodyFiles.length).toBeGreaterThan(5);
  });

  it('treats a comment as no read, and a code reference as a read (the stripper itself)', () => {
    expect(withoutComments('// dynamics is audio only\nconst a = 1;')).not.toMatch(/dynamics/);
    expect(withoutComments('/* event.mark */ const a = 1;')).not.toMatch(/\.mark\b/);
    expect(withoutComments('const a = robot.dynamics;')).toMatch(/\bdynamics\b/);
    expect(withoutComments('const b = event.rest;')).toMatch(/\.rest\b/);
  });

  it.each(bodyFiles)('%s reads none of dynamics, rests, accents, .rest, .mark, humanize', (file) => {
    const code = withoutComments(read(file));
    for (const name of ['dynamics', 'rests', 'accents', 'humanize']) {
      expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(code).not.toMatch(/\.rest\b/);
    expect(code).not.toMatch(/\.mark\b/);
  });
});

// ========================================
// (2) EVERY CITED SYMBOL EXISTS
// ========================================

describe('the named Robot Performance symbols are declared where the spec says they are', () => {
  const declared: [description: string, file: string, pattern: RegExp][] = [
    // Types
    ['ArticulationMark', 'src/types/Robot.ts', /export type ArticulationMark = 'accent' \| 'marcato' \| 'staccato' \| 'staccatissimo' \| 'tenuto';/],
    ['ARTICULATION_MARK_NAMES', 'src/types/Robot.ts', /export const ARTICULATION_MARK_NAMES: readonly ArticulationMark\[\]/],
    ['MelodyEvent.rest', 'src/types/Robot.ts', /\brest\?: number;/],
    ['MelodyEvent.mark', 'src/types/Robot.ts', /\bmark\?: ArticulationMark;/],
    ['Robot.dynamics', 'src/types/Robot.ts', /\bdynamics\?: number;/],
    ['Robot.rests', 'src/types/Robot.ts', /\brests\?: number;/],
    ['Robot.accents', 'src/types/Robot.ts', /\baccents\?: number;/],
    ['CompanyOptionsSnapshot.dynamics / rests / accents', 'src/types/Company.ts', /\bdynamics\?: number;\s*\n\s*rests\?: number;\s*\n\s*accents\?: number;/],
    ['RobotAudioOverrideDiff.dynamics / rests / accents', 'src/types/session.ts', /\bdynamics\?: number;\s*\n\s*rests\?: number;\s*\n\s*accents\?: number;/],
    ['SessionPayload.humanize', 'src/types/session.ts', /\bhumanize\?: number;/],
    // Constants
    ['PERFORMANCE_MIN', 'src/constants/index.ts', /export const PERFORMANCE_MIN = 0;/],
    ['PERFORMANCE_MAX', 'src/constants/index.ts', /export const PERFORMANCE_MAX = 100;/],
    ['HUMANIZE_MIN_MS', 'src/constants/index.ts', /export const HUMANIZE_MIN_MS = 0;/],
    ['HUMANIZE_MAX_MS', 'src/constants/index.ts', /export const HUMANIZE_MAX_MS = 20;/],
    ['MIN_SOUNDING_SECONDS', 'src/constants/index.ts', /export const MIN_SOUNDING_SECONDS\b/],
    // The articulation table
    ['ARTICULATION_MARKS', 'src/engine/articulation.ts', /export const ARTICULATION_MARKS: Record<ArticulationMark, \{ velocity: number; length: number \}>/],
    ['ACCENT_TIER_2', 'src/engine/articulation.ts', /export const ACCENT_TIER_2 = 34;/],
    ['ACCENT_TIER_3', 'src/engine/articulation.ts', /export const ACCENT_TIER_3 = 67;/],
    ['unlockedMarks', 'src/engine/articulation.ts', /export function unlockedMarks\(accents: number\)/],
    ['resolveArticulation', 'src/engine/articulation.ts', /export function resolveArticulation\(/],
    // The melody post-pass
    ['buildSeededPerformance', 'src/engine/melodyGenerator.ts', /export function buildSeededPerformance\(compositionSeed: number\)/],
    ['applyPerformanceMarks', 'src/engine/melodyGenerator.ts', /export function applyPerformanceMarks\(/],
    ['REST_MIN_FRACTION', 'src/engine/melodyGenerator.ts', /export const REST_MIN_FRACTION\b/],
    ['REST_SPAN', 'src/engine/melodyGenerator.ts', /export const REST_SPAN\b/],
    ['DEFAULT_DYNAMICS', 'src/engine/melodyGenerator.ts', /export const DEFAULT_DYNAMICS = 50;/],
    ['DEFAULT_RESTS', 'src/engine/melodyGenerator.ts', /export const DEFAULT_RESTS = 0;/],
    ['DEFAULT_ACCENTS', 'src/engine/melodyGenerator.ts', /export const DEFAULT_ACCENTS = 0;/],
    ['regenerateMelody applies the post-pass', 'src/engine/regenerateMelody.ts', /applyPerformanceMarks\(/],
    // The engine
    ['NoteParams.position', 'src/engine/AudioEngine.ts', /\bposition\?: number;/],
    ['NOTE_VELOCITY_BASELINE 0.8', 'src/engine/AudioEngine.ts', /const NOTE_VELOCITY_BASELINE = 0\.8;/],
    ['DYNAMICS_NEUTRAL', 'src/engine/AudioEngine.ts', /const DYNAMICS_NEUTRAL = 50;/],
    ['VELOCITY_PERIOD', 'src/engine/AudioEngine.ts', /const VELOCITY_PERIOD = 97;/],
    ['computeNoteVelocitySeeded', 'src/engine/AudioEngine.ts', /export function computeNoteVelocitySeeded\(robotId\?: string, position\?: number, robot\?: Robot\): number/],
    ['humanizeOffsetFor', 'src/engine/AudioEngine.ts', /function humanizeOffsetFor\(position: number\): \(robotId: string\) => number/],
    ['AudioEngine.setHumanize', 'src/engine/AudioEngine.ts', /\bsetHumanize\(ms: number\): void/],
    ['the click track is never humanized', 'src/engine/AudioEngine.ts', /\(clickTrack \? 0 : humanizeOffset\(robotId\)\)/],
    // Seeding
    ['DYNAMICS_SEED_RANGE', 'src/systems/spawnSystem.ts', /const DYNAMICS_SEED_RANGE = \{ min: 25, max: 75 \};/],
    ['RESTS_SEED_RANGE', 'src/systems/spawnSystem.ts', /const RESTS_SEED_RANGE = \{ min: 10, max: 60 \};/],
    ['ACCENTS_SEED_RANGE', 'src/systems/spawnSystem.ts', /const ACCENTS_SEED_RANGE = \{ min: 20, max: 80 \};/],
    ['RobotAudioBaseline.dynamics / rests / accents', 'src/systems/spawnSystem.ts', /\bdynamics: number;\s*\n\s*rests: number;\s*\n\s*accents: number;/],
    ['the robot.dynamics dataId', 'src/systems/spawnSystem.ts', /'robot\.dynamics'/],
    ['the robot.rests dataId', 'src/systems/spawnSystem.ts', /'robot\.rests'/],
    ['the robot.accents dataId', 'src/systems/spawnSystem.ts', /'robot\.accents'/],
    ['generateHumanize', 'src/utils/globalAudioSeed.ts', /export function generateHumanize\(attenuationStyleId: string, attenuationStyleName: string\): number/],
    ['the globalAudio.humanize dataId, drawn uniform', 'src/utils/globalAudioSeed.ts', /getUniformSeededVal\(noiseMap, 'globalAudio\.humanize'\)/],
    // The store
    ['audioStore.humanize', 'src/stores/audioStore.ts', /\bhumanize: number;/],
    ['audioStore.setHumanize', 'src/stores/audioStore.ts', /\bsetHumanize: \(ms: number\) => void;/],
    ['audioStore.setHumanize pushes the engine', 'src/stores/audioStore.ts', /AudioEngine\.setHumanize\(humanize\)/],
    ['localeStore clamps the three fields', 'src/stores/localeStore.ts', /for \(const performanceKey of \['dynamics', 'rests', 'accents'\] as const\)/],
    // Actions, UI, companies
    ['applyDynamics', 'src/systems/robotOptionsActions.ts', /export function applyDynamics\(robot: Robot, localeId: string, value: number\): void/],
    ['applyRests', 'src/systems/robotOptionsActions.ts', /export function applyRests\(robot: Robot, localeId: string, value: number\): void/],
    ['applyAccents', 'src/systems/robotOptionsActions.ts', /export function applyAccents\(robot: Robot, localeId: string, value: number\): void/],
    ['DYNAMICS_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const DYNAMICS_SCHEMA: SliderLinearSchema/],
    ['RESTS_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const RESTS_SCHEMA: SliderLinearSchema/],
    ['ACCENTS_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const ACCENTS_SCHEMA: SliderLinearSchema/],
    ['ARTICULATION_PANEL_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const ARTICULATION_PANEL_SCHEMA: DirectionalPanelSchema/],
    ['HUMANIZE_SCHEMA', 'src/data/audioRigConfig.ts', /export const HUMANIZE_SCHEMA: SliderLinearSchema/],
    ['resolveCompanyOptions falls back for the three', 'src/systems/companyOptions.ts', /dynamics: firstMember\.dynamics \?\? DEFAULT_DYNAMICS,\s*\n\s*rests: firstMember\.rests \?\? DEFAULT_RESTS,\s*\n\s*accents: firstMember\.accents \?\? DEFAULT_ACCENTS,/],
    ['useCompanyOptions onDynamicsChange', 'src/components/company/useCompanyOptions.ts', /\bonDynamicsChange: \(value: number\) => void;/],
    ['useCompanyOptions onRestsChange', 'src/components/company/useCompanyOptions.ts', /\bonRestsChange: \(value: number\) => void;/],
    ['useCompanyOptions onAccentsChange', 'src/components/company/useCompanyOptions.ts', /\bonAccentsChange: \(value: number\) => void;/],
    // Persistence and the share link
    ['sessionDiff restores the three only when finite', 'src/utils/sessionDiff.ts', /for \(const field of \['dynamics', 'rests', 'accents'\] as const\)/],
    ['sessionDiff restores humanize through setHumanize', 'src/utils/sessionDiff.ts', /useAudioStore\.getState\(\)\.setHumanize\(payload\.humanize\)/],
    ['CompactSessionPayload.hm', 'src/utils/sessionShareUtils.ts', /\bhm\?: SessionPayload\['humanize'\];/],
    ['CompactRobotOverrideDiff.dy', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bdy\?: number;/],
    ['CompactRobotOverrideDiff.rt', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\brt\?: number;/],
    ['CompactRobotOverrideDiff.ax', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bax\?: number;/],
  ];

  it.each(declared)('%s', (_description, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });
});

/** Every identifier in every non-test source file under src/. A whole-word set, not a substring search, so a
 *  renamed `applyPerformanceMarks` is not satisfied by an `applyPerformanceMarksX` that happens to contain it. */
const sourceIdentifiers = new Set(sourceFiles('src').flatMap((file) => read(file).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
const isInSource = (symbol: string) => sourceIdentifiers.has(symbol);

/** Words that are cited in backticks but are not, and should not be, names in this repo's source: third-party
 *  API members, names the spec records as deliberately NOT built, and file names. */
const NOT_REPO_SYMBOLS = new Set([
  // Tone members the engine reaches through, spelled in the spec's prose
  'triggerAttackRelease', 'toSeconds',
  // File names, not symbols: test files (sourceFiles skips *.test.ts) and the planning docs
  'robotPerformanceDocs', 'numericDuration', 'globalModulationDocs', 'ROBOT_PERFORMANCE', 'SLIDER_VALUES', 'ROBOT_DATA_GRID', 'MELODY_SYSTEM', 'AUDIO_SYSTEM',
  'SESSION_STORAGE', 'PROCEDURAL_GENERATION', 'ROBOT_DESIGN', 'LFO_LOAD_FIX', 'ROBOT_ARTICULATION', 'ROBOT_SENDS', 'ROBOT_PAN',
  'STEPPER_TO_SLIDER', 'AUDIO_LOAD_BUDGET', 'FREE_SYNC_TOGGLE', 'GLOBAL_COLOUR', 'GLOBAL_MODULATION_COLOUR',
]);

/** Inline backtick spans only (fenced blocks are illustrative sketches, covered by the table above). */
function citedSymbols(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  const identifiers = spans.flatMap((span) => span.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  // A code-shaped name only: camelCase with an inner capital, PascalCase, or UPPER_SNAKE. Plain words
  // ("robot", "id", "true", "number") are not claims about the source.
  // A trailing underscore is a prefix wildcard in prose (`DEFAULT_*`), not a name.
  const codeShaped = identifiers.filter(
    (word) =>
      !word.endsWith('_') &&
      (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(word)),
  );
  return [...new Set(codeShaped)].filter((word) => !NOT_REPO_SYMBOLS.has(word)).sort();
}

describe('every symbol the spec and the updated docs cite exists in source', () => {
  const spec = read('docs/specs/ROBOT_PERFORMANCE.md');
  const specDesign = spec.slice(spec.indexOf('## 1. Overview'), spec.indexOf('\n## 5.'));

  it('finds the spec sections it is scanning (§1 to §4), not an empty slice', () => {
    expect(specDesign.length).toBeGreaterThan(5000);
    expect(specDesign).toContain('### 1.3 Trigger time');
    expect(specDesign).toContain('## 4. Code Style');
  });

  it('extracts code-shaped names and drops plain words and listed non-symbols (the extractor itself)', () => {
    const extracted = citedSymbols('`applyRests` and `robot` and `DEFAULT_*` and `toSeconds` and `HUMANIZE_MAX_MS`');
    expect(extracted).toEqual(['HUMANIZE_MAX_MS', 'applyRests']);
  });

  it('spec §1 to §4', () => {
    const symbols = citedSymbols(specDesign);
    expect(symbols.length, 'the extractor found the spec’s symbols').toBeGreaterThan(30);
    const missing = symbols.filter((symbol) => !isInSource(symbol));
    expect(missing, 'cited in docs/specs/ROBOT_PERFORMANCE.md but absent from src/').toEqual([]);
  });

  // Only the lines that talk about the new fields: these are the living docs Task 19 edits, and an unrelated
  // stale name elsewhere in them is not this phase's to fail on (robotArticulationDocs scopes the same way).
  const UPDATED_DOCS = [
    'docs/MELODY_SYSTEM.md',
    'docs/AUDIO_SYSTEM.md',
    'docs/SESSION_STORAGE.md',
    'docs/COMPANIES.md',
    'docs/ROBOT_DESIGN.md',
    'docs/PROCEDURAL_GENERATION.md',
    'docs/reference/ROBOT_DATA_GRID.md',
    'docs/reference/SLIDER_VALUES.md',
  ];
  const performanceLines = (doc: string) =>
    read(doc)
      .split('\n')
      .filter((line) => /\b(dynamics|rests|accents|humanize|setHumanize|applyPerformanceMarks|buildSeededPerformance|resolveArticulation|ARTICULATION_MARKS)\b/i.test(line))
      .join('\n');

  it.each(UPDATED_DOCS)('%s: the symbols on its performance lines exist', (doc) => {
    const missing = citedSymbols(performanceLines(doc)).filter((symbol) => !isInSource(symbol));
    expect(missing, `${doc} cites symbols absent from src/`).toEqual([]);
  });
});

// ========================================
// (3) THE SCHEDULING INVARIANT
// ========================================

describe('Humanize stays inside the lead (CLAUDE.md: MIN_LEAD of 50-100 ms when scheduling audio)', () => {
  it('MIN_LEAD less the largest Humanize offset leaves at least 50 ms', () => {
    expect(MIN_LEAD - HUMANIZE_MAX_MS / 1000).toBeGreaterThanOrEqual(0.05);
  });
});

// ========================================
// (4) THE DOCS SAY WHAT THE CODE NOW DOES   (RED until Task 19)
// ========================================

describe('MELODY_SYSTEM.md: the MelodyEvent block carries the two performance stamps', () => {
  const text = read('docs/MELODY_SYSTEM.md');
  const block = text.match(/interface MelodyEvent \{[\s\S]*?\n\}/)?.[0] ?? '';

  it('has a MelodyEvent block to check', () => {
    expect(block).toContain('startStep');
  });

  it.each(['rest', 'mark'])('names `%s` in the block', (field) => {
    expect(block).toMatch(new RegExp(`\\b${field}\\?:`));
  });
});

describe('SESSION_STORAGE.md: the four new persisted fields are named', () => {
  const text = read('docs/SESSION_STORAGE.md');

  it.each(['dynamics', 'rests', 'accents', 'humanize'])('names `%s`', (field) => {
    expect(text).toContain(`\`${field}\``);
  });
});
