import type { CSSProperties } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';

// Same reasoning as AudioRigDrawer.test.tsx: the shared vitest.setup.ts GSAP mock's timeline
// object has no kill() method, and useLfoTargetGroup's unmount/reselect cleanup calls
// killTimeline on an already-registered entry — mock timelineMap directly, the established
// convention every GSAP-timeline test in this codebase uses.
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// The Robot Drift panel (docs/tasks/DIRECTIONAL_PANEL_WIRING.md "some fixes" follow-up) reads/
// writes the global lfoDrift.robots slice directly via useAudioStore, whose setGlobalLfoDrift
// calls into lfoEngine — same real-AudioContext-throws-in-jsdom concern AudioRigDrawer.test.tsx
// already works around by mocking this module.
vi.mock('@/engine/lfoEngine', () => ({
  lfoEngine: {
    setGlobalRateDrift: vi.fn(),
    setGlobalDepthDrift: vi.fn(),
  },
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

import { SignatureArrayDrawer, type SignatureArrayValue } from './SignatureArrayDrawer';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import { useAudioStore } from '@/stores/audioStore';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type { Robot } from '@/types/Robot';


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

const noop = { onContinuousChange: () => {}, onStructuralChange: () => {}, onLfoChange: () => {} };

describe('SignatureArrayDrawer', () => {
  beforeEach(() => {
    // Robot Drift reads/writes the real global store directly (it's not part of this
    // component's own `value` prop) — reset it so one test's edit can't leak into the next.
    useAudioStore.setState((s) => ({
      globalAudio: { ...s.globalAudio, lfoDrift: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift } },
    }));
  });

  it('renders exactly 3 layer sections, in Baseline/Coaxial/Harmonic order', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
    const sections = container.querySelectorAll('[data-layer-key]');
    expect(sections).toHaveLength(3);
    expect(Array.from(sections).map((s) => s.getAttribute('data-layer-key'))).toEqual(['layer0', 'layer1', 'layer2']);
  });

  it('renders 4 top-level panels with no accordion wrapper — Baseline/Coaxial/Harmonic, then Robot Drift, in order (DIRECTIONAL_PANEL_WIRING Task 8 + Robot Drift follow-up, reordered to render last; docs/tasks/NAV_LAYOUT_REWRITE.md Task 17: the "Source" label now lives on the tree node itself, not this drawer)', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    expect(screen.queryByText('Source')).toBeNull();
    // Top-level panels only — each layer's own LfoTargetGroup now nests an inner sliders panel of
    // its own one level deeper (the column[sliders-panel, Lfo, driftContent] follow-up fix), so a
    // plain descendant selector would also match those. Since Oblique Cabinetry —
    // DirectionalPanel, a top-level panel's own root sits inside its permanently-popped facade
    // (.sc-directional-panel-facade > .sc-cabinet-box > .sc-cabinet-box__front), no longer a
    // direct child of .signature-array-drawer itself — the fully-qualified chain through the
    // facade is what now uniquely identifies "top-level," the same way the plain direct-child
    // selector used to. See docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md §1.3.
    const panels = Array.from(container.querySelectorAll(
      '.signature-array-drawer > .sc-directional-panel-facade > .sc-cabinet-box > .sc-cabinet-box__front > .sc-directional-panel',
    ));
    expect(panels).toHaveLength(4);
    // Each panel's own label is its direct-child DualLabel — not the many nested DualLabels
    // every RadioButton/slider/LFO field inside it also renders for its own humanLabel.
    const panelLabels = panels.map((p) => p.querySelector(':scope > .sc-dual-label > .sc-dual-label__human')?.textContent);
    expect(panelLabels).toEqual(['Baseline', 'Coaxial', 'Harmonic', 'Robot Drift']);
  });

  describe('Robot Drift panel (moved from AudioRigDrawer\'s Transport & Composition — global lfoDrift.robots, read/written directly via useAudioStore)', () => {
    it('renders as the last panel, after Harmonic', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      const driftPanel = screen.getByText('Robot Drift').closest('.sc-directional-panel');
      const harmonicPanel = screen.getByText('Harmonic').closest('.sc-directional-panel');
      expect(driftPanel).not.toBeNull();
      expect(harmonicPanel!.compareDocumentPosition(driftPanel!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Not nested inside — or replacing — any of the 3 layer sections.
      expect(container.querySelector('[data-layer-key]')?.contains(driftPanel)).toBe(false);
    });

    it('shows the store\'s current lfoDrift.robots values as a -100..100 percent, not the internal -1..1 fraction', () => {
      useAudioStore.setState((s) => ({
        globalAudio: { ...s.globalAudio, lfoDrift: { ...s.globalAudio.lfoDrift, robots: { rateDrift: -0.2, depthDrift: 0.9 } } },
      }));
      render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      const driftPanel = screen.getByText('Robot Drift').closest('.sc-directional-panel') as HTMLElement;
      expect(within(driftPanel).getByRole('slider', { name: 'Rate Drift' }).getAttribute('aria-valuenow')).toBe('-20');
      expect(within(driftPanel).getByRole('slider', { name: 'Depth Drift' }).getAttribute('aria-valuenow')).toBe('90');
    });

    it('dragging Rate Drift calls the store\'s setGlobalLfoDrift with \'robots\' and the dragged percent divided by 100', () => {
      useAudioStore.setState((s) => ({
        globalAudio: { ...s.globalAudio, lfoDrift: { ...s.globalAudio.lfoDrift, robots: { rateDrift: 0, depthDrift: 0.5 } } },
      }));
      render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      const driftPanel = screen.getByText('Robot Drift').closest('.sc-directional-panel') as HTMLElement;
      const rateSlider = within(driftPanel).getByRole('slider', { name: 'Rate Drift' });
      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

      const newPercent = Number(rateSlider.getAttribute('aria-valuenow'));
      expect(newPercent).not.toBe(0);
      expect(useAudioStore.getState().globalAudio.lfoDrift.robots.rateDrift).toBeCloseTo(newPercent / 100);
      expect(useAudioStore.getState().globalAudio.lfoDrift.robots.depthDrift).toBe(0.5); // untouched
    });

    it('renders identically regardless of the drawer\'s own `disabled` prop — a global control, not scoped to the selected robot/company', () => {
      render(<SignatureArrayDrawer value={makeValue()} {...noop} disabled />);
      const driftPanel = screen.getByText('Robot Drift').closest('.sc-directional-panel') as HTMLElement;
      expect(within(driftPanel).getByRole('slider', { name: 'Rate Drift' }).getAttribute('data-disabled')).toBeNull();
      expect(within(driftPanel).getByRole('slider', { name: 'Depth Drift' }).getAttribute('data-disabled')).toBeNull();
    });
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
      expect(options.sort()).toEqual(['BINARY', 'BURST', 'GRADIENT', 'KINETIC', 'SWEEP'].sort());
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

    fireEvent.click(within(layerSection(container, 'layer0')).getByRole('radio', { name: 'GRADIENT' }));

    expect(onStructuralChange).toHaveBeenCalled();
    expect(onContinuousChange).not.toHaveBeenCalled();
    const newLayers = onStructuralChange.mock.calls[0][0] as OscillatorLayer[];
    expect(newLayers[0].type).toBe('triangle'); // 'GRADIENT' label -> 'triangle' value, per robotOptionsConfig.ts
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

    const coaxialGain = within(layerSection(container, 'layer1')).getByRole('slider', { name: 'Coaxial Gain' });
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

  it('defaults each layer\'s shared LFO display to its first field (Gain) and wires onLfoChange to it', () => {
    const onLfoChange = vi.fn();
    const value = makeValue({
      lfoSettings: { 'layer0.gain': { shape: 'sine', rate: 1, depth: 10 } } as unknown as Robot['lfoSettings'],
    });
    const { container } = render(
      <SignatureArrayDrawer value={value} onContinuousChange={() => {}} onStructuralChange={() => {}} onLfoChange={onLfoChange} />
    );

    const gainLfoRate = within(layerSection(container, 'layer0')).getByRole('slider', { name: 'Rate' });
    gainLfoRate.focus();
    fireEvent.keyDown(gainLfoRate, { key: 'ArrowRight' });

    expect(onLfoChange).toHaveBeenCalledWith('layer0.gain', { shape: 'sine', rate: 1.05, depth: 10 });
  });

  describe('shared LFO display (LFO_CONSOLIDATED_DISPLAY — replaces the old per-param nested accordion)', () => {
    it('renders exactly one shared LFO display per layer — 3 total, never one per param', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      expect(container.querySelectorAll('.sc-lfo')).toHaveLength(3);
    });

    it('renders no accordion anywhere — no nested "Modulation" accordion per param, and no drawer-level wrapper either (Task 17)', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    });

    it('the Type radio renders inline among the layer\'s other controls, not inside the shared LFO group\'s row targeting', () => {
      const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      const typeRadio = within(layerSection(container, 'layer0')).getByRole('radio', { name: 'GRADIENT' });
      expect(typeRadio.closest('.sc-lfo-target-group__row')).toBeNull();
    });

    it('clicking a different param\'s row switches which target the shared display edits, once the transition completes', async () => {
      const onLfoChange = vi.fn();
      const { container } = render(
        <SignatureArrayDrawer value={makeValue()} onContinuousChange={() => {}} onStructuralChange={() => {}} onLfoChange={onLfoChange} />
      );
      const detuneSlider = within(layerSection(container, 'layer0')).getByRole('slider', { name: /detune/i });
      const detuneRow = detuneSlider.closest('.sc-lfo-target-group__row')!;

      await act(async () => {
        fireEvent.click(detuneRow);
      });
      await waitFor(() => {
        expect(detuneRow.classList.contains('isActive')).toBe(true);
      });

      const rateSlider = within(layerSection(container, 'layer0')).getByRole('slider', { name: 'Rate' });
      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });
      expect(onLfoChange.mock.calls[0][0]).toBe('layer0.detune');
    });

    // Confirmed, intentional behavior (docs/tasks/NAV_LAYOUT_REWRITE.md Task 17, spec R2 — see
    // this file's own top-of-component doc comment): under the old accordion wrapper, a layer's
    // selected LFO target survived a collapse/reopen because its lazy-mount kept
    // the content mounted, just hidden. Now that this drawer only exists in the DOM while its tree
    // leaf is the selected one, ContentPane genuinely unmounts it on navigating away and remounts
    // it fresh on return — so the selection resets to the group's first field every time, rather
    // than surviving the round trip. This is a real UX difference from before, not a regression in
    // this component's own logic — useLfoTargetGroup's local useState behaves exactly as designed.
    it('a non-default LFO target selection does not survive an unmount/remount — resets to the group\'s first field, matching a real navigate-away-and-back', async () => {
      const { container, unmount } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);
      const detuneRow = within(layerSection(container, 'layer0')).getByRole('slider', { name: /detune/i }).closest('.sc-lfo-target-group__row')!;

      await act(async () => {
        fireEvent.click(detuneRow);
      });
      await waitFor(() => {
        expect(detuneRow.classList.contains('isActive')).toBe(true);
      });

      unmount();
      const { container: remounted } = render(<SignatureArrayDrawer value={makeValue()} {...noop} />);

      const gainRow = within(layerSection(remounted, 'layer0')).getByRole('slider', { name: /gain/i }).closest('.sc-lfo-target-group__row')!;
      expect(gainRow.classList.contains('isActive')).toBe(true);
    });

    it('toggling a layer\'s type to pulse shows the Interval row in that layer\'s shared group', () => {
      const layers = makeLayers();
      layers[1] = { ...layers[1], type: 'pulse' };
      const { container } = render(<SignatureArrayDrawer value={makeValue({ layers })} {...noop} />);
      const intervalSlider = within(layerSection(container, 'layer1')).getByRole('slider', { name: /interval/i });
      expect(intervalSlider.closest('.sc-lfo-target-group__row')).not.toBeNull();
    });

    it('falls back to the first remaining field without erroring when the targeted Interval row disappears (type leaves pulse)', async () => {
      const layers = makeLayers();
      layers[1] = { ...layers[1], type: 'pulse' };
      const value = makeValue({ layers });
      const onLfoChange = vi.fn();
      const { container, rerender } = render(
        <SignatureArrayDrawer value={value} onContinuousChange={() => {}} onStructuralChange={() => {}} onLfoChange={onLfoChange} />
      );

      // Target Interval (the last field) before it disappears.
      const intervalRow = within(layerSection(container, 'layer1')).getByRole('slider', { name: /interval/i }).closest('.sc-lfo-target-group__row')!;
      await act(async () => {
        fireEvent.click(intervalRow);
      });
      await waitFor(() => expect(intervalRow.classList.contains('isActive')).toBe(true));

      // Type leaves 'pulse' — Interval's row disappears from the DOM entirely.
      const layersWithoutPulse = layers.map((l, i) => (i === 1 ? { ...l, type: 'square' as const } : l));
      rerender(
        <SignatureArrayDrawer
          value={makeValue({ layers: layersWithoutPulse })}
          onContinuousChange={() => {}}
          onStructuralChange={() => {}}
          onLfoChange={onLfoChange}
        />
      );

      expect(within(layerSection(container, 'layer1')).queryByText(/Interval/i)).toBeNull();
      // Falls back to Gain (layer1's first field) — no crash, and the shared display still works.
      const rateSlider = within(layerSection(container, 'layer1')).getByRole('slider', { name: 'Rate' });
      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });
      expect(onLfoChange.mock.calls.at(-1)?.[0]).toBe('layer1.gain');
    });

    it('resolves a company-mode-shaped (partial) lfoSettings value the same way for every layer, unchanged from before consolidation', () => {
      const onLfoChange = vi.fn();
      const value = makeValue({
        // Only layer2's phase has been broadcast-edited — every other target falls back to
        // DEFAULT_LFO_SETTINGS, exactly as CompanyOptionsSection's own resolved snapshot does.
        lfoSettings: { 'layer2.phase': { shape: 'square', rate: 3, depth: 25 } } as unknown as Robot['lfoSettings'],
      });
      const { container } = render(
        <SignatureArrayDrawer value={value} onContinuousChange={() => {}} onStructuralChange={() => {}} onLfoChange={onLfoChange} />
      );

      // layer2's shared display defaults to Gain (unaffected by the partial lfoSettings), so
      // this just proves no crash and normal default-fallback resolution across every layer.
      const rateSlider = within(layerSection(container, 'layer2')).getByRole('slider', { name: 'Rate' });
      rateSlider.focus();
      fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });
      expect(onLfoChange).toHaveBeenCalledWith('layer2.gain', expect.objectContaining({ rate: expect.any(Number) }));
    });
  });

  it('disables every internal control when disabled is true', () => {
    const { container } = render(<SignatureArrayDrawer value={makeValue()} {...noop} disabled />);

    const baseline = layerSection(container, 'layer0');
    expect(within(baseline).getByRole('radio', { name: 'GRADIENT' }).getAttribute('data-disabled')).toBe('');
    expect(within(baseline).getByRole('slider', { name: /gain/i }).getAttribute('data-disabled')).toBe('');
    expect(within(layerSection(container, 'layer1')).getByRole('slider', { name: 'Coaxial Gain' }).getAttribute('data-disabled')).toBe('');
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 11) — an optional
  // `style` prop forwarded to this drawer's own root (Task 17, docs/tasks/NAV_LAYOUT_REWRITE.md:
  // moved from the now-removed accordion wrapper to the plain .signature-array-drawer
  // root), for trait-color scoping (getTraitColorStyle('spectral'), applied at the
  // RobotOptionsTab call site in Task 12). Also proves Robot Drift (rendered inside this same
  // root) inherits it via cascade, per spec §1.6.
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

    it("Robot Drift's own sliders are a physical DOM descendant of the styled root — inherits via cascade, no separate wiring", () => {
      const { container } = render(
        <SignatureArrayDrawer
          value={makeValue()}
          {...noop}
          style={{ '--color-accent-a': '#428d95', '--color-accent-b': '#41ad9f' } as CSSProperties}
        />,
      );
      const root = container.querySelector('.signature-array-drawer') as HTMLElement;
      const driftSlider = within(root).getAllByRole('slider', { name: 'Rate Drift' })[0];
      expect(root.contains(driftSlider)).toBe(true);
    });
  });

  describe('React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 4)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((SignatureArrayDrawer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  describe('per-layer cascade regression (docs/todo/backlog.md #27 follow-up, 2026-09-15)', () => {
    // Found live: editing one layer's Gain re-rendered every other layer's own controls too. Root
    // cause — every per-layer handler (handleTypeChange/handleParamChange, the `fields` array and
    // `renderField` callback handed to LfoTargetGroup) was built fresh, unmemoized, inside the
    // parent's own .map() — so editing ANY layer's ANY field changed `value.layers`'s own
    // reference, re-rendering the parent, which then handed every already-memoized layer's own
    // primitives new prop references regardless of whether THAT layer actually changed.
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

  // Audio Load Budget (plan task 22): held-off layer LFOs and Robot Drift grey out, values kept, with a label.
  describe('Audio Load: held-off LFOs and drift', () => {
    const HELD = 'Held off by Audio Load';
    const rateIn = (el: HTMLElement) => within(el).getByRole('slider', { name: 'Rate' });
    const disabled = (el: HTMLElement) => el.getAttribute('data-disabled') !== null;
    const lfoValue = { shape: 'sine' as const, rate: 2, depth: 40 };

    beforeEach(() => {
      useAudioStore.setState({ driftHeldOff: false });
    });

    it('greys the layer frame whose displayed target is held off (shows 0, not the stored value; label shown) and no other layer', () => {
      const { container } = render(
        <SignatureArrayDrawer {...noop} value={makeValue({ lfoSettings: { 'layer0.gain': lfoValue } })} heldOffTargets={{ 'layer0.gain': true }} />,
      );
      const layer0 = layerSection(container, 'layer0');
      expect(disabled(rateIn(layer0))).toBe(true);
      // 0, not the real stored value (2) — a held-off control should read as visibly "off". The
      // real value is kept in the store, untouched, and returns once it's re-enabled.
      expect(rateIn(layer0).getAttribute('aria-valuenow')).toBe('0');
      expect(within(layer0).getByText(HELD)).toBeTruthy();
      expect(layer0.querySelector('.sc-lfo.sc-held-off')).toBeTruthy();
      for (const key of ['layer1', 'layer2'] as const) {
        expect(disabled(rateIn(layerSection(container, key)))).toBe(false);
        expect(within(layerSection(container, key)).queryByText(HELD)).toBeNull();
      }
    });

    it('follows the selected target: a held-off Detune greys the frame only once Detune is selected', async () => {
      const { container } = render(<SignatureArrayDrawer {...noop} value={makeValue()} heldOffTargets={{ 'layer0.detune': true }} />);
      const layer0 = layerSection(container, 'layer0');
      expect(disabled(rateIn(layer0))).toBe(false); // showing Gain

      await act(async () => {
        within(layer0).getByRole('slider', { name: /Detune/ }).focus();
      });

      await waitFor(() => expect(disabled(rateIn(layerSection(container, 'layer0')))).toBe(true));
      expect(within(layerSection(container, 'layer0')).getByText(HELD)).toBeTruthy();
    });

    it('is fully editable with nothing held off, or when the prop is omitted (company options)', () => {
      const { container } = render(<SignatureArrayDrawer {...noop} value={makeValue()} />);
      for (const key of ['layer0', 'layer1', 'layer2'] as const) expect(disabled(rateIn(layerSection(container, key)))).toBe(false);
      expect(screen.queryByText(HELD)).toBeNull();
    });

    it('greys Robot Drift while the drift tier is off, showing 0 (not the stored value), and restores it', () => {
      useAudioStore.setState((s) => ({
        globalAudio: { ...s.globalAudio, lfoDrift: { ...s.globalAudio.lfoDrift, robots: { rateDrift: 0.3, depthDrift: -0.2 } } },
        driftHeldOff: true,
      }));
      render(<SignatureArrayDrawer {...noop} value={makeValue()} />);
      const rateDrift = screen.getByRole('slider', { name: 'Rate Drift' });
      const depthDrift = screen.getByRole('slider', { name: 'Depth Drift' });
      expect(disabled(rateDrift)).toBe(true);
      expect(disabled(depthDrift)).toBe(true);
      // 0, not the real stored value (30/-20) — a held-off control should read as visibly "off".
      // The real value is kept in the store, untouched, and returns once it's re-enabled.
      expect(rateDrift.getAttribute('aria-valuenow')).toBe('0');
      expect(depthDrift.getAttribute('aria-valuenow')).toBe('0');
      expect(screen.getByText(HELD)).toBeTruthy();
      expect(rateDrift.closest('.signature-array-drawer__param')?.classList.contains('sc-held-off')).toBe(true);

      act(() => useAudioStore.setState({ driftHeldOff: false }));

      expect(disabled(screen.getByRole('slider', { name: 'Rate Drift' }))).toBe(false);
      expect(screen.getByRole('slider', { name: 'Rate Drift' }).getAttribute('aria-valuenow')).toBe('30');
      expect(screen.getByRole('slider', { name: 'Depth Drift' }).getAttribute('aria-valuenow')).toBe('-20');
      expect(screen.queryByText(HELD)).toBeNull();
    });

    it("Robot Drift still ignores the drawer's own disabled prop — only the drift tier greys it", () => {
      render(<SignatureArrayDrawer {...noop} value={makeValue()} disabled />);
      expect(disabled(screen.getByRole('slider', { name: 'Rate Drift' }))).toBe(false);
    });
  });
});
