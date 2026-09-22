import type { CSSProperties } from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import {
  PING_CONTOUR_PANEL_SCHEMA,
  ATTACK_SCHEMA,
  DECAY_SCHEMA,
  SUSTAIN_SCHEMA,
  RELEASE_SCHEMA,
} from '@/data/robotOptionsConfig';
import type { ADSREnvelope } from '@/types/Robot';
import type { DirectionalPanelSchema } from '@/types/controls';

import './PingContourDrawer.css';

// Hoisted to module scope (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 3) — these don't
// depend on any prop/state, so a plain module-level constant is the correct, minimal fix, matching
// this codebase's established "schema is always a stable reference" convention.
const TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.pingContour.topRow', type: 'directionalPanel', orientation: 'responsive' };
const BOTTOM_ROW_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.pingContour.bottomRow', type: 'directionalPanel', orientation: 'responsive' };

interface PingContourDrawerProps {
  value: ADSREnvelope;
  onChange: (next: ADSREnvelope) => void;
  disabled?: boolean;
  /** Optional inline style forwarded to this drawer's own root — trait-color scoping
   *  (getTraitColorStyle('timeSpace'), Roadmap Phase 14), applied identically at both the
   *  RobotOptionsTab and CompanyOptionsSection call sites — this drawer always renders in
   *  Time/Space, whether it's editing one robot or a company's bulk baseline. See
   *  docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5. */
  style?: CSSProperties;
}

/**
 * One Ping Contour DirectionalPanel, editing the robot's single shared ADSR envelope. No
 * AccordionContainer wrapper as of Task 16 (docs/tasks/NAV_LAYOUT_REWRITE.md) — this drawer's
 * content is now a probe's own "Envelope" tree leaf, and the tree node itself carries that label,
 * so there's no accordion header left to show it on ("Ping Contour" is the panel's own internal
 * label, unrelated to the removed accordion's). Purely presentational — no `robot` prop, no store
 * access; both RobotOptionsTab (robot mode) and CompanyOptionsSection (company mode) derive
 * `value` and wire `onChange` through robotOptionsActions.applyAdsr themselves, which is what
 * calls AudioEngine.updateVoiceEnvelope (never reReserveVoice, so there's no audio dropout).
 */
function PingContourDrawerInner({ value: adsr, onChange, disabled, style }: PingContourDrawerProps) {
  // Bugfix, found live (docs/todo/backlog.md #27 follow-up, 2026-09-15): these 4 handlers used to
  // be built fresh, unmemoized, on every render — so editing any ONE field changed `adsr`'s own
  // reference, which re-executed this component (correctly, since its own `value` prop changed),
  // which then handed all 4 already-memoized sliders a new `onChange` regardless of whether THEIR
  // own value changed, defeating their memo and cascading all 4 together. Each handler needs the
  // CURRENT `adsr` to correctly spread the other 3 fields, but must not itself destabilize when
  // some OTHER field changes — the same "stable callback, fresh value read at call time" ref
  // pattern `RobotOptionsTab.tsx`/`Lfo.tsx` already use.
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
    <div className="ping-contour-drawer" style={style}>
      <DirectionalPanel schema={PING_CONTOUR_PANEL_SCHEMA}>
        <DirectionalPanel schema={TOP_ROW_SCHEMA}>
          <SliderLog schema={ATTACK_SCHEMA} value={adsr.attack} onChange={handleAttackChange} disabled={disabled} />
          <SliderLog schema={DECAY_SCHEMA} value={adsr.decay} onChange={handleDecayChange} disabled={disabled} />
        </DirectionalPanel>
        <DirectionalPanel schema={BOTTOM_ROW_SCHEMA}>
          <SliderLinear schema={SUSTAIN_SCHEMA} value={adsr.sustain * 100} onChange={handleSustainChange} disabled={disabled} />
          <SliderLog schema={RELEASE_SCHEMA} value={adsr.release} onChange={handleReleaseChange} disabled={disabled} />
        </DirectionalPanel>
      </DirectionalPanel>
    </div>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 3)
export const PingContourDrawer = memo(PingContourDrawerInner);

export default PingContourDrawer;
