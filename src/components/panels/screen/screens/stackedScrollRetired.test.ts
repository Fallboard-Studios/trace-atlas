import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// The grep gate for docs/tasks/LAYOUT_REWORK.md Task 18, kept as a test: the stacked scroll's
// machinery is gone (spec §1.11) and nothing under src/ imports it or reads a retired store field
// (spec §1.10). The section tabs (Tasks 15–17) mount one section at a time, so nothing scrolls to
// an anchor, spies on the scroll, or opens an accordion from the nav any more.
const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SELF = join('components', 'panels', 'screen', 'screens', 'stackedScrollRetired.test.ts');

const DELETED = [
  'components/panels/screen/nav/useAccordionOpenState',
  'components/panels/screen/nav/useSectionObserver',
  'utils/accordionSync',
  'utils/sectionRefs',
  'utils/viewFade',
  'testUtils/intersectionObserverStub',
];

const RETIRED_FIELDS = [
  'expandedProbeId', 'setExpandedProbeId',
  'expandedCompanyId', 'setExpandedCompanyId',
  'selectedFleetParamsEffect', 'setSelectedFleetParamsEffect',
];

// The functions those modules exported, so a copy pasted into another file is caught too.
const RETIRED_CALLS = [
  'openAccordionFromNav', 'expandNavAncestorsForId', 'hasPendingNavTargetFor', 'attemptFulfillPendingNavTarget',
  'notifyAccordionAnimationComplete', 'onceAccordionAnimationComplete', 'registerAccordion',
  'setSectionRef', 'getSectionRef', 'clearSectionRef', 'scrollToSection', 'scrollToSectionSettled',
  'setViewFadeRoot', 'fadeInView', 'approachSection',
];

let cached: [file: string, text: string][] | null = null;
/** Every src/ ts/tsx file and its text, read once for the whole file (each test below scans all of them). */
function sources(): [file: string, text: string][] {
  cached ??= (readdirSync(srcRoot, { recursive: true }) as string[])
    .filter((file) => /\.(ts|tsx)$/.test(file) && file !== SELF)
    .map((file) => [file, readFileSync(join(srcRoot, file), 'utf8')]);
  return cached;
}

describe('the stacked scroll is retired (LAYOUT_REWORK.md Task 18)', () => {
  it.each(DELETED)('%s is gone, with its tests', (module) => {
    for (const ext of ['.ts', '.tsx', '.css', '.test.ts', '.test.tsx']) {
      expect(existsSync(join(srcRoot, module + ext)), module + ext).toBe(false);
    }
  });

  it('nothing under src/ imports or mocks one of them, by path or alias', () => {
    const names = DELETED.map((module) => module.split('/').pop()!).join('|');
    const importOf = new RegExp(`(from|import|vi\\.mock\\()\\s*\\(?\\s*['"][^'"]*/(${names})['"]`);
    const importers = sources().filter(([, text]) => importOf.test(text)).map(([file]) => file);
    expect(importers).toEqual([]);
  });

  it('nothing under src/ calls one of their functions', () => {
    const callOf = new RegExp(`\\b(${RETIRED_CALLS.join('|')})\\s*\\(`);
    const callers = sources().filter(([, text]) => callOf.test(text)).map(([file]) => file);
    expect(callers).toEqual([]);
  });

  it('nothing under src/ reads a retired uiStore field', () => {
    const fieldOf = new RegExp(`\\b(${RETIRED_FIELDS.join('|')})\\b`);
    // uiStore.test.ts names each field once to assert it is absent from the store.
    const readers = sources()
      .filter(([file]) => file !== join('stores', 'uiStore.test.ts'))
      .filter(([, text]) => fieldOf.test(text))
      .map(([file]) => file);
    expect(readers).toEqual([]);
  });
});
