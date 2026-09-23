import { create } from 'zustand';
import type { HubTile } from '@/types/hub';
import type { AudioRigEffectKey } from '@/data/audioRigConfig';

// ========================================
// TYPES
// ========================================

export type ActiveView = 'ocean' | 'robot' | 'composition' | 'fx' | 'settings';
export type Theme = 'dark' | 'light';
/** A leaf section within whatever entity is selected (a robot, a company, or
 *  the implicit "All Probes" bulk-edit target) — docs/specs/NAV_LAYOUT_REWRITE.md
 *  §1.3. null when a category/entity node itself is selected, no section chosen. */
export type RobotSection = 'volume' | 'melody' | 'envelope' | 'source';
/** Which of Fleet Params' 3 groups is peeked open — its own accordion-of-one
 *  level, independent of expandedProbeId/expandedCompanyId. */
export type FleetParamsGroup = 'eqFilters' | 'timeSpace' | 'output';
/** Which of Settings' 4 children is currently selected — added in Task 11
 *  (docs/tasks/NAV_LAYOUT_REWRITE.md), beyond the spec's original §1.3 field list. Settings
 *  isn't an "entity" the way a robot/company/All-Probes is (RobotSection's own doc comment),
 *  so it needs its own field rather than reusing selectedSection; ContentPane's Settings content
 *  component reads this to pick which of the 4 leaf contents (Volume/Quality/Tempo/Sector
 *  Settings) to render. */
export type SettingsLeaf = 'volume' | 'quality' | 'tempo' | 'sectorSettings';
/** Which Fleet Params effect leaf is currently selected — added in Task 14
 *  (docs/tasks/NAV_LAYOUT_REWRITE.md), same reasoning as SettingsLeaf: Fleet Params' 3 groups
 *  (EQ & Filters/Time & Space/Output) are category-only per spec §7 Q5, and the 7 real leaves
 *  underneath them (EQ/HPF/LPF/Reverb/Delay/Compression/Limiter) all map onto AUDIO_RIG_CONFIG's
 *  own AudioRigEffectKey — reused directly rather than a parallel string union. FleetParamsContent
 *  reads this to pick which effect's AudioRigEffectPanel to render. */
export type SelectedFleetParamsEffect = AudioRigEffectKey;
/** Which of the 4 top-level tree branches is peeked open — its own accordion-of-one level,
 *  independent of every per-branch expandedXxxId field below (those track which CHILD within an
 *  already-expanded branch is peeked open, not whether the branch itself is). Bugfix: this field
 *  was missing entirely through Tasks 1-18 — isExpanded/toggleExpand (useNavTree.ts) had no case
 *  for a bare single-segment node id ('settings', 'fleetParams', 'probes', 'companies'), so every
 *  top-level node's own +/- button was a silent no-op and its children could never render, found
 *  live by Crawford after Checkpoint 3. */
export type TopLevelBranch = 'settings' | 'fleetParams' | 'probes' | 'companies';

