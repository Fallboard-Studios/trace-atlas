import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GLOBAL_LFO_TARGET_IDS } from '@/types/lfo';
import { SWELL_GLOBAL_TARGET_IDS, SWELL_ROBOT_ATTRIBUTE_IDS } from '@/types/audioSwell';

// docs/todo/roadmap.md item 50.4 (Global Modulation), docs/tasks/GLOBAL_MODULATION_COLOUR.md Task 13. A docs task has
// no behaviour to test, so this makes its acceptance criteria executable (globalColourDocs.test.ts is the pattern):
//   (1) the source-scan guardrail: nothing on the robot body reads a modulation pedal (Visual Mapping is unchanged,
//       and the pedals are one global chain, never per robot);
//   (2) neither pedal is an LFO or swell target;
//   (3) every symbol the spec names is declared where it says, so a rename cannot leave a stale doc;
//   (4) the thirteen range-table fields and the thirteen grid rows are all there;
//   (5) the living docs name the pedals.
// Groups (1) to (4) were green from the moment they landed. Group (5)'s AUDIO_SYSTEM.md, SESSION_STORAGE.md and
// FREE_SYNC_TOGGLE.md cases were written against the text Task 17 produces and were RED until it landed; they are green now.

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

const PEDALS = ['autoWah', 'phaser'] as const;
const PEDAL_FIELDS = [
  'autoWah.baseFrequency', 'autoWah.octaves', 'autoWah.sensitivity', 'autoWah.Q', 'autoWah.gain', 'autoWah.follower', 'autoWah.wet',
  'phaser.rate', 'phaser.octaves', 'phaser.baseFrequency', 'phaser.stages', 'phaser.Q', 'phaser.wet',
] as const;

// ========================================
// (1) THE SOURCE-SCAN GUARDRAIL
// ========================================

