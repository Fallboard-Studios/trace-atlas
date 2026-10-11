import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/LAYOUT_REWORK.md Task 31. A docs task has no behaviour to test, so this makes its two
// acceptance criteria executable: (1) the six docs the layout rework changed no longer describe the nav
// tree, the accordion stack, the Probes card list or the Companies index as current, and (2) every code
// symbol those docs now lean on exists in the source file it is attributed to. The deleted names are
// assembled from fragments so a repo-wide grep for them under src/ (the deletion gates of Tasks 9, 18 and
// 21) still returns nothing from this file.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

const REWORK_DOCS = [
  'docs/UI_SHELL.md',
  'docs/COMPONENT_LIBRARY.md',
  'docs/COMPANIES.md',
  'docs/SESSION_STORAGE.md',
  'docs/ANIMATION_SYSTEM.md',
  'docs/CONTENT_LAYER.md',
];

describe('the rework docs carry no stale description of what the layout rework deleted', () => {
  // Files and fields that are gone. History lives in the spec and plan; a live doc names none of them.
  const deletedNames = [
    ['use', 'NavTree'],
    ['Nav', 'TreeNode'],
    ['Nav', 'ToggleButton'],
    ['Nav', 'CabinetRow'],
    ['nav', 'TreeConfig'],
    ['accordion', 'Sync'],
    ['section', 'Refs'],
    ['useAccordion', 'OpenState'],
    ['useSection', 'Observer'],
    ['RobotSection', 'AccordionStack'],
    ['Robot', 'OptionsTab'],
    ['Company', 'Manager'],
    ['Company', 'ButtonRow'],
    ['Robot', 'SelectionCard'],
    ['Robots', 'Tab'],
    ['RobotFilter', 'Panel'],
    ['NavStatus', 'Block'],
    ['useNavPanel', 'SlideAway'],
    ['expanded', 'ProbeId'],
    ['expanded', 'CompanyId'],
    ['expandedFleetParams', 'Group'],
    ['expandedProbe', 'Section'],
    ['expandedCompany', 'Section'],
    ['selectedFleetParams', 'Effect'],
    ['header-cabinet-nav', '-clearance'],
    ['Settings', 'Content'],
  ].map((parts) => parts.join(''));

  it.each(REWORK_DOCS)('%s names no deleted symbol', (doc) => {
    const text = read(doc);
    for (const name of deletedNames) expect(text, `${doc} mentions ${name}`).not.toContain(name);
  });

  it.each(REWORK_DOCS)('%s does not describe the tree, the stacked scroll or the card list as current', (doc) => {
    const text = read(doc);
    expect(text, doc).not.toMatch(/role="tree"/);
    expect(text, doc).not.toMatch(/accordion-of-one/i);
    expect(text, doc).not.toMatch(/scrollspy/i);
    expect(text, doc).not.toMatch(/click-to-scroll/i);
    expect(text, doc).not.toMatch(/one continuous scrollable view/i);
    expect(text, doc).not.toMatch(/off-canvas slide-over/i);
  });
});

