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
    help: { human: 'Which company this probe belongs to. A change to a company’s settings reaches every probe in it at that moment; moving a probe in or out changes nothing about its sound. Freelance probes belong to no company.' },
  },
  'company.selection': {
    human: 'Company Selection',
    lore: 'REGISTERED CONSORTIA',
    help: { human: 'Which company to look at. Rename or delete it below, or change a setting there to send it to every probe in that company at once.' },
  },
  'company.name': {
    human: 'Company Name',
    lore: 'DESIGNATION',
    placeholder: 'Enter a company name…',
    help: { human: 'The company’s name, up to 128 characters. It is only a label: it shows in the company lists and pickers, and changes nothing about the sound.' },
  },
  'company.name.create': {
    human: 'New Company Name',
    help: { human: 'A name for a new company. Press Create to make it; it starts with no probes, and you move probes into it with each probe’s Company picker.' },
  },
  'company.name.rename': {
    human: 'Rename Company',
    help: { human: 'A new name for the selected company. Press Rename to apply it; its probes and settings stay as they are.' },
  },
  'company.create': { human: 'Create', lore: 'COMMISSION UNIT', template: 'Create {name}' },
  'company.rename': { human: 'Rename', lore: 'REDESIGNATE UNIT', template: 'Rename {company} > {name}' },
  'company.delete': { human: 'Delete', lore: 'DECOMMISSION UNIT', template: 'Delete {company}' },
  'company.delete.confirmTitle': { human: 'Delete?', template: 'Delete {company}?' },
  'company.delete.confirmBody': { human: 'Its member robots become Freelance. This can\'t be undone.' },
} as const satisfies Record<string, ContentEntry>;
