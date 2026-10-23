/**
 * The 8 app-wide color traits (Roadmap Phase 14 — see docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md;
 * `colour` added by Roadmap 50.3, docs/specs/GLOBAL_COLOUR.md assumption 9).
 * Every accordion/drawer/control in the app belongs to exactly one of these; each trait's own
 * 2-color pair lives in src/utils/traitColors.ts, kept as a separate module so this file stays a
 * pure type/id definition, following src/types/lfo.ts's own LFO_SHAPES/ROBOT_LFO_TARGET_IDS split.
 */
export type Trait = 'spectral' | 'timeSpace' | 'output' | 'composition' | 'company' | 'seed' | 'header' | 'colour';

/**
 * Every Trait discriminant, paired with the union per the pattern src/types/controls.ts's
 * CONTROL_SCHEMA_TYPES established — makes "all 7 variants covered, no duplicates" a
 * runtime-testable assertion (src/types/traits.test.ts) rather than something only the compiler
 * can catch.
 */
export const TRAIT_IDS: readonly Trait[] = ['spectral', 'timeSpace', 'output', 'composition', 'company', 'seed', 'header', 'colour'];
