import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompaniesContent } from './CompaniesContent';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Locale } from '@/types/locale';

// CompanyCreateForm/CompanyRenameDeleteForm/CompanyOptionsSection each have their own full test
// suite — this file is about CompaniesContent's own routing between them, not re-testing their
// content.
vi.mock('@/components/company/CompanyCrudControls', () => ({
  CompanyCreateForm: () => <div data-testid="company-create-form-stub" />,
  CompanyRenameDeleteForm: () => <div data-testid="company-rename-delete-form-stub" />,
}));
vi.mock('@/components/company/CompanyOptionsSection', () => ({
  CompanyOptionsSection: () => <div data-testid="company-options-section-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();
const localeId = getActiveLocaleId();

describe('CompaniesContent — routes the Companies branch to Create, or Rename/Delete + the stacked sections (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 13)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useLocaleStore.getState().setLocaleData(localeId, { companies: [] } as unknown as Partial<Locale>);
  });

  it('shows CompanyCreateForm for the bare "Companies" node — no company selected', () => {
    render(<CompaniesContent />);

    expect(screen.getByTestId('company-create-form-stub')).toBeTruthy();
    expect(screen.queryByTestId('company-rename-delete-form-stub')).toBeNull();
    expect(screen.queryByTestId('company-options-section-stub')).toBeNull();
  });

  it('shows CompanyRenameDeleteForm together with CompanyOptionsSection\'s stacked sections whenever a company is selected — no more either/or split (spec §2: "the update and delete sections followed by sliders")', () => {
    useUIStore.getState().selectCompany('c1');

    render(<CompaniesContent />);

    expect(screen.getByTestId('company-rename-delete-form-stub')).toBeTruthy();
    expect(screen.getByTestId('company-options-section-stub')).toBeTruthy();
    expect(screen.queryByTestId('company-create-form-stub')).toBeNull();
  });

  it('keeps showing both together regardless of which section is selected — CompanyOptionsSection now reads selection from uiStore directly, not a narrowing prop', () => {
    useUIStore.getState().selectCompany('c1');
    useUIStore.getState().setSelectedSection('melody');

    render(<CompaniesContent />);

    expect(screen.getByTestId('company-rename-delete-form-stub')).toBeTruthy();
    expect(screen.getByTestId('company-options-section-stub')).toBeTruthy();
  });

  it('renders the "Companies" section IntroPanel for the bare node, and "Individual Company" once one is selected', () => {
    const { unmount } = render(<CompaniesContent />);
    expect(screen.getByText('Companies LORE TITLE')).toBeTruthy();
    unmount();

    useUIStore.getState().selectCompany('c1');
    render(<CompaniesContent />);
    expect(screen.getByText('Individual Company LORE TITLE')).toBeTruthy();
  });

  it('renders a Company Selection radio listing every company for the bare "Companies" node, and selecting one calls selectCompany', () => {
    useLocaleStore.getState().setLocaleData(localeId, {
      companies: [
        { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] },
        { id: 'c2', name: 'Solaris Combine', color: '#a15c3f', robotIds: [] },
      ],
    } as unknown as Partial<Locale>);

    render(<CompaniesContent />);

    expect(screen.getByRole('radio', { name: 'Iron Consortium' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Solaris Combine' }));

    expect(useUIStore.getState().selectedCompanyId).toBe('c2');
  });
});
