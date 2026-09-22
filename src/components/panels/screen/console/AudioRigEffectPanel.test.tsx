import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';

// Real lfoEngine would construct a real Tone.LFO on first setter call (getOrCreateLfo -> new
// Tone.LFO(...)), which throws without a real AudioContext.
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Spied (real cross-module call, wrapped so it still delegates to the actual implementation) so
// the re-render cascade tests can tell whether a SPECIFIC sibling control's own render body
// re-executed. resolveAccessibleName(schema) is called unconditionally in every slider/radio's
// own render body, with that control's own `schema` object as its argument — filtering the
// spy's calls by `schema.id` isolates one specific control's own re-render count.
vi.mock('@/components/ui/controls/accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

// Call-through spy: useLfoTargetGroup runs once per render of an LFO group (AudioRigLfoGroup), so
// its calls count that component's own re-renders — which the memoized controls inside it would
// otherwise hide.
vi.mock('@/components/ui/controls/useLfoTargetGroup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/useLfoTargetGroup')>();
  return { ...actual, useLfoTargetGroup: vi.fn(actual.useLfoTargetGroup) };
});

vi.mock('../../../../engine/lfoEngine', () => ({
  lfoEngine: {
    getLfoSettings: vi.fn(),
    setLfoRate: vi.fn(),
    setLfoDepth: vi.fn(),
    setLfoShape: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    connectLfoTarget: vi.fn(() => true),
    disconnectLfoTarget: vi.fn(),
    setGlobalRateDrift: vi.fn(),
    setGlobalDepthDrift: vi.fn(),
  },
}));

import { AudioRigEffectPanel } from './AudioRigDrawer';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { useLfoTargetGroup } from '@/components/ui/controls/useLfoTargetGroup';
import { useAudioStore } from '@/stores/audioStore';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import { LFO_DRIFT_GROUPS } from '@/data/audioRigConfig';
import { GLOBAL_LFO_TARGET_IDS, type GlobalLfoTargetId } from '@/types/lfo';

/**
 * AudioRigEffectPanel — one effect's own full content, extracted from AudioRigDrawer.test.tsx
 * (docs/tasks/NAV_LAYOUT_REWRITE.md Task 14) once each effect became its own standalone tree
 * leaf, rendered directly rather than nested inside a shared group accordion. Every test below
 * renders one (or, where cross-effect isolation is the point, two) AudioRigEffectPanel instance(s)
 * directly — no AccordionContainer, no PanelGroup, no lazy-mount/opening concept left, since
 * there's no longer a collapsed section to open. Tests that were purely about the now-removed
 * accordion/group-sharing structure (top-level accordion order, lazy mount, EQ & Filters/Time &
 * Space/Output's shared PanelGroup layout and facades) are dropped, not ported — that structure
 * no longer exists. Every test about a control's own live value/binding/enabled state/layout
 * shape is preserved.
 */

function stubMatchMedia(state: { mobile: boolean; tablet: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('640px') ? state.mobile : state.tablet,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  });
}

function buildLfoValue(target: GlobalLfoTargetId) {
  return { ...DEFAULT_LFO_SETTINGS[target] };
}

function resetAudioStore() {
  const globalLfo = {} as Record<GlobalLfoTargetId, ReturnType<typeof buildLfoValue>>;
  for (const target of GLOBAL_LFO_TARGET_IDS) globalLfo[target] = buildLfoValue(target);
  useAudioStore.setState({
    globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS },
    globalLfo,
    robotLoad: 1,
    effectsLoad: 1,
    soundingRobotIds: [],
    heldOffLfoKeys: [],
    driftHeldOff: false,
  });
}

