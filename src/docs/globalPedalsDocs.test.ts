import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GLOBAL_LFO_TARGET_IDS } from '@/types/lfo';
import { SWELL_GLOBAL_TARGET_IDS, SWELL_ROBOT_ATTRIBUTE_IDS } from '@/types/audioSwell';

// Proposed roadmap 50.6 (Global Pedals), docs/tasks/GLOBAL_PEDALS.md Task 13. A docs task has no behaviour to test, so
// this makes its acceptance criteria executable (globalModulationDocs.test.ts is the pattern):
//   (1) the source-scan guardrail: nothing on the robot body reads a pedal (Visual Mapping is unchanged, and the
//       pedals are one global chain, never per robot);
//   (2) no pedal is an LFO or swell target;
//   (3) every symbol the spec names is declared where it says, so a rename cannot leave a stale doc;
//   (4) the sixteen range-table fields and the sixteen grid rows are all there, in chain order;
//   (5) the living docs name the pedals.
// Groups (1) to (4) are green from the moment they land. Group (5)'s cases are written against the text Task 17
// produces and are RED until it lands; their titles say so.

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

/** Source with comments removed, so a comment that names a pedal is not a read of it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const PEDALS = ['chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'stereoWidener'] as const;
/** The names a file reads, of the five pedal keys. */
const pedalReads = (code: string) => PEDALS.filter((name) => new RegExp(`\\b${name}\\b`).test(code));
/** The ids, of a target pool, that belong to a pedal. */
const pedalIds = (ids: readonly string[]) => ids.filter((id) => /^(chorus|tremolo|vibrato|frequencyShifter|stereoWidener)\b/.test(id));

const PEDAL_FIELDS = [
  'chorus.rate', 'chorus.delayTime', 'chorus.depth', 'chorus.spread', 'chorus.feedback', 'chorus.wet',
  'tremolo.rate', 'tremolo.depth', 'tremolo.spread', 'tremolo.wet',
  'vibrato.rate', 'vibrato.depth', 'vibrato.wet',
  'frequencyShifter.shift', 'frequencyShifter.wet',
  'stereoWidener.width',
] as const;

const SETTER: Record<(typeof PEDALS)[number], [effect: string, setter: string]> = {
  chorus: ['Chorus', 'setGlobalChorus'],
  tremolo: ['Tremolo', 'setGlobalTremolo'],
  vibrato: ['Vibrato', 'setGlobalVibrato'],
  frequencyShifter: ['FrequencyShifter', 'setGlobalFrequencyShifter'],
  stereoWidener: ['StereoWidener', 'setGlobalStereoWidener'],
};

// ========================================
// (1) THE SOURCE-SCAN GUARDRAIL
// ========================================

describe('nothing on the robot body reads a Global Pedal (Visual Mapping is unchanged)', () => {
  const bodyFiles = [...sourceFiles('src/components/robot/gem'), ...sourceFiles('src/components/robot/RobotBody.tsx')];

  it('scans the gem folder and RobotBody, not an empty list', () => {
    expect(bodyFiles).toContain('src/components/robot/RobotBody.tsx');
    expect(bodyFiles).toContain('src/components/robot/gem/bodyLineDials.ts');
    expect(bodyFiles.length).toBeGreaterThan(5);
  });

  it('treats a comment as no read, and a code reference as a read (the stripper itself)', () => {
    expect(pedalReads(withoutComments('// chorus is audio only\nconst a = 1;'))).toEqual([]);
    expect(pedalReads(withoutComments('/* stereoWidener, tremolo */ const a = 1;'))).toEqual([]);
    expect(pedalReads(withoutComments('const a = settings.vibrato;'))).toEqual(['vibrato']);
    expect(pedalReads(withoutComments('const a = globalAudio.frequencyShifter; // audio only'))).toEqual(['frequencyShifter']);
  });

  it('catches a planted read in a real body file (the scan itself can fail)', () => {
    const planted = `${read('src/components/robot/RobotBody.tsx')}\nconst w = globalAudio.stereoWidener.width;\n`;
    expect(pedalReads(withoutComments(planted))).toEqual(['stereoWidener']);
  });

  it.each(bodyFiles)('%s reads none of the five pedals', (file) => {
    expect(pedalReads(withoutComments(read(file)))).toEqual([]);
  });
});

