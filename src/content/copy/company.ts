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
    /** The roster's Move panel / sheet title over this same radio (docs/specs/LAYOUT_REWORK.md §1.5). */
    template: 'Move {name} to',
    options: {
      freelance: { human: 'Freelance' },
    },
    help: { human: 'Which company this probe belongs to. A change to a company’s settings reaches every probe in it at that moment; moving a probe in or out changes nothing about its sound. Freelance probes belong to no company.' },
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

  // ---------------------------------------------------------------- company detail
  // The company column (docs/specs/LAYOUT_REWORK.md §1.6), copy from the approved sketch. Readouts are
  // a label (human + lore) over a value; counts are slots, the fleet size included.
  'company.detail.share': { human: 'Fleet Share', lore: 'Mesh Share', template: '{n} of {total} probes' },
  'company.detail.signal': {
    human: 'Halo',
    lore: 'Affiliation Signal',
    options: {
      company: { human: 'Halo on every member' },
      all: { human: 'No halo — nothing to mark apart' },
    },
  },
  /** Stated once in the column: edits broadcast, never link (docs/COMPANIES.md). One member and none
   *  have their own forms — the plural sentence would read "all 1 probes" / "all 0 probes". */
  'company.detail.broadcastNote': {
    human: 'Broadcast note',
    template: 'Edits on this screen reach all {n} probes at once — one broadcast, never a link. A probe edited on its own afterwards keeps its own value.',
  },
  'company.detail.broadcastNote.one': {
    human: 'Edits on this screen reach its one probe — one broadcast, never a link. If it is edited on its own afterwards, it keeps its own value.',
  },
  'company.detail.broadcastNote.none': {
    human: 'This company has no probes yet, so an edit here has nothing to reach. Move a probe in from the Probes roster first.',
  },
  /** The All form's eyebrow over its title (the title itself is `probe.all`). */
  'company.detail.allForm': { human: 'Fleet-wide edit' },
} as const satisfies Record<string, ContentEntry>;
