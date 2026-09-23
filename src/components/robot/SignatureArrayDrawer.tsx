import type { CSSProperties } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import { LfoTargetGroup } from '@/components/ui/controls/LfoTargetGroup';
import { withHeldOffClass } from '@/components/ui/controls/activeClass';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import {
  SIGNATURE_ARRAY_CONFIG,
  type SignatureArrayLayerBlock,
  type SignatureArrayParamSchema,
} from '@/data/robotOptionsConfig';
import { LFO_DRIFT_GROUPS } from '@/data/audioRigConfig';
import { useAudioStore } from '@/stores/audioStore';
import type { WaveformType } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type { LfoValue, RadioButtonSchema, SliderCenteredZeroSchema, SliderLinearSchema } from '@/types/controls';
import type { RobotLfoTargetId } from '@/types/lfo';

import './SignatureArrayDrawer.css';

const ROBOTS_DRIFT_GROUP = LFO_DRIFT_GROUPS.find((g) => g.group === 'robots')!;

/**
 * Robot Drift — moved here from AudioRigDrawer's Transport & Composition accordion (post-
 * DIRECTIONAL_PANEL_WIRING follow-up fix), then reordered to render last, after Baseline/Coaxial/
 * Harmonic, rather than first. Still edits the same global `globalAudio.lfoDrift.
 * robots` slice it always did — a rig-wide value, not a per-robot one — so unlike every other
 * panel in this drawer it reads/writes `useAudioStore` directly instead of going through `value`/
 * `onLfoChange` props. Deliberately ignores this drawer's own `disabled` prop: that prop reflects
 * whether a robot/company is selected, which has no bearing on a global control. A separate
 * component (not inlined in SignatureArrayDrawer's own render) purely to keep the store subscription
 * out of a component whose own doc comment promises "no store access" for everything else in it.
 */
function RobotDriftPanel() {
  const rateDrift = useAudioStore((s) => s.globalAudio.lfoDrift.robots.rateDrift);
  const depthDrift = useAudioStore((s) => s.globalAudio.lfoDrift.robots.depthDrift);
  const setGlobalLfoDrift = useAudioStore((s) => s.setGlobalLfoDrift);
  // Audio Load Budget: greys out (values kept) while the dial keeps drift off. Its own condition — the drawer's `disabled` prop
  // still has no bearing on this global control.
  const driftHeldOff = useAudioStore((s) => s.driftHeldOff);

  return (
    <DirectionalPanel schema={ROBOTS_DRIFT_GROUP.panel}>
      <div className={withHeldOffClass('signature-array-drawer__param', driftHeldOff)}>
        <SliderCenteredZero
          schema={ROBOTS_DRIFT_GROUP.rateSchema}
          value={driftHeldOff ? 0 : rateDrift * 100}
          onChange={(v) => setGlobalLfoDrift('robots', { rateDrift: v / 100 })}
          disabled={driftHeldOff}
        />
      </div>
      <div className={withHeldOffClass('signature-array-drawer__param', driftHeldOff)}>
        <SliderCenteredZero
          schema={ROBOTS_DRIFT_GROUP.depthSchema}
          value={driftHeldOff ? 0 : depthDrift * 100}
          onChange={(v) => setGlobalLfoDrift('robots', { depthDrift: v / 100 })}
          disabled={driftHeldOff}
        />
      </div>
      {driftHeldOff && <HeldOffNote />}
    </DirectionalPanel>
  );
}