// ========================================
// (2) NO PEDAL IS A MODULATION OR SWELL TARGET
// ========================================

describe('the pedals are one global chain, never a modulation or swell target (spec non-goals)', () => {
  it.each(['src/types/lfo.ts', 'src/types/audioSwell.ts', 'src/data/audioSwellRanges.ts'])('%s names no pedal', (file) => {
    expect(pedalReads(withoutComments(read(file)))).toEqual([]);
  });

  it('no LFO or swell target id belongs to a pedal (the pools, as the engine reads them)', () => {
    const ids: string[] = [...GLOBAL_LFO_TARGET_IDS, ...SWELL_GLOBAL_TARGET_IDS, ...SWELL_ROBOT_ATTRIBUTE_IDS];
    expect(ids.length).toBeGreaterThan(20);
    expect(pedalIds(ids)).toEqual([]);
  });

  it.each(PEDALS)('the target check can fail (a %s id would be caught)', (pedal) => {
    expect(pedalIds([...GLOBAL_LFO_TARGET_IDS, `${pedal}.wet`])).toEqual([`${pedal}.wet`]);
  });
});

// ========================================
// (3) EVERY NAMED SYMBOL IS DECLARED WHERE THE SPEC SAYS
// ========================================

describe('the named Global Pedals symbols are declared where the spec says they are', () => {
  const declared: [description: string, file: string, pattern: RegExp][] = [
    ['ChorusSettings', 'src/types/globalAudio.ts', /export interface ChorusSettings \{[^}]*\brate: number;[^}]*\bdelayTime: number;[^}]*\bdepth: number;[^}]*\bspread: number;[^}]*\bfeedback: number;[^}]*\bwet: number;[^}]*\bsync\?: NoteValue;/],
    ['TremoloSettings', 'src/types/globalAudio.ts', /export interface TremoloSettings \{[^}]*\brate: number;[^}]*\bdepth: number;[^}]*\bspread: number;[^}]*\bwet: number;[^}]*\bsync\?: NoteValue;/],
    ['VibratoSettings', 'src/types/globalAudio.ts', /export interface VibratoSettings \{[^}]*\brate: number;[^}]*\bdepth: number;[^}]*\bwet: number;[^}]*\bsync\?: NoteValue;/],
    ['FrequencyShifterSettings', 'src/types/globalAudio.ts', /export interface FrequencyShifterSettings \{[^}]*\bshift: number;[^}]*\bwet: number;/],
    ['StereoWidenerSettings', 'src/types/globalAudio.ts', /export interface StereoWidenerSettings \{[^}]*\bwidth: number;/],
    ...PEDALS.map((key): [string, string, RegExp] => [
      `GlobalAudioSettings.${key}`,
      'src/types/globalAudio.ts',
      new RegExp(`\\b${key}: ${SETTER[key][0]}Settings;`),
    ]),
    ['PEDAL_RATE_RANGE_HZ', 'src/types/globalAudio.ts', /export const PEDAL_RATE_RANGE_HZ = PHASER_RATE_RANGE_HZ;/],
    ['PEDAL_RATE_STEP_HZ', 'src/types/globalAudio.ts', /export const PEDAL_RATE_STEP_HZ = PHASER_RATE_STEP_HZ;/],
    ['SyncedRate', 'src/utils/tempoSync.ts', /export interface SyncedRate \{/],
    ['resolveSyncedRateHz', 'src/utils/tempoSync.ts', /export function resolveSyncedRateHz\(field: SyncedRate, bpm: number, range: RateRange\): number/],
    ['allowedRateNoteValues', 'src/utils/tempoSync.ts', /export function allowedRateNoteValues\(bpm: number, range: RateRange\): NoteValue\[\]/],
    ['syncedRateToSync', 'src/utils/tempoSync.ts', /export function syncedRateToSync<T extends SyncedRate>\(field: T, bpm: number, range: RateRange\): T/],
    ['syncedRateToFree', 'src/utils/tempoSync.ts', /export function syncedRateToFree<T extends SyncedRate>\(field: T, bpm: number, range: RateRange, step: number\): T/],
    ['MOTION_PEDALS, in chain order', 'src/utils/globalAudioSeed.ts', /export const MOTION_PEDALS = \['chorus', 'tremolo', 'vibrato', 'frequencyShifter'\] as const;/],
    ['MAX_LIT_PEDALS', 'src/utils/globalAudioSeed.ts', /export const MAX_LIT_PEDALS = 2;/],
    ['PEDAL_SYNC_ODDS', 'src/utils/globalAudioSeed.ts', /export const PEDAL_SYNC_ODDS = /],
    ['PEDAL_LIT_EDGE covers the motion pedals', 'src/utils/globalAudioSeed.ts', /export const PEDAL_LIT_EDGE: Record<'autoWah' \| 'phaser' \| MotionPedal, number>/],
    ['the Chorus node', 'src/engine/audioEngine/globalFx.ts', /let _globalChorus: Tone\.Chorus \| null/],
    ['the Tremolo node', 'src/engine/audioEngine/globalFx.ts', /let _globalTremolo: Tone\.Tremolo \| null/],
    ['the Vibrato node', 'src/engine/audioEngine/globalFx.ts', /let _globalVibrato: Tone\.Vibrato \| null/],
    ['the FrequencyShifter node', 'src/engine/audioEngine/globalFx.ts', /let _globalFrequencyShifter: Tone\.FrequencyShifter \| null/],
    ['the StereoWidener node', 'src/engine/audioEngine/globalFx.ts', /let _globalStereoWidener: Tone\.StereoWidener \| null/],
    ['setGlobalChorus', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalChorus\(params: Partial<Omit<ChorusSettings, 'sync'>>\): void/],
    ['setGlobalTremolo', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalTremolo\(params: Partial<Omit<TremoloSettings, 'sync'>>\): void/],
    ['setGlobalVibrato', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalVibrato\(params: Partial<Omit<VibratoSettings, 'sync'>>\): void/],
    ['setGlobalFrequencyShifter', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalFrequencyShifter\(params: Partial<FrequencyShifterSettings>\): void/],
    ['setGlobalStereoWidener', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalStereoWidener\(params: Partial<StereoWidenerSettings>\): void/],
    ['the dry chain: the motion pedals after the Phaser, Width between the Compressor and the Limiter', 'src/engine/audioEngine/globalFx.ts', /const chainNodes = \[[^\]]*_globalPhaser,\s*_globalChorus,\s*_globalTremolo,\s*_globalVibrato,\s*_globalFrequencyShifter,[^\]]*_globalCompressor,\s*_globalStereoWidener,\s*_globalLimiter,/],
    ['the Controlled-Decay join is the widener, the Limiter its fallback', 'src/engine/audioEngine/globalFx.ts', /controlledDecay \? \(_globalStereoWidener \?\? _globalLimiter\) : _globalCompressor/],
    ...PEDALS.map((key): [string, string, RegExp] => [
      `AudioEngine exposes ${SETTER[key][1]}`,
      'src/engine/AudioEngine.ts',
      new RegExp(`\\b${SETTER[key][1]},`),
    ]),
    ['SYNCED_RATE_KEYS', 'src/stores/audioStore.ts', /export const SYNCED_RATE_KEYS = \['phaser', 'chorus', 'tremolo', 'vibrato'\] as const;/],
    ['setPedalSyncMode on the store', 'src/stores/audioStore.ts', /setPedalSyncMode: \(key: SyncedRateKey, synced: boolean\) => void;/],
    ...(['chorus', 'tremolo', 'vibrato'] as const).flatMap((key): [string, string, RegExp][] => [
      [`the store routes ${key} through the resolver`, 'src/stores/audioStore.ts', new RegExp(`\\b${key}: setGlobalRateResolved\\('${key}'\\),`)],
      [`the store pushes ${key} on apply`, 'src/stores/audioStore.ts', new RegExp(`AudioEngine\\.${SETTER[key][1]}\\(resolvedRateBlock<'${key}'>\\(globalAudio\\.${key}, bpm\\)\\)`)],
    ]),
    ...(['frequencyShifter', 'stereoWidener'] as const).flatMap((key): [string, string, RegExp][] => [
      [`the store routes ${key} to the engine`, 'src/stores/audioStore.ts', new RegExp(`\\b${key}: AudioEngine\\.${SETTER[key][1]},`)],
      [`the store pushes ${key} on apply`, 'src/stores/audioStore.ts', new RegExp(`AudioEngine\\.${SETTER[key][1]}\\(globalAudio\\.${key}\\)`)],
    ]),
    ['sanitizeSyncedRate', 'src/utils/sessionDiff.ts', /function sanitizeSyncedRate<T extends SyncedRate>\(block: T\): T/],
    ['the restore path sanitises every synced block', 'src/utils/sessionDiff.ts', /for \(const key of SYNCED_RATE_KEYS\) \{[^}]*sanitizeSyncedRate\(globalAudio\[key\]\)[\s\S]*\.\.\.sanitizeSyncedRateBlocks\(filled\)/],
    ['the restore path defaults globalAudio', 'src/utils/sessionDiff.ts', /withGlobalAudioDefaults\(payload\.globalAudio\)/],
    ['the share decoder defaults globalAudio', 'src/utils/sessionShareUtils.ts', /withGlobalAudioDefaults\(compact\.g\)/],
    ...PEDAL_FIELDS.flatMap((field): [string, string, RegExp][] => [
      [`seed range ${field}`, 'src/data/globalAudioSeedRanges.ts', new RegExp(`^\\s*'${field.replace('.', '\\.')}': \\{`, 'm')],
      [`loading range ${field}`, 'src/data/globalAudioLoadingRanges.ts', new RegExp(`^\\s*'${field.replace('.', '\\.')}': \\{`, 'm')],
    ]),
    ['the five keys in AudioRigEffectKey', 'src/data/audioRigConfig.ts', /export type AudioRigEffectKey =[^;]*'chorus'[^;]*'tremolo'[^;]*'vibrato'[^;]*'frequencyShifter'[^;]*'stereoWidener'/],
    ['the shift is a centred-zero slider', 'src/data/audioRigConfig.ts', /id: 'frequencyShifter\.shift', type: 'sliderCenteredZero'/],
    ...(['chorus', 'tremolo', 'vibrato', 'frequencyShifter'] as const).map((key): [string, string, RegExp] => [
      `no new trait: ${key} wears spectral`,
      'src/components/panels/screen/console/AudioRigDrawer.tsx',
      new RegExp(`const AUDIO_RIG_EFFECT_TRAIT[^=]*=\\s*\\{[^}]*\\b${key}: 'spectral',`),
    ]),
    ['no new trait: stereoWidener wears output', 'src/components/panels/screen/console/AudioRigDrawer.tsx', /const AUDIO_RIG_EFFECT_TRAIT[^=]*=\s*\{[^}]*\bstereoWidener: 'output',/],
    ['SYNCED_RATE_BLOCKS is the store keys', 'src/components/panels/screen/console/AudioRigDrawer.tsx', /const SYNCED_RATE_BLOCKS: ReadonlySet<AudioRigEffectKey> = new Set<AudioRigEffectKey>\(SYNCED_RATE_KEYS\);/],
    ['FLEET_PARAMS_SUBSECTIONS.modulation, the six pedals in chain order', 'src/components/panels/screen/nav/navActions.ts', /\bmodulation: \[[^\]]*'autoWah'[^\]]*'phaser'[^\]]*'chorus'[^\]]*'tremolo'[^\]]*'vibrato'[^\]]*'frequencyShifter'/],
    ['FLEET_PARAMS_SUBSECTIONS.output, Width between the Compressor and the Limiter', 'src/components/panels/screen/nav/navActions.ts', /\boutput: \[[^\]]*'compressor'[^\]]*'stereoWidener'[^\]]*'limiter'/],
  ];

  it.each(declared)('%s', (_description, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  it('the declared-pattern table itself fails on a rename (a pattern that matches nothing is not a pass)', () => {
    const renamed = (file: string, from: string, to: string) => read(file).replace(from, to);
    const row = (description: string) => declared.find(([d]) => d === description)!;
    for (const [description, from] of [
      ['PEDAL_RATE_RANGE_HZ', 'PEDAL_RATE_RANGE_HZ ='],
      ['MAX_LIT_PEDALS', 'MAX_LIT_PEDALS ='],
      ['PEDAL_SYNC_ODDS', 'PEDAL_SYNC_ODDS ='],
      ['resolveSyncedRateHz', 'function resolveSyncedRateHz('],
      ['setGlobalChorus', 'function setGlobalChorus('],
      ['setGlobalTremolo', 'function setGlobalTremolo('],
      ['setGlobalVibrato', 'function setGlobalVibrato('],
      ['setGlobalFrequencyShifter', 'function setGlobalFrequencyShifter('],
      ['setGlobalStereoWidener', 'function setGlobalStereoWidener('],
      ['sanitizeSyncedRate', 'function sanitizeSyncedRate<'],
      ['SYNCED_RATE_KEYS', 'SYNCED_RATE_KEYS ='],
    ] as const) {
      const [, file, pattern] = row(description);
      expect(read(file), description).toMatch(pattern);
      expect(renamed(file, from, from.replace(/([A-Za-z_]+)/, '$1X')), `${description} renamed`).not.toMatch(pattern);
    }
  });
});

