import { useCallback, useMemo, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '@/stores/audioStore';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { Stepper } from '@/components/ui/controls/Stepper';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import { LfoLink } from '@/components/ui/controls/LfoLink';
import {
  AUDIO_RIG_CONFIG,
  DECAY_MODE_SCHEMA,
  PING_VARIANCE_AUTOMATION_SCHEMA,
  type AudioRigParamSchema,
  type AudioRigEffectKey,
} from '@/data/audioRigConfig';
import { getTraitColorStyle } from '@/utils/traitColors';
import { cancelSwellForGlobalField, isGlobalTargetSwelling } from '@/systems/audioSwells';
import type { Trait } from '@/types/traits';
import type { DirectionalPanelSchema, LfoLinkSchema, LfoLinkValue } from '@/types/controls';
import type { GlobalAudioSettings } from '@/types/globalAudio';
import type { GlobalLfoTargetId } from '@/types/lfo';
import './AudioRigDrawer.css';

/**
 * Trait per individual effect (Roadmap Phase 14, docs/specs/COLOR_SCHEME_TRAIT_THEMING.md
 * §1.5/§1.6) — previously applied once per AUDIO_RIG_ACCORDION_GROUPS group (3 accordions, cascading
 * to every nested effect); now applied directly on each AudioRigEffectPanel's own wrapper (Task 14,
 * docs/tasks/NAV_LAYOUT_REWRITE.md — each effect is its own tree leaf, standalone, with no group
 * accordion left to inherit the color from).
 */
// Hoisted to module scope (docs/todo/backlog.md #27 follow-up, 2026-09-15) — these 2 don't depend
// on any prop/state, so a plain module-level constant is the correct, minimal fix, matching this
// file's own established "schema is always a stable reference" convention (every other schema
// here is a config import or `useMemo`) — the only 2 inline schema literals left in this file.
const COMPRESSOR_TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'audioRig.compressor.topRow', type: 'directionalPanel', orientation: 'responsive' };
const COMPRESSOR_BOTTOM_ROW_SCHEMA: DirectionalPanelSchema = { id: 'audioRig.compressor.bottomRow', type: 'directionalPanel', orientation: 'responsive' };
// Knee + Decay Mode's own row (Crawford's own request) — same 'responsive' shape as the 2 rows
// above: side-by-side on desktop, stacked on mobile/tablet.
const COMPRESSOR_KNEE_DECAY_ROW_SCHEMA: DirectionalPanelSchema = { id: 'audioRig.compressor.kneeDecayRow', type: 'directionalPanel', orientation: 'responsive' };

const AUDIO_RIG_EFFECT_TRAIT: Record<AudioRigEffectKey, Trait> = {
  eq3: 'spectral',
  filterLPF: 'spectral',
  filterHPF: 'spectral',
  delay: 'timeSpace',
  reverb: 'timeSpace',
  compressor: 'output',
  limiter: 'output',
};

/** Dispatches a param's ControlSchema to its matching primitive. Covers only
 *  the 4 variants GLOBAL_CHAIN_GRID.md's UI column actually uses for this
 *  drawer — audioRigConfig.test.ts is what guards the closed set in practice. */
function renderParamControl(param: AudioRigParamSchema, value: number, onChange: (v: number) => void, swelling: boolean) {
  switch (param.schema.type) {
    case 'sliderLinear':
      return <SliderLinear schema={param.schema} value={value} onChange={onChange} verticalHeight={param.schema.verticalHeight} swelling={swelling} />;
    case 'sliderLog':
      return <SliderLog schema={param.schema} value={value} onChange={onChange} verticalHeight={param.schema.verticalHeight} swelling={swelling} />;
    case 'sliderCenteredZero':
      return <SliderCenteredZero schema={param.schema} value={value} onChange={onChange} verticalHeight={param.schema.verticalHeight} swelling={swelling} />;
    case 'stepper':
      return <Stepper schema={param.schema} value={value} onChange={onChange} />;
    default:
      return null;
  }
}

/** Wraps one param's control in the shared `.audio-rig-drawer__param-row` div, optionally followed
 *  by its own `LfoLink` row (Task 14, docs/tasks/LFO_BANK.md — replaces the old shared per-block
 *  LFO target-group display; a param-row with no lfoLink arg is the plain, non-LFO rendering shape).
 *  Takes the field's own resolved `onChange` directly (AudioRigEffectPanel's `fieldOnChange` map)
 *  rather than building `(v) => updateParam(param.field, v)` inline here — that inline arrow was a
 *  fresh function every render, which defeated every memoized primitive's own React.memo bail-out
 *  regardless of how many of them got memoized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
 *  Task 12). */
