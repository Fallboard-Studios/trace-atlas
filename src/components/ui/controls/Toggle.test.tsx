import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./CabinetBox', () => ({
  CabinetBox: (props: { popped: boolean; boxHeight?: number; timelineKey: string; children?: React.ReactNode }) => (
    <div
      data-testid="cabinet-box"
      data-popped={String(props.popped)}
      data-box-height={props.boxHeight}
      data-timeline-key={props.timelineKey}
    >
      {props.children}
    </div>
  ),
}));

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 7) can tell whether Toggle's render body actually re-executed —
// resolveAccessibleName(schema) is called unconditionally in the render body.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { Toggle } from './Toggle';
import { resolveAccessibleName } from './accessibleName';
import type { ToggleSchema } from '@/types/controls';

const schema: ToggleSchema = { id: 'layerActive', type: 'toggle', loreLabel: 'LAYER ACTIVE', humanLabel: 'Layer Active' };

describe('Toggle', () => {
  it('renders role="switch" reflecting a false controlled value', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    const el = screen.getByRole('switch');
    expect(el.getAttribute('aria-checked')).toBe('false');
  });

  it('renders role="switch" reflecting a true controlled value', () => {
    render(<Toggle schema={schema} value={true} onChange={() => {}} />);
    const el = screen.getByRole('switch');
    expect(el.getAttribute('aria-checked')).toBe('true');
  });

  it('does not flip its own visual state when clicked without a value prop update (controlled, no internal state)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Toggle schema={schema} value={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    // Still reflects the prop, not an internally-flipped state, until the parent re-renders with a new value.
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    rerender(<Toggle schema={schema} value={true} onChange={onChange} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('calls onChange(!value) on click', () => {
    const onChange = vi.fn();
    render(<Toggle schema={schema} value={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders its own schema labels via an internally-composed DualLabel', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    expect(screen.getByText('LAYER ACTIVE')).toBeTruthy();
    expect(screen.getByText('Layer Active')).toBeTruthy();
  });

  it('adds an isActive class to the component root when value is true, for a plain CSS hook (e.g. .sc-toggle.isActive)', () => {
    const { container } = render(<Toggle schema={schema} value={true} onChange={() => {}} />);
    expect(container.querySelector('.sc-toggle.isActive')).toBeTruthy();
  });

  it('omits the isActive class from the component root when value is false', () => {
    const { container } = render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    expect(container.querySelector('.sc-toggle.isActive')).toBeNull();
    expect(container.querySelector('.sc-toggle')).toBeTruthy();
  });

  it('falls back to schema.id for the accessible name when neither label is present, never leaving it unlabeled', () => {
    const bareSchema: ToggleSchema = { id: 'layerActive', type: 'toggle' };
    render(<Toggle schema={bareSchema} value={false} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'layerActive' })).toBeTruthy();
  });

  it('is not disabled by default — no existing behavior changes', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the underlying switch when disabled is true', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} disabled />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not call onChange when clicked while disabled', () => {
    const onChange = vi.fn();
    render(<Toggle schema={schema} value={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders through CabinetBox with popped="true" when value is true (Oblique Cabinetry, roadmap 11.1.2)', () => {
    render(<Toggle schema={schema} value={true} onChange={() => {}} />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
  });

  it('renders through CabinetBox at CABINET_REST_POP\'s shallow protrusion (not fully flat) when value is false', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');
  });

  it('passes a fixed 44px boxHeight to CabinetBox, regardless of viewport', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-box-height')).toBe('44');
  });

  it('passes a schema-scoped timelineKey distinct from Button\'s own cabinet-button- prefix, plus a per-instance useId() segment', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-timeline-key')).toMatch(/^cabinet-toggle-layerActive-.+$/);
  });

  it('bugfix: two simultaneously-mounted Toggles rendering the same schema get non-colliding timelineKeys', () => {
    const { container } = render(
      <>
        <Toggle schema={schema} value={false} onChange={() => {}} />
        <Toggle schema={schema} value={false} onChange={() => {}} />
      </>,
    );
    const [firstKey, secondKey] = Array.from(container.querySelectorAll('[data-testid="cabinet-box"]')).map(
      (el) => el.getAttribute('data-timeline-key'),
    );
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(firstKey).not.toBe(secondKey);
  });

  it('keeps CabinetBox popped="true" reflecting a checked value even when disabled', () => {
    render(<Toggle schema={schema} value={true} onChange={() => {}} disabled />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
  });

  it('renders no separate thumb element — CabinetBox is the switch\'s only visual child', () => {
    const { container } = render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    expect(container.querySelector('.sc-toggle__thumb')).toBeNull();
  });

  it('passes an explicit boxSize straight through as CabinetBox\'s boxHeight, overriding the fixed 44px default (docs/specs/archive/HEADER_HUB_CONSOLIDATION.md §1.4)', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} boxSize={56} />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-box-height')).toBe('56');
  });

  it('omitting boxSize still passes the fixed 44px default — every existing consumer is unaffected (regression guard)', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-box-height')).toBe('44');
  });

  it('also updates the --cabinet-toggle-box-size custom property (Toggle.css\'s own front-face size override) to match boxSize, not just CabinetBox\'s boxHeight prop', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} boxSize={56} />);
    const switchRoot = screen.getByRole('switch');
    expect(switchRoot.style.getPropertyValue('--cabinet-toggle-box-size')).toBe('56px');
  });

  it('--cabinet-toggle-box-size still defaults to 44px when boxSize is omitted', () => {
    render(<Toggle schema={schema} value={false} onChange={() => {}} />);
    const switchRoot = screen.getByRole('switch');
    expect(switchRoot.style.getPropertyValue('--cabinet-toggle-box-size')).toBe('44px');
  });

  // Facade content — an icon or short text rendered on CabinetBox's own front face, replacing
  // the bare/textless box every other consumer still gets. docs: Toggle facade-content addition.
  describe('facade content (children)', () => {
    it('renders children as CabinetBox\'s own facade content', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}}>🔊</Toggle>);
      expect(screen.getByTestId('cabinet-box').textContent).toBe('🔊');
    });

    it('renders no facade content when children is omitted (regression guard)', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}} />);
      expect(screen.getByTestId('cabinet-box').textContent).toBe('');
    });

    it('suppresses the external DualLabel when children is provided, even though the schema carries lore/human labels', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}}>🔊</Toggle>);
      expect(screen.queryByText('LAYER ACTIVE')).toBeNull();
      expect(screen.queryByText('Layer Active')).toBeNull();
    });

    it('still renders the external DualLabel when children is omitted (unchanged default behavior)', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}} />);
      expect(screen.getByText('LAYER ACTIVE')).toBeTruthy();
      expect(screen.getByText('Layer Active')).toBeTruthy();
    });

    it('the accessible name still resolves from schema.humanLabel even though DualLabel is visually suppressed', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}}>🔊</Toggle>);
      expect(screen.getByRole('switch', { name: 'Layer Active' })).toBeTruthy();
    });

    it('content-sizes the box (no boxHeight passed to CabinetBox) when children is provided without an explicit boxSize', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}}>🔊</Toggle>);
      expect(screen.getByTestId('cabinet-box').getAttribute('data-box-height')).toBeNull();
    });

    it('an explicit boxSize still forces a fixed square even when children is provided (Header\'s Mute needs an exact 44px for its row-fit math)', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}} boxSize={44}>🔊</Toggle>);
      expect(screen.getByTestId('cabinet-box').getAttribute('data-box-height')).toBe('44');
    });

    it('omits the sc-toggle__root--bare modifier class when children is provided — lets CabinetBox.css\'s own natural content-sized front face apply, same as Button\'s box', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}}>🔊</Toggle>);
      expect(screen.getByRole('switch').classList.contains('sc-toggle__root--bare')).toBe(false);
    });

    it('keeps the sc-toggle__root--bare modifier class when children is omitted (regression guard — every existing consumer keeps its fixed-square sizing)', () => {
      render(<Toggle schema={schema} value={false} onChange={() => {}} />);
      expect(screen.getByRole('switch').classList.contains('sc-toggle__root--bare')).toBe(true);
    });
  });

  describe('React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 7)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((Toggle as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('the bare (no-children) call shape does not re-execute its render body on a re-render with identical props — the guaranteed bail-out case, since no caller-supplied children exists to defeat it', () => {
      const onChange = () => {};
      const { rerender } = render(<Toggle schema={schema} value={false} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Toggle schema={schema} value={false} onChange={onChange} />);
      rerender(<Toggle schema={schema} value={false} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<Toggle schema={schema} value={false} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Toggle schema={schema} value={true} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('the children-bearing call shape still re-executes on a re-render even with every other prop unchanged, when the caller constructs an element (not a bare string) inline (the conditional-benefit case spec §1.3 describes — a fresh element reference every render defeats the shallow-compare bail-out regardless of memoization here; a bare string child, by contrast, is already Object.is-stable across renders of the same literal, so it alone would not demonstrate this)', () => {
      const onChange = () => {};
      const { rerender } = render(<Toggle schema={schema} value={false} onChange={onChange}><span>🔊</span></Toggle>);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Toggle schema={schema} value={false} onChange={onChange}><span>🔊</span></Toggle>);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