export interface SignatureArrayValue {
  layers: OscillatorLayer[];
  // Partial, not Robot['lfoSettings'] (a full Record) — this component's own lookup below
  // (`value.lfoSettings?.[lfoTarget] ?? default`) already treats it as potentially-partial at
  // runtime, and CompanyOptionsSection's resolved snapshot is genuinely partial (only fields a
  // company has actually been edited for are present). A full Record is still assignable here.
  lfoSettings?: Partial<Record<RobotLfoTargetId, LfoValue>>;
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
  onLfoChange: (target: RobotLfoTargetId, value: LfoValue) => void;
  disabled?: boolean;
  /** Audio Load Budget: which of THIS robot's LFO targets the dial is holding off. Plain data (the drawer stays store-free for
   *  everything but Robot Drift); the caller must keep it referentially stable while no flag flips (RobotOptionsTab does, via a
   *  shallow selector). Omitted for a company (no single robot to grey against) = nothing held off. */
  heldOffTargets?: Partial<Record<RobotLfoTargetId, boolean>>;
  /** Optional inline style forwarded to this drawer's own root — trait-color scoping
   *  (getTraitColorStyle('spectral'), Roadmap Phase 14), applied identically at both the
   *  RobotOptionsTab and CompanyOptionsSection call sites — this drawer always renders in
   *  Spectral, whether it's editing one robot or a company's bulk baseline. Robot Drift's own
   *  controls, rendered inside this same root, inherit it via ordinary CSS cascade with no wiring
   *  of their own. See docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.5/§1.6. */
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

interface SignatureArrayLayerProps {
  block: SignatureArrayLayerBlock;
  idx: number;
  layer: OscillatorLayer;
  lfoSettings: SignatureArrayValue['lfoSettings'];
  heldOffTargets?: Partial<Record<RobotLfoTargetId, boolean>>;
  disabled?: boolean;
  onTypeChange: (idx: number, type: WaveformType) => void;
  onParamChange: (idx: number, field: SignatureArrayParamSchema['field'], value: number) => void;
  onLfoFieldChange: (idx: number, target: RobotLfoTargetId, value: LfoValue) => void;
}

/**
 * One layer's own Type radio + shared LfoTargetGroup (Gain/Detune/Phase/Interval), extracted out
 * of `SignatureArrayDrawerInner`'s own `.map()` and `React.memo`-wrapped (docs/todo/backlog.md
 * #27 follow-up, 2026-09-15) — found live: editing one layer's Gain re-rendered every other
 * layer's own controls too. Root cause: every per-layer handler (`handleTypeChange`,
 * `handleParamChange`, the `fields` array and `renderField` callback handed to `LfoTargetGroup`)
 * was built fresh, unmemoized, inside the parent's own `.map()` — so whenever `value.layers`
 * changed reference (any layer, any field), ALL 3 layers' worth of already-memoized primitives
 * (RadioButton, SliderLinear/SliderCenteredZero via LfoTargetGroup) got new prop references
 * regardless of whether their own specific layer actually changed.
 *
 * `layer` stays a stable reference across an edit to a DIFFERENT layer (`applyLayersContinuous`/
 * `applyLayersStructural` — robotOptionsActions.ts — only ever replace the touched index in the
 * `layers` array, `.map()` preserves the rest), so this component correctly bails for any layer
 * that wasn't itself just edited. `onTypeChange`/`onParamChange`/`onLfoFieldChange` are shared,
 * stable callbacks from the parent (keyed by `idx`, not rebuilt per layer).
 *
 * Known limitation, not fully solved here: `lfoSettings` is one flat object shared by all 3
 * layers (`applyLayerLfo` always rebuilds the whole `Robot.lfoSettings` record — see that
 * function's own doc), so editing one layer's LFO settings still gives every layer's own
 * `SignatureArrayLayer` instance a new `lfoSettings` reference, causing all 3 to re-render
 * together for that specific edit — continuous param edits (Gain/Detune/Phase, the far more
 * common interaction) are correctly isolated per layer regardless. Narrowing `lfoSettings` to a
 * genuinely per-layer stable slice would need its own follow-up (each layer's own LFO target set
 * is statically fixed per `SIGNATURE_ARRAY_CONFIG`, so it's possible, just out of scope here).
 */
function SignatureArrayLayerInner({ block, idx, layer, lfoSettings, heldOffTargets, disabled, onTypeChange, onParamChange, onLfoFieldChange }: SignatureArrayLayerProps) {
  const handleTypeChange = useCallback((v: string) => onTypeChange(idx, v as WaveformType), [idx, onTypeChange]);

  // 'pulse' only — Tone.js's OmniOscillator.width getter returns undefined for every other type
  // (including 'square'), so showing Interval there was an editable control with no audible effect.
  const showPulseWidth = layer.type === 'pulse';
  const typeParam = block.params.find((p) => p.field === 'type')!;
  const lfoParams = useMemo(
    () => block.params.filter((p) => p.field !== 'type' && (p.field !== 'pulseWidth' || showPulseWidth)),
    [block, showPulseWidth],
  );

  const fields = useMemo(() => lfoParams.map((p) => ({
    field: p.field,
    label: (p.schema as SliderLinearSchema | SliderCenteredZeroSchema).humanLabel ?? p.field,
    lfoValue: lfoSettings?.[p.lfoTarget!] ?? DEFAULT_LFO_SETTINGS[p.lfoTarget!],
  })), [lfoParams, lfoSettings]);

  // Per-field held-off flags for this layer's LFO group, stable while none of them flips (LfoTargetGroup is memoized).
  const heldOff = useMemo(
    () => Object.fromEntries(lfoParams.map((p) => [p.field, heldOffTargets?.[p.lfoTarget!] === true])),
    [lfoParams, heldOffTargets],
  );

  const handleLfoChange = useCallback(
    (field: string, v: LfoValue) => onLfoFieldChange(idx, lfoParams.find((p) => p.field === field)!.lfoTarget!, v),
    [idx, lfoParams, onLfoFieldChange],
  );

  const renderField = useCallback((field: string) => {
    const param = lfoParams.find((p) => p.field === field)!;
    const paramVal = paramValue(layer, field as SignatureArrayParamSchema['field']);
    const handleChange = (v: number) => onParamChange(idx, field as SignatureArrayParamSchema['field'], v);
    return (
      <div className="signature-array-drawer__param">
        {field === 'detune' ? (
          <SliderCenteredZero
            schema={param.schema as SliderCenteredZeroSchema}
            value={paramVal}
            onChange={handleChange}
            disabled={disabled}
            verticalHeight={(param.schema as SliderCenteredZeroSchema).verticalHeight}
          />
        ) : (
          <SliderLinear
            schema={param.schema as SliderLinearSchema}
            value={paramVal}
            onChange={handleChange}
            disabled={disabled}
            verticalHeight={(param.schema as SliderLinearSchema).verticalHeight}
          />
        )}
      </div>
    );
  }, [lfoParams, layer, idx, onParamChange, disabled]);

  return (
    <DirectionalPanel schema={block.panel}>
      <div className="signature-array-drawer__layer" data-layer-key={block.key}>
        <RadioButton
          schema={typeParam.schema as RadioButtonSchema}
          value={layer.type}
          onChange={handleTypeChange}
          disabled={disabled}
        />
        <LfoTargetGroup
          groupId={`robotOptions.${block.key}`}
          sliderPanelOrientation="row"
          fields={fields}
          onLfoChange={handleLfoChange}
          disabled={disabled}
          heldOff={heldOff}
          renderField={renderField}
        />
      </div>
    </DirectionalPanel>
  );
}

const SignatureArrayLayer = memo(SignatureArrayLayerInner);

/**
 * 3 DirectionalPanels, one per fixed layer slot (Baseline/Coaxial/Harmonic), plus the Robot Drift
 * panel — docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 8. No accordion wrapper as of Task
 * 17 (docs/tasks/NAV_LAYOUT_REWRITE.md) — this drawer's content is now a probe's own "Source" tree
 * leaf, and the tree node itself carries that label, so there's no accordion header left to show
 * it on. Robot Drift lands last, after Harmonic — see RobotDriftPanel below.
 *
 * Otherwise purely presentational as of Roadmap Phase 10 (Task 16) — no `robot` prop, no store
 * access beyond RobotDriftPanel's own global lfoDrift subscription; both RobotOptionsTab (robot
 * mode) and CompanyOptionsSection (company mode) derive `value` and wire each callback through
 * robotOptionsActions.applyLayersContinuous/applyLayersStructural/applyLayerLfo themselves.
 * Dragging Coaxial/Harmonic's own Gain to 0 mutes the layer (eventually excluded from the
 * composite voice, see AudioEngine.reserveVoice's filterAudibleLayers) without discarding its
 * Type/Detune/Phase/Interval configuration — there's no separate Active toggle.
 *
 * Each layer's own `signature-array-drawer__layer` `data-layer-key` div is wrapped *around* by
 * its DirectionalPanel, not replaced by it — DirectionalPanel's props are locked to
 * `{ schema, children }` (no prop passthrough) and can't carry `data-layer-key` itself.
 *
 * Each layer's LFO-tied params (Gain/Detune/Phase/Interval) render through one LfoTargetGroup —
 * a shared LFO display per layer, replacing the old per-param nested "Modulation" accordion
 * (docs/specs/LFO_CONSOLIDATED_DISPLAY.md). Type stays rendered inline, outside the group — it
 * has no LFO of its own. Each layer's own rendering now lives in `SignatureArrayLayer` above,
 * `React.memo`-wrapped so an edit to one layer doesn't cascade into its 2 siblings (docs/todo/
 * backlog.md #27 follow-up) — this component's own job is just deriving `layers` and building the
 * 3 shared, stable per-index handlers every layer instance calls into.
 *
 * LFO-target-selection behavior change (Task 17's own flagged design question, spec R2): each
 * layer's LfoTargetGroup instance keeps its own selected-target state as component-local
 * (useLfoTargetGroup's `useState`, never uiStore — matches this repo's established "selection is
 * local, ephemeral state" precedent). Under the old accordion wrapper, that state survived a
 * collapse/reopen because its lazy-mount kept a once-opened section's content
 * mounted, just visually hidden. Under the new tree-nav content model, ContentPane genuinely
 * unmounts this whole drawer whenever the selection moves elsewhere (a different section, a
 * different probe) and remounts it fresh on return — so a layer's own LFO target selection now
 * resets to its default (the group's first field) every time you navigate away from Source and
 * back, rather than surviving the round trip. Confirmed as the intended behavior, not a bug: it's
 * the direct, by-construction consequence of "exactly one thing mounted at a time" replacing
 * "everything mounted, most of it hidden" — the same trade-off the intent doc's own rationale
 * (docs/intent/nav-layout-rewrite.md, "Why now") already named as the reason this rewrite
 * supersedes the old mass-simultaneous-mount problem rather than needing to separately fix it.
 */
function SignatureArrayDrawerInner({ value, onContinuousChange, onStructuralChange, onLfoChange, disabled, heldOffTargets, style }: SignatureArrayDrawerProps) {
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

  const handleLfoFieldChange = useCallback((_idx: number, target: RobotLfoTargetId, v: LfoValue) => {
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
            lfoSettings={value.lfoSettings}
            heldOffTargets={heldOffTargets}
            disabled={disabled}
            onTypeChange={handleTypeChange}
            onParamChange={handleParamChange}
            onLfoFieldChange={handleLfoFieldChange}
          />
        );
      })}
      <RobotDriftPanel />
    </div>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 4) — RobotDriftPanel is unaffected:
// it re-renders independently via its own useAudioStore subscription regardless of this memo, and
// isn't even reached when this component bails (its own JSX is never constructed then).
export const SignatureArrayDrawer = memo(SignatureArrayDrawerInner);

export default SignatureArrayDrawer;
