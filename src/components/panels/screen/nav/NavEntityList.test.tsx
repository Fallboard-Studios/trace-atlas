import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

import { NavEntityList } from './NavEntityList';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { TRAIT_COLORS } from '@/utils/traitColors';
import { labels, fill, type ContentKey } from '@/content';
import type { Robot } from '@/types/Robot';
import type { Company } from '@/types/Company';
import type { Locale } from '@/types/locale';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 4 (spec §1.2): the Probes / Companies entity list under the active
 * parent box. Every pick goes through navActions; "+ New Company" opens the existing staged
 * CompanyCreateForm inline under the list. CabinetBox is stubbed to expose `popped`.
 */

vi.mock('@/components/ui/controls/CabinetBox', () => ({
  CabinetBox: ({ popped, children }: { popped: boolean | number; children?: React.ReactNode }) => (
    <div data-testid="cabinet-box" data-popped={String(popped)}>
      {children}
    </div>
  ),
}));

const localeId = getActiveLocaleId();
const human = (key: ContentKey) => labels(key).humanLabel;

function seedRoster({ robots = true, companies = true } = {}) {
  useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  if (robots) {
    useLocaleStore.getState().addRobot(localeId, { id: 'r1', name: 'Tidal Wisp', identityColor: '#ae5378', batteryLevel: 80 } as unknown as Robot);
    useLocaleStore.getState().addRobot(localeId, { id: 'r2', name: 'Glass Drifter', identityColor: '#e8e4d8', batteryLevel: 80 } as unknown as Robot);
    useLocaleStore.getState().addRobot(localeId, { id: 'r3', identityColor: '#5bb7c6', batteryLevel: 80 } as unknown as Robot);
  }
  if (companies) {
    useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Rust Syndicate', color: '#ae5378', robotIds: ['r1'] } as Company);
    useLocaleStore.getState().addCompany(localeId, { id: 'c2', name: 'Neon Division', color: '#e2b149', robotIds: [] } as Company);
  }
}

const list = () => document.querySelector<HTMLElement>('.nav-entity-list')!;
const names = () => within(list()).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
const entity = (name: string) => within(list()).getByRole('button', { name });
const poppedOf = (button: HTMLElement) => within(button).getByTestId('cabinet-box').getAttribute('data-popped');
const accentOf = (button: HTMLElement) => button.style.getPropertyValue('--color-accent-a');

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  seedRoster();
});

