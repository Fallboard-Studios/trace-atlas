import type { CSSProperties } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { LfoLink } from '@/components/ui/controls/LfoLink';
import { DEFAULT_LFO_LINK } from '@/data/lfoConfig';
import {
  SIGNATURE_ARRAY_CONFIG,
  type SignatureArrayLayerBlock,
  type SignatureArrayParamSchema,
} from '@/data/robotOptionsConfig';
import type { WaveformType } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type {
  LfoLinkSchema, LfoLinkValue, RadioButtonSchema, SliderCenteredZeroSchema, SliderLinearSchema,
} from '@/types/controls';
import type { RobotLfoTargetId } from '@/types/lfo';

import './SignatureArrayDrawer.css';

export interface SignatureArrayValue {
  layers: OscillatorLayer[];
  // Partial, not Robot['lfoLinks'] (a full Record) — this component's own lookup below
  // (`value.lfoLinks?.[lfoTarget] ?? DEFAULT_LFO_LINK[lfoTarget]`) already treats it as
  // potentially-partial at runtime, and CompanyOptionsSection's resolved snapshot is genuinely
  // partial (only fields a company has actually been edited for are present). A full Record is
  // still assignable here.
  lfoLinks?: Partial<Record<RobotLfoTargetId, LfoLinkValue>>;
}

interface SignatureArrayDrawerProps {
  value: SignatureArrayValue;
  /** Continuous params (gain, detune, phase, pulseWidth): live, no gap in audio. Gain is also
   *  how Coaxial/Harmonic are muted now (gain: 0) — a live update on the existing voice, not a
   *  rebuild; `filterAudibleLayers` (AudioEngine.ts) only excludes a muted layer from the
   *  composite voice the next time something else triggers a real rebuild (e.g. a Type change). */
  onContinuousChange: (layers: OscillatorLayer[]) => void;
  /** Structural changes (type) — may cause a brief audio gap while the voice rebuilds. */
  onStructuralChange: (layers: OscillatorLayer[]) => void;
  onLfoChange: (target: RobotLfoTargetId, value: LfoLinkValue) => void;
  disabled?: boolean;
  /** Optional inline style forwarded to this drawer's own root — trait-color scoping
   *  (getTraitColorStyle('spectral'), Roadmap Phase 14), applied identically at both the
   *  RobotOptionsTab and CompanyOptionsSection call sites — this drawer always renders in
   *  Spectral, whether it's editing one robot or a company's bulk baseline. */
  style?: CSSProperties;
}

function paramValue(layer: OscillatorLayer, field: SignatureArrayParamSchema['field']): number {
  switch (field) {
    case 'gain': return layer.gain;
    case 'detune': return layer.detune;
    case 'phase': return layer.phase;
    case 'pulseWidth': return layer.pulseWidth ?? 0.5;
    default: return 0;
  }
}

export interface SignatureArrayLayerProps {
  block: SignatureArrayLayerBlock;
  idx: number;
  layer: OscillatorLayer;
  lfoLinks: SignatureArrayValue['lfoLinks'];
  disabled?: boolean;
  /** Per-field swelling flags for THIS layer (audioSwells.ts's isRobotAttributeSwelling for
   *  'layer{idx}.gain' etc.), forwarded straight to the matching slider's own `swelling` prop. See
   *  useEasedControlValue.ts. */
  swelling?: Partial<Record<SignatureArrayParamSchema['field'], boolean>>;
  onTypeChange: (idx: number, type: WaveformType) => void;
  onParamChange: (idx: number, field: SignatureArrayParamSchema['field'], value: number) => void;
  onLfoFieldChange: (idx: number, target: RobotLfoTargetId, value: LfoLinkValue) => void;
}

