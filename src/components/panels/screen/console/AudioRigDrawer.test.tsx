import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';

// Real lfoEngine would construct a real Tone.LFO on first setter call
// (getOrCreateLfo -> new Tone.LFO(...)), which throws without a real
// AudioContext — the same class of bug fixed in Tasks 8/9. Mocked here so
// setGlobalLfo's own Zustand-state-update logic still runs for real, but its
// calls into lfoEngine land on mocks instead.
// The shared GSAP mock in vitest.setup.ts returns a timeline object with no kill() method —
// fine for AccordionContainer's own tests (which mock timelineMap directly, same as here) but
// this file never used to exercise a same-key double-kill until useLfoTargetGroup's own
// unmount/reselect cleanup started calling killTimeline on an already-registered entry.
// Matches AccordionContainer.test.tsx's own convention for exactly this reason.
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so the end-to-end cascade regression test (docs/tasks/
// OBLIQUE_CABINETRY_MEMOIZATION.md Task 12 — the test this whole plan exists
// for) can tell whether a SPECIFIC sibling control's own render body
// re-executed. resolveAccessibleName(schema) is called unconditionally in
// every slider/radio's own render body, with that control's own `schema`
// object as its argument — filtering the spy's calls by `schema.id` isolates
// one specific control's own re-render count from the whole panel's.
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

import { AudioRigDrawer } from './AudioRigDrawer';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { useAudioStore } from '@/stores/audioStore';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import { GLOBAL_LFO_TARGET_IDS, type GlobalLfoTargetId } from '@/types/lfo';
import { openAllAccordions } from '@/testUtils/openAccordions';

// AccordionContainer only mounts a section's controls once it has been opened (docs/specs/ACCORDION_LAZY_MOUNT.md), and
// every assertion in this file is about controls inside those sections — so each render expands them all first, exactly
// as a user would before touching a slider. A test asserting that a section is *closed* would use plain render().
function renderOpen(ui: React.ReactElement) {
  const result = render(ui);
  openAllAccordions(result.container);
  return result;
}

/** Stubs window.matchMedia so the mobile (max-width: 640px) and tablet (max-width: 1024px)
 *  tier queries can be controlled — same shape as useCabinetBoxHeight.test.ts's own
 *  stubMatchMedia. Neither query matching (the default, unstubbed jsdom behavior) resolves
 *  to the desktop tier, which is why every pre-existing 'row'-orientation assertion in this
 *  file already passes without a stub. */
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

function resetAudioStore() {
  const globalLfo = {} as Record<GlobalLfoTargetId, ReturnType<typeof buildLfoValue>>;
  for (const target of GLOBAL_LFO_TARGET_IDS) globalLfo[target] = buildLfoValue(target);
  useAudioStore.setState({ globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS }, globalLfo, audioLoad: 1, soundingRobotIds: [] });
}

function buildLfoValue(target: GlobalLfoTargetId) {
  return { ...DEFAULT_LFO_SETTINGS[target] };
}

