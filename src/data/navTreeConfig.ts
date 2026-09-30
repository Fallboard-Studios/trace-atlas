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
    id: 'fleetParams',
    loreLabel: 'Environment',
    humanLabel: 'Fleet Params',
    trait: 'spectral',
    children: [
      {
        // A single shared accordion (Tempo, relocated from Settings -> Tempo, + Automatic
        // Effects), unlike the 3 groups below whose leaves each get their own accordion — Tempo/
        // Automatic Effects are pure scroll/highlight anchors within that one accordion, not
        // separate accordions of their own. Matches AudioRigDrawer.tsx's own
        // getTraitColorStyle('composition') call for Automatic Effects.
        id: 'fleetParams.pacing',
        loreLabel: 'Trace Timing',
        humanLabel: 'Pacing',
        trait: 'composition',
        children: [
          { id: 'fleetParams.pacing.tempo', loreLabel: 'Ping Rate', humanLabel: 'Tempo' },
          { id: 'fleetParams.pacing.frequency', loreLabel: 'Trace Skip Rate', humanLabel: 'Automation Rate' },
          { id: 'fleetParams.pacing.duration', loreLabel: 'Trace Runway', humanLabel: 'Automation Length' },
          { id: 'fleetParams.pacing.automaticEffects', loreLabel: 'Trace Width', humanLabel: 'Automation Range' },
        ],
      },
      {
        id: 'fleetParams.eqFilters',
        loreLabel: 'Outer Bounds',
        humanLabel: 'EQ & Filters',
        // Matches AudioRigDrawer.tsx's own AUDIO_RIG_EFFECT_TRAIT — eq3/filterHPF/filterLPF are
        // all 'spectral'; every leaf below inherits this via cascade rather than repeating it.
        trait: 'spectral',
        children: [
          { id: 'fleetParams.eqFilters.eq', loreLabel: 'Trace Metrics', humanLabel: '3-Band EQ' },
          { id: 'fleetParams.eqFilters.hpf', loreLabel: 'Top Extraction', humanLabel: 'High-Pass Filter' },
          { id: 'fleetParams.eqFilters.lpf', loreLabel: 'Bottom Extraction', humanLabel: 'Low-Pass Filter' },
        ],
      },
      {
        // New top-level group (docs/specs/FLEET_DRIFT_CONSOLIDATION.md), displayed as "Drift" —
        // renamed from "Fleet Drift" to "LFO Drift" per Crawford's own follow-up, then again to
        // "Drift" per docs/reference/text-content-tables.md's own lore/human copy pass (the id
        // itself (`fleetDrift`) has never changed, every rename here is label-only). Positioned
        // right after EQ & Filters rather than nested inside it (confirmed via the
        // breadcrumb-trimming reasoning in the spec's §1.3: a leaf's own name is trimmed, so
        // "Fleet Params > Drift" only reads that way if Drift is itself the group). Holds 2
        // leaves: "Environmental Drift" (the merged eq3/filterLPF/filterHPF control, formerly
        // "Fleet Drift") and "Voice Drift" (formerly "Robot Drift" — moved here from Probes/
        // Companies entirely, no longer duplicated there, same earlier follow-up).
        id: 'fleetParams.fleetDrift',
        loreLabel: 'Signatures',
        humanLabel: 'Drift',
        // Matches EQ & Filters' own trait — this group is drift of the global-chain effects (plus
        // Voice Drift, moved in alongside it). Not confirmed directly with Crawford (spec §7 item 1).
        trait: 'spectral',
        children: [
          { id: 'fleetParams.fleetDrift.drift', loreLabel: 'Trace Appendix', humanLabel: 'Environmental Drift' },
          { id: 'fleetParams.fleetDrift.robots', loreLabel: 'Probe Signature', humanLabel: 'Voice Drift' },
        ],
      },
      {
        id: 'fleetParams.timeSpace',
        loreLabel: 'Dimensional Bounds',
        humanLabel: 'Time & Space',
        // reverb/delay are both 'timeSpace' in AUDIO_RIG_EFFECT_TRAIT — same as this branch's own
        // top-level default, set explicitly anyway so this group's trait doesn't silently depend
        // on Fleet Params' own default never changing.
        trait: 'timeSpace',
        children: [
          { id: 'fleetParams.timeSpace.reverb', loreLabel: 'External Capacity', humanLabel: 'Reverb' },
          { id: 'fleetParams.timeSpace.delay', loreLabel: 'Retracing', humanLabel: 'Delay' },
        ],
      },
      {
        id: 'fleetParams.output',
        loreLabel: 'Trace Flattening',
        humanLabel: 'Output',
        // compressor/limiter are both 'output' in AUDIO_RIG_EFFECT_TRAIT.
        trait: 'output',
        children: [
          { id: 'fleetParams.output.compression', loreLabel: 'Bundler', humanLabel: 'Compressor' },
          { id: 'fleetParams.output.limiter', loreLabel: 'Reduction', humanLabel: 'Limiter' },
        ],
      },
    ],
  },
  {
    id: 'probes',
    loreLabel: 'Timbre & Color',
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
        // Section children are NOT authored here — "All Probes" is a bulk-edit entity like any
        // robot, so useNavTree.ts's buildProbesSubtree generates its 4 sections (and their
        // subsections) via the same sectionChildNodes() every per-robot node uses.
      },
    ],
  },
  {
    id: 'companies',
    loreLabel: 'Unity & Variety',
    humanLabel: 'Companies',
    trait: 'company',
    // No static children — per-company nodes are generated at render time.
    // Clicking this parent node itself opens the Create form (spec §2).
  },
  {
    id: 'settings',
    // Reversed from docs/reference/text-content-tables.md's original Navigation/Settings split
    // (Crawford's own correction) — "Settings" is the human label, "Navigation" is the lore label.
    loreLabel: 'Navigation',
    humanLabel: 'Settings',
    trait: 'seed',
    // Quality below is Crawford's own explicit per-leaf pick (2026-09-23) — unlike Fleet Params'/
    // Sector Settings', it has no single established trait elsewhere in the app to match; it
    // simply overrides Settings' own spectral default with a distinct trait. Volume was removed
    // (Header already carries its own always-visible volume slider) and Tempo moved to Fleet
    // Params -> Pacing.
    children: [
      {
        id: 'settings.quality',
        loreLabel: 'Trace Capacity',
        humanLabel: 'Audio Quality',
        trait: 'seed',
        // Robot Load/Effects Load — already-existing labeled rows inside AudioLoadPanel.tsx
        // (AUDIO_ROBOT_LOAD_SCHEMA/AUDIO_EFFECTS_LOAD_SCHEMA), just given their own scroll/
        // highlight anchor in the tree.
        children: [
          { id: 'settings.quality.robotLoad', loreLabel: 'Fleet Size', humanLabel: 'Voice Limit' },
          { id: 'settings.quality.effectsLoad', loreLabel: 'Trace Budget', humanLabel: 'Effects Limit' },
        ],
      },
      {
        // Matches SectorSettingsDrawer.tsx's own getTraitColorStyle('seed') call.
        id: 'settings.sectorSettings',
        loreLabel: 'Foundry',
        humanLabel: 'Seeds',
        trait: 'seed',
        // Attenuation Style/Coordinates — already-existing labeled rows inside
        // SectorSettingsDrawer.tsx (ATTENUATION_STYLE_SCHEMA/COORDS_SCHEMA), same treatment.
        children: [
          { id: 'settings.sectorSettings.attenuationStyle', loreLabel: 'Attenuation Style', humanLabel: 'Atmosphere' },
          { id: 'settings.sectorSettings.coordinates', loreLabel: 'Atlas Vector', humanLabel: 'Location' },
        ],
      },
      {
        // Session Storage (Roadmap Phase 20, docs/tasks/SESSION_STORAGE.md Task 10) — last, not
        // between the two audio-tuning leaves above: unrelated to either one. No subsections.
        id: 'settings.sessions',
        loreLabel: 'Comms',
        humanLabel: 'Save & Share',
        trait: 'seed',
      },
    ],
  },
];