/**
 * One layer's own Type radio, then Gain/Detune each paired with their own inline `LfoLink`
 * (docs/specs/LFO_BANK.md section 1.5, assumption 10 — replaces the shared `Lfo`/`LfoTargetGroup`
 * display: a target no longer owns a shape/rate of its own, it links to one of the 4 world lanes
 * at a depth, so the select-then-edit indirection no longer earns its own state machine). Phase
 * and Interval still render as their own plain rows — neither is a modulation target (Phase since
 * docs/specs/LFO_BANK.md Task 1, Interval since docs/specs/LFO_LOAD_FIX.md assumption 9).
 *
 * Extracted out of `SignatureArrayDrawerInner`'s own `.map()` and `React.memo`-wrapped
 * (docs/todo/backlog.md #27 follow-up, 2026-09-15) — found live: editing one layer's Gain
 * re-rendered every other layer's own controls too. Root cause: every per-layer handler
 * (`handleTypeChange`, `handleParamChange`) was built fresh, unmemoized, inside the parent's own
 * `.map()` — so whenever `value.layers` changed reference (any layer, any field), ALL 3 layers'
 * worth of already-memoized primitives got new prop references regardless of whether their own
 * specific layer actually changed.
 *
 * `layer` stays a stable reference across an edit to a DIFFERENT layer (`applyLayersContinuous`/
 * `applyLayersStructural` — robotOptionsActions.ts — only ever replace the touched index in the
 * `layers` array, `.map()` preserves the rest), so this component correctly bails for any layer
 * that wasn't itself just edited. `onTypeChange`/`onParamChange`/`onLfoFieldChange` are shared,
 * stable callbacks from the parent (keyed by `idx`, not rebuilt per layer).
 *
 * `lfoLinks` is still one flat object shared by all 3 layers (`applyLayerLfoLink` always rebuilds
 * the whole `Robot.lfoLinks` record — see that function's own doc), so `SignatureArrayLayer`'s
 * own memo can't bail on an edit to any target — every layer's `lfoLinks` prop gets a new
 * reference. Unlike the pre-LFO-Bank shared display, though, this no longer cascades down to the
 * actual leaf controls: `gainLink`/`detuneLink` below resolve an untouched target to
 * `DEFAULT_LFO_LINK[target]`, a stable per-target object (data/lfoConfig.ts, never reconstructed)
 * — so an edit to, say, layer0's Gain leaves layer1/layer2's own resolved link values
 * referentially identical, and their own (independently memoized) `LfoLink` children bail. Only
 * the one `LfoLink` whose target actually changed re-renders. Verified by this file's own test
 * (search "DEFAULT_LFO_LINK object and bail").
 */
