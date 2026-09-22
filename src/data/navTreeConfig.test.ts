import { describe, it, expect } from 'vitest';
import { NAV_TREE_SCHEMA, type NavTreeNodeSchema } from './navTreeConfig';

/** Depth-first search by id across the static schema — mirrors how
 *  useNavTree (Task 3) will need to resolve a node id to its schema entry. */
function findNode(id: string, nodes: NavTreeNodeSchema[] = NAV_TREE_SCHEMA): NavTreeNodeSchema | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(id, node.children);
      if (found) return found;
    }
  }
  return undefined;
}

describe('NAV_TREE_SCHEMA — static tree shape (docs/specs/NAV_LAYOUT_REWRITE.md §2/§5.1)', () => {
  it('has exactly 4 top-level branches: settings, fleetParams, probes, companies', () => {
    expect(NAV_TREE_SCHEMA.map((n) => n.id)).toEqual(['settings', 'fleetParams', 'probes', 'companies']);
  });

  it('Settings has 4 leaf children: volume, quality, tempo, sectorSettings, namespaced by branch', () => {
    const settings = findNode('settings');
    expect(settings?.humanLabel).toBe('Settings');
    expect(settings?.children?.map((c) => c.id)).toEqual([
      'settings.volume',
      'settings.quality',
      'settings.tempo',
      'settings.sectorSettings',
    ]);
    expect(settings?.children?.every((c) => c.children === undefined)).toBe(true);
  });

  it('Fleet Params has 3 category groups (EQ & Filters, Time & Space, Output), each with their own leaves', () => {
    const fleetParams = findNode('fleetParams');
    expect(fleetParams?.humanLabel).toBe('Fleet Params');
    expect(fleetParams?.children?.map((c) => c.id)).toEqual([
      'fleetParams.eqFilters',
      'fleetParams.timeSpace',
      'fleetParams.output',
    ]);
  });

  it('Fleet Params -> EQ & Filters has EQ/HPF/LPF leaves in that order', () => {
    const eqFilters = findNode('fleetParams.eqFilters');
    expect(eqFilters?.children?.map((c) => c.id)).toEqual([
      'fleetParams.eqFilters.eq',
      'fleetParams.eqFilters.hpf',
      'fleetParams.eqFilters.lpf',
    ]);
  });

  it('Fleet Params -> Time & Space has Reverb/Delay leaves', () => {
    const timeSpace = findNode('fleetParams.timeSpace');
    expect(timeSpace?.children?.map((c) => c.id)).toEqual([
      'fleetParams.timeSpace.reverb',
      'fleetParams.timeSpace.delay',
    ]);
  });

  it('Fleet Params -> Output has Compression/Limiter leaves', () => {
    const output = findNode('fleetParams.output');
    expect(output?.children?.map((c) => c.id)).toEqual(['fleetParams.output.compression', 'fleetParams.output.limiter']);
  });

  it('Probes has only the static "All Probes" parent — per-robot subtrees are generated at render time, not authored here', () => {
    const probes = findNode('probes');
    expect(probes?.humanLabel).toBe('Probes');
    expect(probes?.children?.map((c) => c.id)).toEqual(['probes.all']);
  });

  it('Probes -> All Probes has the 4 bulk-edit leaf children: Volume/Melody/Envelope/Source', () => {
    const all = findNode('probes.all');
    expect(all?.children?.map((c) => c.id)).toEqual([
      'probes.all.volume',
      'probes.all.melody',
      'probes.all.envelope',
      'probes.all.source',
    ]);
  });

  it('Companies is a static parent with no static children — per-company subtrees are generated at render time', () => {
    const companies = findNode('companies');
    expect(companies?.humanLabel).toBe('Companies');
    expect(companies?.children).toBeUndefined();
  });

  it('every node id is namespaced by its own branch (no id collides across branches)', () => {
    const ids: string[] = [];
    function collect(nodes: NavTreeNodeSchema[]) {
      for (const node of nodes) {
        ids.push(node.id);
        if (node.children) collect(node.children);
      }
    }
    collect(NAV_TREE_SCHEMA);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every leaf id referenced by later migration tasks (11-20, docs/tasks/NAV_LAYOUT_REWRITE.md) exists in the schema — catches a typo early', () => {
    const idsReferencedByLaterTasks = [
      'settings.volume', // Task 11
      'settings.tempo', // Task 12
      'settings.quality', // Task 13
      'settings.sectorSettings', // spec §2
      'fleetParams.eqFilters.eq', // Task 14
      'fleetParams.eqFilters.hpf', // Task 14
      'fleetParams.eqFilters.lpf', // Task 14
      'fleetParams.timeSpace.reverb', // Task 14
      'fleetParams.timeSpace.delay', // Task 14
      'fleetParams.output.compression', // Task 14
      'fleetParams.output.limiter', // Task 14
      'probes', // Task 18/19
      'probes.all', // Task 19
      'probes.all.volume', // Task 19
      'probes.all.melody', // Task 19
      'probes.all.envelope', // Task 19
      'probes.all.source', // Task 19
      'companies', // Task 20
    ];
    for (const id of idsReferencedByLaterTasks) {
      expect(findNode(id), `expected schema to contain node id "${id}"`).toBeDefined();
    }
  });
});
