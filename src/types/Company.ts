/**
 * Company — a seeded, named group of robots (Roadmap Phase 10). Lets every editable Robot
 * Options field be broadcast across a group of robots at once, without becoming a live source
 * of truth any member robot re-reads from later. See docs/specs/COMPANIES.md.
 */
import type { Robot, ADSREnvelope } from './Robot';
import type { OscillatorLayer } from './layeredAudio';
import type { RobotLfoTargetId, LfoSettings } from './lfo';

/**
 * Every field is optional — an untouched field falls back to the company's first member's live
 * current value (see src/systems/companyOptions.ts's resolveCompanyOptions). Never fully
 * populated on creation; grows one field at a time as the company is actually edited, so a
 * company that's never been edited yet has an empty snapshot, not a stale clone.
 */
export interface CompanyOptionsSnapshot {
  audioMode?: Robot['audioMode'];
  masterVolume?: number;
  rhythmicDensity?: number;
  rhythmicMotifLength?: { active: boolean; value: number };
  noteVariance?: { active: boolean; value: number };
  pitchRepeat?: number;
  octaveRange?: [number, number];
  adsr?: ADSREnvelope;
  layers?: OscillatorLayer[];
  lfoSettings?: Partial<Record<RobotLfoTargetId, LfoSettings>>;
  clickTrackActive?: boolean;
}

export interface Company {
  id: string;
  name: string;
  /** Seeded UI-chrome identity color (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.2) — a single
   *  hex, same shape as Robot.identityColor, not a TRAIT_COLORS-style [a, b] pair. Set at creation
   *  time by every real construction path (spawnSystem.ts's seeded generateCompanyIdentityColor,
   *  CompanyCrudControls.tsx's Math.random()-fed pickRandomCompanyColor) — required, not optional,
   *  since neither path ever omits it. */
  color: string;
  robotIds: string[];
  lastEditedOptions?: CompanyOptionsSnapshot;
}
