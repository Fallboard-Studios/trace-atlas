import { describe, it, expect } from 'vitest';
import { NAV_TREE_SCHEMA, type NavTreeNodeSchema } from './navTreeConfig';
import { CONTENT } from '@/content';

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
  it('has exactly 4 top-level branches: fleetParams, probes, companies, settings', () => {
    expect(NAV_TREE_SCHEMA.map((n) => n.id)).toEqual(['fleetParams', 'probes', 'companies', 'settings']);
  });

  it('Settings has 3 leaf children: quality, sectorSettings, sessions, namespaced by branch', () => {
    const settings = findNode('settings');
    // Reversed from docs/reference/text-content-tables.md's original split (Crawford's own
    // correction) — "Settings" is the human label, "Navigation" is the lore label.
    expect(settings?.loreLabel).toBe(CONTENT['settings.root'].lore);
    expect(settings?.humanLabel).toBe(CONTENT['settings.root'].human);
    expect(settings?.children?.map((c) => c.id)).toEqual([
      'settings.quality',
      'settings.sectorSettings',
      'settings.sessions',
    ]);
  });

  it('Settings -> Sessions (Roadmap Phase 20, docs/tasks/SESSION_STORAGE.md Task 10) has no static children', () => {
    const sessions = findNode('settings.sessions');
    expect(sessions?.humanLabel).toBe(CONTENT['settings.sessions'].human);
    expect(sessions?.children).toBeUndefined();
  });

  it('Settings -> Quality has Robot Load/Effects Load children (already-existing AudioLoadPanel.tsx rows, given their own tree anchor)', () => {
    const quality = findNode('settings.quality');
    expect(quality?.children?.map((c) => c.id)).toEqual([
      'settings.quality.robotLoad',
      'settings.quality.effectsLoad',
    ]);
    expect(quality?.children?.map((c) => c.humanLabel)).toEqual([CONTENT['settings.quality.robotLoad'].human, CONTENT['settings.quality.effectsLoad'].human]);
  });

  it('Settings -> Presets has Attenuation Style/Coordinates children (already-existing SectorSettingsDrawer.tsx rows, given their own tree anchor)', () => {
    const sectorSettings = findNode('settings.sectorSettings');
    expect(sectorSettings?.children?.map((c) => c.id)).toEqual([
      'settings.sectorSettings.attenuationStyle',
      'settings.sectorSettings.coordinates',
    ]);
    expect(sectorSettings?.children?.map((c) => c.humanLabel)).toEqual([CONTENT['sector.attenuationStyle'].human, CONTENT['sector.coords'].human]);
  });

  it('Fleet Params has Pacing plus 4 category groups (LFO Bank, EQ & Filters, Time & Space, Output), each with their own leaves', () => {
    const fleetParams = findNode('fleetParams');
    expect(fleetParams?.humanLabel).toBe(CONTENT['fleet.root'].human);
    expect(fleetParams?.children?.map((c) => c.id)).toEqual([
      'fleetParams.pacing',
      'fleetParams.lfoBank',
      'fleetParams.eqFilters',
      'fleetParams.timeSpace',
      'fleetParams.output',
    ]);
  });

  it('Fleet Params -> Pacing has Tempo/Frequency/Duration/Automatic Intensity children, sharing one accordion in the content view unlike the 3 groups below it (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md)', () => {
    const pacing = findNode('fleetParams.pacing');
    expect(pacing?.humanLabel).toBe(CONTENT['fleet.pacing'].human);
    expect(pacing?.children?.map((c) => c.id)).toEqual([
      'fleetParams.pacing.tempo',
      'fleetParams.pacing.frequency',
      'fleetParams.pacing.duration',
      'fleetParams.pacing.automaticEffects',
    ]);
    expect(pacing?.children?.map((c) => c.humanLabel)).toEqual([CONTENT['fleet.pacing.tempo'].human, CONTENT['fleet.pacing.automationRate'].human, CONTENT['fleet.pacing.automationLength'].human, CONTENT['fleet.pacing.automationRange'].human]);
  });

  it('Fleet Params -> EQ & Filters has EQ/HPF/LPF leaves in that order', () => {
    const eqFilters = findNode('fleetParams.eqFilters');
    expect(eqFilters?.children?.map((c) => c.id)).toEqual([
      'fleetParams.eqFilters.eq',
      'fleetParams.eqFilters.hpf',
      'fleetParams.eqFilters.lpf',
    ]);
  });

  it('Fleet Params -> LFO Bank has exactly 4 leaves, one per world lane in a-b-c-d order (docs/tasks/LFO_BANK.md Task 15 — new top-level group, positioned right after Pacing, replacing the former Drift group entirely)', () => {
    const lfoBank = findNode('fleetParams.lfoBank');
    expect(lfoBank?.humanLabel).toBe(CONTENT['fleet.lfoBank'].human);
    expect(lfoBank?.children?.map((c) => c.id)).toEqual([
      'fleetParams.lfoBank.a',
      'fleetParams.lfoBank.b',
      'fleetParams.lfoBank.c',
      'fleetParams.lfoBank.d',
    ]);
    expect(lfoBank?.children?.map((c) => c.humanLabel)).toEqual([
      CONTENT['fleet.lfoBank.laneA'].human,
      CONTENT['fleet.lfoBank.laneB'].human,
      CONTENT['fleet.lfoBank.laneC'].human,
      CONTENT['fleet.lfoBank.laneD'].human,
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
    expect(probes?.humanLabel).toBe(CONTENT['probe.root'].human);
    expect(probes?.children?.map((c) => c.id)).toEqual(['probes.all']);
  });

  it('Probes -> All Probes has no static children — it is a bulk-edit entity like any robot, and useNavTree.ts\'s buildProbesSubtree generates its 4 sections (and their subsections) via sectionChildNodes(), same as useNavTree.test.ts covers for per-robot/per-company nodes (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 2)', () => {
    const all = findNode('probes.all');
    expect(all?.children).toBeUndefined();
  });

  it('Companies is a static parent with no static children — per-company subtrees are generated at render time', () => {
    const companies = findNode('companies');
    expect(companies?.humanLabel).toBe(CONTENT['company.root'].human);
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
      'settings.sessions', // Session Storage (Roadmap Phase 20) Task 10
    ];
    for (const id of idsReferencedByLaterTasks) {
      expect(findNode(id), `expected schema to contain node id "${id}"`).toBeDefined();
    }
  });
});

