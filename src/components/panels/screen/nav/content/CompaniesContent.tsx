import { CompanyCreateForm, CompanyRenameDeleteForm } from '@/components/company/CompanyCrudControls';
import { CompanyOptionsSection } from '@/components/company/CompanyOptionsSection';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { buildCompanySelectionSchema } from '@/data/companyConfig';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getTraitColorStyle } from '@/utils/traitColors';

const COMPANIES_INTRO = {
  loreLabel: 'Companies — organize your fleet into working groups.',
  loreDescription: 'Meridia recommends grouping probes by company for cleaner reporting and coordinated tasking.',
  humanDescription: 'A company is a named group of probes you create. Give every probe in a company the same settings at once, the same way All Probes does for your whole fleet — just scoped to one group. Create a company below, or select an existing one to edit it.',
};

const INDIVIDUAL_COMPANY_INTRO = {
  loreLabel: 'Company Profile — manage this working group.',
  loreDescription: 'Review this company’s roster and standing orders, or reassign it entirely.',
  humanDescription: 'Rename or delete this company, then adjust the settings below — they apply to every probe currently assigned to it, the same way All Probes applies to your whole fleet.',
};

/**
 * Companies branch content (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, Task 13;
 * docs/reference/layout-updates.md) — routes on uiStore.selectedCompanyId. No company selected
 * (the bare "Companies" category node) shows an IntroPanel, CompanyCreateForm, and a new "Company
 * Selection" radio (buildCompanySelectionSchema — no card-grid/slide-out company picker exists
 * anywhere in the app to reuse, per Crawford's own check; this is the same RadioButton primitive
 * every other selection list in this app already uses, listing real companies only, no Freelance
 * option) that calls selectCompany directly — the same store action a nav-tree click on a company
 * node already calls, so picking an option here and clicking that node in the tree do the same
 * thing. A selected company shows its own "Individual Company" IntroPanel, then
 * CompanyRenameDeleteForm (Rename/Delete + the read-only summary) followed by
 * CompanyOptionsSection's own stacked-view/accordion sections underneath, always together (the old
 * either/or split is retired) — CompanyOptionsSection reads selectedSection/selectedSubsection
 * from uiStore directly, matching RobotOptionsTab's own pattern.
 */
export function CompaniesContent() {
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const selectCompany = useUIStore((s) => s.selectCompany);
  const localeId = getActiveLocaleId();
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);

  if (!selectedCompanyId) {
    return (
      <div className="companies-content" style={getTraitColorStyle('company')}>
        <IntroPanel
          loreLabel={COMPANIES_INTRO.loreLabel}
          loreDescription={COMPANIES_INTRO.loreDescription}
          humanDescription={COMPANIES_INTRO.humanDescription}
          trait="company"
        />
        <CompanyCreateForm />
        {companies.length > 0 && (
          <RadioButton
            schema={buildCompanySelectionSchema(companies)}
            value=""
            onChange={selectCompany}
          />
        )}
      </div>
    );
  }
  return (
    <div className="companies-content" style={getTraitColorStyle('company')}>
      <IntroPanel
        loreLabel={INDIVIDUAL_COMPANY_INTRO.loreLabel}
        loreDescription={INDIVIDUAL_COMPANY_INTRO.loreDescription}
        humanDescription={INDIVIDUAL_COMPANY_INTRO.humanDescription}
        trait="company"
      />
      <CompanyRenameDeleteForm />
      <CompanyOptionsSection />
    </div>
  );
}

export default CompaniesContent;
