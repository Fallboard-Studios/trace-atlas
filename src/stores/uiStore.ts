import { create } from 'zustand';
import type { HubTile } from '@/types/hub';
import type { AudioRigEffectKey } from '@/data/audioRigConfig';

// ========================================
// TYPES
// ========================================

/** A leaf section within whatever entity is selected (a robot, a company, or
 *  the implicit "All Probes" bulk-edit target) — docs/specs/archive/NAV_LAYOUT_REWRITE.md
 *  §1.3. null when a category/entity node itself is selected, no section chosen. */
export type RobotSection = 'volume' | 'melody' | 'envelope' | 'source';
/** Fleet Params' 6 mid-level groups (`lfoBank` added by docs/tasks/LFO_BANK.md Task 15,
 *  positioned right after `pacing`, replacing the former `fleetDrift` group entirely — not a
 *  rename, a different control; `colour` added by docs/tasks/GLOBAL_COLOUR.md Task 9, between
 *  `timeSpace` and `output`, the chain order; `modulation` added by docs/tasks/GLOBAL_MODULATION_COLOUR.md
 *  Task 10, between `colour` and `output`) — used to type-narrow a tree node id segment
 *  (useNavTree.ts's `asFleetParamsGroup`), not to back any expand-tracking store field: all 7 are
 *  always expanded once Fleet Params itself is expanded
 *  (docs/specs/archive/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.3) — there is no independent per-group
 *  toggle state anymore. */
export type FleetParamsGroup = 'pacing' | 'lfoBank' | 'eqFilters' | 'timeSpace' | 'colour' | 'modulation' | 'output';
/** Settings' three tabs — Audio Quality, Seeds, Save & Share (docs/specs/LAYOUT_REWORK.md §1.8).
 *  Settings isn't an "entity" the way a robot/company/All-Probes is (RobotSection's own doc
 *  comment), so it needs its own field rather than reusing selectedSection; SettingsScreen reads it
 *  as its open tab (navActions' SETTINGS_LEAVES is the order). Volume was removed (Header carries
 *  the volume slider) and Tempo moved to Fleet Params -> Pacing. `sessions` added by Session
 *  Storage's Task 10 (docs/tasks/SESSION_STORAGE.md, Roadmap Phase 20). The tree's third level
 *  under a leaf (Voice Limit, Location…) retired with the stacked screen (LAYOUT_REWORK.md Task 17). */
export type SettingsLeaf = 'quality' | 'sectorSettings' | 'sessions';
/** A Fleet Params sub-tab — fleetParamsSubsection's type (docs/specs/LAYOUT_REWORK.md §1.10). Added in
 *  Task 14 (docs/tasks/archive/NAV_LAYOUT_REWRITE.md) for the tree's effect leaf, a field that retired with the
 *  stacked scroll (LAYOUT_REWORK.md Task 18); same reasoning as SettingsLeaf: Fleet Params' 5 groups
 *  (Pacing/LFO Bank/EQ & Filters/Time & Space/Output) are category-only per spec §7 Q5, and the
 *  7 real effect leaves underneath EQ & Filters/Time & Space/Output (EQ/HPF/LPF/Reverb/Delay/
 *  Compression/Limiter) all map onto AUDIO_RIG_CONFIG's own AudioRigEffectKey — reused directly
 *  rather than a parallel string union. 'tempo'/'automaticEffects' are Pacing's own 2 children;
 *  'laneA'-'laneD' are LFO Bank's own 4 children, one per world lane (docs/tasks/LFO_BANK.md
 *  Task 15 — replaces the former 'globalDrift'/'robotDrift' pair entirely). Unlike the other
 *  groups' leaves, none of these are a real AudioRigEffectPanel/AudioRigEffectKey, so each
 *  needs its own synthetic member here. */
export type SelectedFleetParamsEffect = AudioRigEffectKey | 'tempo' | 'automaticEffects' | 'swellFrequency' | 'swellDuration' | 'laneA' | 'laneB' | 'laneC' | 'laneD';
/** The 4th tree level under a robot's/company's RobotSection — docs/specs/archive/NAV_PANEL_VIEWS_AND_CONTENT.md
 *  §1.3/§1.4. Flat union rather than nested per-section, because a subsection is always read
 *  alongside its already-known parent RobotSection — no ambiguity from flattening (no subsection
 *  name collides across sections). Shared by Probes and Companies, same as RobotSection itself. */
