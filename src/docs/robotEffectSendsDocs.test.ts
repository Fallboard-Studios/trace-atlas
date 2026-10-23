import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/todo/roadmap.md item 50.7 (Robot Effect Sends), docs/tasks/ROBOT_EFFECT_SENDS.md Task 18. A docs task has no
// behaviour to test, so this makes its acceptance criteria executable (robotSendsDocs.test.ts is the pattern):
//   (1) the source-scan guardrail: nothing on the robot body reads Grit, Shimmer or Double (Visual Mapping is unchanged);
//   (2) every symbol the spec and the updated docs cite exists in source, the names the 2026-10-21 amendment removed do
//       not, and every engine reservation site primes all five (the reserve-site scan until Robot Send Table T4);
//   (3) the living docs say what the code now does.
// Groups (1) and (2) are green from the moment they land. Group (3) is written against the text Task 22 produces, so
// it is RED until Task 22 lands. That is intended. The red cases, all in group (3):
//   - GLOBAL_CHAIN_GRID.md: the chain-order line, the five room rows, footnote 2 naming the send table;
//   - AUDIO_SYSTEM.md: the three effect rooms and their sends;
//   - SESSION_STORAGE.md: the three new sends persisted, never on the never-persisted list.
// (globalColourDocs.test.ts's grid case is re-pinned to the room rows by the same task and is red until Task 22 too.)

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

const NEW_SENDS = ['gritSend', 'shimmerSend', 'doubleSend'] as const;

// ========================================
// (1) THE SOURCE-SCAN GUARDRAIL
// ========================================

