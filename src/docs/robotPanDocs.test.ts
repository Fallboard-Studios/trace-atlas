import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/todo/roadmap.md item 49 (Robot Pan), docs/tasks/ROBOT_PAN.md Task 13. A docs task has no behaviour to
// test, so this makes its acceptance criteria executable:
//   (1) the two source-scan guardrails: the robot body never reads pan, and pan never moves a robot;
//   (2) every symbol the spec and the updated docs cite exists in source, so a rename cannot leave a stale doc;
//   (3) the docs say what the code now does (SESSION_STORAGE names pan as persisted and masterVolume as not).
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

/** Source with comments removed, so a comment that names pan (as the actions' own do) is not a read of it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

// ========================================
// (1) THE SOURCE-SCAN GUARDRAILS
// ========================================

describe('nothing on the robot body reads pan (the Visual Mapping guardrail is unchanged)', () => {
  const bodyFiles = [...sourceFiles('src/components/robot/gem'), ...sourceFiles('src/components/robot/RobotBody.tsx')];

  it('scans the gem folder and RobotBody, not an empty list', () => {
    expect(bodyFiles).toContain('src/components/robot/RobotBody.tsx');
    expect(bodyFiles.length).toBeGreaterThan(5);
  });

  it.each(bodyFiles)('%s contains neither panAuto nor a .pan read', (file) => {
    const code = withoutComments(read(file));
    expect(code).not.toMatch(/\bpanAuto\b/);
    expect(code).not.toMatch(/\.pan\b/);
  });
});

describe('pan never moves a robot: Auto off stops the panner following, not the robot swimming', () => {
  const movementFiles = [
    'src/systems/workLoop.ts',
    'src/systems/siteChoice.ts',
    'src/systems/lifecycleSim.ts',
    ...sourceFiles('src/animation'),
  ];

  it('scans the work loop, site choice, lifecycle and the animation folder, not an empty list', () => {
    expect(movementFiles).toContain('src/animation/swimAnimation.ts');
    expect(movementFiles.length).toBeGreaterThan(5);
  });

  it.each(movementFiles)('%s contains neither panAuto nor a .pan read', (file) => {
    const code = withoutComments(read(file));
    expect(code).not.toMatch(/\bpanAuto\b/);
    expect(code).not.toMatch(/\.pan\b/);
  });
});

// ========================================
// (2) EVERY CITED SYMBOL EXISTS
// ========================================

describe('the named Robot Pan symbols are declared where the docs say they are', () => {
  const declared: [description: string, file: string, pattern: RegExp][] = [
    ['Robot.pan', 'src/types/Robot.ts', /\bpan: number;/],
    ['Robot.panAuto', 'src/types/Robot.ts', /\bpanAuto: boolean;/],
    ['CompanyOptionsSnapshot.pan', 'src/types/Company.ts', /\bpan\?: number;/],
    ['CompanyOptionsSnapshot.panAuto', 'src/types/Company.ts', /\bpanAuto\?: boolean;/],
    ['RobotAudioOverrideDiff.pan', 'src/types/session.ts', /\bpan\?: number;/],
    ['CompactRobotOverrideDiff.p', 'src/utils/sessionShareUtils.ts', /interface CompactRobotOverrideDiff \{[^}]*\bp\?: number;/],
    ['PAN_MIN', 'src/constants/index.ts', /export const PAN_MIN\b/],
    ['PAN_MAX', 'src/constants/index.ts', /export const PAN_MAX\b/],
    ['PAN_DISPLAY_SCALE', 'src/constants/index.ts', /export const PAN_DISPLAY_SCALE\b/],
    ['AudioEngine.updateRobotPan', 'src/engine/AudioEngine.ts', /\bupdateRobotPan\(robotId: string, value: number \| null\)/],
    ['AudioEngine.getLivePan', 'src/engine/AudioEngine.ts', /\bgetLivePan\(robotId: string\)/],
    ['manualPanByRobot', 'src/engine/AudioEngine.ts', /const manualPanByRobot = new Map/],
    ['PAN_RAMP_SECONDS', 'src/engine/AudioEngine.ts', /const PAN_RAMP_SECONDS\b/],
    ['useRobotPanReadoutStore', 'src/stores/robotPanReadoutStore.ts', /export const useRobotPanReadoutStore\b/],
    ['applyPan', 'src/systems/robotOptionsActions.ts', /export function applyPan\(/],
    ['applyPanAuto', 'src/systems/robotOptionsActions.ts', /export function applyPanAuto\(/],
    ['PAN_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const PAN_SCHEMA\b/],
    ['PAN_AUTO_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const PAN_AUTO_SCHEMA\b/],
    ['PAN_ROW_PANEL_SCHEMA', 'src/data/robotOptionsConfig.ts', /export const PAN_ROW_PANEL_SCHEMA\b/],
    ['SliderCenteredZero readOnly', 'src/components/ui/controls/SliderCenteredZero.tsx', /\breadOnly\?: boolean/],
    ['AudioSettingSection livePan', 'src/components/robot/AudioSettingSection.tsx', /\blivePan\?: number/],
    ['AudioSettingSection onPanChange', 'src/components/robot/AudioSettingSection.tsx', /\bonPanChange: /],
    ['AudioSettingSection onPanAutoChange', 'src/components/robot/AudioSettingSection.tsx', /\bonPanAutoChange: /],
  ];

  it.each(declared)('%s', (_description, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });
});

/** Every identifier in every non-test source file under src/. A whole-word set, not a substring search, so a
 *  renamed `getLivePan` is not satisfied by a `getLivePanX` that happens to contain it. */
