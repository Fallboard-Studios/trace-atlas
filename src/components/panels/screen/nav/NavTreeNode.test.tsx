import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavTreeNode } from './NavTreeNode';
import { TRAIT_COLORS } from '@/utils/traitColors';
import { scrollToSection } from '@/utils/sectionRefs';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';

vi.mock('@/utils/sectionRefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sectionRefs')>();
  return { ...actual, scrollToSection: vi.fn() };
});

const mockIsExpanded = vi.fn();
const mockIsSelected = vi.fn();
const mockSelect = vi.fn();
const mockToggleExpand = vi.fn();

vi.mock('./useNavTree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useNavTree')>();
  return {
    ...actual, // real isDeepestTwoLevels/isAutoExpandTier/isCollapsible — pure, not mocked
    useNavTree: () => ({
      nodes: [],
      isExpanded: mockIsExpanded,
      isSelected: mockIsSelected,
      select: mockSelect,
      toggleExpand: mockToggleExpand,
    }),
  };
});

vi.mock('./UnderlineLinkNavRow', () => ({
  UnderlineLinkNavRow: ({ node, onClick, color }: { node: { id: string; humanLabel: string }; onClick: () => void; color: string }) => (
    <button data-testid="underline-link-nav-row" data-node-id={node.id} data-color={color} onClick={onClick}>
      {node.humanLabel}
    </button>
  ),
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

  it('a leaf with no children renders no +/- toggle switch, and aria-expanded is undefined (not false)', () => {
    render(<NavTreeNode node={LEAF} depth={1} />);
    expect(screen.queryByRole('switch', { name: /expand|collapse/i })).toBeNull();
    expect(screen.getByRole('treeitem').getAttribute('aria-expanded')).toBeNull();
  });

  it('a node with children renders a +/- toggle switch (the shared Toggle primitive, role="switch" not "button")', () => {
    render(<NavTreeNode node={CATEGORY} depth={1} />);
    expect(screen.getByRole('switch', { name: /expand settings/i })).toBeTruthy();
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
    vi.mocked(scrollToSection).mockClear();
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
    fireEvent.click(screen.getByRole('switch', { name: /expand settings/i }));

    expect(mockToggleExpand).toHaveBeenCalledTimes(1);
    expect(mockToggleExpand).toHaveBeenCalledWith('settings');
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('clicking a node\'s name also scrolls to its section anchor (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 7, spec §1.6) — a no-op via sectionRefs\' own contract if that section hasn\'t lazy-mounted an anchor yet', () => {
    render(<NavTreeNode node={LEAF} depth={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volume' }));

    expect(scrollToSection).toHaveBeenCalledWith('settings.volume');
  });

  it('clicking the +/- toggle never scrolls — only a name click does', () => {
    render(<NavTreeNode node={CATEGORY} depth={1} />);
    fireEvent.click(screen.getByRole('switch', { name: /expand settings/i }));

    expect(scrollToSection).not.toHaveBeenCalled();
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

describe('NavTreeNode — company color-coding (docs/tasks/NAV_LAYOUT_REWRITE.md Task 20, spec §7 Q3)', () => {
  beforeEach(() => {
    mockIsExpanded.mockReset().mockReturnValue(false);
    mockIsSelected.mockReset().mockReturnValue(false);
    mockSelect.mockReset();
    mockToggleExpand.mockReset();
  });

  it('applies the node\'s own color as the row\'s accent style when set', () => {
    const node: NavTreeNodeSchema = { id: 'companies.c1', humanLabel: 'Acme Corp', color: '#4f6d7a' };
    render(<NavTreeNode node={node} depth={2} />);

    expect(screen.getByRole('treeitem').style.getPropertyValue('--color-accent-a')).toBe('#4f6d7a');
  });

  it('leaves no accent style on a node with no color and no trait', () => {
    render(<NavTreeNode node={LEAF} depth={1} />);

    expect(screen.getByRole('treeitem').style.getPropertyValue('--color-accent-a')).toBe('');
  });
});

describe('NavTreeNode — top-level branch trait color-coding (experimental, Crawford\'s own request)', () => {
  beforeEach(() => {
    mockIsExpanded.mockReset().mockReturnValue(false);
    mockIsSelected.mockReset().mockReturnValue(false);
    mockSelect.mockReset();
    mockToggleExpand.mockReset();
  });

  it('applies the node\'s own trait color pair as the row\'s accent style when set (e.g. Settings -> spectral)', () => {
    const [a, b] = TRAIT_COLORS.spectral;
    const node: NavTreeNodeSchema = { id: 'settings', humanLabel: 'Settings', trait: 'spectral' };
    render(<NavTreeNode node={node} depth={1} />);

    const style = screen.getByRole('treeitem').style;
    expect(style.getPropertyValue('--color-accent-a')).toBe(a);
    expect(style.getPropertyValue('--color-accent-b')).toBe(b);
  });

  it('a child with neither color nor trait renders no inline accent style, inheriting its ancestor\'s via CSS cascade', () => {
    const node: NavTreeNodeSchema = { id: 'settings.volume', humanLabel: 'Volume' };
    render(<NavTreeNode node={node} depth={2} />);

    expect(screen.getByRole('treeitem').style.getPropertyValue('--color-accent-a')).toBe('');
  });

  it('node.color wins over node.trait when both are set', () => {
    const node: NavTreeNodeSchema = { id: 'companies.c1', humanLabel: 'Acme Corp', color: '#4f6d7a', trait: 'company' };
    render(<NavTreeNode node={node} depth={2} />);

    expect(screen.getByRole('treeitem').style.getPropertyValue('--color-accent-a')).toBe('#4f6d7a');
  });
});

describe('NavTreeNode — row-chrome dispatch for the deepest 2 tree levels (docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §5.3)', () => {
  beforeEach(() => {
    mockIsExpanded.mockReset().mockReturnValue(false);
    mockIsSelected.mockReset().mockReturnValue(false);
    mockSelect.mockReset();
    mockToggleExpand.mockReset();
  });

  it('a node matching isDeepestTwoLevels renders UnderlineLinkNavRow, not Button/CabinetBox/Toggle', () => {
    const node: NavTreeNodeSchema = { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo' };
    const { container } = render(<NavTreeNode node={node} depth={3} />);

    expect(screen.getByTestId('underline-link-nav-row')).toBeTruthy();
    // No CabinetBox chrome anywhere — confirms the Button branch didn't also render.
    expect(container.querySelector('.sc-cabinet-box')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('a branch/entity node is unaffected — still Button+CabinetBox, Toggle present when it has children', () => {
    render(<NavTreeNode node={CATEGORY} depth={1} />);

    expect(screen.queryByTestId('underline-link-nav-row')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /expand settings/i })).toBeTruthy();
  });

  it('clicking an UnderlineLinkNavRow selects it and scrolls to its section anchor, same as a Button row', () => {
    const node: NavTreeNodeSchema = { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo' };
    render(<NavTreeNode node={node} depth={3} />);
    fireEvent.click(screen.getByTestId('underline-link-nav-row'));

    expect(mockSelect).toHaveBeenCalledWith('fleetParams.pacing.tempo');
    expect(scrollToSection).toHaveBeenCalledWith('fleetParams.pacing.tempo');
  });

  it('an untraited leaf beneath a traited mid-level node receives that ancestor\'s resolved color as UnderlineLinkNavRow\'s color prop', () => {
    mockIsExpanded.mockReturnValue(true);
    const leaf: NavTreeNodeSchema = { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo' };
    const pacing: NavTreeNodeSchema = { id: 'fleetParams.pacing', humanLabel: 'Pacing', trait: 'composition', children: [leaf] };
    render(<NavTreeNode node={pacing} depth={2} />);

    const [a] = TRAIT_COLORS.composition;
    // Both Pacing (its own trait) and Tempo (inheriting Pacing's) render as underline rows here —
    // scope to the leaf specifically, not Pacing's own (also-matching) row.
    const rows = screen.getAllByTestId('underline-link-nav-row');
    const tempoRow = rows.find((r) => r.getAttribute('data-node-id') === 'fleetParams.pacing.tempo')!;
    expect(tempoRow.getAttribute('data-color')).toContain(a);
  });

  it('a node with its own explicit trait uses its own resolved color, ignoring any inheritedColor it was passed', () => {
    mockIsExpanded.mockReturnValue(true);
    // settings.quality is itself deepest-two-levels (mid-level) AND carries its own trait
    // ('seed') — nested under a differently-traited branch ('spectral'), to prove its own trait
    // wins over whatever it would otherwise inherit.
    const midLevel: NavTreeNodeSchema = { id: 'settings.quality', humanLabel: 'Performance', trait: 'seed', children: [] };
    const settingsBranch: NavTreeNodeSchema = { id: 'settings', humanLabel: 'Settings', trait: 'spectral', children: [midLevel] };
    render(<NavTreeNode node={settingsBranch} depth={1} />);

    const [seedA] = TRAIT_COLORS.seed;
    const row = screen.getByTestId('underline-link-nav-row');
    expect(row.getAttribute('data-color')).toContain(seedA);
  });

  it('an auto-expand-tier row (isCollapsible === false) renders no Toggle, but aria-expanded is still true on its own treeitem', () => {
    mockIsExpanded.mockReturnValue(true);
    const leaf: NavTreeNodeSchema = { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo' };
    const pacing: NavTreeNodeSchema = { id: 'fleetParams.pacing', humanLabel: 'Pacing', trait: 'composition', children: [leaf] };
    render(<NavTreeNode node={pacing} depth={2} />);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getAllByRole('treeitem')[0].getAttribute('aria-expanded')).toBe('true');
  });
});
