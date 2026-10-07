// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';

import { chooseNextSite, siteCooldown, heldJobs, type SiteChoiceInput, type HeldJobsRobot } from './siteChoice';
import { DockingState, JobType, type RobotActivity } from '../types/Robot';
import { COOLDOWN_PER_SITE, COOLDOWN_MIN, COOLDOWN_MAX } from '../constants';

// ========================================
// HELPERS
// ========================================
const { VentExtraction, AcousticSurvey, StructuralInspection, FluidMonitoring, Salvage, Maintenance } = JobType;

type Site = SiteChoiceInput['sites'][number];

const site = (id: string, x: number, jobs: JobType[], ready = true): Site => ({ id, jobs, park: { x, y: 400 }, ready });

const robotAt = (x: number, job?: JobType): SiteChoiceInput['robot'] => ({ id: 'me', job, centre: { x, y: 400 } });

const choose = (overrides: Partial<SiteChoiceInput>) =>
  chooseNextSite({ robot: robotAt(0), sites: [], heldJobs: new Set(), rand: () => 0, ...overrides });

/** A rand that must never be called — the keep-the-job path is not random. */
const noRand = () => {
  throw new Error('rand called');
};

const other = (id: string, job: JobType | undefined, activity: RobotActivity | undefined, docking: DockingState = DockingState.Active): HeldJobsRobot => ({
  id,
  job,
  activity,
  docking,
});

// ========================================
// TESTS
// ========================================

