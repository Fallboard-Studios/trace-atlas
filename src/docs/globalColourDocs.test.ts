import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/todo/roadmap.md item 50.3 (Global Colour), docs/tasks/GLOBAL_COLOUR.md Task 11. A docs task has no behaviour
// to test, so this makes its acceptance criteria executable (robotSendsDocs.test.ts is the pattern):
//   (1) the source-scan guardrail: nothing on the robot body reads a colour effect (Visual Mapping is unchanged,
//       and colour is one global chain, never per robot);
//   (2) every symbol the spec names is declared where it says, so a rename cannot leave a stale doc;
//   (3) the living docs name the six colour fields.
// Groups (1) and (2) were green from the moment they landed. Group (3)'s AUDIO_SYSTEM.md and SESSION_STORAGE.md cases
// were written against the text Task 15 produces and were RED until it landed; they are green now.

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

/** Source with comments removed, so a comment that names an effect is not a read of it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const COLOUR_EFFECTS = ['distortion', 'chebyshev', 'bitCrusher'] as const;
const COLOUR_FIELDS = ['distortion.amount', 'distortion.wet', 'chebyshev.order', 'chebyshev.wet', 'bitCrusher.bits', 'bitCrusher.wet'] as const;

// ========================================
// (1) THE SOURCE-SCAN GUARDRAIL
// ========================================

describe('nothing on the robot body reads a colour effect (Visual Mapping is unchanged)', () => {
  const bodyFiles = [...sourceFiles('src/components/robot/gem'), ...sourceFiles('src/components/robot/RobotBody.tsx')];

  it('scans the gem folder and RobotBody, not an empty list', () => {
    expect(bodyFiles).toContain('src/components/robot/RobotBody.tsx');
    expect(bodyFiles).toContain('src/components/robot/gem/bodyLineDials.ts');
    expect(bodyFiles.length).toBeGreaterThan(5);
  });

  it('treats a comment as no read, and a code reference as a read (the stripper itself)', () => {
    expect(withoutComments('// bitCrusher is audio only\nconst a = 1;')).not.toMatch(/bitCrusher/);
    expect(withoutComments('/* distortion */ const a = 1;')).not.toMatch(/distortion/);
    expect(withoutComments('const a = settings.chebyshev;')).toMatch(/chebyshev/);
    expect(withoutComments('const a = globalAudio.bitCrusher; // audio only')).toMatch(/bitCrusher/);
  });

  it.each(bodyFiles)('%s reads none of distortion, chebyshev, bitCrusher', (file) => {
    const code = withoutComments(read(file));
    for (const name of COLOUR_EFFECTS) {
      expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe('colour is one global chain, never a modulation or swell target (spec non-goals)', () => {
  it.each(['src/types/lfo.ts', 'src/types/audioSwell.ts', 'src/data/audioSwellRanges.ts'])('%s names no colour effect', (file) => {
    const code = withoutComments(read(file));
    for (const name of COLOUR_EFFECTS) {
      expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

// ========================================
// (2) EVERY NAMED SYMBOL IS DECLARED WHERE THE SPEC SAYS
// ========================================

describe('the named Global Colour symbols are declared where the spec says they are', () => {
  const declared: [description: string, file: string, pattern: RegExp][] = [
    ['DistortionSettings', 'src/types/globalAudio.ts', /export interface DistortionSettings \{[^}]*\bamount: number;[^}]*\bwet: number;/],
    ['ChebyshevSettings', 'src/types/globalAudio.ts', /export interface ChebyshevSettings \{[^}]*\border: number;[^}]*\bwet: number;/],
    ['BitCrusherSettings', 'src/types/globalAudio.ts', /export interface BitCrusherSettings \{[^}]*\bbits: number;[^}]*\bwet: number;/],
    ['GlobalAudioSettings.distortion', 'src/types/globalAudio.ts', /\bdistortion: DistortionSettings;/],
    ['GlobalAudioSettings.chebyshev', 'src/types/globalAudio.ts', /\bchebyshev: ChebyshevSettings;/],
    ['GlobalAudioSettings.bitCrusher', 'src/types/globalAudio.ts', /\bbitCrusher: BitCrusherSettings;/],
    ['withGlobalAudioDefaults', 'src/types/globalAudio.ts', /export function withGlobalAudioDefaults\(partial: Partial<GlobalAudioSettings>\): GlobalAudioSettings/],
    ['the restore path defaults globalAudio', 'src/utils/sessionDiff.ts', /withGlobalAudioDefaults\(payload\.globalAudio\)/],
    ['the share decoder defaults globalAudio', 'src/utils/sessionShareUtils.ts', /withGlobalAudioDefaults\(compact\.g\)/],
    ...COLOUR_FIELDS.flatMap((field): [string, string, RegExp][] => [
      [`seed range ${field}`, 'src/data/globalAudioSeedRanges.ts', new RegExp(`^\\s*'${field.replace('.', '\\.')}': \\{`, 'm')],
      [`loading range ${field}`, 'src/data/globalAudioLoadingRanges.ts', new RegExp(`^\\s*'${field.replace('.', '\\.')}': \\{`, 'm')],
    ]),
    ['COLOUR_CHARACTERS', 'src/utils/globalAudioSeed.ts', /export const COLOUR_CHARACTERS = \[/],
    ['COLOUR_CHARACTER_NODES', 'src/utils/globalAudioSeed.ts', /export const COLOUR_CHARACTER_NODES: Record<ColourCharacter, readonly ColourNode\[\]>/],
    ['COLOUR_CHARACTER_BANDS', 'src/utils/globalAudioSeed.ts', /export const COLOUR_CHARACTER_BANDS: readonly number\[\]/],
    ['pickColourCharacter', 'src/utils/globalAudioSeed.ts', /export function pickColourCharacter\(t: number\): ColourCharacter/],
    ['the Distortion node', 'src/engine/audioEngine/globalFx.ts', /let _globalDistortion: Tone\.Distortion \| null/],
    ['the Chebyshev node', 'src/engine/audioEngine/globalFx.ts', /let _globalChebyshev: Tone\.Chebyshev \| null/],
    ['the BitCrusher node', 'src/engine/audioEngine/globalFx.ts', /let _globalBitCrusher: Tone\.BitCrusher \| null/],
    ['setGlobalDistortion', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalDistortion\(params: Partial<DistortionSettings>\): void/],
    ['setGlobalChebyshev', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalChebyshev\(params: Partial<ChebyshevSettings>\): void/],
    ['setGlobalBitCrusher', 'src/engine/audioEngine/globalFx.ts', /export function setGlobalBitCrusher\(params: Partial<BitCrusherSettings>\): void/],
    ['AudioEngine exposes setGlobalBitCrusher', 'src/engine/AudioEngine.ts', /\bsetGlobalBitCrusher,/],
    ['the store routes bitCrusher to the engine', 'src/stores/audioStore.ts', /\bbitCrusher: AudioEngine\.setGlobalBitCrusher,/],
    ['the store pushes the colour blocks on apply', 'src/stores/audioStore.ts', /AudioEngine\.setGlobalBitCrusher\(globalAudio\.bitCrusher\)/],
    ["'colour' in Trait", 'src/types/traits.ts', /export type Trait =[^;]*'colour'/],
    ['TRAIT_COLORS.colour', 'src/utils/traitColors.ts', /\bcolour: \[ACCENT_COLORS\.\w+, ACCENT_COLORS\.\w+\]/],
    ['AUDIO_RIG_EFFECT_TRAIT.bitCrusher', 'src/components/panels/screen/console/AudioRigDrawer.tsx', /const AUDIO_RIG_EFFECT_TRAIT[^=]*=\s*\{[^}]*\bdistortion: 'colour',[^}]*\bchebyshev: 'colour',[^}]*\bbitCrusher: 'colour',/],
    ["'bitCrusher' in AudioRigEffectKey", 'src/data/audioRigConfig.ts', /export type AudioRigEffectKey =[^;]*'bitCrusher'/],
    ["'colour' in FleetParamsGroup", 'src/stores/uiStore.ts', /export type FleetParamsGroup =[^;]*'colour'/],
    ['FLEET_PARAMS_SUBSECTIONS.colour', 'src/components/panels/screen/nav/navActions.ts', /\bcolour: \[[^\]]*'distortion'[^\]]*'chebyshev'[^\]]*'bitCrusher'/],
    ['FLEET_PARAMS_GROUP_CONTENT.colour', 'src/components/panels/screen/nav/navActions.ts', /\bcolour: 'fleet\.colour',/],
    ['the Colour tab in the screen', 'src/components/panels/screen/screens/FleetParamsScreen.tsx', /\['colour', 'colour'\],/],
  ];

  it.each(declared)('%s', (_description, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  it('the declared-pattern table itself fails on a rename (a pattern that matches nothing is not a pass)', () => {
    expect(read('src/types/globalAudio.ts')).not.toMatch(/export interface BitCrusherSettingsX \{/);
    expect(read('src/engine/audioEngine/globalFx.ts')).not.toMatch(/let _globalBitCrusherX: /);
  });

  it('covers every one of the six fields in both range tables (the table is not missing a row)', () => {
    const covered = declared.filter(([description]) => /^(seed|loading) range /.test(description));
    expect(covered).toHaveLength(COLOUR_FIELDS.length * 2);
  });
});

// ========================================
// (3) THE LIVING DOCS NAME THE SIX FIELDS   (the grid's rows landed at Task 2; the other two docs at Task 15)
// ========================================

describe('the living docs name the six colour fields', () => {
  const missingFields = (text: string) => COLOUR_FIELDS.filter((field) => !text.includes(`\`${field}\``));

  it('finds a missing field (the check itself)', () => {
    expect(missingFields('`distortion.amount` and `distortion.wet`')).toEqual(['chebyshev.order', 'chebyshev.wet', 'bitCrusher.bits', 'bitCrusher.wet']);
    expect(missingFields(COLOUR_FIELDS.map((f) => `\`${f}\``).join(' '))).toEqual([]);
  });

  it('GLOBAL_CHAIN_GRID.md has a row for every colour field, with its setter, in chain order after the HPF rows', () => {
    const grid = read('docs/reference/GLOBAL_CHAIN_GRID.md');
    const rows: [effect: string, setter: string, param: RegExp][] = [
      ['Distortion', 'setGlobalDistortion', /amount/], ['Distortion', 'setGlobalDistortion', /wet/],
      ['Chebyshev', 'setGlobalChebyshev', /order/], ['Chebyshev', 'setGlobalChebyshev', /wet/],
      ['BitCrusher', 'setGlobalBitCrusher', /bits/], ['BitCrusher', 'setGlobalBitCrusher', /wet/],
    ];
    const positions = rows.map(([effect, setter, param]) => {
      const line = grid.split('\n').findIndex((l) => l.startsWith(`| ${effect} | \`${setter}()\` |`) && param.test(l.split('|')[3] ?? ''));
      expect(line, `${effect} ${param}`).toBeGreaterThan(-1);
      return line;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const gridLines = grid.split('\n');
    const hpfRows = gridLines.flatMap((l, i) => (l.startsWith('| High-Pass Filter |') ? [i] : []));
    const lastHpf = hpfRows[hpfRows.length - 1];
    const firstDelay = gridLines.findIndex((l) => l.startsWith('| Delay |'));
    expect(hpfRows.length, 'the grid has HPF rows').toBeGreaterThan(0);
    expect(positions[0]).toBeGreaterThan(lastHpf);
    expect(positions[5]).toBeLessThan(firstDelay);
  });

  it.each(['docs/AUDIO_SYSTEM.md', 'docs/SESSION_STORAGE.md'])('%s names all six', (doc) => {
    expect(missingFields(read(doc)), `${doc} does not name`).toEqual([]);
  });
});
