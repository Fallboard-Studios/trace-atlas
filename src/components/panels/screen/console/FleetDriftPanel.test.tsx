import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';

// FleetDriftPanel reads/writes the global lfoDrift.globalFx slice directly via useAudioStore,
// whose setGlobalLfoDrift calls into lfoEngine — same real-AudioContext-throws-in-jsdom concern
// SignatureArrayDrawer.test.tsx already works around by mocking this module for RobotDriftPanel.
vi.mock('@/engine/lfoEngine', () => ({
  lfoEngine: {
    setGlobalRateDrift: vi.fn(),
    setGlobalDepthDrift: vi.fn(),
  },
}));

import { FleetDriftPanel } from './AudioRigDrawer';
import { useAudioStore } from '@/stores/audioStore';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';

/**
 * FleetDriftPanel — the merged eq3/filterLPF/filterHPF drift control (docs/specs/
 * FLEET_DRIFT_CONSOLIDATION.md Task 9), structurally mirroring RobotDriftPanel's own test
 * coverage in SignatureArrayDrawer.test.tsx exactly (render, onChange, driftHeldOff). Rendered
 * standalone here — no FleetParamsContent wrapper — same "test the leaf component directly"
 * convention AudioRigEffectPanel.test.tsx already establishes for its own sibling components.
 */
describe('FleetDriftPanel', () => {
  beforeEach(() => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, lfoDrift: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift } },
      driftHeldOff: false,
    }));
  });

  it('shows the store\'s current lfoDrift.globalFx values as a -100..100 percent, not the internal -1..1 fraction', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, lfoDrift: { ...s.globalAudio.lfoDrift, globalFx: { rateDrift: -0.2, depthDrift: 0.9 } } },
    }));
    render(<FleetDriftPanel />);
    expect(screen.getByRole('slider', { name: 'Rate Drift' }).getAttribute('aria-valuenow')).toBe('-20');
    expect(screen.getByRole('slider', { name: 'Depth Drift' }).getAttribute('aria-valuenow')).toBe('90');
  });

  it('dragging Rate Drift calls the store\'s setGlobalLfoDrift with \'globalFx\' and the dragged percent divided by 100, leaving depthDrift untouched', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, lfoDrift: { ...s.globalAudio.lfoDrift, globalFx: { rateDrift: 0, depthDrift: 0.5 } } },
    }));
    render(<FleetDriftPanel />);
    const rateSlider = screen.getByRole('slider', { name: 'Rate Drift' });
    rateSlider.focus();
    fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

    const newPercent = Number(rateSlider.getAttribute('aria-valuenow'));
    expect(newPercent).not.toBe(0); // the key press actually moved it
    expect(useAudioStore.getState().globalAudio.lfoDrift.globalFx.rateDrift).toBeCloseTo(newPercent / 100);
    expect(useAudioStore.getState().globalAudio.lfoDrift.globalFx.depthDrift).toBe(0.5);
  });

  it('both sliders render enabled when the drift tier is not held off', () => {
    render(<FleetDriftPanel />);
    for (const slider of [screen.getByRole('slider', { name: 'Rate Drift' }), screen.getByRole('slider', { name: 'Depth Drift' })]) {
      expect(slider.getAttribute('data-disabled')).toBeNull();
    }
  });

  it('greys out both sliders, with a label, while the drift tier is off — shows 0 not the real stored value — and restores them', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, lfoDrift: { ...s.globalAudio.lfoDrift, globalFx: { rateDrift: 0.4, depthDrift: -0.25 } } },
      driftHeldOff: true,
    }));
    render(<FleetDriftPanel />);
    const rateSlider = screen.getByRole('slider', { name: 'Rate Drift' });
    const depthSlider = screen.getByRole('slider', { name: 'Depth Drift' });
    expect(rateSlider.getAttribute('data-disabled')).not.toBeNull();
    expect(depthSlider.getAttribute('data-disabled')).not.toBeNull();
    expect(rateSlider.getAttribute('aria-valuenow')).toBe('0');
    expect(depthSlider.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('Held off by Audio Load')).toBeTruthy();
    expect(rateSlider.closest('.audio-rig-drawer__param-row')?.classList.contains('sc-held-off')).toBe(true);

    act(() => useAudioStore.setState({ driftHeldOff: false }));

    const restoredRate = screen.getByRole('slider', { name: 'Rate Drift' });
    const restoredDepth = screen.getByRole('slider', { name: 'Depth Drift' });
    expect(restoredRate.getAttribute('aria-valuenow')).toBe('40');
    expect(restoredDepth.getAttribute('aria-valuenow')).toBe('-25');
    expect(restoredRate.closest('.audio-rig-drawer__param-row')?.classList.contains('sc-held-off')).toBe(false);
    expect(screen.queryByText('Held off by Audio Load')).toBeNull();
  });

  it('uses the "Fleet Drift" panel label from LFO_DRIFT_GROUPS\' own globalFx entry', () => {
    const { container } = render(<FleetDriftPanel />);
    expect(within(container).getByText('Fleet Drift')).toBeTruthy();
  });
});
