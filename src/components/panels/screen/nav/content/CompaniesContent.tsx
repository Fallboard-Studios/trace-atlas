import { CompanyCreateForm, CompanyRenameDeleteForm } from '@/components/company/CompanyCrudControls';
import { CompanyOptionsSection } from '@/components/company/CompanyOptionsSection';
import { useUIStore } from '@/stores/uiStore';

/**
 * Companies branch content (docs/specs/NAV_LAYOUT_REWRITE.md §2, Task 20) — routes on
 * uiStore.selectedCompanyId/selectedSection. No company selected (the bare "Companies" category
 * node) shows CompanyCreateForm; a selected company with no section shows CompanyRenameDeleteForm
 * (Rename/Delete + the read-only summary); a selected company WITH a section shows
 * CompanyOptionsSection narrowed to that section — reusing its existing
 * selectedCompanyId-driven broadcast binding unchanged (Task 19's own `section` prop).
 */
export function CompaniesContent() {
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const selectedSection = useUIStore((s) => s.selectedSection);

  if (!selectedCompanyId) {
    return <CompanyCreateForm />;
  }
  if (selectedSection) {
    return <CompanyOptionsSection section={selectedSection} />;
  }
  return <CompanyRenameDeleteForm />;
}

export default CompaniesContent;
