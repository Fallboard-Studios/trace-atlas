import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/todo/roadmap.md item 50.1 (Robot Articulation), docs/tasks/ROBOT_ARTICULATION.md Task 13. A docs task has
// no behaviour to test, so this makes its acceptance criteria executable (robotPanDocs.test.ts is the pattern):
//   (1) the source-scan guardrail: nothing on the robot body reads an articulation field or the bus link;
//   (2) every symbol the spec and the updated docs cite exists in source, so a rename cannot leave a stale doc;
//   (3) the docs say what the code now does (AUDIO_SYSTEM no longer claims the bus filter has no live path;
//       SESSION_STORAGE names the three new persisted fields).
// Groups (1) and (2) are green from the moment Phase 3 lands. Group (3)'s doc-text cases are written against the
// text Task 15 produces, so they are RED until Task 15 lands. That is intended.

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

describe('nothing on the robot body reads the articulation fields or the bus link (Visual Mapping is unchanged)', () => {
  const bodyFiles = [...sourceFiles('src/components/robot/gem'), ...sourceFiles('src/components/robot/RobotBody.tsx')];

  it('scans the gem folder and RobotBody, not an empty list', () => {
    expect(bodyFiles).toContain('src/components/robot/RobotBody.tsx');
    expect(bodyFiles).toContain('src/components/robot/gem/bodyLineDials.ts');
    expect(bodyFiles.length).toBeGreaterThan(5);
  });

  it('treats a comment as no read, and a code reference as a read (the stripper itself)', () => {
    expect(withoutComments('// portamento is audio only\nconst a = 1;')).not.toMatch(/portamento/);
    expect(withoutComments('/* filterQ */ const a = 1;')).not.toMatch(/filterQ/);
    expect(withoutComments('const a = robot.audioAttributes.portamento;')).toMatch(/portamento/);
  });

  it.each(bodyFiles)('%s reads none of portamento, filterQ, filterType, attackCurve, releaseCurve, bus.frequency', (file) => {
    const code = withoutComments(read(file));
    for (const name of ['portamento', 'filterQ', 'filterType', 'attackCurve', 'releaseCurve']) {
      expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(code).not.toMatch(/bus\.frequency/);
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

describe('the named Robot Articulation symbols are declared where the spec says they are', () => {
  const declared: [description: string, file: string, pattern: RegExp][] = [
    ['EnvelopeCurveName', 'src/types/Robot.ts', /export type EnvelopeCurveName = 'linear' \| 'exponential' \| 'sine' \| 'cosine' \| 'bounce' \| 'ripple' \| 'step';/],
    ['ENVELOPE_CURVE_NAMES', 'src/types/Robot.ts', /export const ENVELOPE_CURVE_NAMES\b/],
    ['RobotFilterType', 'src/types/Robot.ts', /export type RobotFilterType = 'lowpass' \| 'bandpass' \| 'highpass';/],
    ['ROBOT_FILTER_TYPES', 'src/types/Robot.ts', /export const ROBOT_FILTER_TYPES\b/],
    ['ADSREnvelope.attackCurve', 'src/types/Robot.ts', /\battackCurve\?: EnvelopeCurveName;/],
    ['ADSREnvelope.releaseCurve', 'src/types/Robot.ts', /\breleaseCurve\?: EnvelopeCurveName;/],
    ['AudioAttributes.filterQ', 'src/types/Robot.ts', /\bfilterQ\?: number;/],
    ['AudioAttributes.filterType', 'src/types/Robot.ts', /\bfilterType\?: RobotFilterType;/],
    ['AudioAttributes.portamento', 'src/types/Robot.ts', /\bportamento\?: number;/],
    ['the seventh robot LFO target', 'src/types/lfo.ts', /\| 'bus\.frequency';/],
    ['ROBOT_LFO_TARGET_IDS carries it', 'src/types/lfo.ts', /ROBOT_LFO_TARGET_IDS[\s\S]*?'bus\.frequency',[\s\S]*?\]/],
    ['CompanyOptionsSnapshot.portamento', 'src/types/Company.ts', /\bportamento\?: number;/],
    ['CompanyOptionsSnapshot.filterFreq', 'src/types/Company.ts', /\bfilterFreq\?: number;/],
    ['CompanyOptionsSnapshot.filterQ', 'src/types/Company.ts', /\bfilterQ\?: number;/],
    ['CompanyOptionsSnapshot.filterType', 'src/types/Company.ts', /\bfilterType\?: RobotFilterType;/],
    ['RobotAudioOverrideDiff.portamento', 'src/types/session.ts', /\bportamento\?: number;/],
    ['RobotAudioOverrideDiff.filterQ', 'src/types/session.ts', /\bfilterQ\?: number;/],
    ['RobotAudioOverrideDiff.filterType', 'src/types/session.ts', /\bfilterType\?: RobotFilterType;/],
    ['CompactRobotOverrideDiff.po', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bpo\?: number;/],
    ['CompactRobotOverrideDiff.fq', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bfq\?: number;/],
    ['CompactRobotOverrideDiff.ft', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bft\?: RobotFilterType;/],
    ['CompactADSR.ac', 'src/utils/sessionShareUtils.ts', /\bac\?: EnvelopeCurveName;/],
    ['CompactADSR.rc', 'src/utils/sessionShareUtils.ts', /\brc\?: EnvelopeCurveName;/],
    ['PORTAMENTO_MIN', 'src/constants/index.ts', /export const PORTAMENTO_MIN\b/],
    ['PORTAMENTO_MAX', 'src/constants/index.ts', /export const PORTAMENTO_MAX\b/],
    ['ENVELOPE_TIME_MAX_SECONDS', 'src/constants/index.ts', /export const ENVELOPE_TIME_MAX_SECONDS\b/],
    ['ROBOT_BUS_FILTER_FREQ_RANGE', 'src/constants/index.ts', /export const ROBOT_BUS_FILTER_FREQ_RANGE\b/],
    ['ROBOT_BUS_FILTER_Q_RANGE', 'src/constants/index.ts', /export const ROBOT_BUS_FILTER_Q_RANGE\b/],
    ['FILTER_RAMP_SECONDS', 'src/constants/index.ts', /export const FILTER_RAMP_SECONDS\b/],
    ['toToneEnvelope', 'src/engine/audioEngine/compositeVoice.ts', /export function toToneEnvelope\(/],
    ['createCompositeVoice portamento', 'src/engine/audioEngine/compositeVoice.ts', /export function createCompositeVoice\([^)]*\bportamento = 0,/],
    ['resolveBusFilterQ', 'src/engine/audioEngine/busFilter.ts', /export function resolveBusFilterQ\(/],
    ['resolveBusFilterType', 'src/engine/audioEngine/busFilter.ts', /export function resolveBusFilterType\(/],
    ['AudioEngine.updateVoicePortamento', 'src/engine/AudioEngine.ts', /\bupdateVoicePortamento\(robotId: string, seconds: number\): void/],
    ['AudioEngine.updateRobotBusFilter', 'src/engine/AudioEngine.ts', /\bupdateRobotBusFilter\(robotId: string, patch: \{ frequency\?: number; Q\?: number; type\?: RobotFilterType \}\): void/],
    ['AudioEngine.reserveVoice articulation', 'src/engine/AudioEngine.ts', /\barticulation\?: \{ portamento\?: number; filterQ\?: number; filterType\?: RobotFilterType \}/],
    ['AudioEngine rampOrSet', 'src/engine/audioEngine/voiceEntry.ts', /export function rampOrSet\(/],
    ['the bus.frequency modulation target', 'src/engine/AudioEngine.ts', /target === 'bus\.frequency'/],
    ['lfoEngine isFilterTarget covers the bus', 'src/engine/lfoEngine.ts', /function isFilterTarget\([^)]*\): boolean \{[^}]*bus/],
    ['lfoEngine bus output range', 'src/engine/lfoEngine.ts', /target === 'bus\.frequency'\) return ROBOT_BUS_FILTER_FREQ_RANGE/],
    ['seedCurve', 'src/systems/spawnSystem.ts', /function seedCurve\(/],
    ['GLIDER_THRESHOLD', 'src/systems/spawnSystem.ts', /const GLIDER_THRESHOLD\b/],
    ['FILTER_ACCENT_THRESHOLD', 'src/systems/spawnSystem.ts', /const FILTER_ACCENT_THRESHOLD\b/],
    ['OPEN_FILTER_FREQ_RANGE', 'src/systems/spawnSystem.ts', /const OPEN_FILTER_FREQ_RANGE\b/],
    ['ACCENT_FILTER_FREQ_RANGE', 'src/systems/spawnSystem.ts', /const ACCENT_FILTER_FREQ_RANGE\b/],
    ['SHAPED_ATTACK_RANGE', 'src/systems/spawnSystem.ts', /const SHAPED_ATTACK_RANGE\b/],
    ['SHAPED_RELEASE_RANGE', 'src/systems/spawnSystem.ts', /const SHAPED_RELEASE_RANGE\b/],
    ['PORTAMENTO_SEED_RANGE', 'src/systems/spawnSystem.ts', /const PORTAMENTO_SEED_RANGE\b/],
    ['robotLfoQuietThresholdForTarget', 'src/systems/spawnSystem.ts', /function robotLfoQuietThresholdForTarget\(/],
    ['applyPortamento', 'src/systems/robotOptionsActions.ts', /export function applyPortamento\(/],
    ['applyBusFilter', 'src/systems/robotOptionsActions.ts', /export function applyBusFilter\(/],
    ['PORTAMENTO_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const PORTAMENTO_SCHEMA\b/],
    ['ATTACK_CURVE_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const ATTACK_CURVE_SCHEMA\b/],
    ['RELEASE_CURVE_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const RELEASE_CURVE_SCHEMA\b/],
    ['BUS_FILTER_PANEL_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const BUS_FILTER_PANEL_SCHEMA\b/],
    ['BUS_CUTOFF_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const BUS_CUTOFF_SCHEMA\b/],
    ['BUS_RESONANCE_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const BUS_RESONANCE_SCHEMA\b/],
    ['BUS_FILTER_TYPE_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const BUS_FILTER_TYPE_SCHEMA\b/],
    ['the busFilter subsection id', 'src/stores/uiStore.ts', /\| 'busFilter'/],
    ['Source gains busFilter, last', 'src/data/robotSubsectionConfig.ts', /\{ id: 'busFilter', content: 'probe\.source\.filter', accordion: 'probe\.source\.filter' \},\s*\]/],
    ['BusFilterDrawer', 'src/components/robot/BusFilterDrawer.tsx', /export const BusFilterDrawer = memo\(/],
    ['PingContourDrawer portamento prop', 'src/components/robot/PingContourDrawer.tsx', /\bportamento: number;/],
    ['useCompanyOptions onPortamentoChange', 'src/components/company/useCompanyOptions.ts', /\bonPortamentoChange: \(seconds: number\) => void;/],
    ['useCompanyOptions onBusFilterChange', 'src/components/company/useCompanyOptions.ts', /\bonBusFilterChange: \(patch: BusFilterPatch\) => void;/],
  ];

  it.each(declared)('%s', (_description, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });
});

/** Every identifier in every non-test source file under src/. A whole-word set, not a substring search, so a
 *  renamed `updateRobotBusFilter` is not satisfied by an `updateRobotBusFilterX` that happens to contain it. */
const sourceIdentifiers = new Set(sourceFiles('src').flatMap((file) => read(file).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
const isInSource = (symbol: string) => sourceIdentifiers.has(symbol);

/** Words that are cited in backticks but are not, and should not be, names in this repo's source: third-party
 *  API members, names the spec records as deliberately NOT built ("Ask first" / "Not Doing"), and prose terms. */
const NOT_REPO_SYMBOLS = new Set([
  // Tone members the engine reaches through, spelled in the spec's prose
  'decayCurve',
  // Deliberately absent: names the Audio Load section records as removed (the robot-LFO cap went with the LFO Bank)
  'lfoAllowed', 'maxRobotLfos',
  // Deleted by Robot Send Table T14 (docs/specs/ROBOT_SEND_TABLE.md §1.3): the named send actions are applySend /
  // applySendValue. AUDIO_SYSTEM.md's swell-pool line and COMPANIES.md's action list still cite them until its T15.
  'applyReverbSend', 'applyDelaySend', 'applyReverbSendValue', 'applyDelaySendValue',
  // File names, not symbols: this test file (sourceFiles skips *.test.ts) and the planning docs
  'robotArticulationDocs', 'SLIDER_VALUES', 'ROBOT_ARTICULATION',
]);

/** Inline backtick spans only (fenced blocks are illustrative sketches, covered by the table above). */
function citedSymbols(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  const identifiers = spans.flatMap((span) => span.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  // A code-shaped name only: camelCase with an inner capital, PascalCase, or UPPER_SNAKE. Plain words
  // ("robot", "id", "true", "number") are not claims about the source.
  // A trailing underscore is a prefix wildcard in prose (`LOAD_*`), not a name.
  const codeShaped = identifiers.filter(
    (word) =>
      !word.endsWith('_') &&
      (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(word)),
  );
  return [...new Set(codeShaped)].filter((word) => !NOT_REPO_SYMBOLS.has(word)).sort();
}

describe('every symbol the spec and the updated docs cite exists in source', () => {
  const spec = read('docs/specs/ROBOT_ARTICULATION.md');
  const specDesign = spec.slice(spec.indexOf('## 1. Overview'), spec.indexOf('\n## 5.'));

  it('finds the spec sections it is scanning (§1 to §4), not an empty slice', () => {
    expect(specDesign.length).toBeGreaterThan(5000);
    expect(specDesign).toContain('### 1.3 Engine');
    expect(specDesign).toContain('## 4. Code Style');
  });

  it('extracts code-shaped names and drops plain words and listed non-symbols (the extractor itself)', () => {
    const extracted = citedSymbols('`applyBusFilter` and `robot` and `LOAD_*` and `maxRobotLfos` and `PORTAMENTO_MAX`');
    expect(extracted).toEqual(['PORTAMENTO_MAX', 'applyBusFilter']);
  });

  it('spec §1 to §4', () => {
    const symbols = citedSymbols(specDesign);
    expect(symbols.length, 'the extractor found the spec’s symbols').toBeGreaterThan(30);
    const missing = symbols.filter((symbol) => !isInSource(symbol));
    expect(missing, 'cited in docs/specs/ROBOT_ARTICULATION.md but absent from src/').toEqual([]);
  });

  // Only the lines that talk about the new fields: these are the living docs Task 15 edits, and an unrelated
  // stale name elsewhere in them is not this phase's to fail on (robotPanDocs scopes the same way).
  const UPDATED_DOCS = [
    'docs/AUDIO_SYSTEM.md',
    'docs/SESSION_STORAGE.md',
    'docs/COMPANIES.md',
    'docs/ROBOT_DESIGN.md',
    'docs/PROCEDURAL_GENERATION.md',
    'docs/reference/ROBOT_DATA_GRID.md',
    'docs/reference/SLIDER_VALUES.md',
  ];
  const articulationLines = (doc: string) =>
    read(doc)
      .split('\n')
      .filter((line) => /portamento|filterQ|filterType|attackCurve|releaseCurve|bus\.frequency|busFilter|updateRobotBusFilter|updateVoicePortamento/i.test(line))
      .join('\n');

  it.each(UPDATED_DOCS)('%s: the symbols on its articulation lines exist', (doc) => {
    const missing = citedSymbols(articulationLines(doc)).filter((symbol) => !isInSource(symbol));
    expect(missing, `${doc} cites symbols absent from src/`).toEqual([]);
  });
});

// ========================================
// (3) THE DOCS SAY WHAT THE CODE NOW DOES   (RED until Task 15)
// ========================================

describe('AUDIO_SYSTEM.md: the bus filter has a live path and a UI control', () => {
  const text = read('docs/AUDIO_SYSTEM.md');

  it('no longer says the cutoff has no live update path or UI control', () => {
    expect(text).not.toContain('no live update path or UI control');
  });
});

describe('SESSION_STORAGE.md: the three new persisted fields are named', () => {
  const text = read('docs/SESSION_STORAGE.md');

  it.each(['portamento', 'filterQ', 'filterType'])('names `%s`', (field) => {
    expect(text).toContain(`\`${field}\``);
  });
});
