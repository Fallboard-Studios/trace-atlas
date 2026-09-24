import { CompanyCreateForm, CompanyRenameDeleteForm } from '@/components/company/CompanyCrudControls';
import { CompanyOptionsSection } from '@/components/company/CompanyOptionsSection';
import { useUIStore } from '@/stores/uiStore';

/**
 * Companies branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, Task 13) — routes on
 * uiStore.selectedCompanyId. No company selected (the bare "Companies" category node) shows
 * CompanyCreateForm; a selected company shows CompanyRenameDeleteForm (Rename/Delete + the
 * read-only summary — "the update and delete sections," unwrapped, never itself accordion-wrapped)
 * followed by CompanyOptionsSection's own stacked-view/accordion sections underneath, always
 * together now — the old either/or split (Rename/Delete form OR one narrowed section) is retired
 * along with CompanyOptionsSection's own `section` prop: it reads selectedSection/
 * selectedSubsection from uiStore directly now, matching RobotOptionsTab's own pattern.
 */
export function CompaniesContent() {
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);

  if (!selectedCompanyId) {
    return <CompanyCreateForm />;
  }
  return (
    <>
      <CompanyRenameDeleteForm />
      <CompanyOptionsSection />
    </>
  );
}

export default CompaniesContent;