describe('nothing on the robot body reads Grit, Shimmer or Double (Visual Mapping is unchanged)', () => {
  const bodyFiles = [...sourceFiles('src/components/robot/gem'), ...sourceFiles('src/components/robot/RobotBody.tsx')];

  it('scans the gem folder and RobotBody, not an empty list', () => {
    expect(bodyFiles).toContain('src/components/robot/RobotBody.tsx');
    expect(bodyFiles).toContain('src/components/robot/gem/bodyLineDials.ts');
    expect(bodyFiles.length).toBeGreaterThan(5);
  });

  it('treats a comment as no read, and a code reference as a read (the stripper itself)', () => {
    expect(withoutComments('// gritSend is audio only\nconst a = 1;')).not.toMatch(/gritSend/);
    expect(withoutComments('/* shimmerSend */ const a = 1;')).not.toMatch(/shimmerSend/);
    expect(withoutComments('const a = robot.doubleSend;')).toMatch(/doubleSend/);
    expect(withoutComments('const a = robot.gritSend; // audio only')).toMatch(/gritSend/);
  });

  it.each(bodyFiles)('%s reads none of gritSend, shimmerSend, doubleSend', (file) => {
    const code = withoutComments(read(file));
    for (const name of NEW_SENDS) {
      expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

// ========================================
// (2) EVERY CITED SYMBOL EXISTS; THE REMOVED ONES DO NOT
// ========================================

describe('the named Robot Effect Sends symbols are declared where the spec says they are', () => {
  const declared: [description: string, file: string, pattern: RegExp][] = [
    ...NEW_SENDS.flatMap((field): [string, string, RegExp][] => [
      [`Robot.${field}`, 'src/types/Robot.ts', new RegExp(`\\b${field}: number;`)],
      [`CompanyOptionsSnapshot.${field}`, 'src/types/Company.ts', new RegExp(`\\b${field}\\?: number;`)],
      [`RobotAudioOverrideDiff.${field}`, 'src/types/session.ts', new RegExp(`\\b${field}\\?: number;`)],
      [`RobotAudioBaseline.${field}`, 'src/systems/spawnSystem.ts', new RegExp(`interface RobotAudioBaseline \\{[^}]*\\b${field}: number;`)],
      [`AudioSettingValue.${field}`, 'src/components/robot/AudioSettingSection.tsx', new RegExp(`\\b${field}: number;`)],
      [`AudioSettingSection ${field}Swelling prop`, 'src/components/robot/AudioSettingSection.tsx', new RegExp(`\\b${field}Swelling\\?: boolean;`)],
    ]),
    // Re-pinned by Robot Send Table T3 (docs/specs/ROBOT_SEND_TABLE.md assumption 4): the five send nodes are one record.
    ['the voice entry carries the send nodes', 'src/engine/audioEngine/voiceEntry.ts', /\bsends: Readonly<Record<SendEngineKey, Tone\.Gain>>;/],
    ['CompactRobotOverrideDiff.gr', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bgr\?: number;/],
    ['CompactRobotOverrideDiff.sm', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bsm\?: number;/],
    ['CompactRobotOverrideDiff.db', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bdb\?: number;/],
    // Re-pinned by Robot Send Table T2 (docs/specs/ROBOT_SEND_TABLE.md assumption 1): the field list is wiring, not a band.
    ['ROBOT_SEND_FIELDS', 'src/data/robotSends.ts', /export const ROBOT_SEND_FIELDS = \['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'\] as const;/],
    ['ROBOT_SEND_LOADING_RANGES', 'src/data/robotSendLoadingRanges.ts', /export const ROBOT_SEND_LOADING_RANGES: Record<RobotSendField, SendLoadingRange>/],
    ['EXCLUSIVE_SEND_FIELDS (the roll order)', 'src/data/robotSendLoadingRanges.ts', /export const EXCLUSIVE_SEND_FIELDS = \['gritSend', 'shimmerSend', 'doubleSend'\] as const;/],
    ['ROOM_KEYS', 'src/engine/audioEngine/bypassCell.ts', /export const ROOM_KEYS = \['grit', 'shimmer', 'double'\] as const;/],
    ['ROOM_BRANCHES', 'src/engine/audioEngine/bypassCell.ts', /export const ROOM_BRANCHES: Record<RoomKey, readonly BypassKey\[\]>/],
    ['branchGains (the wet-only law)', 'src/engine/audioEngine/bypassCell.ts', /export function branchGains\(w: number\): \{ dry: number; wet: number \}/],
    ['buildRoom', 'src/engine/audioEngine/bypassCell.ts', /export function buildRoom\(/],
    ['buildBranch', 'src/engine/audioEngine/bypassCell.ts', /export function buildBranch\(/],
    ['getRoom', 'src/engine/audioEngine/bypassCell.ts', /export function getRoom\(key: RoomKey\): Room \| undefined/],
    ['roomNodes', 'src/engine/audioEngine/bypassCell.ts', /export function roomNodes\(key: RoomKey\)/],
    ['setRoomFed', 'src/engine/audioEngine/bypassCell.ts', /export function setRoomFed\(key: RoomKey, fed: boolean\): void/],
    ['setRoomReturn', 'src/engine/audioEngine/bypassCell.ts', /export function setRoomReturn\(key: RoomKey, level: number\): void/],
    ['getGlobalRoomInput', 'src/engine/audioEngine/globalFx.ts', /export function getGlobalRoomInput\(key: RoomKey\): Tone\.Gain \| null/],
    ['the feeder sets', 'src/engine/AudioEngine.ts', /const roomFeeders: Record<RoomKey, Set<string>> = \{ grit: new Set\(\), shimmer: new Set\(\), double: new Set\(\) \};/],
    // Re-pinned by Robot Send Table T4 (docs/specs/ROBOT_SEND_TABLE.md §1.2): the same five optional keys, as a type.
    ['AudioEngine.updateRobotSends takes all five', 'src/engine/AudioEngine.ts', /\bupdateRobotSends\(\s*robotId: string,\s*sends: Partial<Record<SendEngineKey, number>>,?\s*\): void/],
    ['generateRobotSends draws all five', 'src/systems/spawnSystem.ts', /export function generateRobotSends\(noiseMap: NoiseFunction2D, offset: number\): Record<RobotSendField, number>/],
    ...(['Grit', 'Shimmer', 'Double'] as const).flatMap((name): [string, string, RegExp][] => [
      [`apply${name}Send`, 'src/systems/robotOptionsActions.ts', new RegExp(`export function apply${name}Send\\(robot: Robot, localeId: string, pct: number\\): void`)],
      [`apply${name}SendValue`, 'src/systems/robotOptionsActions.ts', new RegExp(`export function apply${name}SendValue\\(robot: Robot, localeId: string, fraction: number\\): void`)],
      [`${name.toUpperCase()}_SEND_SCHEMA`, 'src/data/robotOptionsConfig.ts', new RegExp(`export const ${name.toUpperCase()}_SEND_SCHEMA: SliderLinearSchema`)],
    ]),
    // Re-pinned by Robot Send Table T8 (docs/specs/ROBOT_SEND_TABLE.md §1.5): the pool and the ranges read the field list,
    // which carries the three new sends (robotSends.test.ts pins its rows; robotSendsParity.test.ts the pool's order).
    ['the swell pool ends in the sends', 'src/types/audioSwell.ts', /SWELL_ROBOT_ATTRIBUTE_IDS: readonly SwellRobotAttributeId\[\] = \[[^\]]*'adsr\.release',\s*\.\.\.ROBOT_SEND_FIELDS,?\s*\]/],
    ['the swell ranges carry every send', 'src/data/audioSwellRanges.ts', /\.\.\.\(Object\.fromEntries\(ROBOT_SEND_FIELDS\.map\(\(field\) => \[field, \{ min: SEND_MIN, max: SEND_MAX \}\]\)\)/],
    ['RETURN_FIELD_KEYS is the four (no Colour room Return, the amendment)', 'src/data/globalAudioSeedRanges.ts', /export const RETURN_FIELD_KEYS = \['reverb\.wet', 'delay\.wet', 'chorus\.wet', 'frequencyShifter\.wet'\] as const;/],
    // The reserve-site scan's row went with the scan at Robot Send Table T4 (docs/specs/ROBOT_SEND_TABLE.md assumption 10):
    // every prime is robotSendLevels(robot), and robotSendsParity.test.ts pins what each site hands the engine.
    ['every engine reservation site primes with robotSendLevels', 'src/engine/AudioEngine.ts', /updateRobotSends\(robot\.id, robotSendLevels\(robot\)\)[\s\S]*updateRobotSends\(robotId, robotSendLevels\(robot\)\)/],
    ['both spawnSystem reservation sites prime with robotSendLevels (Robot Send Table T5)', 'src/systems/spawnSystem.ts', /updateRobotSends\(robot\.id, robotSendLevels\(robot\)\)[\s\S]*updateRobotSends\(robot\.id, robotSendLevels\(robot\)\)/],
  ];

  it.each(declared)('%s', (_description, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  it('the declared-pattern table itself fails on a rename (a pattern that matches nothing is not a pass)', () => {
    expect(read('src/types/Robot.ts')).not.toMatch(/\bgritSendX: number;/);
  });
});

/** Every identifier in every non-test source file under src/. A whole-word set, not a substring search, so a renamed
 *  `setRoomFed` is not satisfied by a `setRoomFedX` that happens to contain it. */
const sourceIdentifiers = new Set(sourceFiles('src').flatMap((file) => read(file).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
const isInSource = (symbol: string) => sourceIdentifiers.has(symbol);

describe('the names the 2026-10-21 amendment removed (no Colour master Return) are gone from source', () => {
  it.each(['setGlobalColourRoom', 'ColourRoomSettings', 'colourRoom'])('%s is not an identifier in src/', (symbol) => {
    expect(isInSource(symbol)).toBe(false);
  });
});

/** Words that are cited in backticks but are not, and should not be, names in this repo's source: third-party API
 *  members, names the spec records as deleted or not built, and file names. */
const NOT_REPO_SYMBOLS = new Set<string>([
  // Tone.js members and Web Audio names the spec cites as the nodes it builds on
  'FrequencyShifter', 'CrossFade', 'AudioParam', 'BitCrusher', 'getContext', 'setTimeout', 'rampTo',
  // Deleted by T1 (assumption 6): the Delay row's 1 - lit
  'SEND_DELAY_QUIET_THRESHOLD',
  // File and doc names, not symbols (chainCycleSearch is a test file, which sourceFiles skips)
  'chainCycleSearch', 'ROBOT_SENDS', 'ROBOT_EFFECT_SENDS', 'GLOBAL_CHAIN_GRID', 'ROBOT_DATA_GRID', 'SLIDER_VALUES', 'AUDIO_SYSTEM',
  'SESSION_STORAGE', 'GLOBAL_PEDALS', 'GLOBAL_COLOUR', 'DARK_EFFECT_BYPASS', 'TONE_EFFECTS_INVENTORY', 'CLASSIC_BAND_RETUNE',
]);

/** Inline backtick spans only (fenced blocks are illustrative sketches, covered by the table above). */
function citedSymbols(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  const identifiers = spans.flatMap((span) => span.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  // A code-shaped name only: camelCase with an inner capital, PascalCase, or UPPER_SNAKE. Plain words are not claims
  // about the source. A trailing underscore is a prefix wildcard in prose (`SEND_*`), not a name.
  const codeShaped = identifiers.filter(
    (word) =>
      !word.endsWith('_') &&
      (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(word)),
  );
  return [...new Set(codeShaped)].filter((word) => !NOT_REPO_SYMBOLS.has(word)).sort();
}

describe('every symbol the spec and the updated docs cite exists in source', () => {
  const spec = read('docs/specs/ROBOT_EFFECT_SENDS.md');
  const specDesign = spec.slice(spec.indexOf('## 1. Overview'), spec.indexOf('\n## 5.'));

  it('finds the spec sections it is scanning (§1 to §4), not an empty slice', () => {
    expect(specDesign.length).toBeGreaterThan(5000);
    expect(specDesign).toContain('### 1.3 Engine');
    expect(specDesign).toContain('## 4. Code Style');
  });

  it('extracts code-shaped names and drops plain words, wildcards and listed non-symbols (the extractor itself)', () => {
    const extracted = citedSymbols('`applyGritSend` and `robot` and `SEND_*` and `SEND_DELAY_QUIET_THRESHOLD` and `ROOM_KEYS`');
    expect(extracted).toEqual(['ROOM_KEYS', 'applyGritSend']);
  });

  it('does not read a fenced sketch as a claim about the source', () => {
    expect(citedSymbols('```ts\nconst notARealName = makeStubGain(0);\n```\nand `setRoomFed`')).toEqual(['setRoomFed']);
  });

  it('finds a missing symbol (the membership check itself)', () => {
    expect(isInSource('setRoomFed')).toBe(true);
    expect(isInSource('setRoomFedX')).toBe(false);
  });

  it('spec §1 to §4', () => {
    const symbols = citedSymbols(specDesign);
    expect(symbols.length, 'the extractor found the spec’s symbols').toBeGreaterThan(40);
    const missing = symbols.filter((symbol) => !isInSource(symbol));
    expect(missing, 'cited in docs/specs/ROBOT_EFFECT_SENDS.md §1 to §4 but absent from src/').toEqual([]);
  });

  // Only the lines that talk about this phase: these are the living docs Task 22 edits, and an unrelated stale name
  // elsewhere in them is not this phase's to fail on (robotSendsDocs scopes the same way).
  const UPDATED_DOCS = [
    'docs/AUDIO_SYSTEM.md',
    'docs/SESSION_STORAGE.md',
    'docs/COMPANIES.md',
    'docs/ROBOT_DESIGN.md',
    'docs/reference/GLOBAL_CHAIN_GRID.md',
    'docs/reference/ROBOT_DATA_GRID.md',
    'docs/reference/SLIDER_VALUES.md',
  ];
  const phaseLines = (doc: string) =>
    read(doc)
      .split('\n')
      .filter((line) => /gritSend|shimmerSend|doubleSend|apply(Grit|Shimmer|Double)Send|ROOM_KEYS|ROOM_BRANCHES|setRoomFed|setRoomReturn|getGlobalRoomInput|ROBOT_SEND_LOADING_RANGES|EXCLUSIVE_SEND_FIELDS|branchGains/.test(line))
      .join('\n');

  it('the line filter keeps a phase line and drops an unrelated one (the filter itself)', () => {
    const kept = phaseLines('docs/specs/ROBOT_EFFECT_SENDS.md');
    expect(kept).toContain('setRoomFed');
    expect(kept).not.toContain('## 6. Git & Workflow Context');
  });

  it.each(UPDATED_DOCS)('%s: the symbols on its Robot Effect Sends lines exist', (doc) => {
    const missing = citedSymbols(phaseLines(doc)).filter((symbol) => !isInSource(symbol));
    expect(missing, `${doc} cites symbols absent from src/`).toEqual([]);
  });
});

// ========================================
// (3) THE LIVING DOCS SAY WHAT THE CODE NOW DOES   (RED until Task 22)
// ========================================

describe('GLOBAL_CHAIN_GRID.md: three effect rooms beside the chain (RED until Task 22)', () => {
  const grid = read('docs/reference/GLOBAL_CHAIN_GRID.md');
  const lines = grid.split('\n');
  const chainLine = lines.find((line) => line.startsWith('**Global chain order')) ?? '';
  const row = (effect: string, param: RegExp) =>
    lines.find((line) => line.startsWith(`| ${effect} |`) && param.test(line.split('|')[3] ?? '')) ?? '';

  it('finds the chain-order line and the five rows, not empty strings (the lookups themselves)', () => {
    expect(chainLine.length).toBeGreaterThan(100);
    for (const [effect, param] of [['Distortion', /wet/], ['Chebyshev', /wet/], ['BitCrusher', /wet/], ['Chorus', /wet/], ['FrequencyShifter', /wet/]] as const) {
      expect(row(effect, param), `${effect} wet row`).not.toBe('');
    }
  });

  it('the chain-order line is the seven-stage dry chain: the five room effects are not stages in it', () => {
    expect(chainLine).toContain('High-Pass Filter → filter cut → AutoWah → Phaser → Tremolo → Vibrato → Compressor → StereoWidener → Limiter');
    for (const effect of ['Distortion →', 'Chebyshev →', 'BitCrusher →', 'Chorus →', 'FrequencyShifter →']) {
      expect(chainLine, effect).not.toContain(effect);
    }
  });

  it.each(['Distortion', 'Chebyshev', 'BitCrusher'])('the %s wet row is a branch level in the Colour room', (effect) => {
    expect(row(effect, /wet/)).toMatch(/Colour room/);
  });

  it.each([['Chorus', 'Double'], ['FrequencyShifter', 'Shimmer']])('the %s wet row is the %s room Return', (effect, room) => {
    const line = row(effect, /wet/);
    expect(line).toMatch(new RegExp(`${room} room`));
    expect(line).toMatch(/\bRETURN\b/);
  });

  it('footnote 2 points the old Reverb and Delay bands at the per-robot send table', () => {
    const footnote = lines.find((line) => line.startsWith('² ')) ?? '';
    expect(footnote.length).toBeGreaterThan(100);
    expect(footnote).toContain('`ROBOT_SEND_LOADING_RANGES`');
    expect(footnote).toContain('src/data/robotSendLoadingRanges.ts');
  });
});

describe('AUDIO_SYSTEM.md: the three effect rooms and their sends (RED until Task 22)', () => {
  const text = read('docs/AUDIO_SYSTEM.md');

  it.each(['Colour room', 'Shimmer room', 'Double room'])('names the %s', (room) => {
    expect(text).toContain(room);
  });

  it.each([...NEW_SENDS, 'ROOM_KEYS', 'setRoomFed'])('names `%s`', (symbol) => {
    expect(text).toContain(`\`${symbol}\``);
  });
});

describe('SESSION_STORAGE.md: the three new sends are persisted (RED until Task 22)', () => {
  const text = read('docs/SESSION_STORAGE.md');
  const neverPersisted = text.split('\n').find((line) => line.startsWith('**Explicitly never persisted:**')) ?? '';

  it('finds the never-persisted paragraph, not an empty line', () => {
    expect(neverPersisted.length).toBeGreaterThan(100);
  });

  it.each(NEW_SENDS)('names `%s` as a persisted field', (field) => {
    expect(text).toContain(`\`${field}\``);
  });

  it.each(NEW_SENDS)('does not list `%s` among the never-persisted fields', (field) => {
    expect(neverPersisted).not.toContain(`\`${field}\``);
  });
});