// ========================================
// (4) THE SIXTEEN FIELDS ARE COVERED
// ========================================

describe('both range tables and the grid cover all sixteen pedal fields', () => {
  const seedKeys = read('src/data/globalAudioSeedRanges.ts');
  const loadingKeys = read('src/data/globalAudioLoadingRanges.ts');
  const hasRow = (table: string, field: string) => new RegExp(`^\\s*'${field.replace('.', '\\.')}': \\{`, 'm').test(table);

  it('is sixteen fields: six Chorus, four Tremolo, three Vibrato, two shifter, one Width', () => {
    expect(PEDAL_FIELDS).toHaveLength(16);
    expect(PEDALS.map((key) => PEDAL_FIELDS.filter((f) => f.startsWith(`${key}.`)).length)).toEqual([6, 4, 3, 2, 1]);
  });

  it.each(PEDAL_FIELDS)('%s has a row in the seed table and in the loading table', (field) => {
    expect(hasRow(seedKeys, field), `seed ${field}`).toBe(true);
    expect(hasRow(loadingKeys, field), `loading ${field}`).toBe(true);
  });

  it('finds a missing row (the check itself)', () => {
    expect(hasRow("  'chorus.wet': { min: 0, max: 1 },", 'chorus.wet')).toBe(true);
    expect(hasRow("  'chorus.wet': { min: 0, max: 1 },", 'tremolo.wet')).toBe(false);
    expect(hasRow(seedKeys.replace("'stereoWidener.width': {", "'stereoWidener.widthX': {"), 'stereoWidener.width')).toBe(false);
  });

  describe('GLOBAL_CHAIN_GRID.md', () => {
    const lines = read('docs/reference/GLOBAL_CHAIN_GRID.md').split('\n');
    /** The line of the grid row for `field`, with its effect and setter, or -1. */
    const rowLine = (gridLines: readonly string[], field: string) => {
      const [pedal, param] = field.split('.') as [(typeof PEDALS)[number], string];
      const [effect, setter] = SETTER[pedal];
      return gridLines.findIndex(
        (l) => l.startsWith(`| ${effect} | \`${setter}()\` |`) && (l.split('|')[3] ?? '').trim().split(' ')[0] === param,
      );
    };
    const lastRow = (effect: string) => Math.max(...lines.flatMap((l, i) => (l.startsWith(`| ${effect} |`) ? [i] : [])));
    const firstRow = (effect: string) => lines.findIndex((l) => l.startsWith(`| ${effect} |`));
    const motionFields = PEDAL_FIELDS.filter((f) => !f.startsWith('stereoWidener.'));

    it.each(PEDAL_FIELDS)('has a row for %s, with its setter', (field) => {
      expect(rowLine(lines, field)).toBeGreaterThan(-1);
    });

    it('finds a missing row (the check itself)', () => {
      const without = lines.filter((l) => !l.startsWith('| Tremolo |'));
      expect(rowLine(without, 'tremolo.depth')).toBe(-1);
      expect(rowLine(lines.map((l) => l.replace('`setGlobalVibrato()`', '`setGlobalVibratoX()`')), 'vibrato.wet')).toBe(-1);
    });

    it('lists the motion rows in chain order after the Phaser rows and before the Delay rows', () => {
      const positions = motionFields.map((field) => rowLine(lines, field));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(lastRow('Phaser'), 'the grid has Phaser rows').toBeGreaterThan(0);
      expect(positions[0]).toBeGreaterThan(lastRow('Phaser'));
      expect(positions[positions.length - 1]).toBeLessThan(firstRow('Delay'));
    });

    it('lists the Width row after the Compressor rows and before the Limiter row', () => {
      const width = rowLine(lines, 'stereoWidener.width');
      expect(lastRow('Compressor'), 'the grid has Compressor rows').toBeGreaterThan(0);
      expect(width).toBeGreaterThan(lastRow('Compressor'));
      expect(width).toBeLessThan(firstRow('Limiter'));
    });

    it('the order check can fail (a Chorus row moved above the Phaser is caught)', () => {
      const chorus = lines.find((l) => l.startsWith('| Chorus |'))!;
      const moved = [chorus, ...lines.filter((l) => l !== chorus)];
      expect(rowLine(moved, 'chorus.rate')).toBeLessThan(Math.max(...moved.flatMap((l, i) => (l.startsWith('| Phaser |') ? [i] : []))));
    });

    it('names the five pedals in the chain-order line', () => {
      const chainLine = lines.find((l) => l.startsWith('**Global chain order'))!;
      expect(chainLine).toMatch(/Phaser → Chorus → Tremolo → Vibrato → FrequencyShifter → Compressor → StereoWidener → Limiter/);
    });
  });
});

