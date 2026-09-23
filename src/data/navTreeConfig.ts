/**
 * Static shape of the Navigation & Layout Rewrite's tree nav
 * (docs/specs/NAV_LAYOUT_REWRITE.md §5.1) — mirrors headerNavConfig.ts's
 * schema-driven, zero-hardcoded-routing-logic convention. Covers every
 * fully-static branch (Settings, Fleet Params) plus the static *parent* node
 * for each dynamic branch (Probes, Companies). Per-robot/per-company subtree
 * nodes are NOT authored here — they vary with the live roster/company list,
 * so useNavTree (Task 3) generates them at render time from localeStore.
 *
 * Node ids are namespaced by branch (e.g. 'settings.volume',
 * 'fleetParams.eqFilters.eq') and used only for expansion bookkeeping and
 * schema lookups — never parsed to derive selection state (spec §1.5).
 */

export interface NavTreeNodeSchema {
  /** Stable within its own branch, e.g. 'settings.volume'. */
  id: string;
  /** DualLabel convention, reused for the tree row's own label. */
  loreLabel?: string;
  humanLabel: string;
  /** Static children only — dynamic branches (Probes/Companies) resolve
   *  their per-entity children separately, at render time. */
  children?: NavTreeNodeSchema[];
  /** Key into whatever doc-content store the Q4 follow-up spec settles on —
   *  stubbed here, not wired (spec §7 Q4). */
  docId?: string;
  /** Tree-row tint (Task 20, spec §7 Q3) — set only on a company's own top-level
   *  companies.<id> node (its Company.color), never on that company's section
   *  children. Every other branch/node leaves this undefined. */
  color?: string;
}

export const NAV_TREE_SCHEMA: NavTreeNodeSchema[] = [
  {
    id: 'settings',
    humanLabel: 'Settings',
    children: [
      { id: 'settings.volume', humanLabel: 'Volume' },
      { id: 'settings.quality', humanLabel: 'Quality' },
      { id: 'settings.tempo', humanLabel: 'Tempo' },
      { id: 'settings.sectorSettings', humanLabel: 'Sector Settings' },
    ],
  },
  {
    id: 'fleetParams',
    humanLabel: 'Fleet Params',
    children: [
      {
        id: 'fleetParams.eqFilters',
        humanLabel: 'EQ & Filters',
        children: [
          { id: 'fleetParams.eqFilters.eq', humanLabel: '3-Band EQ' },
          { id: 'fleetParams.eqFilters.hpf', humanLabel: 'High-Pass Filter' },
          { id: 'fleetParams.eqFilters.lpf', humanLabel: 'Low-Pass Filter' },
        ],
      },
      {
        id: 'fleetParams.timeSpace',
        humanLabel: 'Time & Space',
        children: [
          { id: 'fleetParams.timeSpace.reverb', humanLabel: 'Reverb' },
          { id: 'fleetParams.timeSpace.delay', humanLabel: 'Delay' },
        ],
      },
      {
        id: 'fleetParams.output',
        humanLabel: 'Output',
        children: [
          { id: 'fleetParams.output.compression', humanLabel: 'Compressor' },
          { id: 'fleetParams.output.limiter', humanLabel: 'Limiter' },
        ],
      },
    ],
  },
  {
    id: 'probes',
    humanLabel: 'Probes',
    children: [
      {
        id: 'probes.all',
        // Naming placeholder per intent doc — may change once the tree is built and used.
        humanLabel: 'All Probes',
        children: [
          { id: 'probes.all.volume', humanLabel: 'Volume' },
          { id: 'probes.all.melody', humanLabel: 'Melody' },
          { id: 'probes.all.envelope', humanLabel: 'Envelope' },
          { id: 'probes.all.source', humanLabel: 'Source' },
        ],
      },
    ],
  },
  {
    id: 'companies',
    humanLabel: 'Companies',
    // No static children — per-company nodes are generated at render time.
    // Clicking this parent node itself opens the Create form (spec §2).
  },
];