/** Every code symbol a doc now names, and the source file it must really live in. */
const REWORK_CLAIMS: Array<{ doc: string; symbols: Array<[symbol: string, file: string]> }> = [
  {
    doc: 'docs/UI_SHELL.md',
    symbols: [
      ['useShell', 'src/components/panels/screen/useShell.ts'],
      ['NAV_PANEL_DOCK_MIN_WIDTH', 'src/components/panels/screen/useShell.ts'],
      ['SHELL_MIN_WIDTH', 'src/components/panels/screen/useShell.ts'],
      ['data-shell', 'src/components/panels/physical/ScreenViewport.tsx'],
      ['NavPanel', 'src/components/panels/screen/nav/NavPanel.tsx'],
      ['NavBox', 'src/components/panels/screen/nav/NavBox.tsx'],
      ['NavEntityList', 'src/components/panels/screen/nav/NavEntityList.tsx'],
      ['NavBreadcrumb', 'src/components/panels/screen/nav/NavBreadcrumb.tsx'],
      ['useEntityRoster', 'src/components/panels/screen/nav/useEntityRoster.ts'],
      ['selectBranch', 'src/components/panels/screen/nav/navActions.ts'],
      ['selectEntity', 'src/components/panels/screen/nav/navActions.ts'],
      ['pressBranchBox', 'src/components/panels/screen/nav/navActions.ts'],
      ['goHome', 'src/components/panels/screen/nav/navActions.ts'],
      ['breadcrumbTrail', 'src/components/panels/screen/nav/navActions.ts'],
      ['FLEET_PARAMS_SUBSECTIONS', 'src/components/panels/screen/nav/navActions.ts'],
      ['SETTINGS_LEAVES', 'src/components/panels/screen/nav/navActions.ts'],
      ['PhoneBar', 'src/components/panels/screen/PhoneBar.tsx'],
      ['Header', 'src/components/panels/screen/Header.tsx'],
      ['ContentPane', 'src/components/panels/screen/console/ContentPane.tsx'],
      ['ConsolePanel', 'src/components/panels/screen/console/ConsolePanel.tsx'],
      ['MetaBox', 'src/components/panels/screen/worldView/MetaBox.tsx'],
      ['WorldLine', 'src/components/panels/screen/worldView/MetaBox.tsx'],
      ['data-dimmed', 'src/components/panels/screen/worldView/WorldView.tsx'],
      ['--content-surface', 'src/index.css'],
      ['--nav-panel-width', 'src/components/panels/screen/nav/NavPanel.css'],
      ['RosterBoard', 'src/components/panels/screen/screens/RosterBoard.tsx'],
      ['RosterTile', 'src/components/panels/screen/screens/RosterTile.tsx'],
      ['RobotScreen', 'src/components/panels/screen/screens/RobotScreen.tsx'],
      ['CompanyScreen', 'src/components/panels/screen/screens/CompanyScreen.tsx'],
      ['FleetParamsScreen', 'src/components/panels/screen/screens/FleetParamsScreen.tsx'],
      ['SettingsScreen', 'src/components/panels/screen/screens/SettingsScreen.tsx'],
      ['OffScreen', 'src/components/panels/screen/screens/OffScreen.tsx'],
      ['isNavPanelOpen', 'src/stores/uiStore.ts'],
      ['expandedTopLevelBranch', 'src/stores/uiStore.ts'],
      ['allProbesSelected', 'src/stores/uiStore.ts'],
      ['selectedSettingsLeaf', 'src/stores/uiStore.ts'],
      ['fleetParamsSection', 'src/stores/uiStore.ts'],
      ['fleetParamsSubsection', 'src/stores/uiStore.ts'],
      ['movePanelRobotId', 'src/stores/uiStore.ts'],
      ['selectedSection', 'src/stores/uiStore.ts'],
      ['selectedSubsection', 'src/stores/uiStore.ts'],
    ],
  },
  {
    doc: 'docs/COMPONENT_LIBRARY.md',
    symbols: [
      ['SectionTabs', 'src/components/ui/controls/SectionTabs.tsx'],
      ['HelpPopover', 'src/components/ui/controls/HelpPopover.tsx'],
      ['appearance', 'src/types/controls.ts'],
      ['dividerBefore', 'src/types/controls.ts'],
      ['help', 'src/types/controls.ts'],
      ['ContentHelp', 'src/content/types.ts'],
      ['LFO_LINK_DEPTH_BOXES', 'src/components/ui/controls/LfoLink.tsx'],
      ['laneTitle', 'src/data/lfoConfig.ts'],
      ['DualLabel', 'src/components/ui/controls/DualLabel.tsx'],
    ],
  },
  {
    doc: 'docs/COMPANIES.md',
    symbols: [
      ['useCompanyOptions', 'src/components/company/useCompanyOptions.ts'],
      ['ALL_TARGET', 'src/components/company/useCompanyOptions.ts'],
      ['useCompanySubsectionRenderer', 'src/components/company/CompanyOptionsSection.tsx'],
      ['CompanyCreateForm', 'src/components/company/CompanyCrudControls.tsx'],
      ['CompanyRenameDeleteForm', 'src/components/company/CompanyCrudControls.tsx'],
      ['CompanyScreen', 'src/components/panels/screen/screens/CompanyScreen.tsx'],
      ['RosterBoard', 'src/components/panels/screen/screens/RosterBoard.tsx'],
      ['RosterTile', 'src/components/panels/screen/screens/RosterTile.tsx'],
      ['useRosterGlide', 'src/components/panels/screen/screens/RosterBoard.tsx'],
      ['rosterRows', 'src/utils/rosterRows.ts'],
      ['movePanelRobotId', 'src/stores/uiStore.ts'],
      ['assignRobotToCompany', 'src/stores/localeStore.ts'],
      ['FREELANCE_VALUE', 'src/data/companyConfig.ts'],
      ['RobotScreen', 'src/components/panels/screen/screens/RobotScreen.tsx'],
    ],
  },
  {
    doc: 'docs/SESSION_STORAGE.md',
    symbols: [
      ['TRANSMISSION_PRESETS', 'src/data/transmissionPresets.ts'],
      ['OffScreen', 'src/components/panels/screen/screens/OffScreen.tsx'],
      ['SETTINGS_LEAVES', 'src/components/panels/screen/nav/navActions.ts'],
      ['applySessionPayload', 'src/utils/sessionDiff.ts'],
      ['listSessions', 'src/utils/sessionStorageEngine.ts'],
      ['loadSession', 'src/utils/sessionStorageEngine.ts'],
      ['startLocaleSystems', 'src/systems/worldTransition.ts'],
      ['initializeLocale', 'src/systems/worldTransition.ts'],
      ['powerOnSequence', 'src/systems/powerController.ts'],
    ],
  },
  {
    doc: 'docs/ANIMATION_SYSTEM.md',
    symbols: [
      ['nav-panel-width', 'src/components/panels/screen/nav/NavPanel.tsx'],
      ['--nav-panel-expand', 'src/components/panels/screen/nav/NavPanel.tsx'],
      ['roster-move-', 'src/components/panels/screen/screens/RosterBoard.tsx'],
      ['ROSTER_GLIDE_DURATION', 'src/components/panels/screen/screens/RosterBoard.tsx'],
      ['gsap/dist/Flip', 'src/components/panels/screen/screens/RosterBoard.tsx'],
      ['section-tab-', 'src/components/ui/controls/SectionTabs.tsx'],
      ['useHaloMotion', 'src/components/robot/gem/useHaloMotion.ts'],
    ],
  },
  {
    doc: 'docs/CONTENT_LAYER.md',
    symbols: [
      ['ContentHelp', 'src/content/types.ts'],
      ['laneTitle', 'src/data/lfoConfig.ts'],
      ['short', 'src/content/types.ts'],
      ['help', 'src/content/types.ts'],
      ['HelpPopover', 'src/components/ui/controls/HelpPopover.tsx'],
    ],
  },
];

