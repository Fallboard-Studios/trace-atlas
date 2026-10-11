import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// The grep gate for docs/tasks/LAYOUT_REWORK.md Task 21, kept as a test: the roster board replaced the
// Probes list and the Companies index (spec §1.5, §1.11), so the list, its cards, its filter and both
// branch-content routers are gone and nothing under src/ imports them.
const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SELF = join('components', 'panels', 'screen', 'screens', 'rosterBoardRetired.test.ts');

const DELETED = [
  'components/panels/screen/console/RobotsTab',
  'components/selection/RobotSelectionCard',
  'utils/robotListFilter',
  'components/panels/screen/nav/content/ProbesContent',
  'components/panels/screen/nav/content/CompaniesContent',
];

// What they exported or alone used, so a copy pasted into another file is caught too.
const RETIRED_CALLS = ['filterRobotsByCompanyFocus', 'sortRobotsByCompanyFocus', 'buildCompanySelectionSchema'];

let cached: [file: string, text: string][] | null = null;
/** Every src/ ts/tsx file and its text, read once for the whole file (each test below scans all of them). */
function sources(): [file: string, text: string][] {
  cached ??= (readdirSync(srcRoot, { recursive: true }) as string[])
    .filter((file) => /\.(ts|tsx)$/.test(file) && file !== SELF)
    .map((file) => [file, readFileSync(join(srcRoot, file), 'utf8')]);
  return cached;
}

describe('the Probes list and the Companies index are retired (LAYOUT_REWORK.md Task 21)', () => {
  it.each(DELETED)('%s is gone, with its styles and tests', (module) => {
    for (const ext of ['.ts', '.tsx', '.css', '.test.ts', '.test.tsx', '.css.test.ts']) {
      expect(existsSync(join(srcRoot, module + ext)), module + ext).toBe(false);
    }
  });

  it('the nav content folder is gone with them', () => {
    expect(existsSync(join(srcRoot, 'components/panels/screen/nav/content'))).toBe(false);
  });

  it('nothing under src/ imports or mocks one of them, by path or alias', () => {
    const names = DELETED.map((module) => module.split('/').pop()!).join('|');
    const importOf = new RegExp(`(from|import|vi\\.mock\\()\\s*\\(?\\s*['"][^'"]*/(${names})(\\.css)?['"]`);
    const importers = sources().filter(([, text]) => importOf.test(text)).map(([file]) => file);
    expect(importers).toEqual([]);
  });

  it('nothing under src/ names one of their functions', () => {
    const callOf = new RegExp(`\\b(${RETIRED_CALLS.join('|')})\\b`);
    const callers = sources().filter(([, text]) => callOf.test(text)).map(([file]) => file);
    expect(callers).toEqual([]);
  });
});
