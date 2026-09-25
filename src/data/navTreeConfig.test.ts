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

  it('Settings has 2 leaf children: quality, sectorSettings, namespaced by branch', () => {
    const settings = findNode('settings');
    expect(settings?.humanLabel).toBe('Settings');
    expect(settings?.children?.map((c) => c.id)).toEqual([
      'settings.quality',
      'settings.sectorSettings',
    ]);
  });

  it('Settings -> Quality has Robot Load/Effects Load children (already-existing AudioLoadPanel.tsx rows, given their own tree anchor)', () => {
    const quality = findNode('settings.quality');
    expect(quality?.children?.map((c) => c.id)).toEqual([
      'settings.quality.robotLoad',
      'settings.quality.effectsLoad',
    ]);
    expect(quality?.children?.map((c) => c.humanLabel)).toEqual(['Robot Load', 'Effects Load']);
  });

  it('Settings -> Presets has Attenuation Style/Coordinates children (already-existing SectorSettingsDrawer.tsx rows, given their own tree anchor)', () => {
    const sectorSettings = findNode('settings.sectorSettings');
    expect(sectorSettings?.children?.map((c) => c.id)).toEqual([
      'settings.sectorSettings.attenuationStyle',
      'settings.sectorSettings.coordinates',
    ]);
    expect(sectorSettings?.children?.map((c) => c.humanLabel)).toEqual(['Attenuation Style', 'Coordinates']);
  });

  it('Fleet Params has Pacing plus 3 category groups (EQ & Filters, Time & Space, Output), each with their own leaves', () => {
    const fleetParams = findNode('fleetParams');
    expect(fleetParams?.humanLabel).toBe('Fleet Params');
    expect(fleetParams?.children?.map((c) => c.id)).toEqual([
      'fleetParams.pacing',
      'fleetParams.eqFilters',
      'fleetParams.timeSpace',
      'fleetParams.output',
    ]);
  });

  it('Fleet Params -> Pacing has Tempo/Automatic Effects children, sharing one accordion in the content view unlike the 3 groups below it', () => {
    const pacing = findNode('fleetParams.pacing');
    expect(pacing?.humanLabel).toBe('Pacing');
    expect(pacing?.children?.map((c) => c.id)).toEqual([
      'fleetParams.pacing.tempo',
      'fleetParams.pacing.automaticEffects',
    ]);
    expect(pacing?.children?.map((c) => c.humanLabel)).toEqual(['Tempo', 'Automatic Effects']);
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

  it('Probes -> All Probes has no static children — it is a bulk-edit entity like any robot, and useNavTree.ts\'s buildProbesSubtree generates its 4 sections (and their subsections) via sectionChildNodes(), same as useNavTree.test.ts covers for per-robot/per-company nodes (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 2)', () => {
    const all = findNode('probes.all');
    expect(all?.children).toBeUndefined();
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
      'settings.quality', // Task 13
      'settings.sectorSettings', // spec §2
      'fleetParams.pacing',
      'fleetParams.eqFilters.eq', // Task 14
      'fleetParams.eqFilters.hpf', // Task 14
      'fleetParams.eqFilters.lpf', // Task 14
      'fleetParams.timeSpace.reverb', // Task 14
      'fleetParams.timeSpace.delay', // Task 14
      'fleetParams.output.compression', // Task 14
      'fleetParams.output.limiter', // Task 14
      'probes', // Task 18/19
      'probes.all', // Task 19
      'companies', // Task 20
    ];
    for (const id of idsReferencedByLaterTasks) {
      expect(findNode(id), `expected schema to contain node id "${id}"`).toBeDefined();
    }
  });
});

describe('NAV_TREE_SCHEMA — trait color-coding (experimental, Crawford\'s own request)', () => {
  it('each of the 4 top-level branches has its own assigned trait', () => {
    expect(findNode('settings')?.trait).toBe('spectral');
    expect(findNode('fleetParams')?.trait).toBe('timeSpace');
    expect(findNode('probes')?.trait).toBe('output');
    expect(findNode('companies')?.trait).toBe('company');
  });

  it('Fleet Params\' 3 category groups carry the same trait as their real content elsewhere (AudioRigDrawer.tsx\'s own AUDIO_RIG_EFFECT_TRAIT)', () => {
    expect(findNode('fleetParams.eqFilters')?.trait).toBe('spectral');
    expect(findNode('fleetParams.timeSpace')?.trait).toBe('timeSpace');
    expect(findNode('fleetParams.output')?.trait).toBe('output');
  });

  it('Fleet Params\' individual leaves have no trait of their own — they inherit their own group\'s', () => {
    expect(findNode('fleetParams.eqFilters.eq')?.trait).toBeUndefined();
    expect(findNode('fleetParams.timeSpace.reverb')?.trait).toBeUndefined();
    expect(findNode('fleetParams.output.limiter')?.trait).toBeUndefined();
  });

  it('Settings -> Sector Settings carries \'seed\', matching SectorSettingsDrawer.tsx\'s own getTraitColorStyle call', () => {
    expect(findNode('settings.sectorSettings')?.trait).toBe('seed');
  });

  it('Settings -> Quality has its own explicit trait override, distinct from Settings\' own spectral (Crawford\'s own pick)', () => {
    expect(findNode('settings.quality')?.trait).toBe('seed');
  });

  it('Fleet Params -> Pacing carries \'composition\', matching AudioRigDrawer.tsx\'s own getTraitColorStyle(\'composition\') call for Automatic Effects', () => {
    expect(findNode('fleetParams.pacing')?.trait).toBe('composition');
  });

  it('Probes -> All Probes carries \'header\', overriding Probes\' own output default (Crawford\'s own pick)', () => {
    expect(findNode('probes.all')?.trait).toBe('header');
  });

  // "All Probes"' 4 section leaves' output/composition/timeSpace/spectral trait mapping is now
  // covered where they're generated — useNavTree.ts's own SECTION_CHILDREN, exercised by
  // useNavTree.test.ts — not here, since they're no longer part of the static schema.
});
