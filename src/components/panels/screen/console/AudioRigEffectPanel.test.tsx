import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';

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

// The LFO Bank engine (docs/tasks/LFO_BANK.md Task 7) — setGlobalLfoLink (audioStore.ts) calls
// this module's linkTarget directly; mocked for the same reason the old lfoEngine above is: the
// real module would construct a Tone node on first call, which throws without a real AudioContext.
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

import { AudioRigEffectPanel } from './AudioRigDrawer';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { useAudioStore } from '@/stores/audioStore';
import * as audioSwells from '@/systems/audioSwells';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { DEFAULT_LFO_LINK } from '@/data/lfoConfig';
import { GLOBAL_LFO_TARGET_IDS, type GlobalLfoTargetId } from '@/types/lfo';
import type { LfoLinkValue } from '@/types/controls';

/**
 * AudioRigEffectPanel — one effect's own full content, extracted from AudioRigDrawer.test.tsx
 * (docs/tasks/NAV_LAYOUT_REWRITE.md Task 14) once each effect became its own standalone tree
 * leaf, rendered directly rather than nested inside a shared group accordion. Every test below
 * renders one (or, where cross-effect isolation is the point, two) AudioRigEffectPanel instance(s)
 * directly — no accordion wrapper, no PanelGroup, no lazy-mount/opening concept left, since
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

function buildLfoLinkValue(target: GlobalLfoTargetId): LfoLinkValue {
  return { ...DEFAULT_LFO_LINK[target] };
}

function resetAudioStore() {
  const globalLfoLinks = {} as Record<GlobalLfoTargetId, LfoLinkValue>;
  for (const target of GLOBAL_LFO_TARGET_IDS) globalLfoLinks[target] = buildLfoLinkValue(target);
  useAudioStore.setState({
    globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS },
    globalLfoLinks,
    robotLoad: 1,
    effectsLoad: 1,
    soundingRobotIds: [],
    filterLinksHeldOff: false,
    driftHeldOff: false,
  });
}

/** Counts how many times a control with this exact schema id called resolveAccessibleName — a
 *  stand-in for "this control's own render body executed," used throughout the re-render-cascade
 *  tests below. Shared across describe blocks (the Audio Load held-off tests use it too). */