describe('the layout-rework docs name real code', () => {
  for (const { doc, symbols } of REWORK_CLAIMS) {
    describe(doc, () => {
      it.each(symbols)('names %s, which exists in %s', (symbol, file) => {
        expect(existsSync(resolve(repoRoot, file)), `${file} exists`).toBe(true);
        expect(read(doc), `${doc} names ${symbol}`).toContain(symbol);
        // The symbol really is in the source file it is credited to. Word boundaries do not apply
        // around a hyphen or a slash, so those are matched literally.
        const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const boundary = /^\w/.test(symbol) && /\w$/.test(symbol) ? `\\b${escaped}\\b` : escaped;
        expect(read(file), `${file} defines ${symbol}`).toMatch(new RegExp(boundary));
      });
    });
  }
});

describe('the docs say where the moved things live now', () => {
  it('COMPANIES.md puts reassignment on the roster tile and the robot screen, and the bulk edit on the company screen', () => {
    const text = read('docs/COMPANIES.md');
    expect(text).toMatch(/Move chip/);
    expect(text).toMatch(/Freelance/);
    expect(text).toMatch(/broadcast, not link/i);
  });

  it('UI_SHELL.md describes both shells and the guardrail', () => {
    const text = read('docs/UI_SHELL.md');
    expect(text).toMatch(/desk/);
    expect(text).toMatch(/phone/);
    expect(text).toMatch(/never in `SleeveContainer`|never in the decorative `SleeveContainer`|not in `SleeveContainer`/);
  });

  it('SESSION_STORAGE.md says a preset is a SessionPayload constant that retransmits silently', () => {
    const text = read('docs/SESSION_STORAGE.md');
    expect(text).toMatch(/SessionPayload/);
    expect(text).toMatch(/preset/i);
    expect(text).toMatch(/never (touches|starts)[^.]*(AudioEngine|sound|audio)/i);
  });
});
