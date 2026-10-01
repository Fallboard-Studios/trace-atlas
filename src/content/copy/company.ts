import type { ContentEntry } from '../types';

/**
 * Companies — the branch, the assignment radio and the CRUD forms. One entry per concept.
 * Transcribed verbatim on 2026-09-30 (Task 4) from navTreeConfig.ts, companyConfig.ts,
 * CompaniesContent.tsx and CompanyCrudControls.tsx. ALL CAPS lore is legacy copy kept verbatim
 * until the review gate (Task 17). `template` carries each button's dynamic accessible name
 * (the slot is the company/draft name — data, not copy).
 */
export const company = {
  'company.root': {
    human: 'Companies',
    lore: 'Unity & Variety',
    intro: {
      lore: 'Companies — organize your fleet into working groups.',
      loreDescription: 'Meridia recommends grouping probes by company for cleaner reporting and coordinated tasking.',
      humanDescription: 'A company is a named group of probes you create. Give every probe in a company the same settings at once, the same way All Probes does for your whole fleet — just scoped to one group. Create a company below, or select an existing one to edit it.',
    },
  },
  'company.profile': {
    human: 'Company Profile',
    intro: {
      lore: 'Company Profile — manage this working group.',
      loreDescription: 'Review this company’s roster and standing orders, or reassign it entirely.',
      humanDescription: 'Rename or delete this company, then adjust the settings below — they apply to every probe currently assigned to it, the same way All Probes applies to your whole fleet.',
    },
  },
  'company.assign': {
    human: 'Company',
    lore: 'UNIT AFFILIATION',
    options: {
      freelance: { human: 'Freelance' },
    },
  },
  'company.selection': { human: 'Company Selection', lore: 'REGISTERED CONSORTIA' },
  'company.name': { human: 'Company Name', lore: 'DESIGNATION', placeholder: 'Enter a company name…' },
  'company.name.create': { human: 'New Company Name' },
  'company.name.rename': { human: 'Rename Company' },
  'company.create': { human: 'Create', lore: 'COMMISSION UNIT', template: 'Create {name}' },
  'company.rename': { human: 'Rename', lore: 'REDESIGNATE UNIT', template: 'Rename {company} > {name}' },
  'company.delete': { human: 'Delete', lore: 'DECOMMISSION UNIT', template: 'Delete {company}' },
} as const satisfies Record<string, ContentEntry>;
