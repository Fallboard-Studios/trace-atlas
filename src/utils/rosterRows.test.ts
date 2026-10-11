import { describe, it, expect } from 'vitest';
import { rosterRows } from './rosterRows';
import { MAX_COMPANIES } from '@/constants';

// docs/tasks/LAYOUT_REWORK.md Task 20 (spec §1.5): the roster board's rows — one per company in the
// locale's order, Freelance last.

const robot = (id: string, companyId?: string | null) => ({ id, companyId });
const company = (id: string) => ({ id });

describe('rosterRows', () => {
  it('gives three companies plus Freelance four rows, companies in locale order, Freelance last', () => {
    const rows = rosterRows({
      companies: [company('iron'), company('rust'), company('tide')],
      robots: [robot('r0', 'rust'), robot('r1'), robot('r2', 'iron'), robot('r3', 'tide'), robot('r4', 'rust')],
    });
    expect(rows).toEqual([
      { companyId: 'iron', robotIds: ['r2'] },
      { companyId: 'rust', robotIds: ['r0', 'r4'] },
      { companyId: 'tide', robotIds: ['r3'] },
      { companyId: null, robotIds: ['r1'] },
    ]);
  });

  it('gives MAX_COMPANIES companies plus Freelance seven rows', () => {
    const companies = Array.from({ length: MAX_COMPANIES }, (_, i) => company(`c${i}`));
    const robots = Array.from({ length: 12 }, (_, i) => robot(`r${i}`, i < MAX_COMPANIES ? `c${i}` : undefined));
    const rows = rosterRows({ companies, robots });
    expect(MAX_COMPANIES).toBe(6);
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.companyId)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', null]);
  });

  it('keeps an empty company\'s row, with zero tiles, in its place', () => {
    const rows = rosterRows({
      companies: [company('iron'), company('empty'), company('rust')],
      robots: [robot('r0', 'iron'), robot('r1', 'rust')],
    });
    expect(rows[1]).toEqual({ companyId: 'empty', robotIds: [] });
    expect(rows.map((row) => row.companyId)).toEqual(['iron', 'empty', 'rust', null]);
  });

  it('keeps the Freelance row when every robot belongs to a company (it is a Move target)', () => {
    const rows = rosterRows({ companies: [company('iron')], robots: [robot('r0', 'iron')] });
    expect(rows).toEqual([
      { companyId: 'iron', robotIds: ['r0'] },
      { companyId: null, robotIds: [] },
    ]);
  });

  it('gives a world with no companies a single Freelance row holding everyone', () => {
    expect(rosterRows({ companies: [], robots: [robot('r0'), robot('r1', null)] })).toEqual([
      { companyId: null, robotIds: ['r0', 'r1'] },
    ]);
  });

  it('treats undefined, null and empty-string companyId alike as Freelance', () => {
    const rows = rosterRows({ companies: [], robots: [robot('r0'), robot('r1', null), robot('r2', '')] });
    expect(rows).toEqual([{ companyId: null, robotIds: ['r0', 'r1', 'r2'] }]);
  });

  it('lists members in the locale\'s robot order, not the company\'s own robotIds order', () => {
    const iron = { id: 'iron', robotIds: ['r2', 'r0'] };
    const rows = rosterRows({
      companies: [iron],
      robots: [robot('r0', 'iron'), robot('r1'), robot('r2', 'iron')],
    });
    expect(rows[0].robotIds).toEqual(['r0', 'r2']);
  });

  it('files a robot whose companyId names no company under Freelance, so it is never lost', () => {
    const rows = rosterRows({ companies: [company('iron')], robots: [robot('r0', 'deleted'), robot('r1', 'iron')] });
    expect(rows).toEqual([
      { companyId: 'iron', robotIds: ['r1'] },
      { companyId: null, robotIds: ['r0'] },
    ]);
  });

  it('puts every robot in exactly one row', () => {
    const companies = [company('a'), company('b'), company('c')];
    const ids = ['a', 'b', 'c', undefined, 'gone', null];
    const robots = Array.from({ length: 12 }, (_, i) => robot(`r${i}`, ids[i % ids.length]));
    const placed = rosterRows({ companies, robots }).flatMap((row) => row.robotIds);
    expect([...placed].sort()).toEqual(robots.map((r) => r.id).sort());
  });

  it('gives an empty world one empty Freelance row', () => {
    expect(rosterRows({ companies: [], robots: [] })).toEqual([{ companyId: null, robotIds: [] }]);
  });
});
