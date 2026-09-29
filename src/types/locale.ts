import type { Actor } from './Actor';
import type { Robot } from './Robot';
import type { Company, CompanyOptionsSnapshot } from './Company';

export interface LocaleCoordinates {
  x: number;
  y: number;
}

export interface Locale {
  id: string;
  attenuationStyleId: string;
  name: string;
  coordinates: LocaleCoordinates;
  /** Wall-clock timestamp this locale's in-world day began. Computed once at
   *  build time from the locale's own x coordinate — see
   *  docs/specs/ATTENUATION_STYLE.md §1.1. Moved here from AttenuationStyle. */
  dayStartTimestamp: number;
  /** BeatClock measure this locale's roster was created at (getCurrentMeasure() at build time,
   *  same stamping point as dayStartTimestamp) -- docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md.
   *  Elapsed measures for lifecycle replay purposes is always
   *  `getCurrentMeasure() - createdAtMeasure`, never separately tracked. NOT the same field as
   *  `currentMeasure` below, which is unrelated legacy state never incremented by the real tick
   *  system -- do not conflate the two. */
  createdAtMeasure: number;
  robots: Robot[];
  actors: Actor[];
  companies: Company[];
  currentMeasure: number;
  /** The "All" selection's own edit snapshot (CompanyButtonRow's All button, uiStore's
   *  allRobotsSelected) — same role as Company.lastEditedOptions, but locale-scoped rather than
   *  company-scoped, since "All" has no Company object of its own to store it on. Optional and
   *  absent on a freshly-built locale, same "grows one field at a time as actually edited, never
   *  a stale full clone" shape CompanyOptionsSnapshot already documents. Resets naturally on
   *  retransmit along with everything else on the Locale object — no separate cleanup needed. */
  allRobotsLastEditedOptions?: CompanyOptionsSnapshot;
}

export interface LocaleState {
  locales: Record<string, Locale>;
  addLocale: (attenuationStyleId: string, locale: Locale) => void;
  setLocaleData: (localeId: string, partial: Partial<Locale>) => void;
  removeLocale: (localeId: string) => void;
  getLocaleById: (localeId: string) => Locale | undefined;
  // Robot helpers
  addRobot: (localeId: string, robot: Robot) => void;
  updateRobot: (localeId: string, robotId: string, updates: Partial<Robot>) => void;
  removeRobot: (localeId: string, robotId: string) => void;
  getRobotById: (localeId: string, robotId: string) => Robot | undefined;
  // Company helpers (Roadmap Phase 10) — mirrors the Robot helpers' shape exactly.
  addCompany: (localeId: string, company: Company) => void;
  updateCompany: (localeId: string, companyId: string, updates: Partial<Company>) => void;
  /** Clears companyId on every former member (they become Freelance) before removing the
   *  company itself — mirrors removeLocale's per-robot-cleanup-before-removal shape. */
  removeCompany: (localeId: string, companyId: string) => void;
  getCompanyById: (localeId: string, companyId: string) => Company | undefined;
  getCompanyMembers: (localeId: string, companyId: string) => Robot[];
  /** One atomic transition: moves a robot between companies (or to/from Freelance when
   *  companyId is null), updating the robot's own companyId and both the old and new
   *  company's robotIds together — not composed from separate updateRobot/updateCompany
   *  calls at the call site. */
  assignRobotToCompany: (localeId: string, robotId: string, companyId: string | null) => void;
}
