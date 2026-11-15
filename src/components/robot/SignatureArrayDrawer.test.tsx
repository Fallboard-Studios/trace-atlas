import type { CSSProperties } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// CabinetBox (used by every RadioButton here — the Type radio and each LfoLink's own lane
// picker) pops via a real GSAP timeline registered in timelineMap; the shared vitest.setup.ts
// GSAP mock's timeline object has no kill() method, so CabinetBox's own unmount cleanup throws
// unless timelineMap itself is mocked — the established convention every GSAP-timeline test in
// this codebase uses (e.g. AudioRigDrawer.test.tsx).
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));
// The LfoLink lane names follow the shell (docs/tasks/LAYOUT_REWORK.md Task 14); pinned to desk so the
// lane radios read "Core LFO (A)" … whatever matchMedia stub a test installs.
vi.mock('@/components/panels/screen/useShell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/panels/screen/useShell')>()),
  useShell: () => 'desk',
}));

// Spied (real cross-module call, wrapped so it still delegates to the actual implementation) so
// a per-layer cascade regression test (docs/todo/backlog.md #27 follow-up, 2026-09-15) can tell
// which layer's controls actually re-rendered — resolveAccessibleName is called unconditionally
// by RadioButton/SliderLinear/SliderCenteredZero, and receives the schema, so calls can be
// filtered by schema.id to attribute them to a specific layer/field.
vi.mock('@/components/ui/controls/accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { SignatureArrayDrawer, SignatureArrayLayer, type SignatureArrayValue } from './SignatureArrayDrawer';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { SIGNATURE_ARRAY_CONFIG } from '@/data/robotOptionsConfig';
import { CONTENT } from '@/content';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type { LfoLink } from '@/types/lfo';


function makeLayers(): OscillatorLayer[] {
  return [
    { type: 'sine', gain: 1, detune: 0, phase: 0 },
    { type: 'square', gain: 0.8, detune: 5, phase: 10, pulseWidth: 0.4 },
    { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
  ];
}

function makeValue(overrides: Partial<SignatureArrayValue> = {}): SignatureArrayValue {
  return { layers: makeLayers(), ...overrides };
}

function layerSection(container: HTMLElement, key: 'layer0' | 'layer1' | 'layer2') {
  const el = container.querySelector(`[data-layer-key="${key}"]`);
  if (!el) throw new Error(`no section for ${key}`);
  return el as HTMLElement;
}

/** The `.signature-array-drawer__param` wrapper around one specific field's own slider — found by
 *  that slider's own accessible name. Holds the slider only: a Gain/Detune LfoLink lives in the NEXT
 *  wrapper (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.4, assumption 3), see linkRow. */
function paramRow(section: HTMLElement, sliderName: string | RegExp): HTMLElement {
  const slider = within(section).getByRole('slider', { name: sliderName });
  const row = slider.closest('.signature-array-drawer__param');
  if (!row) throw new Error(`no param row for slider "${sliderName}"`);
  return row as HTMLElement;
}

/** The `.signature-array-drawer__param` wrapper holding the LfoLink that belongs to `sliderName`
 *  (Gain or Detune): the full-width row directly under that slider's own top-level row in its box
 *  (docs/specs/CONTENT_LAYOUT.md §1.3) — for Gain that row is the nested Type | Gain panel, for
 *  Detune its own wrapper. */
function linkRow(section: HTMLElement, sliderName: string | RegExp): HTMLElement {
  const own = paramRow(section, sliderName);
  const box = own.closest('[data-panel-id$=".p1"], [data-panel-id$=".p2"], [data-panel-id$=".p3"]');
  const boxContent = box?.querySelector(':scope > .sc-directional-panel__content');
  if (!boxContent) throw new Error(`slider "${sliderName}" is not inside a box`);
  let row: Element = own;
  while (row.parentElement && row.parentElement !== boxContent) row = row.parentElement;
  const next = row.nextElementSibling;
  if (!next || !next.classList.contains('signature-array-drawer__param') || !next.querySelector('.sc-lfo-link')) {
    throw new Error(`no LfoLink row directly under slider "${sliderName}"`);
  }
  return next as HTMLElement;
}

const noop = { onContinuousChange: () => {}, onStructuralChange: () => {}, onLfoChange: () => {} };

describe('SignatureArrayDrawer', () => {
  it('renders exactly 3 layer sections, in Baseline/Coaxial/Harmonic order', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
    const sections = container.querySelectorAll('[data-layer-key]');
    expect(sections).toHaveLength(3);
    expect(Array.from(sections).map((s) => s.getAttribute('data-layer-key'))).toEqual(['layer0', 'layer1', 'layer2']);
  });

  it('renders three boxes per layer, nine in all, headed only by each layer\'s name — no Robot Drift (docs/tasks/LFO_BANK.md Task 12: Robot Drift now lives only as Fleet Params\' own leaf)', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    expect(screen.queryByText('Source')).toBeNull();
    expect(screen.queryByText('Voice Drift')).toBeNull();
    // Top-level panels only — since Oblique Cabinetry, a top-level panel's own root sits inside
    // its permanently-popped facade (.sc-directional-panel-facade > .sc-cabinet-box >
    // .sc-cabinet-box__front); each layer's div holds its three (docs/specs/CONTENT_LAYOUT.md §1.3).
    const panels = Array.from(container.querySelectorAll(
      '.signature-array-drawer > .signature-array-drawer__layer > .sc-directional-panel-facade > .sc-cabinet-box > .sc-cabinet-box__front > .sc-directional-panel',
    ));
    expect(panels).toHaveLength(9);
    const panelLabels = panels.map((p) => p.querySelector(':scope > .sc-dual-label > .sc-dual-label__human')?.textContent ?? null);
    expect(panelLabels).toEqual([
      CONTENT['probe.source.core'].human, null, null,
      CONTENT['probe.source.companion'].human, null, null,
      CONTENT['probe.source.accent'].human, null, null,
    ]);
  });

  it("each layer's data-layer-key div holds that layer's own three boxes, p1 to p3, and nothing else", () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
    (['layer0', 'layer1', 'layer2'] as const).forEach((key) => {
      const layerDiv = layerSection(container, key);
      expect(layerDiv.closest('.sc-directional-panel'), key).toBeNull();
      const children = [...layerDiv.children];
      expect(children.every((c) => c.classList.contains('sc-directional-panel-facade')), key).toBe(true);
      expect(children.map((c) => c.querySelector('.sc-directional-panel')?.getAttribute('data-panel-id'))).toEqual([
        `robotOptions.${key}.p1`, `robotOptions.${key}.p2`, `robotOptions.${key}.p3`,
      ]);
    });
  });

  it('renders no Active toggle anywhere — muting is expressed via each layer\'s own Gain slider instead', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);

    expect(within(container).queryAllByRole('switch')).toHaveLength(0);
  });

  it('each layer\'s Type radio has exactly the 5 waveform options, no Noise', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);

    (['layer0', 'layer1', 'layer2'] as const).forEach((key) => {
      const typeGroup = layerSection(container, key).querySelector<HTMLElement>('.sc-radio-button')!;
      const options = within(typeGroup).getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
      expect(options.sort()).toEqual(['Pulse', 'Sawtooth', 'Sine', 'Square', 'Triangle'].sort());
    });
  });

  it('shows Interval only for Burst(pulse) layers', () => {
    const layers = makeLayers();
    layers[1] = { ...layers[1], type: 'pulse' };
    const { container } = render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);

    expect(within(layerSection(container, 'layer0')).queryByText(/Interval/i)).toBeNull();
    expect(within(layerSection(container, 'layer1')).getByText(/Interval/i)).toBeTruthy();
  });

  it('hides Interval for Binary(square) layers', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />); // layer1 is 'square'

    expect(within(layerSection(container, 'layer1')).queryByText(/Interval/i)).toBeNull();
  });

  it('a Type change calls onStructuralChange, not onContinuousChange', () => {
    const onStructuralChange = vi.fn();
    const onContinuousChange = vi.fn();
    const { container } = render(
      <SignatureArrayDrawer value={makeValue()} onContinuousChange={onContinuousChange} onStructuralChange={onStructuralChange} onLfoChange={() => {}} />
    );

    // Scoped to the Type radio's own group (the first .sc-radio-button in the layer — each
    // LfoLink's own lane picker is also a RadioButton, but renders after Type in DOM order).
    const typeGroup = layerSection(container, 'layer0').querySelector<HTMLElement>('.sc-radio-button')!;
    fireEvent.click(within(typeGroup).getByRole('radio', { name: 'Triangle' }));

    expect(onStructuralChange).toHaveBeenCalled();
    expect(onContinuousChange).not.toHaveBeenCalled();
    const newLayers = onStructuralChange.mock.calls[0][0] as OscillatorLayer[];
    expect(newLayers[0].type).toBe('triangle'); // 'Triangle' label -> 'triangle' value, per robotOptionsConfig.ts
  });

  it('a Gain change calls onContinuousChange, not onStructuralChange', () => {
    const onStructuralChange = vi.fn();
    const onContinuousChange = vi.fn();
    const { container } = render(
      <SignatureArrayDrawer value={makeValue()} onContinuousChange={onContinuousChange} onStructuralChange={onStructuralChange} onLfoChange={() => {}} />
    );

    fireEvent.keyDown(within(layerSection(container, 'layer0')).getByRole('slider', { name: /gain/i }), { key: 'ArrowRight' });

    expect(onContinuousChange).toHaveBeenCalled();
    expect(onStructuralChange).not.toHaveBeenCalled();
  });

  it('dragging Coaxial\'s Gain to 0 calls onContinuousChange (not onStructuralChange), keeping its Type/Detune/Phase values, not cleared', () => {
    const onContinuousChange = vi.fn();
    const onStructuralChange = vi.fn();
    const { container } = render(
      <SignatureArrayDrawer value={makeValue()} onContinuousChange={onContinuousChange} onStructuralChange={onStructuralChange} onLfoChange={() => {}} />
    );

    const coaxialGain = within(layerSection(container, 'layer1')).getByRole('slider', { name: 'Companion Gain' });
    coaxialGain.focus();
    fireEvent.keyDown(coaxialGain, { key: 'Home' }); // Radix's own jump-to-min key — lands exactly on 0

    expect(onStructuralChange).not.toHaveBeenCalled();
    expect(onContinuousChange).toHaveBeenCalled();
    const newLayers = onContinuousChange.mock.calls.at(-1)![0] as OscillatorLayer[];
    expect(newLayers[1].gain).toBe(0);
    expect(newLayers[1].type).toBe('square'); // config preserved, not cleared/reset
    expect(newLayers[1].detune).toBe(5);
    expect(newLayers[1].phase).toBe(10);
  });

  it('a Phase change calls onContinuousChange with that layer\'s phase, and never onLfoChange', () => {
    const onContinuousChange = vi.fn();
    const onLfoChange = vi.fn();
    const { container } = render(
      <SignatureArrayDrawer value={makeValue()} onContinuousChange={onContinuousChange} onStructuralChange={() => {}} onLfoChange={onLfoChange} />
    );

    const phaseSlider = within(layerSection(container, 'layer0')).getByRole('slider', { name: /phase/i });
    phaseSlider.focus();
    fireEvent.keyDown(phaseSlider, { key: 'ArrowRight' });

    expect(onContinuousChange).toHaveBeenCalledTimes(1);
    const next = onContinuousChange.mock.calls[0][0] as OscillatorLayer[];
    expect(next[0].phase).toBeGreaterThan(0);
    expect(onLfoChange).not.toHaveBeenCalled();
  });

  it('editing Interval on a pulse layer still calls onContinuousChange with that layer\'s pulseWidth, and never onLfoChange', () => {
    const layers = makeLayers();
    layers[1] = { ...layers[1], type: 'pulse', pulseWidth: 0.4 };
    const onContinuousChange = vi.fn();
    const onLfoChange = vi.fn();
    const { container } = render(
      <SignatureArrayDrawer value={makeValue({ layers })} onContinuousChange={onContinuousChange} onStructuralChange={() => {}} onLfoChange={onLfoChange} />
    );

    const intervalSlider = within(layerSection(container, 'layer1')).getByRole('slider', { name: /interval/i });
    intervalSlider.focus();
    fireEvent.keyDown(intervalSlider, { key: 'ArrowRight' });

    expect(onContinuousChange).toHaveBeenCalledTimes(1);
    const next = onContinuousChange.mock.calls[0][0] as OscillatorLayer[];
    expect(next[1].pulseWidth).toBeCloseTo(0.41, 9);
    expect(next[0]).toEqual(layers[0]);
    expect(onLfoChange).not.toHaveBeenCalled();
  });

  describe('inline LfoLink per Gain/Detune row (docs/tasks/LFO_BANK.md Task 12 — replaces the shared Lfo/LfoTargetGroup display)', () => {
    it('each layer renders Type, Gain + its own LfoLink, Detune + its own LfoLink, Phase (plain), Interval (pulse only, plain)', () => {
      const layers = makeLayers();
      layers[1] = { ...layers[1], type: 'pulse' };
      const { container } = render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);

      const pulseLayer = layerSection(container, 'layer1');
      // The link is the row UNDER its slider, never inside the slider's own wrapper (§1.4, assumption 3).
      expect(linkRow(pulseLayer, 'Companion Gain').querySelector('.sc-lfo-link')).not.toBeNull();
      expect(paramRow(pulseLayer, 'Companion Gain').querySelector('.sc-lfo-link')).toBeNull();
      expect(linkRow(pulseLayer, 'Companion Detune').querySelector('.sc-lfo-link')).not.toBeNull();
      expect(paramRow(pulseLayer, 'Companion Detune').querySelector('.sc-lfo-link')).toBeNull();
      expect(paramRow(pulseLayer, /phase/i).querySelector('.sc-lfo-link')).toBeNull();
      expect(paramRow(pulseLayer, /interval/i).querySelector('.sc-lfo-link')).toBeNull();

      // A non-pulse layer has the same Gain/Detune LfoLinks and no Interval at all.
      const plainLayer = layerSection(container, 'layer0');
      expect(linkRow(plainLayer, 'Core Gain').querySelector('.sc-lfo-link')).not.toBeNull();
      expect(linkRow(plainLayer, 'Core Detune').querySelector('.sc-lfo-link')).not.toBeNull();
      expect(within(plainLayer).queryByRole('slider', { name: /interval/i })).toBeNull();
    });

    it('renders no .sc-lfo-target-group and no accordion anywhere — the old shared-display state machine is gone', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      expect(container.querySelectorAll('.sc-lfo-target-group')).toHaveLength(0);
      expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
      // 2 LfoLinks per layer (Gain, Detune) x 3 layers.
      expect(container.querySelectorAll('.sc-lfo-link')).toHaveLength(6);
    });

    it('defaults an unlinked Gain/Detune to Off, depth 0 (DEFAULT_LFO_LINK)', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      const gainRow = linkRow(layerSection(container, 'layer0'), 'Core Gain');
      expect(within(gainRow).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
      expect(within(gainRow).getByRole('slider', { name: 'Depth' }).getAttribute('aria-valuenow')).toBe('0');
    });

    it('resolves a stored link for the matching target, independently per field', () => {
      const lfoLinks: Partial<Record<string, LfoLink>> = {
        'layer0.gain': { lane: 'b', depth: 40 },
      };
      const { container } = render(
        <SignatureArrayDrawer value={makeValue({ lfoLinks: lfoLinks as SignatureArrayValue['lfoLinks'] })} {...noop} />,
      );
      const gainRow = linkRow(layerSection(container, 'layer0'), 'Core Gain');
      const detuneRow = linkRow(layerSection(container, 'layer0'), 'Core Detune');
      expect(within(gainRow).getByRole('radio', { name: 'Companion LFO (B)' }).getAttribute('aria-checked')).toBe('true');
      expect(within(gainRow).getByRole('slider', { name: 'Depth' }).getAttribute('aria-valuenow')).toBe('40');
      // Detune's own link is untouched — still the default Off/0.
      expect(within(detuneRow).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    });

    it("changing layer 1's Gain link fires onLfoChange('layer1.gain', { lane, depth }), preserving its stored depth", () => {
      const onLfoChange = vi.fn();
      const lfoLinks: Partial<Record<string, LfoLink>> = {
        'layer1.gain': { lane: null, depth: 30 },
      };
      const { container } = render(
        <SignatureArrayDrawer
          value={makeValue({ lfoLinks: lfoLinks as SignatureArrayValue['lfoLinks'] })}
          onContinuousChange={() => {}}
          onStructuralChange={() => {}}
          onLfoChange={onLfoChange}
        />,
      );
      const gainRow = linkRow(layerSection(container, 'layer1'), 'Companion Gain');
      fireEvent.click(within(gainRow).getByRole('radio', { name: 'Core LFO (A)' }));

      expect(onLfoChange).toHaveBeenCalledWith('layer1.gain', { lane: 'a', depth: 30 });
    });

    it("changing layer 2's Detune link's depth fires onLfoChange('layer2.detune', { lane, depth }), preserving its stored lane", () => {
      const onLfoChange = vi.fn();
      const lfoLinks: Partial<Record<string, LfoLink>> = {
        'layer2.detune': { lane: 'c', depth: 20 },
      };
      const { container } = render(
        <SignatureArrayDrawer
          value={makeValue({ lfoLinks: lfoLinks as SignatureArrayValue['lfoLinks'] })}
          onContinuousChange={() => {}}
          onStructuralChange={() => {}}
          onLfoChange={onLfoChange}
        />,
      );
      const detuneRow = linkRow(layerSection(container, 'layer2'), 'Accent Detune');
      const depthSlider = within(detuneRow).getByRole('slider', { name: 'Depth' });
      depthSlider.focus();
      fireEvent.keyDown(depthSlider, { key: 'ArrowRight' });

      expect(onLfoChange).toHaveBeenCalledWith('layer2.detune', { lane: 'c', depth: 21 });
    });

    it('a Gain/Detune link change never calls onContinuousChange/onStructuralChange', () => {
      const onContinuousChange = vi.fn();
      const onStructuralChange = vi.fn();
      const { container } = render(
        <SignatureArrayDrawer value={makeValue()} onContinuousChange={onContinuousChange} onStructuralChange={onStructuralChange} onLfoChange={() => {}} />,
      );
      const gainRow = linkRow(layerSection(container, 'layer0'), 'Core Gain');
      fireEvent.click(within(gainRow).getByRole('radio', { name: 'Core LFO (A)' }));

      expect(onContinuousChange).not.toHaveBeenCalled();
      expect(onStructuralChange).not.toHaveBeenCalled();
    });

    // Robot LFOs/links are never held off (docs/tasks/LFO_BANK.md Task 2 removed the cap that
    // made them held-off-able; the filter-link suspension the dial still applies is global-chain
    // only — see AudioRigEffectPanel, not this drawer).
    it('renders every layer\'s LfoLink fully editable, with no held-off note, regardless of lfoLinks', () => {
      const { container } = render(
        <SignatureArrayDrawer {...noop} value={makeValue({ lfoLinks: { 'layer0.gain': { lane: 'a', depth: 40 } } })} />,
      );
      for (const key of ['layer0', 'layer1', 'layer2'] as const) {
        const section = layerSection(container, key);
        expect(within(section).queryAllByRole('slider').some((s) => s.getAttribute('data-disabled') !== null)).toBe(false);
        expect(within(section).queryByText('Held off by Audio Load')).toBeNull();
      }
    });

    // Unlike the old shared display (whose `fields` array was derived from the whole flat
    // `lfoSettings` object, so ANY target's edit produced a new `fields` reference for every
    // layer), this inline design resolves each target's own link by direct indexing with a
    // stable per-target DEFAULT_LFO_LINK fallback (data/lfoConfig.ts — one object per target,
    // never reconstructed). So although `SignatureArrayLayer`'s own `lfoLinks` prop reference
    // changes for all 3 layers on any edit (its own memo can't bail), an untouched layer's
    // *resolved* link value is referentially identical before and after, so its own `LfoLink`
    // child (independently memoized) still bails — the expensive leaf controls stay isolated per
    // layer even though the outer per-layer function body re-executes. Verified here rather than
    // assumed, since the pre-Task-12 version of this component carried a "known limitation" note
    // for exactly this scenario that no longer applies to the new design.
    it("an lfoLinks reference change only re-renders the edited layer's own LfoLink controls — untouched layers resolve the same DEFAULT_LFO_LINK object and bail", () => {
      const initialValue = makeValue();
      const { rerender } = render(<SignatureArrayDrawer value={initialValue} {...noop} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(
        <SignatureArrayDrawer value={{ ...initialValue, lfoLinks: { 'layer0.gain': { lane: 'a', depth: 40 } } }} {...noop} />,
      );

      function callsFor(schemaId: string) {
        return (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(([schema]) => schema.id === schemaId).length;
      }
      expect(callsFor('robotOptions.layer0.gain.link.lane')).toBeGreaterThan(0);
      expect(callsFor('robotOptions.layer1.gain.link.lane')).toBe(0);
      expect(callsFor('robotOptions.layer2.gain.link.lane')).toBe(0);
      // layer0's own Detune link is untouched too — same stable-default-object bail.
      expect(callsFor('robotOptions.layer0.detune.link.lane')).toBe(0);
    });
  });

  it('disables every internal control when disabled is true, including each Gain row\'s own LfoLink', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} disabled />);

    const baseline = layerSection(container, 'layer0');
    const baselineTypeGroup = baseline.querySelector<HTMLElement>('.sc-radio-button')!;
    expect(within(baselineTypeGroup).getByRole('radio', { name: 'Triangle' }).getAttribute('data-disabled')).toBe('');
    expect(within(baseline).getByRole('slider', { name: /gain/i }).getAttribute('data-disabled')).toBe('');
    expect(within(layerSection(container, 'layer1')).getByRole('slider', { name: 'Companion Gain' }).getAttribute('data-disabled')).toBe('');

    const gainRow = linkRow(baseline, 'Core Gain');
    expect(within(gainRow).getByRole('radio', { name: 'Off' }).getAttribute('data-disabled')).toBe('');
    expect(within(gainRow).getByRole('slider', { name: 'Depth' }).getAttribute('data-disabled')).toBe('');
  });

  // Roadmap Phase 14 (docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md section 1.5, Task 11) — an optional
  // `style` prop forwarded to this drawer's own root (Task 17, docs/tasks/archive/NAV_LAYOUT_REWRITE.md:
  // moved from the now-removed accordion wrapper to the plain .signature-array-drawer
  // root), for trait-color scoping (getTraitColorStyle('spectral'), applied at the
  // RobotOptionsTab call site).
  describe('style prop', () => {
    it('forwards a caller-supplied style to the drawer\'s own root', () => {
      const { container } = render(
        <SignatureArrayDrawer
          value={makeValue()}
          {...noop}
          style={{ '--color-accent-a': '#428d95', '--color-accent-b': '#41ad9f' } as CSSProperties}
        />,
      );
      const root = container.querySelector('.signature-array-drawer') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#428d95');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#41ad9f');
    });

    it('renders with no inline style when the prop is omitted — existing consumers unaffected', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      const root = container.querySelector('.signature-array-drawer') as HTMLElement;
      expect(root.getAttribute('style')).toBeNull();
    });

    it("a layer's own LfoLink is a physical DOM descendant of the styled root — inherits via cascade, no separate wiring", () => {
      const { container } = render(
        <SignatureArrayDrawer
          value={makeValue()}
          {...noop}
          style={{ '--color-accent-a': '#428d95', '--color-accent-b': '#41ad9f' } as CSSProperties}
        />,
      );
      const root = container.querySelector('.signature-array-drawer') as HTMLElement;
      const lfoLinkEl = root.querySelector('.sc-lfo-link');
      expect(lfoLinkEl).not.toBeNull();
      expect(root.contains(lfoLinkEl)).toBe(true);
    });
  });

  // docs/specs/CONTENT_LAYOUT.md §1.3 (docs/tasks/CONTENT_LAYOUT.md Task 17): each oscillator is three boxes.
  // P1: Type beside Gain (a nested 'responsive' row), then Gain's link under it, full width. P2: Detune, then
  // its link. P3: Phase, then Interval as a second row on a pulse layer, or Phase alone otherwise. The
  // layer's heading sits on P1 alone (spec assumption 2); Gain and Detune are featured (§1.4).
  describe('three boxes (docs/specs/CONTENT_LAYOUT.md §1.3, Task 17)', () => {
    function stubMatchMedia(state: { mobile: boolean; tablet: boolean }) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query.includes('639px') ? state.mobile : state.tablet,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        })),
      });
    }
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    afterEach(() => {
      if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    });

    const orientationOf = (panel: Element) => panel.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation');
    const PARAM = 'signature-array-drawer__param';
    const box = (container: HTMLElement, id: string) => {
      const el = container.querySelector(`[data-panel-id="${id}"]`);
      if (!el) throw new Error(`no panel ${id}`);
      return el as HTMLElement;
    };

    /** A box's (or row's) rows, top to bottom: a nested row by its id, a link, the Type radio, or a slider by name. */
    function describeRows(panel: HTMLElement): string[] {
      return [...panel.querySelector(':scope > .sc-directional-panel__content')!.children].map((el) => {
        const panelId = el.getAttribute('data-panel-id');
        if (panelId) return `panel:${panelId}`;
        if (!el.classList.contains(PARAM)) return `other:${el.className}`;
        if (el.querySelector('.sc-lfo-link')) return 'link';
        if (el.querySelector('.sc-radio-button')) return 'type';
        const slider = el.querySelector('[role="slider"]');
        return `slider:${slider?.getAttribute('aria-label') ?? '?'}`;
      });
    }

    it('P1 is the Type | Gain row, then Gain\'s link under it at full width (not inside Gain\'s half)', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      expect(describeRows(box(container, 'robotOptions.layer0.p1'))).toEqual(['panel:robotOptions.layer0.p1.r1', 'link']);
      const topRow = box(container, 'robotOptions.layer0.p1.r1');
      expect(describeRows(topRow)).toEqual(['type', 'slider:Core Gain']);
      expect(topRow.querySelector('.sc-lfo-link')).toBeNull();
    });

    it('P2 is Detune, then its link', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      expect(describeRows(box(container, 'robotOptions.layer2.p2'))).toEqual(['slider:Accent Detune', 'link']);
    });

    it("a pulse layer's third box holds Phase then Interval as two rows of one", () => {
      const layers = makeLayers();
      layers[1] = { ...layers[1], type: 'pulse' };
      const { container } = render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);
      expect(describeRows(box(container, 'robotOptions.layer1.p3'))).toEqual(['slider:Companion Phase', 'slider:Companion Interval']);
    });

    it.each(['sine', 'square', 'triangle', 'sawtooth'] as const)("a %s layer's third box holds Phase alone", (type) => {
      const layers = makeLayers();
      layers[1] = { ...layers[1], type };
      const { container } = render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);
      expect(describeRows(box(container, 'robotOptions.layer1.p3'))).toEqual(['slider:Companion Phase']);
    });

    it("the layer's heading is on its first box alone, on every layer", () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      const headingOf = (id: string) => box(container, id).querySelector(':scope > .sc-dual-label > .sc-dual-label__human')?.textContent ?? null;
      const names = { layer0: 'probe.source.core', layer1: 'probe.source.companion', layer2: 'probe.source.accent' } as const;
      for (const key of ['layer0', 'layer1', 'layer2'] as const) {
        expect(headingOf(`robotOptions.${key}.p1`), key).toBe(CONTENT[names[key]].human);
        expect(headingOf(`robotOptions.${key}.p2`), key).toBeNull();
        expect(headingOf(`robotOptions.${key}.p3`), key).toBeNull();
      }
    });

    it("each layer's Gain and Detune cells are featured, and no other cell is", () => {
      const layers = makeLayers();
      layers[1] = { ...layers[1], type: 'pulse' };
      const { container } = render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);
      const featured = [...container.querySelectorAll('.sc-featured')];
      expect(featured.map((cell) => within(cell as HTMLElement).getByRole('slider').getAttribute('aria-label'))).toEqual([
        'Core Gain', 'Core Detune', 'Companion Gain', 'Companion Detune', 'Accent Gain', 'Accent Detune',
      ]);
      for (const cell of featured) {
        expect(cell.classList.contains(PARAM)).toBe(true);
        expect(cell.querySelector('.sc-lfo-link')).toBeNull();
        expect(cell.querySelector('.sc-radio-button')).toBeNull();
      }
    });

    it('on desktop the Type | Gain row is side by side while every box is a column', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      expect(orientationOf(box(container, 'robotOptions.layer0.p1.r1'))).toBe('row');
      for (const n of [1, 2, 3]) expect(orientationOf(box(container, `robotOptions.layer0.p${n}`)), `p${n}`).toBe('column');
    });

    it('the Type | Gain row stacks (column) on tablet and on mobile', () => {
      for (const tier of [{ mobile: false, tablet: true }, { mobile: true, tablet: true }]) {
        stubMatchMedia(tier);
        const { container, unmount } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
        expect(orientationOf(box(container, 'robotOptions.layer0.p1.r1')), JSON.stringify(tier)).toBe('column');
        unmount();
      }
    });

    it('every slider on every layer is horizontal', () => {
      const layers = makeLayers();
      layers[1] = { ...layers[1], type: 'pulse' };
      render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);
      for (const slider of screen.getAllByRole('slider')) {
        expect(slider.getAttribute('aria-orientation'), slider.getAttribute('aria-label') ?? '?').toBe('horizontal');
      }
    });

    it('switching a layer to pulse grows its third box by the Interval row, and back shrinks it — the other boxes unchanged', () => {
      const layers = makeLayers();
      const { container, rerender } = render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);
      expect(describeRows(box(container, 'robotOptions.layer2.p3'))).toEqual(['slider:Accent Phase']);

      const pulse = makeLayers();
      pulse[2] = { ...pulse[2], type: 'pulse', pulseWidth: 0.3 };
      rerender(<SignatureArrayDrawer value={makeValue({ layers: pulse })} {...noop} />);
      expect(describeRows(box(container, 'robotOptions.layer2.p3'))).toEqual(['slider:Accent Phase', 'slider:Accent Interval']);
      expect(within(layerSection(container, 'layer2')).getByRole('slider', { name: /interval/i }).getAttribute('aria-valuenow')).toBe('0.3');
      expect(describeRows(box(container, 'robotOptions.layer2.p1'))).toEqual(['panel:robotOptions.layer2.p1.r1', 'link']);
      expect(describeRows(box(container, 'robotOptions.layer2.p2'))).toEqual(['slider:Accent Detune', 'link']);

      rerender(<SignatureArrayDrawer value={makeValue({ layers: makeLayers() })} {...noop} />);
      expect(describeRows(box(container, 'robotOptions.layer2.p3'))).toEqual(['slider:Accent Phase']);
    });

    it('the Type | Gain row renders unframed — exactly three Cabinetry facades per layer, nine for the drawer', () => {
      const layers = makeLayers();
      layers[1] = { ...layers[1], type: 'pulse' };
      const { container } = render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);
      expect(container.querySelectorAll('.sc-directional-panel-facade')).toHaveLength(9);
      for (const key of ['layer0', 'layer1', 'layer2'] as const) {
        expect(layerSection(container, key).querySelectorAll('.sc-directional-panel-facade'), key).toHaveLength(3);
      }
    });
  });

  describe('React.memo (docs/tasks/archive/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 4)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((SignatureArrayDrawer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  describe('per-layer cascade regression (docs/todo/backlog.md #27 follow-up, 2026-09-15)', () => {
    // Found live: editing one layer's Gain re-rendered every other layer's own controls too. Root
    // cause — every per-layer handler (handleTypeChange/handleParamChange) was built fresh,
    // unmemoized, inside the parent's own .map() — so editing ANY layer's ANY field changed
    // `value.layers`'s own reference, re-rendering the parent, which then handed every
    // already-memoized layer's own primitives new prop references regardless of whether THAT
    // layer actually changed.
    function callsFor(schemaId: string) {
      return (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(([schema]) => schema.id === schemaId).length;
    }

    it("changing Baseline's (layer0) Gain does not re-render Coaxial's (layer1) or Harmonic's (layer2) own Type radio", () => {
      // Stable across both renders — a caller that re-passes fresh inline closures every render
      // (like RobotOptionsTab used to, before its own docs/todo/backlog.md #27 fix) would
      // destabilize this component's own per-index handlers regardless of how well THIS
      // component memoizes internally; this test is about SignatureArrayDrawer's own behavior
      // given an already-stable caller, matching the real fixed call sites.
      const onContinuousChange = vi.fn();
      const onStructuralChange = vi.fn();
      const onLfoChange = vi.fn();
      const initialValue = makeValue();
      const { rerender } = render(
        <SignatureArrayDrawer value={initialValue} onContinuousChange={onContinuousChange} onStructuralChange={onStructuralChange} onLfoChange={onLfoChange} />
      );
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      // Preserves layer1/layer2's own object references, only replacing layer0 — the same shape
      // applyLayersContinuous's real caller produces (robotOptionsActions.ts's own .map()), not
      // a fresh makeLayers() call, which would allocate all-new objects for every index and
      // falsely look like every layer changed.
      const updatedLayers = initialValue.layers.map((l, i) => (i === 0 ? { ...l, gain: 0.5 } : l));
      rerender(
        <SignatureArrayDrawer value={{ ...initialValue, layers: updatedLayers }} onContinuousChange={onContinuousChange} onStructuralChange={onStructuralChange} onLfoChange={onLfoChange} />
      );

      expect(callsFor('robotOptions.layer0.gain')).toBeGreaterThan(0);
      expect(callsFor('robotOptions.layer1.type')).toBe(0);
      expect(callsFor('robotOptions.layer2.type')).toBe(0);
      expect(callsFor('robotOptions.layer1.gain')).toBe(0);
      expect(callsFor('robotOptions.layer2.gain')).toBe(0);
    });
  });
});