describe('NavEntityList — Probes', () => {
  it('lists All Probes first, then every robot in roster order by name, an unnamed robot by its id', () => {
    render(<NavEntityList branch="probes" />);
    expect(names()).toEqual([human('probe.all'), 'Tidal Wisp', 'Glass Drifter', 'r3']);
  });

  it('is a nested list, one item per entity', () => {
    render(<NavEntityList branch="probes" />);
    expect(list().tagName).toBe('UL');
    expect(list().querySelectorAll(':scope > li')).toHaveLength(4);
  });

  it("tints each robot's box in its identity colour, and All Probes in the Deck's trait", () => {
    render(<NavEntityList branch="probes" />);
    expect(accentOf(entity('Tidal Wisp'))).toBe('#ae5378');
    expect(accentOf(entity('Glass Drifter'))).toBe('#e8e4d8');
    expect(accentOf(entity(human('probe.all')))).toBe(TRAIT_COLORS.header[0]);
  });

  it('keeps a light identity colour readable: dark text on its box', () => {
    render(<NavEntityList branch="probes" />);
    expect(entity('Glass Drifter').style.getPropertyValue('--color-text-primary')).not.toBe(
      entity('Tidal Wisp').style.getPropertyValue('--color-text-primary'),
    );
  });

  it('clicking a robot selects it through navActions: Probes open on that robot with the list collapsed, nothing else selected', () => {
    useUIStore.setState({ allProbesSelected: true, selectedSection: 'source' });
    render(<NavEntityList branch="probes" />);
    fireEvent.click(entity('Glass Drifter'));
    expect(useUIStore.getState()).toMatchObject({
      activeHubTile: 'robots',
      expandedTopLevelBranch: null, // a pick collapses the list (Crawford, 2026-10-10)
      selectedRobotId: 'r2',
      allProbesSelected: false,
      selectedSection: null,
    });
  });

  it('clicking All Probes selects the whole fleet and no robot', () => {
    useUIStore.setState({ selectedRobotId: 'r1' });
    render(<NavEntityList branch="probes" />);
    fireEvent.click(entity(human('probe.all')));
    expect(useUIStore.getState()).toMatchObject({ activeHubTile: 'robots', allProbesSelected: true, selectedRobotId: null });
  });

  it('pops nothing when no entity is selected', () => {
    render(<NavEntityList branch="probes" />);
    for (const b of within(list()).getAllByRole('button')) expect(poppedOf(b)).not.toBe('true');
  });

  it('pops and marks current only the selected robot', () => {
    useUIStore.setState({ selectedRobotId: 'r2' });
    render(<NavEntityList branch="probes" />);
    expect(poppedOf(entity('Glass Drifter'))).toBe('true');
    expect(entity('Glass Drifter').getAttribute('aria-current')).toBe('true');
    for (const name of [human('probe.all'), 'Tidal Wisp', 'r3']) {
      expect(poppedOf(entity(name))).not.toBe('true');
      expect(entity(name).getAttribute('aria-current')).toBeNull();
    }
  });

  it('pops All Probes while the whole fleet is selected', () => {
    useUIStore.setState({ allProbesSelected: true });
    render(<NavEntityList branch="probes" />);
    expect(poppedOf(entity(human('probe.all')))).toBe('true');
  });

  it('a specific robot wins over All Probes when both are set, as the content routes', () => {
    useUIStore.setState({ allProbesSelected: true, selectedRobotId: 'r1' });
    render(<NavEntityList branch="probes" />);
    expect(poppedOf(entity('Tidal Wisp'))).toBe('true');
    expect(poppedOf(entity(human('probe.all')))).not.toBe('true');
  });

  it('follows a selection made elsewhere (a robot clicked in the world)', () => {
    render(<NavEntityList branch="probes" />);
    act(() => useUIStore.getState().selectRobot('r1'));
    expect(poppedOf(entity('Tidal Wisp'))).toBe('true');
  });

  it('lists only All Probes when the roster is empty', () => {
    seedRoster({ robots: false });
    render(<NavEntityList branch="probes" />);
    expect(names()).toEqual([human('probe.all')]);
  });

  it('does not re-render when a robot changes a field the list does not show (a battery tick)', () => {
    let commits = 0;
    render(
      <Profiler id="entities" onRender={() => commits++}>
        <NavEntityList branch="probes" />
      </Profiler>,
    );
    const before = commits;
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 12 }));
    expect(commits).toBe(before);
  });

  it('shows a renamed robot', () => {
    render(<NavEntityList branch="probes" />);
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { name: 'Null Wisp' }));
    expect(names()).toEqual([human('probe.all'), 'Null Wisp', 'Glass Drifter', 'r3']);
  });

  it('shows a changed identity colour on its own (no rename alongside it)', () => {
    render(<NavEntityList branch="probes" />);
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { identityColor: '#cd5e57' }));
    expect(accentOf(entity('Tidal Wisp'))).toBe('#cd5e57');
  });
});