function paramRow(param: AudioRigParamSchema, effect: Record<string, number>, onChange: (v: number) => void, effectKey: AudioRigEffectKey, lfoLink?: ReactNode) {
  return (
    <div className="audio-rig-drawer__param-row" key={param.field}>
      {renderParamControl(param, effect[param.field], onChange, isGlobalTargetSwelling(effectKey, param.field))}
      {lfoLink}
    </div>
  );
}

/** Looks up one param by its field name — used by AudioRigEffectPanel's hand-composed delay/reverb
 *  layouts below to pull a specific control out of block.params by name, rather than mapping the
 *  array in bulk. Non-null assertion is safe: both call sites name fields that AUDIO_RIG_CONFIG's
 *  own delay/reverb blocks are guaranteed to carry (audioRigConfig.test.ts guards the field list). */
function findParam(params: AudioRigParamSchema[], field: string): AudioRigParamSchema {
  return params.find((p) => p.field === field)!;
}

/** AudioRigParamSchema narrowed to the lfoTarget-bearing case — AudioRigEffectPanel's own
 *  lfoParams filter guarantees every entry has one; carrying that guarantee in the type itself
 *  removes the `.lfoTarget!` non-null assertions that filter's callers would otherwise need. */
interface LfoTargetedParamSchema extends AudioRigParamSchema {
  lfoTarget: GlobalLfoTargetId;
}

/**
 * Automatic Effects content — resolves docs/tasks/AUDIO_RIG.md Task 10/11, docs/tasks/
 * AUDIO_RIG_V2.md Task 11, and docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 2 historically, but as
 * of Task 14 (docs/tasks/NAV_LAYOUT_REWRITE.md) this component's own scope shrank to just the one
 * control that never got a tree leaf of its own: Ping Variance Automation ("Automatic Effects").
 * Every real effect (EQ, HPF, LPF, Delay, Reverb, Compressor, Limiter) moved out to its own
 * AudioRigEffectPanel instance, rendered directly by FleetParamsContent.tsx when a specific effect
 * leaf is selected.
 *
 * As of docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §2.1, this component's own outer
 * wrapper (`.audio-rig-drawer` div + its own Speed & Automation DirectionalPanel) is gone too —
 * Intensity now shares a 2x2 Pacing row with Frequency/Duration/Tempo, and a panel-inside-a-panel
 * would result if this component kept wrapping itself. FleetParamsContent.tsx's own
 * `PACING_BOTTOM_ROW_SCHEMA` DirectionalPanel is the only panel wrapping this slider now — same
 * "the call site owns the panel, not the leaf" shape AudioRigEffectPanel's siblings already use.
 * The Composition trait color reaches this slider purely via cascade, from FleetParamsContent's
 * own Pacing AccordionContainer — this component applies no trait style of its own anymore.
 */
export function AudioRigDrawer() {
  const pingVarianceAutomation = useAudioStore((s) => s.pingVarianceAutomation);
  const setPingVarianceAutomation = useAudioStore((s) => s.setPingVarianceAutomation);

  // Stabilized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12) — SliderLinear is now
  // React.memo'd (Task 6); an inline `(v) => setPingVarianceAutomation(v / 100)` here would have
  // been a fresh function every render, defeating that memo regardless.
  const handlePingVarianceChange = useCallback(
    (v: number) => setPingVarianceAutomation(v / 100),
    [setPingVarianceAutomation],
  );

  return (
    <div className="audio-rig-drawer__param-row">
      <SliderLinear
        schema={PING_VARIANCE_AUTOMATION_SCHEMA}
        value={pingVarianceAutomation * 100}
        onChange={handlePingVarianceChange}
      />
    </div>
  );
}

interface AudioRigEffectPanelProps {
  effectKey: AudioRigEffectKey;
}

