import { useNavTree } from './useNavTree';
import { Button } from '@/components/ui/controls/Button';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { Toggle } from '@/components/ui/controls/Toggle';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';
import { scrollToSection } from '@/utils/sectionRefs';
import type { ButtonSchema, ToggleSchema } from '@/types/controls';
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
 * also fires select). `aria-expanded` is left `undefined` (not `false`) on leaf nodes — real
 * open/closed state on a node that can never expand isn't a meaningful thing to announce.
 * `data-nav-node-id` lets NavTree (Task 5) find and
 * imperatively focus() the roving-tabindex target after an arrow-key move.
 */
export function NavTreeNode({ node, depth, focusedId }: NavTreeNodeProps) {
  const { isExpanded, isSelected, select, toggleExpand } = useNavTree();
  const hasChildren = !!node.children && node.children.length > 0;
  const expanded = hasChildren ? isExpanded(node.id) : false;
  const selected = isSelected(node.id);
  const tabIndex = focusedId === undefined ? undefined : focusedId === node.id ? 0 : -1;

  // Experimental (Crawford's own request) — node.color (a company's own literal identity
  // color) wins over node.trait (one of the 4 top-level branches' assigned Trait) when both
  // would apply, though today no node ever has both set. Neither set (every other node) means
  // no inline style at all here, so this row simply inherits whichever ancestor's row last set
  // the 4 --color-accent-* custom properties — the "child without an assigned trait uses its
  // parent's colors" behavior falls straight out of ordinary CSS cascade/inheritance, no extra
  // plumbing needed. See navTreeConfig.ts's own `trait` field comment.
  const colorStyle = node.color
    ? getRobotColorStyle(node.color)
    : node.trait
      ? getTraitColorStyle(node.trait)
      : undefined;

  // Experimental — reusing the shared Button/Toggle primitives in place of the row's old bare
  // <button>s (Crawford's own request, "might not keep any of this"). Recreated every render
  // (not hoisted module-level, unlike every other schema in this codebase) since each depends on
  // this node's own id/label/expanded state.
  const nameSchema: ButtonSchema = { id: `${node.id}-name`, type: 'button', humanLabel: node.humanLabel };
  const toggleSchema: ToggleSchema = {
    id: `${node.id}-toggle`,
    type: 'toggle',
    humanLabel: expanded ? `Collapse ${node.humanLabel}` : `Expand ${node.humanLabel}`,
  };

  return (
    <div
      className="nav-tree-node"
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected}
      aria-level={depth}
      tabIndex={tabIndex}
      data-nav-node-id={node.id}
      style={colorStyle}
    >
      <div className="nav-tree-node__row">
        <Button
          schema={nameSchema}
          onClick={() => {
            select(node.id);
            // Instant jump, never GSAP (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6) — a no-op
            // via sectionRefs' own contract for a branch not yet migrated to the view model, or a
            // section that hasn't lazy-mounted an anchor yet.
            scrollToSection(node.id);
          }}
        />
        {hasChildren && (
          <Toggle schema={toggleSchema} value={expanded} onChange={() => toggleExpand(node.id)}>
            <span aria-hidden="true">{expanded ? '−' : '+'}</span>
          </Toggle>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="nav-tree-node__group" role="group">
          {/* Oblique Cabinetry facade — decorative only, same non-animating
             top-level facade pattern DirectionalPanel/Header/NavPanel already
             use (`popped` + `skipMountAnimation` + `autoHeight`). Unique
             timelineKey per node — unlike Header/NavPanel's one static
             instance, many of these can be mounted simultaneously (one per
             expanded branch), so they need distinct timelineMap entries. */}
          <CabinetBox popped skipMountAnimation autoHeight timelineKey={`cabinet-nav-tree-group-${node.id}`}>
            {node.children!.map((child) => (
              <NavTreeNode key={child.id} node={child} depth={depth + 1} focusedId={focusedId} />
            ))}
          </CabinetBox>
        </div>
      )}
    </div>
  );
}

export default NavTreeNode;
