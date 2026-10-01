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
import { NAV_TREE_SCHEMA, type NavTreeNodeSchema } from '@/data/navTreeConfig';

type FleetKey = keyof typeof fleet;

function findNode(id: string, nodes: NavTreeNodeSchema[] = NAV_TREE_SCHEMA): NavTreeNodeSchema | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children && findNode(id, n.children);
    if (hit) return hit;
  }
  return undefined;
}

describe('fleet content parity — nav tree', () => {
  const NAV: Record<string, FleetKey> = {
    'fleetParams': 'fleet.root',
    'fleetParams.pacing': 'fleet.pacing',
    'fleetParams.pacing.tempo': 'fleet.pacing.tempo',
    'fleetParams.pacing.frequency': 'fleet.pacing.automationRate',
    'fleetParams.pacing.duration': 'fleet.pacing.automationLength',
    'fleetParams.pacing.automaticEffects': 'fleet.pacing.automationRange',
    'fleetParams.eqFilters': 'fleet.eqFilters',
    'fleetParams.eqFilters.eq': 'fleet.eq',
    'fleetParams.eqFilters.hpf': 'fleet.hpf',
    'fleetParams.eqFilters.lpf': 'fleet.lpf',
    'fleetParams.fleetDrift': 'fleet.drift',
    'fleetParams.fleetDrift.drift': 'fleet.drift.environmental',
    'fleetParams.fleetDrift.robots': 'fleet.drift.voice',
    'fleetParams.timeSpace': 'fleet.timeSpace',
    'fleetParams.timeSpace.reverb': 'fleet.reverb',
    'fleetParams.timeSpace.delay': 'fleet.delay',
    'fleetParams.output': 'fleet.output',
    'fleetParams.output.compression': 'fleet.compressor',
    'fleetParams.output.limiter': 'fleet.limiter',
  };

  it.each(Object.entries(NAV))('%s ↔ %s', (navId, key) => {
    const node = findNode(navId);
    expect(node, navId).toBeDefined();
    expect(fleet[key].human).toBe(node!.humanLabel);
    expect((fleet[key] as { lore?: string }).lore).toBe(node!.loreLabel);
  });

  it('covers every fleetParams nav node', () => {
    const ids: string[] = [];
    const walk = (n: NavTreeNodeSchema) => { ids.push(n.id); n.children?.forEach(walk); };
    walk(findNode('fleetParams')!);
    expect(ids.sort()).toEqual(Object.keys(NAV).sort());
  });
});

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
