import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNavTree } from './useNavTree';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Robot } from '@/types/Robot';
import type { Company } from '@/types/Company';
import type { Locale } from '@/types/locale';

/**
 * Cross-branch regression coverage (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 14) — spans
 * more than one branch/section, which no single content task's own test suite (Tasks 7/8/11/13)
 * is positioned to catch on its own: the single-open-accordion invariant holding ACROSS branches,
 * ancestor auto-expand correctness for a single deep selection, and a rename-correctness guard —
 * matching NAV_LAYOUT_REWRITE.md Task 21's own precedent for identifier-cleanup verification.
 */
const localeId = getActiveLocaleId();

function makeRobot(id: string, name: string): Robot {
  return { id, name } as unknown as Robot;
}

function makeCompany(id: string, name: string): Company {
  return { id, name, color: '#fff', robotIds: [] };
}

function resetStores() {
  useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  useUIStore.setState(useUIStore.getInitialState(), true);
}

describe('Nav panel — cross-branch regression (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 14)', () => {
  beforeEach(resetStores);

  it('selecting a leaf in Probes, then a leaf in Fleet Params, leaves no stale selection from Probes behind', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('probes.r1.melody.rhythm'));
    expect(useUIStore.getState().selectedRobotId).toBe('r1');

    act(() => result.current.select('fleetParams.eqFilters.eq'));

    // Fleet Params' own selection is live...
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('eq3');
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');
    // ...and Probes' own selectedSection/selectedSubsection are deliberately cleared (not left
    // stale) by selecting into a branch that doesn't use them — this IS "no stale accordion-open
    // state leaking between branches," not a bug: selectedRobotId itself is untouched (Probes
    // still remembers which robot was open if the user navigates back to it), but the leaf-level
    // selection resets, matching Settings'/Fleet Params' own long-standing setSelectedSection(null).
    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().selectedSection).toBeNull();
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });

  it('selecting companies.<id>.source.coaxialOscillator directly (no intermediate clicks) sets every ancestor expand field in one step', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('companies.c1.source.coaxialOscillator'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('companies');
    expect(useUIStore.getState().expandedCompanyId).toBe('c1');
    // Its own section is already always-expanded once the company itself is — no separate field
    // to set (docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.3).
    expect(result.current.isExpanded('companies.c1.source')).toBe(true);
    expect(useUIStore.getState().selectedCompanyId).toBe('c1');
    expect(useUIStore.getState().selectedSection).toBe('source');
    expect(useUIStore.getState().selectedSubsection).toBe('coaxialOscillator');
  });

  it('selecting fleetParams.fleetDrift.drift directly (no intermediate clicks) sets every ancestor expand field in one step (docs/specs/FLEET_DRIFT_CONSOLIDATION.md Task 11)', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('fleetParams.fleetDrift.drift'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('fleetParams');
    // Its own group is already always-expanded once Fleet Params itself is — no separate field
    // to set (docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.3).
    expect(result.current.isExpanded('fleetParams.fleetDrift')).toBe(true);
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('globalDrift');
  });

  it('selecting fleetParams.fleetDrift.robots directly (no intermediate clicks) sets every ancestor expand field in one step (Robot Drift moved here from Probes/Companies entirely)', () => {
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('fleetParams.fleetDrift.robots'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('fleetParams');
    expect(result.current.isExpanded('fleetParams.fleetDrift')).toBe(true);
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');
    expect(useUIStore.getState().selectedFleetParamsEffect).toBe('robotDrift');
  });

  it('the single-open-accordion derivation is consistent across every branch: a null/mid-level selection always resolves to a real leaf, never "nothing"', () => {
    useLocaleStore.getState().addRobot(localeId, makeRobot('r1', 'Unit One'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('settings'));
    expect(useUIStore.getState().selectedSettingsLeaf).not.toBeNull();

    act(() => result.current.select('fleetParams'));
    expect(useUIStore.getState().selectedFleetParamsEffect).not.toBeNull();

    act(() => result.current.select('probes.r1'));
    // selectedSection is genuinely null here (RobotOptionsTab's own render-time fallback resolves
    // it to 'volume'/'audioSettings') — the derived-open invariant lives at the content-component
    // level for Probes/Companies, not the store, matching spec §1.5's "Probes/Companies:
    // selectedSubsection if set, else selectedSection itself acts as the open section."
    expect(useUIStore.getState().selectedSection).toBeNull();
    expect(useUIStore.getState().selectedSubsection).toBeNull();
  });
});

describe('Nav panel — rename-correctness guard (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 14, matching NAV_LAYOUT_REWRITE.md Task 21\'s own precedent)', () => {
  function readSource(relativePath: string): string {
    return readFileSync(resolve(__dirname, relativePath), 'utf-8');
  }

  it('RobotSection\'s own "volume" id segment is unchanged — the "Output" rename is a humanLabel only', () => {
    const uiStoreSource = readSource('../../../../stores/uiStore.ts');
    expect(uiStoreSource).toContain("'volume' | 'melody' | 'envelope' | 'source'");
  });

  it('"Output" survives only as the volume section\'s loreLabel in robotSubsectionConfig.ts, not as an id segment — its own navLabel later moved on to "Dynamics" (docs/reference/text-content-tables.md)', () => {
    // Moved here from useNavTree.ts by docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md — the
    // section/subsection label table (formerly useNavTree.ts's own SECTION_CHILDREN/
    // SUBSECTION_CHILDREN) now lives in robotSubsectionConfig.ts as ROBOT_SECTIONS_CONFIG,
    // consumed by useNavTree.ts's sectionChildNodes() rather than hand-typed there directly.
    const configSource = readSource('../../../../data/robotSubsectionConfig.ts');
    expect(configSource).toContain("content: 'probe.dynamics'");
    // The id segment itself is still 'volume' — ROBOT_SECTIONS_CONFIG's own id/content key
    // are separate fields, so 'Output' never becomes a literal id anywhere in this file.
    expect(configSource).not.toMatch(/id:\s*'[^']*output[.']/i);
  });

  it('RobotDriftPanel and the lfoDrift.robots field name are untouched by the Probe Drift rename', () => {
    const signatureArrayDrawerSource = readSource('../../../robot/SignatureArrayDrawer.tsx');
    expect(signatureArrayDrawerSource).toContain('export function RobotDriftPanel');
    expect(signatureArrayDrawerSource).toContain('globalAudio.lfoDrift.robots');
  });
});
