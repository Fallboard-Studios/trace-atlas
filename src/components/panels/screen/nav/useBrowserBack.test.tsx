import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';

import { back, goHome, selectBranch, selectEntity } from './navActions';
import { useBrowserBack } from './useBrowserBack';
import { useUIStore, DEFAULT_FLEET_PARAMS_SECTION, type NavStop } from '@/stores/uiStore';

/*
 * The browser's Back (docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.6, §4, §7.1 C1–C3; docs/tasks Task 10): a press
 * that lands off the guard runs back() and returns to the guard with history.forward(); with nothing to step (the
 * power off, or the trail empty) it passes the press on with history.back(), which leaves the app.
 */

const ui = () => useUIStore.getState();

const GUARD = { traceAtlasNav: 'guard' };

function stop(overrides: Partial<NavStop> = {}): NavStop {
  return {
    tile: null,
    robotId: null,
    companyId: null,
    allProbes: false,
    section: null,
    subsection: null,
    fleetSection: DEFAULT_FLEET_PARAMS_SECTION,
    fleetSubsection: null,
    ...overrides,
  };
}

/** The deck, then the Probes list, then (showing now) robot r1. */
function twoStopsDeep(isPoweredOn = true) {
  useUIStore.setState({
    isPoweredOn,
    activeHubTile: 'robots',
    selectedRobotId: 'r1',
    expandedTopLevelBranch: null,
    navTrail: [stop(), stop({ tile: 'robots' })],
  });
}

function Host() {
  useBrowserBack();
  return null;
}

/** A Back press that lands on the entry behind the guard (or on any non-guard entry). */
function press(state: unknown = null) {
  window.dispatchEvent(new PopStateEvent('popstate', { state }));
}

let historyBack: ReturnType<typeof vi.spyOn>;
let historyForward: ReturnType<typeof vi.spyOn>;
let pushState: ReturnType<typeof vi.spyOn>;

const START_URL = window.location.href;

beforeEach(() => {
  useUIStore.getState().resetNav();
  useUIStore.setState({ isPoweredOn: false });
  window.history.replaceState(null, '', START_URL);
  historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  historyForward = vi.spyOn(window.history, 'forward').mockImplementation(() => {});
  // Calls through, so history.state carries the marker after a push, as in a browser.
  pushState = vi.spyOn(window.history, 'pushState');
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', START_URL);
});

describe('useBrowserBack — a press (Task 10)', () => {
  it('power on, two stops: one press steps the trail once and returns to the guard with one forward()', () => {
    twoStopsDeep();
    render(<Host />);

    press();

    expect(ui().navTrail).toEqual([stop()]);
    expect(ui()).toMatchObject({ activeHubTile: 'robots', selectedRobotId: null, expandedTopLevelBranch: 'probes' });
    expect(historyForward).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();
  });

  it('power on, one stop: the press runs back() to the deck and still returns to the guard', () => {
    useUIStore.setState({ isPoweredOn: true, activeHubTile: 'robots', selectedRobotId: 'r1', navTrail: [stop()] });
    render(<Host />);

    press();

    expect(ui().navTrail).toEqual([]);
    expect(ui().activeHubTile).toBeNull();
    expect(historyForward).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();
  });

  it('power on, trail empty: the press is passed on with one history.back() and nothing changes', () => {
    useUIStore.setState({ isPoweredOn: true, activeHubTile: 'audioRig', fleetParamsSection: 'output' });
    const before = { ...ui() };
    render(<Host />);

    press();

    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(historyForward).not.toHaveBeenCalled();
    expect(ui()).toMatchObject({ activeHubTile: 'audioRig', fleetParamsSection: 'output', navTrail: [] });
    expect(ui()).toEqual(before);
  });

  it('power off, two stops: the press is passed on with one history.back() and the trail stands (spec §7.2 Q1)', () => {
    twoStopsDeep(false);
    const trail = ui().navTrail;
    render(<Host />);

    press();

    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(historyForward).not.toHaveBeenCalled();
    expect(ui().navTrail).toBe(trail);
    expect(ui().selectedRobotId).toBe('r1');
  });

  it('a press that lands on the guard (our own forward(), or the Forward button) changes nothing and calls nothing (spec §7.2 Q2)', () => {
    twoStopsDeep();
    const trail = ui().navTrail;
    render(<Host />);

    press({ ...GUARD, other: 1 });

    expect(ui().navTrail).toBe(trail);
    expect(ui().selectedRobotId).toBe('r1');
    expect(historyBack).not.toHaveBeenCalled();
    expect(historyForward).not.toHaveBeenCalled();
  });

  it('a state with some other traceAtlasNav value is not the guard: the press steps', () => {
    twoStopsDeep();
    render(<Host />);

    press({ traceAtlasNav: 'something else' });

    expect(ui().navTrail).toHaveLength(1);
    expect(historyForward).toHaveBeenCalledTimes(1);
  });

  it('five presses walk five steps, one each, and the sixth passes on', () => {
    useUIStore.setState({
      isPoweredOn: true,
      activeHubTile: 'robots',
      selectedRobotId: 'r6',
      navTrail: ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => stop({ tile: 'robots', robotId: id })),
    });
    render(<Host />);

    for (const expected of ['r5', 'r4', 'r3', 'r2', 'r1']) {
      press();
      expect(ui().selectedRobotId).toBe(expected);
    }
    expect(ui().navTrail).toEqual([]);
    expect(historyForward).toHaveBeenCalledTimes(5);
    expect(historyBack).not.toHaveBeenCalled();

    press();

    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(ui().selectedRobotId).toBe('r1');
  });

  it('after unmount a press changes nothing and calls nothing', () => {
    twoStopsDeep();
    const trail = ui().navTrail;
    const { unmount } = render(<Host />);
    unmount();

    press();

    expect(ui().navTrail).toBe(trail);
    expect(historyBack).not.toHaveBeenCalled();
    expect(historyForward).not.toHaveBeenCalled();
  });

  it('a throwing forward() is caught: the step stands and nothing escapes the listener', () => {
    historyForward.mockImplementation(() => {
      throw new Error('sandboxed');
    });
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    twoStopsDeep();
    render(<Host />);

    press();

    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
    expect(ui().navTrail).toHaveLength(1);
  });

  it('a throwing back() is caught too', () => {
    historyBack.mockImplementation(() => {
      throw new Error('sandboxed');
    });
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    useUIStore.setState({ isPoweredOn: true });
    render(<Host />);

    press();

    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
    expect(historyBack).toHaveBeenCalledTimes(1);
  });
});