function SignatureArrayLayerInner({ block, idx, layer, lfoLinks, disabled, swelling, onTypeChange, onParamChange, onLfoFieldChange }: SignatureArrayLayerProps) {
  const handleTypeChange = useCallback((v: string) => onTypeChange(idx, v as WaveformType), [idx, onTypeChange]);

  // 'pulse' only — Tone.js's OmniOscillator.width getter returns undefined for every other type
  // (including 'square'), so showing Interval there was an editable control with no audible effect.
  const showPulseWidth = layer.type === 'pulse';
  const typeParam = block.params.find((p) => p.field === 'type')!;
  const gainParam = block.params.find((p) => p.field === 'gain')!;
  const detuneParam = block.params.find((p) => p.field === 'detune')!;
  // Phase is no longer an LFO target (docs/specs/LFO_BANK.md Task 1: Phase never had a live
  // Signal to modulate, the one of the 9 original robot targets that ran a control-rate polling
  // fallback instead of an audio-rate connection). The slider itself stays, as its own plain row.
  const phaseParam = block.params.find((p) => p.field === 'phase')!;
  // Interval/pulseWidth is no longer an LFO target (docs/specs/LFO_LOAD_FIX.md assumption 9) —
  // it renders as its own plain row, never paired with an LfoLink.
  const pulseWidthParam = block.params.find((p) => p.field === 'pulseWidth')!;

  const gainTarget = gainParam.lfoTarget!;
  const detuneTarget = detuneParam.lfoTarget!;
  const gainLink = lfoLinks?.[gainTarget] ?? DEFAULT_LFO_LINK[gainTarget];
  const detuneLink = lfoLinks?.[detuneTarget] ?? DEFAULT_LFO_LINK[detuneTarget];

  // No labels — unlike the old shared display, each row's own slider above it already names the
  // field (Gain/Detune), so a second DualLabel here would just repeat it (DualLabel renders
  // nothing when both loreLabel/humanLabel are absent).
  const gainLinkSchema: LfoLinkSchema = useMemo(() => ({ id: `robotOptions.${block.key}.gain.link`, type: 'lfoLink' }), [block.key]);
  const detuneLinkSchema: LfoLinkSchema = useMemo(() => ({ id: `robotOptions.${block.key}.detune.link`, type: 'lfoLink' }), [block.key]);

  const handleGainChange = useCallback((v: number) => onParamChange(idx, 'gain', v), [idx, onParamChange]);
  const handleDetuneChange = useCallback((v: number) => onParamChange(idx, 'detune', v), [idx, onParamChange]);
  const handlePulseWidthChange = useCallback((v: number) => onParamChange(idx, 'pulseWidth', v), [idx, onParamChange]);
  const handlePhaseChange = useCallback((v: number) => onParamChange(idx, 'phase', v), [idx, onParamChange]);
  const handleGainLinkChange = useCallback((v: LfoLinkValue) => onLfoFieldChange(idx, gainTarget, v), [idx, gainTarget, onLfoFieldChange]);
  const handleDetuneLinkChange = useCallback((v: LfoLinkValue) => onLfoFieldChange(idx, detuneTarget, v), [idx, detuneTarget, onLfoFieldChange]);

  return (
    <DirectionalPanel schema={block.panel}>
      <div className="signature-array-drawer__layer" data-layer-key={block.key}>
        <RadioButton
          schema={typeParam.schema as RadioButtonSchema}
          value={layer.type}
          onChange={handleTypeChange}
          disabled={disabled}
        />
        <div className="signature-array-drawer__param">
          <SliderLinear
            schema={gainParam.schema as SliderLinearSchema}
            value={paramValue(layer, 'gain')}
            onChange={handleGainChange}
            disabled={disabled}
            verticalHeight={(gainParam.schema as SliderLinearSchema).verticalHeight}
            swelling={swelling?.gain}
          />
          <LfoLink schema={gainLinkSchema} value={gainLink} onChange={handleGainLinkChange} disabled={disabled} />
        </div>
        <div className="signature-array-drawer__param">
          <SliderCenteredZero
            schema={detuneParam.schema as SliderCenteredZeroSchema}
            value={paramValue(layer, 'detune')}
            onChange={handleDetuneChange}
            disabled={disabled}
            verticalHeight={(detuneParam.schema as SliderCenteredZeroSchema).verticalHeight}
            swelling={swelling?.detune}
          />
          <LfoLink schema={detuneLinkSchema} value={detuneLink} onChange={handleDetuneLinkChange} disabled={disabled} />
        </div>
        <div className="signature-array-drawer__param">
          <SliderLinear
            schema={phaseParam.schema as SliderLinearSchema}
            value={paramValue(layer, 'phase')}
            onChange={handlePhaseChange}
            disabled={disabled}
            verticalHeight={(phaseParam.schema as SliderLinearSchema).verticalHeight}
            swelling={swelling?.phase}
          />
        </div>
        {showPulseWidth && (
          <div className="signature-array-drawer__param signature-array-drawer__interval">
            <SliderLinear
              schema={pulseWidthParam.schema as SliderLinearSchema}
              value={paramValue(layer, 'pulseWidth')}
              onChange={handlePulseWidthChange}
              disabled={disabled}
              verticalHeight={(pulseWidthParam.schema as SliderLinearSchema).verticalHeight}
              swelling={swelling?.pulseWidth}
            />
          </div>
        )}
      </div>
    </DirectionalPanel>
  );
}

/** Exported standalone (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 10) — becomes Baseline/
 *  Coaxial/Harmonic Oscillator's own independently-mountable tree leaf, one instance per fixed
 *  SIGNATURE_ARRAY_CONFIG slot (block/idx together identify which). Already isolated per layer
 *  internally (see this component's own doc comment above) — the split here is exposing it, not
 *  rebuilding it. SignatureArrayDrawer keeps rendering its own 3 instances directly. */
export const SignatureArrayLayer = memo(SignatureArrayLayerInner);