// ========================================
// (5) THE LIVING DOCS NAME THE PEDALS   (RED until Task 17 writes them)
// ========================================

describe('the living docs name the pedals', () => {
  const missing = (text: string, names: readonly string[]) => names.filter((name) => !text.includes(`\`${name}\``));

  it('finds a missing name (the check itself)', () => {
    expect(missing('`chorus` only', ['chorus', 'tremolo'])).toEqual(['tremolo']);
    expect(missing('`chorus` `tremolo`', ['chorus', 'tremolo'])).toEqual([]);
    expect(missing('chorus without backticks', ['chorus'])).toEqual(['chorus']);
  });

  const docs: [doc: string, names: readonly string[]][] = [
    ['docs/AUDIO_SYSTEM.md', [...PEDALS, ...PEDALS.map((key) => SETTER[key][1])]],
    ['docs/SESSION_STORAGE.md', [...PEDALS, 'sanitizeSyncedRate', 'SYNCED_RATE_KEYS']],
    ['docs/specs/FREE_SYNC_TOGGLE.md', ['resolveSyncedRateHz', 'syncedRateToSync', 'syncedRateToFree', 'setPedalSyncMode']],
    ['docs/ideas/themes.md', ['PEDAL_LIT_EDGE', 'MAX_LIT_PEDALS']],
  ];

  it.each(docs)('%s names what Task 17 adds (RED until Task 17)', (doc, names) => {
    expect(missing(read(doc), names), `${doc} does not name`).toEqual([]);
  });
});
