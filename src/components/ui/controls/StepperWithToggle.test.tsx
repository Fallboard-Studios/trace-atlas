import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 8) can tell whether StepperWithToggle's render body actually
// re-executed. StepperWithToggle itself has no hook/utility call of its own,
// but it unconditionally composes both Toggle and Stepper (each of which
// calls resolveAccessibleName in ITS OWN render body) — if StepperWithToggle
// bails via memo, its body never runs, so it never even constructs the
// <Toggle>/<Stepper> elements, and neither of their own calls fire either.
// The total call count is therefore a valid "did this subtree's root bail"
// signal, same reasoning as the CabinetryCascade.test.tsx end-to-end test
// (Task 5) — a bailed memo boundary stops everything beneath it, not just
// its own direct render body.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { StepperWithToggle } from './StepperWithToggle';
import { resolveAccessibleName } from './accessibleName';
import type { StepperWithToggleSchema } from '@/types/controls';

const schema: StepperWithToggleSchema = { id: 'noteVariance', type: 'stepperToggle', min: 1, max: 8, humanLabel: 'Note Variance' };

describe('StepperWithToggle', () => {
  it('renders an actual Toggle (role="switch") and Stepper (increment/decrement buttons)', () => {
    render(<StepperWithToggle schema={schema} value={{ active: true, value: 3 }} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.getByRole('button', { name: /increment/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /decrement/i })).toBeTruthy();
  });

  it('disables the Stepper controls when value.active is false', () => {
    render(<StepperWithToggle schema={schema} value={{ active: false, value: 3 }} onChange={() => {}} />);
    expect((screen.getByRole('button', { name: /increment/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the Stepper controls when value.active is true', () => {
    render(<StepperWithToggle schema={schema} value={{ active: true, value: 3 }} onChange={() => {}} />);
    expect((screen.getByRole('button', { name: /increment/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onChange with the full {active, value} shape when the toggle changes', () => {
    const onChange = vi.fn();
    render(<StepperWithToggle schema={schema} value={{ active: false, value: 3 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith({ active: true, value: 3 });
  });

  it('calls onChange with the full {active, value} shape when the stepper changes', () => {
    const onChange = vi.fn();
    render(<StepperWithToggle schema={schema} value={{ active: true, value: 3 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /increment/i }));
    expect(onChange).toHaveBeenCalledWith({ active: true, value: 4 });
  });

  it('adds an isActive class to the component root when value.active is true', () => {
    const { container } = render(<StepperWithToggle schema={schema} value={{ active: true, value: 3 }} onChange={() => {}} />);
    expect(container.querySelector('.sc-stepper-toggle.isActive')).toBeTruthy();
  });

  it('omits the isActive class from the component root when value.active is false', () => {
    const { container } = render(<StepperWithToggle schema={schema} value={{ active: false, value: 3 }} onChange={() => {}} />);
    expect(container.querySelector('.sc-stepper-toggle.isActive')).toBeNull();
    expect(container.querySelector('.sc-stepper-toggle')).toBeTruthy();
  });

  it('is not disabled by default', () => {
    render(<StepperWithToggle schema={schema} value={{ active: true, value: 3 }} onChange={() => {}} />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables both the Toggle and the Stepper when disabled is true, even if value.active is true', () => {
    render(<StepperWithToggle schema={schema} value={{ active: true, value: 3 }} onChange={() => {}} disabled />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /increment/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  describe('React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 8)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((StepperWithToggle as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body (or its composed Toggle/Stepper) on a re-render with identical props', () => {
      const onChange = () => {};
      const value = { active: true, value: 3 };
      const { rerender } = render(<StepperWithToggle schema={schema} value={value} onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<StepperWithToggle schema={schema} value={value} onChange={onChange} />);
      rerender(<StepperWithToggle schema={schema} value={value} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(
        <StepperWithToggle schema={schema} value={{ active: true, value: 3 }} onChange={onChange} />,
      );
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<StepperWithToggle schema={schema} value={{ active: true, value: 4 }} onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
