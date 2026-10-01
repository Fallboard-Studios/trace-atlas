import { RobotOptionsTab } from '../../console/RobotOptionsTab';
import { RobotsTab } from '../../console/RobotsTab';
import { CompanyOptionsSection } from '@/components/company/CompanyOptionsSection';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { getTraitColorStyle } from '@/utils/traitColors';
import { useUIStore } from '@/stores/uiStore';
import { introProps } from '@/content';

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
          {...introProps('probe.all')}
          trait="header"
        />
        <CompanyOptionsSection />
      </div>
    );
  }
  return (
    <div className="probes-content" style={getTraitColorStyle('output')}>
      <IntroPanel
        {...introProps('probe.root')}
        trait="output"
      />
      <RobotsTab />
    </div>
  );
}

export default ProbesContent;