export type RobotSubsection =
  | 'audioSettings'
  | 'rhythm'
  | 'frequency'
  | 'pingContour'
  | 'baselineOscillator'
  | 'coaxialOscillator'
  | 'harmonicOscillator'
  | 'busFilter';
/** Which of the 4 top-level branches is open in the nav panel (its entity list, for Probes and
 *  Companies). The tree's per-branch fields, which tracked which probe or company was peeked
 *  open, retired with the stacked scroll (docs/tasks/LAYOUT_REWORK.md Task 18). Bugfix: this
 *  field was missing entirely through Tasks 1-18 — isExpanded/toggleExpand (useNavTree.ts) had no case
 *  for a bare single-segment node id ('settings', 'fleetParams', 'probes', 'companies'), so every
 *  top-level node's own +/- button was a silent no-op and its children could never render, found
 *  live by Crawford after Checkpoint 3. */
export type TopLevelBranch = 'settings' | 'fleetParams' | 'probes' | 'companies';
/** True when the nav tree's "All Probes" leaf is selected — the bulk-edit target covering
 *  every robot in the locale, distinct from bare "Probes" (the browse list), which also has
 *  selectedRobotId === null. Added in Task 19 (docs/tasks/archive/NAV_LAYOUT_REWRITE.md): without this
 *  flag, "Probes" and "All Probes" are indistinguishable from state alone. Unrelated to
 *  allRobotsSelected, which drives the pre-existing RobotsTab company filter, not nav content
 *  routing — selecting "All Probes" in the tree does not imply that filter is set, and vice versa. */

export interface UIStore {
  isPoweredOn: boolean;
  activeLocaleLocalTime: number | null;
  /** Live decorative temperature (°C) for the active locale — Header's row 2
   *  readout. Purely cosmetic, never read by any other system. Same shape/
   *  placement/no-persistence convention as activeLocaleLocalTime.
   *  docs/specs/archive/HEADER_HUB_CONSOLIDATION.md §1.3. */
  activeLocaleTemperature: number | null;
  selectedRobotId: string | null;
  /** The company (Roadmap Phase 10) currently selected from the nav panel's company list —
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
  /** Nav & Layout Rewrite additive state (docs/specs/archive/NAV_LAYOUT_REWRITE.md §1.3) —
   *  a handful of per-level fields, not a single opaque node-id scheme. */
  selectedSection: RobotSection | null;
  /** The open great-grandchild, when one is selected — null when only a RobotSection (or
   *  nothing) is selected. Shared by Probes and Companies, same reasoning as selectedSection.
   *  docs/specs/archive/NAV_PANEL_VIEWS_AND_CONTENT.md §1.3. */
  selectedSubsection: RobotSubsection | null;
  /** Mobile only; desktop/tablet ignore this and stay docked-open. */
  isNavPanelOpen: boolean;
  /** The Settings screen's open tab — see SettingsLeaf's own doc comment. null reads as the first,
   *  Audio Quality (navActions' activeSettingsLeaf), which is what every nav pick stores. */
  selectedSettingsLeaf: SettingsLeaf | null;
  /** The Fleet Params screen's open section tab (docs/specs/LAYOUT_REWORK.md §1.10). Always one: the
   *  screen is tabs, so there is no "no section" state. */
  fleetParamsSection: FleetParamsGroup;
  /** The open sub-tab inside that section — null reads as the section's first (navActions'
   *  activeFleetParamsSubsection). Pacing has no sub-tabs. */
  fleetParamsSubsection: SelectedFleetParamsEffect | null;
  /** Which top-level branch is expanded — see TopLevelBranch's own doc comment. */
  expandedTopLevelBranch: TopLevelBranch | null;
  /** Whether the "All Probes" bulk-edit leaf is selected — see its own doc comment above. */
  allProbesSelected: boolean;
  /** Which roster tile's Move popover (desk) / sheet (phone) is open — null when none. One at a time:
   *  opening another tile's replaces it (docs/specs/LAYOUT_REWORK.md §1.5, §1.10). */
  movePanelRobotId: string | null;
  setActiveLocaleLocalTime: (t: number | null) => void;
  setPowerOn: () => void;
  setPowerOff: () => void;
  /** Also resets selectedSection to null — see its own implementation comment. */
  selectRobot: (id: string | null) => void;
  selectCompany: (id: string) => void;
  selectAllRobots: () => void;
  setActiveHubTile: (tile: HubTile | null) => void;
  setActiveLocaleTemperature: (t: number | null) => void;
  setSelectedSection: (s: RobotSection | null) => void;
  setSelectedSubsection: (s: RobotSubsection | null) => void;
  setNavPanelOpen: (open: boolean) => void;
  setSelectedSettingsLeaf: (l: SettingsLeaf | null) => void;
  /** Also resets fleetParamsSubsection to null: a sub-tab belongs to its section. */
  setFleetParamsSection: (s: FleetParamsGroup) => void;
  setFleetParamsSubsection: (s: SelectedFleetParamsEffect | null) => void;
  setExpandedTopLevelBranch: (b: TopLevelBranch | null) => void;
  setAllProbesSelected: (v: boolean) => void;
  openMovePanel: (robotId: string) => void;
  closeMovePanel: () => void;
}

