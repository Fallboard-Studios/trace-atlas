import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';

// The LFO Bank engine (docs/tasks/LFO_BANK.md Task 7/14) — setLfoBank (audioStore.ts) calls this
// module's setBankShape/setBankRate/setBankRateDrift/setBankDepthDrift directly; mocked for the
// same reason AudioRigEffectPanel.test.tsx already mocks it: the real module constructs a Tone
// node on first call, which throws without a real AudioContext.
vi.mock('../../../../engine/lfoBank', () => ({
  lfoEngine: {
    primeLfoBank: vi.fn(),
    setBankShape: vi.fn(),
    setBankRate: vi.fn(),
    setBankRateDrift: vi.fn(),
    setBankDepthDrift: vi.fn(),
    getBankSettings: vi.fn(),
    linkTarget: vi.fn(() => true),
    unlinkTarget: vi.fn(),
    disposeRobotLinks: vi.fn(),
    setDriftEnabled: vi.fn(),
    setFilterLinksEnabled: vi.fn(),
  },
}));

import { LfoBankLanePanel } from './LfoBankLanePanel';
import { useAudioStore } from '@/stores/audioStore';
import { DEFAULT_BANK_LFO } from '@/data/lfoConfig';

/**
 * LfoBankLanePanel (docs/tasks/LFO_BANK.md Task 15) — one lane's own Shape + Rate + Rate
 * Drift/Depth Drift pair, reading/writing audioStore.lfoBank[lane] directly (a rig-wide control,
 * not scoped to anything selected) — structurally mirrors FleetDriftPanel/RobotDriftPanel's own
 * test coverage (render, onChange, driftHeldOff), bound to lane 'b' throughout per the plan's own
 * acceptance criteria.
 */