describe('siteChoice (Phase 43 Task 14, spec §1.7)', () => {
  describe('chooseNextSite', () => {
    it('null when there are no sites', () => {
      expect(choose({ sites: [] })).toBeNull();
    });

    it('null when no site is ready', () => {
      expect(choose({ sites: [site('a', 100, [Salvage], false), site('b', 200, [Maintenance], false)] })).toBeNull();
    });

    describe('keep the job', () => {
      it('keeps the robot\'s job at the nearest ready site that hosts it, without drawing', () => {
        const sites = [site('far', 1500, [Salvage]), site('near', 300, [Salvage]), site('nearest-other', 110, [Maintenance])];
        expect(choose({ robot: robotAt(100, Salvage), sites, rand: noRand })).toEqual({ siteId: 'near', job: Salvage });
      });

      it('keeps the job even when another robot holds it (the variety rule only applies to a switch)', () => {
        const sites = [site('a', 300, [Salvage]), site('b', 600, [Maintenance])];
        expect(choose({ robot: robotAt(100, Salvage), sites, heldJobs: new Set([Salvage]), rand: noRand })).toEqual({ siteId: 'a', job: Salvage });
      });

      it('a multi-job site counts as hosting each of its jobs', () => {
        const sites = [site('dome', 300, [StructuralInspection, FluidMonitoring, Maintenance])];
        expect(choose({ robot: robotAt(100, FluidMonitoring), sites, rand: noRand })).toEqual({ siteId: 'dome', job: FluidMonitoring });
      });

      it('ignores a non-ready site that hosts the job, even a nearer one', () => {
        const sites = [site('near-busy', 120, [Salvage], false), site('far-ready', 900, [Salvage])];
        expect(choose({ robot: robotAt(100, Salvage), sites, rand: noRand })).toEqual({ siteId: 'far-ready', job: Salvage });
      });

      it('uses distance in both axes, not just x', () => {
        const sites: Site[] = [
          { id: 'below', jobs: [Salvage], park: { x: 100, y: 900 }, ready: true },
          { id: 'beside', jobs: [Salvage], park: { x: 400, y: 400 }, ready: true },
        ];
        expect(choose({ robot: robotAt(100, Salvage), sites, rand: noRand })?.siteId).toBe('beside');
      });

      it('an equal-distance tie goes to the earlier site', () => {
        const sites = [site('left', 0, [Salvage]), site('right', 200, [Salvage])];
        expect(choose({ robot: robotAt(100, Salvage), sites, rand: noRand })?.siteId).toBe('left');
      });
    });

    describe('switch the job', () => {
      it('switches when no ready site hosts the robot\'s job, to the nearest site of the new job', () => {
        const sites = [site('salvage-busy', 100, [Salvage], false), site('m-far', 1500, [Maintenance]), site('m-near', 500, [Maintenance])];
        expect(choose({ robot: robotAt(100, Salvage), sites })).toEqual({ siteId: 'm-near', job: Maintenance });
      });

      it('a robot with no job yet picks one', () => {
        expect(choose({ robot: robotAt(100), sites: [site('a', 300, [Maintenance])] })).toEqual({ siteId: 'a', job: Maintenance });
      });

      it('prefers a job no other robot holds, whatever the draw', () => {
        // Maintenance has 5 ready sites and is held; Salvage has one and isn't — Salvage always wins.
        const sites = [...Array.from({ length: 5 }, (_, i) => site(`m${i}`, 200 + i, [Maintenance])), site('s', 1800, [Salvage])];
        for (const r of [0, 0.5, 0.999]) {
          expect(choose({ robot: robotAt(100), sites, heldJobs: new Set([Maintenance]), rand: () => r })).toEqual({ siteId: 's', job: Salvage });
        }
      });

      it('falls back to held jobs when every ready job is held', () => {
        const sites = [site('a', 300, [Maintenance]), site('b', 600, [Salvage])];
        const result = choose({ robot: robotAt(100), sites, heldJobs: new Set([Maintenance, Salvage]), rand: () => 0.99 });
        expect(result).not.toBeNull();
        expect([Maintenance, Salvage]).toContain(result!.job);
      });

      it('held jobs with no ready site do not count toward "every job is held"', () => {
        // Vent is held but has no ready site; Salvage is the only ready job and isn't held.
        const sites = [site('v', 300, [VentExtraction], false), site('s', 900, [Salvage])];
        expect(choose({ robot: robotAt(100), sites, heldJobs: new Set([VentExtraction]), rand: () => 0.99 })).toEqual({ siteId: 's', job: Salvage });
      });

      it('weights the pick by ready-site count: 3 vs 1 → ¾ vs ¼ over 10 000 seeded draws (within 2 %)', () => {
        const sites = [site('a1', 200, [AcousticSurvey]), site('a2', 400, [AcousticSurvey]), site('a3', 600, [AcousticSurvey]), site('f1', 800, [FluidMonitoring])];
        const rand = alea('siteChoice.weights');
        let acoustic = 0;
        const N = 10_000;
        for (let i = 0; i < N; i++) if (choose({ robot: robotAt(0), sites, rand })!.job === AcousticSurvey) acoustic++;
        expect(Math.abs(acoustic / N - 0.75)).toBeLessThan(0.02);
      });

      it('a multi-job site adds one to each of its jobs\' weights', () => {
        // Dome hosts 3 jobs; plus one more maintenance site: weights SI 1, FM 1, M 2 → ¼, ¼, ½.
        const sites = [site('dome', 200, [StructuralInspection, FluidMonitoring, Maintenance]), site('pylon', 900, [Maintenance])];
        const rand = alea('siteChoice.multi');
        const tally: Partial<Record<JobType, number>> = {};
        const N = 10_000;
        for (let i = 0; i < N; i++) {
          const j = choose({ robot: robotAt(0), sites, rand })!.job;
          tally[j] = (tally[j] ?? 0) + 1;
        }
        expect(Math.abs(tally[StructuralInspection]! / N - 0.25)).toBeLessThan(0.02);
        expect(Math.abs(tally[FluidMonitoring]! / N - 0.25)).toBeLessThan(0.02);
        expect(Math.abs(tally[Maintenance]! / N - 0.5)).toBeLessThan(0.02);
      });

      it('weighting counts only the unheld candidates', () => {
        // Held Maintenance has 10 sites; unheld Salvage 1 and Vent 3 → Salvage ¼, Vent ¾.
        const sites = [
          ...Array.from({ length: 10 }, (_, i) => site(`m${i}`, i, [Maintenance])),
          site('s', 500, [Salvage]),
          ...Array.from({ length: 3 }, (_, i) => site(`v${i}`, 900 + i, [VentExtraction])),
        ];
        const rand = alea('siteChoice.unheld');
        let salvage = 0;
        const N = 10_000;
        for (let i = 0; i < N; i++) {
          const j = choose({ robot: robotAt(0), sites, heldJobs: new Set([Maintenance]), rand })!.job;
          expect(j).not.toBe(Maintenance);
          if (j === Salvage) salvage++;
        }
        expect(Math.abs(salvage / N - 0.25)).toBeLessThan(0.02);
      });

      it('rand at both ends of [0, 1) picks the first and the last candidate', () => {
        const sites = [site('a', 200, [AcousticSurvey]), site('f', 800, [FluidMonitoring])];
        expect(choose({ robot: robotAt(0), sites, rand: () => 0 })!.job).toBe(AcousticSurvey);
        expect(choose({ robot: robotAt(0), sites, rand: () => 0.9999999 })!.job).toBe(FluidMonitoring);
      });

      it('deterministic for the same rand stream', () => {
        const sites = [site('a', 200, [AcousticSurvey]), site('f', 800, [FluidMonitoring]), site('s', 500, [Salvage])];
        const run = () => {
          const rand = alea('det');
          return Array.from({ length: 50 }, () => choose({ robot: robotAt(0), sites, rand })!.job);
        };
        expect(run()).toEqual(run());
      });

      it('draws exactly once per switch', () => {
        let calls = 0;
        const rand = () => {
          calls++;
          return 0.3;
        };
        choose({ robot: robotAt(0), sites: [site('a', 200, [AcousticSurvey]), site('f', 800, [FluidMonitoring])], rand });
        expect(calls).toBe(1);
      });

      it('does not mutate its inputs', () => {
        const sites = [site('a', 200, [AcousticSurvey]), site('f', 800, [FluidMonitoring])];
        const held = new Set<JobType>([AcousticSurvey]);
        const before = structuredClone({ sites, held: [...held] });
        choose({ robot: robotAt(0), sites, heldJobs: held });
        expect({ sites, held: [...held] }).toEqual(before);
      });
    });
  });

  describe('siteCooldown', () => {
    it('pins the first-guess constants (the readiness sim, Task 15, sets the real ones)', () => {
      expect([COOLDOWN_PER_SITE, COOLDOWN_MIN, COOLDOWN_MAX]).toEqual([0.6, 4, 30]);
    });

    it('is n × COOLDOWN_PER_SITE between the clamps', () => {
      expect(siteCooldown(10)).toBeCloseTo(6);
      expect(siteCooldown(20)).toBeCloseTo(12);
    });

    it('clamps at the low end: few sites, short rest', () => {
      expect(siteCooldown(0)).toBe(COOLDOWN_MIN);
      expect(siteCooldown(1)).toBe(COOLDOWN_MIN);
      expect(siteCooldown(-5)).toBe(COOLDOWN_MIN);
    });

    it('clamps at the high end: many sites, long rest', () => {
      expect(siteCooldown(50)).toBe(COOLDOWN_MAX);
      expect(siteCooldown(1000)).toBe(COOLDOWN_MAX);
    });

    it('is exact at both knees', () => {
      expect(siteCooldown(COOLDOWN_MIN / COOLDOWN_PER_SITE)).toBeCloseTo(COOLDOWN_MIN);
      expect(siteCooldown(COOLDOWN_MAX / COOLDOWN_PER_SITE)).toBeCloseTo(COOLDOWN_MAX);
    });
  });

  describe('heldJobs (plan correction 4)', () => {
    it('collects the jobs of other Active robots that are exiting, in transit, working or waiting', () => {
      const robots = [
        other('a', Salvage, 'exiting'),
        other('b', Maintenance, 'transit'),
        other('c', VentExtraction, 'working'),
        other('d', AcousticSurvey, 'waiting'),
      ];
      expect(heldJobs(robots, 'me')).toEqual(new Set([Salvage, Maintenance, VentExtraction, AcousticSurvey]));
    });

    it('ignores charging, returning and entering robots — their job is stale', () => {
      const robots = [other('a', Salvage, 'charging'), other('b', Maintenance, 'returning'), other('c', VentExtraction, 'entering')];
      expect(heldJobs(robots, 'me')).toEqual(new Set());
    });

    it('ignores the robot itself', () => {
      expect(heldJobs([other('me', Salvage, 'working'), other('b', Maintenance, 'working')], 'me')).toEqual(new Set([Maintenance]));
    });

    it('ignores robots that are not Active, whatever their activity says', () => {
      const robots = [
        other('a', Salvage, 'working', DockingState.Recalled),
        other('b', Maintenance, 'transit', DockingState.Docked),
        other('c', VentExtraction, 'exiting', DockingState.Undocking),
      ];
      expect(heldJobs(robots, 'me')).toEqual(new Set());
    });

    it('ignores a robot with no job, or no activity yet', () => {
      expect(heldJobs([other('a', undefined, 'working'), other('b', Salvage, undefined)], 'me')).toEqual(new Set());
    });

    it('a job held by two robots appears once; no robots → empty', () => {
      expect(heldJobs([other('a', Salvage, 'working'), other('b', Salvage, 'transit')], 'me')).toEqual(new Set([Salvage]));
      expect(heldJobs([], 'me')).toEqual(new Set());
    });
  });
});
