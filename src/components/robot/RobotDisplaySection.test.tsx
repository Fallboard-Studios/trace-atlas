import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Captures every `schema` prop the real RadioButton receives, without replacing its actual
// rendering — RadioButton is itself already React.memo-wrapped, so it can't be spied on via
// vi.fn the way a plain function export can (same reasoning as AudioSettingSection.test.tsx's own
// Lfo-schema capture for Task 1). The wrapper itself is a plain (non-memoized) function, so it
// also doubles as a reliable "did RobotDisplaySection's own render body execute" counter — it
// always runs whenever that body constructs a <RadioButton> element, regardless of whether the
// real memoized RadioButton underneath then bails on its own (unlike a marker delegated to a
// hook/utility call *inside* an already-memoized child, which can't tell the two apart — tried
// that first with resolveAccessibleName and found the battery SliderLinear's readOnly branch
// never calls it at all, and RadioButton's own call is exactly the thing this memoization can
// legitimately suppress).
const capturedCompanyAssignmentSchemas = vi.hoisted(() => [] as unknown[]);
vi.mock('@/components/ui/controls/RadioButton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/RadioButton')>();
  function RadioButtonSchemaCapture(props: ComponentProps<typeof actual.RadioButton>) {
    capturedCompanyAssignmentSchemas.push(props.schema);
    return <actual.RadioButton {...props} />;
  }
  return { ...actual, RadioButton: RadioButtonSchemaCapture };
});

import { RobotDisplaySection } from './RobotDisplaySection';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    name: 'Test Robot',
    state: 'idle',
    position: { x: 0, y: 0 },
    destination: null,
    direction: 'right',
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
    batteryLevel: 82,
    audioMode: 'none',
    job: { type: 'acousticSurvey', assignedAtMeasure: 0 },
    ...overrides,
  } as Robot;
}

