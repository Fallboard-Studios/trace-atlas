import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CompaniesContent } from './CompaniesContent';
import { useUIStore } from '@/stores/uiStore';

// CompanyCreateForm/CompanyRenameDeleteForm/CompanyOptionsSection each have their own full test
// suite — this file is about CompaniesContent's own routing between the 3, not re-testing their
// content.
vi.mock('@/components/company/CompanyCrudControls', () => ({
  CompanyCreateForm: () => <div data-testid="company-create-form-stub" />,
  CompanyRenameDeleteForm: () => <div data-testid="company-rename-delete-form-stub" />,
}));
vi.mock('@/components/company/CompanyOptionsSection', () => ({
  CompanyOptionsSection: ({ section }: { section?: string | null }) => (
    <div data-testid="company-options-section-stub" data-section={section ?? 'none'} />
  ),
}));

const UI_INITIAL_STATE = useUIStore.getState();

describe('CompaniesContent — routes the Companies branch to Create, Rename/Delete, or the bulk-edit drawers (docs/tasks/NAV_LAYOUT_REWRITE.md Task 20)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('shows CompanyCreateForm for the bare "Companies" node — no company selected', () => {
    render(<CompaniesContent />);

    expect(screen.getByTestId('company-create-form-stub')).toBeTruthy();
    expect(screen.queryByTestId('company-rename-delete-form-stub')).toBeNull();
    expect(screen.queryByTestId('company-options-section-stub')).toBeNull();
  });

  it('shows CompanyRenameDeleteForm when a company is selected and no section is chosen — "Companies -> Company X"', () => {
    useUIStore.getState().selectCompany('c1');

    render(<CompaniesContent />);

    expect(screen.getByTestId('company-rename-delete-form-stub')).toBeTruthy();
    expect(screen.queryByTestId('company-create-form-stub')).toBeNull();
    expect(screen.queryByTestId('company-options-section-stub')).toBeNull();
  });

  it('shows CompanyOptionsSection narrowed to the selected section — "Companies -> Company X -> Volume"', () => {
    useUIStore.getState().selectCompany('c1');
    useUIStore.getState().setSelectedSection('volume');

    render(<CompaniesContent />);

    expect(screen.getByTestId('company-options-section-stub').getAttribute('data-section')).toBe('volume');
    expect(screen.queryByTestId('company-rename-delete-form-stub')).toBeNull();
    expect(screen.queryByTestId('company-create-form-stub')).toBeNull();
  });

  it('switches back to CompanyRenameDeleteForm when navigating from a section back to the bare company node', () => {
    useUIStore.getState().selectCompany('c1');
    useUIStore.getState().setSelectedSection('melody');
    const { rerender } = render(<CompaniesContent />);
    expect(screen.getByTestId('company-options-section-stub')).toBeTruthy();

    act(() => useUIStore.getState().setSelectedSection(null));
    rerender(<CompaniesContent />);

    expect(screen.getByTestId('company-rename-delete-form-stub')).toBeTruthy();
  });
});
