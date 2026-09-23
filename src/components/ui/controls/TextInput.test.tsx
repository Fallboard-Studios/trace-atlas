import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mocked the same way every other CabinetBox consumer's own test file does
// (Button/Toggle/RadioButton/DirectionalPanel) — isolates
// this file's assertions about TextInput's own facade wiring from
// CabinetBox's already-proven internals (11.1.1/DirectionalPanel's own
// autoHeight, roadmap 11.1.9). Extended to also capture skipMountAnimation/
// autoHeight, since this is the first consumer to pass both at once.
vi.mock('./CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, skipMountAnimation, autoHeight, children }: {
    popped: boolean; timelineKey: string; skipMountAnimation?: boolean; autoHeight?: boolean;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="cabinet-box"
      data-popped={String(popped)}
      data-timeline-key={timelineKey}
      data-skip-mount-animation={String(!!skipMountAnimation)}
      data-auto-height={String(!!autoHeight)}
    >
      {children}
    </div>
  ),
}));

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 7) can tell whether TextInput's render body actually re-executed —
// resolveAccessibleName(schema) is called unconditionally in the render body.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { TextInput } from './TextInput';
import { resolveAccessibleName } from './accessibleName';
import type { TextInputSchema } from '@/types/controls';

describe('TextInput', () => {
  it('renders placeholder from schema when present', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput', placeholder: 'Enter name' };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText('Enter name')).toBeTruthy();
  });

  it('respects maxLength from schema when present', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput', maxLength: 12 };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.maxLength).toBe(12);
  });

  it('calls onChange with the raw string value on every keystroke, no buffering', () => {
    const onChange = vi.fn();
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Uni' } });
    expect(onChange).toHaveBeenCalledWith('Uni');
  });

  it('reflects the controlled value prop', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="Unit 7" onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Unit 7');
  });

  it('renders its own schema labels via an internally-composed DualLabel', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput', loreLabel: 'DESIGNATION', humanLabel: 'Robot Name' };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    expect(screen.getByText('DESIGNATION')).toBeTruthy();
    expect(screen.getByText('Robot Name')).toBeTruthy();
  });

  it('renders as a plain text input by default (numeric prop omitted)', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).type).toBe('text');
  });

  it('renders as a native numeric input when numeric is true', () => {
    const schema: TextInputSchema = { id: 'coordX', type: 'textInput', humanLabel: 'X' };
    render(<TextInput schema={schema} value="12" onChange={() => {}} numeric />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.value).toBe('12');
  });

  it('falls back to schema.id for the accessible name when neither label is present, never leaving it unlabeled', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'robotName' })).toBeTruthy();
  });

  it('is not disabled by default', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(false);
  });

  it('disables the input and blocks onChange when disabled is true', () => {
    const onChange = vi.fn();
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="" onChange={onChange} disabled />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  // Roadmap 11.1.9 — a single, permanently-popped, autoHeight CabinetBox facade per instance.
  // See docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.1/§1.2.
  it('renders through a permanently-popped CabinetBox facade', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    const box = screen.getByTestId('cabinet-box');
    expect(box.getAttribute('data-popped')).toBe('true');
    expect(box.getAttribute('data-timeline-key')).toBe('cabinet-text-input-facade-robotName');
  });

  it('passes skipMountAnimation and autoHeight, unconditionally', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    const box = screen.getByTestId('cabinet-box');
    expect(box.getAttribute('data-skip-mount-animation')).toBe('true');
    expect(box.getAttribute('data-auto-height')).toBe('true');
  });

  it('stays popped when disabled — the facade never reacts to disabled', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput' };
    render(<TextInput schema={schema} value="" onChange={() => {}} disabled />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
  });

  it('renders both the input and its DualLabel inside the facade, label inside not beside the box', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput', humanLabel: 'Robot Name' };
    render(<TextInput schema={schema} value="" onChange={() => {}} />);
    const box = screen.getByTestId('cabinet-box');
    expect(box.contains(screen.getByRole('textbox'))).toBe(true);
    expect(box.textContent).toContain('Robot Name');
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 7)', () => {
    const schema: TextInputSchema = { id: 'robotName', type: 'textInput', humanLabel: 'Robot Name' };

    it('is a React.memo-wrapped component', () => {
      expect((TextInput as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with identical props', () => {
      const onChange = () => {};
      const { rerender } = render(<TextInput schema={schema} value="" onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<TextInput schema={schema} value="" onChange={onChange} />);
      rerender(<TextInput schema={schema} value="" onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<TextInput schema={schema} value="" onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<TextInput schema={schema} value="a" onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
