import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ScreenExitRow } from './ScreenExitRow';
import { selectBranch, selectEntity } from './navActions';
import { useUIStore } from '@/stores/uiStore';
import { labels } from '@/content';

/*
 * docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 7 (spec §1.5, §5.1 Part B): the row's two buttons, Back and Close,
 * wired to navActions' back() and goHome(). Asserted on the store's state, not on spies. CabinetBox is stubbed as
 * Button's own tests stub it: the box's timeline is not this row's concern.
 */

vi.mock('@/components/ui/controls/CabinetBox', () => ({
  CabinetBox: ({ children }: { children?: React.ReactNode }) => <div data-testid="cabinet-box">{children}</div>,
}));

const ui = () => useUIStore.getState();
const BACK = labels('nav.back').humanLabel!;
const CLOSE = labels('nav.close').humanLabel!;
const backButton = () => screen.getByRole('button', { name: BACK });
const closeButton = () => screen.getByRole('button', { name: CLOSE });

/** The Probes list, then a robot picked from it: the walk the task's Proof names. */
function robotFromProbesList() {
  selectBranch('probes');
  selectEntity({ robotId: 'r1' });
}

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
});

describe('ScreenExitRow — Back and Close (Task 7)', () => {
  it('holds two buttons, Back first and Close second, named from the content layer', () => {
    render(<ScreenExitRow />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([BACK, CLOSE]);
  });

  it('draws each button as its word alone: no lore line (Gate 2: words)', () => {
    render(<ScreenExitRow />);
    expect(backButton().textContent).toBe(BACK);
    expect(closeButton().textContent).toBe(CLOSE);
  });

  it('Back on a robot reached from the Probes list shows the Probes list, leaving the deck on the trail', () => {
    robotFromProbesList();
    render(<ScreenExitRow />);
    fireEvent.click(backButton());
    expect(ui()).toMatchObject({
      activeHubTile: 'robots',
      selectedRobotId: null,
      selectedCompanyId: null,
      allProbesSelected: false,
    });
    expect(ui().navTrail.map((stop) => stop.tile)).toEqual([null]);
  });

  it('Back twice walks two steps: robot, then the Probes list, then the deck', () => {
    robotFromProbesList();
    render(<ScreenExitRow />);
    fireEvent.click(backButton());
    fireEvent.click(backButton());
    expect(ui().activeHubTile).toBeNull();
    expect(ui().navTrail).toEqual([]);
  });

  it('Close on a robot reached from the Probes list shows the deck', () => {
    robotFromProbesList();
    render(<ScreenExitRow />);
    fireEvent.click(closeButton());
    expect(ui()).toMatchObject({ activeHubTile: null, selectedRobotId: null });
  });

  it('Close is a step: a Back after it returns to the robot that was closed', () => {
    robotFromProbesList();
    render(<ScreenExitRow />);
    fireEvent.click(closeButton());
    expect(ui().navTrail.at(-1)).toMatchObject({ tile: 'robots', robotId: 'r1' });
    fireEvent.click(backButton());
    expect(ui()).toMatchObject({ activeHubTile: 'robots', selectedRobotId: 'r1' });
  });

  it('Back shuts the phone sheet, as every navigation does', () => {
    robotFromProbesList();
    ui().setNavPanelOpen(true);
    render(<ScreenExitRow />);
    fireEvent.click(backButton());
    expect(ui().isNavPanelOpen).toBe(false);
  });
});
