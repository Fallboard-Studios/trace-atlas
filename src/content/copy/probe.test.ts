/**
 * Parity test (docs/tasks/CONTENT_LAYER.md Task 4): the probe area is a byte-for-byte copy of
 * the literals it replaces. Deleted piecewise as each source migrates (robotOptionsConfig → done
 * in Task 8, selection config → Task 9, subsection config → Task 11, intros → Task 13).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { probe } from './probe';
import { NAV_TREE_SCHEMA } from '@/data/navTreeConfig';
import { ROBOT_SECTIONS_CONFIG } from '@/data/robotSubsectionConfig';

type ProbeKey = keyof typeof probe;
type Entry = { human: string; lore?: string; heading?: string; unit?: string; options?: Record<string, { human: string; lore?: string }> };
const e = (k: ProbeKey) => probe[k] as Entry;
const src = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf8').replace(/\r\n/g, '\n').replace(/'\s*\n\s*\+\s*'/g, '');

describe('probe content parity — nav tree', () => {
  it('probes / probes.all', () => {
    const probes = NAV_TREE_SCHEMA.find((n) => n.id === 'probes')!;
    expect([e('probe.root').human, e('probe.root').lore]).toEqual([probes.humanLabel, probes.loreLabel]);
    const all = probes.children!.find((n) => n.id === 'probes.all')!;
    expect(e('probe.all').human).toBe(all.humanLabel);
    expect(e('probe.all').lore).toBe(all.loreLabel);
  });
});

describe('probe content parity — robotSubsectionConfig', () => {
  const SECTION: Record<string, ProbeKey> = { volume: 'probe.dynamics', melody: 'probe.composition', envelope: 'probe.envelope', source: 'probe.source' };
  const ROW: Record<string, ProbeKey> = {
    audioSettings: 'probe.dynamics.levelControl', rhythm: 'probe.composition.rhythm', frequency: 'probe.composition.pitches',
    pingContour: 'probe.envelope.contour', baselineOscillator: 'probe.source.core', coaxialOscillator: 'probe.source.companion', harmonicOscillator: 'probe.source.accent',
  };
  const ACCORDION: Record<string, ProbeKey> = {
    audioSettings: 'probe.levels', rhythm: 'probe.composition', pingContour: 'probe.envelope',
    baselineOscillator: 'probe.source.core', coaxialOscillator: 'probe.source.companion', harmonicOscillator: 'probe.source.accent',
  };

  it.each(ROBOT_SECTIONS_CONFIG.map((s) => [s.id, s] as const))('section %s row', (id, s) => {
    expect([e(SECTION[id]).human, e(SECTION[id]).lore]).toEqual([s.navLabel, s.loreLabel]);
    if (s.ownAccordionLabel) expect(e(SECTION[id]).human).toBe(s.ownAccordionLabel);
  });

  it.each(ROBOT_SECTIONS_CONFIG.flatMap((s) => s.subsections.map((sub) => [sub.id, sub] as const)))('subsection %s row + accordion', (id, sub) => {
    expect([e(ROW[id]).human, e(ROW[id]).lore]).toEqual([sub.navLabel, sub.loreLabel]);
    if (sub.accordionLabel) expect(e(ACCORDION[id]).human).toBe(sub.accordionLabel);
    else expect(ACCORDION[id]).toBeUndefined();
  });
});

describe('probe content parity — component source text', () => {
  const probes = src('components/panels/screen/nav/content/ProbesContent.tsx');
  const stack = src('components/panels/screen/nav/RobotSectionAccordionStack.tsx');
  const tab = src('components/panels/screen/console/RobotOptionsTab.tsx');
  const robotsTab = src('components/panels/screen/console/RobotsTab.tsx');

  it.each(['probe.root', 'probe.all'] as const)('%s intro in ProbesContent', (k) => {
    const { lore, loreDescription, humanDescription } = probe[k].intro;
    for (const s of [lore, loreDescription, humanDescription]) expect(probes).toContain(s);
  });
  it.each(['probe.levels', 'probe.composition', 'probe.envelope', 'probe.source'] as const)('%s intro in RobotSectionAccordionStack', (k) => {
    const { lore, loreDescription, humanDescription } = probe[k].intro;
    for (const s of [lore, loreDescription, humanDescription]) expect(stack).toContain(s);
  });
  it('Robot not found / Robots list chrome', () => {
    expect(tab).toContain(`>${e('probe.notFound').human}<`);
    expect(robotsTab).toContain(`aria-label="${e('probe.list').human}"`);
    expect(robotsTab).toContain(`loreLabel: '${e('probe.list.clearFilter').lore}', humanLabel: '${e('probe.list.clearFilter').human}'`);
  });
});
