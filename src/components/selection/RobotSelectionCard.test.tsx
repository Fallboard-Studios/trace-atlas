import { Profiler } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

// Exposes VoxelTrack's own timelineKeyPrefix prop as a data attribute — real GSAP/CabinetBox
// internals aren't relevant here, only whether two simultaneously-rendered cards' battery
// sliders get distinct timelineMap keys (src/animation/timelineMap.ts is a single module-global
// Map; VoxelTrack.tsx's own doc comment requires this prefix be "unique per-slider-instance").
vi.mock('@/components/ui/controls/VoxelTrack', () => ({
  VoxelTrack: ({ timelineKeyPrefix }: { timelineKeyPrefix: string }) => (
    <div data-testid="voxel-track" data-timeline-key-prefix={timelineKeyPrefix} />
  ),
}));

import { RobotSelectionCard } from './RobotSelectionCard';
import { getRobotGem } from '@/components/robot/gem/polygon';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { JOB_TYPE_LABELS, UNASSIGNED_JOB_LABEL, DOCKING_STATE_LABELS, AUDIBILITY_LABELS } from '@/data/robotSelectionConfig';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    name: 'Unit One',
    identityColor: '#428d95',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
      filterFreq: 0,
      waveform: 'sine',
    },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 72.4,
    gemSeed: 20261004,
    ...overrides,
  } as Robot;
}

const localeId = getActiveLocaleId();

/** Seeds the store with the given robot (overrides layered onto makeRobot's defaults) and renders
 *  RobotSelectionCard by id — the component now looks its own robot up from the store rather than
 *  receiving it as a prop (docs/todo/backlog.md #27 follow-up, 2026-09-15), so every test needs a
 *  real robot in the store first. Returns the render result plus the seeded robot for convenience. */
function renderCard(overrides: Partial<Robot> = {}) {
  const robot = makeRobot(overrides);
  useLocaleStore.getState().addRobot(localeId, robot);
  return { robot, ...render(<RobotSelectionCard robotId={robot.id} />) };
}

