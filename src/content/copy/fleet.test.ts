/**
 * Parity test (docs/tasks/CONTENT_LAYER.md Task 3): the fleet area is a byte-for-byte copy of
 * the literals it replaces. Each half is deleted when its source migrates to read from content
 * (audioRig half → Task 7, nav half → Task 10, intro half → Task 12), since the comparison
 * becomes circular at that point.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { fleet } from './fleet';



describe('fleet content parity — FleetParamsContent intros (source text)', () => {
  // The intro tables are module-private, so compare against the component's source with the
  // `' + '` string-concatenation line breaks collapsed.
  const src = readFileSync(resolve(__dirname, '../../components/panels/screen/nav/content/FleetParamsContent.tsx'), 'utf8')
    .replace(/'\s*\n\s*\+\s*'/g, '');

  it.each(['fleet.root', 'fleet.pacing', 'fleet.eqFilters', 'fleet.drift', 'fleet.timeSpace', 'fleet.output'] as const)('%s intro is in the component verbatim', (key) => {
    const { lore, loreDescription, humanDescription } = fleet[key].intro;
    expect(src).toContain(lore);
    expect(src).toContain(loreDescription);
    expect(src).toContain(humanDescription);
  });
});
