import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 9) can tell whether CoordsInput's render body actually re-executed.
// CoordsInput has no hook/utility call of its own, but it unconditionally
// composes two TextInputs (each calling resolveAccessibleName internally) —
// if CoordsInput bails via memo, its body never constructs either child
// element, so neither of their own calls fire either — same "bailed subtree
// root stops everything beneath it" reasoning as StepperWithToggle.test.tsx's
// own Task 8 test.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { CoordsInput } from './CoordsInput';
import { resolveAccessibleName } from './accessibleName';
import type { CoordsInputSchema } from '@/types/controls';

const schema: CoordsInputSchema = { id: 'sectorCoords', type: 'coordsInput', humanLabel: 'Sector Coordinates' };

describe('CoordsInput', () => {
  it('renders two actual TextInput instances', () => {
    render(<CoordsInput schema={schema} value={{ x: 0, y: 0 }} onChange={() => {}} />);
    const textboxes = screen.getAllByRole('spinbutton');
    expect(textboxes).toHaveLength(2);
  });

  it('renders the controlled x/y values as strings in each field', () => {
    render(<CoordsInput schema={schema} value={{ x: 12, y: -7 }} onChange={() => {}} />);
    const [xInput, yInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(xInput.value).toBe('12');
    expect(yInput.value).toBe('-7');
  });

  it('calls onChange({ x, y }) with parsed numbers when the X field changes', () => {
    const onChange = vi.fn();
    render(<CoordsInput schema={schema} value={{ x: 0, y: 5 }} onChange={onChange} />);
    const [xInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(xInput, { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith({ x: 42, y: 5 });
  });

  it('calls onChange({ x, y }) with parsed numbers when the Y field changes', () => {
    const onChange = vi.fn();
    render(<CoordsInput schema={schema} value={{ x: 3, y: 0 }} onChange={onChange} />);
    const [, yInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(yInput, { target: { value: '-9' } });
    expect(onChange).toHaveBeenCalledWith({ x: 3, y: -9 });
  });

  it('renders its own schema label via an internally-composed DualLabel', () => {
    render(<CoordsInput schema={schema} value={{ x: 0, y: 0 }} onChange={() => {}} />);
    expect(screen.getByText('Sector Coordinates')).toBeTruthy();
  });

  it('does not throw and does not call onChange with NaN on a non-numeric entry', () => {
    const onChange = vi.fn();
    render(<CoordsInput schema={schema} value={{ x: 0, y: 0 }} onChange={onChange} />);
    const [xInput] = screen.getAllByRole('spinbutton');
    expect(() => fireEvent.change(xInput, { target: { value: 'abc' } })).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when a field is cleared to empty', () => {
    const onChange = vi.fn();
    render(<CoordsInput schema={schema} value={{ x: 5, y: 5 }} onChange={onChange} />);
    const [xInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(xInput, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders its X/Y fields as native numeric inputs', () => {
    render(<CoordsInput schema={schema} value={{ x: 0, y: 0 }} onChange={() => {}} />);
    const [xInput, yInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(xInput.type).toBe('number');
    expect(yInput.type).toBe('number');
  });

  it('rounds a decimal X entry to the nearest integer before calling onChange', () => {
    const onChange = vi.fn();
    render(<CoordsInput schema={schema} value={{ x: 0, y: 5 }} onChange={onChange} />);
    const [xInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(xInput, { target: { value: '12.7' } });
    expect(onChange).toHaveBeenCalledWith({ x: 13, y: 5 });
  });

  it('rounds a decimal Y entry to the nearest integer before calling onChange', () => {
    const onChange = vi.fn();
    render(<CoordsInput schema={schema} value={{ x: 3, y: 0 }} onChange={onChange} />);
    const [, yInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(yInput, { target: { value: '-9.4' } });
    expect(onChange).toHaveBeenCalledWith({ x: 3, y: -9 });
  });

  it('passes an already-integer value through unchanged', () => {
    const onChange = vi.fn();
    render(<CoordsInput schema={schema} value={{ x: 0, y: 5 }} onChange={onChange} />);
    const [xInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(xInput, { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith({ x: 42, y: 5 });
  });

  // Roadmap 11.1.9 — the regression guard for this item's own central design decision: each
  // TextInput renders its own facade independently, so CoordsInput naturally ends up with two,
  // not one shared facade around the whole X/Y row. See
  // docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.1/§1.6.
  it('renders two independent CabinetBox facades, one per field — not one shared facade', () => {
    const { container } = render(<CoordsInput schema={schema} value={{ x: 0, y: 0 }} onChange={() => {}} />);
    expect(container.querySelectorAll('.sc-text-input-facade')).toHaveLength(2);
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 9)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((CoordsInput as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body (or its composed TextInputs) on a re-render with identical props', () => {
      const onChange = () => {};
      const value = { x: 0, y: 0 };
      const { rerender } = render(<CoordsInput schema={schema} value={value} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<CoordsInput schema={schema} value={value} onChange={onChange} />);
      rerender(<CoordsInput schema={schema} value={value} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<CoordsInput schema={schema} value={{ x: 0, y: 0 }} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<CoordsInput schema={schema} value={{ x: 5, y: 0 }} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
