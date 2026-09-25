import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/controls/UnderlineLink', () => ({
  UnderlineLink: ({ popped, timelineKey, color }: { popped: boolean; timelineKey: string; color: string }) => (
    <div data-testid="underline-link" data-popped={popped} data-timeline-key={timelineKey} data-color={color} />
  ),
}));

import { UnderlineLinkNavRow } from './UnderlineLinkNavRow';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';

function makeNode(overrides: Partial<NavTreeNodeSchema> = {}): NavTreeNodeSchema {
  return { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo', ...overrides };
}

describe('UnderlineLinkNavRow', () => {
  it('renders the node\'s humanLabel via DualLabel', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    expect(screen.getByText('Tempo')).toBeTruthy();
  });

  it('renders UnderlineLink, passing the color prop straight through', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    expect(screen.getByTestId('underline-link').getAttribute('data-color')).toBe('#123456');
  });

  it('calls onClick exactly once per click', () => {
    const onClick = vi.fn();
    render(<UnderlineLinkNavRow node={makeNode()} onClick={onClick} color="#123456" />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('resolves its accessible name from the node\'s humanLabel', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    expect(screen.getByRole('button', { name: 'Tempo' })).toBeTruthy();
  });

  it('renders no CabinetBox/Button — a plain transparent click target only', () => {
    const { container } = render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    expect(container.querySelector('.sc-cabinet-box')).toBeNull();
  });

  it('starts un-popped (not hovered/focused/pressed)', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('false');
  });

  it('fireEvent.mouseEnter/mouseLeave toggles the popped state', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('true');

    fireEvent.mouseLeave(button);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('false');
  });

  it('fireEvent.focus/blur toggles the popped state independently of hover', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.focus(button);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('true');

    fireEvent.blur(button);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('false');
  });

  it('fireEvent.pointerDown/pointerUp toggles the popped state independently of hover/focus', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.pointerDown(button);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('true');

    fireEvent.pointerUp(button);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('false');
  });

  it('pointerCancel/pointerLeave also un-pops a pressed row', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.pointerDown(button);
    fireEvent.pointerCancel(button);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('false');

    fireEvent.pointerDown(button);
    fireEvent.pointerLeave(button);
    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('false');
  });

  it('stays popped while any one of hover/focus/press is still active — releasing one alone does not un-pop', () => {
    render(<UnderlineLinkNavRow node={makeNode()} onClick={() => {}} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);
    fireEvent.mouseLeave(button);

    expect(screen.getByTestId('underline-link').getAttribute('data-popped')).toBe('true');
  });

  it('passes a unique timelineKey derived from the node id', () => {
    render(<UnderlineLinkNavRow node={makeNode({ id: 'settings.quality.robotLoad' })} onClick={() => {}} color="#123456" />);
    expect(screen.getByTestId('underline-link').getAttribute('data-timeline-key')).toContain('settings.quality.robotLoad');
  });
});