function callsFor(schemaId: string): number {
  return (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([schema]) => schema.id === schemaId,
  ).length;
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

  it("3-Band EQ's, Low-Pass's, and High-Pass's own sliders each render in a row-orientation panel (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.4) — single panel now (Task 14, docs/tasks/LFO_BANK.md removed the old always-column outer group wrapper)", () => {
    const { unmount: unmountEq } = render(<AudioRigEffectPanel effectKey="eq3" />);
    const eqPanel = screen.getByRole('slider', { name: 'Bass' }).closest('.sc-directional-panel') as HTMLElement;
    expect(eqPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    unmountEq();

    for (const key of ['filterLPF', 'filterHPF'] as const) {
      const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
      const slidersPanel = screen.getByRole('slider', { name: 'Cutoff' }).closest('.sc-directional-panel') as HTMLElement;
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

  it('a real user edit interrupts any Audio Swell riding that same field (docs/specs/AUDIO_SWELLS.md follow-up)', () => {
    const spy = vi.spyOn(audioSwells, 'cancelSwellForGlobalField');
    render(<AudioRigEffectPanel effectKey="compressor" />);
    const thresholdSlider = screen.getByRole('slider', { name: 'Threshold' });
    thresholdSlider.focus();
    fireEvent.keyDown(thresholdSlider, { key: 'ArrowRight' });
    expect(spy).toHaveBeenCalledWith('compressor', 'threshold');
  });

  it('a single arrow-key press on a Delay slider moves by a small increment, not straight to max — regression: sliderLinear schemas with a full range <= 1 and no explicit step used to act like toggles', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, delay: { ...s.globalAudio.delay, delayTime: 0.5 } },
    }));
    render(<AudioRigEffectPanel effectKey="delay" />);
    const delayTimeSlider = screen.getByRole('slider', { name: 'Delay Time' });
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

  describe('inline LfoLink rows (Task 14, docs/tasks/LFO_BANK.md — replaces the old shared per-block target-group display)', () => {
    function rowOf(sliderName: string) {
      return screen.getByRole('slider', { name: sliderName }).closest('.audio-rig-drawer__param-row') as HTMLElement;
    }

    it('EQ renders a LfoLink row directly after each of its 3 param rows, never one shared display', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(container.querySelectorAll('.sc-lfo-link')).toHaveLength(3);
    });

    it('renders no LfoLink rows for delay, reverb, compressor, or limiter — none of their params carry lfoTarget', () => {
      for (const key of ['delay', 'reverb', 'compressor', 'limiter'] as const) {
        const { container, unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        expect(container.querySelector('.sc-lfo-link'), key).toBeNull();
        unmount();
      }
    });

    it('renders no accordion nested anywhere — every LfoLink is plain content', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    });

    it('renders no leftover shared-display or old Lfo primitive markup (.sc-lfo, a Rate-named slider) anywhere — Depth sliders are expected (LfoLink\'s own)', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(container.querySelector('.sc-lfo')).toBeNull();
      expect(screen.queryByRole('slider', { name: 'Rate' })).toBeNull();
    });

    it("each param's own LfoLink lives inside that param's own row, directly after its slider", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const midRow = rowOf('Mid');
      expect(within(midRow).getByRole('radio', { name: 'Off' })).toBeTruthy();
    });

    it("binds each target's LfoLink to its OWN stored globalLfoLinks value, not a sibling target's", () => {
      useAudioStore.setState((s) => ({
        globalLfoLinks: { ...s.globalLfoLinks, 'eq3.mid': { lane: 'c', depth: 65 } },
      }));
      render(<AudioRigEffectPanel effectKey="eq3" />);

      const midRow = rowOf('Mid');
      const lowRow = rowOf('Bass');
      expect(within(midRow).getByRole('radio', { name: 'Accent LFO' }).getAttribute('aria-checked')).toBe('true');
      expect(within(midRow).getByRole('slider', { name: 'Depth' }).getAttribute('aria-valuenow')).toBe('65');
      expect(within(lowRow).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    });

    it("choosing a lane on Mid's LfoLink calls setGlobalLfoLink('eq3.mid', { lane, depth })", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      fireEvent.click(within(rowOf('Mid')).getByRole('radio', { name: 'Core LFO' }));

      expect(useAudioStore.getState().globalLfoLinks['eq3.mid']).toEqual({ lane: 'a', depth: 0 });
    });

    it("dragging Mid's own depth slider updates eq3.mid's depth only, leaving eq3.low untouched", () => {
      useAudioStore.setState((s) => ({
        globalLfoLinks: { ...s.globalLfoLinks, 'eq3.mid': { lane: 'a', depth: 30 } },
      }));
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const depthSlider = within(rowOf('Mid')).getByRole('slider', { name: 'Depth' });
      depthSlider.focus();
      fireEvent.keyDown(depthSlider, { key: 'ArrowRight' });

      expect(useAudioStore.getState().globalLfoLinks['eq3.mid'].depth).toBeGreaterThan(30);
      expect(useAudioStore.getState().globalLfoLinks['eq3.low']).toEqual({ lane: null, depth: 0 });
    });

    it('every LfoLink renders enabled by default — no parent-effect enabled/disabled concept left to gate it', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      expect(within(rowOf('Mid')).getByRole('radio', { name: 'Off' }).getAttribute('data-disabled')).toBeNull();
    });
  });

  describe('Audio Load: filterLinksHeldOff on inline LfoLinks (docs/tasks/LFO_BANK.md Task 3 behavior, Task 14 UI)', () => {
    const HELD_OFF = 'Held off by Audio Load';
    function rowOf(sliderName: string) {
      return screen.getByRole('slider', { name: sliderName }).closest('.audio-rig-drawer__param-row') as HTMLElement;
    }
    function depthSliderOf(row: HTMLElement) {
      return within(row).getByRole('slider', { name: 'Depth' });
    }

    it("greys out LPF's own LfoLink while filterLinksHeldOff is true: Off/0 shown, real value kept in the store, note rendered", () => {
      useAudioStore.setState((s) => ({
        globalLfoLinks: { ...s.globalLfoLinks, 'lpf.frequency': { lane: 'b', depth: 45 } },
        filterLinksHeldOff: true,
      }));
      render(<AudioRigEffectPanel effectKey="filterLPF" />);
      const row = rowOf('Cutoff');

      expect(within(row).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
      // Shows 0, not the real stored value (45) — a held-off control should read as visibly "off".
      // The real value is kept in the store and reappears the moment it's re-enabled.
      expect(depthSliderOf(row).getAttribute('aria-valuenow')).toBe('0');
      expect(within(row).getByText(HELD_OFF)).toBeTruthy();
      expect(row.querySelector('.sc-lfo-link.sc-held-off')).toBeTruthy();
      expect(useAudioStore.getState().globalLfoLinks['lpf.frequency']).toEqual({ lane: 'b', depth: 45 });
    });

    it('greys out HPF\'s LfoLink too — the flag covers both filter blocks', () => {
      useAudioStore.setState({ filterLinksHeldOff: true });
      render(<AudioRigEffectPanel effectKey="filterHPF" />);
      const row = rowOf('Cutoff');

      expect(within(row).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
      expect(within(row).getByText(HELD_OFF)).toBeTruthy();
    });

    it("greys BOTH of LPF's own linked params at once — every lfoTarget field within a filter block, not just one", () => {
      useAudioStore.setState({ filterLinksHeldOff: true });
      render(<AudioRigEffectPanel effectKey="filterLPF" />);

      expect(within(rowOf('Cutoff')).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
      expect(within(rowOf('Resonance')).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    });

    it('restores the real stored lane/depth the moment filterLinksHeldOff goes false', async () => {
      useAudioStore.setState((s) => ({
        globalLfoLinks: { ...s.globalLfoLinks, 'lpf.frequency': { lane: 'b', depth: 45 } },
        filterLinksHeldOff: true,
      }));
      render(<AudioRigEffectPanel effectKey="filterLPF" />);
      const row = rowOf('Cutoff');
      expect(within(row).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');

      act(() => useAudioStore.setState({ filterLinksHeldOff: false }));
      // SliderLinear eases a non-drag value change over 250ms (Crawford's own request) — the
      // shared gsap mock (vitest.setup.ts) settles the tween's onComplete on the next microtask.
      await act(async () => { await Promise.resolve(); });

      expect(within(row).getByRole('radio', { name: 'Companion LFO' }).getAttribute('aria-checked')).toBe('true');
      expect(depthSliderOf(row).getAttribute('aria-valuenow')).toBe('45');
      expect(row.querySelector('.sc-lfo-link.sc-held-off')).toBeNull();
    });

    it("leaves EQ's LfoLinks enabled and unlabelled while filterLinksHeldOff is true — EQ-gain links are never held off", () => {
      useAudioStore.setState((s) => ({
        globalLfoLinks: { ...s.globalLfoLinks, 'eq3.low': { lane: 'a', depth: 20 } },
        filterLinksHeldOff: true,
      }));
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const row = rowOf('Bass');

      expect(within(row).getByRole('radio', { name: 'Core LFO' }).getAttribute('aria-checked')).toBe('true');
      expect(within(row).queryByText(HELD_OFF)).toBeNull();
      expect(row.querySelector('.sc-lfo-link.sc-held-off')).toBeNull();
    });

    it('a LfoLink is enabled and unlabelled when filterLinksHeldOff is false (Full, or before the budget runs)', () => {
      render(<AudioRigEffectPanel effectKey="filterLPF" />);
      const row = rowOf('Cutoff');
      expect(within(row).queryByText(HELD_OFF)).toBeNull();
      expect(row.querySelector('.sc-lfo-link.sc-held-off')).toBeNull();
    });

    it('re-enables the moment filterLinksHeldOff flips back to false, with no reload', () => {
      useAudioStore.setState({ filterLinksHeldOff: true });
      render(<AudioRigEffectPanel effectKey="filterLPF" />);
      const row = rowOf('Cutoff');
      expect(row.querySelector('.sc-lfo-link.sc-held-off')).toBeTruthy();

      act(() => useAudioStore.setState({ filterLinksHeldOff: false }));

      expect(row.querySelector('.sc-lfo-link.sc-held-off')).toBeNull();
      expect(within(row).queryByText(HELD_OFF)).toBeNull();
    });

    it('does not re-render the EQ panel\'s own LfoLink rows when filterLinksHeldOff flips (EQ never reads the flag)', () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const eqBefore = callsFor('audioRig.eq3.low.link.lane');
      expect(eqBefore).toBeGreaterThan(0);

      act(() => useAudioStore.setState({ filterLinksHeldOff: true }));
      act(() => useAudioStore.setState({ filterLinksHeldOff: false }));

      expect(callsFor('audioRig.eq3.low.link.lane')).toBe(eqBefore);
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
      const attackRow = screen.getByRole('slider', { name: 'Attack Time' }).closest('.sc-directional-panel')!;
      expect(thresholdRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('Threshold+Ratio and Attack+Release pairs share a row (row) on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const thresholdRow = screen.getByRole('slider', { name: 'Threshold' }).closest('.sc-directional-panel')!;
      const attackRow = screen.getByRole('slider', { name: 'Attack Time' }).closest('.sc-directional-panel')!;
      expect(thresholdRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });

    it('Knee and Decay Mode share a row too — same pairing treatment as Threshold+Ratio/Attack+Release (Crawford\'s own request)', () => {
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const kneeRow = screen.getByRole('slider', { name: 'Knee' }).closest('.audio-rig-drawer__param-row')!;
      const decayModeRow = screen.getByRole('radio', { name: 'Natural Decay' }).closest('.audio-rig-drawer__param-row')!;
      expect(kneeRow).not.toBe(decayModeRow); // still 2 distinct param-rows, just sharing one DirectionalPanel now
      const kneeDecayPanel = screen.getByRole('slider', { name: 'Knee' }).closest('.sc-directional-panel')!;
      expect(kneeDecayPanel.contains(decayModeRow)).toBe(true);
    });

    it('Knee and Decay Mode stack (column) on mobile/tablet', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const kneeDecayPanel = screen.getByRole('slider', { name: 'Knee' }).closest('.sc-directional-panel')!;
      expect(kneeDecayPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('Knee and Decay Mode share a row (row) on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(<AudioRigEffectPanel effectKey="compressor" />);
      const kneeDecayPanel = screen.getByRole('slider', { name: 'Knee' }).closest('.sc-directional-panel')!;
      expect(kneeDecayPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
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

  describe('Drift removed from every global-chain effect panel (docs/specs/FLEET_DRIFT_CONSOLIDATION.md — eq3/filterLPF/filterHPF\'s own embedded Rate/Depth Drift sliders removed; the merged control now lives in FleetDriftPanel/the Fleet Drift nav leaf, not here)', () => {
    it('renders no Rate Drift / Depth Drift slider, and no "Robot Drift"/"EQ Drift" text, for eq3/filterLPF/filterHPF individually', () => {
      for (const key of ['eq3', 'filterLPF', 'filterHPF'] as const) {
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        expect(screen.queryByRole('slider', { name: 'Rate Drift' }), key).toBeNull();
        expect(screen.queryByRole('slider', { name: 'Depth Drift' }), key).toBeNull();
        expect(screen.queryByText('Robot Drift'), key).toBeNull();
        expect(screen.queryByText('EQ Drift'), key).toBeNull();
        unmount();
      }
    });

    it("eq3's own panel content no longer mentions Rate Drift/Depth Drift at all", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const eqPanel = screen.getByText('3-Band EQ').closest('.sc-directional-panel') as HTMLElement;
      expect(eqPanel.textContent).not.toContain('Rate Drift');
      expect(eqPanel.textContent).not.toContain('Depth Drift');
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

    it("eq3's own EQ sliders are a physical DOM descendant of the Spectral-scoped effect-block wrapper — no separate wrapper or style between them", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const eqBlock = effectBlockOf('3-Band EQ');
      const eq3LowSlider = within(eqBlock).getByRole('slider', { name: 'Bass' });
      expect(eqBlock.contains(eq3LowSlider)).toBe(true);
    });
  });

  describe('re-render cascade regression (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12 — the end-to-end test this whole plan exists for)', () => {
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

    // Task 14 (docs/tasks/LFO_BANK.md) replaced the shared per-block LFO display with one inline
    // LfoLink per lfoTarget-bearing param, each bound to its own globalLfoLinks entry via a
    // useShallow selector scoped to just this block's own targets — the same re-render-isolation
    // shape the tests above already prove for plain params, now proven for LfoLink rows too.
    it("a globalLfoLinks write to ONE target does not re-execute a SIBLING target's own LfoLink within the same block (eq3.mid changes, eq3.low's own link stays put)", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const lowLinkCallsBefore = callsFor('audioRig.eq3.low.link.lane');
      expect(lowLinkCallsBefore).toBeGreaterThan(0);

      act(() => {
        useAudioStore.getState().setGlobalLfoLink('eq3.mid', { lane: 'b', depth: 20 });
      });

      expect(callsFor('audioRig.eq3.low.link.lane')).toBe(lowLinkCallsBefore);
    });

    it("sanity check: a target's own LfoLink DOES re-render when THAT target's own globalLfoLinks value changes", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      const lowLinkCallsBefore = callsFor('audioRig.eq3.low.link.lane');

      act(() => {
        useAudioStore.getState().setGlobalLfoLink('eq3.low', { lane: 'a', depth: 50 });
      });

      expect(callsFor('audioRig.eq3.low.link.lane')).toBeGreaterThan(lowLinkCallsBefore);
    });

    it('a globalLfoLinks write to an HPF target does not re-render the EQ panel at all — cross-block isolation', () => {
      render(
        <>
          <AudioRigEffectPanel effectKey="eq3" />
          <AudioRigEffectPanel effectKey="filterHPF" />
        </>,
      );
      const eqLinkCallsBefore = callsFor('audioRig.eq3.low.link.lane');
      expect(eqLinkCallsBefore).toBeGreaterThan(0);

      act(() => {
        useAudioStore.getState().setGlobalLfoLink('hpf.frequency', { lane: 'a', depth: 40 });
      });

      expect(callsFor('audioRig.eq3.low.link.lane')).toBe(eqLinkCallsBefore);
    });
  });
});
