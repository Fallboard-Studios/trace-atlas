// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  hostJobs,
  isWorkSiteEligible,
  FACTORY_HOST_JOBS,
  SCENERY_HOST_JOBS,
} from './jobHosts';
import { RECIPES, type DistrictRow } from './districtRecipes';
import { selectVariantFromSeed, type FactoryVariant } from '../components/actors/factoryVariants';
import { ActorType, type Actor, type DistrictName, type SceneryKind } from '../types/Actor';
import { JobType } from '../types/Robot';
import { BACK_HOSTS_ENABLED } from '../constants';

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

// Records, not arrays: the type checker fails this file if a variant or kind is added to the
// unions and left out here, so the tables below stay exhaustive.
const VARIANT_SET: Record<FactoryVariant, true> = {
  Monolith: true,
  Stacks: true,
  Refinery: true,
  Skyscraper: true,
  Warehouse: true,
};
const KIND_SET: Record<SceneryKind, true> = {
  tank: true,
  crane: true,
  pylon: true,
  wall: true,
  beacon: true,
  pipeline: true,
  dome: true,
  wreck: true,
  turbine: true,
  boulder: true,
  vent: true,
  containers: true,
  scaffold: true,
  tether: true,
  floodlight: true,
  dish: true,
};
const ALL_VARIANTS = Object.keys(VARIANT_SET) as FactoryVariant[];
const ALL_KINDS = Object.keys(KIND_SET) as SceneryKind[];

