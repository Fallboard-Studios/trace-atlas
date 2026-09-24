import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNavTree } from './useNavTree';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Robot } from '@/types/Robot';
import type { Company } from '@/types/Company';
import type { Locale } from '@/types/locale';

const localeId = getActiveLocaleId();
const UI_INITIAL_STATE = useUIStore.getState();

function makeRobot(id: string, name?: string, identityColor?: string): Robot {
  return { id, name, identityColor } as unknown as Robot;
}

function makeCompany(id: string, name: string, color = '#fff'): Company {
  return { id, name, color, robotIds: [] };
}

function resetStores() {
  useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  useUIStore.setState(UI_INITIAL_STATE, true);
}

function findNode(id: string, nodes: ReturnType<typeof useNavTree>['nodes']): ReturnType<typeof useNavTree>['nodes'][number] | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(id, node.children);
      if (found) return found;
    }
  }
  return undefined;
}

describe('useNavTree — dynamic tree merging (docs/tasks/NAV_LAYOUT_REWRITE.md Task 3)', () => {
  beforeEach(resetStores);

  it('generates one probes.<id> node per robot in the active locale, named after the robot', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    useLocaleStore.getState().addRobot(localeId, makeRobot('r2', 'Unit Two'));

    const { result } = renderHook(() => useNavTree());
    const probes = findNode('probes', result.current.nodes);

    expect(probes?.children?.map((c) => c.id)).toEqual(['probes.all', 'probes.r1', 'probes.r2']);
    expect(findNode('probes.r1', result.current.nodes)?.humanLabel).toBe('Unit One');
  });

  it('falls back to the robot id as the label when the robot has no name', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('unnamed-1'));

    const { result } = renderHook(() => useNavTree());
    expect(findNode('probes.unnamed-1', result.current.nodes)?.humanLabel).toBe('unnamed-1');
  });

  it('each generated probe node has the 4 section leaf children', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));

    const { result } = renderHook(() => useNavTree());
    expect(findNode('probes.r1', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'probes.r1.volume',
      'probes.r1.melody',
      'probes.r1.envelope',
      'probes.r1.source',
    ]);
  });

  it('generates one companies.<id> node per company in the active locale, with its own 4 section children', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));

    const { result } = renderHook(() => useNavTree());
    const companies = findNode('companies', result.current.nodes);

    expect(companies?.children?.map((c) => c.id)).toEqual(['companies.c1']);
    expect(findNode('companies.c1', result.current.nodes)?.humanLabel).toBe('Acme Corp');
    expect(findNode('companies.c1', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'companies.c1.volume',
      'companies.c1.melody',
      'companies.c1.envelope',
      'companies.c1.source',
    ]);
  });

  it('carries each company\'s own identity color onto its tree node — the tree row\'s color-coding home (Task 20, spec §7 Q3)', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp', '#4f6d7a'));
    useLocaleStore.getState().addCompany(localeId, makeCompany('c2', 'Beta Inc', '#7a4f6d'));

    const { result } = renderHook(() => useNavTree());

    expect(findNode('companies.c1', result.current.nodes)?.color).toBe('#4f6d7a');
    expect(findNode('companies.c2', result.current.nodes)?.color).toBe('#7a4f6d');
  });

  it('never puts a color on a company\'s own section children — only the company row itself is tinted', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp', '#4f6d7a'));

    const { result } = renderHook(() => useNavTree());

    expect(findNode('companies.c1.volume', result.current.nodes)?.color).toBeUndefined();
  });

  it('carries each robot\'s own identityColor onto its tree node, same as a company\'s color (Crawford\'s own follow-up request)', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One', '#123456'));
    useLocaleStore.getState().addRobot(localeId, makeRobot('r2', 'Unit Two', '#abcdef'));

    const { result } = renderHook(() => useNavTree());

    expect(findNode('probes.r1', result.current.nodes)?.color).toBe('#123456');
    expect(findNode('probes.r2', result.current.nodes)?.color).toBe('#abcdef');
  });

  it('never puts a color on a robot\'s own section children — only the robot row itself is tinted', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One', '#123456'));

    const { result } = renderHook(() => useNavTree());

    expect(findNode('probes.r1.volume', result.current.nodes)?.color).toBeUndefined();
  });

  it('each section child (probes/companies) carries the same trait its real content uses elsewhere (output/composition/timeSpace/spectral)', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));

    const { result } = renderHook(() => useNavTree());

    for (const prefix of ['probes.r1', 'companies.c1']) {
      expect(findNode(`${prefix}.volume`, result.current.nodes)?.trait).toBe('output');
      expect(findNode(`${prefix}.melody`, result.current.nodes)?.trait).toBe('composition');
      expect(findNode(`${prefix}.envelope`, result.current.nodes)?.trait).toBe('timeSpace');
      expect(findNode(`${prefix}.source`, result.current.nodes)?.trait).toBe('spectral');
    }
  });

  it('tracks the live roster — adding a robot after mount updates nodes without a remount', () => {
    const { result } = renderHook(() => useNavTree());
    expect(findNode('probes', result.current.nodes)?.children?.map((c) => c.id)).toEqual(['probes.all']);

    act(() => {
      useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    });

    expect(findNode('probes', result.current.nodes)?.children?.map((c) => c.id)).toEqual(['probes.all', 'probes.r1']);
  });

  it('tracks the live company list — removing a company after mount updates nodes without a remount', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());
    expect(findNode('companies', result.current.nodes)?.children).toHaveLength(1);

    act(() => {
      useLocaleStore.getState().removeCompany(localeId, 'c1');
    });

    expect(findNode('companies', result.current.nodes)?.children).toHaveLength(0);
  });
});