describe('RobotDisplaySection', () => {
  const localeId = getActiveLocaleId();

  beforeEach(() => {
    useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
    useUIStore.getState().setActiveLocaleLocalTime(null);
    useAudioStore.setState({ soundingRobotIds: [] });
  });

  it('renders the same sunlight/time-agnostic robot avatar RobotSelectionCard uses (ignoreDaylight passed through)', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);

    useUIStore.getState().setActiveLocaleLocalTime(12);
    const { container: noon, unmount } = render(<RobotDisplaySection robot={robot} />);
    const noonPath = noon.querySelector('path');
    expect(noonPath).not.toBeNull();
    const noonFill = noonPath!.getAttribute('fill');
    unmount();

    useUIStore.getState().setActiveLocaleLocalTime(0);
    const { container: midnight, unmount: unmountMidnight } = render(<RobotDisplaySection robot={robot} />);
    const midnightPath = midnight.querySelector('path');
    expect(midnightPath).not.toBeNull();
    const midnightFill = midnightPath!.getAttribute('fill');
    unmountMidnight();

    expect(noonFill).not.toBeNull();
    expect(midnightFill).toBe(noonFill);
  });

  it('renders Name/Job/Docking/Status as plain text with no input/button role attached (Roadmap 15.3 grid)', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    const { container } = render(<RobotDisplaySection robot={robot} />);

    // Scoped to the component's own read-only value spans — Battery is no
    // longer one of these (see the dedicated read-only-slider test below).
    // makeRobot() defaults to audioMode: 'none' with no other robot in the
    // locale soloed, so Status reads "Emitting" (isRobotAudible).
    const values = Array.from(container.querySelectorAll('.robot-display-section__value')).map((el) => el.textContent);
    expect(values).toEqual(['Test Robot', 'Acoustic Survey', 'Active', 'Emitting']);

    container.querySelectorAll('.robot-display-section__value').forEach((el) => {
      expect(el.closest('button, input, [role="button"], [role="radio"], [role="switch"]')).toBeNull();
    });
  });

  describe('centered-avatar grid (Roadmap 15.3)', () => {
    it('keeps a DualLabel caption above each of Name/Job/Docking/Status — a deliberate divergence from 15.2\'s unlabeled card', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const { container } = render(<RobotDisplaySection robot={robot} />);

      const captions = Array.from(container.querySelectorAll('.sc-dual-label__human')).map((el) => el.textContent);
      expect(captions).toContain('Robot Name');
      expect(captions).toContain('Job Data');
      expect(captions).toContain('Docked Status');
      expect(captions).toContain('Status');
    });

    it('renders no .robot-display-section__row anywhere — retired in favor of the grid/field classes', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const { container } = render(<RobotDisplaySection robot={robot} />);

      expect(container.querySelectorAll('.robot-display-section__row').length).toBe(0);
      expect(container.querySelector('.robot-display-section__grid')).not.toBeNull();
    });

    it('reads "Emitting" for an audible robot (audioMode: none, no other robot soloed)', () => {
      const robot = makeRobot({ audioMode: 'none' });
      useLocaleStore.getState().addRobot(localeId, robot);
      render(<RobotDisplaySection robot={robot} />);

      expect(screen.getByText('Emitting')).toBeTruthy();
      expect(screen.queryByText('Disabled')).toBeNull();
    });

    it('reads "Disabled" for a muted robot', () => {
      const robot = makeRobot({ audioMode: 'mute' });
      useLocaleStore.getState().addRobot(localeId, robot);
      render(<RobotDisplaySection robot={robot} />);

      expect(screen.getByText('Disabled')).toBeTruthy();
      expect(screen.queryByText('Emitting')).toBeNull();
    });

    it('reads "Standing by" for an eligible robot the Audio Load budget is holding back, and "Emitting" once it is admitted', () => {
      const robot = makeRobot({ id: 'r1', audioMode: 'none' });
      useLocaleStore.getState().addRobot(localeId, robot);
      useAudioStore.setState({ soundingRobotIds: ['other'] });
      render(<RobotDisplaySection robot={robot} />);
      expect(screen.getByText('Standing by')).toBeTruthy();
      expect(screen.queryByText('Emitting')).toBeNull();

      act(() => useAudioStore.setState({ soundingRobotIds: ['other', 'r1'] }));
      expect(screen.getByText('Emitting')).toBeTruthy();
      expect(screen.queryByText('Standing by')).toBeNull();
    });

    it('still reads "Disabled" for a muted robot outside the sounding set, and "Emitting" while the list is empty', () => {
      const muted = makeRobot({ id: 'm1', audioMode: 'mute' });
      useLocaleStore.getState().addRobot(localeId, muted);
      useAudioStore.setState({ soundingRobotIds: ['other'] });
      const { unmount } = render(<RobotDisplaySection robot={muted} />);
      expect(screen.getByText('Disabled')).toBeTruthy();
      unmount();

      const audible = makeRobot({ id: 'a1', audioMode: 'none' });
      useLocaleStore.getState().addRobot(localeId, audible);
      useAudioStore.setState({ soundingRobotIds: [] });
      render(<RobotDisplaySection robot={audible} />);
      expect(screen.getByText('Emitting')).toBeTruthy();
    });

    it('flips to "Disabled" once another robot in the same locale is soloed, and back once that solo is cleared', () => {
      const robot = makeRobot({ id: 'r1', audioMode: 'none' });
      const otherRobot = makeRobot({ id: 'r2', audioMode: 'none' });
      useLocaleStore.getState().addRobot(localeId, robot);
      useLocaleStore.getState().addRobot(localeId, otherRobot);
      const { rerender } = render(<RobotDisplaySection robot={robot} />);
      expect(screen.getByText('Emitting')).toBeTruthy();

      act(() => {
        useLocaleStore.getState().updateRobot(localeId, otherRobot.id, { audioMode: 'solo' });
      });
      rerender(<RobotDisplaySection robot={robot} />);
      expect(screen.getByText('Disabled')).toBeTruthy();
      expect(screen.queryByText('Emitting')).toBeNull();

      act(() => {
        useLocaleStore.getState().updateRobot(localeId, otherRobot.id, { audioMode: 'none' });
      });
      rerender(<RobotDisplaySection robot={robot} />);
      expect(screen.getByText('Emitting')).toBeTruthy();
    });
  });

  describe('Battery and Company rows are unchanged by the 15.3 grid restructure (spec\'s Scope correction)', () => {
    it('Battery\'s SliderLinear still carries its own "Battery Data" DualLabel caption', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const { container } = render(<RobotDisplaySection robot={robot} />);

      const readout = container.querySelector('[data-readonly="true"]');
      expect(readout).not.toBeNull();
      expect(screen.getByText('Battery Data')).toBeTruthy();
    });

    it('Company\'s RadioButton still carries its own "Company" DualLabel caption, with no wrapping row div', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      const { container } = render(<RobotDisplaySection robot={robot} />);

      expect(screen.getByText('Company')).toBeTruthy();
      const radioButtonRoot = container.querySelector('.sc-radio-button');
      expect(radioButtonRoot).not.toBeNull();
      expect(radioButtonRoot!.closest('.robot-display-section__row')).toBeNull();
      expect(radioButtonRoot!.parentElement).toBe(container.querySelector('.robot-display-section'));
    });
  });

  it('renders Battery as a read-only SliderLinear readout (Roadmap 15.1), not a plain value span', () => {
    const robot = makeRobot({ batteryLevel: 82 });
    useLocaleStore.getState().addRobot(localeId, robot);
    const { container } = render(<RobotDisplaySection robot={robot} />);

    // role="status", not role="slider" — SliderLinear.readOnly's own contract
    // (docs/specs/SLIDER_LINEAR_READ_ONLY.md).
    const readout = container.querySelector('[data-readonly="true"]');
    expect(readout).not.toBeNull();
    expect(readout!.getAttribute('role')).toBe('status');
    expect(readout!.textContent).toContain('82%');
    expect(screen.queryByRole('slider')).toBeNull();

    // No plain '.robot-display-section__value' span duplicates it.
    const values = Array.from(container.querySelectorAll('.robot-display-section__value')).map((el) => el.textContent);
    expect(values).not.toContain('82%');
  });

  it('rounds a fractional battery level to the nearest whole percent, same as before this change', () => {
    const robot = makeRobot({ batteryLevel: 81.6 });
    useLocaleStore.getState().addRobot(localeId, robot);
    const { container } = render(<RobotDisplaySection robot={robot} />);

    const readout = container.querySelector('[data-readonly="true"]');
    expect(readout!.textContent).toContain('82%');
  });

  it('shows "Unassigned" when the robot has no job', () => {
    const robot = makeRobot({ job: undefined, docking: 'docked' });
    useLocaleStore.getState().addRobot(localeId, robot);
    render(<RobotDisplaySection robot={robot} />);
    expect(screen.getByText('Unassigned')).toBeTruthy();
  });

  it('renders no job-reassignment or docking-override control anywhere', () => {
    const robot = makeRobot();
    useLocaleStore.getState().addRobot(localeId, robot);
    render(<RobotDisplaySection robot={robot} />);

    expect(screen.queryByRole('combobox', { name: /job/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /docked|docking|departing|active/i })).toBeNull();
  });

  // Audio Setting/Volume/Volume-LFO assertions live in AudioSettingSection.test.tsx as of Task 13
  // (Roadmap Phase 10). As of docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 5, AudioSettingSection
  // itself is no longer rendered inside RobotDisplaySection at all — it's extracted out to
  // RobotOptionsTab as its own top-level Output panel; see RobotOptionsTab.test.tsx for the
  // wiring assertions this file used to carry.

  it('no longer renders AudioSettingSection\'s own controls — extracted to RobotOptionsTab (DIRECTIONAL_PANEL_WIRING Task 5)', () => {
    const robot = makeRobot({ audioMode: 'solo', masterVolume: 0.6 });
    useLocaleStore.getState().addRobot(localeId, robot);
    render(<RobotDisplaySection robot={robot} />);

    expect(screen.queryByRole('radio', { name: 'Solo' })).toBeNull();
    expect(screen.queryByRole('slider', { name: /volume/i })).toBeNull();
  });

  describe('company assignment (Roadmap Phase 10, converted to RadioButton by 10.5)', () => {
    it('defaults to "Freelance" selected for an unassigned robot', () => {
      const robot = makeRobot({ companyId: undefined });
      useLocaleStore.getState().addRobot(localeId, robot);
      render(<RobotDisplaySection robot={robot} />);

      expect(screen.getByRole('radio', { name: 'Freelance' }).getAttribute('aria-checked')).toBe('true');
    });

    it("shows the assigned company's option selected when the robot belongs to one", () => {
      const robot = makeRobot({ companyId: 'c1' });
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [robot.id] });
      useLocaleStore.getState().addRobot(localeId, robot);
      render(<RobotDisplaySection robot={robot} />);

      expect(screen.getByRole('radio', { name: 'Iron Consortium' }).getAttribute('aria-checked')).toBe('true');
    });

    it("selecting a company calls assignRobotToCompany with that company's id", () => {
      const robot = makeRobot({ companyId: undefined });
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const assignSpy = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      render(<RobotDisplaySection robot={robot} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Iron Consortium' }));

      expect(assignSpy).toHaveBeenCalledWith(localeId, robot.id, 'c1');
    });

    it('selecting "Freelance" calls assignRobotToCompany with null', () => {
      const robot = makeRobot({ companyId: 'c1' });
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [robot.id] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const assignSpy = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      render(<RobotDisplaySection robot={robot} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Freelance' }));

      expect(assignSpy).toHaveBeenCalledWith(localeId, robot.id, null);
    });
  });

  describe('React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 5)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((RobotDisplaySection as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with the exact same robot reference', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      capturedCompanyAssignmentSchemas.length = 0;
      const { rerender } = render(<RobotDisplaySection robot={robot} />);
      const callsAfterMount = capturedCompanyAssignmentSchemas.length;

      rerender(<RobotDisplaySection robot={robot} />);
      rerender(<RobotDisplaySection robot={robot} />);

      expect(capturedCompanyAssignmentSchemas.length).toBe(callsAfterMount);
    });

    it('documents a known limitation: DOES re-execute given a new robot object reference, even with identical field values — its sole prop is the whole robot object, not a narrowed value (spec §1.2.3)', () => {
      const robot = makeRobot();
      useLocaleStore.getState().addRobot(localeId, robot);
      capturedCompanyAssignmentSchemas.length = 0;
      const { rerender } = render(<RobotDisplaySection robot={robot} />);
      const callsAfterMount = capturedCompanyAssignmentSchemas.length;

      rerender(<RobotDisplaySection robot={{ ...robot }} />);

      expect(capturedCompanyAssignmentSchemas.length).toBeGreaterThan(callsAfterMount);
    });

    it('keeps companyAssignmentSchema the same reference across a re-render (even with a new robot reference) as long as companies has not changed', () => {
      const robot = makeRobot({ companyId: undefined });
      useLocaleStore.getState().addRobot(localeId, robot);
      capturedCompanyAssignmentSchemas.length = 0;
      const { rerender } = render(<RobotDisplaySection robot={robot} />);

      rerender(<RobotDisplaySection robot={{ ...robot }} />);

      expect(capturedCompanyAssignmentSchemas.length).toBeGreaterThanOrEqual(2);
      expect(capturedCompanyAssignmentSchemas[1]).toBe(capturedCompanyAssignmentSchemas[0]);
    });

    it('gives companyAssignmentSchema a new reference once companies actually changes', () => {
      const robot = makeRobot({ companyId: undefined });
      useLocaleStore.getState().addRobot(localeId, robot);
      capturedCompanyAssignmentSchemas.length = 0;
      const { rerender } = render(<RobotDisplaySection robot={robot} />);

      act(() => {
        useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: [] });
      });
      rerender(<RobotDisplaySection robot={{ ...robot }} />);

      expect(capturedCompanyAssignmentSchemas.length).toBeGreaterThanOrEqual(2);
      expect(capturedCompanyAssignmentSchemas[1]).not.toBe(capturedCompanyAssignmentSchemas[0]);
    });
  });
});
