import { useNavTree } from './useNavTree';
import type { NavTreeNodeSchema } from '@/data/navTreeConfig';
import './NavTreeNode.css';

interface NavTreeNodeProps {
  node: NavTreeNodeSchema;
  depth: number;
}

/**
 * One tree row, recursive (docs/specs/NAV_LAYOUT_REWRITE.md §5.2) — a name button (click =
 * select) and a separate +/- button (click = toggle-expand only, stopPropagation'ed so it never
 * also fires select). Keyboard/roving-tabindex focus management is Task 5's job — this component
 * only proves the structure and the decoupled click behavior. `aria-expanded` is left `undefined`
 * (not `false`) on leaf nodes, matching AccordionContainer's own existing precedent: real
 * open/closed state on a node that can never expand isn't a meaningful thing to announce.
 */
export function NavTreeNode({ node, depth }: NavTreeNodeProps) {
  const { isExpanded, isSelected, select, toggleExpand } = useNavTree();
  const hasChildren = !!node.children && node.children.length > 0;
  const expanded = hasChildren ? isExpanded(node.id) : false;
  const selected = isSelected(node.id);

  return (
    <div className="nav-tree-node" role="treeitem" aria-expanded={hasChildren ? expanded : undefined} aria-selected={selected} aria-level={depth}>
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
            <NavTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default NavTreeNode;
