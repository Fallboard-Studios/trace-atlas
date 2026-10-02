import type { CSSProperties } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// CabinetBox (used by every RadioButton here — the Type radio and each LfoLink's own lane
// picker) pops via a real GSAP timeline registered in timelineMap; the shared vitest.setup.ts
// GSAP mock's timeline object has no kill() method, so CabinetBox's own unmount cleanup throws
// unless timelineMap itself is mocked — the established convention every GSAP-timeline test in
// this codebase uses (e.g. AudioRigDrawer.test.tsx).
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

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

/** The `.signature-array-drawer__param` wrapper around one specific field's own slider + (for
 *  Gain/Detune) its LfoLink — found by that slider's own accessible name. */
function paramRow(section: HTMLElement, sliderName: string | RegExp): HTMLElement {
  const slider = within(section).getByRole('slider', { name: sliderName });
  const row = slider.closest('.signature-array-drawer__param');
  if (!row) throw new Error(`no param row for slider "${sliderName}"`);
  return row as HTMLElement;
}

const noop = { onContinuousChange: () => {}, onStructuralChange: () => {}, onLfoChange: () => {} };

describe('SignatureArrayDrawer', () => {
  it('renders exactly 3 layer sections, in Baseline/Coaxial/Harmonic order', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
    const sections = container.querySelectorAll('[data-layer-key]');
    expect(sections).toHaveLength(3);
    expect(Array.from(sections).map((s) => s.getAttribute('data-layer-key'))).toEqual(['layer0', 'layer1', 'layer2']);
  });

  it('renders exactly 3 top-level panels — Baseline/Coaxial/Harmonic, no longer including Robot Drift (docs/tasks/LFO_BANK.md Task 12: Robot Drift now lives only as Fleet Params\' own leaf)', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    expect(screen.queryByText('Source')).toBeNull();
    expect(screen.queryByText('Voice Drift')).toBeNull();
    // Top-level panels only — since Oblique Cabinetry, a top-level panel's own root sits inside
    // its permanently-popped facade (.sc-directional-panel-facade > .sc-cabinet-box >
    // .sc-cabinet-box__front), no longer a direct child of .signature-array-drawer itself.
    const panels = Array.from(container.querySelectorAll(
      '.signature-array-drawer > .sc-directional-panel-facade > .sc-cabinet-box > .sc-cabinet-box__front > .sc-directional-panel',
    ));
    expect(panels).toHaveLength(3);
    const panelLabels = panels.map((p) => p.querySelector(':scope > .sc-dual-label > .sc-dual-label__human')?.textContent);
    expect(panelLabels).toEqual([CONTENT['probe.source.core'].human, CONTENT['probe.source.companion'].human, CONTENT['probe.source.accent'].human]);
  });

  it("each layer's data-layer-key div is nested inside its own DirectionalPanel — wrapped around, not replaced", () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
    (['layer0', 'layer1', 'layer2'] as const).forEach((key) => {
      const layerDiv = layerSection(container, key);
      expect(layerDiv.closest('.sc-directional-panel')).not.toBeNull();
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
      expect(paramRow(pulseLayer, 'Companion Gain').querySelector('.sc-lfo-link')).not.toBeNull();
      expect(paramRow(pulseLayer, 'Companion Detune').querySelector('.sc-lfo-link')).not.toBeNull();
      expect(paramRow(pulseLayer, /phase/i).querySelector('.sc-lfo-link')).toBeNull();
      expect(paramRow(pulseLayer, /interval/i).querySelector('.sc-lfo-link')).toBeNull();

      // A non-pulse layer has the same Gain/Detune LfoLinks and no Interval at all.
      const plainLayer = layerSection(container, 'layer0');
      expect(paramRow(plainLayer, 'Core Gain').querySelector('.sc-lfo-link')).not.toBeNull();
      expect(paramRow(plainLayer, 'Core Detune').querySelector('.sc-lfo-link')).not.toBeNull();
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
      const gainRow = paramRow(layerSection(container, 'layer0'), 'Core Gain');
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
      const gainRow = paramRow(layerSection(container, 'layer0'), 'Core Gain');
      const detuneRow = paramRow(layerSection(container, 'layer0'), 'Core Detune');
      expect(within(gainRow).getByRole('radio', { name: 'Companion LFO' }).getAttribute('aria-checked')).toBe('true');
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
      const gainRow = paramRow(layerSection(container, 'layer1'), 'Companion Gain');
      fireEvent.click(within(gainRow).getByRole('radio', { name: 'Core LFO' }));

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
      const detuneRow = paramRow(layerSection(container, 'layer2'), 'Accent Detune');
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
      const gainRow = paramRow(layerSection(container, 'layer0'), 'Core Gain');
      fireEvent.click(within(gainRow).getByRole('radio', { name: 'Core LFO' }));

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

    const gainRow = paramRow(baseline, 'Core Gain');
    expect(within(gainRow).getByRole('radio', { name: 'Off' }).getAttribute('data-disabled')).toBe('');
    expect(within(gainRow).getByRole('slider', { name: 'Depth' }).getAttribute('data-disabled')).toBe('');
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md section 1.5, Task 11) — an optional
  // `style` prop forwarded to this drawer's own root (Task 17, docs/tasks/NAV_LAYOUT_REWRITE.md:
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

  describe('React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 4)', () => {
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

describe('SignatureArrayLayer — exported standalone (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 10)', () => {
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
    const gainSlider = within(layerEl).getByRole('slider', { name: 'Companion Gain' });
    const gainRow = gainSlider.closest('.signature-array-drawer__param') as HTMLElement;

    fireEvent.click(within(gainRow).getByRole('radio', { name: 'Core LFO' }));

    expect(onLfoFieldChange).toHaveBeenCalledWith(1, 'layer1.gain', { lane: 'a', depth: 25 });
  });

  it('is independently mountable — mounting only one layer works with no cross-layer dependency', () => {
    expect(() => renderLayer(0)).not.toThrow();
  });
});

