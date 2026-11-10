import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent, within } from '@testing-library/react';

import { NavEntityList } from './NavEntityList';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { TRAIT_COLORS } from '@/utils/traitColors';
import { labels, type ContentKey } from '@/content';
import type { Robot } from '@/types/Robot';
import type { Company } from '@/types/Company';
import type { Locale } from '@/types/locale';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 4 (spec §1.2): the Probes entity list under the active parent box
 * (the Companies list went with its box, docs/tasks/OFF_SCREEN_CONSOLE.md Task 18). Every pick goes
 * through navActions. CabinetBox is stubbed to expose `popped`.
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
    render(<NavEntityList />);
    expect(names()).toEqual([human('probe.all'), 'Tidal Wisp', 'Glass Drifter', 'r3']);
  });

  it('is a nested list, one item per entity', () => {
    render(<NavEntityList />);
    expect(list().tagName).toBe('UL');
    expect(list().querySelectorAll(':scope > li')).toHaveLength(4);
  });

  it("tints each robot's box in its identity colour, and All Probes in the Deck's trait", () => {
    render(<NavEntityList />);
    expect(accentOf(entity('Tidal Wisp'))).toBe('#ae5378');
    expect(accentOf(entity('Glass Drifter'))).toBe('#e8e4d8');
    expect(accentOf(entity(human('probe.all')))).toBe(TRAIT_COLORS.header[0]);
  });

  it('keeps a light identity colour readable: dark text on its box', () => {
    render(<NavEntityList />);
    expect(entity('Glass Drifter').style.getPropertyValue('--color-text-primary')).not.toBe(
      entity('Tidal Wisp').style.getPropertyValue('--color-text-primary'),
    );
  });

  it('clicking a robot selects it through navActions: Probes open on that robot with the list collapsed, nothing else selected', () => {
    useUIStore.setState({ allProbesSelected: true, selectedSection: 'source' });
    render(<NavEntityList />);
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
    render(<NavEntityList />);
    fireEvent.click(entity(human('probe.all')));
    expect(useUIStore.getState()).toMatchObject({ activeHubTile: 'robots', allProbesSelected: true, selectedRobotId: null });
  });

  it('pops nothing when no entity is selected', () => {
    render(<NavEntityList />);
    for (const b of within(list()).getAllByRole('button')) expect(poppedOf(b)).not.toBe('true');
  });

  it('pops and marks current only the selected robot', () => {
    useUIStore.setState({ selectedRobotId: 'r2' });
    render(<NavEntityList />);
    expect(poppedOf(entity('Glass Drifter'))).toBe('true');
    expect(entity('Glass Drifter').getAttribute('aria-current')).toBe('true');
    for (const name of [human('probe.all'), 'Tidal Wisp', 'r3']) {
      expect(poppedOf(entity(name))).not.toBe('true');
      expect(entity(name).getAttribute('aria-current')).toBeNull();
    }
  });

  it('pops All Probes while the whole fleet is selected', () => {
    useUIStore.setState({ allProbesSelected: true });
    render(<NavEntityList />);
    expect(poppedOf(entity(human('probe.all')))).toBe('true');
  });

  it('a specific robot wins over All Probes when both are set, as the content routes', () => {
    useUIStore.setState({ allProbesSelected: true, selectedRobotId: 'r1' });
    render(<NavEntityList />);
    expect(poppedOf(entity('Tidal Wisp'))).toBe('true');
    expect(poppedOf(entity(human('probe.all')))).not.toBe('true');
  });

  it('follows a selection made elsewhere (a robot clicked in the world)', () => {
    render(<NavEntityList />);
    act(() => useUIStore.getState().selectRobot('r1'));
    expect(poppedOf(entity('Tidal Wisp'))).toBe('true');
  });

  it('lists only All Probes when the roster is empty', () => {
    seedRoster({ robots: false });
    render(<NavEntityList />);
    expect(names()).toEqual([human('probe.all')]);
  });

  it('does not re-render when a robot changes a field the list does not show (a battery tick)', () => {
    let commits = 0;
    render(
      <Profiler id="entities" onRender={() => commits++}>
        <NavEntityList />
      </Profiler>,
    );
    const before = commits;
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 12 }));
    expect(commits).toBe(before);
  });

  it('shows a renamed robot', () => {
    render(<NavEntityList />);
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { name: 'Null Wisp' }));
    expect(names()).toEqual([human('probe.all'), 'Null Wisp', 'Glass Drifter', 'r3']);
  });

  it('shows a changed identity colour on its own (no rename alongside it)', () => {
    render(<NavEntityList />);
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { identityColor: '#cd5e57' }));
    expect(accentOf(entity('Tidal Wisp'))).toBe('#cd5e57');
  });
});
