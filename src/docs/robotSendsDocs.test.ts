import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/todo/roadmap.md item 50.2 (Robot Sends), docs/tasks/ROBOT_SENDS.md Task 17. A docs task has no behaviour to
// test, so this makes its acceptance criteria executable (robotArticulationDocs.test.ts is the pattern):
//   (1) the source-scan guardrail: nothing on the robot body reads a send (Visual Mapping is unchanged);
//   (2) every symbol the spec and the updated docs cite exists in source, so a rename cannot leave a stale doc;
//   (3) the docs say what the code now does (SESSION_STORAGE names the sends as persisted, masterVolume as never).
// Groups (1) and (2) are green from the moment they land. Group (3)'s doc-text cases are written against the text
// Task 20 produces, so they are RED until Task 20 lands. That is intended.

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

describe('nothing on the robot body reads a send (Visual Mapping is unchanged)', () => {
  const bodyFiles = [...sourceFiles('src/components/robot/gem'), ...sourceFiles('src/components/robot/RobotBody.tsx')];

  it('scans the gem folder and RobotBody, not an empty list', () => {
    expect(bodyFiles).toContain('src/components/robot/RobotBody.tsx');
    expect(bodyFiles).toContain('src/components/robot/gem/bodyLineDials.ts');
    expect(bodyFiles.length).toBeGreaterThan(5);
  });

  it('treats a comment as no read, and a code reference as a read (the stripper itself)', () => {
    expect(withoutComments('// reverbSend is audio only\nconst a = 1;')).not.toMatch(/reverbSend/);
    expect(withoutComments('/* delaySend */ const a = 1;')).not.toMatch(/delaySend/);
    expect(withoutComments('const a = robot.reverbSend;')).toMatch(/reverbSend/);
    expect(withoutComments('const a = robot.delaySend; // audio only')).toMatch(/delaySend/);
  });

  it.each(bodyFiles)('%s reads neither reverbSend nor delaySend', (file) => {
    const code = withoutComments(read(file));
    for (const name of ['reverbSend', 'delaySend']) {
      expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('bodyLineDials.LINE_TARGETS is still exactly the three layer gain ids, in order', () => {
    const code = withoutComments(read('src/components/robot/gem/bodyLineDials.ts'));
    const literal = code.match(/const LINE_TARGETS[^=]*=\s*\{([^}]*)\}/)?.[1];
    expect(literal, 'LINE_TARGETS object literal found').toBeDefined();
    const ids = [...(literal ?? '').matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(['layer0.gain', 'layer1.gain', 'layer2.gain']);
  });
});

// ========================================
// (2) EVERY CITED SYMBOL EXISTS
// ========================================

describe('the named Robot Sends symbols are declared where the spec says they are', () => {
  const declared: [description: string, file: string, pattern: RegExp][] = [
    ['Robot.reverbSend', 'src/types/Robot.ts', /\breverbSend: number;/],
    ['Robot.delaySend', 'src/types/Robot.ts', /\bdelaySend: number;/],
    ['CompanyOptionsSnapshot.reverbSend', 'src/types/Company.ts', /\breverbSend\?: number;/],
    ['CompanyOptionsSnapshot.delaySend', 'src/types/Company.ts', /\bdelaySend\?: number;/],
    ['RobotAudioOverrideDiff.reverbSend', 'src/types/session.ts', /\breverbSend\?: number;/],
    ['RobotAudioOverrideDiff.delaySend', 'src/types/session.ts', /\bdelaySend\?: number;/],
    ['RobotAudioBaseline.reverbSend', 'src/systems/spawnSystem.ts', /interface RobotAudioBaseline \{[^}]*\breverbSend: number;/],
    ['RobotAudioBaseline.delaySend', 'src/systems/spawnSystem.ts', /interface RobotAudioBaseline \{[^}]*\bdelaySend: number;/],
    ['CompactRobotOverrideDiff.rs', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\brs\?: number;/],
    ['CompactRobotOverrideDiff.ds', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bds\?: number;/],
    ['SEND_MIN', 'src/constants/index.ts', /export const SEND_MIN = 0;/],
    ['SEND_MAX', 'src/constants/index.ts', /export const SEND_MAX = 1;/],
    ['SEND_DISPLAY_SCALE', 'src/constants/index.ts', /export const SEND_DISPLAY_SCALE = 100;/],
    ['SEND_STEP_PERCENT', 'src/constants/index.ts', /export const SEND_STEP_PERCENT = 1;/],
    // Robot Effect Sends T1: SEND_DELAY_QUIET_THRESHOLD is deleted; its 0.25 is the Delay row's 1 - lit.
    ['the Delay send row (the old quiet threshold as 1 - lit)', 'src/data/robotSendLoadingRanges.ts', /delaySend: \{ min: 0, max: 0\.3, lit: 0\.75 \}/],
    ['SEND_RAMP_SECONDS', 'src/engine/AudioEngine.ts', /const SEND_RAMP_SECONDS = /],
    // Re-pinned by Robot Send Table T3 (docs/specs/ROBOT_SEND_TABLE.md assumption 4): one record of send gains.
    ['the compositeVoices entry carries the send nodes', 'src/engine/audioEngine/voiceEntry.ts', /\bsends: Readonly<Record<SendEngineKey, Tone\.Gain>>;/],
    // Robot Effect Sends T5 widened it with grit / shimmer / double (docs/specs/ROBOT_EFFECT_SENDS.md §1.4).
    ['AudioEngine.updateRobotSends', 'src/engine/AudioEngine.ts', /\bupdateRobotSends\(\s*robotId: string,\s*sends: \{ reverb\?: number; delay\?: number; grit\?: number; shimmer\?: number; double\?: number \},?\s*\): void/],
    ['the reverb return gain', 'src/engine/audioEngine/globalFx.ts', /let _globalReverbReturn: Tone\.Gain \| null/],
    ['the delay return gain', 'src/engine/audioEngine/globalFx.ts', /let _globalDelayReturn: Tone\.Gain \| null/],
    ['getGlobalReverbRoom', 'src/engine/audioEngine/globalFx.ts', /export function getGlobalReverbRoom\(\): Tone\.Reverb \| null/],
    ['getGlobalDelayRoom', 'src/engine/audioEngine/globalFx.ts', /export function getGlobalDelayRoom\(\): Tone\.FeedbackDelay \| null/],
    ['generateRobotSends', 'src/systems/spawnSystem.ts', /export function generateRobotSends\(noiseMap: NoiseFunction2D, offset: number\)/],
    ['clampSend', 'src/utils/clampSend.ts', /export function clampSend\(fraction: number\): number/],
    ['applyReverbSend', 'src/systems/robotOptionsActions.ts', /export function applyReverbSend\(robot: Robot, localeId: string, pct: number\): void/],
    ['applyDelaySend', 'src/systems/robotOptionsActions.ts', /export function applyDelaySend\(robot: Robot, localeId: string, pct: number\): void/],
    ['applyReverbSendValue (the swell tick writes the stored fraction)', 'src/systems/robotOptionsActions.ts', /export function applyReverbSendValue\(robot: Robot, localeId: string, fraction: number\): void/],
    ['applyDelaySendValue', 'src/systems/robotOptionsActions.ts', /export function applyDelaySendValue\(robot: Robot, localeId: string, fraction: number\): void/],
    ['REVERB_SEND_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const REVERB_SEND_SCHEMA: SliderLinearSchema/],
    ['DELAY_SEND_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const DELAY_SEND_SCHEMA: SliderLinearSchema/],
    ['AudioSettingValue.reverbSend', 'src/components/robot/AudioSettingSection.tsx', /\breverbSend: number;/],
    ['AudioSettingValue.delaySend', 'src/components/robot/AudioSettingSection.tsx', /\bdelaySend: number;/],
    ['AudioSettingSection reverbSendSwelling prop', 'src/components/robot/AudioSettingSection.tsx', /\breverbSendSwelling\?: boolean;/],
    ['AudioSettingSection delaySendSwelling prop', 'src/components/robot/AudioSettingSection.tsx', /\bdelaySendSwelling\?: boolean;/],
    ['the swell pool lists reverbSend', 'src/types/audioSwell.ts', /SWELL_ROBOT_ATTRIBUTE_IDS[\s\S]*?'reverbSend',[\s\S]*?\]/],
    ['the swell pool lists delaySend', 'src/types/audioSwell.ts', /SWELL_ROBOT_ATTRIBUTE_IDS[\s\S]*?'delaySend',[\s\S]*?\]/],
    ['the swell ranges carry both sends', 'src/data/audioSwellRanges.ts', /reverbSend: \{ min: SEND_MIN, max: SEND_MAX \}, delaySend: \{ min: SEND_MIN, max: SEND_MAX \}/],
  ];

  it.each(declared)('%s', (_description, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  it('the global swell pool no longer lists the two wet targets', () => {
    const pool = read('src/types/audioSwell.ts').match(/SWELL_GLOBAL_TARGET_IDS[^=]*=\s*\[([\s\S]*?)\]/)?.[1];
    expect(pool, 'SWELL_GLOBAL_TARGET_IDS literal found').toBeDefined();
    expect(pool).not.toMatch(/'delay\.wet'|'reverb\.wet'/);
  });

  it('the declared-pattern table itself fails on a rename (a pattern that matches nothing is not a pass)', () => {
    expect(read('src/types/Robot.ts')).not.toMatch(/\breverbSendX: number;/);
  });
});

/** Every identifier in every non-test source file under src/. A whole-word set, not a substring search, so a
 *  renamed `updateRobotSends` is not satisfied by an `updateRobotSendsX` that happens to contain it. */
const sourceIdentifiers = new Set(sourceFiles('src').flatMap((file) => read(file).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
const isInSource = (symbol: string) => sourceIdentifiers.has(symbol);

/** Words that are cited in backticks but are not, and should not be, names in this repo's source: third-party
 *  API members, names the spec records as deliberately NOT built or as deleted, and prose terms. */
const NOT_REPO_SYMBOLS = new Set<string>([
  // Names the spec records as deleted (§1.2, §1.9) or as not built in this phase (§1.9's follow-up)
  'DELAY_QUIET_THRESHOLD', 'isGlobalTargetAtOffEquivalent', 'SEND_SWELL_UPWARD_CEILING',
  // Deleted by Robot Effect Sends T1 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 6): the Delay row's 1 - lit
  'SEND_DELAY_QUIET_THRESHOLD',
  // File names, not symbols: this test file (sourceFiles skips *.test.ts) and the planning docs
  'robotSendsDocs', 'ROBOT_SENDS', 'GLOBAL_CHAIN_GRID', 'ROBOT_DATA_GRID', 'SLIDER_VALUES',
]);

/** Inline backtick spans only (fenced blocks are illustrative sketches, covered by the table above). */
function citedSymbols(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  const identifiers = spans.flatMap((span) => span.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  // A code-shaped name only: camelCase with an inner capital, PascalCase, or UPPER_SNAKE. Plain words
  // ("robot", "id", "true", "number") are not claims about the source.
  // A trailing underscore is a prefix wildcard in prose (`SEND_*`), not a name.
  const codeShaped = identifiers.filter(
    (word) =>
      !word.endsWith('_') &&
      (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(word)),
  );
  return [...new Set(codeShaped)].filter((word) => !NOT_REPO_SYMBOLS.has(word)).sort();
}

describe('every symbol the spec and the updated docs cite exists in source', () => {
  const spec = read('docs/specs/ROBOT_SENDS.md');
  const specDesign = spec.slice(spec.indexOf('## 1. Overview'), spec.indexOf('\n## 5.'));

  it('finds the spec sections it is scanning (§1 to §4), not an empty slice', () => {
    expect(specDesign.length).toBeGreaterThan(5000);
    expect(specDesign).toContain('### 1.3 Engine');
    expect(specDesign).toContain('## 4. Code Style');
  });

  it('extracts code-shaped names and drops plain words, wildcards and listed non-symbols (the extractor itself)', () => {
    const extracted = citedSymbols('`applyReverbSend` and `robot` and `SEND_*` and `DELAY_QUIET_THRESHOLD` and `SEND_RAMP_SECONDS`');
    expect(extracted).toEqual(['SEND_RAMP_SECONDS', 'applyReverbSend']);
  });

  it('does not read a fenced sketch as a claim about the source', () => {
    expect(citedSymbols('```ts\nconst notARealName = makeStubGain(0);\n```\nand `clampSend`')).toEqual(['clampSend']);
  });

  it('finds a missing symbol (the membership check itself)', () => {
    expect(isInSource('updateRobotSends')).toBe(true);
    expect(isInSource('updateRobotSendsX')).toBe(false);
  });

  it('spec §1 to §4', () => {
    const symbols = citedSymbols(specDesign);
    expect(symbols.length, 'the extractor found the spec’s symbols').toBeGreaterThan(30);
    const missing = symbols.filter((symbol) => !isInSource(symbol));
    expect(missing, 'cited in docs/specs/ROBOT_SENDS.md but absent from src/').toEqual([]);
  });

  // Only the lines that talk about the sends: these are the living docs Task 20 edits, and an unrelated stale
  // name elsewhere in them is not this phase's to fail on (robotPanDocs and robotArticulationDocs scope the same way).
  const UPDATED_DOCS = [
    'docs/AUDIO_SYSTEM.md',
    'docs/SESSION_STORAGE.md',
    'docs/COMPANIES.md',
    'docs/ROBOT_DESIGN.md',
    'docs/reference/GLOBAL_CHAIN_GRID.md',
    'docs/reference/ROBOT_DATA_GRID.md',
    'docs/reference/SLIDER_VALUES.md',
  ];
  const sendLines = (doc: string) =>
    read(doc)
      .split('\n')
      .filter((line) => /reverbSend|delaySend|updateRobotSends|applyReverbSend|applyDelaySend|getGlobalReverbRoom|getGlobalDelayRoom|generateRobotSends|SEND_[A-Z_]+/.test(line))
      .join('\n');

  it('the line filter keeps a send line and drops an unrelated one (the filter itself)', () => {
    const kept = sendLines('docs/specs/ROBOT_SENDS.md');
    expect(kept).toContain('updateRobotSends');
    expect(kept).not.toContain('## 6. Git & Workflow Context');
  });

  it.each(UPDATED_DOCS)('%s: the symbols on its send lines exist', (doc) => {
    const missing = citedSymbols(sendLines(doc)).filter((symbol) => !isInSource(symbol));
    expect(missing, `${doc} cites symbols absent from src/`).toEqual([]);
  });
});

// ========================================
// (3) THE DOCS SAY WHAT THE CODE NOW DOES   (RED until Task 20)
// ========================================

describe('SESSION_STORAGE.md: the sends are persisted, masterVolume never is', () => {
  const text = read('docs/SESSION_STORAGE.md');
  const neverPersisted = text.split('\n').find((line) => line.startsWith('**Explicitly never persisted:**')) ?? '';

  it('finds the never-persisted paragraph, not an empty line', () => {
    expect(neverPersisted.length).toBeGreaterThan(100);
  });

  it.each(['reverbSend', 'delaySend'])('names `%s` as a persisted field', (field) => {
    expect(text).toContain(`\`${field}\``);
  });

  it.each(['reverbSend', 'delaySend'])('does not list `%s` among the never-persisted fields', (field) => {
    expect(neverPersisted).not.toContain(`\`${field}\``);
  });

  it.each(['masterVolume', 'audioMode'])('keeps `%s` on the never-persisted list', (field) => {
    expect(neverPersisted).toContain(`\`${field}\``);
  });
});
