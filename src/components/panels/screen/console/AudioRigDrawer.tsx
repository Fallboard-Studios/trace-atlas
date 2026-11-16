import { Fragment, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '@/stores/audioStore';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { Stepper } from '@/components/ui/controls/Stepper';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import { withFeaturedClass, withHeldOffClass } from '@/components/ui/controls/activeClass';
import { LfoLink } from '@/components/ui/controls/LfoLink';
import { TempoSyncSlider } from '@/components/ui/controls/TempoSyncSlider';
import type { NoteValue } from '@/data/noteValues';
import { allowedDelayNoteValues, allowedRateNoteValues } from '@/utils/tempoSync';
import {
  AUDIO_RIG_CONFIG,
  DECAY_MODE_SCHEMA,
  PING_VARIANCE_AUTOMATION_SCHEMA,
  type AudioRigCell,
  type AudioRigParamSchema,
  type AudioRigEffectKey,
} from '@/data/audioRigConfig';
import { getTraitColorStyle } from '@/utils/traitColors';
import { cancelSwellForGlobalField, isGlobalTargetSwelling } from '@/systems/audioSwells';
import type { Trait } from '@/types/traits';
import type { LfoLinkSchema, LfoLinkValue, SliderLinearSchema } from '@/types/controls';
import { PEDAL_RATE_RANGE_HZ, isSyncedRateKey, type GlobalAudioSettings } from '@/types/globalAudio';
import type { GlobalLfoTargetId } from '@/types/lfo';
import './AudioRigDrawer.css';

/** Stable (and frozen) empty list for every non-Delay panel's `allowed` — see AudioRigEffectPanel's Delay selectors. */
const NO_NOTE_VALUES: readonly NoteValue[] = Object.freeze([]);

/**
 * Trait per individual effect (Roadmap Phase 14, docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md
 * §1.5/§1.6) — previously applied once per AUDIO_RIG_ACCORDION_GROUPS group (3 accordions, cascading
 * to every nested effect); now applied directly on each AudioRigEffectPanel's own wrapper (Task 14,
 * docs/tasks/archive/NAV_LAYOUT_REWRITE.md — each effect is its own tree leaf, standalone, with no group
 * accordion left to inherit the color from).
 */
const AUDIO_RIG_EFFECT_TRAIT: Record<AudioRigEffectKey, Trait> = {
  eq3: 'spectral',
  filterLPF: 'spectral',
  filterHPF: 'spectral',
  distortion: 'colour',
  chebyshev: 'colour',
  bitCrusher: 'colour',
  autoWah: 'spectral',
  phaser: 'spectral',
  chorus: 'spectral',
  tremolo: 'spectral',
  vibrato: 'spectral',
  frequencyShifter: 'spectral',
  delay: 'timeSpace',
  reverb: 'timeSpace',
  compressor: 'output',
  stereoWidener: 'output',
  limiter: 'output',
};

/** The ten effects the Effects Load dial holds dark below LOAD_EFFECTS_MIN (docs/specs/LIGHT_TIER_STANDING_COST.md H1),
 *  each with the one field that is its Mix: `wet` (for the Chorus and the Shifter, their room's Return), Width's `width`.
 *  While `effectsHeldOff`, every row of the panel greys out and keeps its stored value (a held-off effect's other
 *  params do nothing either: Crawford, 2026-10-29, "if they don't do anything they should be dimmed"), and the Mix row
 *  carries the one HeldOffNote. Each field is typed to its own effect's settings, so a misspelt one fails to compile. */
const EFFECT_MIX_FIELD: { readonly [K in AudioRigEffectKey]?: Extract<keyof GlobalAudioSettings[K], string> } = {
  distortion: 'wet',
  chebyshev: 'wet',
  bitCrusher: 'wet',
  autoWah: 'wet',
  phaser: 'wet',
  chorus: 'wet',
  tremolo: 'wet',
  vibrato: 'wet',
  frequencyShifter: 'wet',
  stereoWidener: 'width',
};

/** Dispatches a param's ControlSchema to its matching primitive. Covers only
 *  the 4 variants GLOBAL_CHAIN_GRID.md's UI column actually uses for this
 *  drawer — audioRigConfig.test.ts is what guards the closed set in practice.
 *  No verticalHeight is forwarded: every Audio Rig slider is horizontal since
 *  docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.2 (pinned in audioRigConfig.test.ts). */
function renderParamControl(param: AudioRigParamSchema, value: number, onChange: (v: number) => void, swelling: boolean, disabled: boolean) {
  switch (param.schema.type) {
    case 'sliderLinear':
      return <SliderLinear schema={param.schema} value={value} onChange={onChange} swelling={swelling} disabled={disabled} />;
    case 'sliderLog':
      return <SliderLog schema={param.schema} value={value} onChange={onChange} swelling={swelling} disabled={disabled} />;
    case 'sliderCenteredZero':
      return <SliderCenteredZero schema={param.schema} value={value} onChange={onChange} swelling={swelling} disabled={disabled} />;
    case 'stepper':
      return <Stepper schema={param.schema} value={value} onChange={onChange} disabled={disabled} />;
    default:
      return null;
  }
}

/** Wraps one param's control in the shared `.audio-rig-drawer__param-row` div (its `LfoLink`, where it has
 *  one, is a cell of its own: docs/specs/CONTENT_LAYOUT.md §1.2). Takes the field's own resolved `onChange` directly (AudioRigEffectPanel's `fieldOnChange` map)
 *  rather than building `(v) => updateParam(param.field, v)` inline here — that inline arrow was a
 *  fresh function every render, which defeated every memoized primitive's own React.memo bail-out
 *  regardless of how many of them got memoized (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md
 *  Task 12). `heldOff` (the Effects Load dial holding this effect dark) disables the control and greys the row, the
 *  stored value kept on the control; `note` adds the panel's one HeldOffNote under it. The cell carries `sc-featured`
 *  when the param's schema is flagged (docs/specs/CONTENT_LAYOUT.md §1.4). */
function paramRow(param: AudioRigParamSchema, effect: Record<string, number>, onChange: (v: number) => void, effectKey: AudioRigEffectKey, heldOff = false, note = false) {
  return (
    <div className={withFeaturedClass(withHeldOffClass('audio-rig-drawer__param-row', heldOff), param.schema)} key={param.field}>
      {renderParamControl(param, effect[param.field], onChange, isGlobalTargetSwelling(effectKey, param.field), heldOff)}
      {note && <HeldOffNote />}
    </div>
  );
}

/** AudioRigParamSchema narrowed to the lfoTarget-bearing case — AudioRigEffectPanel's own
 *  lfoParams filter guarantees every entry has one; carrying that guarantee in the type itself
 *  removes the `.lfoTarget!` non-null assertions that filter's callers would otherwise need. */
interface LfoTargetedParamSchema extends AudioRigParamSchema {
  lfoTarget: GlobalLfoTargetId;
}

/**
 * Automatic Effects content — resolves docs/tasks/archive/AUDIO_RIG.md Task 10/11, docs/tasks/
 * AUDIO_RIG_V2.md Task 11, and docs/tasks/archive/DIRECTIONAL_PANEL_WIRING.md Task 2 historically, but as
 * of Task 14 (docs/tasks/archive/NAV_LAYOUT_REWRITE.md) this component's own scope shrank to just the one
 * control that never got a tree leaf of its own: Ping Variance Automation ("Automatic Effects").
 * Every real effect (EQ, HPF, LPF, Delay, Reverb, Compressor, Limiter) moved out to its own
 * AudioRigEffectPanel instance, rendered by FleetParamsScreen.tsx as that effect's sub-tab.
 *
 * As of docs/specs/archive/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §2.1, this component's own outer
 * wrapper (`.audio-rig-drawer` div + its own Speed & Automation DirectionalPanel) is gone too —
 * Intensity now shares a 2x2 Pacing row with Frequency/Duration/Tempo, and a panel-inside-a-panel
 * would result if this component kept wrapping itself. FleetParamsScreen.tsx's own
 * `PACING_P2_R2_SCHEMA` row (Pacing's second box, docs/specs/CONTENT_LAYOUT.md §1.2) is the only panel wrapping
 * this slider now, beside Automation Length — same
 * "the call site owns the panel, not the leaf" shape AudioRigEffectPanel's siblings already use.
 * The Composition trait color reaches this slider purely via cascade, from FleetParamsScreen's
 * Pacing section panel — this component applies no trait style of its own anymore.
 */
export function AudioRigDrawer() {
  const pingVarianceAutomation = useAudioStore((s) => s.pingVarianceAutomation);
  const setPingVarianceAutomation = useAudioStore((s) => s.setPingVarianceAutomation);

  // Stabilized (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12) — SliderLinear is now
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
 * One effect's own full content, drawn by one walk over its `boxes` (built from the block's `layout`,
 * docs/specs/CONTENT_LAYOUT.md §1.2): each param with its own inline `LfoLink` where `lfoTarget` is
 * present, plus the compressor-only Decay radio — as of Task 14 (docs/tasks/
 * LFO_BANK.md, inside the standalone-leaf shape docs/tasks/archive/NAV_LAYOUT_REWRITE.md Task 14 set up),
 * this is a standalone,
 * exported component: FleetParamsScreen.tsx renders exactly one instance, for whichever effect
 * sub-tab (EQ/HPF/LPF/Reverb/Delay/Compression/Limiter) is open —
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
 * the active swell was actually targeting. compressorBeforeDelay is selected the same way — read
 * unconditionally every render (same call site regardless of effectKey, never skipped) so the
 * hook call itself never branches, only the selector's own returned value does.
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
  // The effects tier (docs/specs/LIGHT_TIER_STANDING_COST.md H1), the same stable-`false` shape: only the ten effects'
  // panels subscribe to the flip; every row of theirs greys, and the Mix row carries the note.
  const mixField = EFFECT_MIX_FIELD[effectKey];
  const effectsHeldOff = useAudioStore((s) => mixField !== undefined && s.effectsHeldOff);
  // The Reverb tier (T19), the same shape: only the Reverb's panel subscribes; its three rows grey, Amount carries the note.
  const reverbHeldOff = useAudioStore((s) => effectKey === 'reverb' && s.reverbHeldOff);
  // At most one of the two is live on any panel (each is a constant `false` off its own effects), so the walk reads one
  // flag for every cell, and the one note goes on the Mix field (the Reverb's Amount).
  const heldOff = effectsHeldOff || reverbHeldOff;
  const noteField = effectKey === 'reverb' ? 'wet' : mixField;
  const compressorBeforeDelay = useAudioStore((s) => (effectKey === 'compressor' ? s.globalAudio.compressorBeforeDelay : undefined));
  const setCompressorBeforeDelay = useAudioStore((s) => s.setCompressorBeforeDelay);
  // Delay Time's Tempo Sync (docs/specs/FREE_SYNC_TOGGLE.md §1.4): `sync` and `bpm` get their own selectors
  // rather than widening the Record<string, number> cast above — the same unconditional-hook/
  // conditional-selector shape compressorBeforeDelay uses. Off the Delay panel both return a constant, so
  // a tempo change re-renders no other effect's panel.
  const isDelay = effectKey === 'delay';
  // The synced-rate pedals' Rate takes the same rail (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.6, generalised by
  // docs/specs/GLOBAL_PEDALS.md §1.6 from the Phaser to the Chorus, Tremolo and Vibrato): this block's own `sync`
  // selector, and the one `bpm` selector shared with the Delay's, so only these panels re-render on a tempo change.
  // The blocks whose `rate` row is a Free | Sync TempoSyncSlider: the store's synced-rate keys (GLOBAL_PEDALS.md §1.6).
  const syncedRateKey = isSyncedRateKey(effectKey) ? effectKey : null;
  const hasSyncedRate = syncedRateKey !== null;
  const delaySync = useAudioStore((s) => (isDelay ? s.globalAudio.delay.sync : undefined));
  const rateSync = useAudioStore((s) => (syncedRateKey ? s.globalAudio[syncedRateKey].sync : undefined));
  const bpm = useAudioStore((s) => (isDelay || hasSyncedRate ? s.bpm : 0));
  const setDelaySyncMode = useAudioStore((s) => s.setDelaySyncMode);
  const setPedalSyncMode = useAudioStore((s) => s.setPedalSyncMode);
  // Memoized on bpm so TempoSyncSlider's memo and its derived Sync schema both bail on every render that
  // isn't a tempo change. The four synced rates share PEDAL_RATE_RANGE_HZ, so they share one list per tempo.
  const delayNoteValues = useMemo(() => (isDelay ? allowedDelayNoteValues(bpm) : NO_NOTE_VALUES), [isDelay, bpm]);
  const rateNoteValues = useMemo(
    () => (hasSyncedRate ? allowedRateNoteValues(bpm, PEDAL_RATE_RANGE_HZ) : NO_NOTE_VALUES),
    [hasSyncedRate, bpm],
  );
  const handleDelaySyncChange = useCallback(
    (note: NoteValue) => setGlobalAudio('delay', { sync: note }),
    [setGlobalAudio],
  );
  const handleRateSyncChange = useCallback(
    (note: NoteValue) => { if (syncedRateKey) setGlobalAudio(syncedRateKey, { sync: note }); },
    [syncedRateKey, setGlobalAudio],
  );
  const handleRateModeChange = useCallback(
    (synced: boolean) => { if (syncedRateKey) setPedalSyncMode(syncedRateKey, synced); },
    [syncedRateKey, setPedalSyncMode],
  );

  // Stabilized (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12) — this used to be a plain
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
  // per cell of the layout walk (renderCell below) since block.params' field set is already a
  // stable, closed list per effect.
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

  /** One cell of the layout (docs/specs/CONTENT_LAYOUT.md §1.2): the Decay radio, a Free | Sync rate (the Delay's
   *  Time, or a synced pedal's Rate: the toggle sits in a row of its own under the slider, inside this one cell), or a
   *  plain param through paramRow with its inline LfoLink where it has an LFO target. Every value, handler and schema
   *  passed down is the stable one the selectors and memo maps above hold. */
  function renderCell(cell: AudioRigCell) {
    if (cell.kind === 'decayMode') {
      return (
        <div className={withFeaturedClass('audio-rig-drawer__param-row', DECAY_MODE_SCHEMA)} key="decayMode">
          <RadioButton schema={DECAY_MODE_SCHEMA} value={compressorBeforeDelay ? 'controlled' : 'natural'} onChange={handleDecayModeChange} />
        </div>
      );
    }
    if (cell.kind === 'link') {
      // The param's LfoLink in a cell of its own, under its slider's row; a held-off filter link carries its note.
      const { field } = cell.param;
      return (
        <div className="audio-rig-drawer__link-row" key={`${field}.link`}>
          <LfoLink
            schema={lfoLinkSchemas[field]}
            value={lfoLinkValueByField[field]}
            onChange={lfoLinkOnChange[field]}
            heldOff={filterLinksHeldOff}
          />
          {filterLinksHeldOff && <HeldOffNote />}
        </div>
      );
    }
    const { param } = cell;
    const { field } = param;
    // Chorus also has a `delayTime` (its own ms slider), so the Delay's Free | Sync is keyed on the Delay alone.
    const isDelayTime = isDelay && field === 'delayTime';
    if (isDelayTime || (hasSyncedRate && field === 'rate')) {
      return (
        <div className={withFeaturedClass(withHeldOffClass('audio-rig-drawer__param-row', heldOff), param.schema)} key={field}>
          <TempoSyncSlider
            // Safe cast: audioRigConfig.ts declares delayTime and every synced rate as a sliderLinear (the Free-mode schema).
            schema={param.schema as SliderLinearSchema}
            freeValue={effect[field]}
            syncValue={isDelayTime ? delaySync : rateSync}
            allowed={isDelayTime ? delayNoteValues : rateNoteValues}
            onFreeChange={fieldOnChange[field]}
            onSyncChange={isDelayTime ? handleDelaySyncChange : handleRateSyncChange}
            onModeChange={isDelayTime ? setDelaySyncMode : handleRateModeChange}
            swelling={isGlobalTargetSwelling(effectKey, field)}
            disabled={heldOff}
          />
        </div>
      );
    }
    return paramRow(param, effect, fieldOnChange[field], effectKey, heldOff, heldOff && field === noteField);
  }

  // One walk over the effect's boxes (built from its layout at module load): each box a top-level column panel, each
  // shared row a nested 'responsive' panel (side by side on desktop, stacked below), a row of one the cell alone.
  return (
    <div className="audio-rig-drawer__effect-block" style={getTraitColorStyle(AUDIO_RIG_EFFECT_TRAIT[effectKey])}>
      {block.boxes.map((box) => (
        <DirectionalPanel key={box.schema.id} schema={box.schema}>
          {box.rows.map((row, r) => (row.schema ? (
            <DirectionalPanel key={row.schema.id} schema={row.schema}>{row.cells.map(renderCell)}</DirectionalPanel>
          ) : (
            <Fragment key={r}>{row.cells.map(renderCell)}</Fragment>
          )))}
        </DirectionalPanel>
      ))}
    </div>
  );
}

export default AudioRigDrawer;