/** Spec §1.3, row for row. */
const FACTORY_TABLE: Record<FactoryVariant, JobType[]> = {
  Monolith: [StructuralInspection],
  Stacks: [VentExtraction],
  Refinery: [VentExtraction, FluidMonitoring],
  Skyscraper: [AcousticSurvey, StructuralInspection],
  Warehouse: [Salvage],
};
const SCENERY_TABLE: Record<SceneryKind, JobType[]> = {
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

type Depth = DistrictRow['depth'];
type Anchor = DistrictRow['anchor'];

// ========================================
// HELPERS
// ========================================
interface RowRef {
  district: DistrictName;
  row: number;
  cfg: DistrictRow;
}

function allRows(): RowRef[] {
  const out: RowRef[] = [];
  for (const district of Object.keys(RECIPES) as DistrictName[]) {
    RECIPES[district].forEach((cfg, row) => out.push({ district, row, cfg }));
  }
  return out;
}

function findRow(pred: (cfg: DistrictRow) => boolean): RowRef {
  const ref = allRows().find((r) => pred(r.cfg));
  if (!ref) throw new Error('no recipe row matches');
  return ref;
}

/** A real scenery actor of `kind` in a recipe row with the given depth/anchor, built from the
 * recipe tables rather than a hand-picked index. Falls back to any row when none has that kind at
 * that depth — the row only matters for depth/anchor, so a kind-agnostic row is fine there. */
function sceneryActor(
  kind: SceneryKind,
  opts: { depth?: Depth; anchor?: Anchor; derelict?: boolean } = {},
): Actor {
  const matchesPlace = (cfg: DistrictRow) =>
    (opts.depth === undefined || cfg.depth === opts.depth) &&
    (opts.anchor === undefined ? cfg.anchor !== 'offscreen' : cfg.anchor === opts.anchor);
  const ref =
    allRows().find((r) => r.cfg.kind === kind && matchesPlace(r.cfg)) ??
    findRow(matchesPlace);
  return {
    id: `scenery-${kind}`,
    type: ActorType.SCENERY,
    position: { x: 400, y: 1000 },
    isActive: true,
    config: {
      kind,
      district: ref.district,
      row: ref.row,
      ...(opts.derelict ? { derelict: true as const } : {}),
    },
  };
}

/** A factory actor that the renderer would draw as `variant`, in a row with the given anchor/depth. */
function factoryActor(
  variant: FactoryVariant,
  opts: { depth?: Depth; anchor?: Anchor; derelict?: boolean } = {},
): Actor {
  const rows = allRows().filter(
    (r) =>
      r.cfg.kind === 'factory' &&
      r.cfg.variants?.includes(variant) &&
      (opts.depth === undefined || r.cfg.depth === opts.depth) &&
      (opts.anchor === undefined ? r.cfg.anchor !== 'offscreen' : r.cfg.anchor === opts.anchor),
  );
  for (const ref of rows) {
    for (let i = 0; i < 200; i++) {
      const id = `factory-${variant}-${i}`;
      const x = i * 37;
      if (selectVariantFromSeed(id, x, ref.row, ref.cfg.variants).variant !== variant) continue;
      return {
        id,
        type: ActorType.FACTORY,
        position: { x, y: 1000 },
        isActive: true,
        config: {
          district: ref.district,
          row: ref.row,
          ...(opts.derelict ? { derelict: true as const } : {}),
        },
      };
    }
  }
  throw new Error(`no ${variant} factory found for ${JSON.stringify(opts)}`);
}

// ========================================
// TESTS
// ========================================
describe('jobHosts — the host tables (spec §1.3)', () => {
  it('FACTORY_HOST_JOBS matches the spec row for every variant', () => {
    expect(Object.keys(FACTORY_HOST_JOBS).sort()).toEqual([...ALL_VARIANTS].sort());
    for (const variant of ALL_VARIANTS) {
      expect(FACTORY_HOST_JOBS[variant], variant).toEqual(FACTORY_TABLE[variant]);
    }
  });

  it('SCENERY_HOST_JOBS matches the spec row for every kind', () => {
    expect(Object.keys(SCENERY_HOST_JOBS).sort()).toEqual([...ALL_KINDS].sort());
    for (const kind of ALL_KINDS) {
      expect(SCENERY_HOST_JOBS[kind], kind).toEqual(SCENERY_TABLE[kind]);
    }
  });

  it('every job type is hosted by at least one factory variant or scenery kind', () => {
    const hosted = new Set([
      ...Object.values(FACTORY_HOST_JOBS).flat(),
      ...Object.values(SCENERY_HOST_JOBS).flat(),
    ]);
    expect([...hosted].sort()).toEqual(Object.values(JobType).sort());
  });

  it('no host lists a job twice', () => {
    for (const jobs of [...Object.values(FACTORY_HOST_JOBS), ...Object.values(SCENERY_HOST_JOBS)]) {
      expect(new Set(jobs).size).toBe(jobs.length);
    }
  });
});

describe('hostJobs', () => {
  it.each(ALL_VARIANTS)('an on-screen %s factory hosts its variant row', (variant) => {
    expect(hostJobs(factoryActor(variant))).toEqual(FACTORY_TABLE[variant]);
  });

  it.each(ALL_KINDS)('an on-screen %s hosts its kind row', (kind) => {
    expect(hostJobs(sceneryActor(kind))).toEqual(SCENERY_TABLE[kind]);
  });

  it('a derelict tank hosts [salvage, structuralInspection]', () => {
    expect(hostJobs(sceneryActor('tank', { derelict: true }))).toEqual([Salvage, StructuralInspection]);
  });

  it('a derelict factory hosts [salvage, structuralInspection], not its variant row', () => {
    expect(hostJobs(factoryActor('Refinery', { derelict: true }))).toEqual([
      Salvage,
      StructuralInspection,
    ]);
  });

  it('a derelict non-host (wall) still hosts nothing', () => {
    expect(hostJobs(sceneryActor('wall', { derelict: true }))).toEqual([]);
  });

  it('an offscreen Warehouse hosts nothing', () => {
    expect(hostJobs(factoryActor('Warehouse', { anchor: 'offscreen' }))).toEqual([]);
  });

  it('an offscreen derelict hosts nothing (offscreen beats derelict)', () => {
    expect(hostJobs(factoryActor('Refinery', { anchor: 'offscreen', derelict: true }))).toEqual([]);
  });

  it('a scenery actor with no kind hosts nothing', () => {
    const actor = sceneryActor('tank');
    delete actor.config!.kind;
    expect(hostJobs(actor)).toEqual([]);
  });

  it('returns a fresh array each call (callers may not mutate the table)', () => {
    const actor = sceneryActor('dome');
    const jobs = hostJobs(actor);
    jobs.push(Salvage);
    expect(hostJobs(actor)).toEqual(SCENERY_TABLE.dome);
  });

  it('every placed recipe row resolves without throwing', () => {
    for (const { district, row, cfg } of allRows()) {
      const actor: Actor =
        cfg.kind === 'factory'
          ? { id: `f-${district}-${row}`, type: ActorType.FACTORY, position: { x: 100, y: 1000 }, isActive: true, config: { district, row } }
          : { id: `s-${district}-${row}`, type: ActorType.SCENERY, position: { x: 100, y: 1000 }, isActive: true, config: { district, row, kind: cfg.kind } };
      const jobs = hostJobs(actor);
      if (cfg.anchor === 'offscreen') expect(jobs).toEqual([]);
    }
  });
});

describe('isWorkSiteEligible — the depth filter (spec Assumption 7)', () => {
  it('BACK_HOSTS_ENABLED ships false until J4', () => {
    expect(BACK_HOSTS_ENABLED).toBe(false);
  });

  it('a background Skyscraper is ineligible with backHosts: false', () => {
    expect(isWorkSiteEligible(factoryActor('Skyscraper', { depth: 'background' }), { backHosts: false })).toBe(false);
  });

  it('a background Skyscraper is eligible with backHosts: true', () => {
    expect(isWorkSiteEligible(factoryActor('Skyscraper', { depth: 'background' }), { backHosts: true })).toBe(true);
  });

  it.each(['midground', 'foreground'] as const)('a %s host is eligible either way', (depth) => {
    const actor = sceneryActor('tank', { depth });
    expect(actor.config?.row).toBeDefined();
    expect(RECIPES[actor.config!.district!][actor.config!.row!].depth).toBe(depth);
    expect(isWorkSiteEligible(actor, { backHosts: false })).toBe(true);
    expect(isWorkSiteEligible(actor, { backHosts: true })).toBe(true);
  });

  it('a non-host is never eligible, at any depth', () => {
    expect(isWorkSiteEligible(sceneryActor('wall', { depth: 'foreground' }), { backHosts: true })).toBe(false);
    expect(isWorkSiteEligible(sceneryActor('boulder', { depth: 'background' }), { backHosts: true })).toBe(false);
  });

  it('an offscreen host row is never eligible', () => {
    expect(isWorkSiteEligible(factoryActor('Warehouse', { anchor: 'offscreen' }), { backHosts: true })).toBe(false);
  });
});