/** The Fleet Params tab the screen opens on, and every nav pick returns to (docs/tasks/LAYOUT_REWORK.md
 *  Task 15: the sketch's approved frame opens on LFO Bank). */
export const DEFAULT_FLEET_PARAMS_SECTION: FleetParamsGroup = 'lfoBank';

// ========================================
// STORE
// ========================================

export const useUIStore = create<UIStore>((set) => ({
  isPoweredOn: false,
  activeLocaleLocalTime: null,
  activeLocaleTemperature: null,
  selectedRobotId: null,
  selectedCompanyId: null,
  allRobotsSelected: true,
  activeHubTile: null,
  selectedSection: null,
  selectedSubsection: null,
  isNavPanelOpen: false,
  selectedSettingsLeaf: null,
  fleetParamsSection: DEFAULT_FLEET_PARAMS_SECTION,
  fleetParamsSubsection: null,
  expandedTopLevelBranch: null,
  allProbesSelected: false,
  movePanelRobotId: null,

  setPowerOn: () => set({ isPoweredOn: true }),
  setPowerOff: () => set({ isPoweredOn: false }),
  setActiveLocaleLocalTime: (t) => set({ activeLocaleLocalTime: t }),
  // Bugfix, found in code review — resets selectedSection whenever which robot is selected
  // changes (including to null, the Back-button/browse-list case), closing a gap the 2 non-tree
  // call sites (RobotSelectionCard's card click, ConsolePanel's Back button) both had: neither
  // followed selectRobot with its own setSelectedSection(null) the way useNavTree.select() always
  // does for tree-driven selection, so a section left open on a previously-viewed robot leaked
  // onto the next one picked from the browse list. useNavTree.select() itself calls
  // setSelectedSection right after selectRobot, which still wins (last write) — tree-driven
  // selection is unaffected by this reset.
  selectRobot: (id) => set({ selectedRobotId: id, selectedSection: null, selectedSubsection: null }),
  selectCompany: (id) => set({ selectedCompanyId: id, allRobotsSelected: false }),
  selectAllRobots: () => set({ allRobotsSelected: true, selectedCompanyId: null }),
  setActiveHubTile: (tile) => set({ activeHubTile: tile }),
  setActiveLocaleTemperature: (t) => set({ activeLocaleTemperature: t }),
  setSelectedSection: (s) => set({ selectedSection: s }),
  setSelectedSubsection: (s) => set({ selectedSubsection: s }),
  setNavPanelOpen: (open) => set({ isNavPanelOpen: open }),
  setSelectedSettingsLeaf: (l) => set({ selectedSettingsLeaf: l }),
  setFleetParamsSection: (s) => set({ fleetParamsSection: s, fleetParamsSubsection: null }),
  setFleetParamsSubsection: (s) => set({ fleetParamsSubsection: s }),
  setExpandedTopLevelBranch: (b) => set({ expandedTopLevelBranch: b }),
  setAllProbesSelected: (v) => set({ allProbesSelected: v }),
  openMovePanel: (robotId) => set({ movePanelRobotId: robotId }),
  closeMovePanel: () => set({ movePanelRobotId: null }),
}));

// ========================================
// NOTES
// ========================================
// This store intentionally keeps only JSON-serializable primitives.
