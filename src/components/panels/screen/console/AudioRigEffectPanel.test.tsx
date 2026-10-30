import { Profiler } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act, cleanup } from '@testing-library/react';

// Real lfoEngine would construct a real Tone.LFO on first setter call (getOrCreateLfo -> new
// Tone.LFO(...)), which throws without a real AudioContext.
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));
// The LfoLink lane names follow the shell (docs/tasks/LAYOUT_REWORK.md Task 14); pinned to desk so the
// lane radios read "Core LFO (A)" … whatever stubMatchMedia below answers for the shell's query.
vi.mock('@/components/panels/screen/useShell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/panels/screen/useShell')>()),
  useShell: () => 'desk',
}));

// Spied (real cross-module call, wrapped so it still delegates to the actual implementation) so
// the re-render cascade tests can tell whether a SPECIFIC sibling control's own render body
// re-executed. resolveAccessibleName(schema) is called unconditionally in every slider/radio's
// own render body, with that control's own `schema` object as its argument — filtering the
// spy's calls by `schema.id` isolates one specific control's own re-render count.
vi.mock('@/components/ui/controls/accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

// The LFO Bank engine (docs/tasks/LFO_BANK.md Task 7) — setGlobalLfoLink (audioStore.ts) calls
// this module's linkTarget directly; mocked since the real module would construct a Tone node on
// first call, which throws without a real AudioContext.
vi.mock('../../../../engine/lfoEngine', () => ({
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
import { AudioEngine } from '@/engine/AudioEngine';
import { CONTENT } from '@/content';
import { noteValueEquals, noteValueSeconds, type NoteDivision, type NoteModifier, type NoteValue } from '@/data/noteValues';
import { allowedDelayNoteValues, allowedRateNoteValues } from '@/utils/tempoSync';
import { formatNoteValue } from '@/utils/formatNoteValue';
import { facadeCurrentLabels } from '@/testUtils/toggleFacade';
import * as audioSwells from '@/systems/audioSwells';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS, PEDAL_RATE_RANGE_HZ } from '@/types/globalAudio';
import { DEFAULT_LFO_LINK } from '@/data/lfoConfig';
import { GLOBAL_LFO_TARGET_IDS, type GlobalLfoTargetId } from '@/types/lfo';
import type { LfoLinkValue } from '@/types/controls';

/**
 * AudioRigEffectPanel — one effect's own full content, extracted from AudioRigDrawer.test.tsx
 * (docs/tasks/archive/NAV_LAYOUT_REWRITE.md Task 14) once each effect became its own standalone tree
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

  // docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.3 — reverses AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.7's
  // "every slider own row, no paired topRow" for Delay: Delay Time (over its Tempo Sync toggle) and
  // Repeats share a 'responsive' top row; Delay Amount keeps its own full-width row.
  describe('Delay rows (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.3)', () => {
    function delayContent() {
      return screen.getByText('Delay').closest('.sc-directional-panel')!.querySelector(':scope > .sc-directional-panel__content')!;
    }

    it('is one nested top-row panel followed by one direct param-row (Delay Amount), nothing else', () => {
      render(<AudioRigEffectPanel effectKey="delay" />);
      const content = delayContent();
      const children = [...content.children];
      expect(children).toHaveLength(2);
      expect(children[0].matches('.sc-directional-panel')).toBe(true);
      expect(children[1].matches('.audio-rig-drawer__param-row')).toBe(true);
      expect(within(children[1] as HTMLElement).getByRole('slider', { name: 'Delay Amount' })).toBeTruthy();
      expect(children[0].contains(screen.getByRole('slider', { name: 'Delay Amount' }))).toBe(false);
    });

    it('the top row holds the Tempo Sync composition (Delay Time over its toggle) first, then Repeats, each in its own param-row', () => {
      render(<AudioRigEffectPanel effectKey="delay" />);
      const topRow = delayContent().querySelector(':scope > .sc-directional-panel')!;
      expect(topRow.getAttribute('data-panel-id')).toBe('audioRig.delay.topRow');
      const rows = [...topRow.querySelectorAll(':scope > .sc-directional-panel__content > .audio-rig-drawer__param-row')];
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector('.sc-tempo-sync')).not.toBeNull();
      expect(within(rows[0] as HTMLElement).getByRole('slider', { name: 'Delay Time' })).toBeTruthy();
      expect(within(rows[0] as HTMLElement).getByRole('switch')).toBeTruthy();
      expect(within(rows[1] as HTMLElement).getByRole('slider', { name: 'Repeats' })).toBeTruthy();
      expect(rows[1].querySelector('.sc-tempo-sync')).toBeNull();
    });

    it('the top row is side by side (row) on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(<AudioRigEffectPanel effectKey="delay" />);
      const topRow = delayContent().querySelector(':scope > .sc-directional-panel')!;
      expect(topRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });

    it('the top row stacks (column) on tablet and on mobile, while the block itself stays a column', () => {
      for (const tier of [{ mobile: false, tablet: true }, { mobile: true, tablet: true }]) {
        stubMatchMedia(tier);
        const { unmount } = render(<AudioRigEffectPanel effectKey="delay" />);
        const content = delayContent();
        expect(content.getAttribute('data-orientation'), JSON.stringify(tier)).toBe('column');
        const topRow = content.querySelector(':scope > .sc-directional-panel')!;
        expect(topRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation'), JSON.stringify(tier)).toBe('column');
        unmount();
      }
    });

    it('the nested top row renders unframed — no second Cabinetry facade inside the Delay block', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="delay" />);
      expect(container.querySelectorAll('.sc-directional-panel-facade')).toHaveLength(1);
    });
  });

  // docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.3 — Reverb mirrors Delay: Reverb Length and Pre-Delay
  // share a 'responsive' top row; Reverb Amount keeps its own full-width row.
  describe('Reverb rows (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.3)', () => {
    function reverbContent() {
      return screen.getByText('Reverb').closest('.sc-directional-panel')!.querySelector(':scope > .sc-directional-panel__content')!;
    }

    it('is one nested top-row panel followed by one direct param-row (Reverb Amount), nothing else', () => {
      render(<AudioRigEffectPanel effectKey="reverb" />);
      const children = [...reverbContent().children];
      expect(children).toHaveLength(2);
      expect(children[0].matches('.sc-directional-panel')).toBe(true);
      expect(children[1].matches('.audio-rig-drawer__param-row')).toBe(true);
      expect(within(children[1] as HTMLElement).getByRole('slider', { name: 'Reverb Amount' })).toBeTruthy();
      expect(children[0].contains(screen.getByRole('slider', { name: 'Reverb Amount' }))).toBe(false);
    });

    it('the top row holds Reverb Length then Pre-Delay, each in its own param-row, and keeps Length a log slider', () => {
      render(<AudioRigEffectPanel effectKey="reverb" />);
      const topRow = reverbContent().querySelector(':scope > .sc-directional-panel')!;
      expect(topRow.getAttribute('data-panel-id')).toBe('audioRig.reverb.topRow');
      const rows = [...topRow.querySelectorAll(':scope > .sc-directional-panel__content > .audio-rig-drawer__param-row')];
      expect(rows).toHaveLength(2);
      const length = within(rows[0] as HTMLElement).getByRole('slider', { name: 'Reverb Length' });
      expect(length.closest('.sc-slider-log')).not.toBeNull();
      expect(within(rows[1] as HTMLElement).getByRole('slider', { name: 'Pre-Delay' })).toBeTruthy();
      expect(topRow.querySelector('.sc-tempo-sync')).toBeNull();
      expect(topRow.querySelector('.sc-lfo-link')).toBeNull();
    });

    it('the top row is side by side (row) on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(<AudioRigEffectPanel effectKey="reverb" />);
      const topRow = reverbContent().querySelector(':scope > .sc-directional-panel')!;
      expect(topRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });

    it('the top row stacks (column) on tablet and on mobile, while the block itself stays a column', () => {
      for (const tier of [{ mobile: false, tablet: true }, { mobile: true, tablet: true }]) {
        stubMatchMedia(tier);
        const { unmount } = render(<AudioRigEffectPanel effectKey="reverb" />);
        const content = reverbContent();
        expect(content.getAttribute('data-orientation'), JSON.stringify(tier)).toBe('column');
        const topRow = content.querySelector(':scope > .sc-directional-panel')!;
        expect(topRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation'), JSON.stringify(tier)).toBe('column');
        unmount();
      }
    });

    it('every Reverb slider is still bound to its own live value and edits its own field', () => {
      useAudioStore.setState((s) => ({
        globalAudio: { ...s.globalAudio, reverb: { ...s.globalAudio.reverb, decay: 2.5, preDelay: 0.2, wet: 0.4 } },
      }));
      render(<AudioRigEffectPanel effectKey="reverb" />);
      expect(screen.getByRole('slider', { name: 'Pre-Delay' }).getAttribute('aria-valuenow')).toBe('0.2');
      expect(screen.getByRole('slider', { name: 'Reverb Amount' }).getAttribute('aria-valuenow')).toBe('0.4');
      const preDelay = screen.getByRole('slider', { name: 'Pre-Delay' });
      preDelay.focus();
      fireEvent.keyDown(preDelay, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.reverb.preDelay).toBeCloseTo(0.21, 10);
      expect(useAudioStore.getState().globalAudio.reverb.decay).toBe(2.5);
      expect(useAudioStore.getState().globalAudio.reverb.wet).toBe(0.4);
    });

    // Classic Band Retune row 14: the Pre-Delay slider ends at 0.25 s. At the top it stays there; it never writes 0.26.
    it('the Pre-Delay slider stops at 0.25 s: a step past the top leaves the value at the top', () => {
      useAudioStore.setState((s) => ({
        globalAudio: { ...s.globalAudio, reverb: { ...s.globalAudio.reverb, preDelay: 0.25 } },
      }));
      render(<AudioRigEffectPanel effectKey="reverb" />);
      const preDelay = screen.getByRole('slider', { name: 'Pre-Delay' });
      expect(preDelay.getAttribute('aria-valuemax')).toBe('0.25');
      preDelay.focus();
      fireEvent.keyDown(preDelay, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.reverb.preDelay).toBeLessThanOrEqual(0.25);
    });

    it('the nested top row renders unframed — no second Cabinetry facade inside the Reverb block', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="reverb" />);
      expect(container.querySelectorAll('.sc-directional-panel-facade')).toHaveLength(1);
    });
  });

  it('every effect block renders as a column-orientation panel — eq3/filterLPF/filterHPF included since docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.2 (they were row panels of vertical sliders)', () => {
    for (const [key, label] of [['eq3', '3-Band EQ'], ['filterLPF', 'Low-Pass Filter'], ['filterHPF', 'High-Pass Filter'], ['delay', 'Delay'], ['reverb', 'Reverb'], ['compressor', 'Compressor'], ['limiter', 'Limiter']] as const) {
      const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
      const panel = screen.getByText(label).closest('.sc-directional-panel')!;
      expect(panel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation'), label).toBe('column');
      unmount();
    }
  });

  // docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.2: each band / filter param is one stacked row holding
  // a HORIZONTAL slider, then its LfoLink (Lane left, Depth right — LfoLink.css, Task 1). No new wrapper
  // was needed: paramRow already renders "slider, then LfoLink" in one param-row div.
  describe('EQ & Filters band rows (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.2)', () => {
    const CASES = [
      ['eq3', ['Bass', 'Mid', 'Treble']],
      ['filterLPF', ['Cutoff', 'Resonance']],
      ['filterHPF', ['Cutoff', 'Resonance']],
    ] as const;

    it('renders every EQ band and filter param slider horizontally', () => {
      for (const [key, names] of CASES) {
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        for (const name of names) {
          expect(screen.getByRole('slider', { name }).getAttribute('aria-orientation'), `${key} ${name}`).toBe('horizontal');
        }
        unmount();
      }
    });

    it('stacks the bands/params as direct param-rows of the block, in config order, with no nested row panel', () => {
      for (const [key, names] of CASES) {
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        const content = screen.getByRole('slider', { name: names[0] }).closest('.sc-directional-panel')!
          .querySelector(':scope > .sc-directional-panel__content')!;
        const rows = [...content.querySelectorAll(':scope > .audio-rig-drawer__param-row')];
        expect(rows, key).toHaveLength(names.length);
        rows.forEach((row, i) => {
          expect(within(row as HTMLElement).getByRole('slider', { name: names[i] }), `${key} row ${i}`).toBeTruthy();
        });
        expect(content.querySelector(':scope > .sc-directional-panel'), key).toBeNull();
        unmount();
      }
    });

    it("each row is the band's slider, then its LfoLink with the Lane radio before the Depth slider", () => {
      for (const [key, names] of CASES) {
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        for (const name of names) {
          const slider = screen.getByRole('slider', { name });
          const row = slider.closest('.audio-rig-drawer__param-row') as HTMLElement;
          const link = row.querySelector('.sc-lfo-link') as HTMLElement;
          expect(link, `${key} ${name} link`).toBeTruthy();
          expect(slider.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING, `${key} ${name}: link after slider`).toBeTruthy();
          const lane = within(link).getByRole('radio', { name: 'Off' });
          const depth = within(link).getByRole('slider');
          expect(lane.compareDocumentPosition(depth) & Node.DOCUMENT_POSITION_FOLLOWING, `${key} ${name}: Lane before Depth`).toBeTruthy();
        }
        unmount();
      }
    });
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

  it('a real user edit interrupts any Audio Swell riding that same field (docs/specs/archive/AUDIO_SWELLS.md follow-up)', () => {
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
      expect(within(midRow).getByRole('radio', { name: 'Accent LFO (C)' }).getAttribute('aria-checked')).toBe('true');
      expect(within(midRow).getByRole('slider', { name: 'Depth' }).getAttribute('aria-valuenow')).toBe('65');
      expect(within(lowRow).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    });

    it("choosing a lane on Mid's LfoLink calls setGlobalLfoLink('eq3.mid', { lane, depth })", () => {
      render(<AudioRigEffectPanel effectKey="eq3" />);
      fireEvent.click(within(rowOf('Mid')).getByRole('radio', { name: 'Core LFO (A)' }));

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

      expect(within(row).getByRole('radio', { name: 'Companion LFO (B)' }).getAttribute('aria-checked')).toBe('true');
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

      expect(within(row).getByRole('radio', { name: 'Core LFO (A)' }).getAttribute('aria-checked')).toBe('true');
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

  describe('Compressor sub-rows (docs/specs/archive/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.8)', () => {
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

  describe('Drift removed from every global-chain effect panel (docs/specs/archive/FLEET_DRIFT_CONSOLIDATION.md — eq3/filterLPF/filterHPF\'s own embedded Rate/Depth Drift sliders removed; the merged control now lives in FleetDriftPanel/the Fleet Drift nav leaf, not here)', () => {
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

  // Roadmap Phase 14 (docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md §1.5/§1.6, Task 9) — each effect's
  // own trait, applied directly to its wrapper now that there's no group accordion to cascade
  // one down from (Task 14, docs/tasks/archive/NAV_LAYOUT_REWRITE.md).
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

  // Global Colour (docs/specs/GLOBAL_COLOUR.md §1.4, docs/tasks/GLOBAL_COLOUR.md Task 8): Distortion,
  // Chebyshev and Bit Crusher render through the same panel as every other effect — two sliders each,
  // the colour trait's accent, and no LFO link (colour is not LFO-able).
  describe('Colour panels (Distortion, Chebyshev, Bit Crusher)', () => {
    const PANELS = [
      { key: 'distortion', heading: 'fleet.distortion', sliders: ['fleet.distortion.drive', 'fleet.distortion.mix'] },
      { key: 'chebyshev', heading: 'fleet.chebyshev', sliders: ['fleet.chebyshev.harmonics', 'fleet.chebyshev.mix'] },
      { key: 'bitCrusher', heading: 'fleet.bitCrusher', sliders: ['fleet.bitCrusher.bits', 'fleet.bitCrusher.mix'] },
    ] as const;

    it.each(PANELS)('$key shows its heading and exactly two sliders named from content', ({ key, heading, sliders }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      const block = container.querySelector('.audio-rig-drawer__effect-block') as HTMLElement;
      expect(within(block).getByText(CONTENT[heading].heading)).toBeTruthy();
      const names = within(block).getAllByRole('slider').map((s) => s.getAttribute('aria-label') ?? s.getAttribute('aria-labelledby'));
      expect(within(block).getAllByRole('slider')).toHaveLength(2);
      for (const slider of sliders) {
        expect(within(block).getByRole('slider', { name: CONTENT[slider].human }), `${slider} (${names.join(', ')})`).toBeTruthy();
      }
    });

    it.each(PANELS)('$key is scoped to the colour trait (red/tangerine), as literals', ({ key }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      const el = container.querySelector('.audio-rig-drawer__effect-block') as HTMLElement;
      expect(el.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.red);
      expect(el.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.tangerine);
      expect(el.style.getPropertyValue('--color-accent')).not.toContain('var(');
    });

    it.each(PANELS)('$key has no LFO link rows and no Depth slider', ({ key }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      expect(container.querySelector('.sc-lfo-link')).toBeNull();
      expect(screen.queryByRole('slider', { name: 'Depth' })).toBeNull();
    });

    it('moving Bit Crusher Mix writes only wet — Bit Depth keeps its value', () => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, bitCrusher: { bits: 5, wet: 0.2 } } }));
      render(<AudioRigEffectPanel effectKey="bitCrusher" />);
      const mix = screen.getByRole('slider', { name: CONTENT['fleet.bitCrusher.mix'].human });
      mix.focus();
      fireEvent.keyDown(mix, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.bitCrusher).toEqual({ bits: 5, wet: 0.21 });
    });

    it('moving Distortion Drive writes amount, not wet', () => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, distortion: { amount: 0.3, wet: 0.4 } } }));
      render(<AudioRigEffectPanel effectKey="distortion" />);
      const drive = screen.getByRole('slider', { name: CONTENT['fleet.distortion.drive'].human });
      drive.focus();
      fireEvent.keyDown(drive, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.distortion).toEqual({ amount: 0.31, wet: 0.4 });
    });

    it('Harmonics steps one whole order per key press', () => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, chebyshev: { order: 2, wet: 0.3 } } }));
      render(<AudioRigEffectPanel effectKey="chebyshev" />);
      const harmonics = screen.getByRole('slider', { name: CONTENT['fleet.chebyshev.harmonics'].human });
      harmonics.focus();
      fireEvent.keyDown(harmonics, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.chebyshev).toEqual({ order: 3, wet: 0.3 });
    });

    it('the ends hold: Harmonics stays at 8 past the top, Bit Depth stays at 1 past the bottom', () => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, chebyshev: { order: 8, wet: 0.3 }, bitCrusher: { bits: 1, wet: 0.3 } } }));
      const { unmount } = render(<AudioRigEffectPanel effectKey="chebyshev" />);
      const harmonics = screen.getByRole('slider', { name: CONTENT['fleet.chebyshev.harmonics'].human });
      harmonics.focus();
      fireEvent.keyDown(harmonics, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.chebyshev.order).toBe(8);
      unmount();
      render(<AudioRigEffectPanel effectKey="bitCrusher" />);
      const bits = screen.getByRole('slider', { name: CONTENT['fleet.bitCrusher.bits'].human });
      bits.focus();
      fireEvent.keyDown(bits, { key: 'ArrowLeft' });
      expect(useAudioStore.getState().globalAudio.bitCrusher.bits).toBe(1);
    });

    it('a real user edit asks the swell system to cancel its own (effect, field) pair, like every other effect panel', () => {
      const spy = vi.spyOn(audioSwells, 'cancelSwellForGlobalField');
      render(<AudioRigEffectPanel effectKey="bitCrusher" />);
      const mix = screen.getByRole('slider', { name: CONTENT['fleet.bitCrusher.mix'].human });
      mix.focus();
      fireEvent.keyDown(mix, { key: 'ArrowRight' });
      expect(spy).toHaveBeenCalledWith('bitCrusher', 'wet');
    });

  });

  // Global Modulation (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.6, docs/tasks/GLOBAL_MODULATION_COLOUR.md
  // Task 9): AutoWah and Phaser render through the same panel as every other effect — one slider per Tone
  // parameter, the spectral trait's accent, and no LFO link (neither pedal is LFO-able). Task 11 swaps the
  // Phaser's Rate row for the Free | Sync slider; the slider count below holds either way.
  describe('Modulation panels (AutoWah, Phaser)', () => {
    const PANELS = [
      { key: 'autoWah', heading: 'fleet.autoWah', sliders: ['baseFrequency', 'octaves', 'sensitivity', 'q', 'gain', 'follower', 'mix'] },
      { key: 'phaser', heading: 'fleet.phaser', sliders: ['rate', 'octaves', 'baseFrequency', 'stages', 'q', 'mix'] },
    ] as const;

    it.each(PANELS)('$key shows its heading and one slider per parameter, named from content', ({ key, heading, sliders }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      const block = container.querySelector('.audio-rig-drawer__effect-block') as HTMLElement;
      expect(within(block).getByText(CONTENT[heading].heading)).toBeTruthy();
      expect(within(block).getAllByRole('slider')).toHaveLength(sliders.length);
      for (const slider of sliders) {
        const entry = CONTENT[`${heading}.${slider}` as keyof typeof CONTENT];
        expect(within(block).getByRole('slider', { name: entry.human }), `${heading}.${slider}`).toBeTruthy();
      }
    });

    it.each(PANELS)('$key is scoped to the spectral trait (cyan/indigo), as literals', ({ key }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      const el = container.querySelector('.audio-rig-drawer__effect-block') as HTMLElement;
      expect(el.style.getPropertyValue('--color-accent-a')).toBe(ACCENT_COLORS.cyan);
      expect(el.style.getPropertyValue('--color-accent-b')).toBe(ACCENT_COLORS.indigo);
      expect(el.style.getPropertyValue('--color-accent')).not.toContain('var(');
    });

    it.each(PANELS)('$key has no LFO link rows and no Depth slider', ({ key }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      expect(container.querySelector('.sc-lfo-link')).toBeNull();
      expect(screen.queryByRole('slider', { name: 'Depth' })).toBeNull();
    });

    it('the AutoWah panel has no Free | Sync toggle', () => {
      const { container } = render(<AudioRigEffectPanel effectKey="autoWah" />);
      expect(container.querySelector('[role="switch"], [aria-pressed]')).toBeNull();
    });

    it('moving AutoWah Mix writes only wet — the other six fields keep their values', () => {
      const before = { baseFrequency: 120, octaves: 4, sensitivity: -12, Q: 3, gain: 5, follower: 0.3, wet: 0.2 };
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, autoWah: before } }));
      render(<AudioRigEffectPanel effectKey="autoWah" />);
      const mix = screen.getByRole('slider', { name: CONTENT['fleet.autoWah.mix'].human });
      mix.focus();
      fireEvent.keyDown(mix, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.autoWah).toEqual({ ...before, wet: 0.21 });
    });

    it('moving the Phaser Q writes the capital-Q field, not wet', () => {
      const before = { rate: 0.4, octaves: 3, baseFrequency: 300, stages: 6, Q: 4, wet: 0.2 };
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, phaser: before } }));
      render(<AudioRigEffectPanel effectKey="phaser" />);
      const q = screen.getByRole('slider', { name: CONTENT['fleet.phaser.q'].human });
      q.focus();
      fireEvent.keyDown(q, { key: 'ArrowRight' });
      const after = useAudioStore.getState().globalAudio.phaser;
      expect(after.Q).toBeGreaterThan(4);
      expect({ ...after, Q: 4 }).toEqual(before);
    });

    it.each([
      { from: 6, key: 'ArrowRight', to: 7 },
      { from: 12, key: 'ArrowRight', to: 12 },
      { from: 1, key: 'ArrowLeft', to: 1 },
    ])('Stages at $from after $key reads $to — one whole stage a press, holding at both ends', ({ from, key, to }) => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, phaser: { ...s.globalAudio.phaser, stages: from } } }));
      render(<AudioRigEffectPanel effectKey="phaser" />);
      const stages = screen.getByRole('slider', { name: CONTENT['fleet.phaser.stages'].human });
      stages.focus();
      fireEvent.keyDown(stages, { key });
      expect(useAudioStore.getState().globalAudio.phaser.stages).toBe(to);
    });

    it('AutoWah Sensitivity reads a negative value in dB and steps by whole decibels', () => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, autoWah: { ...s.globalAudio.autoWah, sensitivity: -20 } } }));
      render(<AudioRigEffectPanel effectKey="autoWah" />);
      const sens = screen.getByRole('slider', { name: CONTENT['fleet.autoWah.sensitivity'].human });
      sens.focus();
      fireEvent.keyDown(sens, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.autoWah.sensitivity).toBe(-19);
    });

    it('a real user edit asks the swell system to cancel its own (effect, field) pair, like every other effect panel', () => {
      const spy = vi.spyOn(audioSwells, 'cancelSwellForGlobalField');
      render(<AudioRigEffectPanel effectKey="phaser" />);
      const mix = screen.getByRole('slider', { name: CONTENT['fleet.phaser.mix'].human });
      mix.focus();
      fireEvent.keyDown(mix, { key: 'ArrowRight' });
      expect(spy).toHaveBeenCalledWith('phaser', 'wet');
    });
  });

  // Global Pedals (docs/specs/GLOBAL_PEDALS.md §1.6, docs/tasks/GLOBAL_PEDALS.md Task 10): the four motion pedals
  // and Width render through the same panel as every other effect — one slider per field, the motion pedals in
  // the spectral trait and Width in the output trait, no LFO link. Task 11 swaps the three LFO pedals' Rate row
  // for the Free | Sync slider; the slider count below holds either way.
  describe('Global Pedals panels (Chorus, Tremolo, Vibrato, Shifter, Width)', () => {
    const PANELS = [
      { key: 'chorus', heading: 'fleet.chorus', sliders: ['rate', 'delay', 'depth', 'spread', 'feedback', 'mix'], trait: 'spectral' },
      { key: 'tremolo', heading: 'fleet.tremolo', sliders: ['rate', 'depth', 'spread', 'mix'], trait: 'spectral' },
      { key: 'vibrato', heading: 'fleet.vibrato', sliders: ['rate', 'depth', 'mix'], trait: 'spectral' },
      { key: 'frequencyShifter', heading: 'fleet.frequencyShifter', sliders: ['shift', 'mix'], trait: 'spectral' },
      { key: 'stereoWidener', heading: 'fleet.stereoWidener', sliders: ['width'], trait: 'output' },
    ] as const;
    const TRAIT_ACCENTS = {
      spectral: [ACCENT_COLORS.cyan, ACCENT_COLORS.indigo],
      output: [ACCENT_COLORS.burntOrange, ACCENT_COLORS.orange],
    } as const;

    it.each(PANELS)('$key shows its heading and one slider per parameter, named from content', ({ key, heading, sliders }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      const block = container.querySelector('.audio-rig-drawer__effect-block') as HTMLElement;
      expect(within(block).getByText(CONTENT[heading].heading)).toBeTruthy();
      expect(within(block).getAllByRole('slider')).toHaveLength(sliders.length);
      for (const slider of sliders) {
        const entry = CONTENT[`${heading}.${slider}` as keyof typeof CONTENT];
        expect(within(block).getByRole('slider', { name: entry.human }), `${heading}.${slider}`).toBeTruthy();
      }
    });

    it.each(PANELS)('$key is scoped to the $trait trait, as literals', ({ key, trait }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      const el = container.querySelector('.audio-rig-drawer__effect-block') as HTMLElement;
      expect(el.style.getPropertyValue('--color-accent-a')).toBe(TRAIT_ACCENTS[trait][0]);
      expect(el.style.getPropertyValue('--color-accent-b')).toBe(TRAIT_ACCENTS[trait][1]);
      expect(el.style.getPropertyValue('--color-accent')).not.toContain('var(');
    });

    it.each(PANELS)('$key has no LFO link rows', ({ key }) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      expect(container.querySelector('.sc-lfo-link')).toBeNull();
    });

    it.each(['frequencyShifter', 'stereoWidener'] as const)('the %s panel has no Free | Sync toggle — it has no rate', (key) => {
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      expect(container.querySelector('[role="switch"], [aria-pressed]')).toBeNull();
    });

    it('moving Chorus Mix writes only wet — the other five fields keep their values', () => {
      const before = { rate: 1.5, delayTime: 3.5, depth: 0.7, spread: 180, feedback: 0.1, wet: 0.2 };
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, chorus: before } }));
      render(<AudioRigEffectPanel effectKey="chorus" />);
      const mix = screen.getByRole('slider', { name: CONTENT['fleet.chorus.mix'].human });
      mix.focus();
      fireEvent.keyDown(mix, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.chorus).toEqual({ ...before, wet: 0.21 });
    });

    it('the Chorus Delay slider writes delayTime, in half-millisecond steps', () => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, chorus: { ...s.globalAudio.chorus, delayTime: 3.5 } } }));
      render(<AudioRigEffectPanel effectKey="chorus" />);
      const delay = screen.getByRole('slider', { name: CONTENT['fleet.chorus.delay'].human });
      delay.focus();
      fireEvent.keyDown(delay, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.chorus.delayTime).toBe(4);
    });

    it.each([
      { from: 0, key: 'ArrowLeft', to: -1 },
      { from: 0, key: 'ArrowRight', to: 1 },
      { from: -1000, key: 'ArrowLeft', to: -1000 },
      { from: 1000, key: 'ArrowRight', to: 1000 },
    ])('Shift at $from after $key reads $to — signed, one hertz a press, holding at both ends', ({ from, key, to }) => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, frequencyShifter: { shift: from, wet: 0.2 } } }));
      render(<AudioRigEffectPanel effectKey="frequencyShifter" />);
      const shift = screen.getByRole('slider', { name: CONTENT['fleet.frequencyShifter.shift'].human });
      shift.focus();
      fireEvent.keyDown(shift, { key });
      expect(useAudioStore.getState().globalAudio.frequencyShifter).toEqual({ shift: to, wet: 0.2 });
    });

    it.each([
      { from: 0.5, key: 'ArrowRight', to: 0.51 },
      { from: 0, key: 'ArrowLeft', to: 0 },
      { from: 1, key: 'ArrowRight', to: 1 },
    ])('Width at $from after $key reads $to — the whole 0 to 1, mono to all side', ({ from, key, to }) => {
      useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, stereoWidener: { width: from } } }));
      render(<AudioRigEffectPanel effectKey="stereoWidener" />);
      const width = screen.getByRole('slider', { name: CONTENT['fleet.stereoWidener.width'].human });
      width.focus();
      fireEvent.keyDown(width, { key });
      expect(useAudioStore.getState().globalAudio.stereoWidener.width).toBe(to);
    });

    it('a real user edit asks the swell system to cancel its own (effect, field) pair, like every other effect panel', () => {
      const spy = vi.spyOn(audioSwells, 'cancelSwellForGlobalField');
      render(<AudioRigEffectPanel effectKey="tremolo" />);
      const depth = screen.getByRole('slider', { name: CONTENT['fleet.tremolo.depth'].human });
      depth.focus();
      fireEvent.keyDown(depth, { key: 'ArrowRight' });
      expect(spy).toHaveBeenCalledWith('tremolo', 'depth');
    });
  });

  describe('re-render cascade regression (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12 — the end-to-end test this whole plan exists for)', () => {
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

  // docs/specs/FREE_SYNC_TOGGLE.md §1.4 Delay paragraph, Task 12: Delay Time renders through
  // TempoSyncSlider beside the existing plain Feedback/Mix rows. Tested against the REAL store (only
  // lfoEngine is mocked), so a wrong wiring shows up as wrong state, not a wrong spy call.
  describe('Delay Time Tempo Sync (docs/specs/FREE_SYNC_TOGGLE.md Task 12)', () => {
    const TOGGLE_NAME = CONTENT['ui.tempoSync'].human;
    // The toggle's content is the current mode's label pair: Float over Free, or Anchored over Sync.
    const FREE = { lore: CONTENT['ui.tempoSync'].options.free.lore, human: CONTENT['ui.tempoSync'].options.free.human };
    const SYNC = { lore: CONTENT['ui.tempoSync'].options.sync.lore, human: CONTENT['ui.tempoSync'].options.sync.human };
    const nv = (division: NoteDivision, modifier: NoteModifier = 'straight'): NoteValue => ({ division, modifier });

    /** Replaces the whole stored delay (so a patch without `sync` really is Free), at the given tempo. */
    function setDelay(patch: Record<string, unknown>, bpm = 60) {
      useAudioStore.setState((s) => ({
        bpm,
        globalAudio: { ...s.globalAudio, delay: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS.delay, ...patch } as never },
      }));
    }
    const storedDelay = () => useAudioStore.getState().globalAudio.delay;
    const timeThumb = () => screen.getByRole('slider', { name: 'Delay Time' });
    const tempoToggle = () => screen.getByRole('switch', { name: TOGGLE_NAME });
    /** Commits of everything under a Profiler — counts the PANEL's own re-renders, which memoised children hide. */
    function renderCountingCommits(effectKey: 'delay' | 'reverb' | 'compressor' | 'eq3') {
      let commits = 0;
      render(
        <Profiler id="panel" onRender={() => { commits += 1; }}>
          <AudioRigEffectPanel effectKey={effectKey} />
        </Profiler>,
      );
      return () => commits;
    }

    // Not vi.restoreAllMocks(): that would also reset the resolveAccessibleName wrapper this whole file counts with.
    const pushSpies: Array<{ mockRestore: () => void }> = [];
    function spyOnDelayPush() {
      const spy = vi.spyOn(AudioEngine, 'setGlobalDelay');
      pushSpies.push(spy);
      return spy;
    }

    beforeEach(() => {
      setDelay({ delayTime: 0.5 }, 60);
    });
    afterEach(() => {
      while (pushSpies.length > 0) pushSpies.pop()!.mockRestore();
    });

    describe('layout', () => {
      it('the Delay block holds exactly one Tempo Sync slider+switch and two plain slider rows (Repeats, Amount)', () => {
        const { container } = render(<AudioRigEffectPanel effectKey="delay" />);
        expect(container.querySelectorAll('.sc-tempo-sync')).toHaveLength(1);
        expect(screen.getAllByRole('switch', { name: TOGGLE_NAME })).toHaveLength(1);
        const feedback = screen.getByRole('slider', { name: 'Repeats' });
        const wet = screen.getByRole('slider', { name: 'Delay Amount' });
        expect(feedback.closest('.sc-tempo-sync')).toBeNull();
        expect(wet.closest('.sc-tempo-sync')).toBeNull();
      });

      // Three param-rows in DOM order — the first two inside the nested top-row panel, Delay Amount a
      // direct child of the block (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.3).
      it('Delay Time\'s Tempo Sync composition sits inside its own param-row, first in DOM order, inside the top-row panel', () => {
        const { container } = render(<AudioRigEffectPanel effectKey="delay" />);
        const rows = container.querySelectorAll('.audio-rig-drawer__effect-block .sc-directional-panel__content > .audio-rig-drawer__param-row');
        expect(rows).toHaveLength(3);
        expect(rows[0].querySelector('.sc-tempo-sync')).not.toBeNull();
        expect(within(rows[0] as HTMLElement).getByRole('slider', { name: 'Delay Time' })).toBeTruthy();
        expect(within(rows[1] as HTMLElement).getByRole('slider', { name: 'Repeats' })).toBeTruthy();
        expect(within(rows[2] as HTMLElement).getByRole('slider', { name: 'Delay Amount' })).toBeTruthy();
        const topRow = container.querySelector('[data-panel-id="audioRig.delay.topRow"]')!;
        expect(topRow.contains(rows[0])).toBe(true);
        expect(topRow.contains(rows[1])).toBe(true);
        expect(topRow.contains(rows[2])).toBe(false);
      });

      // The toggle sits in its own row UNDER Delay Time (Crawford, 2026-10-03), inside Delay Time's own
      // param-row, so the slider keeps the full width of its half of the top row.
      it('the Tempo Sync switch is in the Delay Time row, after the Delay Time slider — and in no other row', () => {
        const { container } = render(<AudioRigEffectPanel effectKey="delay" />);
        const rows = container.querySelectorAll('.audio-rig-drawer__effect-block .sc-directional-panel__content > .audio-rig-drawer__param-row');
        expect(rows).toHaveLength(3);
        expect(rows[0].contains(tempoToggle())).toBe(true);
        expect(timeThumb().compareDocumentPosition(tempoToggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(rows[1].querySelector('[role="switch"]')).toBeNull();
        expect(rows[2].querySelector('[role="switch"]')).toBeNull();
      });

      it('no other effect block renders a Tempo Sync composition or switch', () => {
        for (const key of ['eq3', 'filterLPF', 'filterHPF', 'reverb', 'compressor', 'limiter'] as const) {
          const { container, unmount } = render(<AudioRigEffectPanel effectKey={key} />);
          expect(container.querySelector('.sc-tempo-sync'), key).toBeNull();
          expect(screen.queryByRole('switch', { name: TOGGLE_NAME }), key).toBeNull();
          unmount();
        }
      });
    });

    describe('Free (no sync stored)', () => {
      it('shows an unchecked switch with the Float facade beside the unchanged Free slider', () => {
        setDelay({ delayTime: 0.5 });
        render(<AudioRigEffectPanel effectKey="delay" />);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
        expect(facadeCurrentLabels(tempoToggle())).toEqual(FREE);
        expect(timeThumb().getAttribute('aria-valuenow')).toBe('0.5');
        expect(timeThumb().hasAttribute('aria-valuetext')).toBe(false);
      });

      it('a Free edit writes delayTime and leaves the Delay without a `sync` key', () => {
        setDelay({ delayTime: 0.5 });
        render(<AudioRigEffectPanel effectKey="delay" />);
        timeThumb().focus();
        fireEvent.keyDown(timeThumb(), { key: 'ArrowRight' });
        expect(storedDelay().delayTime).toBeGreaterThan(0.5);
        expect('sync' in storedDelay()).toBe(false);
      });

      it('a Free edit reaches the engine as that number', () => {
        const push = spyOnDelayPush();
        setDelay({ delayTime: 0.5 });
        render(<AudioRigEffectPanel effectKey="delay" />);
        timeThumb().focus();
        fireEvent.keyDown(timeThumb(), { key: 'ArrowRight' });
        expect(push).toHaveBeenLastCalledWith({ delayTime: storedDelay().delayTime });
      });
    });

    describe('Sync (a note stored)', () => {
      it('shows a checked switch with the Anchored facade and the note\'s index on the thumb, announced by name', () => {
        setDelay({ delayTime: 7, sync: nv('1/8', 'dotted') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        const list = allowedDelayNoteValues(60);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('true');
        expect(facadeCurrentLabels(tempoToggle())).toEqual(SYNC);
        expect(timeThumb().getAttribute('aria-valuenow')).toBe(String(list.findIndex((n) => noteValueEquals(n, nv('1/8', 'dotted')))));
        expect(timeThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/8', 'dotted')));
        expect(timeThumb().getAttribute('aria-valuemax')).toBe(String(list.length - 1));
      });

      it('lists the notes shortest -> longest: the first stop is the shortest allowed note, the last the longest that fits 10 s', () => {
        setDelay({ sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        const list = allowedDelayNoteValues(60);
        expect(Number(timeThumb().getAttribute('aria-valuemin'))).toBe(0);
        expect(list.length).toBeGreaterThan(2);
        // 60 BPM: 2 bars is 8 s (fits), 4 bars is 16 s (does not)
        expect(list.some((n) => noteValueEquals(n, nv('2')))).toBe(true);
        expect(list.some((n) => noteValueEquals(n, nv('4')))).toBe(false);
      });

      it('ignores the stored Free delayTime while synced — it never moves the Sync thumb', () => {
        setDelay({ delayTime: 0, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        expect(timeThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/4')));
      });

      it('a step writes `sync` with the next note, keeps the Free delayTime underneath, and pushes that note\'s seconds to the engine', () => {
        const push = spyOnDelayPush();
        setDelay({ delayTime: 0.3, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        const list = allowedDelayNoteValues(60);
        const next = list[list.findIndex((n) => noteValueEquals(n, nv('1/4'))) + 1];
        timeThumb().focus();
        fireEvent.keyDown(timeThumb(), { key: 'ArrowRight' });
        expect(storedDelay().sync).toEqual(next);
        expect(storedDelay().delayTime).toBe(0.3);
        expect(push).toHaveBeenLastCalledWith({ delayTime: noteValueSeconds(next, 60) });
      });

      it('a step toward the short end moves to the previous note', () => {
        setDelay({ delayTime: 0.3, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        const list = allowedDelayNoteValues(60);
        const previous = list[list.findIndex((n) => noteValueEquals(n, nv('1/4'))) - 1];
        timeThumb().focus();
        fireEvent.keyDown(timeThumb(), { key: 'ArrowLeft' });
        expect(storedDelay().sync).toEqual(previous);
      });

      it('a step never writes delayTime — the Free value underneath stays exactly as stored', () => {
        setDelay({ delayTime: 7.5, sync: nv('1/2') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        timeThumb().focus();
        fireEvent.keyDown(timeThumb(), { key: 'ArrowLeft' });
        expect(storedDelay().delayTime).toBe(7.5);
      });

      it('stepping at the long end stays on the longest allowed note — no out-of-range note is ever written', () => {
        const list = allowedDelayNoteValues(60);
        setDelay({ sync: list[list.length - 1] });
        render(<AudioRigEffectPanel effectKey="delay" />);
        timeThumb().focus();
        fireEvent.keyDown(timeThumb(), { key: 'ArrowRight' });
        expect(storedDelay().sync).toEqual(list[list.length - 1]);
      });

      it('a stored long note is clamped to the longest stop at a tempo that pushes it past 10 s, and restores when the tempo comes back', async () => {
        // 4 bars is 8 s at 120 BPM (in range) and 16 s at 60 BPM (past the cap).
        setDelay({ sync: nv('4') }, 120);
        render(<AudioRigEffectPanel effectKey="delay" />);
        expect(timeThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('4')));

        act(() => useAudioStore.setState({ bpm: 60 }));
        await act(async () => { await Promise.resolve(); }); // the slider eases a non-drag change
        const slow = allowedDelayNoteValues(60);
        expect(timeThumb().getAttribute('aria-valuemax')).toBe(String(slow.length - 1));
        expect(timeThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(slow[slow.length - 1]));
        expect(storedDelay().sync).toEqual(nv('4')); // display-only: nothing written

        act(() => useAudioStore.setState({ bpm: 120 }));
        await act(async () => { await Promise.resolve(); });
        expect(timeThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('4')));
      });

      it('an unrecognised stored `sync` reads as Free, matching what the resolvers do to the audio', () => {
        setDelay({ delayTime: 0.6, sync: { division: '1/3', modifier: 'straight' } });
        render(<AudioRigEffectPanel effectKey="delay" />);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
        expect(timeThumb().getAttribute('aria-valuenow')).toBe('0.6');
        expect(timeThumb().hasAttribute('aria-valuetext')).toBe(false);
      });
    });

    describe('the toggle', () => {
      it('Float -> Anchored writes the nearest note at the current tempo, via setDelaySyncMode', () => {
        setDelay({ delayTime: 1 }); // 1 s at 60 BPM is exactly a quarter note
        render(<AudioRigEffectPanel effectKey="delay" />);
        fireEvent.click(tempoToggle());
        expect(storedDelay().sync).toEqual(nv('1/4'));
        expect(tempoToggle().getAttribute('aria-checked')).toBe('true');
      });

      it('Float -> Anchored at a different tempo snaps to that tempo\'s nearest note', () => {
        setDelay({ delayTime: 1 }, 120); // 1 s at 120 BPM is two beats: a half note
        render(<AudioRigEffectPanel effectKey="delay" />);
        fireEvent.click(tempoToggle());
        expect(storedDelay().sync).toEqual(nv('1/2'));
      });

      it('Float -> Anchored pushes that note\'s seconds to the engine', () => {
        const push = spyOnDelayPush();
        setDelay({ delayTime: 1 });
        render(<AudioRigEffectPanel effectKey="delay" />);
        fireEvent.click(tempoToggle());
        expect(push).toHaveBeenLastCalledWith({ delayTime: 1 });
      });

      it('Anchored -> Float removes the `sync` key entirely and keeps what was heard', () => {
        setDelay({ delayTime: 7, sync: nv('1/8', 'dotted') }); // 0.75 s at 60 BPM
        render(<AudioRigEffectPanel effectKey="delay" />);
        fireEvent.click(tempoToggle());
        expect('sync' in storedDelay()).toBe(false);
        expect(storedDelay().delayTime).toBe(0.75);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
        expect(timeThumb().getAttribute('aria-valuenow')).toBe('0.75');
      });

      it('a Float -> Anchored -> Float round trip leaves no `sync` key', () => {
        setDelay({ delayTime: 0.9 });
        render(<AudioRigEffectPanel effectKey="delay" />);
        fireEvent.click(tempoToggle());
        expect('sync' in storedDelay()).toBe(true);
        fireEvent.click(tempoToggle());
        expect('sync' in storedDelay()).toBe(false);
      });

      it('flipping leaves Repeats and Amount alone', () => {
        setDelay({ delayTime: 0.9, feedback: 0.42, wet: 0.37 });
        render(<AudioRigEffectPanel effectKey="delay" />);
        fireEvent.click(tempoToggle());
        expect(storedDelay().feedback).toBe(0.42);
        expect(storedDelay().wet).toBe(0.37);
      });

      it('a Delay at 0 s flips to Anchored without crashing and shows a note', () => {
        setDelay({ delayTime: 0 });
        render(<AudioRigEffectPanel effectKey="delay" />);
        fireEvent.click(tempoToggle());
        expect(timeThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(allowedDelayNoteValues(60)[0]));
      });
    });

    describe('Repeats and Amount are untouched by Sync', () => {
      it('a Repeats edit writes feedback only — no sync, no delayTime, on a synced Delay too', () => {
        setDelay({ delayTime: 0.3, feedback: 0.3, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        const repeats = screen.getByRole('slider', { name: 'Repeats' });
        repeats.focus();
        fireEvent.keyDown(repeats, { key: 'ArrowRight' });
        expect(storedDelay().feedback).toBeGreaterThan(0.3);
        expect(storedDelay().sync).toEqual(nv('1/4'));
        expect(storedDelay().delayTime).toBe(0.3);
      });

      it('an Amount edit goes to the engine as { wet } alone — the time is not re-pushed on a synced Delay', () => {
        const push = spyOnDelayPush();
        setDelay({ wet: 0.3, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        const amount = screen.getByRole('slider', { name: 'Delay Amount' });
        amount.focus();
        fireEvent.keyDown(amount, { key: 'ArrowRight' });
        expect(push).toHaveBeenLastCalledWith({ wet: expect.any(Number) });
        expect(Object.keys(push.mock.calls.at(-1)![0])).toEqual(['wet']);
      });
    });

    describe('re-render isolation', () => {
      it('a wet change (an Audio Swell tick) does not re-execute the Delay Time control — Free', () => {
        render(<AudioRigEffectPanel effectKey="delay" />);
        const before = callsFor('delay.delayTime');
        expect(before).toBeGreaterThan(0);
        act(() => { useAudioStore.getState().setGlobalAudio('delay', { wet: 0.31 }); });
        expect(callsFor('delay.delayTime')).toBe(before);
      });

      it('a wet change does not re-execute the Delay Time control — Sync', () => {
        setDelay({ sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        const before = callsFor('delay.delayTime.sync');
        expect(before).toBeGreaterThan(0);
        act(() => { useAudioStore.getState().setGlobalAudio('delay', { wet: 0.31 }); });
        expect(callsFor('delay.delayTime.sync')).toBe(before);
      });

      it('a feedback change does not re-execute the Delay Time control either', () => {
        setDelay({ sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="delay" />);
        const before = callsFor('delay.delayTime.sync');
        act(() => { useAudioStore.getState().setGlobalAudio('delay', { feedback: 0.6 }); });
        expect(callsFor('delay.delayTime.sync')).toBe(before);
      });

      it('a wet change does not re-execute Repeats', () => {
        render(<AudioRigEffectPanel effectKey="delay" />);
        const before = callsFor('delay.feedback');
        act(() => { useAudioStore.getState().setGlobalAudio('delay', { wet: 0.31 }); });
        expect(callsFor('delay.feedback')).toBe(before);
      });

      it.each(['reverb', 'compressor', 'eq3'] as const)(
        'a tempo change does not re-render the %s panel at all — only Delay subscribes to bpm',
        (key) => {
          const commits = renderCountingCommits(key);
          const before = commits();
          act(() => { useAudioStore.getState().setBPM(120); });
          act(() => { useAudioStore.getState().setBPM(90); });
          expect(commits()).toBe(before);
        },
      );

      it('positive control: a tempo change DOES re-render the Delay panel (so the Profiler check above can fail)', () => {
        setDelay({ sync: nv('1/4') });
        const commits = renderCountingCommits('delay');
        const before = commits();
        act(() => { useAudioStore.getState().setBPM(120); });
        expect(commits()).toBeGreaterThan(before);
      });

      it('a Delay sync change does not re-render an unrelated Reverb panel', () => {
        const commits = renderCountingCommits('reverb');
        const before = commits();
        act(() => { useAudioStore.getState().setDelaySyncMode(true); });
        expect(commits()).toBe(before);
      });
    });
  });

  // docs/specs/GLOBAL_MODULATION_COLOUR.md §1.6, docs/tasks/GLOBAL_MODULATION_COLOUR.md Task 11: the Phaser's
  // Rate renders through TempoSyncSlider (Free = Hz, Sync = a note value that follows the Tempo), the Delay's
  // composition in Hz. Tested against the REAL store, as the Delay's is, so a wrong wiring shows up as wrong state.
  describe('Phaser Rate Tempo Sync (Global Modulation T11)', () => {
    const TOGGLE_NAME = CONTENT['ui.tempoSync'].human;
    const FREE = { lore: CONTENT['ui.tempoSync'].options.free.lore, human: CONTENT['ui.tempoSync'].options.free.human };
    const SYNC = { lore: CONTENT['ui.tempoSync'].options.sync.lore, human: CONTENT['ui.tempoSync'].options.sync.human };
    const nv = (division: NoteDivision, modifier: NoteModifier = 'straight'): NoteValue => ({ division, modifier });

    /** Replaces the whole stored phaser (so a patch without `sync` really is Free), at the given tempo. */
    function setPhaser(patch: Record<string, unknown>, bpm = 60) {
      useAudioStore.setState((s) => ({
        bpm,
        globalAudio: { ...s.globalAudio, phaser: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser, ...patch } as never },
      }));
    }
    const storedPhaser = () => useAudioStore.getState().globalAudio.phaser;
    const rateThumb = () => screen.getByRole('slider', { name: CONTENT['fleet.phaser.rate'].human });
    const tempoToggle = () => screen.getByRole('switch', { name: TOGGLE_NAME });
    const indexOf = (list: readonly NoteValue[], note: NoteValue) => list.findIndex((n) => noteValueEquals(n, note));
    function renderCountingCommits(effectKey: 'delay' | 'autoWah' | 'phaser') {
      let commits = 0;
      render(
        <Profiler id="panel" onRender={() => { commits += 1; }}>
          <AudioRigEffectPanel effectKey={effectKey} />
        </Profiler>,
      );
      return () => commits;
    }

    const pushSpies: Array<{ mockRestore: () => void }> = [];
    function spyOnPhaserPush() {
      const spy = vi.spyOn(AudioEngine, 'setGlobalPhaser');
      pushSpies.push(spy);
      return spy;
    }

    beforeEach(() => {
      setPhaser({ rate: 0.5 }, 60);
    });
    afterEach(() => {
      while (pushSpies.length > 0) pushSpies.pop()!.mockRestore();
    });

    describe('layout', () => {
      it('the Phaser block holds exactly one Tempo Sync slider+switch and five plain slider rows', () => {
        const { container } = render(<AudioRigEffectPanel effectKey="phaser" />);
        expect(container.querySelectorAll('.sc-tempo-sync')).toHaveLength(1);
        expect(screen.getAllByRole('switch', { name: TOGGLE_NAME })).toHaveLength(1);
        expect(screen.getAllByRole('slider')).toHaveLength(6);
        for (const key of ['octaves', 'baseFrequency', 'stages', 'q', 'mix'] as const) {
          const plain = screen.getByRole('slider', { name: CONTENT[`fleet.phaser.${key}`].human });
          expect(plain.closest('.sc-tempo-sync'), key).toBeNull();
        }
      });

      it('Rate is the first row, the switch sits under it in the same row, and no other row has a switch', () => {
        const { container } = render(<AudioRigEffectPanel effectKey="phaser" />);
        const rows = container.querySelectorAll('.audio-rig-drawer__effect-block .sc-directional-panel__content > .audio-rig-drawer__param-row');
        expect(rows).toHaveLength(6);
        expect(rows[0].querySelector('.sc-tempo-sync')).not.toBeNull();
        expect(rows[0].contains(tempoToggle())).toBe(true);
        expect(rateThumb().compareDocumentPosition(tempoToggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        for (let i = 1; i < rows.length; i++) expect(rows[i].querySelector('[role="switch"]'), `row ${i}`).toBeNull();
      });

      it('the other rows follow in the block order: Octaves, Base Frequency, Stages, Resonance, Mix', () => {
        const { container } = render(<AudioRigEffectPanel effectKey="phaser" />);
        const rows = [...container.querySelectorAll('.audio-rig-drawer__effect-block .sc-directional-panel__content > .audio-rig-drawer__param-row')];
        const names = rows.map((r) => within(r as HTMLElement).getAllByRole('slider')[0].getAttribute('aria-label') ?? within(r as HTMLElement).getAllByRole('slider')[0].getAttribute('aria-labelledby'));
        expect(names).toHaveLength(6);
        const order = ['octaves', 'baseFrequency', 'stages', 'q', 'mix'] as const;
        order.forEach((key, i) => {
          expect(within(rows[i + 1] as HTMLElement).getByRole('slider', { name: CONTENT[`fleet.phaser.${key}`].human })).toBeTruthy();
        });
      });

      it('no block without a synced rate renders a Tempo Sync composition or switch', () => {
        for (const key of [
          'autoWah', 'distortion', 'chebyshev', 'bitCrusher', 'reverb', 'eq3', 'frequencyShifter', 'compressor', 'stereoWidener', 'limiter',
        ] as const) {
          const { container, unmount } = render(<AudioRigEffectPanel effectKey={key} />);
          expect(container.querySelector('.sc-tempo-sync'), key).toBeNull();
          expect(screen.queryByRole('switch', { name: TOGGLE_NAME }), key).toBeNull();
          unmount();
        }
      });
    });

    describe('Free (no sync stored)', () => {
      it('shows an unchecked switch with the Float facade beside the unchanged Free slider', () => {
        setPhaser({ rate: 0.5 });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
        expect(facadeCurrentLabels(tempoToggle())).toEqual(FREE);
        expect(rateThumb().getAttribute('aria-valuenow')).toBe('0.5');
        expect(rateThumb().hasAttribute('aria-valuetext')).toBe(false);
      });

      it('a Free edit writes rate and leaves the Phaser without a sync key', () => {
        setPhaser({ rate: 0.5 });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
        expect(storedPhaser().rate).toBeCloseTo(0.55, 5);
        expect('sync' in storedPhaser()).toBe(false);
      });

      it('a Free edit reaches the engine as that number, with no sync property', () => {
        const push = spyOnPhaserPush();
        setPhaser({ rate: 0.5 });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
        expect(push).toHaveBeenLastCalledWith({ rate: storedPhaser().rate });
        expect('sync' in push.mock.calls.at(-1)![0]).toBe(false);
      });

      it('the Free slider spans the whole Rate range, 0.05 to 10 Hz', () => {
        render(<AudioRigEffectPanel effectKey="phaser" />);
        expect(Number(rateThumb().getAttribute('aria-valuemin'))).toBeCloseTo(0.05, 5);
        expect(Number(rateThumb().getAttribute('aria-valuemax'))).toBe(10);
      });
    });

    describe('Sync (a note stored)', () => {
      it('shows a checked switch with the Anchored facade and the note\'s index on the thumb, announced by name', () => {
        setPhaser({ rate: 7, sync: nv('1/8', 'dotted') });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        const list = allowedRateNoteValues(60, PEDAL_RATE_RANGE_HZ);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('true');
        expect(facadeCurrentLabels(tempoToggle())).toEqual(SYNC);
        expect(rateThumb().getAttribute('aria-valuenow')).toBe(String(indexOf(list, nv('1/8', 'dotted'))));
        expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/8', 'dotted')));
        expect(rateThumb().getAttribute('aria-valuemax')).toBe(String(list.length - 1));
      });

      it('ignores the stored Free rate while synced — it never moves the Sync thumb', () => {
        setPhaser({ rate: 9, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/4')));
      });

      it('a step toward the fast end writes the next note, keeps the Free rate underneath, and pushes that note\'s Hz to the engine', () => {
        const push = spyOnPhaserPush();
        setPhaser({ rate: 0.3, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        const list = allowedRateNoteValues(60, PEDAL_RATE_RANGE_HZ);
        const next = list[indexOf(list, nv('1/4')) + 1];
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
        expect(storedPhaser().sync).toEqual(next);
        expect(storedPhaser().rate).toBe(0.3);
        expect(push).toHaveBeenCalled();
        const pushed = push.mock.calls.at(-1)![0];
        expect(pushed.rate).toBeCloseTo(1 / noteValueSeconds(next, 60), 5);
        expect('sync' in pushed).toBe(false);
      });

      it('the notes run slowest to fastest, so a step toward the slow end moves to the previous note', () => {
        setPhaser({ rate: 0.3, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        const list = allowedRateNoteValues(60, PEDAL_RATE_RANGE_HZ);
        const hz = (n: NoteValue) => 1 / noteValueSeconds(n, 60);
        expect(hz(list[0])).toBeLessThan(hz(list[list.length - 1]));
        const previous = list[indexOf(list, nv('1/4')) - 1];
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowLeft' });
        expect(storedPhaser().sync).toEqual(previous);
      });

      it('a step never writes rate — the Free value underneath stays exactly as stored', () => {
        setPhaser({ rate: 7.5, sync: nv('1/2') });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowLeft' });
        expect(storedPhaser().rate).toBe(7.5);
      });

      it('stepping at either end stays on the end note — no out-of-range note is ever written', () => {
        const list = allowedRateNoteValues(60, PEDAL_RATE_RANGE_HZ);
        setPhaser({ sync: list[list.length - 1] });
        const { unmount } = render(<AudioRigEffectPanel effectKey="phaser" />);
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
        expect(storedPhaser().sync).toEqual(list[list.length - 1]);
        unmount();
        setPhaser({ sync: list[0] });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowLeft' });
        expect(storedPhaser().sync).toEqual(list[0]);
      });

      it('a stored fast note is clamped to the fastest stop at a tempo that pushes it past 10 Hz, and restores when the tempo comes back', async () => {
        // A 32nd note is 8 Hz at 60 BPM (in range) and 16 Hz at 120 BPM (past the cap).
        setPhaser({ sync: nv('1/32') }, 60);
        render(<AudioRigEffectPanel effectKey="phaser" />);
        expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/32')));

        act(() => useAudioStore.setState({ bpm: 120 }));
        await act(async () => { await Promise.resolve(); }); // the slider eases a non-drag change
        const fast = allowedRateNoteValues(120, PEDAL_RATE_RANGE_HZ);
        expect(rateThumb().getAttribute('aria-valuemax')).toBe(String(fast.length - 1));
        expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(fast[fast.length - 1]));
        expect(storedPhaser().sync).toEqual(nv('1/32')); // display-only: nothing written

        act(() => useAudioStore.setState({ bpm: 60 }));
        await act(async () => { await Promise.resolve(); });
        expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/32')));
      });

      it('an unrecognised stored sync reads as Free, matching what the resolver does to the audio', () => {
        setPhaser({ rate: 0.6, sync: { division: '1/3', modifier: 'straight' } });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
        expect(rateThumb().getAttribute('aria-valuenow')).toBe('0.6');
        expect(rateThumb().hasAttribute('aria-valuetext')).toBe(false);
      });
    });

    describe('the toggle', () => {
      it('Float -> Anchored writes the nearest note at the current tempo, via setPedalSyncMode for the Phaser', () => {
        setPhaser({ rate: 1 }); // 1 Hz at 60 BPM is exactly a quarter note
        render(<AudioRigEffectPanel effectKey="phaser" />);
        fireEvent.click(tempoToggle());
        expect(storedPhaser().sync).toEqual(nv('1/4'));
        expect(tempoToggle().getAttribute('aria-checked')).toBe('true');
      });

      it('Float -> Anchored at a different tempo snaps to that tempo\'s nearest note', () => {
        setPhaser({ rate: 1 }, 120); // 1 Hz at 120 BPM is a two-beat cycle: a half note
        render(<AudioRigEffectPanel effectKey="phaser" />);
        fireEvent.click(tempoToggle());
        expect(storedPhaser().sync).toEqual(nv('1/2'));
      });

      it('Float -> Anchored pushes that note\'s Hz to the engine', () => {
        const push = spyOnPhaserPush();
        setPhaser({ rate: 1 });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        fireEvent.click(tempoToggle());
        expect(push).toHaveBeenLastCalledWith({ rate: 1 });
      });

      it('Anchored -> Float removes the sync key entirely and keeps what was heard, on the 0.05 Hz grid', () => {
        setPhaser({ rate: 7, sync: nv('1/8', 'dotted') }); // 0.75 s at 60 BPM, 1.333 Hz
        render(<AudioRigEffectPanel effectKey="phaser" />);
        fireEvent.click(tempoToggle());
        expect('sync' in storedPhaser()).toBe(false);
        expect(storedPhaser().rate).toBeCloseTo(1.35, 5);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
        expect(Number(rateThumb().getAttribute('aria-valuenow'))).toBeCloseTo(1.35, 5);
      });

      it('a Float -> Anchored -> Float round trip leaves no sync key', () => {
        setPhaser({ rate: 0.9 });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        fireEvent.click(tempoToggle());
        expect('sync' in storedPhaser()).toBe(true);
        fireEvent.click(tempoToggle());
        expect('sync' in storedPhaser()).toBe(false);
      });

      it('a slow note flips to Float no lower than the minimum rate — never 0, which would stop the sweep', () => {
        setPhaser({ rate: 0.5, sync: nv('4') }, 40); // four bars at 40 BPM is far slower than 0.05 Hz
        render(<AudioRigEffectPanel effectKey="phaser" />);
        fireEvent.click(tempoToggle());
        expect(storedPhaser().rate).toBeGreaterThanOrEqual(0.05);
        expect('sync' in storedPhaser()).toBe(false);
      });

      it('flipping leaves Octaves, Base Frequency, Stages, Q and Mix alone', () => {
        setPhaser({ rate: 0.9, octaves: 2.5, baseFrequency: 410, stages: 7, Q: 3.5, wet: 0.37 });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        fireEvent.click(tempoToggle());
        expect(storedPhaser()).toMatchObject({ octaves: 2.5, baseFrequency: 410, stages: 7, Q: 3.5, wet: 0.37 });
      });

      it('flipping the Phaser does not touch the AutoWah', () => {
        const before = useAudioStore.getState().globalAudio.autoWah;
        render(<AudioRigEffectPanel effectKey="phaser" />);
        fireEvent.click(tempoToggle());
        expect(useAudioStore.getState().globalAudio.autoWah).toBe(before);
      });
    });

    describe('the other rows are untouched by Sync', () => {
      it('a Mix edit writes wet only on a synced Phaser — no sync change, no rate change', () => {
        setPhaser({ rate: 0.3, wet: 0.2, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        const mix = screen.getByRole('slider', { name: CONTENT['fleet.phaser.mix'].human });
        mix.focus();
        fireEvent.keyDown(mix, { key: 'ArrowRight' });
        expect(storedPhaser().wet).toBeGreaterThan(0.2);
        expect(storedPhaser().sync).toEqual(nv('1/4'));
        expect(storedPhaser().rate).toBe(0.3);
      });

      it('a Mix edit goes to the engine as { wet } alone — the rate is not re-pushed on a synced Phaser', () => {
        const push = spyOnPhaserPush();
        setPhaser({ wet: 0.2, sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        const mix = screen.getByRole('slider', { name: CONTENT['fleet.phaser.mix'].human });
        mix.focus();
        fireEvent.keyDown(mix, { key: 'ArrowRight' });
        expect(Object.keys(push.mock.calls.at(-1)![0])).toEqual(['wet']);
      });
    });

    describe('re-render isolation', () => {
      it('a wet change does not re-execute the Rate control — Free', () => {
        render(<AudioRigEffectPanel effectKey="phaser" />);
        const before = callsFor('phaser.rate');
        expect(before).toBeGreaterThan(0);
        act(() => { useAudioStore.getState().setGlobalAudio('phaser', { wet: 0.31 }); });
        expect(callsFor('phaser.rate')).toBe(before);
      });

      it('a wet change does not re-execute the Rate control — Sync', () => {
        setPhaser({ sync: nv('1/4') });
        render(<AudioRigEffectPanel effectKey="phaser" />);
        const before = callsFor('phaser.rate.sync');
        expect(before).toBeGreaterThan(0);
        act(() => { useAudioStore.getState().setGlobalAudio('phaser', { wet: 0.31 }); });
        expect(callsFor('phaser.rate.sync')).toBe(before);
      });

      it('a wet change does not re-execute Stages', () => {
        render(<AudioRigEffectPanel effectKey="phaser" />);
        const before = callsFor('phaser.stages');
        act(() => { useAudioStore.getState().setGlobalAudio('phaser', { wet: 0.31 }); });
        expect(callsFor('phaser.stages')).toBe(before);
      });

      it('a tempo change does not re-render the AutoWah panel at all — only Delay and Phaser subscribe to bpm', () => {
        const commits = renderCountingCommits('autoWah');
        const before = commits();
        act(() => { useAudioStore.getState().setBPM(120); });
        act(() => { useAudioStore.getState().setBPM(90); });
        expect(commits()).toBe(before);
      });

      it('positive control: a tempo change DOES re-render the Phaser panel (so the Profiler check above can fail)', () => {
        setPhaser({ sync: nv('1/4') });
        const commits = renderCountingCommits('phaser');
        const before = commits();
        act(() => { useAudioStore.getState().setBPM(120); });
        expect(commits()).toBeGreaterThan(before);
      });

      it('a Phaser sync change does not re-render the Delay panel', () => {
        const commits = renderCountingCommits('delay');
        const before = commits();
        act(() => { useAudioStore.getState().setPedalSyncMode('phaser', true); });
        act(() => { useAudioStore.getState().setGlobalAudio('phaser', { sync: nv('1/2') }); });
        expect(commits()).toBe(before);
      });

      it('a Delay sync change does not re-render the Phaser panel', () => {
        const commits = renderCountingCommits('phaser');
        const before = commits();
        act(() => { useAudioStore.getState().setDelaySyncMode(true); });
        expect(commits()).toBe(before);
      });
    });
  });

  // docs/specs/GLOBAL_PEDALS.md §1.6, docs/tasks/GLOBAL_PEDALS.md Task 11: the Chorus, Tremolo and Vibrato Rate rows
  // take the Phaser's Free | Sync rail through one generalised branch (isSyncedRateKey), all four on the shared
  // PEDAL_RATE_RANGE_HZ. Tested against the REAL store, as the Phaser's is, so a wrong key shows up as wrong state.
  describe.each([
    {
      key: 'chorus', setter: 'setGlobalChorus', plain: ['delay', 'depth', 'spread', 'feedback', 'mix'],
      others: { delayTime: 6, depth: 0.4, spread: 120, feedback: 0.15, wet: 0.33 },
    },
    { key: 'tremolo', setter: 'setGlobalTremolo', plain: ['depth', 'spread', 'mix'], others: { depth: 0.6, spread: 90, wet: 0.27 } },
    { key: 'vibrato', setter: 'setGlobalVibrato', plain: ['depth', 'mix'], others: { depth: 0.2, wet: 0.31 } },
  ] as const)('$key Rate Tempo Sync (Global Pedals T11)', ({ key, setter, plain, others }) => {
    const TOGGLE_NAME = CONTENT['ui.tempoSync'].human;
    const nv = (division: NoteDivision, modifier: NoteModifier = 'straight'): NoteValue => ({ division, modifier });
    const OTHER_SYNCED = (['phaser', 'chorus', 'tremolo', 'vibrato'] as const).filter((k) => k !== key);

    /** Replaces the whole stored block (so a patch without `sync` really is Free), at the given tempo. */
    function setPedal(patch: Record<string, unknown>, bpm = 60) {
      useAudioStore.setState((s) => ({
        bpm,
        globalAudio: { ...s.globalAudio, [key]: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS[key], ...patch } as never },
      }));
    }
    const stored = () => useAudioStore.getState().globalAudio[key] as unknown as { rate: number; sync?: NoteValue } & Record<string, unknown>;
    const rateThumb = () => screen.getByRole('slider', { name: CONTENT[`fleet.${key}.rate`].human });
    const tempoToggle = () => screen.getByRole('switch', { name: TOGGLE_NAME });
    const allowedAt = (bpm: number) => allowedRateNoteValues(bpm, PEDAL_RATE_RANGE_HZ);
    const indexOf = (list: readonly NoteValue[], note: NoteValue) => list.findIndex((n) => noteValueEquals(n, note));
    function renderCountingCommits(effectKey: 'phaser' | 'chorus' | 'tremolo' | 'vibrato') {
      let commits = 0;
      render(
        <Profiler id="panel" onRender={() => { commits += 1; }}>
          <AudioRigEffectPanel effectKey={effectKey} />
        </Profiler>,
      );
      return () => commits;
    }

    const restores: Array<() => void> = [];
    function spyOnPush() {
      const spy = vi.spyOn(AudioEngine, setter);
      restores.push(() => spy.mockRestore());
      return spy as unknown as ReturnType<typeof vi.fn>;
    }
    /** Wraps the store's real setPedalSyncMode in a spy, restored after the test. */
    function spyOnSyncMode() {
      const real = useAudioStore.getState().setPedalSyncMode;
      const spy = vi.fn(real);
      useAudioStore.setState({ setPedalSyncMode: spy });
      restores.push(() => useAudioStore.setState({ setPedalSyncMode: real }));
      return spy;
    }

    beforeEach(() => {
      setPedal({ rate: 0.5, ...others }, 60);
    });
    afterEach(() => {
      while (restores.length > 0) restores.pop()!();
    });

    describe('layout', () => {
      it('holds exactly one Tempo Sync slider+switch, on the Rate row, first; every other row is a plain slider', () => {
        const { container } = render(<AudioRigEffectPanel effectKey={key} />);
        expect(container.querySelectorAll('.sc-tempo-sync')).toHaveLength(1);
        expect(screen.getAllByRole('switch', { name: TOGGLE_NAME })).toHaveLength(1);
        expect(screen.getAllByRole('slider')).toHaveLength(1 + plain.length);
        const rows = container.querySelectorAll('.audio-rig-drawer__effect-block .sc-directional-panel__content > .audio-rig-drawer__param-row');
        expect(rows).toHaveLength(1 + plain.length);
        expect(rows[0].querySelector('.sc-tempo-sync')).not.toBeNull();
        expect(rows[0].contains(rateThumb())).toBe(true);
        expect(rows[0].contains(tempoToggle())).toBe(true);
        plain.forEach((field, i) => {
          const row = rows[i + 1] as HTMLElement;
          expect(row.querySelector('[role="switch"]'), field).toBeNull();
          expect(within(row).getByRole('slider', { name: CONTENT[`fleet.${key}.${field}` as keyof typeof CONTENT].human }), field).toBeTruthy();
        });
      });

      it('the Free slider spans the shared pedal range', () => {
        render(<AudioRigEffectPanel effectKey={key} />);
        expect(Number(rateThumb().getAttribute('aria-valuemin'))).toBeCloseTo(PEDAL_RATE_RANGE_HZ.min, 5);
        expect(Number(rateThumb().getAttribute('aria-valuemax'))).toBe(PEDAL_RATE_RANGE_HZ.max);
      });
    });

    describe('Free (no sync stored)', () => {
      it('shows an unchecked switch beside the unchanged Free slider', () => {
        render(<AudioRigEffectPanel effectKey={key} />);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
        expect(rateThumb().getAttribute('aria-valuenow')).toBe('0.5');
        expect(rateThumb().hasAttribute('aria-valuetext')).toBe(false);
      });

      it('a Free edit writes rate, leaves no sync key, and reaches the engine as that number', () => {
        const push = spyOnPush();
        render(<AudioRigEffectPanel effectKey={key} />);
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
        expect(stored().rate).toBeCloseTo(0.55, 5);
        expect('sync' in stored()).toBe(false);
        expect(push).toHaveBeenLastCalledWith({ rate: stored().rate });
      });
    });

    describe('Sync (a note stored)', () => {
      it('shows a checked switch and the note on the thumb, indexed in the shared pedal list', () => {
        setPedal({ rate: 7, sync: nv('1/8', 'dotted'), ...others });
        render(<AudioRigEffectPanel effectKey={key} />);
        const list = allowedAt(60);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('true');
        expect(rateThumb().getAttribute('aria-valuenow')).toBe(String(indexOf(list, nv('1/8', 'dotted'))));
        expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/8', 'dotted')));
        expect(rateThumb().getAttribute('aria-valuemax')).toBe(String(list.length - 1));
      });

      it('picking the next note writes { sync } on this block only, keeps its Free rate, and pushes that note\'s Hz', () => {
        const push = spyOnPush();
        setPedal({ rate: 0.3, sync: nv('1/4'), ...others });
        const before = Object.fromEntries(OTHER_SYNCED.map((k) => [k, useAudioStore.getState().globalAudio[k]]));
        render(<AudioRigEffectPanel effectKey={key} />);
        const list = allowedAt(60);
        const next = list[indexOf(list, nv('1/4')) + 1];
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
        expect(stored().sync).toEqual(next);
        expect(stored().rate).toBe(0.3);
        for (const k of OTHER_SYNCED) expect(useAudioStore.getState().globalAudio[k], k).toBe(before[k]);
        const pushed = push.mock.calls.at(-1)![0] as { rate: number };
        expect(pushed.rate).toBeCloseTo(1 / noteValueSeconds(next, 60), 5);
        expect('sync' in pushed).toBe(false);
      });

      it('stepping at either end stays on the end note', () => {
        const list = allowedAt(60);
        setPedal({ sync: list[list.length - 1], ...others });
        const { unmount } = render(<AudioRigEffectPanel effectKey={key} />);
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
        expect(stored().sync).toEqual(list[list.length - 1]);
        unmount();
        setPedal({ sync: list[0], ...others });
        render(<AudioRigEffectPanel effectKey={key} />);
        rateThumb().focus();
        fireEvent.keyDown(rateThumb(), { key: 'ArrowLeft' });
        expect(stored().sync).toEqual(list[0]);
      });

      it('an unrecognised stored sync reads as Free, matching what the resolver does to the audio', () => {
        setPedal({ rate: 0.6, sync: { division: '1/3', modifier: 'straight' }, ...others });
        render(<AudioRigEffectPanel effectKey={key} />);
        expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
        expect(rateThumb().getAttribute('aria-valuenow')).toBe('0.6');
      });
    });

    describe('the toggle', () => {
      it(`Float -> Anchored calls setPedalSyncMode('${key}', true) and writes the nearest note at the current tempo`, () => {
        const syncMode = spyOnSyncMode();
        setPedal({ rate: 1, ...others }); // 1 Hz at 60 BPM is exactly a quarter note
        render(<AudioRigEffectPanel effectKey={key} />);
        fireEvent.click(tempoToggle());
        expect(syncMode).toHaveBeenCalledTimes(1);
        expect(syncMode).toHaveBeenCalledWith(key, true);
        expect(stored().sync).toEqual(nv('1/4'));
        expect(tempoToggle().getAttribute('aria-checked')).toBe('true');
      });

      it('Anchored -> Float calls it with false, removes the sync key and keeps what was heard, on the 0.05 Hz grid', () => {
        const syncMode = spyOnSyncMode();
        setPedal({ rate: 7, sync: nv('1/8', 'dotted'), ...others }); // 0.75 s at 60 BPM, 1.333 Hz
        render(<AudioRigEffectPanel effectKey={key} />);
        fireEvent.click(tempoToggle());
        expect(syncMode).toHaveBeenCalledWith(key, false);
        expect('sync' in stored()).toBe(false);
        expect(stored().rate).toBeCloseTo(1.35, 5);
      });

      it('flipping leaves this block\'s other fields alone, and the Phaser and the other pedals untouched', () => {
        const before = Object.fromEntries(OTHER_SYNCED.map((k) => [k, useAudioStore.getState().globalAudio[k]]));
        render(<AudioRigEffectPanel effectKey={key} />);
        fireEvent.click(tempoToggle());
        expect(stored()).toMatchObject(others);
        for (const k of OTHER_SYNCED) expect(useAudioStore.getState().globalAudio[k], k).toBe(before[k]);
      });
    });

    describe('re-render isolation (the allowed list is memoised on the tempo)', () => {
      it('a Mix change does not re-execute the synced Rate control', () => {
        setPedal({ sync: nv('1/4'), ...others });
        render(<AudioRigEffectPanel effectKey={key} />);
        const before = callsFor(`${key}.rate.sync`);
        expect(before).toBeGreaterThan(0);
        act(() => { useAudioStore.getState().setGlobalAudio(key, { wet: 0.41 }); });
        expect(callsFor(`${key}.rate.sync`)).toBe(before);
      });

      it('positive control: a tempo change DOES re-execute it (so the check above can fail)', () => {
        setPedal({ sync: nv('1/4'), ...others });
        render(<AudioRigEffectPanel effectKey={key} />);
        const before = callsFor(`${key}.rate.sync`);
        act(() => { useAudioStore.getState().setBPM(120); });
        expect(callsFor(`${key}.rate.sync`)).toBeGreaterThan(before);
      });

      it('a Phaser sync change does not re-render this panel, and this pedal\'s does not re-render the Phaser\'s', () => {
        const commits = renderCountingCommits(key);
        const before = commits();
        act(() => { useAudioStore.getState().setPedalSyncMode('phaser', true); });
        expect(commits()).toBe(before);
        cleanup();
        const phaserCommits = renderCountingCommits('phaser');
        const phaserBefore = phaserCommits();
        act(() => { useAudioStore.getState().setPedalSyncMode(key, true); });
        expect(phaserCommits()).toBe(phaserBefore);
      });
    });
  });
});

// Light tier standing cost T12 (docs/specs/LIGHT_TIER_STANDING_COST.md H1): below LOAD_EFFECTS_MIN the budget holds every
// pedal and colour effect dark; its Mix row (Width's Width) greys out with the note, the stored value kept on the slider.
describe('AudioRigEffectPanel - Audio Load: effectsHeldOff on the ten Mix rows (Light tier standing cost T12)', () => {
  const MIX_ROWS = [
    { key: 'distortion', field: 'wet', label: 'fleet.distortion.mix' },
    { key: 'chebyshev', field: 'wet', label: 'fleet.chebyshev.mix' },
    { key: 'bitCrusher', field: 'wet', label: 'fleet.bitCrusher.mix' },
    { key: 'autoWah', field: 'wet', label: 'fleet.autoWah.mix' },
    { key: 'phaser', field: 'wet', label: 'fleet.phaser.mix' },
    { key: 'chorus', field: 'wet', label: 'fleet.chorus.mix' },
    { key: 'tremolo', field: 'wet', label: 'fleet.tremolo.mix' },
    { key: 'vibrato', field: 'wet', label: 'fleet.vibrato.mix' },
    { key: 'frequencyShifter', field: 'wet', label: 'fleet.frequencyShifter.mix' },
    { key: 'stereoWidener', field: 'width', label: 'fleet.stereoWidener.width' },
  ] as const;
  const HELD_OFF = CONTENT['ui.heldOff'].human;

  beforeEach(() => {
    resetAudioStore();
    useAudioStore.setState({ effectsHeldOff: false, reverbHeldOff: false });
  });

  function withStoredValue(key: (typeof MIX_ROWS)[number]['key'], field: string, value: number) {
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, [key]: { ...s.globalAudio[key], [field]: value } } }));
  }
  const mixSlider = (label: string) => screen.getByRole('slider', { name: CONTENT[label as keyof typeof CONTENT].human });
  const rowOfSlider = (slider: HTMLElement) => slider.closest('.audio-rig-drawer__param-row') as HTMLElement;

  it.each(MIX_ROWS)('$key: held off, its row is disabled and greyed with the note, the stored value still on the slider', ({ key, field, label }) => {
    withStoredValue(key, field, 0.37);
    useAudioStore.setState({ effectsHeldOff: true });
    render(<AudioRigEffectPanel effectKey={key} />);
    const slider = mixSlider(label);
    const row = rowOfSlider(slider);

    expect(slider.getAttribute('data-disabled')).not.toBeNull();
    expect(slider.getAttribute('aria-valuenow')).toBe('0.37');
    expect(row.classList.contains('sc-held-off')).toBe(true);
    expect(within(row).getByText(HELD_OFF)).toBeTruthy();
    expect((useAudioStore.getState().globalAudio[key] as unknown as Record<string, number>)[field]).toBe(0.37);
  });

  it.each(MIX_ROWS)('$key: not held off, its row is enabled, coloured and unlabelled', ({ key, label }) => {
    render(<AudioRigEffectPanel effectKey={key} />);
    const slider = mixSlider(label);
    const row = rowOfSlider(slider);

    expect(slider.getAttribute('data-disabled')).toBeNull();
    expect(row.classList.contains('sc-held-off')).toBe(false);
    expect(within(row).queryByText(HELD_OFF)).toBeNull();
  });

  // T12b (Crawford, 2026-10-29: "if they don't do anything they should be dimmed"): a held-off effect's other rows do
  // nothing either, so every row of its panel greys, the Free | Sync rate rows included, with one note on the Mix row.
  it.each(MIX_ROWS)('$key: every row of the panel greys with its value kept, and one note sits on the Mix row', ({ key, label }) => {
    useAudioStore.setState({ effectsHeldOff: true });
    const { container } = render(<AudioRigEffectPanel effectKey={key} />);
    const sliders = within(container).getAllByRole('slider');
    for (const slider of sliders) {
      const name = slider.getAttribute('aria-label') ?? '';
      expect(slider.getAttribute('data-disabled'), name).not.toBeNull();
      expect(slider.closest('.audio-rig-drawer__param-row')!.classList.contains('sc-held-off'), name).toBe(true);
    }
    expect(within(container).getAllByText(HELD_OFF)).toHaveLength(1);
    expect(within(rowOfSlider(mixSlider(label))).getByText(HELD_OFF)).toBeTruthy();
  });

  it.each(MIX_ROWS)('$key: not held off, no row of the panel greys', ({ key }) => {
    const { container } = render(<AudioRigEffectPanel effectKey={key} />);
    for (const slider of within(container).getAllByRole('slider')) expect(slider.getAttribute('data-disabled')).toBeNull();
    expect(container.querySelector('.sc-held-off')).toBeNull();
  });

  it('greys the Free | Sync toggle of a synced-rate pedal too', () => {
    useAudioStore.setState({ effectsHeldOff: true });
    const { container } = render(<AudioRigEffectPanel effectKey="tremolo" />);
    const toggle = container.querySelector('.sc-tempo-sync') as HTMLElement;
    const controls = toggle.querySelectorAll('[role="switch"]');
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const off = control.hasAttribute('disabled') || control.getAttribute('data-disabled') !== null || control.getAttribute('aria-disabled') === 'true';
      expect(off).toBe(true);
    }
  });

  it('un-greys the moment effectsHeldOff goes false, with no reload, and greys again when it returns', () => {
    useAudioStore.setState({ effectsHeldOff: true });
    render(<AudioRigEffectPanel effectKey="phaser" />);
    const slider = () => mixSlider('fleet.phaser.mix');
    expect(slider().getAttribute('data-disabled')).not.toBeNull();

    act(() => useAudioStore.setState({ effectsHeldOff: false }));
    expect(slider().getAttribute('data-disabled')).toBeNull();
    expect(screen.queryByText(HELD_OFF)).toBeNull();

    act(() => useAudioStore.setState({ effectsHeldOff: true }));
    expect(slider().getAttribute('data-disabled')).not.toBeNull();
  });

  /** Commits of everything under a Profiler: the PANEL's own re-renders, which memoised children hide. */
  function commitsOf(effectKey: 'reverb' | 'phaser') {
    let commits = 0;
    render(
      <Profiler id="panel" onRender={() => { commits += 1; }}>
        <AudioRigEffectPanel effectKey={effectKey} />
      </Profiler>,
    );
    return () => commits;
  }

  it('does not re-render a panel that has no Mix row to hold off when the flag flips (the Reverb never reads it)', () => {
    const commits = commitsOf('reverb');
    const before = commits();
    act(() => useAudioStore.setState({ effectsHeldOff: true }));
    act(() => useAudioStore.setState({ effectsHeldOff: false }));
    expect(commits()).toBe(before);
  });

  it('positive control: the flip DOES re-render an effect panel (so the Profiler check above can fail)', () => {
    const commits = commitsOf('phaser');
    const before = commits();
    act(() => useAudioStore.setState({ effectsHeldOff: true }));
    expect(commits()).toBeGreaterThan(before);
  });

  // Light tier standing cost T19: the Reverb off at Light dims its three rows, values kept, one note.
  it('Reverb: held off, its three rows grey with their values kept, and one note', () => {
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, reverb: { ...s.globalAudio.reverb, wet: 0.37 } }, reverbHeldOff: true }));
    const { container } = render(<AudioRigEffectPanel effectKey="reverb" />);
    const sliders = within(container).getAllByRole('slider');
    expect(sliders).toHaveLength(3);
    for (const slider of sliders) {
      expect(slider.getAttribute('data-disabled'), slider.getAttribute('aria-label') ?? '').not.toBeNull();
      expect(slider.closest('.audio-rig-drawer__param-row')!.classList.contains('sc-held-off')).toBe(true);
    }
    expect(mixSlider('fleet.reverb.amount').getAttribute('aria-valuenow')).toBe('0.37');
    expect(within(container).getAllByText(HELD_OFF)).toHaveLength(1);
    expect(within(rowOfSlider(mixSlider('fleet.reverb.amount'))).getByText(HELD_OFF)).toBeTruthy();
  });

  it('Reverb: the effects hold-off alone does not dim it, nor does the Reverb hold-off dim a pedal or the Delay', () => {
    useAudioStore.setState({ effectsHeldOff: true });
    const reverb = render(<AudioRigEffectPanel effectKey="reverb" />);
    for (const slider of within(reverb.container).getAllByRole('slider')) expect(slider.getAttribute('data-disabled')).toBeNull();
    reverb.unmount();
    useAudioStore.setState({ effectsHeldOff: false, reverbHeldOff: true });
    for (const key of ['phaser', 'delay'] as const) {
      const { container, unmount } = render(<AudioRigEffectPanel effectKey={key} />);
      for (const slider of within(container).getAllByRole('slider')) expect(slider.getAttribute('data-disabled'), key).toBeNull();
      unmount();
    }
  });

  it('does not re-render a panel with nothing to hold off when the Reverb flag flips (the Delay never reads it)', () => {
    let commits = 0;
    render(
      <Profiler id="panel" onRender={() => { commits += 1; }}>
        <AudioRigEffectPanel effectKey="delay" />
      </Profiler>,
    );
    const before = commits;
    act(() => useAudioStore.setState({ reverbHeldOff: true }));
    act(() => useAudioStore.setState({ reverbHeldOff: false }));
    expect(commits).toBe(before);
  });

  it.each(['eq3', 'filterLPF', 'delay', 'reverb', 'compressor', 'limiter'] as const)(
    '%s never reads the flag: nothing greys and no note',
    (key) => {
      useAudioStore.setState({ effectsHeldOff: true });
      const { container } = render(<AudioRigEffectPanel effectKey={key} />);
      for (const slider of within(container).getAllByRole('slider')) expect(slider.getAttribute('data-disabled')).toBeNull();
      expect(within(container).queryByText(HELD_OFF)).toBeNull();
    },
  );
});