describe('LfoBankLanePanel', () => {
  beforeEach(() => {
    useAudioStore.setState((s) => ({
      lfoBank: { ...s.lfoBank, b: { ...DEFAULT_BANK_LFO } },
      driftHeldOff: false,
    }));
  });

  it("shows lfoBank.b's current shape/rate, and rateDrift/depthDrift as -100..100 percent, not the internal -1..1 fraction", () => {
    useAudioStore.setState((s) => ({
      lfoBank: { ...s.lfoBank, b: { shape: 'square', rate: 3, rateDrift: -0.2, depthDrift: 0.9 } },
    }));
    render(<LfoBankLanePanel lane="b" />);
    expect(screen.getByRole('radio', { name: 'Square', checked: true })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('aria-valuenow')).toBe('3');
    expect(screen.getByRole('slider', { name: 'Rate Drift' }).getAttribute('aria-valuenow')).toBe('-20');
    expect(screen.getByRole('slider', { name: 'Depth Drift' }).getAttribute('aria-valuenow')).toBe('90');
  });

  it("choosing a shape calls setLfoBank('b', { shape })", () => {
    render(<LfoBankLanePanel lane="b" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sawtooth' }));
    expect(useAudioStore.getState().lfoBank.b.shape).toBe('sawtooth');
  });

  it("dragging Rate calls setLfoBank('b', { rate }) with the real Hz value, not divided", () => {
    useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, b: { ...s.lfoBank.b, rate: 1 } } }));
    render(<LfoBankLanePanel lane="b" />);
    const rateSlider = screen.getByRole('slider', { name: 'Rate' });
    rateSlider.focus();
    fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

    const newRate = Number(rateSlider.getAttribute('aria-valuenow'));
    expect(newRate).not.toBe(1);
    expect(useAudioStore.getState().lfoBank.b.rate).toBeCloseTo(newRate);
  });

  it("dragging Rate Drift calls setLfoBank('b', { rateDrift }) with the dragged percent divided by 100, leaving depthDrift untouched", () => {
    useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, b: { ...s.lfoBank.b, rateDrift: 0, depthDrift: 0.5 } } }));
    render(<LfoBankLanePanel lane="b" />);
    const rateDriftSlider = screen.getByRole('slider', { name: 'Rate Drift' });
    rateDriftSlider.focus();
    fireEvent.keyDown(rateDriftSlider, { key: 'ArrowRight' });

    const newPercent = Number(rateDriftSlider.getAttribute('aria-valuenow'));
    expect(newPercent).not.toBe(0);
    expect(useAudioStore.getState().lfoBank.b.rateDrift).toBeCloseTo(newPercent / 100);
    expect(useAudioStore.getState().lfoBank.b.depthDrift).toBe(0.5);
  });

  it("dragging Depth Drift calls setLfoBank('b', { depthDrift }) with the dragged percent divided by 100, leaving rateDrift untouched", () => {
    useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, b: { ...s.lfoBank.b, rateDrift: 0.5, depthDrift: 0 } } }));
    render(<LfoBankLanePanel lane="b" />);
    const depthDriftSlider = screen.getByRole('slider', { name: 'Depth Drift' });
    depthDriftSlider.focus();
    fireEvent.keyDown(depthDriftSlider, { key: 'ArrowRight' });

    const newPercent = Number(depthDriftSlider.getAttribute('aria-valuenow'));
    expect(newPercent).not.toBe(0);
    expect(useAudioStore.getState().lfoBank.b.depthDrift).toBeCloseTo(newPercent / 100);
    expect(useAudioStore.getState().lfoBank.b.rateDrift).toBe(0.5);
  });

  it('Shape and Rate render enabled, never greyed, regardless of driftHeldOff', () => {
    useAudioStore.setState({ driftHeldOff: true });
    render(<LfoBankLanePanel lane="b" />);
    const shapeGroup = screen.getByRole('group', { name: 'Shape' });
    expect(shapeGroup.getAttribute('data-disabled')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('data-disabled')).toBeNull();
  });

  it('both sliders render enabled when the drift tier is not held off', () => {
    render(<LfoBankLanePanel lane="b" />);
    for (const slider of [screen.getByRole('slider', { name: 'Rate Drift' }), screen.getByRole('slider', { name: 'Depth Drift' })]) {
      expect(slider.getAttribute('data-disabled')).toBeNull();
    }
  });

  it('greys out only the two drift sliders, with a label, while the drift tier is off — shows 0 not the real stored value — and restores them', async () => {
    useAudioStore.setState((s) => ({
      lfoBank: { ...s.lfoBank, b: { ...s.lfoBank.b, rateDrift: 0.4, depthDrift: -0.25 } },
      driftHeldOff: true,
    }));
    render(<LfoBankLanePanel lane="b" />);
    const rateDriftSlider = screen.getByRole('slider', { name: 'Rate Drift' });
    const depthDriftSlider = screen.getByRole('slider', { name: 'Depth Drift' });
    expect(rateDriftSlider.getAttribute('data-disabled')).not.toBeNull();
    expect(depthDriftSlider.getAttribute('data-disabled')).not.toBeNull();
    expect(rateDriftSlider.getAttribute('aria-valuenow')).toBe('0');
    expect(depthDriftSlider.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('Held off by Audio Load')).toBeTruthy();
    expect(rateDriftSlider.closest('.audio-rig-drawer__param-row')?.classList.contains('sc-held-off')).toBe(true);

    act(() => useAudioStore.setState({ driftHeldOff: false }));
    // SliderCenteredZero eases a non-drag value change over 250ms (Crawford's own request) — the
    // shared gsap mock (vitest.setup.ts) settles the tween's onComplete on the next microtask.
    await act(async () => { await Promise.resolve(); });

    const restoredRateDrift = screen.getByRole('slider', { name: 'Rate Drift' });
    const restoredDepthDrift = screen.getByRole('slider', { name: 'Depth Drift' });
    expect(restoredRateDrift.getAttribute('aria-valuenow')).toBe('40');
    expect(restoredDepthDrift.getAttribute('aria-valuenow')).toBe('-25');
    expect(restoredRateDrift.closest('.audio-rig-drawer__param-row')?.classList.contains('sc-held-off')).toBe(false);
    expect(screen.queryByText('Held off by Audio Load')).toBeNull();
  });

  it("uses lane b's own panel label from LFO_BANK_LANE_SCHEMAS (fleet.lfoBank.laneB — 'Companion LFO')", () => {
    const { container } = render(<LfoBankLanePanel lane="b" />);
    expect(within(container).getByText('Companion LFO')).toBeTruthy();
  });

  it('renders a different lane\'s own stored values for lane "d"', () => {
    useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, d: { shape: 'triangle', rate: 7, rateDrift: 0, depthDrift: 0 } } }));
    const { container } = render(<LfoBankLanePanel lane="d" />);
    expect(within(container).getByText('Overtone LFO')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('aria-valuenow')).toBe('7');
  });
});
