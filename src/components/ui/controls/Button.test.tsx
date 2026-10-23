import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, children }: { popped: boolean; timelineKey: string; children: React.ReactNode }) => (
    <div data-testid="cabinet-box" data-popped={popped} data-timeline-key={timelineKey}>{children}</div>
  ),
}));
// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 6) can tell whether Button's render body actually re-executed —
// resolveAccessibleName(schema) is called unconditionally in the render body.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { Button } from './Button';
import { resolveAccessibleName } from './accessibleName';
import type { ButtonSchema } from '@/types/controls';

describe('Button', () => {
  it('renders its own schema labels via an internally-composed DualLabel', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', loreLabel: 'CALIBRATE PING', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} />);
    expect(screen.getByText('CALIBRATE PING')).toBeTruthy();
    expect(screen.getByText('Reset Melody')).toBeTruthy();
  });

  it('calls onClick exactly once per click', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    const onClick = vi.fn();
    render(<Button schema={schema} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('resolves its accessible name from humanLabel', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', loreLabel: 'CALIBRATE PING', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reset Melody' })).toBeTruthy();
  });

  it('falls back to loreLabel for the accessible name when humanLabel is absent', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', loreLabel: 'CALIBRATE PING' };
    render(<Button schema={schema} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'CALIBRATE PING' })).toBeTruthy();
  });

  it('bugfix: two simultaneously-mounted Buttons rendering the same schema get non-colliding timelineKeys (same class of bug fixed in RadioButton/Toggle)', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    const { container } = render(
      <>
        <Button schema={schema} onClick={() => {}} />
        <Button schema={schema} onClick={() => {}} />
      </>,
    );
    const [firstKey, secondKey] = Array.from(container.querySelectorAll('[data-testid="cabinet-box"]')).map(
      (el) => el.getAttribute('data-timeline-key'),
    );
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(firstKey).not.toBe(secondKey);
  });

  it('falls back to schema.id for the accessible name when neither label is present, never leaving it unlabeled', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button' };
    render(<Button schema={schema} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'resetMelody' })).toBeTruthy();
  });

  it('is not disabled by default', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the button and blocks onClick when disabled is true', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    const onClick = vi.fn();
    render(<Button schema={schema} onClick={onClick} disabled />);
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders through CabinetBox at CABINET_REST_POP\'s shallow protrusion (not fully flat) at rest', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');
  });

  it('pops fully on mouseEnter and rests again at CABINET_REST_POP on mouseLeave', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} />);
    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
    fireEvent.mouseLeave(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');
  });

  it('pops fully on focus and rests again at CABINET_REST_POP on blur, independently of hover', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} />);
    const button = screen.getByRole('button');
    fireEvent.focus(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
    fireEvent.blur(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');
  });

  it('pops fully on pointerDown and rests again at CABINET_REST_POP on pointerUp, independently of hover/focus', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} />);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
    fireEvent.pointerUp(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');
  });

  it('rests again at CABINET_REST_POP on pointerCancel and pointerLeave the same way pointerUp does', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} />);
    const button = screen.getByRole('button');

    fireEvent.pointerDown(button);
    fireEvent.pointerCancel(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');

    fireEvent.pointerDown(button);
    fireEvent.pointerLeave(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');
  });

  it('never pops beyond CABINET_REST_POP while disabled, regardless of hover, focus, or pointer events', () => {
    const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
    render(<Button schema={schema} onClick={() => {}} disabled />);
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');

    fireEvent.focus(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');

    fireEvent.pointerDown(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('0.5');
  });

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 6)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((Button as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with identical props', () => {
      const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
      const onClick = () => {};
      const { rerender } = render(<Button schema={schema} onClick={onClick} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Button schema={schema} onClick={onClick} />);
      rerender(<Button schema={schema} onClick={onClick} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (disabled)', () => {
      const schema: ButtonSchema = { id: 'resetMelody', type: 'button', humanLabel: 'Reset Melody' };
      const onClick = () => {};
      const { rerender } = render(<Button schema={schema} onClick={onClick} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<Button schema={schema} onClick={onClick} disabled />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 17 follow-up (Crawford, 2026-10-10: "Save & Share only"): an opt-in
// single-line face, the sketch's compact button, with the lore left to the control's label row as
// RadioButton's options do (Task 13); and an accessible name apart from the face, so a list row's
// button can read "Load" while it is named "Load Dusk Run".
describe('Button — the single-line face and the accessible-name override', () => {
  const schema: ButtonSchema = { id: 'session.load', type: 'button', loreLabel: 'RESTORE STATE', humanLabel: 'Load' };

  it('face="single" draws the human label alone, on one line, with no DualLabel and no lore', () => {
    const { container } = render(<Button schema={schema} face="single" onClick={() => {}} />);
    const label = container.querySelector('.sc-button__label');
    expect(label?.textContent).toBe('Load');
    expect(container.querySelector('.sc-dual-label')).toBeNull();
    expect(screen.queryByText('RESTORE STATE')).toBeNull();
  });

  it('the default face is still the DualLabel, lore over human', () => {
    const { container } = render(<Button schema={schema} onClick={() => {}} />);
    expect(container.querySelector('.sc-dual-label')).not.toBeNull();
    expect(container.querySelector('.sc-button__label')).toBeNull();
    expect(screen.getByText('RESTORE STATE')).toBeTruthy();
  });

  it('accessibleName names the button without changing its face', () => {
    render(<Button schema={schema} face="single" accessibleName="Load Dusk Run" onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Load Dusk Run' });
    expect(button.textContent).toBe('Load');
  });

  it('accessibleName works with the dual face too', () => {
    render(<Button schema={schema} accessibleName="Load Dusk Run" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Load Dusk Run' }).textContent).toContain('Load');
  });

  it('a single face with no humanLabel falls back to the lore, as the accessible name does', () => {
    const { container } = render(<Button schema={{ id: 'x', type: 'button', loreLabel: 'PURGE' }} face="single" onClick={() => {}} />);
    expect(container.querySelector('.sc-button__label')?.textContent).toBe('PURGE');
  });

  it('a single-face button still clicks, disables and pops as every Button does', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button schema={schema} face="single" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
    rerender(<Button schema={schema} face="single" onClick={onClick} disabled />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

// Crawford, 2026-10-10: the intro expander (IntroPanel's "More") is a Button that discloses a region,
// so Button can carry the disclosure state.
describe('Button — as a disclosure (expanded / controls)', () => {
  const schema: ButtonSchema = { id: 'intro.toggle', type: 'button', humanLabel: 'More' };

  it('carries aria-expanded and aria-controls when given them', () => {
    const { rerender } = render(<Button schema={schema} onClick={() => {}} expanded={false} controls="intro-body" />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button').getAttribute('aria-controls')).toBe('intro-body');
    rerender(<Button schema={schema} onClick={() => {}} expanded controls="intro-body" />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });

  it('an ordinary button carries neither', () => {
    render(<Button schema={schema} onClick={() => {}} />);
    expect(screen.getByRole('button').hasAttribute('aria-expanded')).toBe(false);
    expect(screen.getByRole('button').hasAttribute('aria-controls')).toBe(false);
  });
});
