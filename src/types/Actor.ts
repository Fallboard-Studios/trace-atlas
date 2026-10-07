export const ActorType = {
  FACTORY: 'FACTORY',
  SCENERY: 'SCENERY',
} as const;
export type ActorType = typeof ActorType[keyof typeof ActorType];

/**
 * The sixteen static scenery families (roadmap Phase 42, D2). Pipe bridges
 * are a derived render, not an actor, so they are not a kind here.
 * See docs/specs/WORLD_VIEW_DISTRICTS.md §1.8.
 */
export type SceneryKind =
  | 'tank'
  | 'crane'
  | 'pylon'
  | 'wall'
  | 'beacon'
  | 'pipeline'
  | 'dome'
  | 'wreck'
  | 'turbine'
  | 'boulder'
  | 'vent'
  | 'containers'
  | 'scaffold'
  | 'tether'
  | 'floodlight'
  | 'dish';

/**
 * The nine seeded district recipes a locale is drawn from (roadmap
 * Phase 42, D1), replacing the legacy single fixed row table. See
 * docs/specs/WORLD_VIEW_DISTRICTS.md §1.1-1.2.
 */
export type DistrictName =
  | 'dense'
  | 'outskirts'
  | 'towers'
  | 'yard'
  | 'derelict'
  | 'habitat'
  | 'wreckfield'
  | 'ventfield'
  | 'construction';

/**
 * A placed actor in the world (currently only factories).
 * All fields that drive rendering must be serializable (JSON-compatible).
 * Procedural visuals are re-derived at render time from `id` + `config`;
 * nothing non-serializable (GSAP timelines, synth instances) should be stored here.
 *
 * See docs/BUILDING_DESIGN.md for the full Factory Actor schema.
 */
export interface Actor {
  /** Unique identifier — also used as the seed for all procedural generation. */
  id: string;
  type: ActorType;
  position: { x: number; y: number };
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  isActive: boolean;
  /** Measures remaining until the actor can activate again. */
  cooldownRemaining: number;
  /**
   * Variant-specific spawn-time configuration.  All values are serializable
   * primitives so the world state can be saved/loaded without conversion.
   *
   * Color shift fields (`hueShift`, `satShift`) are generated deterministically
   * from the actor's id seed at spawn time using the variant's `colorRanges`.
   * See `selectVariantFromSeed` in factoryVariants.ts and docs/BUILDING_DESIGN.md.
   */
  config?: {
    robotBlueprint?: string;
    productionInterval?: number;
    /** Index into this actor's district recipe (systems/districtRecipes.ts, via `config.district`); use getRecipeRow(district, row)?.depth for the depth group ('background'/'midground'/'foreground'). */
    row?: number;
    /**
     * Degrees of hue rotation applied to the variant's base body color.
     * Picked deterministically at spawn from the variant's `hueShiftRange`.
     * Passed to `applyColorShift()` in colorUtils.ts at render time.
     */
    hueShift?: number;
    /**
     * Percentage-point saturation delta applied to the variant's base body color.
     * Picked deterministically at spawn from the variant's `satShiftRange`.
     * Passed to `applyColorShift()` in colorUtils.ts at render time.
     */
    satShift?: number;
    /** Rooftop greeble selected at spawn; drives ROOFTOP_RENDERERS lookup. */
    rooftopGreeble?: import('../components/actors/greebles/greebleTypes').RooftopGreeble;
    /** Facade greeble selected at spawn; drives FACADE_RENDERERS lookup. */
    facadeGreeble?: import('../components/actors/greebles/greebleTypes').FacadeGreeble;
    /**
     * Number of decorative horizontal belt courses chosen at spawn time.
     * Uniform random pick from `[0 .. variant.greebleConfig.maxBeltCourses]`.
     * Stored here so the zone-based window layout in Factory.tsx stays
     * deterministic without re-running the PRNG at render time.
     */
    beltCourseCount?: number;
    /** High‑level purpose derived from factory variant. Read-only after spawn. */
    purpose?: import('../components/actors/factoryVariants').FactoryPurpose;
    /** Convenience flag set when a factory has been powered down. */
    isOffline?: boolean;
    /** Measure at which the factory went offline. */
    offlineSince?: number;
    /** Scenery family (ActorType.SCENERY only); drives SCENERY_RENDERERS lookup. */
    kind?: SceneryKind;
    /** The district recipe (districtRecipes.ts) this actor's `row` indexes into. */
    district?: DistrictName;
    /** Set when this actor rolled derelict at placement (districts.ts); see docs/specs/WORLD_VIEW_DISTRICTS.md §1.6. */
    derelict?: true;
  };
}