describe('useNavTree — 4th tree level, subsection children (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 2)', () => {
  beforeEach(resetStores);

  it('each robot section has the right subsection children: Output->1, Melody->2, Envelope->1, Source->4', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    expect(findNode('probes.r1.volume', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'probes.r1.volume.audioSettings',
    ]);
    expect(findNode('probes.r1.melody', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'probes.r1.melody.rhythm',
      'probes.r1.melody.frequency',
    ]);
    expect(findNode('probes.r1.envelope', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'probes.r1.envelope.pingContour',
    ]);
    expect(findNode('probes.r1.source', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'probes.r1.source.baselineOscillator',
      'probes.r1.source.coaxialOscillator',
      'probes.r1.source.harmonicOscillator',
      'probes.r1.source.probeDrift',
    ]);
  });

  it('companies get the identical subsection shape as probes, via the same shared sectionChildNodes', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    expect(findNode('companies.c1.melody', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'companies.c1.melody.rhythm',
      'companies.c1.melody.frequency',
    ]);
    expect(findNode('companies.c1.source', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'companies.c1.source.baselineOscillator',
      'companies.c1.source.coaxialOscillator',
      'companies.c1.source.harmonicOscillator',
      'companies.c1.source.probeDrift',
    ]);
  });

  it('"All Probes" (probes.all) also gains the 4th level — it is a bulk-edit entity like any robot, not a static leaf', () => {
    const { result } = renderHook(() => useNavTree());

    expect(findNode('probes.all.source', result.current.nodes)?.children?.map((c) => c.id)).toEqual([
      'probes.all.source.baselineOscillator',
      'probes.all.source.coaxialOscillator',
      'probes.all.source.harmonicOscillator',
      'probes.all.source.probeDrift',
    ]);
  });

  it('"All Probes" section children keep the same output/composition/timeSpace/spectral trait mapping as a real robot\'s, unaffected by its own header override', () => {
    const { result } = renderHook(() => useNavTree());

    expect(findNode('probes.all.volume', result.current.nodes)?.trait).toBe('output');
    expect(findNode('probes.all.melody', result.current.nodes)?.trait).toBe('composition');
    expect(findNode('probes.all.envelope', result.current.nodes)?.trait).toBe('timeSpace');
    expect(findNode('probes.all.source', result.current.nodes)?.trait).toBe('spectral');
  });

  it('renames "Volume" to "Output" and "Robot Drift" to "Probe Drift" as humanLabels only — id segments stay volume/probeDrift', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    const volumeNode = findNode('probes.r1.volume', result.current.nodes);
    expect(volumeNode?.humanLabel).toBe('Output');
    expect(volumeNode?.id).toBe('probes.r1.volume');

    const probeDriftNode = findNode('probes.r1.source.probeDrift', result.current.nodes);
    expect(probeDriftNode?.humanLabel).toBe('Probe Drift');
    expect(probeDriftNode?.id).toBe('probes.r1.source.probeDrift');
  });
});

