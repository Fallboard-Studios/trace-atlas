import { RobotOptionsTab } from '../../console/RobotOptionsTab';
import { RobotsTab } from '../../console/RobotsTab';
import { CompanyOptionsSection } from '@/components/company/CompanyOptionsSection';
import { useUIStore } from '@/stores/uiStore';

/**
 * Probes branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, Task 13) — routes on
 * uiStore.selectedRobotId/allProbesSelected. A specific selected robot always wins (mirrors
 * RobotOptionsTab's own "selectedRobotId is the primary guard" fallback ordering); otherwise
 * allProbesSelected renders the "All Probes" bulk-edit target via CompanyOptionsSection's existing
 * allRobotsSelected-driven broadcast mode — CompanyOptionsSection now reads selectedSection/
 * selectedSubsection from uiStore directly (no more `section` prop), same as RobotOptionsTab's
 * own pattern. Falls back to RobotsTab (the browse list) — the bare "Probes" category node.
 */
export function ProbesContent() {
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const allProbesSelected = useUIStore((s) => s.allProbesSelected);

  if (selectedRobotId) {
    return <RobotOptionsTab />;
  }
  if (allProbesSelected) {
    return <CompanyOptionsSection />;
  }
  return <RobotsTab />;
}

export default ProbesContent;
