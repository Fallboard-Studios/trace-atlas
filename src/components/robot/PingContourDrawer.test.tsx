import type { CSSProperties } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual implementation) so
// a per-field cascade regression test (docs/todo/backlog.md #27 follow-up, 2026-09-15) can tell
// which specific slider's render body actually re-executed — resolveAccessibleName is called
// unconditionally by SliderLog/SliderLinear, and receives the schema, so calls can be filtered by
// schema.id to attribute them to a specific field.
vi.mock('@/components/ui/controls/accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/controls/accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { PingContourDrawer } from './PingContourDrawer';
import { resolveAccessibleName } from '@/components/ui/controls/accessibleName';
import {
  ATTACK_SCHEMA, DECAY_SCHEMA, SUSTAIN_SCHEMA, RELEASE_SCHEMA, PORTAMENTO_SCHEMA, ATTACK_CURVE_SCHEMA, RELEASE_CURVE_SCHEMA,
} from '@/data/robotOptionsConfig';
import { PORTAMENTO_MIN, PORTAMENTO_MAX } from '@/constants';
import type { ADSREnvelope } from '@/types/Robot';


const adsr: ADSREnvelope = { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 };
/** The Portamento props every render must now supply (docs/specs/ROBOT_ARTICULATION.md §1.6). */
const PORTA = { portamento: 0, onPortamentoChange: () => {} };

/** Stubs window.matchMedia so the mobile/tablet viewport tiers can be controlled — same shape
 *  as AudioRigDrawer.test.tsx's own stubMatchMedia. */
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

describe('PingContourDrawer', () => {
  it('reads Attack/Decay/Release from the value directly', () => {
    // SliderLog's Radix root operates on the internal t in [0,1] (see sliderLogMath.ts) —
    // aria-valuenow reflects t, not the schema-space value — so this checks the visible
    // formatted-value text instead, which is what actually shows the real domain value.
    const { container } = render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);

    // The first three log sliders are the ADSR's; the fourth is Portamento (its own describe below).
    const values = Array.from(container.querySelectorAll('.sc-slider-log__value')).map((el) => el.textContent);
    expect(values.slice(0, 3)).toEqual(['0.2s', '0.3s', '1.5s']);
  });

  it('Sustain displays as 0-100% of the stored 0..1 value', () => {
    render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
    expect(screen.getByRole('slider', { name: /sustain/i }).getAttribute('aria-valuenow')).toBe('80');
  });

  it('an Attack edit calls onChange with the full ADSREnvelope, only attack changed', () => {
    const onChange = vi.fn();
    render(<PingContourDrawer {...PORTA} value={adsr} onChange={onChange} />);

    const attackSlider = screen.getByRole('slider', { name: /attack/i });
    fireEvent.keyDown(attackSlider, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalled();
    const newAdsr = onChange.mock.calls[0][0] as ADSREnvelope;
    expect(newAdsr.attack).toBeGreaterThan(0.2);
    expect(newAdsr.decay).toBe(0.3);
    expect(newAdsr.sustain).toBe(0.8);
    expect(newAdsr.release).toBe(1.5);
  });

  it('a Sustain edit converts the displayed percent back to the stored 0..1 value', () => {
    const onChange = vi.fn();
    render(<PingContourDrawer {...PORTA} value={adsr} onChange={onChange} />);

    const sustainSlider = screen.getByRole('slider', { name: /sustain/i });
    fireEvent.keyDown(sustainSlider, { key: 'ArrowLeft' });

    const newAdsr = onChange.mock.calls[0][0] as ADSREnvelope;
    expect(newAdsr.sustain).toBeLessThan(0.8);
    expect(newAdsr.sustain).toBeGreaterThanOrEqual(0);
  });

  it('renders its controls inside one Contour panel, with no accordion wrapper (docs/tasks/NAV_LAYOUT_REWRITE.md Task 16: the "Envelope" label now lives on the tree node itself, not this drawer)', () => {
    const { container } = render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    expect(screen.queryByText('Envelope')).toBeNull();
    const pingContourPanel = screen.getByText('Contour').closest('.sc-directional-panel');
    expect(pingContourPanel).not.toBeNull();
    expect(pingContourPanel!.contains(screen.getByRole('slider', { name: /attack/i }))).toBe(true);
  });

  describe('Attack+Decay / Sustain+Release pairing (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.4 — "two across" on desktop)', () => {
    it('Attack and Decay share a row, and Sustain and Release share a row, on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      const attackRow = screen.getByRole('slider', { name: /attack/i }).closest('.sc-directional-panel')!;
      const decayRow = screen.getByRole('slider', { name: /decay/i }).closest('.sc-directional-panel')!;
      const sustainRow = screen.getByRole('slider', { name: /sustain/i }).closest('.sc-directional-panel')!;
      const releaseRow = screen.getByRole('slider', { name: /release/i }).closest('.sc-directional-panel')!;
      expect(attackRow).toBe(decayRow);
      expect(sustainRow).toBe(releaseRow);
      expect(attackRow).not.toBe(sustainRow);
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
      expect(sustainRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });

    it('Attack, Decay, Sustain, and Release each get their own row on mobile/tablet', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      const attackRow = screen.getByRole('slider', { name: /attack/i }).closest('.sc-directional-panel')!;
      const decayRow = screen.getByRole('slider', { name: /decay/i }).closest('.sc-directional-panel')!;
      expect(attackRow).toBe(decayRow); // still the same shared sub-row panel...
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column'); // ...just column-oriented now
    });

    it('preserves ADSR order: Attack, Decay, Sustain, Release, then Portamento beneath them', () => {
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      const sliders = screen.getAllByRole('slider');
      expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual(['Attack Time', 'Decay Time', 'Sustain Level', 'Release Time', 'Portamento']);
    });
  });

  it('disables every internal control when disabled is true', () => {
    render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} disabled />);
    screen.getAllByRole('slider').forEach((slider) => {
      expect(slider.getAttribute('data-disabled')).toBe('');
    });
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<PingContourDrawer {...PORTA} value={adsr} onChange={onChange} disabled />);
    fireEvent.keyDown(screen.getByRole('slider', { name: /attack/i }), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 10) — an optional
  // `style` prop forwarded to this drawer's own root (Task 16, docs/tasks/NAV_LAYOUT_REWRITE.md:
  // moved from the now-removed accordion wrapper to the plain .ping-contour-drawer
  // root), for trait-color scoping (getTraitColorStyle('timeSpace'), applied at the
  // RobotOptionsTab call site in Task 12).
  describe('style prop', () => {
    it('forwards a caller-supplied style to the drawer\'s own root', () => {
      const { container } = render(
        <PingContourDrawer
          {...PORTA}
          value={adsr}
          onChange={() => {}}
          style={{ '--color-accent-a': '#4f6d7a', '--color-accent-b': '#65617f' } as CSSProperties}
        />,
      );
      const root = container.querySelector('.ping-contour-drawer') as HTMLElement;
      expect(root.style.getPropertyValue('--color-accent-a')).toBe('#4f6d7a');
      expect(root.style.getPropertyValue('--color-accent-b')).toBe('#65617f');
    });

    it('renders with no inline style when the prop is omitted — existing consumers unaffected', () => {
      const { container } = render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      const root = container.querySelector('.ping-contour-drawer') as HTMLElement;
      expect(root.getAttribute('style')).toBeNull();
    });
  });

  describe('React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 3)', () => {
    // Same reasoning as PingControlsDrawer.test.tsx's own memo describe block — a delegated
    // render-count marker can't cleanly discriminate this drawer's own bail from its already-
    // memoized children's independent one, and the 2 inline DirectionalPanel schemas this task
    // also hoists to module scope have no observable path to a measurable win today either (their
    // own `children` are freshly constructed by this drawer on every real re-render regardless,
    // which is exactly the "conditional benefit" DirectionalPanel's own memoization was
    // documented to have in docs/specs/OBLIQUE_CABINETRY_MEMOIZATION.md §1.3) —
    // so the structural check is what's provable in isolation here.
    it('is a React.memo-wrapped component', () => {
      expect((PingContourDrawer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  describe('per-field cascade regression (docs/todo/backlog.md #27 follow-up, 2026-09-15)', () => {
    // Found live: editing one ADSR field re-rendered all 4 sliders together. Root cause —
    // handleAttackChange/handleDecayChange/handleSustainChange/handleReleaseChange were built
    // fresh, unmemoized, on every render, so whenever `value` changed (any field), all 4 already-
    // memoized sliders got a new `onChange` reference regardless of whether their OWN value
    // changed, defeating their own memo.
    function callsFor(schemaId: string) {
      return (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.filter(([schema]) => schema.id === schemaId).length;
    }

    it('changing Attack re-renders only Attack\'s own slider, not Decay/Sustain/Release', () => {
      const onChange = vi.fn();
      const { rerender } = render(<PingContourDrawer {...PORTA} value={adsr} onChange={onChange} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<PingContourDrawer {...PORTA} value={{ ...adsr, attack: 0.9 }} onChange={onChange} />);

      expect(callsFor(ATTACK_SCHEMA.id)).toBeGreaterThan(0);
      expect(callsFor(DECAY_SCHEMA.id)).toBe(0);
      expect(callsFor(SUSTAIN_SCHEMA.id)).toBe(0);
      expect(callsFor(RELEASE_SCHEMA.id)).toBe(0);
    });

    it('changing Attack leaves Portamento and both shape radios alone, and changing Portamento leaves the ADSR sliders and radios alone', () => {
      const onChange = vi.fn();
      const onPortamentoChange = vi.fn();
      const { rerender } = render(<PingContourDrawer portamento={0.2} onPortamentoChange={onPortamentoChange} value={adsr} onChange={onChange} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<PingContourDrawer portamento={0.2} onPortamentoChange={onPortamentoChange} value={{ ...adsr, attack: 0.9 }} onChange={onChange} />);
      expect(callsFor(PORTAMENTO_SCHEMA.id)).toBe(0);
      expect(callsFor(ATTACK_CURVE_SCHEMA.id)).toBe(0);
      expect(callsFor(RELEASE_CURVE_SCHEMA.id)).toBe(0);

      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();
      rerender(<PingContourDrawer portamento={1.1} onPortamentoChange={onPortamentoChange} value={{ ...adsr, attack: 0.9 }} onChange={onChange} />);
      expect(callsFor(PORTAMENTO_SCHEMA.id)).toBeGreaterThan(0);
      [ATTACK_SCHEMA, DECAY_SCHEMA, SUSTAIN_SCHEMA, RELEASE_SCHEMA, ATTACK_CURVE_SCHEMA, RELEASE_CURVE_SCHEMA].forEach((schema) => {
        expect(callsFor(schema.id), schema.id).toBe(0);
      });
    });

    it('changing the Attack Shape re-renders that radio only: not the sliders, not the Release Shape', () => {
      const onChange = vi.fn();
      const { rerender } = render(<PingContourDrawer {...PORTA} value={adsr} onChange={onChange} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<PingContourDrawer {...PORTA} value={{ ...adsr, attackCurve: 'bounce' }} onChange={onChange} />);

      expect(callsFor(ATTACK_CURVE_SCHEMA.id)).toBeGreaterThan(0);
      [ATTACK_SCHEMA, DECAY_SCHEMA, SUSTAIN_SCHEMA, RELEASE_SCHEMA, PORTAMENTO_SCHEMA, RELEASE_CURVE_SCHEMA].forEach((schema) => {
        expect(callsFor(schema.id), schema.id).toBe(0);
      });
    });
  });

  // docs/specs/ROBOT_ARTICULATION.md §1.6, docs/tasks/ROBOT_ARTICULATION.md Task 8.
  describe('Portamento (row 3)', () => {
    const portamentoSlider = () => screen.getByRole('slider', { name: /portamento/i });

    it('shows the stored seconds beside its slider, and 0 as a reachable value', () => {
      const texts = (container: HTMLElement) => Array.from(container.querySelectorAll('.sc-slider-log__value')).map((el) => el.textContent);
      // Fresh renders, not a rerender: the slider eases a changed value in (useEasedControlValue).
      const half = render(<PingContourDrawer portamento={0.5} onPortamentoChange={() => {}} value={adsr} onChange={() => {}} />);
      expect(texts(half.container)[3]).toBe('0.5s');
      half.unmount();
      const none = render(<PingContourDrawer portamento={0} onPortamentoChange={() => {}} value={adsr} onChange={() => {}} />);
      expect(texts(none.container)[3]).toBe('0s');
    });

    it('is labeled from the content layer', () => {
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      expect(portamentoSlider().getAttribute('aria-label')).toBe(PORTAMENTO_SCHEMA.humanLabel);
    });

    it('an edit calls onPortamentoChange once with the new seconds, within the slider range, and never touches the envelope', () => {
      const onChange = vi.fn();
      const onPortamentoChange = vi.fn();
      render(<PingContourDrawer portamento={0.5} onPortamentoChange={onPortamentoChange} value={adsr} onChange={onChange} />);
      fireEvent.keyDown(portamentoSlider(), { key: 'ArrowRight' });
      expect(onPortamentoChange).toHaveBeenCalledTimes(1);
      const seconds = onPortamentoChange.mock.calls[0][0] as number;
      expect(seconds).toBeGreaterThan(0.5);
      expect(seconds).toBeLessThanOrEqual(PORTAMENTO_MAX);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('at the left end an edit never reports a value below zero', () => {
      const onPortamentoChange = vi.fn();
      render(<PingContourDrawer portamento={0} onPortamentoChange={onPortamentoChange} value={adsr} onChange={() => {}} />);
      fireEvent.keyDown(portamentoSlider(), { key: 'ArrowLeft' });
      onPortamentoChange.mock.calls.forEach(([seconds]) => expect(seconds).toBeGreaterThanOrEqual(PORTAMENTO_MIN));
    });

    it('an ADSR edit never calls onPortamentoChange', () => {
      const onPortamentoChange = vi.fn();
      render(<PingContourDrawer portamento={0.5} onPortamentoChange={onPortamentoChange} value={adsr} onChange={() => {}} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: /attack/i }), { key: 'ArrowRight' });
      expect(onPortamentoChange).not.toHaveBeenCalled();
    });

    it('sits on its own row beneath the ADSR pairs, in the Contour panel', () => {
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      const contour = screen.getByText('Contour').closest('.sc-directional-panel')!;
      expect(contour.contains(portamentoSlider())).toBe(true);
      const portamentoRow = portamentoSlider().closest('.sc-directional-panel')!;
      [/attack/i, /decay/i, /sustain/i, /release/i].forEach((name) => {
        expect(screen.getByRole('slider', { name }).closest('.sc-directional-panel'), String(name)).not.toBe(portamentoRow);
      });
      const releaseSlider = screen.getByRole('slider', { name: /release/i });
      expect(releaseSlider.compareDocumentPosition(portamentoSlider()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('Attack Shape / Release Shape (row 4)', () => {
    const group = (name: string) => screen.getByRole('group', { name });
    const radios = (name: string) => within(group(name)).getAllByRole('radio');
    const checked = (name: string) => radios(name).filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.getAttribute('aria-label'));
    const pickShape = (name: string, curve: string) => fireEvent.click(within(group(name)).getByRole('radio', { name: curve }));

    it('renders both radios with all seven curves each, in order', () => {
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      const expected = ['Linear', 'Exponential', 'Sine', 'Cosine', 'Bounce', 'Ripple', 'Step'];
      expect(radios('Attack Shape').map((r) => r.getAttribute('aria-label'))).toEqual(expected);
      expect(radios('Release Shape').map((r) => r.getAttribute('aria-label'))).toEqual(expected);
    });

    it('a robot with no curves shows both radios on Linear', () => {
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      expect(checked('Attack Shape')).toEqual(['Linear']);
      expect(checked('Release Shape')).toEqual(['Linear']);
    });

    it('shows each stored curve on its own radio', () => {
      render(<PingContourDrawer {...PORTA} value={{ ...adsr, attackCurve: 'sine', releaseCurve: 'step' }} onChange={() => {}} />);
      expect(checked('Attack Shape')).toEqual(['Sine']);
      expect(checked('Release Shape')).toEqual(['Step']);
    });

    it('choosing Bounce for Attack Shape calls onChange with the other ADSR fields and the release curve spread unchanged', () => {
      const onChange = vi.fn();
      render(<PingContourDrawer {...PORTA} value={{ ...adsr, releaseCurve: 'ripple' }} onChange={onChange} />);
      pickShape('Attack Shape', 'Bounce');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ ...adsr, attackCurve: 'bounce', releaseCurve: 'ripple' });
    });

    it('choosing Cosine for Release Shape keeps the attack curve and the four ADSR numbers', () => {
      const onChange = vi.fn();
      render(<PingContourDrawer {...PORTA} value={{ ...adsr, attackCurve: 'exponential' }} onChange={onChange} />);
      pickShape('Release Shape', 'Cosine');
      expect(onChange).toHaveBeenCalledWith({ ...adsr, attackCurve: 'exponential', releaseCurve: 'cosine' });
    });

    it('the other curve stays absent when it was never set: no releaseCurve: "linear" is invented', () => {
      const onChange = vi.fn();
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={onChange} />);
      pickShape('Attack Shape', 'Step');
      const next = onChange.mock.calls[0][0] as ADSREnvelope;
      expect(next).toEqual({ ...adsr, attackCurve: 'step' });
      expect('releaseCurve' in next).toBe(false);
    });

    it('clicking the curve that is already chosen is not an edit', () => {
      const onChange = vi.fn();
      render(<PingContourDrawer {...PORTA} value={{ ...adsr, attackCurve: 'sine' }} onChange={onChange} />);
      pickShape('Attack Shape', 'Sine');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('a shape edit never calls onPortamentoChange', () => {
      const onPortamentoChange = vi.fn();
      render(<PingContourDrawer portamento={0.3} onPortamentoChange={onPortamentoChange} value={adsr} onChange={() => {}} />);
      pickShape('Release Shape', 'Ripple');
      expect(onPortamentoChange).not.toHaveBeenCalled();
    });

    it.each([
      ['Attack Shape', 'attackCurve'],
      ['Release Shape', 'releaseCurve'],
    ] as const)('%s reads the latest envelope at click time, so a pick after an attack edit does not revert it', (name, field) => {
      const onChange = vi.fn();
      const { rerender } = render(<PingContourDrawer {...PORTA} value={adsr} onChange={onChange} />);
      rerender(<PingContourDrawer {...PORTA} value={{ ...adsr, attack: 0.9 }} onChange={onChange} />);
      pickShape(name, 'Sine');
      expect(onChange).toHaveBeenCalledWith({ ...adsr, attack: 0.9, [field]: 'sine' });
    });

    it('the two radios share one row, below Portamento, and are told apart by name', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      const attackRow = group('Attack Shape').closest('.sc-directional-panel')!;
      expect(group('Release Shape').closest('.sc-directional-panel')).toBe(attackRow);
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
      expect(attackRow).not.toBe(screen.getByRole('slider', { name: /portamento/i }).closest('.sc-directional-panel'));
      const portamento = screen.getByRole('slider', { name: /portamento/i });
      expect(portamento.compareDocumentPosition(group('Attack Shape')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(group('Attack Shape')).not.toBe(group('Release Shape'));
    });

    it('stacks the two radios on mobile/tablet', () => {
      stubMatchMedia({ mobile: true, tablet: true });
      render(<PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} />);
      const row = group('Attack Shape').closest('.sc-directional-panel')!;
      expect(row.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
    });
  });

  describe('disabled covers the new controls', () => {
    it('disables Portamento and both radios, and none of them reports an edit', () => {
      const onChange = vi.fn();
      const onPortamentoChange = vi.fn();
      render(<PingContourDrawer portamento={0.5} onPortamentoChange={onPortamentoChange} value={adsr} onChange={onChange} disabled />);
      expect(screen.getByRole('slider', { name: /portamento/i }).getAttribute('data-disabled')).toBe('');
      ['Attack Shape', 'Release Shape'].forEach((name) => {
        within(screen.getByRole('group', { name })).getAllByRole('radio').forEach((r) => expect(r.hasAttribute('disabled') || r.getAttribute('data-disabled') === '').toBe(true));
      });
      fireEvent.keyDown(screen.getByRole('slider', { name: /portamento/i }), { key: 'ArrowRight' });
      fireEvent.click(within(screen.getByRole('group', { name: 'Attack Shape' })).getByRole('radio', { name: 'Bounce' }));
      expect(onPortamentoChange).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('trait style reaches the new rows', () => {
    it('Portamento and the radios render inside the one styled root', () => {
      const { container } = render(
        <PingContourDrawer {...PORTA} value={adsr} onChange={() => {}} style={{ '--color-accent-a': '#4f6d7a' } as CSSProperties} />,
      );
      const root = container.querySelector('.ping-contour-drawer') as HTMLElement;
      expect(root.contains(screen.getByRole('slider', { name: /portamento/i }))).toBe(true);
      expect(root.contains(screen.getByRole('group', { name: 'Release Shape' }))).toBe(true);
    });
  });
});
