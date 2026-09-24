import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavTree } from './NavTree';

// A fixture tree at least 3 levels deep with 2+ siblings per level (Task 5's own verification
// requirement, docs/tasks/NAV_LAYOUT_REWRITE.md): a/b at level 1, a.1/a.2 and b.1/b.2 at level 2,
// a.1.i/a.1.ii at level 3.
//
// The fake state is a tiny external store (subscribe/notify), not component-local useState —
// NavTree and every NavTreeNode call useNavTree() independently, exactly like the real hook reads
// a shared uiStore; component-local state would give each call its own isolated copy, so
// NavTree's own select()/toggleExpand() calls would never be visible to NavTreeNode's
// isSelected()/isExpanded() reads. Everything the vi.mock factory below needs comes from this one
// vi.hoisted call, which Vitest guarantees runs before the factory — a plain top-level const here
// would still be in its temporal dead zone when the factory first runs.
const { FIXTURE, getFakeNavState, setFakeNavState, subscribeFakeNavState } = vi.hoisted(() => {
  const FIXTURE = [
    {
      id: 'a',
      humanLabel: 'A',
      children: [
        {
          id: 'a.1',
          humanLabel: 'A1',
          children: [
            { id: 'a.1.i', humanLabel: 'A1i' },
            { id: 'a.1.ii', humanLabel: 'A1ii' },
          ],
        },
        { id: 'a.2', humanLabel: 'A2' },
      ],
    },
    {
      id: 'b',
      humanLabel: 'B',
      children: [
        { id: 'b.1', humanLabel: 'B1' },
        { id: 'b.2', humanLabel: 'B2' },
      ],
    },
  ];

  let expanded = new Set<string>();
  let selectedId: string | null = null;
  const listeners = new Set<() => void>();

  return {
    FIXTURE,
    getFakeNavState: () => ({ expanded, selectedId }),
    setFakeNavState: (patch: Partial<{ expanded: Set<string>; selectedId: string | null }>) => {
      if (patch.expanded) expanded = patch.expanded;
      if ('selectedId' in patch) selectedId = patch.selectedId ?? null;
      listeners.forEach((l) => l());
    },
    subscribeFakeNavState: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock('./useNavTree', () => ({
  useNavTree: () => {
    // Snapshot must be a stable primitive for useSyncExternalStore to compare across renders.
    useSyncExternalStore(subscribeFakeNavState, () => {
      const s = getFakeNavState();
      return `${s.selectedId ?? ''}|${Array.from(s.expanded).join(',')}`;
    });
    const { expanded, selectedId } = getFakeNavState();
    return {
      nodes: FIXTURE,
      isExpanded: (id: string) => expanded.has(id),
      isSelected: (id: string) => id === selectedId,
      select: (id: string) => setFakeNavState({ selectedId: id }),
      toggleExpand: (id: string) => {
        const next = new Set(expanded);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setFakeNavState({ expanded: next });
      },
    };
  },
}));

function getRow(name: string) {
  return screen.getByRole('button', { name }).closest('[role="treeitem"]') as HTMLElement;
}

describe('NavTree — roving tabindex and keyboard navigation (docs/tasks/NAV_LAYOUT_REWRITE.md Task 5)', () => {
  beforeEach(() => {
    setFakeNavState({ expanded: new Set(), selectedId: null });
    render(<NavTree />);
  });

  it('exactly one visible row has tabindex="0" on mount — the first top-level row', () => {
    const rows = screen.getAllByRole('treeitem');
    const zeroTabIndex = rows.filter((r) => r.getAttribute('tabindex') === '0');
    expect(zeroTabIndex).toHaveLength(1);
    expect(zeroTabIndex[0]).toBe(getRow('A'));
    expect(getRow('B').getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowDown moves the roving tabindex to the next visible row, skipping collapsed children', () => {
    getRow('A').focus();

    fireEvent.keyDown(getRow('A'), { key: 'ArrowDown' });

    // A's children are collapsed, so the next visible row is B, not a.1.
    expect(getRow('B').getAttribute('tabindex')).toBe('0');
    expect(getRow('A').getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(getRow('B'));
  });

  it('ArrowUp moves the roving tabindex to the previous visible row', () => {
    getRow('A').focus();
    fireEvent.keyDown(getRow('A'), { key: 'ArrowDown' }); // -> B

    fireEvent.keyDown(getRow('B'), { key: 'ArrowUp' });

    expect(getRow('A').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(getRow('A'));
  });

  it('ArrowRight on a collapsed parent expands it without moving focus', () => {
    getRow('A').focus();

    fireEvent.keyDown(getRow('A'), { key: 'ArrowRight' });

    expect(getRow('A').getAttribute('aria-expanded')).toBe('true');
    expect(getRow('A').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(getRow('A'));
  });

  it('ArrowRight on an already-expanded parent moves focus into its first child', () => {
    getRow('A').focus();
    fireEvent.keyDown(getRow('A'), { key: 'ArrowRight' }); // expand A

    fireEvent.keyDown(getRow('A'), { key: 'ArrowRight' }); // move into first child

    expect(getRow('A1').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(getRow('A1'));
  });

  it('ArrowRight on a leaf does nothing', () => {
    getRow('A').focus();
    fireEvent.keyDown(getRow('A'), { key: 'ArrowRight' }); // expand A
    fireEvent.keyDown(getRow('A'), { key: 'ArrowDown' }); // -> A1
    fireEvent.keyDown(getRow('A1'), { key: 'ArrowDown' }); // -> A2 (leaf)
    expect(getRow('A2').getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(getRow('A2'), { key: 'ArrowRight' });

    expect(getRow('A2').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(getRow('A2'));
  });

  it('ArrowLeft on an expanded parent collapses it without moving focus', () => {
    getRow('A').focus();
    fireEvent.keyDown(getRow('A'), { key: 'ArrowRight' }); // expand A

    fireEvent.keyDown(getRow('A'), { key: 'ArrowLeft' });

    expect(getRow('A').getAttribute('aria-expanded')).toBe('false');
    expect(getRow('A').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(getRow('A'));
  });

  it('ArrowLeft on a collapsed node or a leaf moves focus to its parent', () => {
    getRow('A').focus();
    fireEvent.keyDown(getRow('A'), { key: 'ArrowRight' }); // expand A
    fireEvent.keyDown(getRow('A'), { key: 'ArrowDown' }); // -> A1 (collapsed, has children)

    fireEvent.keyDown(getRow('A1'), { key: 'ArrowLeft' });

    expect(getRow('A').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(getRow('A'));
  });

  it('Enter on a focused row selects it, identical to a click on its name', () => {
    getRow('A').focus();
    fireEvent.keyDown(getRow('A'), { key: 'ArrowDown' }); // -> B, the real roving-tabindex path

    fireEvent.keyDown(getRow('B'), { key: 'Enter' });

    expect(getRow('B').getAttribute('aria-selected')).toBe('true');
  });

  it('Space on a focused row selects it too', () => {
    getRow('A').focus();
    fireEvent.keyDown(getRow('A'), { key: 'ArrowDown' }); // -> B, the real roving-tabindex path

    fireEvent.keyDown(getRow('B'), { key: ' ' });

    expect(getRow('B').getAttribute('aria-selected')).toBe('true');
  });
});
