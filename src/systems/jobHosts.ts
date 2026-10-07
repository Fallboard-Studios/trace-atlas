// ========================================
// IMPORTS
// ========================================
import { ActorType, type Actor, type SceneryKind } from '../types/Actor';
import { JobType } from '../types/Robot';
import type { FactoryVariant } from '../components/actors/factoryVariants';
import { factoryGeometry } from '../components/actors/factoryGeometry';
import { sceneryWorkAnchors } from '../components/actors/scenery/sceneryWorkAnchors';
import { getRecipeRow, DEFAULT_FACTORY_ROW } from './factoryPlacementSystem';
import { WORLD_WIDTH } from '../constants';

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
  return getRecipeRow(actor.config?.district ?? 'dense', actor.config?.row ?? DEFAULT_FACTORY_ROW);
}

/**
 * The drawn body's horizontal extent: the factory's box, or the scenery silhouette's bounds
 * (null for a kind without anchors — none of those host anyway).
 */
function drawnSpan(actor: Actor): { x0: number; x1: number } | null {
  if (actor.type === ActorType.SCENERY) {
    return sceneryWorkAnchors(actor, { foreground: false, rand: () => 0.5 })?.bounds ?? null;
  }
  return factoryGeometry(actor).box;
}

/** Whether none of the drawn body is inside the world's width — off screen means no job. */
function isOffScreen(actor: Actor): boolean {
  const span = drawnSpan(actor);
  return span !== null && (span.x1 <= 0 || span.x0 >= WORLD_WIDTH);
}

/** The table row for the actor's own kind — the variant the renderer draws, for a factory. */
function normalJobs(actor: Actor): readonly JobType[] {
  if (actor.type === ActorType.SCENERY) {
    const kind = actor.config?.kind;
    return kind ? SCENERY_HOST_JOBS[kind] : [];
  }
  return FACTORY_HOST_JOBS[factoryGeometry(actor).variant];
}

// ========================================
// API
// ========================================

/**
 * The jobs this actor hosts; empty means "not a host". Off screen means no job: an actor in an
 * `offscreen` row, or one whose drawn body lies wholly outside the world's width (a body that
 * straddles an edge still hosts), hosts nothing. A derelict host hosts [salvage,
 * structuralInspection] instead of its normal row (a derelict non-host stays a non-host).
 * Returns a fresh array.
 */
export function hostJobs(actor: Actor): JobType[] {
  if (recipeRowOf(actor)?.anchor === 'offscreen') return [];
  const jobs = normalJobs(actor);
  if (jobs.length === 0) return [];
  if (isOffScreen(actor)) return [];
  return [...(actor.config?.derelict ? DERELICT_HOST_JOBS : jobs)];
}

/**
 * Whether the actor can be a work site right now: it hosts something, and it isn't background
 * unless `backHosts` (BACK_HOSTS_ENABLED, spec Assumption 7). An unresolvable row counts as
 * foreground, matching Factory.tsx's render fallback.
 */
export function isWorkSiteEligible(actor: Actor, options: { backHosts: boolean }): boolean {
  return eligibleHostJobs(actor, options).length > 0;
}

/**
 * hostJobs(actor) when the actor is a work site right now (isWorkSiteEligible), else []. One
 * hostJobs derivation, so a caller that needs both the answer and the jobs pays for one.
 */
export function eligibleHostJobs(actor: Actor, { backHosts }: { backHosts: boolean }): JobType[] {
  const depth = recipeRowOf(actor)?.depth ?? 'foreground';
  if (!backHosts && depth === 'background') return [];
  return hostJobs(actor);
}
