import { RobotOptionsTab } from '../../console/RobotOptionsTab';
import { RobotsTab } from '../../console/RobotsTab';
import { CompanyOptionsSection } from '@/components/company/CompanyOptionsSection';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { getTraitColorStyle } from '@/utils/traitColors';
import { useUIStore } from '@/stores/uiStore';

const ALL_PROBES_INTRO = {
  loreLabel: 'All Probes — broadcast to the entire fleet.',
  loreDescription: 'One instruction, transmitted to every probe on the mesh at once.',
  humanDescription: 'Changes you make here apply to every probe at once — a shortcut for tuning the whole fleet without editing each probe individually. Move a slider partway and every probe’s own value shifts by the same amount, keeping their individual differences intact.',
};

const PROBES_INTRO = {
  loreLabel: 'Probes — your fleet at a glance.',
  loreDescription: 'Every unit currently deployed on the mesh, ready for individual inspection.',
  humanDescription: 'This is the full list of your probes. Select one to view and edit its own settings, or use All Probes above to adjust every probe at once.',
};

/**
 * Probes branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, Task 13) — routes on
 * uiStore.selectedRobotId/allProbesSelected. A specific selected robot always wins (mirrors
 * RobotOptionsTab's own "selectedRobotId is the primary guard" fallback ordering); otherwise
 * allProbesSelected renders the "All Probes" bulk-edit target via CompanyOptionsSection's existing
 * allRobotsSelected-driven broadcast mode — CompanyOptionsSection now reads selectedSection/
 * selectedSubsection from uiStore directly (no more `section` prop), same as RobotOptionsTab's
 * own pattern. Falls back to RobotsTab (the browse list) — the bare "Probes" category node.
 *
 * The bare "Probes" node (RobotsTab) and "All Probes" (CompanyOptionsSection) each get their own
 * section-level IntroPanel + trait-colored wrapper (docs/reference/layout-updates.md), matching
 * their own nav-tree traits ('output'/'header'). A selected individual robot (RobotOptionsTab)
 * gets neither — Individual Probes has no intro block in the confirmed layout outline.
 */
export function ProbesContent() {
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const allProbesSelected = useUIStore((s) => s.allProbesSelected);

  if (selectedRobotId) {
    return <RobotOptionsTab />;
  }
  if (allProbesSelected) {
    return (
      <div className="probes-content" style={getTraitColorStyle('header')}>
        <IntroPanel
          loreLabel={ALL_PROBES_INTRO.loreLabel}
          loreDescription={ALL_PROBES_INTRO.loreDescription}
          humanDescription={ALL_PROBES_INTRO.humanDescription}
          trait="header"
        />
        <CompanyOptionsSection />
      </div>
    );
  }
  return (
    <div className="probes-content" style={getTraitColorStyle('output')}>
      <IntroPanel
        loreLabel={PROBES_INTRO.loreLabel}
        loreDescription={PROBES_INTRO.loreDescription}
        humanDescription={PROBES_INTRO.humanDescription}
        trait="output"
      />
      <RobotsTab />
    </div>
  );
}

export default ProbesContent;
