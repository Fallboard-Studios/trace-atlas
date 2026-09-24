// ========================================
// IMPORTS
// ========================================
import type { RadioButtonSchema, ButtonSchema, TextInputSchema } from '../types/controls';
import type { Company } from '../types/Company';

// ========================================
// COMPANY ASSIGNMENT (RadioButton)
// ========================================

/** Radix ToggleGroup (RadioButton's own underlying primitive) emits '' on a deselect-to-empty
 *  click, which RadioButton.tsx already guards against (never calls onChange with it) — this
 *  sentinel isn't load-bearing against that the way it was for Radix Select.Item's own
 *  empty-string rejection back when this schema built a Select. Kept non-empty anyway, for the
 *  same defensive-and-symmetry reason ALL_VALUE documents below, and because every consumer
 *  already branches on it (value === FREELANCE_VALUE ? null : value). */
export const FREELANCE_VALUE = '__freelance__';

/**
 * Dynamic — unlike every other schema in this file (and every other *Config.ts file in the
 * codebase), this one depends on runtime data (the current company list), so it's a function,
 * not a static export. Used for the robot-to-company assignment RadioButton in both
 * RobotSelectionCard and RobotDisplaySection. Named/typed for a Select (buildCompanySelectSchema,
 * SelectSchema) through Roadmap Phase 10; renamed and retyped to RadioButtonSchema by 10.5 when
 * Select was removed entirely — see docs/specs/COMPANY_ASSIGNMENT_RADIO.md. Each company option
 * now also carries that company's own `color` (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.3);
 * Freelance omits it, keeping RadioButton's ambient-accent fallback.
 */
export function buildCompanyAssignmentSchema(companies: Company[]): RadioButtonSchema {
  return {
    id: 'company.assign',
    type: 'radio',
    loreLabel: 'UNIT AFFILIATION',
    humanLabel: 'Company',
    options: [
      // No color — ambient fallback (the robot card's own identityColor, cascaded from its <li>).
      { value: FREELANCE_VALUE, label: 'Freelance' },
      ...companies.map((c) => ({ value: c.id, label: c.name, color: c.color })),
    ],
  };
}

// ========================================
// COMPANY CRUD (create/rename/delete)
// ========================================

/** Shared by both Create and Rename — both are locally-staged draft values, not committed to the
 *  store until their own button is clicked (Rename's own Submit button, added alongside Create's
 *  Commission button, matching request — was bound live to the selected company's name before). */
export const COMPANY_NAME_INPUT_SCHEMA: TextInputSchema = {
  id: 'company.name',
  type: 'textInput',
  loreLabel: 'DESIGNATION',
  humanLabel: 'Company Name',
  placeholder: 'Enter a company name…',
  maxLength: 128,
};

export const CREATE_COMPANY_SCHEMA: ButtonSchema = {
  id: 'company.create',
  type: 'button',
  loreLabel: 'COMMISSION UNIT',
  humanLabel: 'Create',
};

export const RENAME_COMPANY_SCHEMA: ButtonSchema = {
  id: 'company.rename',
  type: 'button',
  loreLabel: 'REDESIGNATE UNIT',
  humanLabel: 'Rename',
};

export const DELETE_COMPANY_SCHEMA: ButtonSchema = {
  id: 'company.delete',
  type: 'button',
  loreLabel: 'DECOMMISSION UNIT',
  humanLabel: 'Delete',
};
