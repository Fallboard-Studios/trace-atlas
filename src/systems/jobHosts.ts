// ========================================
// IMPORTS
// ========================================
import { ActorType, type Actor, type SceneryKind } from '../types/Actor';
import { JobType } from '../types/Robot';
import { selectVariantFromSeed, type FactoryVariant } from '../components/actors/factoryVariants';
import { getRecipeRow, DEFAULT_FACTORY_ROW } from './factoryPlacementSystem';

// ========================================
// CONSTANTS
// ========================================
const {
  VentExtraction,
  AcousticSurvey,
  StructuralInspection,
  FluidMonitoring,
  Salvage,
  Maintenance,
} = JobType;

/** The jobs each factory variant hosts (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.3). */
export const FACTORY_HOST_JOBS: Readonly<Record<FactoryVariant, readonly JobType[]>> = {
  Monolith: [StructuralInspection],
  Stacks: [VentExtraction],
  Refinery: [VentExtraction, FluidMonitoring],
  Skyscraper: [AcousticSurvey, StructuralInspection],
  Warehouse: [Salvage],
};

/** The jobs each scenery kind hosts (spec §1.3). Wall, boulder and tether host nothing. */
export const SCENERY_HOST_JOBS: Readonly<Record<SceneryKind, readonly JobType[]>> = {
  tank: [VentExtraction, FluidMonitoring],
  crane: [StructuralInspection, Maintenance],
  pylon: [AcousticSurvey, Maintenance],
  beacon: [AcousticSurvey, Maintenance],
  pipeline: [FluidMonitoring],
  dome: [StructuralInspection, FluidMonitoring, Maintenance],
  wreck: [StructuralInspection, Salvage],
  turbine: [Maintenance],
  vent: [VentExtraction],
  containers: [Salvage],
  scaffold: [StructuralInspection],
  floodlight: [Maintenance],
  dish: [AcousticSurvey],
  wall: [],
  boulder: [],
  tether: [],
};

/** A derelict host's jobs, replacing its normal row (spec Assumption 8: a dead tank doesn't vent). */
const DERELICT_HOST_JOBS: readonly JobType[] = [Salvage, StructuralInspection];

// ========================================
// HELPERS
// ========================================

/** The actor's recipe row, resolved the same way Factory.tsx and factoryBubbleProps.ts do. */
function recipeRowOf(actor: Actor) {
  const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
  const district = actor.config?.district ?? 'dense';
  return { row, rowCfg: getRecipeRow(district, row) };
}

/** The table row for the actor's own kind — the variant the renderer draws, for a factory. */
function normalJobs(actor: Actor): readonly JobType[] {
  if (actor.type === ActorType.SCENERY) {
    const kind = actor.config?.kind;
    return kind ? SCENERY_HOST_JOBS[kind] : [];
  }
  const { row, rowCfg } = recipeRowOf(actor);
  const { variant } = selectVariantFromSeed(actor.id, actor.position.x, row, rowCfg?.variants);
  return FACTORY_HOST_JOBS[variant];
}

// ========================================
// API
// ========================================

/**
 * The jobs this actor hosts; empty means "not a host". An actor in an `offscreen` row hosts
 * nothing; a derelict host hosts [salvage, structuralInspection] instead of its normal row (a
 * derelict non-host stays a non-host). Returns a fresh array.
 */
export function hostJobs(actor: Actor): JobType[] {
  if (recipeRowOf(actor).rowCfg?.anchor === 'offscreen') return [];
  const jobs = normalJobs(actor);
  if (jobs.length === 0) return [];
  return [...(actor.config?.derelict ? DERELICT_HOST_JOBS : jobs)];
}

/**
 * Whether the actor can be a work site right now: it hosts something, and it isn't background
 * unless `backHosts` (BACK_HOSTS_ENABLED, spec Assumption 7). An unresolvable row counts as
 * foreground, matching Factory.tsx's render fallback.
 */
export function isWorkSiteEligible(actor: Actor, { backHosts }: { backHosts: boolean }): boolean {
  if (hostJobs(actor).length === 0) return false;
  const depth = recipeRowOf(actor).rowCfg?.depth ?? 'foreground';
  return backHosts || depth !== 'background';
}
