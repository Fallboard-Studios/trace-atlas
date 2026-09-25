import type { CSSProperties } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
import { ATTACK_SCHEMA, DECAY_SCHEMA, SUSTAIN_SCHEMA, RELEASE_SCHEMA } from '@/data/robotOptionsConfig';
import type { ADSREnvelope } from '@/types/Robot';


const adsr: ADSREnvelope = { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 };

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
    const { container } = render(<PingContourDrawer value={adsr} onChange={() => {}} />);

    const values = Array.from(container.querySelectorAll('.sc-slider-log__value')).map((el) => el.textContent);
    expect(values).toEqual(['0.2s', '0.3s', '1.5s']);
  });

  it('Sustain displays as 0-100% of the stored 0..1 value', () => {
    render(<PingContourDrawer value={adsr} onChange={() => {}} />);
    expect(screen.getByRole('slider', { name: /sustain/i }).getAttribute('aria-valuenow')).toBe('80');
  });

  it('an Attack edit calls onChange with the full ADSREnvelope, only attack changed', () => {
    const onChange = vi.fn();
    render(<PingContourDrawer value={adsr} onChange={onChange} />);

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
    render(<PingContourDrawer value={adsr} onChange={onChange} />);

    const sustainSlider = screen.getByRole('slider', { name: /sustain/i });
    fireEvent.keyDown(sustainSlider, { key: 'ArrowLeft' });

    const newAdsr = onChange.mock.calls[0][0] as ADSREnvelope;
    expect(newAdsr.sustain).toBeLessThan(0.8);
    expect(newAdsr.sustain).toBeGreaterThanOrEqual(0);
  });

  it('renders its controls inside one Contour panel, with no accordion wrapper (docs/tasks/NAV_LAYOUT_REWRITE.md Task 16: the "Envelope" label now lives on the tree node itself, not this drawer)', () => {
    const { container } = render(<PingContourDrawer value={adsr} onChange={() => {}} />);
    expect(container.querySelectorAll('.sc-accordion')).toHaveLength(0);
    expect(screen.queryByText('Envelope')).toBeNull();
    const pingContourPanel = screen.getByText('Contour').closest('.sc-directional-panel');
    expect(pingContourPanel).not.toBeNull();
    expect(pingContourPanel!.contains(screen.getByRole('slider', { name: /attack/i }))).toBe(true);
  });

  describe('Attack+Decay / Sustain+Release pairing (docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md §1.4 — "two across" on desktop)', () => {
    it('Attack and Decay share a row, and Sustain and Release share a row, on desktop', () => {
      stubMatchMedia({ mobile: false, tablet: false });
      render(<PingContourDrawer value={adsr} onChange={() => {}} />);
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
      render(<PingContourDrawer value={adsr} onChange={() => {}} />);
      const attackRow = screen.getByRole('slider', { name: /attack/i }).closest('.sc-directional-panel')!;
      const decayRow = screen.getByRole('slider', { name: /decay/i }).closest('.sc-directional-panel')!;
      expect(attackRow).toBe(decayRow); // still the same shared sub-row panel...
      expect(attackRow.querySelector(':scope > .sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column'); // ...just column-oriented now
    });

    it('preserves ADSR order: Attack, Decay, Sustain, Release', () => {
      render(<PingContourDrawer value={adsr} onChange={() => {}} />);
      const sliders = screen.getAllByRole('slider');
      expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual(['Attack', 'Decay', 'Sustain', 'Release']);
    });
  });

  it('disables every internal control when disabled is true', () => {
    render(<PingContourDrawer value={adsr} onChange={() => {}} disabled />);
    screen.getAllByRole('slider').forEach((slider) => {
      expect(slider.getAttribute('data-disabled')).toBe('');
    });
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<PingContourDrawer value={adsr} onChange={onChange} disabled />);
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
      const { container } = render(<PingContourDrawer value={adsr} onChange={() => {}} />);
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
      const { rerender } = render(<PingContourDrawer value={adsr} onChange={onChange} />);
      (resolveAccessibleName as ReturnType<typeof vi.fn>).mockClear();

      rerender(<PingContourDrawer value={{ ...adsr, attack: 0.9 }} onChange={onChange} />);

      expect(callsFor(ATTACK_SCHEMA.id)).toBeGreaterThan(0);
      expect(callsFor(DECAY_SCHEMA.id)).toBe(0);
      expect(callsFor(SUSTAIN_SCHEMA.id)).toBe(0);
      expect(callsFor(RELEASE_SCHEMA.id)).toBe(0);
    });
  });
});
