import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// TYPE_SCALE.md Task 1 — covers main.tsx's self-hosted @fontsource import list and
// package.json's declared dependency. main.tsx itself is never imported directly in
// tests (it calls createRoot(document.getElementById('root')!) at module scope, which
// throws in jsdom with no #root element) — these are text-contract assertions against
// the real source files, the same class of test as a config/manifest check.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mainTsxSource = readFileSync(resolve(repoRoot, 'src/main.tsx'), 'utf-8');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8'));

describe('main.tsx font imports', () => {
  it('declares @fontsource/titillium-web as a dependency', () => {
    expect(packageJson.dependencies['@fontsource/titillium-web']).toBe('^5.3.0');
  });

  it('imports Titillium Web weights 400/600/700, latin and latin-ext', () => {
    const expectedImports = [
      "import '@fontsource/titillium-web/latin-400.css'",
      "import '@fontsource/titillium-web/latin-ext-400.css'",
      "import '@fontsource/titillium-web/latin-600.css'",
      "import '@fontsource/titillium-web/latin-ext-600.css'",
      "import '@fontsource/titillium-web/latin-700.css'",
      "import '@fontsource/titillium-web/latin-ext-700.css'",
    ];
    for (const line of expectedImports) {
      expect(mainTsxSource).toContain(line);
    }
  });

  it('does not import Titillium Web weights 200/300/900 (avoid light/thin weights)', () => {
    expect(mainTsxSource).not.toMatch(/@fontsource\/titillium-web\/latin(-ext)?-(200|300|900)\.css/);
  });

  it('drops the Rajdhani 300 and 400 weight imports', () => {
    const removedImports = [
      "import '@fontsource/rajdhani/latin-300.css'",
      "import '@fontsource/rajdhani/latin-ext-300.css'",
      "import '@fontsource/rajdhani/latin-400.css'",
      "import '@fontsource/rajdhani/latin-ext-400.css'",
    ];
    for (const line of removedImports) {
      expect(mainTsxSource).not.toContain(line);
    }
  });

  it('keeps the Rajdhani 500/600/700 weight imports (regression guard)', () => {
    const keptImports = [
      "import '@fontsource/rajdhani/latin-500.css'",
      "import '@fontsource/rajdhani/latin-ext-500.css'",
      "import '@fontsource/rajdhani/latin-600.css'",
      "import '@fontsource/rajdhani/latin-ext-600.css'",
      "import '@fontsource/rajdhani/latin-700.css'",
      "import '@fontsource/rajdhani/latin-ext-700.css'",
    ];
    for (const line of keptImports) {
      expect(mainTsxSource).toContain(line);
    }
  });
});

describe('main.tsx Fugaz One import', () => {
  it('declares @fontsource/fugaz-one as a dependency', () => {
    expect(packageJson.dependencies['@fontsource/fugaz-one']).toBe('^5.3.0');
  });

  it('imports the Fugaz One 400 weight, latin subset only (no latin-ext build exists)', () => {
    expect(mainTsxSource).toContain("import '@fontsource/fugaz-one/latin-400.css'");
    expect(mainTsxSource).not.toMatch(/@fontsource\/fugaz-one\/latin-ext-400\.css/);
  });
});
