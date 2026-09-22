import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavTreeNode } from './NavTreeNode';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';

const mockIsExpanded = vi.fn();
const mockIsSelected = vi.fn();
const mockSelect = vi.fn();
const mockToggleExpand = vi.fn();

vi.mock('./useNavTree', () => ({
  useNavTree: () => ({
    nodes: [],
    isExpanded: mockIsExpanded,
    isSelected: mockIsSelected,
    select: mockSelect,
    toggleExpand: mockToggleExpand,
  }),
}));

const LEAF: NavTreeNodeSchema = { id: 'settings.volume', humanLabel: 'Volume' };
const CATEGORY: NavTreeNodeSchema = {
  id: 'settings',
  humanLabel: 'Settings',
  children: [LEAF, { id: 'settings.tempo', humanLabel: 'Tempo' }],
};

describe('NavTreeNode — structure and ARIA (docs/tasks/NAV_LAYOUT_REWRITE.md Task 4)', () => {
  beforeEach(() => {
    mockIsExpanded.mockReset().mockReturnValue(false);
    mockIsSelected.mockReset().mockReturnValue(false);
    mockSelect.mockReset();
    mockToggleExpand.mockReset();
  });

  it('a leaf with no children renders no +/- toggle button, and aria-expanded is undefined (not false)', () => {
    render(<NavTreeNode node={LEAF} depth={1} />);
    expect(screen.queryByRole('button', { name: /expand|collapse/i })).toBeNull();
    expect(screen.getByRole('treeitem').getAttribute('aria-expanded')).toBeNull();
  });

  it('a node with children renders a +/- toggle button', () => {
    render(<NavTreeNode node={CATEGORY} depth={1} />);
    expect(screen.getByRole('button', { name: /expand settings/i })).toBeTruthy();
  });

  it('aria-expanded reflects isExpanded(node.id) — true', () => {
    mockIsExpanded.mockReturnValue(true);
    render(<NavTreeNode node={CATEGORY} depth={1} />);
    expect(screen.getAllByRole('treeitem')[0].getAttribute('aria-expanded')).toBe('true');
    expect(mockIsExpanded).toHaveBeenCalledWith('settings');
  });

  it('aria-expanded reflects isExpanded(node.id) — false', () => {
    mockIsExpanded.mockReturnValue(false);
    render(<NavTreeNode node={CATEGORY} depth={1} />);
    expect(screen.getByRole('treeitem').getAttribute('aria-expanded')).toBe('false');
  });

  it('aria-selected reflects isSelected(node.id)', () => {
    mockIsSelected.mockReturnValue(true);
    render(<NavTreeNode node={LEAF} depth={2} />);
    expect(screen.getByRole('treeitem').getAttribute('aria-selected')).toBe('true');
    expect(mockIsSelected).toHaveBeenCalledWith('settings.volume');
  });

  it('aria-level matches the depth prop', () => {
    render(<NavTreeNode node={LEAF} depth={3} />);
    expect(screen.getByRole('treeitem').getAttribute('aria-level')).toBe('3');
  });
});

describe('NavTreeNode — selection vs. expansion, decoupled (Task 4 AC1/AC2)', () => {
  beforeEach(() => {
    mockIsExpanded.mockReset().mockReturnValue(false);
    mockIsSelected.mockReset().mockReturnValue(false);
    mockSelect.mockReset();
    mockToggleExpand.mockReset();
  });

  it('clicking a node\'s name selects it and does not toggle expansion', () => {
    render(<NavTreeNode node={CATEGORY} depth={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledWith('settings');
    expect(mockToggleExpand).not.toHaveBeenCalled();
  });

  it('clicking the +/- toggle expands/collapses only, and never fires select', () => {
    render(<NavTreeNode node={CATEGORY} depth={1} />);
    fireEvent.click(screen.getByRole('button', { name: /expand settings/i }));

    expect(mockToggleExpand).toHaveBeenCalledTimes(1);
    expect(mockToggleExpand).toHaveBeenCalledWith('settings');
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe('NavTreeNode — recursion (Task 4 AC3)', () => {
  beforeEach(() => {
    mockIsExpanded.mockReset();
    mockIsSelected.mockReset().mockReturnValue(false);
    mockSelect.mockReset();
    mockToggleExpand.mockReset();
  });

  it('renders child rows in a role="group" wrapper, one level deeper, when expanded', () => {
    mockIsExpanded.mockReturnValue(true);
    render(<NavTreeNode node={CATEGORY} depth={1} />);

    const group = screen.getByRole('group');
    expect(group).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volume' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tempo' })).toBeTruthy();
    expect(screen.getAllByRole('treeitem').find((el) => el.getAttribute('aria-level') === '2')).toBeTruthy();
  });

  it('does not render children at all while collapsed — not just visually hidden', () => {
    mockIsExpanded.mockReturnValue(false);
    render(<NavTreeNode node={CATEGORY} depth={1} />);

    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Volume' })).toBeNull();
  });
});
