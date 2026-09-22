import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsContent } from './SettingsContent';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';

// SectorSettingsDrawer/AudioLoadPanel each have their own full test suite
// (SectorSettingsDrawer.test.tsx, AudioLoadPanel.test.tsx) — this file is about
// SettingsContent's own leaf-routing, not re-testing their content. Also avoids pulling in real
// Tone.js/AudioEngine paths that throw in this jsdom env, same boundary ConsolePanel.test.tsx
// already draws.
vi.mock('../../console/SectorSettingsDrawer', () => ({
  SectorSettingsDrawer: () => <div data-testid="sector-settings-drawer-stub" />,
  default: () => <div data-testid="sector-settings-drawer-stub" />,
}));
vi.mock('../../console/AudioLoadPanel', () => ({
  AudioLoadPanel: () => <div data-testid="audio-load-panel-stub" />,
  default: () => <div data-testid="audio-load-panel-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();

describe('SettingsContent — routes Settings leaves to their content (docs/tasks/NAV_LAYOUT_REWRITE.md Task 11)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useAudioStore.setState({ volume: 0.6, isMuted: false });
    useUIStore.getState().setPowerOn();
  });

  it('shows the volume slider, live-bound to audioStore.volume (0-100%, 1% steps), when selectedSettingsLeaf is "volume"', () => {
    useUIStore.getState().setSelectedSettingsLeaf('volume');
    render(<SettingsContent />);

    const slider = screen.getByRole('slider', { name: /volume/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('60');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
  });

  it('stepping the volume slider calls setVolume, observable as a real store update', () => {
    useUIStore.getState().setSelectedSettingsLeaf('volume');
    render(<SettingsContent />);

    const slider = screen.getByRole('slider', { name: /volume/i });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(useAudioStore.getState().volume).toBeGreaterThan(0.6);
  });

  it('disables the volume slider when powered off', () => {
    useUIStore.setState({ isPoweredOn: false });
    useUIStore.getState().setSelectedSettingsLeaf('volume');
    render(<SettingsContent />);

    expect(screen.getByRole('slider', { name: /volume/i }).getAttribute('data-disabled')).toBe('');
  });

  it('shows SectorSettingsDrawer when selectedSettingsLeaf is "sectorSettings"', () => {
    useUIStore.getState().setSelectedSettingsLeaf('sectorSettings');
    render(<SettingsContent />);
    expect(screen.getByTestId('sector-settings-drawer-stub')).toBeTruthy();
  });

  it('shows SectorSettingsDrawer as the default when no Settings leaf is selected yet (bare "Settings" click)', () => {
    render(<SettingsContent />);
    expect(screen.getByTestId('sector-settings-drawer-stub')).toBeTruthy();
  });
});

describe('SettingsContent — Tempo leaf (docs/tasks/NAV_LAYOUT_REWRITE.md Task 12)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useAudioStore.setState({ bpm: 72 });
    useUIStore.getState().setPowerOn();
    useUIStore.getState().setSelectedSettingsLeaf('tempo');
  });

  it('shows the BPM slider, live-bound to audioStore.bpm, showing the store value directly (no scaling)', () => {
    render(<SettingsContent />);
    const slider = screen.getByRole('slider', { name: /tempo/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('72');
  });

  it('dragging it calls setBPM directly with the dragged value — no conversion', () => {
    render(<SettingsContent />);
    const slider = screen.getByRole('slider', { name: /tempo/i });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(useAudioStore.getState().bpm).toBeGreaterThan(72);
  });

  it('renders exactly once — no duplicate Tempo slider left behind anywhere', () => {
    render(<SettingsContent />);
    expect(screen.getAllByRole('slider', { name: /tempo/i })).toHaveLength(1);
  });
});

describe('SettingsContent — Quality leaf (docs/tasks/NAV_LAYOUT_REWRITE.md Task 13)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useUIStore.getState().setSelectedSettingsLeaf('quality');
  });

  it('shows AudioLoadPanel when selectedSettingsLeaf is "quality"', () => {
    render(<SettingsContent />);
    expect(screen.getByTestId('audio-load-panel-stub')).toBeTruthy();
  });

  it('shows only AudioLoadPanel — no SectorSettingsDrawer fallback leaking through for this leaf', () => {
    render(<SettingsContent />);
    expect(screen.queryByTestId('sector-settings-drawer-stub')).toBeNull();
  });
});