export interface UIStore {
  activeView: ActiveView;
  theme: Theme;
  language: string;
  isPoweredOn: boolean;
  isFullscreen: boolean;
  activeLocaleLocalTime: number | null;
  /** Live decorative temperature (°C) for the active locale — Header's row 2
   *  readout. Purely cosmetic, never read by any other system. Same shape/
   *  placement/no-persistence convention as activeLocaleLocalTime.
   *  docs/specs/HEADER_HUB_CONSOLIDATION.md §1.3. */
  activeLocaleTemperature: number | null;
  selectedRobotId: string | null;
  /** The company (Roadmap Phase 10) currently selected in the Robots tab's CompanyManager —
   *  null whenever allRobotsSelected is true (the default). Independent of selectedRobotId:
   *  selecting one never touches the other. Drives both the company-glow world-view highlight and
   *  which company's values the CompanyOptionsSection panel is bound to. Mutually exclusive with
   *  allRobotsSelected — selecting a company always clears it. */
  selectedCompanyId: string | null;
  /** The button row's "All" option, true by default — there is no separate "nothing selected"
   *  state (the old "None"/"Reset" option was removed 2026-09-18): the selection is always either
   *  All or one company. Shows every robot in the list and keeps bulk-edit armed for the whole
   *  roster, but deliberately does NOT glow every robot in the world view (Robot.tsx — that glow
   *  marks a specific company's members apart). Mutually exclusive with selectedCompanyId:
   *  selectAllRobots clears selectedCompanyId, and selectCompany clears this. Deliberately does
   *  NOT feed CompanyCrudControls — there is no Company object to bind Rename/Delete to for "All";
   *  those stay driven by selectedCompanyId alone. */
  allRobotsSelected: boolean;
  activeHubTile: HubTile | null;
  /** Nav & Layout Rewrite additive state (docs/specs/NAV_LAYOUT_REWRITE.md §1.3) —
   *  a handful of per-level fields, not a single opaque node-id scheme. */
  selectedSection: RobotSection | null;
  /** Mobile only; desktop/tablet ignore this and stay docked-open. */
  isNavPanelOpen: boolean;
  /** Accordion-of-one within the Probes branch — peek-without-navigating expansion. */
  expandedProbeId: string | null;
  /** Accordion-of-one within the Companies branch. */
  expandedCompanyId: string | null;
  /** Accordion-of-one within Fleet Params' 3 groups. */
  expandedFleetParamsGroup: FleetParamsGroup | null;
  /** Which of Settings' 4 children is selected — see SettingsLeaf's own doc comment. */
  selectedSettingsLeaf: SettingsLeaf | null;
  /** Which Fleet Params effect leaf is selected — see SelectedFleetParamsEffect's own doc comment. */
  selectedFleetParamsEffect: SelectedFleetParamsEffect | null;
  /** Which top-level branch is expanded — see TopLevelBranch's own doc comment. */
  expandedTopLevelBranch: TopLevelBranch | null;
  setActiveLocaleLocalTime: (t: number | null) => void;
  setActiveView: (v: ActiveView) => void;
  setTheme: (t: Theme) => void;
  setLanguage: (lang: string) => void;
  setFullscreen: (f: boolean) => void;
  setPowerOn: () => void;
  setPowerOff: () => void;
  selectRobot: (id: string | null) => void;
  selectCompany: (id: string) => void;
  selectAllRobots: () => void;
  setActiveHubTile: (tile: HubTile | null) => void;
  setActiveLocaleTemperature: (t: number | null) => void;
  setSelectedSection: (s: RobotSection | null) => void;
  setNavPanelOpen: (open: boolean) => void;
  setExpandedProbeId: (id: string | null) => void;
  setExpandedCompanyId: (id: string | null) => void;
  setExpandedFleetParamsGroup: (g: FleetParamsGroup | null) => void;
  setSelectedSettingsLeaf: (l: SettingsLeaf | null) => void;
  setSelectedFleetParamsEffect: (e: SelectedFleetParamsEffect | null) => void;
  setExpandedTopLevelBranch: (b: TopLevelBranch | null) => void;
}

// ========================================
// STORE
// ========================================

export const useUIStore = create<UIStore>((set) => ({
  activeView: 'ocean',
  theme: 'dark',
  language: 'en',
  isFullscreen: false,
  isPoweredOn: false,
  activeLocaleLocalTime: null,
  activeLocaleTemperature: null,
  selectedRobotId: null,
  selectedCompanyId: null,
  allRobotsSelected: true,
  activeHubTile: null,
  selectedSection: null,
  isNavPanelOpen: false,
  expandedProbeId: null,
  expandedCompanyId: null,
  expandedFleetParamsGroup: null,
  selectedSettingsLeaf: null,
  selectedFleetParamsEffect: null,
  expandedTopLevelBranch: null,

  setActiveView: (v) => set({ activeView: v }),
  setTheme: (t) => set({ theme: t }),
  setLanguage: (lang) => set({ language: lang }),
  setFullscreen: (f) => set({ isFullscreen: f }),
  setPowerOn: () => set({ isPoweredOn: true }),
  setPowerOff: () => set({ isPoweredOn: false }),
  setActiveLocaleLocalTime: (t) => set({ activeLocaleLocalTime: t }),
  selectRobot: (id) => set({ selectedRobotId: id }),
  selectCompany: (id) => set({ selectedCompanyId: id, allRobotsSelected: false }),
  selectAllRobots: () => set({ allRobotsSelected: true, selectedCompanyId: null }),
  setActiveHubTile: (tile) => set({ activeHubTile: tile }),
  setActiveLocaleTemperature: (t) => set({ activeLocaleTemperature: t }),
  setSelectedSection: (s) => set({ selectedSection: s }),
  setNavPanelOpen: (open) => set({ isNavPanelOpen: open }),
  setExpandedProbeId: (id) => set({ expandedProbeId: id }),
  setExpandedCompanyId: (id) => set({ expandedCompanyId: id }),
  setExpandedFleetParamsGroup: (g) => set({ expandedFleetParamsGroup: g }),
  setSelectedSettingsLeaf: (l) => set({ selectedSettingsLeaf: l }),
  setSelectedFleetParamsEffect: (e) => set({ selectedFleetParamsEffect: e }),
  setExpandedTopLevelBranch: (b) => set({ expandedTopLevelBranch: b }),
}));

// ========================================
// NOTES
// ========================================
// This store intentionally keeps only JSON-serializable primitives.
// Fullscreen intent is stored here; components should call the
// browser Fullscreen API in response to `isFullscreen` changes.
