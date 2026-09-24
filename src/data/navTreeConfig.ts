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

import type { Trait } from '@/types/traits';

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
   *  children. Every other branch/node leaves this undefined. Takes precedence
   *  over `trait` below when both would apply (NavTreeNode.tsx). */
  color?: string;
  /** Experimental (Crawford's own request) — set on each of the 4 top-level
   *  branch nodes below (one Trait apiece: spectral/timeSpace/output/company,
   *  the branch's own default), AND on any deeper node whose real content
   *  already has an established trait of its own elsewhere in the app (e.g.
   *  fleetParams.eqFilters -> 'spectral', matching AudioRigDrawer.tsx's own
   *  AUDIO_RIG_EFFECT_TRAIT; settings.sectorSettings -> 'seed', matching
   *  SectorSettingsDrawer.tsx's own getTraitColorStyle('seed') call). A node
   *  with neither `color` nor `trait` set (most leaves) simply inherits
   *  whichever ancestor's row last set the 4 --color-accent-* custom
   *  properties, via ordinary CSS cascade (traitColors.ts's buildAccentStyle)
   *  — no extra plumbing needed. Dynamic children (Probes/Companies section
   *  leaves, and each per-robot/per-company node's own `color`) are wired at
   *  the level that generates them instead — useNavTree.ts's
   *  sectionChildNodes/buildProbesSubtree/buildCompaniesSubtree. */
  trait?: Trait;
}

export const NAV_TREE_SCHEMA: NavTreeNodeSchema[] = [
  {
    id: 'settings',
    humanLabel: 'Settings',
    trait: 'spectral',
    // Volume/Quality/Tempo below are Crawford's own explicit per-leaf picks (2026-09-23) — unlike
    // Fleet Params'/Sector Settings', these 3 have no single established trait elsewhere in the
    // app to match; each one simply overrides Settings' own spectral default with a distinct trait.
    children: [
      { id: 'settings.volume', humanLabel: 'Volume', trait: 'output' },
      { id: 'settings.quality', humanLabel: 'Quality', trait: 'seed' },
      { id: 'settings.tempo', humanLabel: 'Tempo', trait: 'composition' },
      // Matches SectorSettingsDrawer.tsx's own getTraitColorStyle('seed') call.
      { id: 'settings.sectorSettings', humanLabel: 'Sector Settings', trait: 'seed' },
    ],
  },
  {
    id: 'fleetParams',
    humanLabel: 'Fleet Params',
    trait: 'timeSpace',
    children: [
      {
        id: 'fleetParams.eqFilters',
        humanLabel: 'EQ & Filters',
        // Matches AudioRigDrawer.tsx's own AUDIO_RIG_EFFECT_TRAIT — eq3/filterHPF/filterLPF are
        // all 'spectral'; every leaf below inherits this via cascade rather than repeating it.
        trait: 'spectral',
        children: [
          { id: 'fleetParams.eqFilters.eq', humanLabel: '3-Band EQ' },
          { id: 'fleetParams.eqFilters.hpf', humanLabel: 'High-Pass Filter' },
          { id: 'fleetParams.eqFilters.lpf', humanLabel: 'Low-Pass Filter' },
        ],
      },
      {
        id: 'fleetParams.timeSpace',
        humanLabel: 'Time & Space',
        // reverb/delay are both 'timeSpace' in AUDIO_RIG_EFFECT_TRAIT — same as this branch's own
        // top-level default, set explicitly anyway so this group's trait doesn't silently depend
        // on Fleet Params' own default never changing.
        trait: 'timeSpace',
        children: [
          { id: 'fleetParams.timeSpace.reverb', humanLabel: 'Reverb' },
          { id: 'fleetParams.timeSpace.delay', humanLabel: 'Delay' },
        ],
      },
      {
        id: 'fleetParams.output',
        humanLabel: 'Output',
        // compressor/limiter are both 'output' in AUDIO_RIG_EFFECT_TRAIT.
        trait: 'output',
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
    trait: 'output',
    children: [
      {
        id: 'probes.all',
        // Naming placeholder per intent doc — may change once the tree is built and used.
        humanLabel: 'All Probes',
        // Crawford's own explicit pick (2026-09-23) — overrides Probes' own output default; 'All
        // Probes' itself has no established trait elsewhere in the app, unlike its own 4 leaves
        // below.
        trait: 'header',
        // Matches AudioSettingSection/PingControlsDrawer/PingContourDrawer/SignatureArrayDrawer's
        // own per-section getTraitColorStyle calls (output/composition/timeSpace/spectral) — the
        // same mapping useNavTree.ts's own SECTION_CHILDREN uses for per-robot/per-company nodes.
        children: [
          { id: 'probes.all.volume', humanLabel: 'Volume', trait: 'output' },
          { id: 'probes.all.melody', humanLabel: 'Melody', trait: 'composition' },
          { id: 'probes.all.envelope', humanLabel: 'Envelope', trait: 'timeSpace' },
          { id: 'probes.all.source', humanLabel: 'Source', trait: 'spectral' },
        ],
      },
    ],
  },
  {
    id: 'companies',
    humanLabel: 'Companies',
    trait: 'company',
    // No static children — per-company nodes are generated at render time.
    // Clicking this parent node itself opens the Create form (spec §2).
  },
];
