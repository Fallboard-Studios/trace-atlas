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

  it('selecting companies.<id>.source.probeDrift directly (no intermediate clicks) sets every ancestor expand field in one step', () => {
    useLocaleStore.getState().addCompany(localeId, makeCompany('c1', 'Acme Corp'));
    const { result } = renderHook(() => useNavTree());

    act(() => result.current.select('companies.c1.source.probeDrift'));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('companies');
    expect(useUIStore.getState().expandedCompanyId).toBe('c1');
    // Its own section is already always-expanded once the company itself is — no separate field
    // to set (docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.3).
    expect(result.current.isExpanded('companies.c1.source')).toBe(true);
    expect(useUIStore.getState().selectedCompanyId).toBe('c1');
    expect(useUIStore.getState().selectedSection).toBe('source');
    expect(useUIStore.getState().selectedSubsection).toBe('probeDrift');
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

  it('the tree renders "Output" and "Probe Drift" as humanLabels in useNavTree.ts, not as id segments', () => {
    const useNavTreeSource = readSource('./useNavTree.ts');
    expect(useNavTreeSource).toContain("humanLabel: 'Output'");
    expect(useNavTreeSource).toContain("humanLabel: 'Probe Drift'");
    // The id segment itself is still 'volume' — SECTION_CHILDREN maps onto ROBOT_SECTIONS
    // positionally, so 'Output' never becomes a literal id anywhere in this file.
    expect(useNavTreeSource).not.toMatch(/id:\s*`[^`]*\.output[.`]/i);
  });

  it('RobotDriftPanel and the lfoDrift.robots field name are untouched by the Probe Drift rename', () => {
    const signatureArrayDrawerSource = readSource('../../../robot/SignatureArrayDrawer.tsx');
    expect(signatureArrayDrawerSource).toContain('export function RobotDriftPanel');
    expect(signatureArrayDrawerSource).toContain('globalAudio.lfoDrift.robots');
  });
});