describe('nothing on the robot body reads a modulation pedal (Visual Mapping is unchanged)', () => {
  const bodyFiles = [...sourceFiles('src/components/robot/gem'), ...sourceFiles('src/components/robot/RobotBody.tsx')];

  it('scans the gem folder and RobotBody, not an empty list', () => {
    expect(bodyFiles).toContain('src/components/robot/RobotBody.tsx');
    expect(bodyFiles).toContain('src/components/robot/gem/bodyLineDials.ts');
    expect(bodyFiles.length).toBeGreaterThan(5);
  });

  it('treats a comment as no read, and a code reference as a read (the stripper itself)', () => {
    expect(withoutComments('// phaser is audio only\nconst a = 1;')).not.toMatch(/phaser/);
    expect(withoutComments('/* autoWah */ const a = 1;')).not.toMatch(/autoWah/);
    expect(withoutComments('const a = settings.autoWah;')).toMatch(/autoWah/);
    expect(withoutComments('const a = globalAudio.phaser; // audio only')).toMatch(/phaser/);
  });

  it.each(bodyFiles)('%s reads neither autoWah nor phaser', (file) => {
    const code = withoutComments(read(file));
    for (const name of PEDALS) {
      expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

// ========================================
// (2) NEITHER PEDAL IS A MODULATION OR SWELL TARGET
// ========================================

describe('the pedals are one global chain, never a modulation or swell target (spec non-goals)', () => {
  it.each(['src/types/lfo.ts', 'src/types/audioSwell.ts', 'src/data/audioSwellRanges.ts'])('%s names neither pedal', (file) => {
    const code = withoutComments(read(file));
    for (const name of PEDALS) {
      expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('no LFO or swell target id belongs to a pedal (the pools, as the engine reads them)', () => {
    const ids: string[] = [...GLOBAL_LFO_TARGET_IDS, ...SWELL_GLOBAL_TARGET_IDS, ...SWELL_ROBOT_ATTRIBUTE_IDS];
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id) => /^(autoWah|phaser)\b/.test(id))).toEqual([]);
  });

  it('the target check can fail (a pedal id would be caught)', () => {
    const ids = [...GLOBAL_LFO_TARGET_IDS, 'phaser.rate'] as string[];
    expect(ids.filter((id) => /^(autoWah|phaser)\b/.test(id))).toEqual(['phaser.rate']);
  });
});

// ========================================
// (3) EVERY NAMED SYMBOL IS DECLARED WHERE THE SPEC SAYS
// ========================================

describe('the named Global Modulation symbols are declared where the spec says they are', () => {
  const declared: [description: string, file: string, pattern: RegExp][] = [
    ['AutoWahSettings', 'src/types/globalAudio.ts', /export interface AutoWahSettings \{[^}]*\bbaseFrequency: number;[^}]*\boctaves: number;[^}]*\bsensitivity: number;[^}]*\bQ: number;[^}]*\bgain: number;[^}]*\bfollower: number;[^}]*\bwet: number;/],
    ['PhaserSettings', 'src/types/globalAudio.ts', /export interface PhaserSettings \{[^}]*\brate: number;[^}]*\boctaves: number;[^}]*\bbaseFrequency: number;[^}]*\bstages: number;[^}]*\bQ: number;[^}]*\bwet: number;/],
    ['GlobalAudioSettings.autoWah', 'src/types/globalAudio.ts', /\bautoWah: AutoWahSettings;/],
    ['GlobalAudioSettings.phaser', 'src/types/globalAudio.ts', /\bphaser: PhaserSettings;/],
    ['PHASER_RATE_RANGE_HZ', 'src/types/globalAudio.ts', /export const PHASER_RATE_RANGE_HZ = \{ min: 0\.05, max: 10 \} as const;/],
    ['PHASER_RATE_STEP_HZ', 'src/types/globalAudio.ts', /export const PHASER_RATE_STEP_HZ\b/],
    ['withGlobalAudioDefaults', 'src/types/globalAudio.ts', /export function withGlobalAudioDefaults\(partial: Partial<GlobalAudioSettings>\): GlobalAudioSettings/],
    ['the restore path defaults globalAudio', 'src/utils/sessionDiff.ts', /withGlobalAudioDefaults\(payload\.globalAudio\)/],
    ['the restore path sanitises phaser.sync', 'src/utils/sessionDiff.ts', /phaser: sanitizePhaserSync\(filled\.phaser\)/],
    ['the share decoder defaults globalAudio', 'src/utils/sessionShareUtils.ts', /withGlobalAudioDefaults\(compact\.g\)/],
    ...PEDAL_FIELDS.flatMap((field): [string, string, RegExp][] => [
      [`seed range ${field}`, 'src/data/globalAudioSeedRanges.ts', new RegExp(`^\\s*'${field.replace('.', '\\.')}': \\{`, 'm')],
      [`loading range ${field}`, 'src/data/globalAudioLoadingRanges.ts', new RegExp(`^\\s*'${field.replace('.', '\\.')}': \\{`, 'm')],
    ]),
    ['PEDAL_LIT_EDGE', 'src/utils/globalAudioSeed.ts', /export const PEDAL_LIT_EDGE: Record<'autoWah' \| 'phaser', number>/],
    ['PHASER_SYNC_ODDS', 'src/utils/globalAudioSeed.ts', /export const PHASER_SYNC_ODDS = /],
    ['resolvePhaserRateHz', 'src/utils/tempoSync.ts', /export function resolvePhaserRateHz\(phaser: PhaserSettings, bpm: number\): number/],
    ['allowedPhaserNoteValues', 'src/utils/tempoSync.ts', /export function allowedPhaserNoteValues\(bpm: number\): NoteValue\[\]/],
    ['phaserToSync', 'src/utils/tempoSync.ts', /export function phaserToSync\(phaser: PhaserSettings, bpm: number\): PhaserSettings/],
    ['phaserToFree', 'src/utils/tempoSync.ts', /export function phaserToFree\(phaser: PhaserSettings, bpm: number\): PhaserSettings/],
    ['the AutoWah node', 'src/engine/audioEngine/globalFx.ts', /let _globalAutoWah: Tone\.AutoWah \| null/],
    ['the Phaser node', 'src/engine/audioEngine/globalFx.ts', /let _globalPhaser: Tone\.Phaser \| null/],
    ['setGlobalAutoWah', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalAutoWah\(params: Partial<AutoWahSettings>\): void/],
    ['setGlobalPhaser', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalPhaser\(params: Partial<Omit<PhaserSettings, 'sync'>>\): void/],
    ['AudioEngine exposes setGlobalAutoWah', 'src/engine/AudioEngine.ts', /\bsetGlobalAutoWah,/],
    ['AudioEngine exposes setGlobalPhaser', 'src/engine/AudioEngine.ts', /\bsetGlobalPhaser,/],
    ['setPhaserSyncMode on the store', 'src/stores/audioStore.ts', /setPhaserSyncMode: \(synced: boolean\) => void;/],
    ['the store routes autoWah to the engine', 'src/stores/audioStore.ts', /\bautoWah: AudioEngine\.setGlobalAutoWah,/],
    // Global Pedals T7 (docs/specs/GLOBAL_PEDALS.md §1.4) generalised the Phaser's resolver into a per-block factory and
    // the apply push into resolvedRateBlock; the Phaser is that rail's first instance.
    ['the store routes phaser through the resolver', 'src/stores/audioStore.ts', /\bphaser: setGlobalRateResolved\('phaser'\),/],
    ['the store pushes autoWah on apply', 'src/stores/audioStore.ts', /AudioEngine\.setGlobalAutoWah\(globalAudio\.autoWah\)/],
    ['the store pushes phaser on apply', 'src/stores/audioStore.ts', /AudioEngine\.setGlobalPhaser\(resolvedRateBlock<'phaser'>\(globalAudio\.phaser, bpm\)\)/],
    ['no new trait: autoWah wears spectral', 'src/components/panels/screen/console/AudioRigDrawer.tsx', /const AUDIO_RIG_EFFECT_TRAIT[^=]*=\s*\{[^}]*\bautoWah: 'spectral',/],
    ['no new trait: phaser wears spectral', 'src/components/panels/screen/console/AudioRigDrawer.tsx', /const AUDIO_RIG_EFFECT_TRAIT[^=]*=\s*\{[^}]*\bphaser: 'spectral',/],
    ["'autoWah' and 'phaser' in AudioRigEffectKey", 'src/data/audioRigConfig.ts', /export type AudioRigEffectKey =[^;]*'autoWah'[^;]*'phaser'/],
    ["'modulation' in FleetParamsGroup", 'src/stores/uiStore.ts', /export type FleetParamsGroup =[^;]*'modulation'/],
    ['FLEET_PARAMS_SUBSECTIONS.modulation', 'src/components/panels/screen/nav/navActions.ts', /\bmodulation: \[[^\]]*'autoWah'[^\]]*'phaser'/],
    ['FLEET_PARAMS_GROUP_CONTENT.modulation', 'src/components/panels/screen/nav/navActions.ts', /\bmodulation: 'fleet\.modulation',/],
    ['the Modulation tab in the screen', 'src/components/panels/screen/screens/FleetParamsScreen.tsx', /\['modulation', 'spectral'\],/],
  ];

  it.each(declared)('%s', (_description, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  it('the declared-pattern table itself fails on a rename (a pattern that matches nothing is not a pass)', () => {
    expect(read('src/types/globalAudio.ts')).not.toMatch(/export interface PhaserSettingsX \{/);
    expect(read('src/engine/audioEngine/globalFx.ts')).not.toMatch(/let _globalPhaserX: /);
    expect(read('src/utils/tempoSync.ts')).not.toMatch(/export function resolvePhaserRateHzX\(/);
  });

  it("introduces no 'modulation' Trait (assumption 11: the tab wears Spectral)", () => {
    expect(read('src/types/traits.ts')).not.toMatch(/export type Trait =[^;]*'modulation'/);
  });
});

// ========================================
// (4) THE THIRTEEN FIELDS ARE COVERED
// ========================================

describe('both range tables and the grid cover all thirteen pedal fields', () => {
  const seedKeys = read('src/data/globalAudioSeedRanges.ts');
  const loadingKeys = read('src/data/globalAudioLoadingRanges.ts');
  const hasRow = (table: string, field: string) => new RegExp(`^\\s*'${field.replace('.', '\\.')}': \\{`, 'm').test(table);

  it('is thirteen fields: seven for the wah, six for the phaser', () => {
    expect(PEDAL_FIELDS).toHaveLength(13);
    expect(PEDAL_FIELDS.filter((f) => f.startsWith('autoWah.'))).toHaveLength(7);
    expect(PEDAL_FIELDS.filter((f) => f.startsWith('phaser.'))).toHaveLength(6);
  });

  it.each(PEDAL_FIELDS)('%s has a row in the seed table and in the loading table', (field) => {
    expect(hasRow(seedKeys, field), `seed ${field}`).toBe(true);
    expect(hasRow(loadingKeys, field), `loading ${field}`).toBe(true);
  });

  it('finds a missing row (the check itself)', () => {
    expect(hasRow("  'phaser.Q': { min: 1, max: 2 },", 'phaser.Q')).toBe(true);
    expect(hasRow("  'phaser.Q': { min: 1, max: 2 },", 'phaser.wet')).toBe(false);
  });

  it('GLOBAL_CHAIN_GRID.md has a row for every pedal field, with its setter, in chain order after the BitCrusher rows', () => {
    const grid = read('docs/reference/GLOBAL_CHAIN_GRID.md');
    const lines = grid.split('\n');
    const rows: [effect: string, setter: string, param: string][] = PEDAL_FIELDS.map((field) => {
      const [pedal, param] = field.split('.');
      return pedal === 'autoWah' ? ['AutoWah', 'setGlobalAutoWah', param] : ['Phaser', 'setGlobalPhaser', param];
    });
    const positions = rows.map(([effect, setter, param]) => {
      const line = lines.findIndex(
        (l) => l.startsWith(`| ${effect} | \`${setter}()\` |`) && (l.split('|')[3] ?? '').trim().split(' ')[0] === param,
      );
      expect(line, `${effect} ${param}`).toBeGreaterThan(-1);
      return line;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const lastBitCrusher = Math.max(...lines.flatMap((l, i) => (l.startsWith('| BitCrusher |') ? [i] : [])));
    const firstDelay = lines.findIndex((l) => l.startsWith('| Delay |'));
    expect(lastBitCrusher, 'the grid has BitCrusher rows').toBeGreaterThan(0);
    expect(positions[0]).toBeGreaterThan(lastBitCrusher);
    expect(positions[12]).toBeLessThan(firstDelay);
  });
});

// ========================================
// (5) THE LIVING DOCS NAME THE PEDALS   (the grid's rows landed at Task 2; the other three docs at Task 17)
// ========================================

describe('the living docs name the pedals', () => {
  const missing = (text: string, names: readonly string[]) => names.filter((name) => !text.includes(`\`${name}\``));

  it('finds a missing name (the check itself)', () => {
    expect(missing('`autoWah` only', ['autoWah', 'phaser'])).toEqual(['phaser']);
    expect(missing('`autoWah` `phaser`', ['autoWah', 'phaser'])).toEqual([]);
    expect(missing('autoWah without backticks', ['autoWah'])).toEqual(['autoWah']);
  });

  const docs: [doc: string, names: readonly string[]][] = [
    ['docs/AUDIO_SYSTEM.md', ['autoWah', 'phaser', 'setGlobalAutoWah', 'setGlobalPhaser']],
    ['docs/SESSION_STORAGE.md', ['autoWah', 'phaser', 'phaser.sync']],
    ['docs/specs/FREE_SYNC_TOGGLE.md', ['resolvePhaserRateHz', 'phaserToSync', 'phaserToFree']],
  ];

  it.each(docs)('%s names what Task 17 added', (doc, names) => {
    expect(missing(read(doc), names), `${doc} does not name`).toEqual([]);
  });
});
