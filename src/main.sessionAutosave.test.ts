import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Session Storage Task 11 (docs/tasks/SESSION_STORAGE.md) — main.tsx boot wiring +
// boot-regression check. Same "text-contract assertions against the real source" approach
// main.fonts.test.ts already established: main.tsx is never imported directly in tests (it calls
// createRoot(document.getElementById('root')!) at module scope, which throws in jsdom with no
// #root element).

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mainTsxSource = readFileSync(resolve(repoRoot, 'src/main.tsx'), 'utf-8');

describe('main.tsx session autosave wiring', () => {
  it('imports startSessionAutosave from systems/sessionAutosave', () => {
    expect(mainTsxSource).toMatch(/import\s*\{[^}]*startSessionAutosave[^}]*\}\s*from\s*['"].*sessionAutosave['"]/);
  });

  it('calls startSessionAutosave() exactly once at module scope', () => {
    const calls = mainTsxSource.match(/startSessionAutosave\(\)/g) ?? [];
    expect(calls.length).toBe(1);
  });

  it('never references loadSession or applySessionPayload -- nothing in the boot path can load a session', () => {
    expect(mainTsxSource).not.toMatch(/\bloadSession\b/);
    expect(mainTsxSource).not.toMatch(/\bapplySessionPayload\b/);
  });

  it('keeps the existing ?seed= global Attenuation Style override wiring unchanged (parity check)', () => {
    expect(mainTsxSource).toContain("new URLSearchParams(window.location.search).get('seed')");
    expect(mainTsxSource).toContain('setGlobalAttenuationStyleSeedOverride(seedParam)');
  });
});