/**
 * One effect's own full content (a plain params map, each with its own inline `LfoLink` row where
 * `lfoTarget` is present, plus the compressor-only Decay Mode radio) — as of Task 14 (docs/tasks/
 * LFO_BANK.md, inside the standalone-leaf shape docs/tasks/NAV_LAYOUT_REWRITE.md Task 14 set up),
 * this is a standalone,
 * exported component: FleetParamsContent.tsx renders exactly one instance directly, for whichever
 * effect leaf (EQ/HPF/LPF/Reverb/Delay/Compression/Limiter) is currently selected in the tree —
 * no group accordion wraps it anymore, so it carries its own per-effect trait color
 * (AUDIO_RIG_EFFECT_TRAIT) directly rather than inheriting one via cascade.
 *
 * A real component (not a plain function called from a parent's own render, which is what this
 * was originally) so it can subscribe to only ITS OWN slice of globalAudio, via its own
 * `effectKey`-scoped selector (bugfix, found via a manual re-render sweep, backlog item 18):
 * audioSwells.ts's own 16n tick (~8-9x/sec) writes to exactly one effect key at a time via
 * setGlobalAudio, and setGlobalAudio's own spread-one-key implementation (audioStore.ts)
 * already preserves every sibling effect's own object reference untouched — so subscribing to
 * the WHOLE globalAudio object would re-render on every tick regardless of which single effect
 * the active swell was actually targeting. compressorBeforeDelay/lfoDrift are selected the same
 * way — read unconditionally every render (same call site regardless of effectKey, never
 * skipped) so the hook call itself never branches, only the selector's own returned value does.
 */
