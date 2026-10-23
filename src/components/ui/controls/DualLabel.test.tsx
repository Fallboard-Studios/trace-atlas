import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DualLabel } from './DualLabel';
import { fill } from '@/content';

// docs/tasks/LAYOUT_REWORK.md Task 12 — the help "?" sits on the label, beside the human name.
describe('DualLabel help', () => {
  const HELP = { human: 'Sets the pitch the melody starts from.' };

  it('renders a "?" named for the control when it has help, and none when it has not', () => {
    const { rerender } = render(<DualLabel loreLabel="CALIBRATE PING" humanLabel="Reset Melody" help={HELP} />);
    expect(screen.getByRole('button', { name: fill('ui.help', { name: 'Reset Melody' }) })).toBeTruthy();

    rerender(<DualLabel loreLabel="CALIBRATE PING" humanLabel="Reset Melody" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the human name its own element, so the label still reads exactly its name', () => {
    render(<DualLabel loreLabel="CALIBRATE PING" humanLabel="Reset Melody" help={HELP} />);
    expect(screen.getByText('Reset Melody').textContent).toBe('Reset Melody');
    expect(screen.getByText('Reset Melody').className).toBe('sc-dual-label__human');
  });

  it('the "?" opens that help', () => {
    render(<DualLabel loreLabel="CALIBRATE PING" humanLabel="Reset Melody" help={HELP} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog').textContent).toContain(HELP.human);
    expect(screen.getByRole('dialog').textContent).toContain('CALIBRATE PING');
  });

  it('a lore-only label still carries its "?"', () => {
    render(<DualLabel loreLabel="CALIBRATE PING" help={HELP} />);
    expect(screen.getByRole('button', { name: fill('ui.help', { name: 'CALIBRATE PING' }) })).toBeTruthy();
  });

  it('help with no label at all renders nothing — a "?" needs a label to stand on', () => {
    const { container } = render(<DualLabel help={HELP} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DualLabel', () => {
  it('renders nothing when neither loreLabel nor humanLabel is present', () => {
    const { container } = render(<DualLabel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders only the lore label when only loreLabel is present', () => {
    render(<DualLabel loreLabel="CALIBRATE PING" />);
    expect(screen.getByText('CALIBRATE PING')).toBeTruthy();
    expect(screen.queryByText('Reset Melody')).toBeNull();
  });

  it('renders only the human label when only humanLabel is present', () => {
    render(<DualLabel humanLabel="Reset Melody" />);
    expect(screen.getByText('Reset Melody')).toBeTruthy();
    expect(screen.queryByText('CALIBRATE PING')).toBeNull();
  });

  it('renders both labels when both are present', () => {
    render(<DualLabel loreLabel="CALIBRATE PING" humanLabel="Reset Melody" />);
    expect(screen.getByText('CALIBRATE PING')).toBeTruthy();
    expect(screen.getByText('Reset Melody')).toBeTruthy();
  });

  // docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 6 — structural check only, matching
  // BubbleStream.test.tsx's own precedent (docs/specs/archive/OBLIQUE_CABINETRY_MEMOIZATION.md §5): this
  // component has no hook or cross-module utility call in its render body to spy on as a
  // render-count marker (it's genuinely pure JSX composed from its own props), so a real
  // render-based re-render-count test isn't practical here.
  it('is a React.memo-wrapped component', () => {
    expect((DualLabel as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
