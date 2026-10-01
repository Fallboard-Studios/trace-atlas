/**
 * Parity test (docs/tasks/CONTENT_LAYER.md Task 4): the probe area is a byte-for-byte copy of
 * the literals it replaces. Deleted piecewise as each source migrates (robotOptionsConfig → done
 * in Task 8, selection config → Task 9, subsection config → Task 11, intros → Task 13).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { probe } from './probe';

type ProbeKey = keyof typeof probe;
type Entry = { human: string; lore?: string; heading?: string; unit?: string; options?: Record<string, { human: string; lore?: string }> };
const e = (k: ProbeKey) => probe[k] as Entry;
const src = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf8').replace(/\r\n/g, '\n').replace(/'\s*\n\s*\+\s*'/g, '');

describe('probe content parity — component source text', () => {
  const robotsTab = src('components/panels/screen/console/RobotsTab.tsx');

  it('Robots list chrome (RobotsTab — migrates in Task 15)', () => {
    expect(robotsTab).toContain(`aria-label="${e('probe.list').human}"`);
    expect(robotsTab).toContain(`loreLabel: '${e('probe.list.clearFilter').lore}', humanLabel: '${e('probe.list.clearFilter').human}'`);
  });
});