export function AudioRigEffectPanel({ effectKey }: AudioRigEffectPanelProps) {
  const block = AUDIO_RIG_CONFIG.find((b) => b.key === effectKey)!;
  // Every param field on every effect is a number (GLOBAL_CHAIN_GRID.md has
  // no string/boolean params) — this cast is read-only and narrow, matching
  // audioStore.ts's own GLOBAL_SETTER cast for the same "dynamic key against
  // a closed-but-varying settings shape" situation.
  const effect = useAudioStore((s) => s.globalAudio[effectKey]) as unknown as Record<string, number>;
  const setGlobalAudio = useAudioStore((s) => s.setGlobalAudio);
  const setGlobalLfoLink = useAudioStore((s) => s.setGlobalLfoLink);
  // Type predicate, not a plain truthy filter — proves lfoTarget is present to the type
  // system itself, so the LfoLink-wiring maps below need no `.lfoTarget!` cast. block.params is a
  // stable module-level reference (see fieldOnChange's own comment below), so memoizing on it
  // keeps lfoParams itself a stable reference too, which the 3 maps below depend on in turn.
  const lfoParams = useMemo(
    () => block.params.filter((p): p is LfoTargetedParamSchema => p.lfoTarget !== undefined),
    [block.params],
  );
  // Only this block's own lfo-linked targets, not the whole globalLfoLinks object (the old
  // per-block LFO display's own re-render fix, backlog item 18, carried over unchanged): useShallow
  // bails the re-render when none of THESE targets' links actually changed, instead of
  // re-rendering on every globalLfoLinks write anywhere, every other block's own targets included.
  const lfoLinkValues = useAudioStore(useShallow((s) => lfoParams.map((p) => s.globalLfoLinks[p.lfoTarget])));
  // Audio Load Budget (docs/tasks/LFO_BANK.md Task 3): one dial-wide flag for every filter (LPF/HPF) link — EQ-gain links
  // are never held off, so the selector itself returns a stable `false` for every other block, never subscribing it to
  // a flip it doesn't care about (the existing per-frame re-render guard, applied to a store-wide flag now).
  const isFilterBlock = effectKey === 'filterLPF' || effectKey === 'filterHPF';
  const filterLinksHeldOff = useAudioStore((s) => isFilterBlock && s.filterLinksHeldOff);
  const compressorBeforeDelay = useAudioStore((s) => (effectKey === 'compressor' ? s.globalAudio.compressorBeforeDelay : undefined));
  const setCompressorBeforeDelay = useAudioStore((s) => s.setCompressorBeforeDelay);

  // Stabilized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12) — this used to be a plain
  // function, rebuilt fresh every render; every one of the ~9 call shapes below built its own
  // `(v) => updateParam(field, v)` inline from it, each a fresh function every render, which
  // defeated every memoized primitive's own React.memo bail-out (Tasks 1-11) regardless of how
  // many of them got memoized — the originally-reported bug (docs/todo/backlog.md #26): an
  // Audio Swell tick re-rendering the whole panel instead of just the swelling field.
  const updateParam = useCallback((field: string, value: number) => {
    cancelSwellForGlobalField(effectKey, field);
    setGlobalAudio(effectKey, { [field]: value } as Partial<GlobalAudioSettings[AudioRigEffectKey]>);
  }, [effectKey, setGlobalAudio]);
  // One pre-bound, stable onChange per field, keyed by field name. block.params is a stable
  // module-level reference (a slice of AUDIO_RIG_CONFIG, built once at import time — never
  // reconstructed), and updateParam is now stable per effectKey (above), so this whole map is
  // referentially stable across any re-render that doesn't change effectKey — which is every
  // re-render of a mounted AudioRigEffectPanel instance in practice. Chosen over a `useCallback`
  // at each of this file's call shapes (paramRow's loop, the compressor special case's 5 direct
  // calls, the LfoLink maps' own per-field loop below, the Decay Mode radio) since block.params'
  // field set is already a stable, closed list per effect.
  const fieldOnChange = useMemo(() => {
    const map: Record<string, (v: number) => void> = {};
    for (const p of block.params) {
      map[p.field] = (v: number) => updateParam(p.field, v);
    }
    return map;
  }, [block.params, updateParam]);

  // Three keyed-by-field maps for the LfoLink rows (Task 14) — mirrors fieldOnChange's own
  // stable-per-field-map shape directly above, for the same reason: a fresh inline arrow/schema
  // per render would defeat LfoLink's own React.memo regardless of how many fields are memoized.
  const lfoLinkOnChange = useMemo(() => {
    const map: Record<string, (v: LfoLinkValue) => void> = {};
    for (const p of lfoParams) map[p.field] = (v: LfoLinkValue) => setGlobalLfoLink(p.lfoTarget, v);
    return map;
  }, [lfoParams, setGlobalLfoLink]);
  const lfoLinkSchemas = useMemo(() => {
    const map: Record<string, LfoLinkSchema> = {};
    for (const p of lfoParams) map[p.field] = { id: `audioRig.${effectKey}.${p.field}.link`, type: 'lfoLink' };
    return map;
  }, [lfoParams, effectKey]);
  const lfoLinkValueByField = useMemo(() => {
    const map: Record<string, LfoLinkValue> = {};
    lfoParams.forEach((p, i) => { map[p.field] = lfoLinkValues[i]; });
    return map;
  }, [lfoParams, lfoLinkValues]);

  const handleDecayModeChange = useCallback(
    (v: string) => setCompressorBeforeDelay(v === 'controlled'),
    [setCompressorBeforeDelay],
  );

  return (
    <div className="audio-rig-drawer__effect-block" style={getTraitColorStyle(AUDIO_RIG_EFFECT_TRAIT[effectKey])}>
      <DirectionalPanel schema={block.panel}>
        {block.key === 'compressor' ? (
          // Threshold+Ratio, Attack+Release, and Knee+Decay Mode (Crawford's own request) are the
          // 3 paired sub-rows that stay side-by-side on desktop — 'responsive' stacks each pair on
          // mobile/tablet. This also resolves a pre-existing duplicate id ('audioRig.compressor.
          // bottomRow' used to be shared by 2 different panels).
          <>
            <DirectionalPanel schema={COMPRESSOR_TOP_ROW_SCHEMA}>
              {paramRow(findParam(block.params, 'threshold'), effect, fieldOnChange.threshold, effectKey)}
              {paramRow(findParam(block.params, 'ratio'), effect, fieldOnChange.ratio, effectKey)}
            </DirectionalPanel>
            <DirectionalPanel schema={COMPRESSOR_BOTTOM_ROW_SCHEMA}>
              {paramRow(findParam(block.params, 'attack'), effect, fieldOnChange.attack, effectKey)}
              {paramRow(findParam(block.params, 'release'), effect, fieldOnChange.release, effectKey)}
            </DirectionalPanel>
            <DirectionalPanel schema={COMPRESSOR_KNEE_DECAY_ROW_SCHEMA}>
              {paramRow(findParam(block.params, 'knee'), effect, fieldOnChange.knee, effectKey)}
              <div className="audio-rig-drawer__param-row">
                <RadioButton
                  schema={DECAY_MODE_SCHEMA}
                  value={compressorBeforeDelay ? 'controlled' : 'natural'}
                  onChange={handleDecayModeChange}
                />
              </div>
            </DirectionalPanel>
          </>
        ) : (
          block.params.map((param) => paramRow(
            param, effect, fieldOnChange[param.field], effectKey,
            param.lfoTarget !== undefined ? (
              <>
                <LfoLink
                  schema={lfoLinkSchemas[param.field]}
                  value={lfoLinkValueByField[param.field]}
                  onChange={lfoLinkOnChange[param.field]}
                  heldOff={isFilterBlock && filterLinksHeldOff}
                />
                {isFilterBlock && filterLinksHeldOff && <HeldOffNote />}
              </>
            ) : undefined,
          ))
        )}
      </DirectionalPanel>
    </div>
  );
}

export default AudioRigDrawer;