describe('useBrowserBack — the guard entry (Task 11)', () => {
  it('the first step from an empty trail pushes one guard, with the marker and the current URL', () => {
    window.history.replaceState(null, '', '/trace-atlas/?w=abc&load=0.5#here');
    const href = window.location.href;
    useUIStore.setState({ isPoweredOn: true });
    render(<Host />);

    selectEntity({ robotId: 'r1' });

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledWith(GUARD, '', href);
    expect(window.history.state).toEqual(GUARD);
    expect(window.location.href).toBe(href);
  });

  it('the push keeps the existing history.state fields', () => {
    window.history.replaceState({ boot: 1, traceAtlasNav: 'other' }, '', START_URL);
    useUIStore.setState({ isPoweredOn: true });
    render(<Host />);

    selectBranch('fleetParams');

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ boot: 1, ...GUARD });
  });

  it('a history.state that is not an object is replaced by the marker alone', () => {
    window.history.replaceState('boot', '', START_URL);
    useUIStore.setState({ isPoweredOn: true });
    render(<Host />);

    selectBranch('probes');

    expect(window.history.state).toEqual(GUARD);
  });

  it('later steps push none while the current entry is the guard', () => {
    useUIStore.setState({ isPoweredOn: true });
    render(<Host />);

    selectBranch('probes');
    selectEntity({ robotId: 'r1' });
    selectEntity({ companyId: 'c1' });
    goHome();

    expect(ui().navTrail).toHaveLength(4);
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('steps on the trail and the current entry not a guard (the known hole): the next step pushes one', () => {
    twoStopsDeep();
    render(<Host />);

    selectBranch('fleetParams');

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual(GUARD);
  });

  it('no push from the popstate handler: the step it runs leaves steps on the trail, yet nothing is pushed', () => {
    useUIStore.setState({
      isPoweredOn: true,
      activeHubTile: 'robots',
      selectedRobotId: 'r3',
      navTrail: [stop(), stop({ tile: 'robots', robotId: 'r1' }), stop({ tile: 'robots', robotId: 'r2' })],
    });
    render(<Host />);

    press();

    expect(ui().navTrail).toHaveLength(2);
    expect(pushState).not.toHaveBeenCalled();
  });

  it('after a press, the next on-screen step still pushes when the entry is not a guard', () => {
    twoStopsDeep();
    render(<Host />);
    press();

    selectEntity({ robotId: 'r9' });

    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('no push with the power off', () => {
    render(<Host />);

    selectEntity({ robotId: 'r1' });

    expect(ui().navTrail).toHaveLength(1);
    expect(pushState).not.toHaveBeenCalled();
  });

  it('no push when a change leaves the trail empty (an on-screen Back to the deck, a new world)', () => {
    useUIStore.setState({ isPoweredOn: true, activeHubTile: 'robots', selectedRobotId: 'r1', navTrail: [stop()] });
    render(<Host />);

    back();
    selectEntity({ robotId: 'r1' });
    window.history.replaceState(null, '', START_URL);
    pushState.mockClear();
    ui().resetNav();

    expect(ui().navTrail).toEqual([]);
    expect(pushState).not.toHaveBeenCalled();
  });

  it('powering on with steps on the trail and no guard pushes one (the rocker is the gesture)', () => {
    twoStopsDeep(false);
    render(<Host />);

    ui().setPowerOn();

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual(GUARD);
  });

  it('a store write that is not a step (the clock, a tab) pushes nothing, even in the known hole', () => {
    twoStopsDeep();
    render(<Host />);

    ui().setActiveLocaleLocalTime(1234);
    ui().setActiveLocaleTemperature(12);
    ui().setSelectedSection('source');

    expect(pushState).not.toHaveBeenCalled();
  });

  it('after unmount a step pushes nothing', () => {
    useUIStore.setState({ isPoweredOn: true });
    const { unmount } = render(<Host />);
    unmount();

    selectEntity({ robotId: 'r1' });

    expect(pushState).not.toHaveBeenCalled();
  });

  it('a throwing pushState is caught: the step stands', () => {
    pushState.mockImplementation(() => {
      throw new Error('sandboxed');
    });
    useUIStore.setState({ isPoweredOn: true });
    render(<Host />);

    expect(() => selectEntity({ robotId: 'r1' })).not.toThrow();
    expect(ui().selectedRobotId).toBe('r1');
    expect(ui().navTrail).toHaveLength(1);
  });
});
