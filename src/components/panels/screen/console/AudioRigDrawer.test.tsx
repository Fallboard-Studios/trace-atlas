import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AudioRigDrawer } from './AudioRigDrawer';
import { useAudioStore } from '@/stores/audioStore';
import { ACCENT_COLORS } from '@/constants/accentColors';

/**
 * AudioRigDrawer — as of Task 14 (docs/tasks/NAV_LAYOUT_REWRITE.md), this component's own scope
 * has shrunk to just Automatic Effects (Ping Variance Automation), the one control that never got
 * a tree leaf of its own. Every real effect (EQ, HPF, LPF, Delay, Reverb, Compressor, Limiter)
 * moved to AudioRigEffectPanel, tested standalone in AudioRigEffectPanel.test.tsx. No accordion
 * wrapper, no LFO group, no Tone-touching code left in this component at all — the
 * heavy lfoEngine/timelineMap/accessibleName-spy mocks the pre-Task-14 version of this file
 * needed are gone too, since nothing here exercises any of that anymore.
 */
function resetAudioStore() {
  useAudioStore.setState({ pingVarianceAutomation: 0 });
}

describe('AudioRigDrawer', () => {
  beforeEach(() => {
    resetAudioStore();
  });

  it('renders no Tempo slider — relocated to Settings -> Tempo (docs/tasks/NAV_LAYOUT_REWRITE.md Task 12; see SettingsContent.test.tsx)', () => {
    render(<AudioRigDrawer />);
    expect(screen.queryByRole('slider', { name: 'Tempo' })).toBeNull();
  });

  it('renders no Audio Load panel — relocated to Settings -> Quality (docs/tasks/NAV_LAYOUT_REWRITE.md Task 13; see AudioLoadPanel.test.tsx)', () => {
    render(<AudioRigDrawer />);
    expect(screen.queryByRole('slider', { name: 'Robot Load' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Effects Load' })).toBeNull();
  });

  it('renders no effect controls at all — every real effect relocated to its own tree leaf (Task 14; see AudioRigEffectPanel.test.tsx)', () => {
    render(<AudioRigDrawer />);
    expect(screen.queryByText('3-Band EQ')).toBeNull();
    expect(screen.queryByText('Compressor')).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Threshold' })).toBeNull();
  });

  it('renders no accordion anywhere — no collapsed wrapper appears in this file at all (Task 14)', () => {
    const { container } = render(<AudioRigDrawer />);
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
  });

  describe('Ping Variance Automation slider (Task 6)', () => {
    it('renders exactly once, showing the store\'s current fraction as a 0-100 percent', () => {
      useAudioStore.setState({ pingVarianceAutomation: 0.42 });
      render(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      expect(slider.getAttribute('aria-valuenow')).toBe('42');
    });

    it('dragging it calls setPingVarianceAutomation with the dragged percent divided by 100', () => {
      useAudioStore.setState({ pingVarianceAutomation: 0.5 });
      render(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowRight' });

      const newPercent = Number(slider.getAttribute('aria-valuenow'));
      expect(newPercent).not.toBe(50); // the key press actually moved it
      expect(useAudioStore.getState().pingVarianceAutomation).toBeCloseTo(newPercent / 100);
    });

    it('renders enabled — no rig-wide bypass left to disable it', () => {
      render(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      expect(slider.getAttribute('data-disabled')).toBeNull();
    });

    it('renders inside its own Speed & Automation panel — no accordion wraps it (Task 14: Transport & Composition\'s own accordion wrapper was removed too)', () => {
      render(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      const panel = slider.closest('.sc-directional-panel');
      expect(panel!.querySelector('.sc-dual-label__human')?.textContent).toBe('Speed & Automation');
      expect(slider.closest('.sc-accordion')).toBeNull();
    });

    it('renders inside its own .audio-rig-drawer__param-row — a dedicated single-control wrapper', () => {
      render(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      expect(slider.closest('.audio-rig-drawer__param-row')).toBeTruthy();
    });
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 9) — the Composition
  // trait, applied directly to .audio-rig-drawer's own root now that there's no accordion to
  // apply it to (Task 14, docs/tasks/NAV_LAYOUT_REWRITE.md).
  describe('trait color scoping', () => {
    it('scopes its root to the Composition trait (emerald/lime)', () => {
      const { container } = render(<AudioRigDrawer />);
      const root = container.querySelector('.audio-rig-drawer') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.emerald);
      expect(root.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.lime);
    });

    it('does not add any inline style to the nested Speed & Automation panel — the color reaches it purely via cascade', () => {
      const { container } = render(<AudioRigDrawer />);
      const panel = container.querySelector('.sc-directional-panel') as HTMLElement;
      expect(panel.getAttribute('style')).toBeNull();
    });
  });
});