describe('AudioRigEffectPanel', () => {
  beforeEach(() => {
    resetAudioStore();
  });

  it('renders each effect\'s own label inside its own bordered effect-block wrapper, top-level (no accordion)', () => {
    const cases: Array<['eq3' | 'filterLPF' | 'filterHPF' | 'delay' | 'reverb' | 'compressor' | 'limiter', string]> = [
      ['eq3', '3-Band EQ'], ['filterLPF', 'Low-Pass Filter'], ['filterHPF', 'High-Pass Filter'],
      ['delay', 'Delay'], ['reverb', 'Reverb'], ['compressor', 'Compressor'], ['limiter', 'Limiter'],
    ];
    for (const [key, label] of cases) {
      const { unmount, container } = render(<AudioRigEffectPanel effectKey={key} />);
      const labelEl = screen.getByText(label);
      expect(labelEl.closest('button'), label).toBeNull(); // not an accordion trigger
      expect(labelEl.closest('.sc-directional-panel'), label).not.toBeNull();
      expect(container.querySelector('.audio-rig-drawer__effect-block'), label).not.toBeNull();
      unmount();
    }
  });

  describe('Delay/Reverb param rows (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.7 — every slider own row, at every breakpoint, no paired topRow)', () => {
    it('Delay renders Time, Feedback, and Mix as 3 direct param-rows inside its own block panel — no nested row wrapper', () => {
      render(<AudioRigEffectPanel effectKey="delay" />);
      const delayBlockContent = screen.getByText('Delay').closest('.sc-directional-panel')!
        .querySelector(':scope > .sc-directional-panel__content')!;
      const directRows = delayBlockContent.querySelectorAll(':scope > .audio-rig-drawer__param-row');
      expect(directRows).toHaveLength(3);
      expect(delayBlockContent.querySelector(':scope > .sc-directional-panel')).toBeNull();
    });

    it('Reverb renders Decay, Pre-Delay, and Mix as 3 direct param-rows inside its own block panel — no nested row wrapper', () => {
      render(<AudioRigEffectPanel effectKey="reverb" />);
      const reverbBlockContent = screen.getByText('Reverb').closest('.sc-directional-panel')!
        .querySelector(':scope > .sc-directional-panel__content')!;
      const directRows = reverbBlockContent.querySelectorAll(':scope > .audio-rig-drawer__param-row');
      expect(directRows).toHaveLength(3);
      expect(reverbBlockContent.querySelector(':scope > .sc-directional-panel')).toBeNull();
    });
  });

  it('Delay/Reverb/Compressor/Limiter (no LFO group) render as column-orientation blocks', () => {
    for (const [key, label] of [['delay', 'Delay'], ['reverb', 'Reverb'], ['compressor', 'Compressor'], ['limiter', 'Limiter']] as const) {
      const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
      const panel = screen.getByText(label).closest('.sc-directional-panel')!;
      expect(panel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation'), label).toBe('column');
      unmount();
    }
  });

  it("3-Band EQ's, Low-Pass's, and High-Pass's own sliders each render in a row-orientation panel (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.4)", () => {
    const { unmount: unmountEq } = render(<AudioRigEffectPanel effectKey="eq3" />);
    const eqSlidersPanel = screen.getByRole('slider', { name: 'Low' }).closest('.sc-directional-panel') as HTMLElement;
    expect(eqSlidersPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    // The outer group panel that wraps [sliders-panel, Lfo, driftContent] is always column,
    // regardless of the sliders panel's own orientation.
    const eqGroupPanel = eqSlidersPanel.parentElement!.closest('.sc-directional-panel') as HTMLElement;
    expect(eqGroupPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    unmountEq();

    for (const key of ['filterLPF', 'filterHPF'] as const) {
      const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
      const slidersPanel = screen.getByRole('slider', { name: 'Frequency' }).closest('.sc-directional-panel') as HTMLElement;
      expect(slidersPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation'), key).toBe('row');
      unmount();
    }
  });

  it('renders a param control bound to its live store value', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, compressor: { ...s.globalAudio.compressor, threshold: -12 } },
    }));
    render(<AudioRigEffectPanel effectKey="compressor" />);
    const thresholdSlider = screen.getByRole('slider', { name: 'Threshold' });
    expect(thresholdSlider.getAttribute('aria-valuenow')).toBe('-12');
  });

  it('shows a visible numeric value for unitless params (Resonance/Q on LPF and HPF) — regression: the value text used to be hidden entirely when schema.unit was absent', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, filterLPF: { ...s.globalAudio.filterLPF, Q: 5 } },
    }));
    render(<AudioRigEffectPanel effectKey="filterLPF" />);
    const lpfResonance = screen.getByRole('slider', { name: 'Resonance' });
    expect(lpfResonance.closest('.sc-slider-log')?.textContent).toContain('5');
  });

  it('dragging a param control calls setGlobalAudio with the right effect/field/value', () => {
    render(<AudioRigEffectPanel effectKey="compressor" />);
    const thresholdSlider = screen.getByRole('slider', { name: 'Threshold' });
    thresholdSlider.focus();
    fireEvent.keyDown(thresholdSlider, { key: 'ArrowRight' }); // default step 1, from default -24
    expect(useAudioStore.getState().globalAudio.compressor.threshold).toBe(-23);
  });

  it('a single arrow-key press on a Delay slider moves by a small increment, not straight to max — regression: sliderLinear schemas with a full range <= 1 and no explicit step used to act like toggles', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, delay: { ...s.globalAudio.delay, delayTime: 0.5 } },
    }));
    render(<AudioRigEffectPanel effectKey="delay" />);
    const delayTimeSlider = screen.getByRole('slider', { name: 'Time' });
    delayTimeSlider.focus();
    fireEvent.keyDown(delayTimeSlider, { key: 'ArrowRight' });

    const newValue = useAudioStore.getState().globalAudio.delay.delayTime;
    expect(newValue).toBeGreaterThan(0.5);
    expect(newValue).toBeLessThan(1); // must not jump straight to max in one press
  });

  it('renders no rig-wide bypass switch or per-effect Enabled toggles — removed, off states are expressed via the sliders themselves', () => {
    render(<AudioRigEffectPanel effectKey="compressor" />);
    expect(screen.queryByRole('switch', { name: 'Bypass (this may be loud or distorted)' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Compressor Enabled' })).toBeNull();
  });

  it('every param control renders enabled — no drawer-level disabling concept left', () => {
    render(<AudioRigEffectPanel effectKey="compressor" />);
    expect(screen.getByRole('slider', { name: 'Threshold' }).getAttribute('data-disabled')).toBeNull();
  });

  describe('shared LFO display (LFO_CONSOLIDATED_DISPLAY — replaces the old nested per-slider accordion)', () => {
    it('renders exactly one shared LFO display for an LFO-bearing block (eq3/filterLPF/filterHPF), never one per param', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="eq3" />);
      // A plain count of the shared display's own root class also proves "not one per param" —
      // 3 GlobalLfoTargetId params (low/mid/high) would otherwise render 3.
      expect(container.querySelectorAll('.sc-lfo')).toHaveLength(1);
    });

    it('renders no shared LFO display for delay, reverb, compressor, or limiter — none of their params carry lfoTarget', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="compressor" />);
      expect(container.querySelector('.sc-lfo')).toBeNull();
    });

    it('renders no accordion nested anywhere — the shared display is plain content', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    });

    it('shows the targeted param\'s own name as the shared display\'s label, defaulting to the group\'s first param', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(container.querySelector('.sc-lfo')?.textContent).toContain('Low');
    });

    it('binds the default target (eq3.low) to its own globalLfo entry, not DEFAULT_LFO_SETTINGS', () => {
      useAudioStore.setState((s) => ({
        globalLfo: { ...s.globalLfo, 'eq3.low': { shape: 'square', rate: 5, depth: 60 } },
      }));
      render(<AudioRigEffectPanel effectKey="eq3" />);

      expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('aria-valuenow')).toBe('5');
      expect(screen.getByRole('slider', { name: 'Depth' }).getAttribute('aria-valuenow')).toBe('60');
    });

    it('dragging the shared display\'s rate slider off 0 calls setGlobalLfo for the currently-targeted field (eq3.low by default)', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const rateSlider = screen.getByRole('slider', { name: 'Rate' });
      expect(useAudioStore.getState().globalLfo['eq3.low'].rate).toBe(0);

      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

      expect(useAudioStore.getState().globalLfo['eq3.low'].rate).toBeGreaterThan(0);
    });

    it('the shared LFO display is enabled by default — no parent-effect enabled/disabled concept left to gate it', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('data-disabled')).toBeNull();
    });

    it('clicking a different band\'s row (click-around, not just the slider) marks that row targeted, once the transition completes', async () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const midSlider = screen.getByRole('slider', { name: 'Mid' });
      const midRow = midSlider.closest('.sc-lfo-target-group__row')!;
      const lowRow = screen.getByRole('slider', { name: 'Low' }).closest('.sc-lfo-target-group__row')!;
      expect(lowRow.classList.contains('isActive')).toBe(true);

      fireEvent.click(midRow);

      await waitFor(() => {
        expect(midRow.classList.contains('isActive')).toBe(true);
      });
      expect(lowRow.classList.contains('isActive')).toBe(false);
    });

    it('keyboard-focusing a different band\'s slider switches which globalLfo entry the shared display edits, once the transition completes', async () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const highSlider = screen.getByRole('slider', { name: 'High' });
      await act(async () => {
        highSlider.focus();
      });

      await waitFor(() => {
        expect(screen.getByRole('slider', { name: 'High' }).closest('.sc-lfo-target-group__row')?.classList.contains('isActive')).toBe(true);
      });

      const rateSlider = screen.getByRole('slider', { name: 'Rate' });
      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

      expect(useAudioStore.getState().globalLfo['eq3.high'].rate).toBeGreaterThan(0);
      expect(useAudioStore.getState().globalLfo['eq3.low'].rate).toBe(0);
    });
  });

  describe('Audio Load: held-off LFOs and drift', () => {
    const HELD_OFF = 'Held off by Audio Load';
    const frame = (container: HTMLElement) => container.querySelector<HTMLElement>('.sc-lfo-target-group__display')!;
    const rateOf = (f: HTMLElement) => within(f).getByRole('slider', { name: 'Rate' });
    const depthOf = (f: HTMLElement) => within(f).getByRole('slider', { name: 'Depth' });
    const isDisabled = (el: HTMLElement) => el.getAttribute('data-disabled') !== null;
    const callsFor = (schemaId: string) =>
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(([schema]) => schema.id === schemaId).length;

    it('greys out a shared LFO frame whose displayed target is held off: controls disabled, stored values kept, label shown', () => {
      useAudioStore.setState((s) => ({
        globalLfo: { ...s.globalLfo, 'lpf.frequency': { shape: 'square', rate: 3, depth: 45 } },
        heldOffLfoKeys: ['lpf.frequency'],
      }));
      const { container } = render(<AudioRigEffectPanel effectKey="filterLPF" />);
      const lpf = frame(container);

      expect(isDisabled(rateOf(lpf))).toBe(true);
      expect(isDisabled(depthOf(lpf))).toBe(true);
      // Shows 0, not the real stored value (3/45) — a held-off control should read as visibly
      // "off". The real value is kept in the store and reappears the moment it's re-enabled.
      expect(rateOf(lpf).getAttribute('aria-valuenow')).toBe('0');
      expect(depthOf(lpf).getAttribute('aria-valuenow')).toBe('0');
      expect(within(lpf).getByText(HELD_OFF)).toBeTruthy();
      expect(lpf.querySelector('.sc-lfo.sc-held-off')).toBeTruthy();
    });

    it('restores the real stored value (not 0) the moment the frame stops being held off', () => {
      useAudioStore.setState((s) => ({
        globalLfo: { ...s.globalLfo, 'lpf.frequency': { shape: 'square', rate: 3, depth: 45 } },
        heldOffLfoKeys: ['lpf.frequency'],
      }));
      const { container } = render(<AudioRigEffectPanel effectKey="filterLPF" />);
      expect(rateOf(frame(container)).getAttribute('aria-valuenow')).toBe('0');

      act(() => useAudioStore.setState({ heldOffLfoKeys: [] }));

      expect(rateOf(frame(container)).getAttribute('aria-valuenow')).toBe('3');
      expect(depthOf(frame(container)).getAttribute('aria-valuenow')).toBe('45');
      expect(frame(container).querySelector('.sc-lfo.sc-held-off')).toBeNull();
    });

    it('leaves an unrelated block\'s frame enabled and unlabelled — EQ-gain LFOs stay editable while all four filter LFOs are held off (Light)', () => {
      useAudioStore.setState({ heldOffLfoKeys: ['lpf.frequency', 'lpf.Q', 'hpf.frequency', 'hpf.Q'] });
      const { container } = render(<AudioRigEffectPanel effectKey="eq3" />);
      const eq = frame(container);

      expect(isDisabled(rateOf(eq))).toBe(false);
      expect(within(eq).queryByText(HELD_OFF)).toBeNull();
    });

    it('a frame with nothing held off is enabled and unlabelled (Full, or before the budget runs)', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="filterLPF" />);
      const f = frame(container);
      expect(isDisabled(rateOf(f))).toBe(false);
      expect(within(f).queryByText(HELD_OFF)).toBeNull();
    });

    it('re-enables the moment the LFO stops being held off, with no reload', () => {
      useAudioStore.setState({ heldOffLfoKeys: ['lpf.frequency'] });
      const { container } = render(<AudioRigEffectPanel effectKey="filterLPF" />);
      expect(isDisabled(rateOf(frame(container)))).toBe(true);

      act(() => useAudioStore.setState({ heldOffLfoKeys: [] }));

      expect(isDisabled(rateOf(frame(container)))).toBe(false);
      expect(within(frame(container)).queryByText(HELD_OFF)).toBeNull();
    });

    it('follows which target the frame is showing: a held-off Resonance greys the frame only once Resonance is selected', async () => {
      useAudioStore.setState({ heldOffLfoKeys: ['lpf.Q'] });
      const { container } = render(<AudioRigEffectPanel effectKey="filterLPF" />);
      expect(isDisabled(rateOf(frame(container)))).toBe(false); // showing Frequency

      await act(async () => {
        screen.getByRole('slider', { name: 'Resonance' }).focus();
      });

      await waitFor(() => {
        expect(isDisabled(rateOf(frame(container)))).toBe(true);
      });
      expect(within(frame(container)).getByText(HELD_OFF)).toBeTruthy();
    });

    it('greys out this block\'s own drift sliders, with a label, while the drift tier is off — and restores them', () => {
      useAudioStore.setState({ driftHeldOff: true });
      render(<AudioRigEffectPanel effectKey="eq3" />);

      const sliders = [screen.getByRole('slider', { name: 'Rate Drift' }), screen.getByRole('slider', { name: 'Depth Drift' })];
      for (const slider of sliders) expect(isDisabled(slider)).toBe(true);
      expect(screen.getByText(HELD_OFF)).toBeTruthy();

      act(() => useAudioStore.setState({ driftHeldOff: false }));

      for (const slider of [screen.getByRole('slider', { name: 'Rate Drift' }), screen.getByRole('slider', { name: 'Depth Drift' })]) {
        expect(isDisabled(slider)).toBe(false);
      }
      expect(screen.queryByText(HELD_OFF)).toBeNull();
    });

    it('shows 0, not the real stored drift amount, while greyed out — and the real value returns once re-enabled', () => {
      useAudioStore.setState((s) => ({
        globalAudio: { ...s.globalAudio, lfoDrift: { ...s.globalAudio.lfoDrift, eq3: { rateDrift: 0.4, depthDrift: -0.25 } } },
        driftHeldOff: true,
      }));
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const eq3 = LFO_DRIFT_GROUPS.find((g) => g.group === 'eq3')!;
      const rateSlider = screen.getByRole('slider', { name: eq3.rateSchema.humanLabel });
      const depthSlider = screen.getByRole('slider', { name: eq3.depthSchema.humanLabel });
      expect(rateSlider.getAttribute('aria-valuenow')).toBe('0');
      expect(depthSlider.getAttribute('aria-valuenow')).toBe('0');
      expect(rateSlider.closest('.audio-rig-drawer__param-row')?.classList.contains('sc-held-off')).toBe(true);

      act(() => useAudioStore.setState({ driftHeldOff: false }));

      const restored = screen.getByRole('slider', { name: eq3.rateSchema.humanLabel });
      const depthRestored = screen.getByRole('slider', { name: eq3.depthSchema.humanLabel });
      expect(restored.getAttribute('aria-valuenow')).toBe('40');
      expect(depthRestored.getAttribute('aria-valuenow')).toBe('-25');
      expect(restored.closest('.audio-rig-drawer__param-row')?.classList.contains('sc-held-off')).toBe(false);
    });

    it('the drift flag does not disturb the memoized LFO controls inside the frame', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const eqRate = callsFor('audioRig.eq3.lfo.rate');
      expect(eqRate).toBeGreaterThan(0);

      act(() => useAudioStore.setState({ driftHeldOff: true }));

      expect(callsFor('audioRig.eq3.lfo.rate')).toBe(eqRate);
    });

    it('an unrelated LFO entering or leaving the held-off list does not re-render the frame at all (a per-frame boolean selector, not the whole list)', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const groupRenders = (groupId: string) =>
        (useLfoTargetGroup as ReturnType<typeof vi.fn>).mock.calls.filter(([args]) => args.groupId === groupId).length;
      const eqBefore = groupRenders('audioRig.eq3');
      expect(eqBefore).toBeGreaterThan(0);

      // hpf.Q is not the displayed target of eq3 (which shows 'low', its own first field), so it may not re-render.
      act(() => useAudioStore.setState({ heldOffLfoKeys: ['hpf.Q'] }));
      act(() => useAudioStore.setState({ heldOffLfoKeys: ['hpf.Q', 'eq3.mid'] }));
      act(() => useAudioStore.setState({ heldOffLfoKeys: [] }));

      expect(groupRenders('audioRig.eq3')).toBe(eqBefore);
    });
  });

  describe('Reverb (Task 11)', () => {
    it('renders no dampening slider — dead, removed', () => {
      render(<AudioRigEffectPanel effectKey="reverb" />);
      expect(screen.queryByRole('slider', { name: 'Dampening' })).toBeNull();
    });
  });

  describe('Compressor sub-rows (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.8)', () => {
    it('Threshold+Ratio and Attack+Release pairs stack (column) on mobile/tablet', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const thresholdRow = screen.getByRole('slider', { name: 'Threshold' }).closest('.sc-directional-panel')!;
      const attackRow = screen.getByRole('slider', { name: 'Attack' }).closest('.sc-directional-panel')!;
      expect(thresholdRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('Threshold+Ratio and Attack+Release pairs share a row (row) on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const thresholdRow = screen.getByRole('slider', { name: 'Threshold' }).closest('.sc-directional-panel')!;
      const attackRow = screen.getByRole('slider', { name: 'Attack' }).closest('.sc-directional-panel')!;
      expect(thresholdRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });

    it('Knee and the Decay Mode radio each render as their own direct param-row — no shared wrapper between them', () => {
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const kneeRow = screen.getByRole('slider', { name: 'Knee' }).closest('.audio-rig-drawer__param-row')!;
      const decayModeRow = screen.getByRole('radio', { name: 'Natural Decay' }).closest('.audio-rig-drawer__param-row')!;
      expect(kneeRow).not.toBe(decayModeRow);
      const compressorContent = screen.getByRole('slider', { name: 'Threshold' })
        .closest('.audio-rig-drawer__effect-block')!
        .querySelector('.sc-directional-panel > .sc-directional-panel__content')!;
      expect(kneeRow.parentElement).toBe(compressorContent);
      expect(decayModeRow.parentElement).toBe(compressorContent);
    });
  });

  describe('Decay radio button', () => {
    it('renders both options, defaulting to Natural Decay selected (compressorBeforeDelay: false)', () => {
      render(<AudioRigEffectPanel effectKey="compressor" />);
      expect(screen.getByRole('radio', { name: 'Natural Decay' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('radio', { name: 'Controlled Decay' }).getAttribute('aria-checked')).toBe('false');
    });

    it('clicking Controlled Decay calls setCompressorBeforeDelay(true)', () => {
      render(<AudioRigEffectPanel effectKey="compressor" />);
      expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(false);

      fireEvent.click(screen.getByRole('radio', { name: 'Controlled Decay' }));

      expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(true);
    });

    it('once compressorBeforeDelay is true, Controlled Decay reads as selected and Natural Decay does not', () => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, compressorBeforeDelay: true } }));
      render(<AudioRigEffectPanel effectKey="compressor" />);

      expect(screen.getByRole('radio', { name: 'Controlled Decay' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('radio', { name: 'Natural Decay' }).getAttribute('aria-checked')).toBe('false');
    });

    it('clicking Natural Decay while Controlled Decay is active calls setCompressorBeforeDelay(false)', () => {
      useAudioStore.setState((s) => ({
        globalAudio: { ...s.globalAudio, compressorBeforeDelay: true },
      }));
      render(<AudioRigEffectPanel effectKey="compressor" />);

      fireEvent.click(screen.getByRole('radio', { name: 'Natural Decay' }));

      expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(false);
    });

    it('lives inside the Compressor panel, under its other params — not a master row', () => {
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const decayRadio = screen.getByRole('radio', { name: 'Natural Decay' });
      const compressorPanel = screen.getByText('Compressor').closest('.sc-directional-panel');
      expect(compressorPanel?.contains(decayRadio)).toBe(true);
      expect(compressorPanel?.textContent).toContain('Threshold');
    });

    it('renders enabled — no parent-effect enabled/disabled concept left to gate it', () => {
      render(<AudioRigEffectPanel effectKey="compressor" />);
      expect(screen.getByRole('radio', { name: 'Natural Decay' }).getAttribute('data-disabled')).toBeNull();
    });
  });

  describe('Drift (LFO_CONSOLIDATED_DISPLAY — eq3/filterLPF/filterHPF\'s own drift moved inside their own panel)', () => {
    it('no longer renders Robot Drift anywhere — moved to the robot/company Source accordion (SignatureArrayDrawer)', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(screen.queryByText('Robot Drift')).toBeNull();
      expect(screen.queryByText('EQ Drift')).toBeNull();
    });

    it('still renders 1 Rate Drift / Depth Drift slider pair per LFO-bearing block (eq3/filterLPF/filterHPF individually)', () => {
      for (const key of ['eq3', 'filterLPF', 'filterHPF'] as const) {
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        expect(screen.getAllByRole('slider', { name: 'Rate Drift' }), key).toHaveLength(1);
        expect(screen.getAllByRole('slider', { name: 'Depth Drift' }), key).toHaveLength(1);
        unmount();
      }
    });

    it("eq3's own Rate/Depth Drift sliders render inside eq3's own panel, directly beneath its shared LFO display — not a separate titled block", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const eqPanel = screen.getByText('3-Band EQ').closest('.sc-directional-panel') as HTMLElement;
      expect(eqPanel.textContent).toContain('Rate Drift');
      expect(eqPanel.textContent).toContain('Depth Drift');
    });

    it('shows each group\'s own current lfoDrift values as a -100..100 percent, not the internal -1..1 fraction', () => {
      useAudioStore.setState((s) => ({
        globalAudio: {
          ...s.globalAudio,
          lfoDrift: { ...s.globalAudio.lfoDrift, eq3: { rateDrift: 0.3, depthDrift: -0.6 } },
        },
      }));
      render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(screen.getByRole('slider', { name: 'Rate Drift' }).getAttribute('aria-valuenow')).toBe('30');
      expect(screen.getByRole('slider', { name: 'Depth Drift' }).getAttribute('aria-valuenow')).toBe('-60');
    });

    it('dragging eq3\'s own Rate Drift slider calls setGlobalLfoDrift with \'eq3\' and the dragged percent divided by 100, leaving other groups untouched', () => {
      useAudioStore.setState((s) => ({
        globalAudio: {
          ...s.globalAudio,
          lfoDrift: { ...s.globalAudio.lfoDrift, eq3: { rateDrift: 0, depthDrift: 0 }, filterLPF: { rateDrift: 0.5, depthDrift: 0.5 } },
        },
      }));
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const eq3RateSlider = screen.getByRole('slider', { name: 'Rate Drift' });
      eq3RateSlider.focus();
      fireEvent.keyDown(eq3RateSlider, { key: 'ArrowRight' });

      const newPercent = Number(eq3RateSlider.getAttribute('aria-valuenow'));
      expect(newPercent).not.toBe(0); // the key press actually moved it
      expect(useAudioStore.getState().globalAudio.lfoDrift.eq3.rateDrift).toBeCloseTo(newPercent / 100);
      expect(useAudioStore.getState().globalAudio.lfoDrift.eq3.depthDrift).toBe(0);
      expect(useAudioStore.getState().globalAudio.lfoDrift.filterLPF).toEqual({ rateDrift: 0.5, depthDrift: 0.5 });
    });

    it('both drift sliders render enabled — no rig-wide bypass left to disable them', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      for (const slider of [screen.getByRole('slider', { name: 'Rate Drift' }), screen.getByRole('slider', { name: 'Depth Drift' })]) {
        expect(slider.getAttribute('data-disabled')).toBeNull();
      }
    });
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5/§1.6, Task 9) — each effect's
  // own trait, applied directly to its wrapper now that there's no group accordion to cascade
  // one down from (Task 14, docs/tasks/NAV_LAYOUT_REWRITE.md).
  describe('trait color scoping', () => {
    function effectBlockOf(label: string) {
      return screen.getByText(label).closest('.audio-rig-drawer__effect-block') as HTMLElement;
    }

    it('scopes eq3/filterLPF/filterHPF to the Spectral trait (cyan/indigo)', () => {
      for (const [key, label] of [['eq3', '3-Band EQ'], ['filterLPF', 'Low-Pass Filter'], ['filterHPF', 'High-Pass Filter']] as const) {
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        const el = effectBlockOf(label);
        expect(el.style.getPropertyValue('--color-accent-a'), label).toBe(ACCENT_COLORS.cyan);
        expect(el.style.getPropertyValue('--color-accent-b'), label).toBe(ACCENT_COLORS.indigo);
        unmount();
      }
    });

    it('scopes delay/reverb to the Time/Space trait (purple/pink)', () => {
      for (const [key, label] of [['delay', 'Delay'], ['reverb', 'Reverb']] as const) {
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        const el = effectBlockOf(label);
        expect(el.style.getPropertyValue('--color-accent-a'), label).toBe(ACCENT_COLORS.purple);
        expect(el.style.getPropertyValue('--color-accent-b'), label).toBe(ACCENT_COLORS.pink);
        unmount();
      }
    });

    it('scopes compressor/limiter to the Output trait (burnt orange/orange)', () => {
      for (const [key, label] of [['compressor', 'Compressor'], ['limiter', 'Limiter']] as const) {
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        const el = effectBlockOf(label);
        expect(el.style.getPropertyValue('--color-accent-a'), label).toBe(ACCENT_COLORS.burntOrange);
        expect(el.style.getPropertyValue('--color-accent-b'), label).toBe(ACCENT_COLORS.orange);
        unmount();
      }
    });

    it('also sets --color-accent/--color-accent-gradient as literal values — never a var()-reference to --color-accent-a/-b', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const el = effectBlockOf('3-Band EQ');
      expect(el.style.getPropertyValue('--color-accent')).toBe(
        `color-mix(in srgb, ${ACCENT_COLORS.cyan} 50%, ${ACCENT_COLORS.indigo} 50%)`,
      );
      expect(el.style.getPropertyValue('--color-accent')).not.toContain('var(');
      expect(el.style.getPropertyValue('--color-accent-gradient')).not.toContain('var(');
    });

    it('does not add any inline style to the nested per-effect DirectionalPanel itself — the color reaches it purely via cascade from the effect-block wrapper', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const panel = screen.getByText('3-Band EQ').closest('.sc-directional-panel') as HTMLElement;
      expect(panel.getAttribute('style')).toBeNull();
    });

    it("eq3's own Drift sliders are a physical DOM descendant of the Spectral-scoped effect-block wrapper — no separate wrapper or style between them", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const eqBlock = effectBlockOf('3-Band EQ');
      const eq3RateSlider = within(eqBlock).getByRole('slider', { name: 'Rate Drift' });
      expect(eqBlock.contains(eq3RateSlider)).toBe(true);
    });
  });

  describe('re-render cascade regression (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12 — the end-to-end test this whole plan exists for)', () => {
    function callsFor(schemaId: string): number {
      return (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([schema]) => schema.id === schemaId,
      ).length;
    }

    it("a setGlobalAudio update to ONE field (Delay's delayTime, simulating an audio-swell tick) does not re-execute a SIBLING field's own control (Delay's Mix/wet) — only the changed field's own control re-renders", () => {
      render(<AudioRigEffectPanel effectKey="delay" />);
      const delayTimeCallsBefore = callsFor('delay.delayTime');
      const delayWetCallsBefore = callsFor('delay.wet');
      expect(delayTimeCallsBefore).toBeGreaterThan(0);
      expect(delayWetCallsBefore).toBeGreaterThan(0);

      act(() => {
        useAudioStore.getState().setGlobalAudio('delay', { delayTime: 0.6 });
      });

      expect(callsFor('delay.delayTime')).toBeGreaterThan(delayTimeCallsBefore);
      expect(callsFor('delay.wet')).toBe(delayWetCallsBefore);
    });

    it('the same holds for the compressor\'s hand-composed block (Threshold changes, Knee\'s own control does not re-render)', () => {
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const thresholdCallsBefore = callsFor('compressor.threshold');
      const kneeCallsBefore = callsFor('compressor.knee');
      expect(thresholdCallsBefore).toBeGreaterThan(0);
      expect(kneeCallsBefore).toBeGreaterThan(0);

      act(() => {
        useAudioStore.getState().setGlobalAudio('compressor', { threshold: -30 });
      });

      expect(callsFor('compressor.threshold')).toBeGreaterThan(thresholdCallsBefore);
      expect(callsFor('compressor.knee')).toBe(kneeCallsBefore);
    });

    it('a setGlobalAudio update to one effect does not re-render an UNRELATED effect\'s own controls (Delay changes, Reverb\'s Mix does not re-render) — item 18\'s own per-effect selector scoping, still correct here', () => {
      render(
        <>
          <AudioRigEffectPanel effectKey="delay" />
          <AudioRigEffectPanel effectKey="reverb" />
        </>,
      );
      const reverbWetCallsBefore = callsFor('reverb.wet');
      expect(reverbWetCallsBefore).toBeGreaterThan(0);

      act(() => {
        useAudioStore.getState().setGlobalAudio('delay', { delayTime: 0.6 });
      });

      expect(callsFor('reverb.wet')).toBe(reverbWetCallsBefore);
    });

    // Live-verified regression, found by Crawford via React DevTools "highlight updates" after
    // Task 12 shipped: LFO-bearing blocks (eq3/filterLPF/filterHPF, the only AudioRigLfoGroup
    // consumers) still showed their whole subtree — including the shared LFO display and its own
    // internal Shape/Rate/Depth controls — re-rendering on every swell tick for that block, not
    // just the one field actually swelling. Root cause: AudioRigLfoGroup builds its own Lfo
    // component's `schema` prop (and its 2 DirectionalPanel schemas) as a fresh inline object
    // literal every render.
    it("changing a NON-displayed field within an LFO-bearing block (eq3's mid, while 'low' remains the default-selected/displayed LFO target) does not re-execute the shared LFO display's own internal controls", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const lfoRateCallsBefore = callsFor('audioRig.eq3.lfo.rate');
      const lfoDepthCallsBefore = callsFor('audioRig.eq3.lfo.depth');
      expect(lfoRateCallsBefore).toBeGreaterThan(0);
      expect(lfoDepthCallsBefore).toBeGreaterThan(0);

      act(() => {
        useAudioStore.getState().setGlobalAudio('eq3', { mid: 5 });
      });

      expect(callsFor('audioRig.eq3.lfo.rate')).toBe(lfoRateCallsBefore);
      expect(callsFor('audioRig.eq3.lfo.depth')).toBe(lfoDepthCallsBefore);
    });

    it('sanity check: the shared LFO display DOES re-render when the currently-DISPLAYED target\'s own value changes (eq3\'s Low, the default-selected field)', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const lfoRateCallsBefore = callsFor('audioRig.eq3.lfo.rate');

      act(() => {
        useAudioStore.getState().setGlobalLfo('eq3.low', { rate: 3, depth: 50, shape: 'sine' });
      });

      expect(callsFor('audioRig.eq3.lfo.rate')).toBeGreaterThan(lfoRateCallsBefore);
    });
  });
});