describe('useNavTree — select() maps a subsection id to selectedSubsection (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 2)', () => {
  beforeEach(resetStores);

  it('selecting probes.<id>.source.probeDrift sets selectedSection AND selectedSubsection', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.r1.source.probeDrift'));

    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().selectedSection).toBe('source');
    expect(useUIStore.getState().selectedSubsection).toBe('probeDrift');
  });

  it('selecting companies.<id>.melody.rhythm sets selectedSection AND selectedSubsection, equivalent mapping to probes', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('companies.c1.melody.rhythm'));

    expect(useUIStore.getState().selectedCompanyId).toBe('c1');
    expect(useUIStore.getState().selectedSection).toBe('melody');
    expect(useUIStore.getState().selectedSubsection).toBe('rhythm');
  });

  it('selecting a mid-level section (no subsection) clears selectedSubsection back to null', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('probes.r1.source.probeDrift'));

    act(() => result.current.select('probes.r1.melody'));

    expect(useUIStore.getState().selectedSection).toBe('melody');
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });

  it('selecting the bare robot (no section) clears both selectedSection and selectedSubsection', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('probes.r1.source.probeDrift'));

    act(() => result.current.select('probes.r1'));

    expect(useUIStore.getState().selectedSection).toBeNull();
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });
});

describe('useNavTree — isSelected on a full 4-segment subsection id (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 2)', () => {
  beforeEach(resetStores);

  it('is true only for the exact selected subsection, false for its siblings and its own parent section', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.r1.source.probeDrift'));

    expect(result.current.isSelected('probes.r1.source.probeDrift')).toBe(true);
    expect(result.current.isSelected('probes.r1.source.baselineOscillator')).toBe(false);
    expect(result.current.isSelected('probes.r1.source')).toBe(false);
  });
});

describe('useNavTree — toggleExpand/isExpanded accordion-of-one for a section within an expanded probe/company (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 2)', () => {
  beforeEach(resetStores);

  it('expanding probes.<id>.melody sets expandedProbeSection, independent of expandedProbeId', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1'));
    act(() => result.current.toggleExpand('probes.r1.melody'));

    expect(useUIStore.getState().expandedProbeId).toBe('r1');
    expect(useUIStore.getState().expandedProbeSection).toBe('melody');
    expect(result.current.isExpanded('probes.r1.melody')).toBe(true);
  });

  it('expanding a different section under the same probe clears the previously-expanded one — accordion-of-one', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1.melody'));
    act(() => result.current.toggleExpand('probes.r1.source'));

    expect(useUIStore.getState().expandedProbeSection).toBe('source');
    expect(result.current.isExpanded('probes.r1.melody')).toBe(false);
    expect(result.current.isExpanded('probes.r1.source')).toBe(true);
  });

  it('expandedProbeSection and expandedCompanySection are independent of each other', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1.melody'));
    act(() => result.current.toggleExpand('companies.c1.source'));

    expect(useUIStore.getState().expandedProbeSection).toBe('melody');
    expect(useUIStore.getState().expandedCompanySection).toBe('source');
  });

  it('toggling an already-expanded section again collapses it', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1.melody'));
    act(() => result.current.toggleExpand('probes.r1.melody'));

    expect(useUIStore.getState().expandedProbeSection).toBeNull();
  });
});

