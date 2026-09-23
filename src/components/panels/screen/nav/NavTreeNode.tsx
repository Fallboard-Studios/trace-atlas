import { useNavTree } from './useNavTree';
import { getRobotColorStyle } from '@/utils/traitColors';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';
import './NavTreeNode.css';

interface NavTreeNodeProps {
  node: NavTreeNodeSchema;
  depth: number;
  /** Roving-tabindex target id, threaded down by NavTree (Task 5) — the node whose id matches
   *  gets tabIndex 0, every other visible row -1. Left undefined for NavTreeNode's own
   *  standalone tests (Task 4), which don't exercise keyboard focus. */
  focusedId?: string;
}

/**
 * One tree row, recursive (docs/specs/NAV_LAYOUT_REWRITE.md §5.2) — a name button (click =
 * select) and a separate +/- button (click = toggle-expand only, stopPropagation'ed so it never
 * also fires select). `aria-expanded` is left `undefined` (not `false`) on leaf nodes, matching
 * AccordionContainer's own existing precedent: real open/closed state on a node that can never
 * expand isn't a meaningful thing to announce. `data-nav-node-id` lets NavTree (Task 5) find and
 * imperatively focus() the roving-tabindex target after an arrow-key move.
 */
export function NavTreeNode({ node, depth, focusedId }: NavTreeNodeProps) {
  const { isExpanded, isSelected, select, toggleExpand } = useNavTree();
  const hasChildren = !!node.children && node.children.length > 0;
  const expanded = hasChildren ? isExpanded(node.id) : false;
  const selected = isSelected(node.id);
  const tabIndex = focusedId === undefined ? undefined : focusedId === node.id ? 0 : -1;

  return (
    <div
      className="nav-tree-node"
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected}
      aria-level={depth}
      tabIndex={tabIndex}
      data-nav-node-id={node.id}
      style={node.color ? getRobotColorStyle(node.color) : undefined}
    >
      <button type="button" className="nav-tree-node__name" onClick={() => select(node.id)}>
        {node.humanLabel}
      </button>
      {hasChildren && (
        <button
          type="button"
          className="nav-tree-node__toggle"
          aria-label={expanded ? `Collapse ${node.humanLabel}` : `Expand ${node.humanLabel}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(node.id);
          }}
        >
          {expanded ? '−' : '+'}
        </button>
      )}
      {hasChildren && expanded && (
        <div role="group">
          {node.children!.map((child) => (
            <NavTreeNode key={child.id} node={child} depth={depth + 1} focusedId={focusedId} />
          ))}
        </div>
      )}
    </div>
  );
}

export default NavTreeNode;
