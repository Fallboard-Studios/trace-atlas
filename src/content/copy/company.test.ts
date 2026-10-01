/**
 * Parity test (docs/tasks/CONTENT_LAYER.md Task 4): the company area is a byte-for-byte copy of
 * the literals it replaces. Deleted piecewise as each source migrates (companyConfig → Task 8,
 * intros → Task 13, CompanyCrudControls → Task 15).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { company } from './company';
import { makeHelpers } from '../index';
import { NAV_TREE_SCHEMA } from '@/data/navTreeConfig';
import {
  buildCompanyAssignmentSchema, buildCompanySelectionSchema, COMPANY_NAME_INPUT_SCHEMA,
  CREATE_COMPANY_SCHEMA, RENAME_COMPANY_SCHEMA, DELETE_COMPANY_SCHEMA, FREELANCE_VALUE,
} from '@/data/companyConfig';

const { fill } = makeHelpers(company);
const src = readFileSync(resolve(__dirname, '../../components/company/CompanyCrudControls.tsx'), 'utf8');
const content = readFileSync(resolve(__dirname, '../../components/panels/screen/nav/content/CompaniesContent.tsx'), 'utf8');

describe('company content parity', () => {
  it('nav branch', () => {
    const n = NAV_TREE_SCHEMA.find((x) => x.id === 'companies')!;
    expect([company['company.root'].human, company['company.root'].lore]).toEqual([n.humanLabel, n.loreLabel]);
  });

  it('assignment radio + Freelance option', () => {
    const s = buildCompanyAssignmentSchema([]);
    expect([company['company.assign'].human, company['company.assign'].lore]).toEqual([s.humanLabel, s.loreLabel]);
    const freelance = s.options.find((o) => o.value === FREELANCE_VALUE)!;
    expect(company['company.assign'].options.freelance.human).toBe(freelance.humanLabel);
  });

  it('selection radio', () => {
    const s = buildCompanySelectionSchema([]);
    expect([company['company.selection'].human, company['company.selection'].lore]).toEqual([s.humanLabel, s.loreLabel]);
  });

  it('name input + buttons', () => {
    const c = company;
    expect([c['company.name'].human, c['company.name'].lore, c['company.name'].placeholder]).toEqual([COMPANY_NAME_INPUT_SCHEMA.humanLabel, COMPANY_NAME_INPUT_SCHEMA.loreLabel, COMPANY_NAME_INPUT_SCHEMA.placeholder]);
    expect([c['company.create'].human, c['company.create'].lore]).toEqual([CREATE_COMPANY_SCHEMA.humanLabel, CREATE_COMPANY_SCHEMA.loreLabel]);
    expect([c['company.rename'].human, c['company.rename'].lore]).toEqual([RENAME_COMPANY_SCHEMA.humanLabel, RENAME_COMPANY_SCHEMA.loreLabel]);
    expect([c['company.delete'].human, c['company.delete'].lore]).toEqual([DELETE_COMPANY_SCHEMA.humanLabel, DELETE_COMPANY_SCHEMA.loreLabel]);
  });

  it('CompanyCrudControls own labels + dynamic templates reproduce the component\'s own concatenations', () => {
    expect(src).toContain(`humanLabel: '${company['company.name.create'].human}'`);
    expect(src).toContain(`humanLabel: '${company['company.name.rename'].human}'`);
    // The component builds `${SCHEMA.humanLabel} ${draft}` etc.; the templates must produce the same.
    expect(fill('company.create', { name: 'Acme' })).toBe(`${CREATE_COMPANY_SCHEMA.humanLabel} Acme`);
    expect(fill('company.rename', { company: 'Acme', name: 'Acme Ltd' })).toBe(`${RENAME_COMPANY_SCHEMA.humanLabel} Acme > Acme Ltd`);
    expect(fill('company.delete', { company: 'Acme' })).toBe(`${DELETE_COMPANY_SCHEMA.humanLabel} Acme`);
  });

  it.each(['company.root', 'company.profile'] as const)('%s intro in CompaniesContent', (k) => {
    const { lore, loreDescription, humanDescription } = company[k].intro;
    for (const s of [lore, loreDescription, humanDescription]) expect(content).toContain(s);
  });
});
