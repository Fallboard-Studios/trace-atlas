import type { CSSProperties } from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import {
  PING_CONTOUR_PANEL_SCHEMA,
  ATTACK_SCHEMA,
  DECAY_SCHEMA,
  SUSTAIN_SCHEMA,
  RELEASE_SCHEMA,
  PORTAMENTO_SCHEMA,
  ATTACK_CURVE_SCHEMA,
  RELEASE_CURVE_SCHEMA,
  CHARACTER_PANEL_SCHEMA,
} from '@/data/robotOptionsConfig';
import type { ADSREnvelope, EnvelopeCurveName } from '@/types/Robot';
import type { DirectionalPanelSchema } from '@/types/controls';

import './PingContourDrawer.css';

// Hoisted to module scope (docs/tasks/archive/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 3) — these don't
// depend on any prop/state, so a plain module-level constant is the correct, minimal fix, matching
// this codebase's established "schema is always a stable reference" convention. Contour's two shared rows
// (docs/specs/CONTENT_LAYOUT.md §1.3): side by side on desktop, stacked below it.
const TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.contour.p1.r1', type: 'directionalPanel', orientation: 'responsive' };
const BOTTOM_ROW_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.contour.p1.r2', type: 'directionalPanel', orientation: 'responsive' };

interface EnvelopeContourProps {
  value: ADSREnvelope;
  onChange: (next: ADSREnvelope) => void;
  disabled?: boolean;
  /** Per-field swelling flags, forwarded to each of the 4 sliders' own `swelling` prop. */
  swelling?: Partial<Record<keyof ADSREnvelope, boolean>>;
}

/**
 * Envelope > Contour (docs/specs/CONTENT_LAYOUT.md §1.3): one box under its Contour heading, Attack beside Decay, then
 * Sustain beside Release.
 *
 * Bugfix, found live (docs/todo/backlog.md #27 follow-up, 2026-09-15): these handlers used to be built fresh,
 * unmemoized, on every render — so editing any ONE field changed `adsr`'s own reference, which re-executed this
 * component, which then handed every already-memoized slider a new `onChange` regardless of whether THEIR own value
 * changed, defeating their memo. Each handler needs the CURRENT `adsr` to spread the other fields, but must not itself
 * destabilize when some OTHER field changes: the "stable callback, fresh value read at call time" ref pattern.
 */
export const EnvelopeContourSection = memo(function EnvelopeContourSection({ value: adsr, onChange, disabled, swelling }: EnvelopeContourProps) {
  const latestAdsr = useRef(adsr);
  useEffect(() => {
    latestAdsr.current = adsr;
  });
  const handleAttackChange = useCallback((v: number) => onChange({ ...latestAdsr.current, attack: v }), [onChange]);
  const handleDecayChange = useCallback((v: number) => onChange({ ...latestAdsr.current, decay: v }), [onChange]);
  const handleReleaseChange = useCallback((v: number) => onChange({ ...latestAdsr.current, release: v }), [onChange]);
  // Sustain is displayed 0-100% but stored 0..1 (Robot.ts's ADSREnvelope.sustain) — the one field
  // in this drawer that isn't a 1:1 pass-through between the control and the stored value.
  const handleSustainChange = useCallback((pct: number) => onChange({ ...latestAdsr.current, sustain: pct / 100 }), [onChange]);

  return (
    <DirectionalPanel schema={PING_CONTOUR_PANEL_SCHEMA}>
      <DirectionalPanel schema={TOP_ROW_SCHEMA}>
        <SliderLog schema={ATTACK_SCHEMA} value={adsr.attack} onChange={handleAttackChange} disabled={disabled} swelling={swelling?.attack} />
        <SliderLog schema={DECAY_SCHEMA} value={adsr.decay} onChange={handleDecayChange} disabled={disabled} swelling={swelling?.decay} />
      </DirectionalPanel>
      <DirectionalPanel schema={BOTTOM_ROW_SCHEMA}>
        <SliderLinear schema={SUSTAIN_SCHEMA} value={adsr.sustain * 100} onChange={handleSustainChange} disabled={disabled} swelling={swelling?.sustain} />
        <SliderLog schema={RELEASE_SCHEMA} value={adsr.release} onChange={handleReleaseChange} disabled={disabled} swelling={swelling?.release} />
      </DirectionalPanel>
    </DirectionalPanel>
  );
});

