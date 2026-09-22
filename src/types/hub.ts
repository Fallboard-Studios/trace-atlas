/**
 * Hub navigation types, resolving docs/tasks/HUB.md Task 1. Defined once here
 * so both src/stores/uiStore.ts and src/data/headerNavConfig.ts import from a
 * shared source instead of one reaching into the other.
 */

/**
 * The three hub tiles surviving Roadmap Phase 3 (Session and Composition are
 * dropped outright). `robots` shows a list of every robot in the active
 * locale; selecting one shows its editor within the same tile (tracked via
 * uiStore's existing selectedRobotId, not a separate HubTile value) — see
 * docs/intent/phase-3-hub.md's Amendment. `audioRig`/`settings` get real
 * content in Phases 4-5.
 *
 * Navigation between these three moved from HubNav's tile grid into
 * Header's always-visible row 3 (docs/specs/HEADER_HUB_CONSOLIDATION.md) —
 * HubNavItem (the old {schema, target} pairing HUB_NAV_ITEMS used) is gone
 * along with it; HEADER_NAV_SCHEMA's RadioButtonSchema.options entries use
 * HubTile values directly as each option's own value.
 *
 * `companies` added for the Navigation & Layout Rewrite
 * (docs/specs/NAV_LAYOUT_REWRITE.md §1.4/Q1) — Companies becomes its own
 * top-level tree branch rather than nesting inside `robots`, keeping
 * ConsolePanel's `Record<HubTile, ...>` exhaustiveness guarantee intact.
 */
export type HubTile = 'robots' | 'audioRig' | 'settings' | 'companies';