describe('SignatureArrayLayer — exported standalone (docs/tasks/archive/NAV_PANEL_VIEWS_AND_CONTENT.md Task 10)', () => {
  const layers = makeLayers();

  function renderLayer(idx: 0 | 1 | 2, overrides: Partial<Parameters<typeof SignatureArrayLayer>[0]> = {}) {
    return render(
      <SignatureArrayLayer
        block={SIGNATURE_ARRAY_CONFIG[idx]}
        idx={idx}
        layer={layers[idx]}
        lfoLinks={undefined}
        onTypeChange={() => {}}
        onParamChange={() => {}}
        onLfoFieldChange={() => {}}
        {...overrides}
      />,
    );
  }

  it('renders the Core layer\'s own panel identically to the combined drawer\'s own Core section', () => {
    const { container } = renderLayer(0);
    expect(screen.getByText(CONTENT['probe.source.core'].human)).toBeTruthy();
    expect(container.querySelector('[data-layer-key="layer0"]')).toBeTruthy();
  });

  it('renders the Accent layer standalone, with no Core/Companion content anywhere', () => {
    renderLayer(2);
    expect(screen.getByText(CONTENT['probe.source.accent'].human)).toBeTruthy();
    expect(screen.queryByText(CONTENT['probe.source.core'].human)).toBeNull();
    expect(screen.queryByText(CONTENT['probe.source.companion'].human)).toBeNull();
  });

  it('changing the layer\'s Type radio calls onTypeChange with this layer\'s own idx', () => {
    const onTypeChange = vi.fn();
    renderLayer(0, { onTypeChange }); // layer0 starts as 'sine' (makeLayers())
    const layerEl = screen.getByText(CONTENT['probe.source.core'].human).closest('.sc-directional-panel') as HTMLElement;
    const typeGroup = layerEl.querySelector<HTMLElement>('.sc-radio-button')!;
    const squareOption = within(typeGroup).getByRole('radio', { name: 'Square' });

    fireEvent.click(squareOption);

    expect(onTypeChange).toHaveBeenCalledWith(0, 'square');
  });

  it("changing layer 1's Gain link fires onLfoFieldChange(1, 'layer1.gain', { lane, depth })", () => {
    const onLfoFieldChange = vi.fn();
    renderLayer(1, {
      onLfoFieldChange,
      lfoLinks: { 'layer1.gain': { lane: null, depth: 25 } },
    });
    const layerEl = screen.getByText(CONTENT['probe.source.companion'].human).closest('.sc-directional-panel') as HTMLElement;
    const gainRow = linkRow(layerEl, 'Companion Gain');

    fireEvent.click(within(gainRow).getByRole('radio', { name: 'Core LFO (A)' }));

    expect(onLfoFieldChange).toHaveBeenCalledWith(1, 'layer1.gain', { lane: 'a', depth: 25 });
  });

  it('is independently mountable — mounting only one layer works with no cross-layer dependency', () => {
    expect(() => renderLayer(0)).not.toThrow();
  });
});