describe('useNavTree — select() maps generic node ids to typed uiStore fields (Task 3 AC1)', () => {
  beforeEach(resetStores);

  it('selecting probes.<id> sets selectedRobotId and activeHubTile to robots', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.r1'));

    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().activeHubTile).toBe('robots');
    expect(useUIStore.getState().selectedSection).toBeNull();
  });

  it('selecting probes.<id>.volume additionally sets selectedSection', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.r1.volume'));

    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().activeHubTile).toBe('robots');
    expect(useUIStore.getState().selectedSection).toBe('volume');
  });

  it('selecting probes (the parent) clears selectedRobotId — back to the browse list', () => {
    useUIStore.getState().selectRobot('r1');
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes'));

    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });

  it('selecting companies.<id> sets selectedCompanyId and activeHubTile to companies — equivalent mapping to probes', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('companies.c1'));

    expect(useUIStore.getState().selectedCompanyId).toBe('c1');
    expect(useUIStore.getState().activeHubTile).toBe('companies');
    expect(useUIStore.getState().selectedSection).toBeNull();
  });

  it('selecting companies.<id>.melody additionally sets selectedSection', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('companies.c1.melody'));

    expect(useUIStore.getState().selectedCompanyId).toBe('c1');
    expect(useUIStore.getState().selectedSection).toBe('melody');
  });

  it('selecting the bare "companies" parent clears selectedCompanyId — back to the Create form, not a stale Company X (Task 20)', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('companies.c1'));

    act(() => result.current.select('companies'));

    expect(useUIStore.getState().selectedCompanyId).toBeNull();
    expect(useUIStore.getState().activeHubTile).toBe('companies');
  });

  it('selecting the 4 static top-level branches sets activeHubTile to their mapped HubTile', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('settings'));
    expect(useUIStore.getState().activeHubTile).toBe('settings');

    act(() => result.current.select('fleetParams'));
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');

    act(() => result.current.select('probes'));
    expect(useUIStore.getState().activeHubTile).toBe('robots');

    act(() => result.current.select('companies'));
    expect(useUIStore.getState().activeHubTile).toBe('companies');
  });

  it('selecting probes.all selects every robot (broadcast target), not a single robot', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.all'));

    expect(useUIStore.getState().allRobotsSelected).toBe(true);
    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });

  it('selecting probes.all sets allProbesSelected — disambiguates it from the bare "probes" browse list (Task 19)', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.all'));

    expect(useUIStore.getState().allProbesSelected).toBe(true);
  });

  it('selecting the bare "probes" parent clears allProbesSelected — back to the browse list, not All Probes', () => {
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('probes.all'));

    act(() => result.current.select('probes'));

    expect(useUIStore.getState().allProbesSelected).toBe(false);
  });

  it('selecting a specific probes.<id> clears allProbesSelected', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('probes.all'));

    act(() => result.current.select('probes.r1'));

    expect(useUIStore.getState().allProbesSelected).toBe(false);
    expect(useUIStore.getState().selectedRobotId).toBe('r1');
  });

  it('selecting a Settings leaf (settings.volume) sets activeHubTile and selectedSettingsLeaf (Task 11)', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('settings.volume'));

    expect(useUIStore.getState().activeHubTile).toBe('settings');
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('volume');
  });

  it('selecting each of the other 3 Settings leaves sets selectedSettingsLeaf accordingly', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('settings.quality'));
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('quality');

    act(() => result.current.select('settings.tempo'));
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('tempo');

    act(() => result.current.select('settings.sectorSettings'));
    expect(useUIStore.getState().selectedSettingsLeaf).toBe('sectorSettings');
  });

  it('selecting the bare "settings" parent opens its first leaf (Volume) — first-leaf-on-parent-select, docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6, replacing the old swap-model\'s "nothing selected" fallback', () => {
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('settings.tempo'));

    act(() => result.current.select('settings'));

    expect(useUIStore.getState().selectedSettingsLeaf).toBe('volume');
  });

  it('selecting a Fleet Params effect leaf sets activeHubTile to audioRig and selectedFleetParamsEffect to the matching AudioRigEffectKey (Task 14)', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('fleetParams.eqFilters.eq'));
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('eq3');

    act(() => result.current.select('fleetParams.eqFilters.hpf'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('filterHPF');

    act(() => result.current.select('fleetParams.eqFilters.lpf'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('filterLPF');

    act(() => result.current.select('fleetParams.timeSpace.reverb'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('reverb');

    act(() => result.current.select('fleetParams.timeSpace.delay'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('delay');

    act(() => result.current.select('fleetParams.output.compression'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('compressor');

    act(() => result.current.select('fleetParams.output.limiter'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('limiter');
  });

  it('selecting the bare "fleetParams" parent opens the first leaf overall (3-Band EQ) — first-leaf-on-parent-select, docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6', () => {
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('fleetParams.output.limiter'));

    act(() => result.current.select('fleetParams'));

    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('eq3');
  });

  it('selecting a category group opens ITS OWN first child, not always the overall first leaf', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('fleetParams.eqFilters'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('eq3');

    act(() => result.current.select('fleetParams.timeSpace'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('reverb');

    act(() => result.current.select('fleetParams.output'));
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('compressor');
  });
});

describe('useNavTree — select() auto-expands every ancestor row (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 14, spec §1.6)', () => {
  beforeEach(resetStores);

  it('selecting a deep probe subsection expands the top-level branch, the probe, and its section in one step', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.r1.source.probeDrift'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('probes');
    expect(useUIStore.getState().expandedProbeId).toBe('r1');
    expect(useUIStore.getState().expandedProbeSection).toBe('source');
  });

  it('selecting a deep company subsection expands the top-level branch, the company, and its section in one step', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('companies.c1.melody.rhythm'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('companies');
    expect(useUIStore.getState().expandedCompanyId).toBe('c1');
    expect(useUIStore.getState().expandedCompanySection).toBe('melody');
  });

  it('selecting a Fleet Params leaf expands the top-level branch and its own group', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('fleetParams.timeSpace.reverb'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('fleetParams');
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('timeSpace');
  });

  it('selecting a Settings leaf expands the Settings top-level branch', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('settings.tempo'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('settings');
  });

  it('selecting a leaf in one branch does not disturb another branch\'s own expand state — no stale accordion-open state leaks across branches', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.r1.envelope'));
    act(() => result.current.select('fleetParams.eqFilters.eq'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('fleetParams');
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('eqFilters');
    // The probe's own expand state is untouched — switching branches doesn't collapse it, only
    // expandedTopLevelBranch (the accordion-of-one for which top-level row is peeked) moves on.
    expect(useUIStore.getState().expandedProbeId).toBe('r1');
    expect(useUIStore.getState().expandedProbeSection).toBe('envelope');
  });
});

describe('useNavTree — isSelected disambiguates bare "probes" (browse list) from "probes.all" (All Probes bulk-edit) via allProbesSelected (Task 19)', () => {
  beforeEach(resetStores);

  it('neither is selected before anything is chosen', () => {
    const { result } = renderHook(() => useNavTree());

    expect(result.current.isSelected('probes')).toBe(false);
    expect(result.current.isSelected('probes.all')).toBe(false);
  });

  it('after selecting probes.all, isSelected is true for "probes.all" and false for bare "probes"', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.all'));

    expect(result.current.isSelected('probes.all')).toBe(true);
    expect(result.current.isSelected('probes')).toBe(false);
  });

  it('after selecting the bare "probes" browse list, isSelected is true for "probes" and false for "probes.all"', () => {
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('probes.all'));

    act(() => result.current.select('probes'));

    expect(result.current.isSelected('probes')).toBe(true);
    expect(result.current.isSelected('probes.all')).toBe(false);
  });

  it('after selecting a specific robot, neither "probes" nor "probes.all" is selected', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());
    act(() => result.current.select('probes.all'));

    act(() => result.current.select('probes.r1'));

    expect(result.current.isSelected('probes')).toBe(false);
    expect(result.current.isSelected('probes.all')).toBe(false);
    expect(result.current.isSelected('probes.r1')).toBe(true);
  });
});

describe('useNavTree — toggleExpand accordion-of-one within the Probes branch (Task 3 AC2)', () => {
  beforeEach(resetStores);

  it('expanding a probe sets expandedProbeId to that robot id, verified with 2+ robots', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    useLocaleStore.getState().addRobot(localeId, makeRobot('r2', 'Unit Two'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1'));
    expect(useUIStore.getState().expandedProbeId).toBe('r1');
    expect(result.current.isExpanded('probes.r1')).toBe(true);
    expect(result.current.isExpanded('probes.r2')).toBe(false);
  });

  it('expanding a different probe clears the previously-expanded one — accordion-of-one', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    useLocaleStore.getState().addRobot(localeId, makeRobot('r2', 'Unit Two'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1'));
    act(() => result.current.toggleExpand('probes.r2'));

    expect(useUIStore.getState().expandedProbeId).toBe('r2');
    expect(result.current.isExpanded('probes.r1')).toBe(false);
    expect(result.current.isExpanded('probes.r2')).toBe(true);
  });

  it('toggling an already-expanded probe again collapses it', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1'));
    act(() => result.current.toggleExpand('probes.r1'));

    expect(useUIStore.getState().expandedProbeId).toBeNull();
  });
});

describe('useNavTree — toggleExpand accordion-of-one within Companies, independent of Probes (Task 3 AC2/AC3)', () => {
  beforeEach(resetStores);

  it('expanding a company sets expandedCompanyId, and never touches an expanded probe', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    useLocaleStore.getState().addCompany(localeId, makeCompany('c2', 'Beta Inc'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1'));
    act(() => result.current.toggleExpand('companies.c1'));

    expect(useUIStore.getState().expandedProbeId).toBe('r1');
    expect(useUIStore.getState().expandedCompanyId).toBe('c1');

    act(() => result.current.toggleExpand('companies.c2'));
    expect(useUIStore.getState().expandedCompanyId).toBe('c2');
    expect(useUIStore.getState().expandedProbeId).toBe('r1');
  });
});

describe('useNavTree — toggleExpand accordion-of-one within Fleet Params groups (Task 3 AC3)', () => {
  beforeEach(resetStores);

  it('expanding a Fleet Params group sets expandedFleetParamsGroup, clearing a different expanded group', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('fleetParams.eqFilters'));
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('eqFilters');

    act(() => result.current.toggleExpand('fleetParams.timeSpace'));
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('timeSpace');
  });

  it('is independent of expandedProbeId/expandedCompanyId — its own level, own accordion-of-one', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1'));
    act(() => result.current.toggleExpand('companies.c1'));
    act(() => result.current.toggleExpand('fleetParams.output'));

    expect(useUIStore.getState().expandedProbeId).toBe('r1');
    expect(useUIStore.getState().expandedCompanyId).toBe('c1');
    expect(useUIStore.getState().expandedFleetParamsGroup).toBe('output');
  });
});

describe('useNavTree — toggleExpand/isExpanded on the 4 top-level branches (bugfix: no case existed for a bare single-segment id, so every top-level +/- was a silent no-op and children never rendered)', () => {
  beforeEach(resetStores);

  it('toggling a top-level branch expands it', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('settings'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('settings');
    expect(result.current.isExpanded('settings')).toBe(true);
  });

  it('toggling a different top-level branch collapses the previous one — accordion-of-one', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('settings'));
    act(() => result.current.toggleExpand('probes'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('probes');
    expect(result.current.isExpanded('settings')).toBe(false);
    expect(result.current.isExpanded('probes')).toBe(true);
  });

  it('toggling an already-expanded top-level branch collapses it', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('fleetParams'));
    act(() => result.current.toggleExpand('fleetParams'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBeNull();
    expect(result.current.isExpanded('fleetParams')).toBe(false);
  });

  it('each of the 4 top-level branches can be independently expanded', () => {
    const { result } = renderHook(() => useNavTree());
    for (const id of ['settings', 'fleetParams', 'probes', 'companies']) {
      act(() => result.current.toggleExpand(id));
      expect(result.current.isExpanded(id), id).toBe(true);
      act(() => result.current.toggleExpand(id)); // collapse before the next one
    }
  });

  it('is independent of the per-branch expandedXxxId fields — expanding Probes itself never touches which probe is peeked open', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.toggleExpand('probes.r1'));
    act(() => result.current.toggleExpand('probes'));

    expect(useUIStore.getState().expandedProbeId).toBe('r1');
    expect(useUIStore.getState().expandedTopLevelBranch).toBe('probes');
  });
});
