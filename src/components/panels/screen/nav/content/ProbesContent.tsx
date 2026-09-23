import { RobotOptionsTab } from '../../console/RobotOptionsTab';
import { RobotsTab } from '../../console/RobotsTab';
import { CompanyOptionsSection } from '@/components/company/CompanyOptionsSection';
import { useUIStore } from '@/stores/uiStore';

/**
 * Probes branch content (docs/specs/NAV_LAYOUT_REWRITE.md §2, Task 19) — routes on
 * uiStore.selectedRobotId/allProbesSelected. A specific selected robot always wins (mirrors
 * RobotOptionsTab's own "selectedRobotId is the primary guard" fallback ordering); otherwise
 * allProbesSelected renders the "All Probes" bulk-edit target via CompanyOptionsSection's
 * existing allRobotsSelected-driven broadcast mode, narrowed to whichever section leaf (if any)
 * is selected. Falls back to RobotsTab (the browse list) — the bare "Probes" category node.
 */
export function ProbesContent() {
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const allProbesSelected = useUIStore((s) => s.allProbesSelected);
  const selectedSection = useUIStore((s) => s.selectedSection);

  if (selectedRobotId) {
    return <RobotOptionsTab />;
  }
  if (allProbesSelected) {
    return <CompanyOptionsSection section={selectedSection} />;
  }
  return <RobotsTab />;
}

export default ProbesContent;