/**
 * 3 DirectionalPanels, one per fixed layer slot (Baseline/Coaxial/Harmonic) —
 * docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 8. No accordion wrapper as of Task
 * 17 (docs/tasks/NAV_LAYOUT_REWRITE.md) — this drawer's content is now a probe's own "Source" tree
 * leaf, and the tree node itself carries that label, so there's no accordion header left to show
 * it on. Robot Drift (`RobotDriftPanel`) is gone entirely as of docs/tasks/LFO_BANK.md Task 15 —
 * modulation now goes through the per-row LfoLink controls below, and lane-level drift lives only
 * in LfoBankLanePanel (FleetParamsContent.tsx's own LFO Bank leaves).
 *
 * Otherwise purely presentational as of Roadmap Phase 10 (Task 16) — no `robot` prop, no store
 * access at all as of Task 12/15 (RobotDriftPanel's own global lfoDrift subscription is gone with
 * it); both RobotOptionsTab (robot mode) and CompanyOptionsSection (company mode) derive `value` and
 * wire each callback through robotOptionsActions.applyLayersContinuous/applyLayersStructural/
 * applyLayerLfoLink themselves. Dragging Coaxial/Harmonic's own Gain to 0 mutes the layer
 * (eventually excluded from the composite voice, see AudioEngine.reserveVoice's
 * filterAudibleLayers) without discarding its Type/Detune/Phase/Interval configuration — there's
 * no separate Active toggle.
 *
 * Each layer's own `signature-array-drawer__layer` `data-layer-key` div is wrapped *around* by
 * its DirectionalPanel, not replaced by it — DirectionalPanel's props are locked to
 * `{ schema, children }` (no prop passthrough) and can't carry `data-layer-key` itself.
 *
 * Each layer's Gain/Detune render their own inline `LfoLink` directly beneath their own slider
 * (docs/specs/LFO_BANK.md section 1.5) — replacing the old shared `LfoTargetGroup` display (one
 * select-then-edit display per layer, covering Gain/Detune/Phase/Interval together). Type stays
 * rendered inline as before — it has no LFO of its own, and neither do Phase/Interval (plain
 * rows). Each layer's own rendering lives in `SignatureArrayLayer` above, `React.memo`-wrapped so
 * an edit to one layer doesn't cascade into its 2 siblings (docs/todo/backlog.md #27 follow-up) —
 * this component's own job is just deriving `layers` and building the 3 shared, stable per-index
 * handlers every layer instance calls into.
 */
function SignatureArrayDrawerInner({ value, onContinuousChange, onStructuralChange, onLfoChange, disabled, style }: SignatureArrayDrawerProps) {
  const layers = value.layers ?? [];

  // Ref-cached "latest layers" (docs/todo/backlog.md #27 follow-up, 2026-09-15) — the 3 handlers
  // below need the CURRENT layers array to correctly preserve the other 2 layers' own values when
  // rebuilding it, but must not themselves destabilize whenever `layers` changes (i.e. on every
  // edit to ANY layer) — the same "stable callback, fresh value read at call time" ref pattern
  // `RobotOptionsTab.tsx`/`PingContourDrawer.tsx`/`Lfo.tsx` already use. Because they're stable
  // regardless of which layer last changed, one shared triple of handlers serves all 3 layers,
  // keyed by `idx` at the call site rather than rebuilt per layer.
  const latestLayers = useRef(layers);
  useEffect(() => {
    latestLayers.current = layers;
  });

  const handleTypeChange = useCallback((idx: number, type: WaveformType) => {
    const current = latestLayers.current;
    onStructuralChange(current.map((l, i) => (i === idx ? { ...l, type } : l)));
  }, [onStructuralChange]);

  const handleParamChange = useCallback((idx: number, field: SignatureArrayParamSchema['field'], v: number) => {
    const current = latestLayers.current;
    onContinuousChange(current.map((l, i) => (i === idx ? { ...l, [field]: v } : l)));
  }, [onContinuousChange]);

  const handleLfoFieldChange = useCallback((_idx: number, target: RobotLfoTargetId, v: LfoLinkValue) => {
    onLfoChange(target, v);
  }, [onLfoChange]);

  return (
    <div className="signature-array-drawer" style={style}>
      {SIGNATURE_ARRAY_CONFIG.map((block, idx) => {
        const layer = layers[idx];
        if (!layer) return null;
        return (
          <SignatureArrayLayer
            key={block.key}
            block={block}
            idx={idx}
            layer={layer}
            lfoLinks={value.lfoLinks}
            disabled={disabled}
            onTypeChange={handleTypeChange}
            onParamChange={handleParamChange}
            onLfoFieldChange={handleLfoFieldChange}
          />
        );
      })}
    </div>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 4)
export const SignatureArrayDrawer = memo(SignatureArrayDrawerInner);

export default SignatureArrayDrawer;