interface EnvelopeCharacterProps {
  /** The whole envelope: a shape pick spreads the fields it does not edit. */
  value: ADSREnvelope;
  onChange: (next: ADSREnvelope) => void;
  /** Glide time between notes, seconds (AudioAttributes.portamento ?? 0). */
  portamento: number;
  onPortamentoChange: (seconds: number) => void;
  disabled?: boolean;
}

/**
 * Envelope > Character (docs/specs/CONTENT_LAYOUT.md §1.3; docs/specs/ROBOT_ARTICULATION.md §1.6): one box with no
 * heading, Portamento, Attack Shape and Release Shape, one per row. The shape radios edit the envelope's curve names
 * through the same latest-value ref as Contour's sliders; the other curve is spread as it is, so one that was never set
 * stays absent (absent is linear), never invented.
 */
export const EnvelopeCharacterSection = memo(function EnvelopeCharacterSection({
  value: adsr, onChange, portamento, onPortamentoChange, disabled,
}: EnvelopeCharacterProps) {
  const latestAdsr = useRef(adsr);
  useEffect(() => {
    latestAdsr.current = adsr;
  });
  const handleAttackCurveChange = useCallback((v: string) => onChange({ ...latestAdsr.current, attackCurve: v as EnvelopeCurveName }), [onChange]);
  const handleReleaseCurveChange = useCallback((v: string) => onChange({ ...latestAdsr.current, releaseCurve: v as EnvelopeCurveName }), [onChange]);

  return (
    <DirectionalPanel schema={CHARACTER_PANEL_SCHEMA}>
      <SliderLog schema={PORTAMENTO_SCHEMA} value={portamento} onChange={onPortamentoChange} disabled={disabled} />
      <RadioButton schema={ATTACK_CURVE_SCHEMA} value={adsr.attackCurve ?? 'linear'} onChange={handleAttackCurveChange} disabled={disabled} />
      <RadioButton schema={RELEASE_CURVE_SCHEMA} value={adsr.releaseCurve ?? 'linear'} onChange={handleReleaseCurveChange} disabled={disabled} />
    </DirectionalPanel>
  );
});

interface PingContourDrawerProps {
  value: ADSREnvelope;
  onChange: (next: ADSREnvelope) => void;
  /** Glide time between notes, seconds (AudioAttributes.portamento ?? 0). Row 3. */
  portamento: number;
  onPortamentoChange: (seconds: number) => void;
  disabled?: boolean;
  /** Optional inline style forwarded to this drawer's own root — trait-color scoping
   *  (getTraitColorStyle('timeSpace'), Roadmap Phase 14), applied identically at both the
   *  RobotOptionsTab and CompanyOptionsSection call sites — this drawer always renders in
   *  Time/Space, whether it's editing one robot or a company's bulk baseline. See
   *  docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md §1.5. */
  style?: CSSProperties;
  /** Per-field swelling flags (audioSwells.ts's isRobotAttributeSwelling for 'adsr.attack' etc.),
   *  forwarded straight to each of the 4 sliders' own `swelling` prop. Omitted fields default to
   *  false (not swelling) — see useEasedControlValue.ts. */
  swelling?: Partial<Record<keyof ADSREnvelope, boolean>>;
}

/**
 * The Envelope tab's two halves, Contour then Character, under the one 'pingContour' id both screens render
 * (docs/tasks/CONTENT_LAYOUT.md Task 15) until Task 16 gives each half its own sub-tab. Purely presentational — no
 * `robot` prop, no store access; the robot screen and CompanyOptionsSection derive `value` and wire `onChange` through
 * robotOptionsActions.applyAdsr themselves, which is what calls AudioEngine.updateVoiceEnvelope (never reReserveVoice,
 * so there's no audio dropout).
 */
function PingContourDrawerInner({ value, onChange, portamento, onPortamentoChange, disabled, style, swelling }: PingContourDrawerProps) {
  return (
    <div className="ping-contour-drawer" style={style}>
      <EnvelopeContourSection value={value} onChange={onChange} disabled={disabled} swelling={swelling} />
      <EnvelopeCharacterSection value={value} onChange={onChange} portamento={portamento} onPortamentoChange={onPortamentoChange} disabled={disabled} />
    </div>
  );
}

// React.memo (docs/tasks/archive/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 3)
export const PingContourDrawer = memo(PingContourDrawerInner);

export default PingContourDrawer;
