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
// Group (4) is roadmap 55's (docs/tasks/ROBOT_SEND_TABLE.md Task 15): the living docs name the one send table, not the
// copies it replaced, and the two historical specs say so before their §1.

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
    // Robot Send Table T9 (docs/specs/ROBOT_SEND_TABLE.md §1.5, assumption 9): the codec and the session diff loop over
    // the table; the encoder's loop sits where the five lines were (after `p`, before `dy`), so a link's string is unchanged.
    ['the share encoder writes the sends from the table, after p and before dy', 'src/utils/sessionShareUtils.ts', /if \(diff\.pan !== undefined\) compact\.p = diff\.pan;(\s*\/\/[^\n]*)*\s*for \(const spec of ROBOT_SENDS\) if \(diff\[spec\.field\] !== undefined\) compact\[spec\.shareCode\] = diff\[spec\.field\];\s*if \(diff\.dynamics !== undefined\) compact\.dy/],
    ['the share decoder reads the sends from the table, each through isSendFraction', 'src/utils/sessionShareUtils.ts', /for \(const spec of ROBOT_SENDS\) \{\s*const send = compact\[spec\.shareCode\];\s*if \(isSendFraction\(send\)\) diff\[spec\.field\] = send;\s*\}/],
    ['the session diff and restore loop over ROBOT_SEND_FIELDS', 'src/utils/sessionDiff.ts', /for \(const field of ROBOT_SEND_FIELDS\) \{[\s\S]*for \(const field of ROBOT_SEND_FIELDS\) \{/],
    ['the session restore primes only the sends it carried, by engine key', 'src/utils/sessionDiff.ts', /ROBOT_SEND_FIELDS\.filter\(\(field\) => updates\[field\] !== undefined\)\.map\(\(field\) => \[engineKeyOf\(field\), updatedRobot\[field\]\]\)/],
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
    // Re-pinned by Robot Send Table T4 (docs/specs/ROBOT_SEND_TABLE.md §1.2): the same five optional keys, as a type.
    ['AudioEngine.updateRobotSends', 'src/engine/AudioEngine.ts', /\bupdateRobotSends\(\s*robotId: string,\s*sends: Partial<Record<SendEngineKey, number>>,?\s*\): void/],
    ['the reverb return gain', 'src/engine/audioEngine/globalFx.ts', /let _globalReverbReturn: Tone\.Gain \| null/],
    ['the delay return gain', 'src/engine/audioEngine/globalFx.ts', /let _globalDelayReturn: Tone\.Gain \| null/],
    ['getGlobalReverbRoom', 'src/engine/audioEngine/globalFx.ts', /export function getGlobalReverbRoom\(\): Tone\.Reverb \| null/],
    ['getGlobalDelayRoom', 'src/engine/audioEngine/globalFx.ts', /export function getGlobalDelayRoom\(\): Tone\.FeedbackDelay \| null/],
    ['generateRobotSends', 'src/systems/spawnSystem.ts', /export function generateRobotSends\(noiseMap: NoiseFunction2D, offset: number\)/],
    ['clampSend', 'src/utils/clampSend.ts', /export function clampSend\(fraction: number\): number/],
    // Re-pinned by Robot Send Table T14 (docs/specs/ROBOT_SEND_TABLE.md §1.3): the ten named actions are one keyed pair.
    ['applySend', 'src/systems/robotOptionsActions.ts', /export function applySend\(robot: Robot, localeId: string, field: RobotSendField, pct: number\): void/],
    ['applySendValue (the swell tick writes the stored fraction)', 'src/systems/robotOptionsActions.ts', /export function applySendValue\(robot: Robot, localeId: string, field: RobotSendField, fraction: number\): void/],
    // Re-pinned by Robot Send Table T10 (docs/specs/ROBOT_SEND_TABLE.md §1.4): the five named schemas are one record.
    ['ROBOT_SEND_SCHEMAS', 'src/data/robotOptionsConfig.ts', /export const ROBOT_SEND_SCHEMAS: Readonly<Record<RobotSendField, SliderLinearSchema>> =/],
    ['each send schema is built from its table row', 'src/data/robotOptionsConfig.ts', /ROBOT_SENDS\.map\(\(spec\) => \[\s*spec\.field,\s*\{\s*id: `robotOptions\.\$\{spec\.field\}`,\s*type: 'sliderLinear',\s*\.\.\.labels\(spec\.contentKey\),/],
    ['AudioSettingValue.reverbSend', 'src/components/robot/AudioSettingSection.tsx', /\breverbSend: number;/],
    ['AudioSettingValue.delaySend', 'src/components/robot/AudioSettingSection.tsx', /\bdelaySend: number;/],
    // Re-pinned by Robot Send Table T13 (docs/specs/ROBOT_SEND_TABLE.md §1.4): one flag record and one handler for the rows.
    ['AudioSettingSection sendSwelling prop', 'src/components/robot/AudioSettingSection.tsx', /\bsendSwelling\?: Readonly<Record<RobotSendField, boolean>>;/],
    ['AudioSettingSection onSendChange prop', 'src/components/robot/AudioSettingSection.tsx', /\bonSendChange: \(field: RobotSendField, pct: number\) => void;/],
    // Re-pinned by Robot Send Table T8 (docs/specs/ROBOT_SEND_TABLE.md §1.5): the pool and the ranges read the field list
    // (robotSendsParity.test.ts pins the pool's order as a literal).
    ['the swell pool ends in the sends', 'src/types/audioSwell.ts', /SWELL_ROBOT_ATTRIBUTE_IDS: readonly SwellRobotAttributeId\[\] = \[[^\]]*'adsr\.release',\s*\.\.\.ROBOT_SEND_FIELDS,?\s*\]/],
    ['the swell ranges carry every send', 'src/data/audioSwellRanges.ts', /\.\.\.\(Object\.fromEntries\(ROBOT_SEND_FIELDS\.map\(\(field\) => \[field, \{ min: SEND_MIN, max: SEND_MAX \}\]\)\)/],
    ['the store clamps every send', 'src/stores/localeStore.ts', /for \(const sendKey of ROBOT_SEND_FIELDS\) \{/],
    ['the company resolver falls back to 0 for every send', 'src/systems/companyOptions.ts', /\.\.\.\(Object\.fromEntries\(ROBOT_SEND_FIELDS\.map\(\(field\) => \[field, firstMember\[field\] \?\? 0\]\)\)/],
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

/** The ten per-send actions Robot Send Table T14 deleted (docs/specs/ROBOT_SEND_TABLE.md §1.3). */
const REMOVED_SEND_ACTIONS = [
  'applyReverbSend', 'applyDelaySend', 'applyGritSend', 'applyShimmerSend', 'applyDoubleSend',
  'applyReverbSendValue', 'applyDelaySendValue', 'applyGritSendValue', 'applyShimmerSendValue', 'applyDoubleSendValue',
] as const;

describe('the ten named send actions Robot Send Table removed are gone from source', () => {
  it.each(REMOVED_SEND_ACTIONS)('%s is not an identifier in src/', (symbol) => {
    expect(isInSource(symbol)).toBe(false);
  });

  it('the keyed pair that replaced them is (the membership check reads real source)', () => {
    expect(isInSource('applySend')).toBe(true);
    expect(isInSource('applySendValue')).toBe(true);
  });
});

/** Words that are cited in backticks but are not, and should not be, names in this repo's source: third-party
 *  API members, names the spec records as deliberately NOT built or as deleted, and prose terms. */
const NOT_REPO_SYMBOLS = new Set<string>([
  // Names the spec records as deleted (§1.2, §1.9) or as not built in this phase (§1.9's follow-up)
  'DELAY_QUIET_THRESHOLD', 'isGlobalTargetAtOffEquivalent', 'SEND_SWELL_UPWARD_CEILING',
  // Deleted by Robot Effect Sends T1 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 6): the Delay row's 1 - lit
  'SEND_DELAY_QUIET_THRESHOLD',
  // Deleted by Robot Send Table T9 (docs/specs/ROBOT_SEND_TABLE.md §1.5): the session diff's loops read ROBOT_SEND_FIELDS
  'SEND_PRIME_KEYS',
  // Deleted by Robot Send Table T10 (docs/specs/ROBOT_SEND_TABLE.md §1.4): the five named schemas are ROBOT_SEND_SCHEMAS
  'REVERB_SEND_SCHEMA', 'DELAY_SEND_SCHEMA', 'GRIT_SEND_SCHEMA', 'SHIMMER_SEND_SCHEMA', 'DOUBLE_SEND_SCHEMA',
  // Deleted by Robot Send Table T11 (docs/specs/ROBOT_SEND_TABLE.md §1.4): the robot screen has one handleSendChange
  'handleReverbSendChange', 'handleDelaySendChange',
  // Deleted by Robot Send Table T13 (docs/specs/ROBOT_SEND_TABLE.md §1.4): AudioSettingSection's ten per-field send props
  // and the company options' twins are one onSendChange and one sendSwelling record
  'onReverbSendChange', 'onDelaySendChange', 'onGritSendChange', 'onShimmerSendChange', 'onDoubleSendChange',
  'reverbSendSwelling', 'delaySendSwelling', 'gritSendSwelling', 'shimmerSendSwelling', 'doubleSendSwelling',
  // Deleted by Robot Send Table T14 (docs/specs/ROBOT_SEND_TABLE.md §1.3): the ten named actions are applySend / applySendValue
  ...REMOVED_SEND_ACTIONS,
  // File names, not symbols: this test file and chainCycleSearch.test.ts (sourceFiles skips *.test.ts), and the planning
  // docs (Robot Send Table T15's wider line filter reaches AUDIO_SYSTEM.md's Wiring line, which cites chainCycleSearch)
  'robotSendsDocs', 'chainCycleSearch', 'ROBOT_SENDS', 'GLOBAL_CHAIN_GRID', 'ROBOT_DATA_GRID', 'SLIDER_VALUES',
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
    const extracted = citedSymbols('`applySend` and `robot` and `SEND_*` and `DELAY_QUIET_THRESHOLD` and `SEND_RAMP_SECONDS`');
    expect(extracted).toEqual(['SEND_RAMP_SECONDS', 'applySend']);
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
      // Robot Send Table T15 added the table-era names, so a line that cites only them is still checked.
      .filter((line) => /reverbSend|delaySend|updateRobotSends|applyReverbSend|applyDelaySend|getGlobalReverbRoom|getGlobalDelayRoom|generateRobotSends|SEND_[A-Z_]+|applySend|robotSendLevels|engineKeyOf|onSendChange|sendSwelling/.test(line))
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

// ========================================
// (4) ROBOT SEND TABLE (roadmap 55): THE DOCS NAME THE TABLE   (RED until docs/tasks/ROBOT_SEND_TABLE.md Task 15)
// ========================================

/** Every name roadmap 55 deleted from src/ (docs/specs/ROBOT_SEND_TABLE.md §1.6), the regex scan's file included. */
const REMOVED_BY_SEND_TABLE = [
  ...REMOVED_SEND_ACTIONS,
  'REVERB_SEND_SCHEMA', 'DELAY_SEND_SCHEMA', 'GRIT_SEND_SCHEMA', 'SHIMMER_SEND_SCHEMA', 'DOUBLE_SEND_SCHEMA',
  'handleReverbSendChange', 'handleDelaySendChange', 'handleGritSendChange', 'handleShimmerSendChange', 'handleDoubleSendChange',
  'onReverbSendChange', 'onDelaySendChange', 'onGritSendChange', 'onShimmerSendChange', 'onDoubleSendChange',
  'reverbSendSwelling', 'delaySendSwelling', 'gritSendSwelling', 'shimmerSendSwelling', 'doubleSendSwelling',
  'SEND_PRIME_KEYS', 'SEND_ATTRIBUTES', 'writeRobotSend', 'reservationSendsPrime',
  // The review follow-up (2026-10-22): the engine-key-to-field direction had no production caller
  'sendFieldOf', 'ROBOT_SEND_BY_ENGINE_KEY',
];
const namesRemoved = (text: string) => REMOVED_BY_SEND_TABLE.filter((name) => new RegExp(`\\b${name}\\b`).test(text));

/** The living docs: every Markdown file directly in docs/ and docs/reference/. The roadmap, specs, plans and intents are
 *  the record of what each phase built and keep the names they were written with. */
const markdownIn = (folder: string) =>
  readdirSync(resolve(repoRoot, folder)).filter((entry) => entry.endsWith('.md')).map((entry) => `${folder}/${entry}`);
const LIVING_DOCS = [...markdownIn('docs'), ...markdownIn('docs/reference')];
/** Whether `text` cites `symbol` as a whole word inside an inline backtick span (`robotSendLevels(robot)` cites
 *  robotSendLevels). Spans pair left to right, as citedSymbols reads them, so prose between two spans is not one. */
const cites = (text: string, symbol: string) =>
  [...text.matchAll(/`([^`\n]+)`/g)].some((m) => new RegExp(`\\b${symbol}\\b`).test(m[1]));

describe('the living docs name the send table, not the copies it replaced (Robot Send Table T15)', () => {
  it('reads the living docs, not an empty list, and not the history', () => {
    expect(LIVING_DOCS).toContain('docs/AUDIO_SYSTEM.md');
    expect(LIVING_DOCS).toContain('docs/COMPANIES.md');
    expect(LIVING_DOCS).toContain('docs/reference/ROBOT_DATA_GRID.md');
    expect(LIVING_DOCS.some((doc) => /docs\/(todo|specs|tasks|intent)\//.test(doc))).toBe(false);
  });

  it('catches a removed name as a whole word, and passes the names that replaced them (the matcher itself)', () => {
    expect(namesRemoved('calls `applyGritSend` per member')).toEqual(['applyGritSend']);
    expect(namesRemoved('the tick writes through `applyGritSendValue`')).toEqual(['applyGritSendValue']);
    expect(namesRemoved('`src/engine/reservationSendsPrime.test.ts`')).toEqual(['reservationSendsPrime']);
    expect(namesRemoved('`applySend` / `applySendValue`, `onSendChange` and `sendSwelling`')).toEqual([]);
  });

  it.each(LIVING_DOCS)('%s names none of the symbols roadmap 55 removed', (doc) => {
    expect(namesRemoved(read(doc)), `${doc} still names a removed symbol`).toEqual([]);
  });

  it.each([
    ['docs/AUDIO_SYSTEM.md', ['ROBOT_SENDS', 'robotSendLevels', 'engineKeyOf', 'applySend', 'applySendValue', 'ROBOT_SEND_SCHEMAS']],
    ['docs/COMPANIES.md', ['applySend', 'onSendChange', 'sendSwelling']],
    ['docs/SESSION_STORAGE.md', ['ROBOT_SEND_FIELDS', 'engineKeyOf', 'ROBOT_SENDS']],
    ['docs/reference/ROBOT_DATA_GRID.md', ['ROBOT_SEND_SCHEMAS']],
  ] as const)('%s names the table and its helpers', (doc, symbols) => {
    const text = read(doc);
    for (const symbol of symbols) expect(cites(text, symbol), symbol).toBe(true);
  });

  it('counts a call written in backticks as a citation, and prose or a longer name as none (the matcher itself)', () => {
    expect(cites('primes with `robotSendLevels(robot)`', 'robotSendLevels')).toBe(true);
    expect(cites('primes with robotSendLevels', 'robotSendLevels')).toBe(false);
    expect(cites('`a` then robotSendLevels then `b`', 'robotSendLevels')).toBe(false);
    expect(cites('through `applySendValue`', 'applySend')).toBe(false);
  });
});

describe('the two historical specs point at the refactor before their §1 (Robot Send Table T15)', () => {
  it.each(['docs/specs/ROBOT_SENDS.md', 'docs/specs/ROBOT_EFFECT_SENDS.md'])('%s carries the header note', (doc) => {
    const text = read(doc);
    const header = text.slice(0, text.indexOf('## 1. Overview'));
    expect(header.length, 'the header precedes §1').toBeGreaterThan(500);
    expect(header).toContain('](ROBOT_SEND_TABLE.md)');
    expect(header).toContain('roadmap 55');
    expect(header).toContain('`ROBOT_SENDS`');
  });
});

describe('roadmap 55 reads as built (Robot Send Table T15)', () => {
  const roadmap = read('docs/todo/roadmap.md');
  const start = roadmap.indexOf('## 55. Robot Sends: One Table for the Five Sends');
  const next = roadmap.indexOf('\n## ', start + 1);
  const entry = start < 0 ? '' : roadmap.slice(start, next < 0 ? undefined : next);
  const open = entry.slice(entry.indexOf('### Open'));

  it('finds the entry and its Open section, not empty strings', () => {
    expect(entry.length).toBeGreaterThan(2000);
    expect(open.startsWith('### Open')).toBe(true);
  });

  it('says built, links the spec and the plan, and has an As built', () => {
    expect(entry).toMatch(/\*\*Status: built/);
    expect(entry).not.toMatch(/Status: not started/);
    expect(entry).toContain('(../specs/ROBOT_SEND_TABLE.md)');
    expect(entry).toContain('(../tasks/ROBOT_SEND_TABLE.md)');
    expect(entry).toContain('### As built');
  });

  it('every Open bullet is answered', () => {
    const bullets = open.split('\n').filter((line) => line.startsWith('- '));
    expect(bullets).toHaveLength(3);
    for (const bullet of bullets) expect(bullet).toMatch(/^- \*\*Answered/);
  });
});
