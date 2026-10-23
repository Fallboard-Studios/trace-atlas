import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 8) can tell whether Stepper's render body actually re-executed —
// resolveAccessibleName(schema) is called unconditionally in the render body.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { Stepper } from './Stepper';
import { resolveAccessibleName } from './accessibleName';
import type { StepperSchema } from '@/types/controls';

const densitySchema: StepperSchema = { id: 'density', type: 'stepper', min: 1, max: 16, loreLabel: 'DENSITY', humanLabel: 'Rhythmic Density' };
const motifSchema: StepperSchema = { id: 'motifLength', type: 'stepper', min: 1, max: 8 };

describe('Stepper', () => {
  it('increments by step (default 1) on the increment control', () => {
    const onChange = vi.fn();
    render(<Stepper schema={densitySchema} value={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /increment/i }));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('decrements by step (default 1) on the decrement control', () => {
    const onChange = vi.fn();
    render(<Stepper schema={densitySchema} value={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('clamps at max and never calls onChange with an out-of-bounds value (Density 1-16)', () => {
    const onChange = vi.fn();
    render(<Stepper schema={densitySchema} value={16} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /increment/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps at min and never calls onChange with an out-of-bounds value (Motif Length 1-8)', () => {
    const onChange = vi.fn();
    render(<Stepper schema={motifSchema} value={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps by schema.step when provided', () => {
    const schema: StepperSchema = { id: 'x', type: 'stepper', min: 0, max: 100, step: 5 };
    const onChange = vi.fn();
    render(<Stepper schema={schema} value={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /increment/i }));
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('renders its own schema labels via an internally-composed DualLabel', () => {
    render(<Stepper schema={densitySchema} value={5} onChange={() => {}} />);
    expect(screen.getByText('DENSITY')).toBeTruthy();
    expect(screen.getByText('Rhythmic Density')).toBeTruthy();
  });

  it('renders the current value between the two buttons', () => {
    render(<Stepper schema={densitySchema} value={5} onChange={() => {}} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('caps the displayed value at 3 decimal places, hiding floating-point noise', () => {
    const schema: StepperSchema = { id: 'x', type: 'stepper', min: 0, max: 20 };
    render(<Stepper schema={schema} value={4.999999999999999} onChange={() => {}} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 8)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((Stepper as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with identical props', () => {
      const onChange = () => {};
      const { rerender } = render(<Stepper schema={densitySchema} value={5} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Stepper schema={densitySchema} value={5} onChange={onChange} />);
      rerender(<Stepper schema={densitySchema} value={5} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<Stepper schema={densitySchema} value={5} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Stepper schema={densitySchema} value={6} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