describe('NAV_TREE_SCHEMA — trait color-coding (experimental, Crawford\'s own request)', () => {
  it('each of the 4 top-level branches has its own assigned trait', () => {
    // Settings moved to 'seed' and Fleet Params to 'spectral' in the nav style refresh
    // (db17282) — Settings no longer defaults its leaves to spectral (Quality/Sector
    // Settings both already override to 'seed' explicitly), and Fleet Params' own default
    // now matches its EQ & Filters group instead of Time & Space.
    expect(findNode('settings')?.trait).toBe('seed');
    expect(findNode('fleetParams')?.trait).toBe('spectral');
    expect(findNode('probes')?.trait).toBe('output');
    expect(findNode('companies')?.trait).toBe('company');
  });

  it('Fleet Params\' category groups carry the same trait as their real content elsewhere (AudioRigDrawer.tsx\'s own AUDIO_RIG_EFFECT_TRAIT)', () => {
    expect(findNode('fleetParams.eqFilters')?.trait).toBe('spectral');
    expect(findNode('fleetParams.timeSpace')?.trait).toBe('timeSpace');
    expect(findNode('fleetParams.output')?.trait).toBe('output');
  });

  it('LFO Bank matches Time & Space\'s own trait (docs/tasks/LFO_BANK.md Task 15 — FleetParamsContent.tsx\'s own FLEET_PARAMS_GROUPS entry sets this explicitly)', () => {
    expect(findNode('fleetParams.lfoBank')?.trait).toBe('timeSpace');
  });

  it('Fleet Params\' individual leaves have no trait of their own — they inherit their own group\'s', () => {
    expect(findNode('fleetParams.eqFilters.eq')?.trait).toBeUndefined();
    expect(findNode('fleetParams.timeSpace.reverb')?.trait).toBeUndefined();
    expect(findNode('fleetParams.output.limiter')?.trait).toBeUndefined();
  });

  it('Settings -> Sector Settings carries \'seed\', matching SectorSettingsDrawer.tsx\'s own getTraitColorStyle call', () => {
    expect(findNode('settings.sectorSettings')?.trait).toBe('seed');
  });

  it('Settings -> Sessions carries \'seed\' too, matching its sibling leaves rather than inheriting Settings\' own default', () => {
    expect(findNode('settings.sessions')?.trait).toBe('seed');
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

describe('navTreeConfig reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 10)', () => {
  it('carries no copy literal of its own; every static node is authored with a content key, never a label or docId', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, 'navTreeConfig.ts'), 'utf8');
    expect(src).not.toMatch(/(loreLabel|humanLabel)\s*:\s*['"`]/);
    expect(src).not.toMatch(/docId/);
    const { NAV_TREE_CONFIG } = await import('./navTreeConfig');
    const { CONTENT } = await import('@/content');
    const walk = (nodes: Array<{ id: string; content: string; children?: unknown[] }>) => {
      for (const n of nodes) {
        expect(n.content, n.id).toBeDefined();
        expect(CONTENT, `${n.id} → ${n.content}`).toHaveProperty(n.content);
        expect(n).not.toHaveProperty('humanLabel');
        expect(n).not.toHaveProperty('loreLabel');
        if (n.children) walk(n.children as Array<{ id: string; content: string; children?: unknown[] }>);
      }
    };
    walk(NAV_TREE_CONFIG as never);
  });
  it('the resolved NAV_TREE_SCHEMA carries each node\'s CONTENT human/lore pair', async () => {
    const { CONTENT } = await import('@/content');
    const fleet = NAV_TREE_SCHEMA.find((n) => n.id === 'fleetParams')!;
    expect([fleet.humanLabel, fleet.loreLabel]).toEqual([CONTENT['fleet.root'].human, CONTENT['fleet.root'].lore]);
    const tempo = fleet.children![0].children![0];
    expect([tempo.id, tempo.humanLabel, tempo.loreLabel]).toEqual(['fleetParams.pacing.tempo', CONTENT['fleet.pacing.tempo'].human, CONTENT['fleet.pacing.tempo'].lore]);
    const allProbes = NAV_TREE_SCHEMA.find((n) => n.id === 'probes')!.children![0];
    expect(allProbes.humanLabel).toBe(CONTENT['probe.all'].human);
    expect(allProbes).not.toHaveProperty('loreLabel');
  });
});
