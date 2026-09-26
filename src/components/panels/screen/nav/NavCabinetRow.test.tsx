import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/components/ui/controls/CabinetBox', () => ({
  CabinetBox: ({
    popped,
    timelineKey,
    color,
    boxHeight,
    popDistance,
    enforceMinTouchHeight,
    children,
  }: {
    popped: boolean;
    timelineKey: string;
    color?: string;
    boxHeight?: number;
    popDistance?: number;
    enforceMinTouchHeight?: boolean;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="cabinet-box"
      data-popped={popped}
      data-timeline-key={timelineKey}
      data-color={color}
      data-box-height={boxHeight}
      data-pop-distance={popDistance}
      data-enforce-min-touch-height={enforceMinTouchHeight}
    >
      {children}
    </div>
  ),
}));

import { NavCabinetRow } from './NavCabinetRow';
import { registerAccordion, unregisterAccordion, updateAccordionOpen } from '@/utils/accordionSync';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';

function makeNode(overrides: Partial<NavTreeNodeSchema> = {}): NavTreeNodeSchema {
  return { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo', ...overrides };
}

describe('NavCabinetRow', () => {
  it("renders the node's humanLabel via DualLabel", () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    expect(screen.getByText('Tempo')).toBeTruthy();
  });

  it('renders CabinetBox, passing the color prop straight through', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-color')).toBe('#123456');
  });

  it('renders CabinetBox with a 4px boxHeight and 2px popDistance', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    const box = screen.getByTestId('cabinet-box');
    expect(box.getAttribute('data-box-height')).toBe('4');
    expect(box.getAttribute('data-pop-distance')).toBe('2');
  });

  it('renders CabinetBox with enforceMinTouchHeight={false} — this box is not itself the touch target', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-enforce-min-touch-height')).toBe('false');
  });

  it('renders CabinetBox with no children', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    expect(screen.getByTestId('cabinet-box').textContent).toBe('');
  });

  it('calls onClick exactly once per click', () => {
    const onClick = vi.fn();
    render(<NavCabinetRow node={makeNode()} onClick={onClick} color="#123456" />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("resolves its accessible name from the node's humanLabel", () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    expect(screen.getByRole('button', { name: 'Tempo' })).toBeTruthy();
  });

  it('renders no Button/UnderlineLink — a plain transparent click target wrapping one CabinetBox only', () => {
    const { container } = render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    expect(container.querySelector('.sc-button')).toBeNull();
    expect(container.querySelectorAll('[data-testid="cabinet-box"]').length).toBe(1);
  });

  it('starts un-popped (not hovered/focused/pressed)', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');
  });

  it('fireEvent.mouseEnter/mouseLeave toggles the popped state', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');

    fireEvent.mouseLeave(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');
  });

  it('fireEvent.focus/blur toggles the popped state independently of hover', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.focus(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');

    fireEvent.blur(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');
  });

  it('fireEvent.pointerDown/pointerUp toggles the popped state independently of hover/focus', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.pointerDown(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');

    fireEvent.pointerUp(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');
  });

  it('pointerCancel/pointerLeave also un-pops a pressed row', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.pointerDown(button);
    fireEvent.pointerCancel(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');

    fireEvent.pointerDown(button);
    fireEvent.pointerLeave(button);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');
  });

  it('stays popped while any one of hover/focus/press is still active — releasing one alone does not un-pop', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);
    fireEvent.mouseLeave(button);

    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
  });

  it('passes a unique timelineKey derived from the node id', () => {
    render(<NavCabinetRow node={makeNode({ id: 'settings.quality.robotLoad' })} onClick={() => { }} color="#123456" />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-timeline-key')).toContain('settings.quality.robotLoad');
  });
});

describe('NavCabinetRow — accordionSync pop signal (docs/tasks/NAV_ACCORDION_SYNC.md Task 4)', () => {
  afterEach(() => {
    unregisterAccordion('fleetParams.pacing.tempo');
  });

  it('pops when its node.id is registered as open in accordionSync at mount', () => {
    registerAccordion('fleetParams.pacing.tempo', { isOpen: true, open: () => {} });

    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);

    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
  });

  it('does not pop when its node.id is registered as closed', () => {
    registerAccordion('fleetParams.pacing.tempo', { isOpen: false, open: () => {} });

    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);

    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');
  });

  it('still pops on hover/focus/press when its accordion is registered as closed — independent conditions', () => {
    registerAccordion('fleetParams.pacing.tempo', { isOpen: false, open: () => {} });

    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
  });

  it('behaves exactly as before (hover/focus/press only) for an id never registered in accordionSync', () => {
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);

    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
  });

  it('re-renders and pops when accordionSync state changes for its id after mount — proves the subscription fires, not just the initial snapshot', () => {
    registerAccordion('fleetParams.pacing.tempo', { isOpen: false, open: () => {} });
    render(<NavCabinetRow node={makeNode()} onClick={() => { }} color="#123456" />);
    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('false');

    act(() => updateAccordionOpen('fleetParams.pacing.tempo', true));

    expect(screen.getByTestId('cabinet-box').getAttribute('data-popped')).toBe('true');
  });
});