describe('NavEntityList — Companies', () => {
  const newCompany = () => entity(human('nav.entity.newCompany'));
  const createForm = () => document.querySelector('.company-create-form');

  it('lists + New Company first, then every company in order by name', () => {
    render(<NavEntityList branch="companies" />);
    expect(names()).toEqual([human('nav.entity.newCompany'), 'Rust Syndicate', 'Neon Division']);
  });

  it('shows + New Company with its lore label', () => {
    render(<NavEntityList branch="companies" />);
    expect(newCompany().textContent).toContain(labels('nav.entity.newCompany').loreLabel);
  });

  it("tints each company's box in its company colour, and + New Company in the company trait", () => {
    render(<NavEntityList branch="companies" />);
    expect(accentOf(entity('Rust Syndicate'))).toBe('#ae5378');
    expect(accentOf(entity('Neon Division'))).toBe('#e2b149');
    expect(accentOf(newCompany())).toBe(TRAIT_COLORS.company[0]);
  });

  it('clicking a company selects it through navActions: Companies open on that company with the list collapsed', () => {
    useUIStore.setState({ selectedRobotId: 'r1' });
    render(<NavEntityList branch="companies" />);
    fireEvent.click(entity('Neon Division'));
    expect(useUIStore.getState()).toMatchObject({
      activeHubTile: 'companies',
      expandedTopLevelBranch: null, // a pick collapses the list (Crawford, 2026-10-10)
      selectedCompanyId: 'c2',
      allRobotsSelected: false,
      selectedRobotId: null,
    });
  });

  it('pops and marks current only the selected company', () => {
    useUIStore.getState().selectCompany('c1');
    render(<NavEntityList branch="companies" />);
    expect(poppedOf(entity('Rust Syndicate'))).toBe('true');
    expect(entity('Rust Syndicate').getAttribute('aria-current')).toBe('true');
    expect(poppedOf(entity('Neon Division'))).not.toBe('true');
    expect(poppedOf(newCompany())).not.toBe('true');
    expect(newCompany().getAttribute('aria-current')).toBeNull();
  });

  it('+ New Company opens the create form under the list and closes it again', () => {
    render(<NavEntityList branch="companies" />);
    expect(createForm()).toBeNull();
    expect(newCompany().getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(newCompany());

    expect(newCompany().getAttribute('aria-expanded')).toBe('true');
    expect(poppedOf(newCompany())).toBe('true');
    const form = createForm()!;
    expect(form).not.toBeNull();
    expect(list().compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list().contains(form)).toBe(false);
    expect(document.getElementById(newCompany().getAttribute('aria-controls')!)?.contains(form)).toBe(true);

    fireEvent.click(newCompany());

    expect(createForm()).toBeNull();
    expect(newCompany().getAttribute('aria-expanded')).toBe('false');
  });

  it('opening the form selects nothing and changes no route', () => {
    useUIStore.getState().selectCompany('c1');
    useUIStore.setState({ activeHubTile: 'companies' });
    render(<NavEntityList branch="companies" />);
    fireEvent.click(newCompany());
    expect(useUIStore.getState()).toMatchObject({ activeHubTile: 'companies', selectedCompanyId: 'c1' });
  });

  it('the form stages its draft: typing adds nothing, Create adds the company and it joins the list', () => {
    render(<NavEntityList branch="companies" />);
    fireEvent.click(newCompany());

    fireEvent.change(screen.getByRole('textbox', { name: human('company.name.create') }), { target: { value: 'Iron Crew' } });
    expect(useLocaleStore.getState().locales[localeId].companies).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: fill('company.create', { name: 'Iron Crew' }) }));

    expect(useLocaleStore.getState().locales[localeId].companies).toHaveLength(3);
    expect(names()).toEqual([human('nav.entity.newCompany'), 'Rust Syndicate', 'Neon Division', 'Iron Crew']);
  });

  it('lists only + New Company when there are no companies', () => {
    seedRoster({ companies: false });
    render(<NavEntityList branch="companies" />);
    expect(names()).toEqual([human('nav.entity.newCompany')]);
  });
});

describe('NavEntityList reads its copy from src/content (docs/specs/CONTENT_LAYER.md)', () => {
  it('carries no copy literal of its own', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'NavEntityList.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*[:=]\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/>\s*[A-Z+][a-z]*( [A-Za-z]+)*\s*</);
  });
});