describe('RobotSelectionCard', () => {
  afterEach(() => {
    cleanup();
    useUIStore.getState().selectRobot(null);
    useUIStore.getState().setActiveLocaleLocalTime(null);
    useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
    useAudioStore.setState({ soundingRobotIds: [] });
  });

  it("renders the robot's name", () => {
    renderCard({ name: 'Unit One' });
    expect(screen.getByText('Unit One')).toBeTruthy();
  });

  it('falls back to the robot id when it has no name', () => {
    renderCard({ name: undefined, id: 'unnamed-1' });
    expect(screen.getByText('unnamed-1')).toBeTruthy();
  });

  it("renders the assigned job's human label when job is set", () => {
    renderCard({ job: 'acousticSurvey' });
    expect(screen.getByText(JOB_TYPE_LABELS.acousticSurvey.humanLabel)).toBeTruthy();
  });

  it.each(['salvage', 'maintenance'] as const)("renders the new %s job's human label (Phase 43 Task 4)", (job) => {
    renderCard({ job });
    expect(screen.getByText(JOB_TYPE_LABELS[job].humanLabel)).toBeTruthy();
    expect(screen.queryByText(UNASSIGNED_JOB_LABEL.humanLabel)).toBeNull();
  });

  it('renders "Unassigned" when the robot has no job', () => {
    renderCard({ job: undefined });
    expect(screen.getByText(UNASSIGNED_JOB_LABEL.humanLabel)).toBeTruthy();
  });

  it('renders battery level rounded to the nearest whole percent', () => {
    renderCard({ batteryLevel: 72.4 });
    expect(screen.getByText('72%')).toBeTruthy();
  });

  it('renders the docking state as part of the combined "Docking · Status" line, not standalone', () => {
    renderCard({ docking: 'docked', audioMode: 'none' });
    expect(screen.getByText(`${DOCKING_STATE_LABELS.docked.humanLabel} · ${AUDIBILITY_LABELS.emitting.humanLabel}`)).toBeTruthy();
  });

  it('renders Battery as the read-only SliderLinear (Roadmap 15.1) — role="status", not role="slider" — with its label kept', () => {
    const { container } = renderCard({ batteryLevel: 72.4 });
    const readout = container.querySelector('[data-readonly="true"]');
    expect(readout).not.toBeNull();
    expect(readout!.getAttribute('role')).toBe('status');
    expect(readout!.textContent).toContain('72%');
    expect(readout!.textContent).toContain('Battery Data');
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('gives each card its own unique VoxelTrack timeline-key prefix for the battery slider — no cross-robot GSAP timeline collisions (found in code review)', () => {
    const r1 = makeRobot({ id: 'r1' });
    const r2 = makeRobot({ id: 'r2' });
    useLocaleStore.getState().addRobot(localeId, r1);
    useLocaleStore.getState().addRobot(localeId, r2);
    const { container } = render(
      <ul>
        <RobotSelectionCard robotId="r1" />
        <RobotSelectionCard robotId="r2" />
      </ul>,
    );
    const prefixes = Array.from(container.querySelectorAll('[data-testid="voxel-track"]')).map(
      (el) => el.getAttribute('data-timeline-key-prefix'),
    );
    expect(prefixes).toHaveLength(2);
    expect(new Set(prefixes).size).toBe(2);
  });

  it('renders no AudioStatusBadge dot anywhere in the card — replaced by the combined status line', () => {
    const { container } = renderCard();
    expect(container.querySelector('.audio-status-badge')).toBeNull();
  });

  it('renders Name/Job/Docking·Status as bare text — no DualLabel lore/human caption anywhere in the top region', () => {
    renderCard();
    expect(screen.queryByText('ROBOT IDENTIFIER')).toBeNull();
    expect(screen.queryByText('ASSIGNED PROTOCOL')).toBeNull();
    expect(screen.queryByText('DOCKING STATE')).toBeNull();
  });

  describe('audibility status ("Docking · Status" line, true audibility per isRobotAudible)', () => {
    it('reads "<Docking> · Emitting" for an audible robot (audioMode none, nobody soloed)', () => {
      renderCard({ docking: 'active', audioMode: 'none' });
      expect(screen.getByText(`Active · ${AUDIBILITY_LABELS.emitting.humanLabel}`)).toBeTruthy();
    });

    it('reads "<Docking> · Disabled" for this robot\'s own audioMode mute', () => {
      renderCard({ docking: 'active', audioMode: 'mute' });
      expect(screen.getByText(`Active · ${AUDIBILITY_LABELS.disabled.humanLabel}`)).toBeTruthy();
    });

    it('reads Disabled when ANOTHER robot in the same locale is soloed, even though this one\'s own audioMode is none', () => {
      const robot = makeRobot({ id: 'r1', audioMode: 'none' });
      const soloRobot = makeRobot({ id: 'r2', audioMode: 'solo' });
      useLocaleStore.getState().addRobot(localeId, robot);
      useLocaleStore.getState().addRobot(localeId, soloRobot);

      render(<RobotSelectionCard robotId="r1" />);
      expect(screen.getByText(`Active · ${AUDIBILITY_LABELS.disabled.humanLabel}`)).toBeTruthy();
    });

    it('reads Emitting for the soloed robot itself', () => {
      const soloRobot = makeRobot({ id: 'r2', audioMode: 'solo' });
      useLocaleStore.getState().addRobot(localeId, soloRobot);

      render(<RobotSelectionCard robotId="r2" />);
      expect(screen.getByText(`Active · ${AUDIBILITY_LABELS.emitting.humanLabel}`)).toBeTruthy();
    });

    describe('Audio Load budget: "Standing by"', () => {
      it('reads Standing by for an eligible robot outside the sounding set', () => {
        useAudioStore.setState({ soundingRobotIds: ['someone-else'] });
        renderCard({ docking: 'active', audioMode: 'none' });
        expect(screen.getByText(`Active · ${AUDIBILITY_LABELS.limited.humanLabel}`)).toBeTruthy();
        expect(screen.queryByText(/Emitting/)).toBeNull();
      });

      it('reads Emitting for a robot in the sounding set', () => {
        useAudioStore.setState({ soundingRobotIds: ['r1', 'someone-else'] });
        renderCard({ id: 'r1', audioMode: 'none' });
        expect(screen.getByText(`Active · ${AUDIBILITY_LABELS.emitting.humanLabel}`)).toBeTruthy();
      });

      it('still reads Disabled for a muted robot that is not in the set', () => {
        useAudioStore.setState({ soundingRobotIds: ['someone-else'] });
        renderCard({ audioMode: 'mute' });
        expect(screen.getByText(`Active · ${AUDIBILITY_LABELS.disabled.humanLabel}`)).toBeTruthy();
      });

      it('reads Emitting while the sounding list is empty (budget not running: Full is unchanged)', () => {
        useAudioStore.setState({ soundingRobotIds: [] });
        renderCard({ audioMode: 'none' });
        expect(screen.getByText(`Active · ${AUDIBILITY_LABELS.emitting.humanLabel}`)).toBeTruthy();
      });

      it('updates live when a slot frees and the robot is admitted, and when it is evicted again', () => {
        useAudioStore.setState({ soundingRobotIds: ['other'] });
        renderCard({ id: 'r1', audioMode: 'none' });
        expect(screen.getByText(/Standing by/)).toBeTruthy();

        act(() => useAudioStore.setState({ soundingRobotIds: ['other', 'r1'] }));
        expect(screen.getByText(/Emitting/)).toBeTruthy();

        act(() => useAudioStore.setState({ soundingRobotIds: ['other'] }));
        expect(screen.getByText(/Standing by/)).toBeTruthy();
      });

      it('does not re-render when an UNRELATED robot enters or leaves the sounding set', () => {
        useAudioStore.setState({ soundingRobotIds: ['r1', 'other-a'] });
        const commits = { count: 0 };
        const robot = makeRobot({ id: 'r1', audioMode: 'none' });
        useLocaleStore.getState().addRobot(localeId, robot);
        render(
          <Profiler id="card" onRender={() => { commits.count++; }}>
            <RobotSelectionCard robotId="r1" />
          </Profiler>,
        );
        const initial = commits.count;

        act(() => useAudioStore.setState({ soundingRobotIds: ['r1', 'other-a', 'other-b'] })); // another robot admitted
        act(() => useAudioStore.setState({ soundingRobotIds: ['r1', 'other-b'] })); // another robot leaves

        expect(commits.count).toBe(initial);
      });
    });
  });

  it('clicking the card selects the robot', () => {
    renderCard({ id: 'r1' });
    fireEvent.click(screen.getByRole('button'));
    expect(useUIStore.getState().selectedRobotId).toBe('r1');
  });

  // Bugfix, found in code review (docs/tasks/NAV_LAYOUT_REWRITE.md work) — this card calls
  // selectRobot directly, outside the nav tree's own select() (which always follows it with a
  // fresh setSelectedSection call). A section left open on a previously-viewed robot used to leak
  // onto whichever robot was picked next from this list, showing its content leaf immediately
  // instead of RobotDisplaySection. Fixed at the uiStore.selectRobot level (see its own comment) —
  // this guards the browse-list entry point specifically.
  it('clicking the card clears a section left open on a previously-viewed robot', () => {
    useUIStore.getState().setSelectedSection('volume');
    renderCard({ id: 'r1' });
    fireEvent.click(screen.getByRole('button'));
    expect(useUIStore.getState().selectedSection).toBeNull();
  });

  it('pressing Enter on the card selects the robot', () => {
    renderCard({ id: 'r1' });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(useUIStore.getState().selectedRobotId).toBe('r1');
  });

  it('pressing Space on the card selects the robot', () => {
    renderCard({ id: 'r1' });
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(useUIStore.getState().selectedRobotId).toBe('r1');
  });

  it('is not the Button primitive — it is a plain focusable role="button" element', () => {
    renderCard();
    const card = screen.getByRole('button');
    expect(card.tagName).not.toBe('BUTTON');
    expect(card.getAttribute('tabindex')).toBe('0');
  });

  it('moves the activation contract off the outer <li> and onto a nested top-region wrapper (Roadmap 15.2)', () => {
    const { container } = renderCard();
    const li = container.querySelector('li.robot-selection-card')!;
    expect(li.getAttribute('role')).toBeNull();
    expect(li.getAttribute('tabindex')).toBeNull();

    const top = screen.getByRole('button');
    expect(li.contains(top)).toBe(true);
    expect(top).not.toBe(li);
  });

  it('renders an avatar whose color is unaffected by activeLocaleLocalTime (ignoreDaylight passed through)', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);

    useUIStore.getState().setActiveLocaleLocalTime(12);
    const { container: noon, unmount } = render(<RobotSelectionCard robotId={robot.id} />);
    const noonFill = noon.querySelector('path')?.getAttribute('fill');
    unmount();

    useUIStore.getState().setActiveLocaleLocalTime(0);
    const { container: midnight } = render(<RobotSelectionCard robotId={robot.id} />);
    const midnightFill = midnight.querySelector('path')?.getAttribute('fill');

    expect(noonFill).not.toBeNull();
    expect(midnightFill).toBe(noonFill);
  });

  it('draws no halo at all — cards never spawn/despawn orbiters, so the halo never appears (amendment, 2026-10-06)', () => {
    const robot = makeRobot({ masterVolume: 0.7 });
    useLocaleStore.getState().addRobot(localeId, robot);
    const { container } = render(<RobotSelectionCard robotId={robot.id} />);
    expect(container.querySelector('ellipse.gem__halo')).toBeNull();
    expect(container.querySelector('radialGradient')).toBeNull();
    expect(container.querySelector('.gem__ripple')).toBeNull();
    expect(container.querySelector('.gem__strip[data-line="top"]')).not.toBeNull();
  });

  // Phase 36's fixed '-40 -52 176 176' viewBox and Phase 37's hide-the-greebles card test were
  // superseded in Phase 39 Task 8: the card now fits each gem robot to its own canvas at scale 1
  // (the framing tests below), and gem robots have no greebles.

  it.each([1, 2])('frames a width-factor-%s robot to its own canvas, letterboxed (Phase 39 Task 8)', (factor) => {
    let seed = 0;
    while (getRobotGem(seed).widthFactor !== factor) seed++;
    const { container } = renderCard({ gemSeed: seed });
    const avatar = container.querySelector('svg.robot-selection-card__avatar')!;
    expect(avatar.getAttribute('viewBox')).toBe(`0 0 ${80 * factor} 80`);
    expect(avatar.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('draws the card robot at scale 1, so even the largest robot\'s orbiters stay inside the tile', () => {
    const { container } = renderCard({ octaveRange: [1, 3], audioAttributes: { adsr: { attack: 0, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' } });
    expect(container.querySelector('.robot-selection-card__avatar g.gem')!.getAttribute('transform')).toContain('scale(1)');
  });

  it('shows the gem body on the card avatar, both Mids included (Phase 39 Task 7)', () => {
    const { container } = renderCard();
    expect(container.querySelector('.robot-selection-card__avatar .gem')).not.toBeNull();
    expect(container.querySelector('.gem__mid--left')).not.toBeNull();
    expect(container.querySelector('.gem__mid--right')).not.toBeNull();
    expect(container.querySelector('.socket, .greeble')).toBeNull();
  });

  it('a density-80 robot shows 4 orbiters, density-10 shows 1; viewBox stays 0 0 80k 80 (Phase 40 Task 7)', () => {
    const { container: low } = renderCard({ id: 'low-density', rhythmicDensity: 10 });
    expect(low.querySelectorAll('.gem__orbiter')).toHaveLength(1);

    const { container: high } = renderCard({ id: 'high-density', rhythmicDensity: 80 });
    expect(high.querySelectorAll('.gem__orbiter')).toHaveLength(4);
    const avatar = high.querySelector('svg.robot-selection-card__avatar')!;
    expect(avatar.getAttribute('viewBox')).toBe(`0 0 ${80 * getRobotGem(20261004).widthFactor} 80`);
  });

  it('the card avatar is static — renders only the seeded count, not all four docked copies (Phase 40 amendment)', () => {
    const { container } = renderCard({ rhythmicDensity: 10 }); // DEFAULT count 1
    expect(container.querySelectorAll('.gem__orbiter')).toHaveLength(1);
  });

  it("has an accessible name matching the robot's name", () => {
    renderCard({ name: 'Unit One' });
    expect(screen.getByRole('button', { name: 'Unit One' })).toBeTruthy();
  });

  describe('company assignment (Roadmap Phase 10, converted to RadioButton by 10.5)', () => {
    it('defaults to "Freelance" selected for an unassigned robot', () => {
      renderCard({ companyId: undefined });
      expect(screen.getByRole('radio', { name: 'Freelance' }).getAttribute('aria-checked')).toBe('true');
    });

    it("shows the assigned company's option selected when the robot belongs to one", () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      renderCard({ id: 'r1', companyId: 'c1' });

      expect(screen.getByRole('radio', { name: 'Iron Consortium' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('radio', { name: 'Freelance' }).getAttribute('aria-checked')).toBe('false');
    });

    // docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.3 — each company option carries its own
    // color; Freelance keeps the ambient fallback (the robot's own identityColor via the <li>).
    it("shows the company's own color on its option, and no color on Freelance", () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
      renderCard({ id: 'r1', companyId: undefined });

      expect(screen.getByRole('radio', { name: 'Iron Consortium' }).style.getPropertyValue('--color-accent-a')).toBe('#4f6d7a');
      expect(screen.getByRole('radio', { name: 'Freelance' }).getAttribute('style')).toBeNull();
    });

    it("selecting a company calls assignRobotToCompany with that company's id", () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
      const assignSpy = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      renderCard({ id: 'r1', companyId: undefined });

      fireEvent.click(screen.getByRole('radio', { name: 'Iron Consortium' }));

      expect(assignSpy).toHaveBeenCalledWith(localeId, 'r1', 'c1');
    });

    it('selecting "Freelance" calls assignRobotToCompany with null', () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'] });
      const assignSpy = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      renderCard({ id: 'r1', companyId: 'c1' });

      fireEvent.click(screen.getByRole('radio', { name: 'Freelance' }));

      expect(assignSpy).toHaveBeenCalledWith(localeId, 'r1', null);
    });

    // Replaces the old pair of "trigger" + "portaled option" double-fire tests — RadioButton has
    // no separate trigger/portal step, so there's exactly one interaction to guard.
    it('clicking a company radio option does not also select the robot (no nested-interactive double-fire)', () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
      renderCard({ id: 'r1' });

      fireEvent.click(screen.getByRole('radio', { name: 'Iron Consortium' }));

      expect(useUIStore.getState().selectedRobotId).toBeNull();
    });

    it('clicking elsewhere on the card still selects the robot as before', () => {
      renderCard({ id: 'r1', name: 'Unit One' });

      fireEvent.click(screen.getByText('Unit One'));

      expect(useUIStore.getState().selectedRobotId).toBe('r1');
    });
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 13) — the card's own
  // root carries the robot's seeded identity color.
  describe('robot color scoping', () => {
    it("scopes the card root to the robot's own identityColor", () => {
      const { container } = renderCard({ identityColor: '#68cb97' });
      const root = container.querySelector('.robot-selection-card') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#68cb97');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#68cb97');
    });

    it('gives two different robots two different card colors', () => {
      const { container: containerA, unmount } = renderCard({ id: 'r1', identityColor: '#cd5e57' });
      const colorA = (containerA.querySelector('.robot-selection-card') as HTMLElement).style.getPropertyValue('--color-accent-a');
      unmount();

      const { container: containerB } = renderCard({ id: 'r2', identityColor: '#7a5484' });
      const colorB = (containerB.querySelector('.robot-selection-card') as HTMLElement).style.getPropertyValue('--color-accent-a');

      expect(colorA).toBe('#cd5e57');
      expect(colorB).toBe('#7a5484');
      expect(colorA).not.toBe(colorB);
    });
  });
});
