import { Profiler } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { allowedDelayNoteValues } from '@/utils/tempoSync';
import { formatNoteValue } from '@/utils/formatNoteValue';
import { facadeCurrentLabels } from '@/testUtils/toggleFacade';
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
        globalAudio: { ...s.globalAudio, reverb: { ...s.globalAudio.reverb, decay: 2.5, preDelay: 0.25, wet: 0.4 } },
      }));
      render(<AudioRigEffectPanel effectKey="reverb" />);
      expect(screen.getByRole('slider', { name: 'Pre-Delay' }).getAttribute('aria-valuenow')).toBe('0.25');
      expect(screen.getByRole('slider', { name: 'Reverb Amount' }).getAttribute('aria-valuenow')).toBe('0.4');
      const preDelay = screen.getByRole('slider', { name: 'Pre-Delay' });
      preDelay.focus();
      fireEvent.keyDown(preDelay, { key: 'ArrowRight' });
      expect(useAudioStore.getState().globalAudio.reverb.preDelay).toBeCloseTo(0.26, 10);
      expect(useAudioStore.getState().globalAudio.reverb.decay).toBe(2.5);
      expect(useAudioStore.getState().globalAudio.reverb.wet).toBe(0.4);
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
});
