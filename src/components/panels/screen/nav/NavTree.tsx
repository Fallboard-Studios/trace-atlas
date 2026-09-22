import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { NavTreeNode } from './NavTreeNode';
import { useNavTree } from './useNavTree';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';
import './NavTree.css';

interface VisibleRow {
  id: string;
  parentId: string | null;
  hasChildren: boolean;
}

/** Depth-first list of every currently-rendered row, in the exact order NavTreeNode renders
 *  them — a collapsed node's children are excluded, since Up/Down must skip what isn't actually
 *  visible. Recomputed on every render off `nodes`/`isExpanded`; cheap relative to a render pass. */
function flattenVisible(nodes: NavTreeNodeSchema[], isExpanded: (id: string) => boolean, parentId: string | null = null): VisibleRow[] {
  const rows: VisibleRow[] = [];
  for (const node of nodes) {
    const hasChildren = !!node.children && node.children.length > 0;
    rows.push({ id: node.id, parentId, hasChildren });
    if (hasChildren && isExpanded(node.id)) {
      rows.push(...flattenVisible(node.children!, isExpanded, node.id));
    }
  }
  return rows;
}

/**
 * The `role="tree"` root (docs/specs/NAV_LAYOUT_REWRITE.md §4 "Always") — owns the APG
 * roving-tabindex pattern: exactly one visible row is `tabIndex 0` at a time, every other -1.
 * Up/Down/Left/Right/Enter/Space per the WAI-ARIA APG Tree View pattern. Focus state
 * (`focusedId`) is component-local (`useState`), never uiStore — matches useLfoTargetGroup's own
 * "selection is local, ephemeral state" precedent (spec §4 "Never").
 */
export function NavTree() {
  const { nodes, isExpanded, select, toggleExpand } = useNavTree();
  const rootRef = useRef<HTMLDivElement>(null);
  const isFirstFocusEffect = useRef(true);
  const visibleRows = flattenVisible(nodes, isExpanded);
  const [focusedId, setFocusedId] = useState<string>(visibleRows[0]?.id ?? '');

  // If the currently-focused row disappears from the visible set (a node collapsed elsewhere, or
  // the live roster changed), fall back to the first visible row rather than pointing at
  // something no longer rendered.
  const visibleIds = visibleRows.map((r) => r.id).join('|');
  useEffect(() => {
    if (!visibleRows.some((r) => r.id === focusedId)) {
      setFocusedId(visibleRows[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds]);

  // Moves real DOM focus to match focusedId — but not on mount, or rendering the tree would
  // steal focus from wherever the page already had it.
  useEffect(() => {
    if (isFirstFocusEffect.current) {
      isFirstFocusEffect.current = false;
      return;
    }
    const rows = rootRef.current?.querySelectorAll<HTMLElement>('[data-nav-node-id]');
    const el = rows ? Array.from(rows).find((row) => row.dataset.navNodeId === focusedId) : undefined;
    el?.focus();
  }, [focusedId]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = visibleRows.findIndex((r) => r.id === focusedId);
    if (idx === -1) return;
    const row = visibleRows[idx];

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (visibleRows[idx + 1]) setFocusedId(visibleRows[idx + 1].id);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (visibleRows[idx - 1]) setFocusedId(visibleRows[idx - 1].id);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.hasChildren && !isExpanded(row.id)) {
          toggleExpand(row.id);
        } else if (row.hasChildren && visibleRows[idx + 1]) {
          setFocusedId(visibleRows[idx + 1].id); // already expanded — move into first child
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (row.hasChildren && isExpanded(row.id)) {
          toggleExpand(row.id);
        } else if (row.parentId) {
          setFocusedId(row.parentId);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        select(row.id);
        break;
      default:
        break;
    }
  }

  return (
    <div className="nav-tree" role="tree" ref={rootRef} onKeyDown={handleKeyDown}>
      {nodes.map((node) => (
        <NavTreeNode key={node.id} node={node} depth={1} focusedId={focusedId} />
      ))}
    </div>
  );
}

export default NavTree;