const sourceIdentifiers = new Set(sourceFiles('src').flatMap((file) => read(file).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
const isInSource = (symbol: string) => sourceIdentifiers.has(symbol);

/** Words that are cited in backticks but are not, and should not be, names in this repo's source: third-party
 *  API members, names the spec records as deliberately NOT built ("Ask first" / "Not Doing"), and prose terms. */
const NOT_REPO_SYMBOLS = new Set([
  // Web Audio / Tone members the engine calls through, spelled in the spec's prose
  'cancelScheduledValues', 'setValueAtTime', 'linearRampToValueAtTime',
  // Deliberately absent: the spec's "Ask first" and "Not Doing" lists
  'formatValue',
  // File names, not symbols: a reference doc and this test file (sourceFiles skips *.test.ts)
  'SLIDER_VALUES', 'robotPanDocs',
]);

/** Inline backtick spans only (fenced blocks are illustrative sketches, covered by the table above). */
function citedSymbols(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  const identifiers = spans.flatMap((span) => span.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  // A code-shaped name only: camelCase with an inner capital, PascalCase, or UPPER_SNAKE. Plain words
  // ("robot", "id", "true", "number") are not claims about the source.
  // A trailing underscore is a prefix wildcard in prose (`MASTER_VOLUME_*`), not a name.
  const codeShaped = identifiers.filter(
    (word) =>
      !word.endsWith('_') &&
      (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(word) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(word)),
  );
  return [...new Set(codeShaped)].filter((word) => !NOT_REPO_SYMBOLS.has(word)).sort();
}

describe('every symbol the spec and the updated docs cite exists in source', () => {
  const spec = read('docs/specs/ROBOT_PAN.md');
  const specDesign = spec.slice(spec.indexOf('## 1. Overview'), spec.indexOf('\n## 5.'));

  it('finds the spec sections it is scanning (§1 to §4), not an empty slice', () => {
    expect(specDesign.length).toBeGreaterThan(5000);
    expect(specDesign).toContain('### 1.3 Engine');
    expect(specDesign).toContain('## 4. Code Style');
  });

  it('spec §1 to §4', () => {
    const symbols = citedSymbols(specDesign);
    expect(symbols.length, 'the extractor found the spec’s symbols').toBeGreaterThan(30);
    const missing = symbols.filter((symbol) => !isInSource(symbol));
    expect(missing, 'cited in docs/specs/ROBOT_PAN.md but absent from src/').toEqual([]);
  });

  // Only the lines that talk about pan: these are the living docs Task 15 edits, and an unrelated stale name
  // elsewhere in them is not this phase's to fail on (oneDayClockDocs scopes the same way).
  const UPDATED_DOCS = [
    'docs/AUDIO_SYSTEM.md',
    'docs/SESSION_STORAGE.md',
    'docs/COMPANIES.md',
    'docs/COMPONENT_LIBRARY.md',
    'docs/ROBOT_DESIGN.md',
    'docs/reference/ROBOT_DATA_GRID.md',
    'docs/reference/SLIDER_VALUES.md',
  ];
  const panLines = (doc: string) =>
    read(doc).split('\n').filter((line) => /\bpan(ning|Auto)?\b|updateRobotPan|getLivePan|robotPanReadoutStore/i.test(line)).join('\n');

  it.each(UPDATED_DOCS)('%s: the symbols on its pan lines exist', (doc) => {
    const missing = citedSymbols(panLines(doc)).filter((symbol) => !isInSource(symbol));
    expect(missing, `${doc} cites symbols absent from src/`).toEqual([]);
  });
});

// ========================================
// (3) THE DOCS SAY WHAT THE CODE NOW DOES   (RED until Task 15)
// ========================================

/** The text from the line starting with `start` up to (not including) the next line matching `end`. */
function section(text: string, start: string, end: RegExp): string {
  const from = text.indexOf(start);
  expect(from, `a section starting “${start}” exists`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(from + start.length);
  const stop = rest.search(end);
  return start + (stop === -1 ? rest : rest.slice(0, stop));
}

describe('SESSION_STORAGE.md: pan is persisted, masterVolume is not', () => {
  const text = read('docs/SESSION_STORAGE.md');

  it('lists pan under What Gets Persisted, as a manual-only robot override', () => {
    const persisted = section(text, '## What Gets Persisted', /\*\*Explicitly never persisted/);
    expect(persisted).toMatch(/`pan`/);
    expect(persisted).toMatch(/Auto/);
  });

  it('keeps masterVolume and audioMode on the never-persisted list, and does not put pan there', () => {
    const never = section(text, '**Explicitly never persisted:**', /\n\n/);
    expect(never).toContain('`masterVolume`');
    expect(never).toContain('`audioMode`');
    expect(never).not.toMatch(/`pan`|`panAuto`/);
  });

  it('says why pan differs from volume: a composition choice against a listening choice', () => {
    expect(text).toMatch(/composition choice/);
    expect(text).toMatch(/listening choice/);
  });

  it('names the share-link key', () => {
    expect(text).toMatch(/`p`/);
  });
});

describe('AUDIO_SYSTEM.md: the Panning item describes Auto and manual', () => {
  // The item is one paragraph, so the section ends at the first blank line.
  const panning = section(read('docs/AUDIO_SYSTEM.md'), '4. **Panning.**', /\n\n/);

  it.each(['Auto', 'updateRobotPan', 'getLivePan', 'robotPanReadoutStore', 'PAN_RAMP_SECONDS', 'panAuto'])('names %s', (name) => {
    expect(panning).toContain(name);
  });

  it('still states the Auto range and that the engine owns the write', () => {
    expect(panning).toContain('calculatePanFromPosition');
    expect(panning).toMatch(/-0\.5|−0\.5/);
  });
});

describe('COMPANIES.md: the snapshot carries pan and the Auto-off behaviour is documented', () => {
  const text = read('docs/COMPANIES.md');

  it('names the two snapshot fields and both handlers’ actions', () => {
    for (const name of ['`pan`', '`panAuto`', 'applyPan', 'applyPanAuto']) expect(text, name).toContain(name);
  });

  it('says Auto off holds each member at its own position until the slider is next touched', () => {
    expect(text).toMatch(/own (live )?position/);
  });
});

describe('COMPONENT_LIBRARY.md: SliderCenteredZero.readOnly has a section', () => {
  it('has a heading naming readOnly and the status role', () => {
    const text = read('docs/COMPONENT_LIBRARY.md');
    expect(text).toMatch(/^#{2,4} .*`SliderCenteredZero`.*`readOnly`/m);
    const body = section(text, text.match(/^#{2,4} .*`SliderCenteredZero`.*`readOnly`.*$/m)?.[0] ?? '', /\n#{2,4} /);
    expect(body).toContain('role="status"');
    expect(body).toContain('data-readonly');
  });
});

describe('the reference grids carry a Pan row', () => {
  it('ROBOT_DATA_GRID.md: Pan and Auto rows, centred-zero, -100 to 100', () => {
    const lines = read('docs/reference/ROBOT_DATA_GRID.md').split('\n');
    const pan = lines.find((line) => line.startsWith('| Pan |')) ?? '';
    expect(pan, 'a “| Pan |” row').not.toBe('');
    expect(pan).toMatch(/entered-zero/i);
    expect(pan).toMatch(/-100|−100/);
    expect(lines.some((line) => line.startsWith('| Auto |'))).toBe(true);
  });

  it('SLIDER_VALUES.md: a Pan row with -100, 100 and step 1', () => {
    const pan = read('docs/reference/SLIDER_VALUES.md').split('\n').find((line) => line.startsWith('| Pan |')) ?? '';
    expect(pan, 'a “| Pan |” row').not.toBe('');
    expect(pan).toMatch(/entered-zero/i);
    expect(pan).toMatch(/-100|−100/);
    expect(pan).toMatch(/\| 100 \| 1 \|/);
  });
});

describe('ROBOT_DESIGN.md: pan reaches the body through no dial', () => {
  it('says so on a line that names pan', () => {
    const line = read('docs/ROBOT_DESIGN.md').split('\n').find((l) => /\bpan\b/i.test(l) && /no dial/i.test(l));
    expect(line, 'a line naming pan and “no dial”').toBeDefined();
  });
});

describe('roadmap 49 records what was built', () => {
  const roadmap = read('docs/todo/roadmap.md');
  const entry = section(roadmap, '## 49. Robot Pan', /\n## \d+\. /);

  it('has a status line and an as-built section', () => {
    expect(entry).toMatch(/\*\*Status/);
    expect(entry).toMatch(/as built/i);
  });

  it.each([
    ['one pan field, no remembered manual value', /no remembered/i],
    ['the readout store', /robotPanReadoutStore/],
    ['SliderCenteredZero.readOnly', /readOnly/],
    ['useCompanyOptions as the company handler home', /useCompanyOptions/],
    ['robots keep moving with Auto off', /keep(s)? (moving|swimming)/i],
  ])('records %s', (_what, pattern) => {
    expect(entry).toMatch(pattern);
  });
});

describe('the intent file carries a shipped banner', () => {
  it('says shipped near the top', () => {
    const head = read('docs/intent/robot-pan.md').split('\n').slice(0, 15).join('\n');
    expect(head).toMatch(/shipped/i);
  });
});