describe('AudioRigDrawer', () => {
  beforeEach(() => {
    resetAudioStore();
  });

  it('renders exactly 4 top-level accordions, in Transport & Composition / EQ & Filters / Time & Space / Output order (DirectionalPanel wiring)', () => {
    const { container } = renderOpen(<AudioRigDrawer />);
    const topLevelAccordions = [...container.querySelector('.audio-rig-drawer')!.children]
      .filter((el) => el.classList.contains('sc-accordion'));
    expect(topLevelAccordions.map((el) => el.querySelector('.sc-dual-label__human')?.textContent)).toEqual([
      'Transport & Composition', 'EQ & Filters', 'Time & Space', 'Output',
    ]);
  });

  it('renders each old effect block\'s label as a DirectionalPanel nested inside its new top-level accordion — no longer its own accordion', () => {
    renderOpen(<AudioRigDrawer />);
    for (const label of ['3-Band EQ', 'Low-Pass Filter', 'High-Pass Filter', 'Delay', 'Reverb', 'Compressor', 'Limiter']) {
      const labelEl = screen.getByText(label);
      expect(labelEl.closest('button'), label).toBeNull(); // not an accordion trigger anymore
      const panel = labelEl.closest('.sc-directional-panel');
      expect(panel, label).not.toBeNull();
      expect(panel!.closest('.sc-accordion'), label).not.toBeNull();
    }
  });

  it('keeps the existing bordered effect-block wrapper around each block\'s panel, now one level deeper than before', () => {
    renderOpen(<AudioRigDrawer />);
    for (const label of ['3-Band EQ', 'Low-Pass Filter', 'High-Pass Filter', 'Delay', 'Reverb', 'Compressor', 'Limiter']) {
      const panel = screen.getByText(label).closest('.sc-directional-panel')!;
      expect(panel.closest('.audio-rig-drawer__effect-block'), label).not.toBeNull();
    }
  });

  // Roadmap 17.2.2 (docs/specs/ACCORDION_LAZY_MOUNT.md) — the regression guard the whole item exists for: opening this tile
  // used to build all ~300 cabinet boxes of every collapsed section up front (a main-thread stall long enough to pause
  // audio). If anyone re-adds an eager mount, these fail. Plain render() on purpose — renderOpen() would defeat them.
  describe('lazy mount (docs/specs/ACCORDION_LAZY_MOUNT.md) — a section builds its controls only once it is opened', () => {
    const trigger = (name: RegExp) => screen.getByRole('button', { name });

    it('mounts no slider and no cabinet box inside any section until one is opened', () => {
      const { container } = render(<AudioRigDrawer />);
      expect(screen.queryAllByRole('slider')).toHaveLength(0);
      expect(container.querySelectorAll('.sc-accordion__content .sc-cabinet-box')).toHaveLength(0);
    });

    it('opening EQ & Filters mounts its sliders and nothing from the other sections', () => {
      const { container } = render(<AudioRigDrawer />);

      fireEvent.click(trigger(/EQ & Filters/i));

      expect(screen.getByRole('slider', { name: 'Low' })).toBeTruthy();
      // Tempo lives in Transport & Composition and Threshold in Output — both still never opened.
      expect(screen.queryByRole('slider', { name: 'Tempo' })).toBeNull();
      expect(screen.queryAllByRole('slider', { name: 'Threshold' })).toHaveLength(0);
      // Every cabinet box mounted inside a section sits in the one that was opened.
      const inOpenSection = container.querySelectorAll('.sc-accordion__content[data-state="open"] .sc-cabinet-box').length;
      expect(inOpenSection).toBeGreaterThan(0);
      expect(container.querySelectorAll('.sc-accordion__content .sc-cabinet-box')).toHaveLength(inOpenSection);
    });

    it('opening a second section adds its controls without dropping the first section\'s', () => {
      render(<AudioRigDrawer />);

      fireEvent.click(trigger(/EQ & Filters/i));
      fireEvent.click(trigger(/Output/i));

      expect(screen.getByRole('slider', { name: 'Low' })).toBeTruthy();
      expect(screen.queryAllByRole('slider', { name: 'Threshold' }).length).toBeGreaterThan(0);
      expect(screen.queryByRole('slider', { name: 'Tempo' })).toBeNull();
    });

    it('closing a section afterward keeps its controls mounted (collapsing hides, it does not unmount)', () => {
      render(<AudioRigDrawer />);

      fireEvent.click(trigger(/EQ & Filters/i));
      fireEvent.click(trigger(/EQ & Filters/i));

      expect(trigger(/EQ & Filters/i).getAttribute('aria-expanded')).toBe('false');
      expect(screen.getByRole('slider', { name: 'Low' })).toBeTruthy();
    });
  });

  describe('EQ & Filters internal layout (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.5/§1.6 — flattened, no intermediate grouping panel)', () => {
    it('eq3, filterLPF, and filterHPF are direct siblings of one shared PanelGroup, in that order — no intermediate wrapper between them', () => {
      renderOpen(<AudioRigDrawer />);
      const eqEffectBlock = screen.getByText('3-Band EQ').closest('.audio-rig-drawer__effect-block')!;
      const lpfEffectBlock = screen.getByText('Low-Pass Filter').closest('.audio-rig-drawer__effect-block')!;
      const hpfEffectBlock = screen.getByText('High-Pass Filter').closest('.audio-rig-drawer__effect-block')!;

      const eqParentGroup = eqEffectBlock.parentElement!;
      const lpfParentGroup = lpfEffectBlock.parentElement!;
      const hpfParentGroup = hpfEffectBlock.parentElement!;
      // All 3 effect-blocks share the exact same parent — one shared PanelGroup, not a
      // DirectionalPanel (no shared Cabinetry facade — see the "own facade per block" test below).
      expect(eqParentGroup).toBe(lpfParentGroup);
      expect(lpfParentGroup).toBe(hpfParentGroup);
      expect(eqParentGroup.classList.contains('sc-panel-group')).toBe(true);

      // DOM order: eq3, then filterLPF, then filterHPF.
      expect(eqEffectBlock.compareDocumentPosition(lpfEffectBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(lpfEffectBlock.compareDocumentPosition(hpfEffectBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('eq3, filterLPF, and filterHPF each keep their own independent Cabinetry facade — not one shared facade (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md\'s "Separate facades" amendment)', () => {
      renderOpen(<AudioRigDrawer />);
      const eqFacade = screen.getByText('3-Band EQ').closest('.sc-directional-panel-facade')!;
      const lpfFacade = screen.getByText('Low-Pass Filter').closest('.sc-directional-panel-facade')!;
      const hpfFacade = screen.getByText('High-Pass Filter').closest('.sc-directional-panel-facade')!;
      expect(eqFacade).not.toBeNull();
      expect(lpfFacade).not.toBeNull();
      expect(hpfFacade).not.toBeNull();
      expect(eqFacade).not.toBe(lpfFacade);
      expect(lpfFacade).not.toBe(hpfFacade);
      expect(eqFacade).not.toBe(hpfFacade);
    });

    it('stacks one-per-row (column) on mobile/tablet', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      renderOpen(<AudioRigDrawer />);
      const content = screen.getByText('3-Band EQ').closest('.audio-rig-drawer__effect-block')!.parentElement!;
      expect(content.getAttribute('data-orientation')).toBe('column');
    });

    it('shares one row (data-orientation="row") on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      renderOpen(<AudioRigDrawer />);
      const content = screen.getByText('3-Band EQ').closest('.audio-rig-drawer__effect-block')!.parentElement!;
      expect(content.getAttribute('data-orientation')).toBe('row');
    });

    it('applies no flexBasis override to eq3/filterLPF/filterHPF on desktop — equal thirds via DirectionalPanel.css\'s own flex: 1 1 0 default', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      renderOpen(<AudioRigDrawer />);
      for (const label of ['3-Band EQ', 'Low-Pass Filter', 'High-Pass Filter']) {
        const effectBlock = screen.getByText(label).closest('.audio-rig-drawer__effect-block') as HTMLElement;
        expect(effectBlock.style.flexBasis, label).toBe('');
      }
    });

    it('applies no flexBasis override on mobile/tablet', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      renderOpen(<AudioRigDrawer />);
      for (const label of ['3-Band EQ', 'Low-Pass Filter', 'High-Pass Filter']) {
        const effectBlock = screen.getByText(label).closest('.audio-rig-drawer__effect-block') as HTMLElement;
        expect(effectBlock.style.flexBasis, label).toBe('');
      }
    });

    it('applies no flexBasis override to any other block (Delay, Reverb, Compressor, Limiter)', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      renderOpen(<AudioRigDrawer />);
      for (const label of ['Delay', 'Reverb', 'Compressor', 'Limiter']) {
        const effectBlock = screen.getByText(label).closest('.audio-rig-drawer__effect-block') as HTMLElement;
        expect(effectBlock.style.flexBasis, label).toBe('');
      }
    });

    it('Time & Space wraps Delay/Reverb in one shared responsive PanelGroup; Output wraps Compressor/Limiter in a fixed-column PanelGroup — neither is a DirectionalPanel, so neither claims a shared facade', () => {
      renderOpen(<AudioRigDrawer />);

      // Delay and Reverb share one further .sc-panel-group ancestor above their own block panel —
      // same shape as eq3/filterLPF/filterHPF's outer PanelGroup above.
      const delayBlock = screen.getByText('Delay').closest('.sc-directional-panel')!.closest('.audio-rig-drawer__effect-block')!;
      const reverbBlock = screen.getByText('Reverb').closest('.sc-directional-panel')!.closest('.audio-rig-drawer__effect-block')!;
      const delayOuterGroup = delayBlock.parentElement;
      const reverbOuterGroup = reverbBlock.parentElement;
      expect(delayOuterGroup).not.toBeNull();
      expect(delayOuterGroup).toBe(reverbOuterGroup);
      expect(delayOuterGroup?.classList.contains('sc-panel-group')).toBe(true);
      expect(delayOuterGroup?.getAttribute('data-orientation')).toBe('row');
      // No shared facade — no .sc-directional-panel-facade wraps the PanelGroup itself, and each
      // block keeps its own.
      expect(delayOuterGroup?.closest('.sc-directional-panel-facade')).toBeNull();
      const delayFacade = screen.getByText('Delay').closest('.sc-directional-panel-facade')!;
      const reverbFacade = screen.getByText('Reverb').closest('.sc-directional-panel-facade')!;
      expect(delayFacade).not.toBeNull();
      expect(reverbFacade).not.toBeNull();
      expect(delayFacade).not.toBe(reverbFacade);

      // Output's Compressor/Limiter now share one further .sc-panel-group ancestor too — fixed
      // column, so it stays stacked at every breakpoint (Compressor/Limiter never share a row,
      // unlike EQ & Filters or Time & Space) — and, same as above, keep independent facades.
      const compressorBlock = screen.getByText('Compressor').closest('.sc-directional-panel')!.closest('.audio-rig-drawer__effect-block')!;
      const limiterBlock = screen.getByText('Limiter').closest('.sc-directional-panel')!.closest('.audio-rig-drawer__effect-block')!;
      const compressorOuterGroup = compressorBlock.parentElement;
      const limiterOuterGroup = limiterBlock.parentElement;
      expect(compressorOuterGroup).not.toBeNull();
      expect(compressorOuterGroup).toBe(limiterOuterGroup);
      expect(compressorOuterGroup?.classList.contains('sc-panel-group')).toBe(true);
      expect(compressorOuterGroup?.getAttribute('data-orientation')).toBe('column');
      expect(compressorOuterGroup?.closest('.sc-directional-panel-facade')).toBeNull();
      const compressorFacade = screen.getByText('Compressor').closest('.sc-directional-panel-facade')!;
      const limiterFacade = screen.getByText('Limiter').closest('.sc-directional-panel-facade')!;
      expect(compressorFacade).not.toBeNull();
      expect(limiterFacade).not.toBeNull();
      expect(compressorFacade).not.toBe(limiterFacade);
    });
  });

  describe('Delay/Reverb param rows (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.7 — every slider own row, at every breakpoint, no paired topRow)', () => {
    it('Delay renders Time, Feedback, and Mix as 3 direct param-rows inside its own block panel — no nested row wrapper', () => {
      renderOpen(<AudioRigDrawer />);
      const delayBlockContent = screen.getByText('Delay').closest('.sc-directional-panel')!
        .querySelector(':scope > .sc-directional-panel__content')!;
      const directRows = delayBlockContent.querySelectorAll(':scope > .audio-rig-drawer__param-row');
      expect(directRows).toHaveLength(3);
      expect(delayBlockContent.querySelector(':scope > .sc-directional-panel')).toBeNull();
    });

    it('Reverb renders Decay, Pre-Delay, and Mix as 3 direct param-rows inside its own block panel — no nested row wrapper', () => {
      renderOpen(<AudioRigDrawer />);
      const reverbBlockContent = screen.getByText('Reverb').closest('.sc-directional-panel')!
        .querySelector(':scope > .sc-directional-panel__content')!;
      const directRows = reverbBlockContent.querySelectorAll(':scope > .audio-rig-drawer__param-row');
      expect(directRows).toHaveLength(3);
      expect(reverbBlockContent.querySelector(':scope > .sc-directional-panel')).toBeNull();
    });
  });

  it('Delay/Reverb/Compressor/Limiter (no LFO group) render as column-orientation blocks', () => {
    renderOpen(<AudioRigDrawer />);
    for (const label of ['Delay', 'Reverb', 'Compressor', 'Limiter']) {
      const panel = screen.getByText(label).closest('.sc-directional-panel')!;
      expect(panel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation'), label).toBe('column');
    }
  });

  it("3-Band EQ's, Low-Pass's, and High-Pass's own sliders all render in a row-orientation panel — every other group's sliders panel stays column (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.4: filterLPF/filterHPF's Frequency/Resonance reverted to 'vertical', so AudioRigLfoGroup's existing 'row if any param is vertical' heuristic now resolves 'row' for them too, same as eq3)", () => {
    renderOpen(<AudioRigDrawer />);
    const eqSlidersPanel = screen.getByRole('slider', { name: 'Low' }).closest('.sc-directional-panel') as HTMLElement;
    expect(eqSlidersPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');

    const [lpfSlidersPanel, hpfSlidersPanel] = screen.getAllByRole('slider', { name: 'Frequency' }).map(
      (el) => el.closest('.sc-directional-panel') as HTMLElement,
    );
    expect(lpfSlidersPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    expect(hpfSlidersPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');

    // The outer group panel that wraps [sliders-panel, Lfo, driftContent] is always column,
    // regardless of the sliders panel's own orientation — otherwise the shared Lfo display and
    // Drift sliders would get squeezed into eq3's row layout alongside Low/Mid/High.
    const eqGroupPanel = eqSlidersPanel.parentElement!.closest('.sc-directional-panel') as HTMLElement;
    expect(eqGroupPanel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
  });

  it('no longer renders a Chorus accordion', () => {
    renderOpen(<AudioRigDrawer />);
    expect(screen.queryByText('Chorus')).toBeNull();
  });

  it('renders a param control bound to its live store value', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, compressor: { ...s.globalAudio.compressor, threshold: -12 } },
    }));
    renderOpen(<AudioRigDrawer />);
    // Compressor and Limiter both have a "Threshold" param — Compressor's
    // accordion renders first in the new chain order, so index [0] is its own.
    const thresholdSlider = screen.getAllByRole('slider', { name: 'Threshold' })[0];
    expect(thresholdSlider.getAttribute('aria-valuenow')).toBe('-12');
  });

  it('shows a visible numeric value for unitless params (Resonance/Q on LPF and HPF) — regression: the value text used to be hidden entirely when schema.unit was absent', () => {
    useAudioStore.setState((s) => ({
      globalAudio: {
        ...s.globalAudio,
        filterLPF: { ...s.globalAudio.filterLPF, Q: 5 },
        filterHPF: { ...s.globalAudio.filterHPF, Q: 8 },
      },
    }));
    renderOpen(<AudioRigDrawer />);
    // LPF and HPF both have a "Resonance" param — LPF's accordion renders first.
    const [lpfResonance, hpfResonance] = screen.getAllByRole('slider', { name: 'Resonance' });
    expect(lpfResonance.closest('.sc-slider-log')?.textContent).toContain('5');
    expect(hpfResonance.closest('.sc-slider-log')?.textContent).toContain('8');
  });

  it('dragging a param control calls setGlobalAudio with the right effect/field/value', () => {
    renderOpen(<AudioRigDrawer />);
    const thresholdSlider = screen.getAllByRole('slider', { name: 'Threshold' })[0];
    thresholdSlider.focus();
    fireEvent.keyDown(thresholdSlider, { key: 'ArrowRight' }); // default step 1, from default -24
    expect(useAudioStore.getState().globalAudio.compressor.threshold).toBe(-23);
  });

  it('a single arrow-key press on a Delay slider moves by a small increment, not straight to max — regression: sliderLinear schemas with a full range <= 1 and no explicit step used to act like toggles', () => {
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, delay: { ...s.globalAudio.delay, delayTime: 0.5 } },
    }));
    renderOpen(<AudioRigDrawer />);
    const delayTimeSlider = screen.getByRole('slider', { name: 'Time' });
    delayTimeSlider.focus();
    fireEvent.keyDown(delayTimeSlider, { key: 'ArrowRight' });

    const newValue = useAudioStore.getState().globalAudio.delay.delayTime;
    expect(newValue).toBeGreaterThan(0.5);
    expect(newValue).toBeLessThan(1); // must not jump straight to max in one press
  });

  it('renders no rig-wide bypass switch or per-effect Enabled toggles — removed, off states are expressed via the sliders themselves', () => {
    renderOpen(<AudioRigDrawer />);
    expect(screen.queryByRole('switch', { name: 'Bypass (this may be loud or distorted)' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Compressor Enabled' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Reverb Enabled' })).toBeNull();
  });

  it('every param control renders enabled — no drawer-level disabling concept left', () => {
    renderOpen(<AudioRigDrawer />);
    const thresholdSlider = screen.getAllByRole('slider', { name: 'Threshold' })[0];
    expect(thresholdSlider.getAttribute('data-disabled')).toBeNull();
  });

  describe('shared LFO display (LFO_CONSOLIDATED_DISPLAY — replaces the old nested per-slider accordion)', () => {
    it('renders exactly one shared LFO display per LFO-bearing block — 3 total (eq3, filterLPF, filterHPF), never one per param', () => {
      const { container } = renderOpen(<AudioRigDrawer />);
      // A plain count of the shared display's own root class also proves "not one per param" —
      // 7 GlobalLfoTargetId params would otherwise render 7.
      expect(container.querySelectorAll('.sc-lfo')).toHaveLength(3);
    });

    it('renders no shared LFO display for delay, reverb, compressor, or limiter — none of their params carry lfoTarget', () => {
      renderOpen(<AudioRigDrawer />);
      const thresholdSlider = screen.getAllByRole('slider', { name: 'Threshold' })[0]; // Compressor's
      const accordionContent = thresholdSlider.closest('.sc-accordion__content-inner');
      expect(accordionContent?.querySelector('.sc-lfo')).toBeNull();
    });

    it('renders no accordion nested inside eq3/filterLPF/filterHPF\'s own accordion — the shared display is plain content', () => {
      renderOpen(<AudioRigDrawer />);
      const eqAccordionContent = screen.getByRole('slider', { name: 'Low' }).closest('.sc-accordion__content-inner')!;
      expect(eqAccordionContent.querySelectorAll('.sc-accordion')).toHaveLength(0);
    });

    it('shows the targeted param\'s own name as the shared display\'s label, defaulting to the group\'s first param', () => {
      renderOpen(<AudioRigDrawer />);
      const eqAccordionContent = screen.getByRole('slider', { name: 'Low' }).closest('.sc-accordion__content-inner')!;
      expect(eqAccordionContent.querySelector('.sc-lfo')?.textContent).toContain('Low');
    });

    it('binds the default target (eq3.low) to its own globalLfo entry, not DEFAULT_LFO_SETTINGS', () => {
      useAudioStore.setState((s) => ({
        globalLfo: { ...s.globalLfo, 'eq3.low': { shape: 'square', rate: 5, depth: 60 } },
      }));
      renderOpen(<AudioRigDrawer />);

      const rateSlider = screen.getAllByRole('slider', { name: 'Rate' })[0];
      const depthSlider = screen.getAllByRole('slider', { name: 'Depth' })[0];

      expect(rateSlider.getAttribute('aria-valuenow')).toBe('5');
      expect(depthSlider.getAttribute('aria-valuenow')).toBe('60');
    });

    it('dragging the shared display\'s rate slider off 0 calls setGlobalLfo for the currently-targeted field (eq3.low by default)', () => {
      renderOpen(<AudioRigDrawer />);
      const rateSlider = screen.getAllByRole('slider', { name: 'Rate' })[0]; // eq3's shared display, defaulting to eq3.low
      expect(useAudioStore.getState().globalLfo['eq3.low'].rate).toBe(0);

      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

      expect(useAudioStore.getState().globalLfo['eq3.low'].rate).toBeGreaterThan(0);
    });

    it('the shared LFO display is enabled by default — no parent-effect enabled/disabled concept left to gate it', () => {
      renderOpen(<AudioRigDrawer />);
      const rateSlider = screen.getAllByRole('slider', { name: 'Rate' })[0];
      expect(rateSlider.getAttribute('data-disabled')).toBeNull();
    });

    it('renders no status light on the parent EQ & Filters accordion — the feature was removed entirely', () => {
      renderOpen(<AudioRigDrawer />);
      const eqFiltersTrigger = screen.getByRole('button', { name: /EQ & Filters/i });
      expect(eqFiltersTrigger.querySelector('.sc-accordion__light')).toBeNull();
    });

    it('does not auto-open the parent EQ & Filters accordion just because eq3\'s LFO-tied target is active', () => {
      useAudioStore.setState((s) => ({
        globalLfo: { ...s.globalLfo, 'eq3.low': { shape: 'square', rate: 5, depth: 60 } },
      }));
      // Plain render, deliberately — this test asserts the section is still closed, which renderOpen() would defeat.
      render(<AudioRigDrawer />);
      const eqFiltersTrigger = screen.getByRole('button', { name: /EQ & Filters/i });
      expect(eqFiltersTrigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('clicking a different band\'s row (click-around, not just the slider) marks that row targeted, once the transition completes', async () => {
      renderOpen(<AudioRigDrawer />);
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
      renderOpen(<AudioRigDrawer />);
      const highSlider = screen.getByRole('slider', { name: 'High' });
      // Wrapped in an async act() so the transition's microtask-resolved onComplete (see
      // useLfoTargetGroup.ts's select()) is flushed before any assertion runs.
      await act(async () => {
        highSlider.focus();
      });

      await waitFor(() => {
        expect(screen.getByRole('slider', { name: 'High' }).closest('.sc-lfo-target-group__row')?.classList.contains('isActive')).toBe(true);
      });

      const rateSlider = screen.getAllByRole('slider', { name: 'Rate' })[0];
      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

      expect(useAudioStore.getState().globalLfo['eq3.high'].rate).toBeGreaterThan(0);
      expect(useAudioStore.getState().globalLfo['eq3.low'].rate).toBe(0);
    });
  });

  describe('Reverb (Task 11)', () => {
    it('renders no dampening slider — dead, removed', () => {
      renderOpen(<AudioRigDrawer />);
      expect(screen.queryByRole('slider', { name: 'Dampening' })).toBeNull();
    });
  });

  describe('Compressor sub-rows (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.8)', () => {
    it('Threshold+Ratio and Attack+Release pairs stack (column) on mobile/tablet', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      renderOpen(<AudioRigDrawer />);
      const thresholdRow = screen.getAllByRole('slider', { name: 'Threshold' })[0].closest('.sc-directional-panel')!;
      const attackRow = screen.getByRole('slider', { name: 'Attack' }).closest('.sc-directional-panel')!;
      expect(thresholdRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });

    it('Threshold+Ratio and Attack+Release pairs share a row (row) on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      renderOpen(<AudioRigDrawer />);
      const thresholdRow = screen.getAllByRole('slider', { name: 'Threshold' })[0].closest('.sc-directional-panel')!;
      const attackRow = screen.getByRole('slider', { name: 'Attack' }).closest('.sc-directional-panel')!;
      expect(thresholdRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });

    it('Knee and the Decay Mode radio each render as their own direct param-row — no shared wrapper between them', () => {
      renderOpen(<AudioRigDrawer />);
      const kneeRow = screen.getByRole('slider', { name: 'Knee' }).closest('.audio-rig-drawer__param-row')!;
      const decayModeRow = screen.getByRole('radio', { name: 'Natural Decay' }).closest('.audio-rig-drawer__param-row')!;
      expect(kneeRow).not.toBe(decayModeRow);
      // Both are direct children of the Compressor block's own panel content — no
      // intermediate DirectionalPanel wraps them together.
      const compressorContent = screen.getAllByRole('slider', { name: 'Threshold' })[0]
        .closest('.audio-rig-drawer__effect-block')!
        .querySelector('.sc-directional-panel > .sc-directional-panel__content')!;
      expect(kneeRow.parentElement).toBe(compressorContent);
      expect(decayModeRow.parentElement).toBe(compressorContent);
    });
  });

  describe('Decay radio button', () => {
    it('renders both options, defaulting to Natural Decay selected (compressorBeforeDelay: false)', () => {
      renderOpen(<AudioRigDrawer />);
      expect(screen.getByRole('radio', { name: 'Natural Decay' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('radio', { name: 'Controlled Decay' }).getAttribute('aria-checked')).toBe('false');
    });

    it('clicking Controlled Decay calls setCompressorBeforeDelay(true)', () => {
      renderOpen(<AudioRigDrawer />);
      expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(false);

      fireEvent.click(screen.getByRole('radio', { name: 'Controlled Decay' }));

      expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(true);
    });

    it('once compressorBeforeDelay is true, Controlled Decay reads as selected and Natural Decay does not', () => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, compressorBeforeDelay: true } }));
      renderOpen(<AudioRigDrawer />);

      expect(screen.getByRole('radio', { name: 'Controlled Decay' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('radio', { name: 'Natural Decay' }).getAttribute('aria-checked')).toBe('false');
    });

    it('clicking Natural Decay while Controlled Decay is active calls setCompressorBeforeDelay(false)', () => {
      useAudioStore.setState((s) => ({
        globalAudio: { ...s.globalAudio, compressorBeforeDelay: true },
      }));
      renderOpen(<AudioRigDrawer />);

      fireEvent.click(screen.getByRole('radio', { name: 'Natural Decay' }));

      expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(false);
    });

    it('lives inside the Compressor panel, under its other params — not the master row', () => {
      renderOpen(<AudioRigDrawer />);
      const decayRadio = screen.getByRole('radio', { name: 'Natural Decay' });
      const compressorPanel = screen.getByText('Compressor').closest('.sc-directional-panel');
      expect(compressorPanel?.contains(decayRadio)).toBe(true);
      expect(compressorPanel?.textContent).toContain('Threshold');
    });

    it('renders enabled — no parent-effect enabled/disabled concept left to gate it', () => {
      renderOpen(<AudioRigDrawer />);
      expect(screen.getByRole('radio', { name: 'Natural Decay' }).getAttribute('data-disabled')).toBeNull();
    });
  });

  describe('Drift (LFO_CONSOLIDATED_DISPLAY — eq3/filterLPF/filterHPF\'s own drift moved inside their own accordion)', () => {
    it('no longer renders Robot Drift anywhere — moved to the robot/company Source accordion (SignatureArrayDrawer)', () => {
      renderOpen(<AudioRigDrawer />);
      expect(screen.queryByText('Robot Drift')).toBeNull();
      expect(screen.queryByText('EQ Drift')).toBeNull();
      expect(screen.queryByText('Low-Pass Drift')).toBeNull();
      expect(screen.queryByText('High-Pass Drift')).toBeNull();
    });

    it('still renders 3 Rate Drift / Depth Drift slider pairs — eq3/filterLPF/filterHPF\'s own (robots\' pair moved out)', () => {
      renderOpen(<AudioRigDrawer />);
      expect(screen.getAllByRole('slider', { name: 'Rate Drift' })).toHaveLength(3);
      expect(screen.getAllByRole('slider', { name: 'Depth Drift' })).toHaveLength(3);
    });

    it("eq3's own Rate/Depth Drift sliders render inside eq3's own panel, directly beneath its shared LFO display — not a separate titled block", () => {
      renderOpen(<AudioRigDrawer />);
      const eqPanel = screen.getByText('3-Band EQ').closest('.sc-directional-panel') as HTMLElement;
      expect(eqPanel.textContent).toContain('Rate Drift');
      expect(eqPanel.textContent).toContain('Depth Drift');
    });

    it('shows each group\'s own current lfoDrift values as a -100..100 percent, not the internal -1..1 fraction', () => {
      useAudioStore.setState((s) => ({
        globalAudio: {
          ...s.globalAudio,
          lfoDrift: {
            ...s.globalAudio.lfoDrift,
            eq3: { rateDrift: 0.3, depthDrift: -0.6 },
          },
        },
      }));
      renderOpen(<AudioRigDrawer />);
      const eqPanel = screen.getByText('3-Band EQ').closest('.sc-directional-panel') as HTMLElement;
      expect(within(eqPanel).getByRole('slider', { name: 'Rate Drift' }).getAttribute('aria-valuenow')).toBe('30');
      expect(within(eqPanel).getByRole('slider', { name: 'Depth Drift' }).getAttribute('aria-valuenow')).toBe('-60');
    });

    it('dragging eq3\'s own Rate Drift slider calls setGlobalLfoDrift with \'eq3\' and the dragged percent divided by 100, leaving other groups untouched', () => {
      useAudioStore.setState((s) => ({
        globalAudio: {
          ...s.globalAudio,
          lfoDrift: { ...s.globalAudio.lfoDrift, eq3: { rateDrift: 0, depthDrift: 0 }, filterLPF: { rateDrift: 0.5, depthDrift: 0.5 } },
        },
      }));
      renderOpen(<AudioRigDrawer />);
      const eqPanel = screen.getByText('3-Band EQ').closest('.sc-directional-panel') as HTMLElement;
      const eq3RateSlider = within(eqPanel).getByRole('slider', { name: 'Rate Drift' });
      eq3RateSlider.focus();
      fireEvent.keyDown(eq3RateSlider, { key: 'ArrowRight' });

      const newPercent = Number(eq3RateSlider.getAttribute('aria-valuenow'));
      expect(newPercent).not.toBe(0); // the key press actually moved it
      expect(useAudioStore.getState().globalAudio.lfoDrift.eq3.rateDrift).toBeCloseTo(newPercent / 100);
      expect(useAudioStore.getState().globalAudio.lfoDrift.eq3.depthDrift).toBe(0);
      expect(useAudioStore.getState().globalAudio.lfoDrift.filterLPF).toEqual({ rateDrift: 0.5, depthDrift: 0.5 });
    });

    it('all 6 sliders (3 groups x 2) render enabled — no rig-wide bypass left to disable them', () => {
      renderOpen(<AudioRigDrawer />);
      const sliders = [
        ...screen.getAllByRole('slider', { name: 'Rate Drift' }),
        ...screen.getAllByRole('slider', { name: 'Depth Drift' }),
      ];
      expect(sliders).toHaveLength(6);
      for (const slider of sliders) {
        expect(slider.getAttribute('data-disabled')).toBeNull();
      }
    });
  });

  describe('Ping Variance Automation slider (Task 6)', () => {
    it('renders exactly once, showing the store\'s current fraction as a 0-100 percent', () => {
      useAudioStore.setState({ pingVarianceAutomation: 0.42 });
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      expect(slider.getAttribute('aria-valuenow')).toBe('42');
    });

    it('dragging it calls setPingVarianceAutomation with the dragged percent divided by 100', () => {
      useAudioStore.setState({ pingVarianceAutomation: 0.5 });
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowRight' });

      const newPercent = Number(slider.getAttribute('aria-valuenow'));
      expect(newPercent).not.toBe(50); // the key press actually moved it
      expect(useAudioStore.getState().pingVarianceAutomation).toBeCloseTo(newPercent / 100);
    });

    it('renders enabled — no rig-wide bypass left to disable it', () => {
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      expect(slider.getAttribute('data-disabled')).toBeNull();
    });

    it('renders inside Transport & Composition\'s Speed & Automation panel — no longer a bare control outside any accordion', () => {
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      const panel = slider.closest('.sc-directional-panel');
      expect(panel!.querySelector('.sc-dual-label__human')?.textContent).toBe('Speed & Automation');
      expect(slider.closest('.sc-accordion')?.textContent).toContain('Transport & Composition');
    });

    it('renders inside its own .audio-rig-drawer__param-row — a dedicated single-control wrapper, matching every other param in this drawer, so its own live box-count measurement reads its own fair share of the panel rather than the whole shared Speed & Automation panel', () => {
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Automatic Effects' });
      expect(slider.closest('.audio-rig-drawer__param-row')).toBeTruthy();
    });
  });

  describe('Tempo slider (BPM Control Task 5)', () => {
    it('renders exactly once, showing the store\'s current bpm directly — no scaling', () => {
      useAudioStore.setState({ bpm: 72 });
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Tempo' });
      expect(slider.getAttribute('aria-valuenow')).toBe('72');
    });

    it('dragging it calls setBPM directly with the dragged value — no conversion', () => {
      useAudioStore.setState({ bpm: 72 });
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Tempo' });
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowRight' });

      const newValue = Number(slider.getAttribute('aria-valuenow'));
      expect(newValue).not.toBe(72); // the key press actually moved it
      expect(useAudioStore.getState().bpm).toBe(newValue);
    });

    it('renders enabled — no rig-wide bypass left to disable it', () => {
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Tempo' });
      expect(slider.getAttribute('data-disabled')).toBeNull();
    });

    it('renders inside Transport & Composition\'s Speed & Automation panel — no longer a bare control outside any accordion', () => {
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Tempo' });
      const panel = slider.closest('.sc-directional-panel');
      expect(panel!.querySelector('.sc-dual-label__human')?.textContent).toBe('Speed & Automation');
      expect(slider.closest('.sc-accordion')?.textContent).toContain('Transport & Composition');
    });

    it('renders before Automatic Effects, inside the same Speed & Automation panel', () => {
      renderOpen(<AudioRigDrawer />);
      const pingSlider = screen.getByRole('slider', { name: 'Automatic Effects' });
      const tempoSlider = screen.getByRole('slider', { name: 'Tempo' });
      const pingPanel = pingSlider.closest('.sc-directional-panel');
      const tempoPanel = tempoSlider.closest('.sc-directional-panel');
      expect(tempoPanel).toBe(pingPanel);
      // DOM order: Tempo comes before Automatic Effects within the shared panel.
      expect(tempoSlider.compareDocumentPosition(pingSlider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('renders inside its own .audio-rig-drawer__param-row — a dedicated single-control wrapper, matching every other param in this drawer, so its own live box-count measurement reads its own fair share of the panel rather than the whole shared Speed & Automation panel', () => {
      renderOpen(<AudioRigDrawer />);
      const slider = screen.getByRole('slider', { name: 'Tempo' });
      expect(slider.closest('.audio-rig-drawer__param-row')).toBeTruthy();
    });

    it("Tempo and Automatic Effects each get their own separate .audio-rig-drawer__param-row — not sharing one wrapper between them", () => {
      renderOpen(<AudioRigDrawer />);
      const tempoSlider = screen.getByRole('slider', { name: 'Tempo' });
      const pingSlider = screen.getByRole('slider', { name: 'Automatic Effects' });
      const tempoRow = tempoSlider.closest('.audio-rig-drawer__param-row');
      const pingRow = pingSlider.closest('.audio-rig-drawer__param-row');
      expect(tempoRow).toBeTruthy();
      expect(pingRow).toBeTruthy();
      expect(tempoRow).not.toBe(pingRow);
    });
  });

  // Audio Load Budget (docs/specs/AUDIO_LOAD_BUDGET.md §4.5, decision F) — next to Tempo in Transport & Composition.
  describe('Audio Load panel', () => {
    const presetRadio = (name: string) => screen.getByRole('radio', { name });
    const loadSlider = () => screen.getByRole('slider', { name: 'Audio Load' });
    const selectedPresets = () =>
      ['Light', 'Standard', 'Full'].filter((name) => presetRadio(name).getAttribute('aria-checked') === 'true');

    it('renders inside Transport & Composition, in its own Audio Load panel', () => {
      renderOpen(<AudioRigDrawer />);
      const panel = loadSlider().closest('.sc-directional-panel')!;
      expect(panel.querySelector('.sc-dual-label__human')?.textContent).toBe('Audio Load');
      expect(loadSlider().closest('.sc-accordion')?.textContent).toContain('Transport & Composition');
      // ... next to Tempo: the same accordion, a different panel
      const tempoPanel = screen.getByRole('slider', { name: 'Tempo' }).closest('.sc-directional-panel');
      expect(tempoPanel).not.toBe(panel);
      expect(tempoPanel!.closest('.sc-accordion')).toBe(loadSlider().closest('.sc-accordion'));
    });

    it('shows the store’s dial as a percent, with the matching preset selected', () => {
      useAudioStore.setState({ audioLoad: 0.2 });
      renderOpen(<AudioRigDrawer />);
      expect(loadSlider().getAttribute('aria-valuenow')).toBe('20');
      expect(selectedPresets()).toEqual(['Light']);
    });

    it('selecting a preset sets audioLoad to its value and the slider follows', () => {
      renderOpen(<AudioRigDrawer />);
      fireEvent.click(presetRadio('Light'));
      expect(useAudioStore.getState().audioLoad).toBe(0.2);
      expect(loadSlider().getAttribute('aria-valuenow')).toBe('20');
      fireEvent.click(presetRadio('Standard'));
      expect(useAudioStore.getState().audioLoad).toBe(0.6);
      expect(loadSlider().getAttribute('aria-valuenow')).toBe('60');
      fireEvent.click(presetRadio('Full'));
      expect(useAudioStore.getState().audioLoad).toBe(1);
      expect(selectedPresets()).toEqual(['Full']);
    });

    it('dragging the slider updates audioLoad and clears the radio selection when it lands between presets', () => {
      renderOpen(<AudioRigDrawer />);
      expect(selectedPresets()).toEqual(['Full']);
      loadSlider().focus();
      fireEvent.keyDown(loadSlider(), { key: 'ArrowLeft' });

      expect(useAudioStore.getState().audioLoad).toBeCloseTo(0.99, 5);
      expect(selectedPresets()).toEqual([]);
    });

    it('re-selects a preset when the slider lands exactly on it', () => {
      useAudioStore.setState({ audioLoad: 0.59 });
      renderOpen(<AudioRigDrawer />);
      expect(selectedPresets()).toEqual([]);
      loadSlider().focus();
      fireEvent.keyDown(loadSlider(), { key: 'ArrowRight' });
      expect(useAudioStore.getState().audioLoad).toBeCloseTo(0.6, 5);
      expect(selectedPresets()).toEqual(['Standard']);
    });

    it('shows what the position means, live, in a readout line', () => {
      useAudioStore.setState({ audioLoad: 1 });
      renderOpen(<AudioRigDrawer />);
      const panel = loadSlider().closest('.sc-directional-panel')!;
      expect(panel.textContent).toContain('Up to 12 robots · 16 notes · all LFOs and drift');

      fireEvent.click(presetRadio('Light'));
      expect(panel.textContent).toContain('Up to 4 robots · 8 notes · no drift or filter LFOs');
      expect(panel.textContent).toContain('latency: Playback (applies on next load)');
    });

    it('is a plain store write: no engine call from the panel (the budget system reacts)', () => {
      renderOpen(<AudioRigDrawer />);
      const before = { ...useAudioStore.getState() };
      fireEvent.click(presetRadio('Light'));
      const after = useAudioStore.getState();
      expect({ ...after, audioLoad: before.audioLoad }).toEqual(before);
    });

    it('renders enabled, with keyboard and radio semantics from the shared primitives', () => {
      renderOpen(<AudioRigDrawer />);
      expect(loadSlider().getAttribute('data-disabled')).toBeNull();
      expect(presetRadio('Light').getAttribute('data-disabled')).toBeNull();
    });

    it('a change of audioLoad re-renders only the Audio Load controls, not Tempo or any effect control', () => {
      renderOpen(<AudioRigDrawer />);
      const calls = (id: string) =>
        (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(([schema]) => schema.id === id).length;
      const tempoBefore = calls('audioRig.bpm');
      const delayBefore = calls('delay.wet');
      const loadBefore = calls('audioRig.audioLoad');
      expect(loadBefore).toBeGreaterThan(0);

      act(() => useAudioStore.getState().setAudioLoad(0.3));

      expect(calls('audioRig.audioLoad')).toBeGreaterThan(loadBefore);
      expect(calls('audioRig.bpm')).toBe(tempoBefore);
      expect(calls('delay.wet')).toBe(delayBefore);
    });
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 9) — each of the 4
  // top-level accordions is scoped to its own trait via getTraitColorStyle, applied directly to
  // AccordionContainer's own style prop (Task 7) — no extra wrapper element.
  describe('trait color scoping', () => {
    function accordionByLabel(label: string) {
      return screen.getByText(label).closest('.sc-accordion') as HTMLElement;
    }

    it('scopes EQ & Filters to the Spectral trait (cyan/indigo)', () => {
      renderOpen(<AudioRigDrawer />);
      const el = accordionByLabel('EQ & Filters');
      expect(el.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.cyan);
      expect(el.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.indigo);
    });

    // Regression test — found live via browser DevTools: --color-accent/--color-accent-gradient
    // must be literal-valued, computed alongside -a/-b (traitColors.ts's buildAccentStyle), never
    // a nested var() reference to them. A nested-var() version passes every -a/-b assertion above
    // (the base properties genuinely do cascade) while still rendering the WRONG gradient, which is
    // exactly why this needs its own explicit check, not just "-a/-b are correct."
    it('also sets --color-accent/--color-accent-gradient as literal values on the accordion — never a var()-reference to --color-accent-a/-b', () => {
      renderOpen(<AudioRigDrawer />);
      const el = accordionByLabel('EQ & Filters');
      expect(el.style.getPropertyValue('--color-accent')).toBe(
        `color-mix(in srgb, ${ACCENT_COLORS.cyan} 50%, ${ACCENT_COLORS.indigo} 50%)`,
      );
      expect(el.style.getPropertyValue('--color-accent-gradient')).toBe(
        `linear-gradient(135deg, ${ACCENT_COLORS.cyan}, ${ACCENT_COLORS.indigo})`,
      );
      expect(el.style.getPropertyValue('--color-accent')).not.toContain('var(');
      expect(el.style.getPropertyValue('--color-accent-gradient')).not.toContain('var(');
    });

    it('scopes Time & Space to the Time/Space trait (purple/pink)', () => {
      renderOpen(<AudioRigDrawer />);
      const el = accordionByLabel('Time & Space');
      expect(el.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.purple);
      expect(el.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.pink);
    });

    it('scopes Output to the Output trait (burnt orange/orange)', () => {
      renderOpen(<AudioRigDrawer />);
      const el = accordionByLabel('Output');
      expect(el.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.burntOrange);
      expect(el.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.orange);
    });

    it('scopes Transport & Composition to the Composition trait (emerald/lime)', () => {
      renderOpen(<AudioRigDrawer />);
      const el = accordionByLabel('Transport & Composition');
      expect(el.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.emerald);
      expect(el.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.lime);
    });

    it('gives all 4 top-level accordions distinct trait colors from one another', () => {
      renderOpen(<AudioRigDrawer />);
      const pairs = ['EQ & Filters', 'Time & Space', 'Output', 'Transport & Composition'].map((label) => {
        const el = accordionByLabel(label);
        return `${el.style.getPropertyValue('--color-accent-a')}/${el.style.getPropertyValue('--color-accent-b')}`;
      });
      expect(new Set(pairs).size).toBe(4);
    });

    it('does not add any inline style to a nested per-effect DirectionalPanel — the color reaches it purely via cascade from its parent accordion', () => {
      renderOpen(<AudioRigDrawer />);
      const panel = screen.getByText('3-Band EQ').closest('.sc-directional-panel') as HTMLElement;
      expect(panel.getAttribute('style')).toBeNull();
    });

    it("eq3's own Drift sliders are a physical DOM descendant of the Spectral-scoped EQ & Filters accordion — no separate wrapper or style between them (spec §1.6's 'no dedicated code' claim)", () => {
      renderOpen(<AudioRigDrawer />);
      const eqAccordion = accordionByLabel('EQ & Filters');
      const eq3RateSlider = within(eqAccordion).getAllByRole('slider', { name: 'Rate Drift' })[0];
      expect(eqAccordion.contains(eq3RateSlider)).toBe(true);
    });
  });

  describe('re-render cascade regression (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12 — the end-to-end test this whole plan exists for)', () => {
    function callsFor(schemaId: string): number {
      return (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([schema]) => schema.id === schemaId,
      ).length;
    }

    it("a setGlobalAudio update to ONE field (Delay's delayTime, simulating an audio-swell tick) does not re-execute a SIBLING field's own control (Delay's Mix/wet) — only the changed field's own control re-renders", () => {
      renderOpen(<AudioRigDrawer />);
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
      renderOpen(<AudioRigDrawer />);
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
      renderOpen(<AudioRigDrawer />);
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
    // literal every render — unlike every other primitive's schema in this codebase, which is
    // always a stable, module-level (or memoized) reference. A fresh schema object defeats Lfo's
    // own React.memo unconditionally, regardless of whether displayValue/selectedTarget actually
    // changed. Task 12's own cascade tests never covered the AudioRigLfoGroup path (only
    // Delay/Compressor, neither of which has any lfoTarget params) — a real test-coverage gap.
    it("changing a NON-displayed field within an LFO-bearing block (eq3's mid, while 'low' remains the default-selected/displayed LFO target — useLfoTargetGroup starts at fields[0]) does not re-execute the shared LFO display's own internal controls", () => {
      renderOpen(<AudioRigDrawer />);
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
      renderOpen(<AudioRigDrawer />);
      const lfoRateCallsBefore = callsFor('audioRig.eq3.lfo.rate');

      act(() => {
        useAudioStore.getState().setGlobalLfo('eq3.low', { rate: 3, depth: 50, shape: 'sine' });
      });

      expect(callsFor('audioRig.eq3.lfo.rate')).toBeGreaterThan(lfoRateCallsBefore);
    });
  });
});
