import { useCallback, useMemo, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AudioLoadPanel } from './AudioLoadPanel';
import { useAudioStore } from '@/stores/audioStore';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { PanelGroup } from '@/components/ui/controls/PanelGroup';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { Stepper } from '@/components/ui/controls/Stepper';
import { HeldOffNote } from '@/components/ui/controls/HeldOffNote';
import { Lfo } from '@/components/ui/controls/Lfo';
import { useLfoTargetGroup } from '@/components/ui/controls/useLfoTargetGroup';
import { withActiveClass, withHeldOffClass } from '@/components/ui/controls/activeClass';
import {
  AUDIO_RIG_CONFIG,
  AUDIO_RIG_ACCORDION_GROUPS,
  TRANSPORT_COMPOSITION_ACCORDION_SCHEMA,
  SPEED_AUTOMATION_PANEL_SCHEMA,
  DECAY_MODE_SCHEMA,
  LFO_DRIFT_GROUPS,
  PING_VARIANCE_AUTOMATION_SCHEMA,
  BPM_SCHEMA,
  type AudioRigParamSchema,
  type AudioRigEffectKey,
  type AudioRigAccordionGroupKey,
} from '@/data/audioRigConfig';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { Trait } from '@/types/traits';
import type { DirectionalPanelSchema, LfoValue, PanelOrientation } from '@/types/controls';
import type { GlobalAudioSettings } from '@/types/globalAudio';
import type { GlobalLfoTargetId } from '@/types/lfo';
import './AudioRigDrawer.css';
// AudioRigLfoGroup below reuses LfoTargetGroup's own sc-lfo-target-group__row/__display
// classes (styled in LfoTargetGroup.css) instead of LfoTargetGroup itself (see the Rules-of-
// Hooks note on AudioRigLfoGroup) — importing the stylesheet directly here, rather than relying
// on SignatureArrayDrawer/AudioSettingSection to have pulled it in elsewhere in the bundle.
import '@/components/ui/controls/LfoTargetGroup.css';

/**
 * Trait for each of the 3 AUDIO_RIG_ACCORDION_GROUPS entries (Roadmap Phase 14, docs/specs/
 * COLOR_SCHEME_TRAIT_THEMING.md §1.5/§1.6) — applied directly to each group's own
 * AccordionContainer via its style prop (Task 7), not a wrapper element. Every nested
 * DirectionalPanel/param (including each effect's own per-target and Drift LFO controls)
 * inherits the color via ordinary CSS cascade with no code of its own.
 */
// Hoisted to module scope (docs/todo/backlog.md #27 follow-up, 2026-09-15) — these 2 don't depend
// on any prop/state, so a plain module-level constant is the correct, minimal fix, matching this
// file's own established "schema is always a stable reference" convention (every other schema
// here is a config import or `useMemo`) — the only 2 inline schema literals left in this file.
const COMPRESSOR_TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'audioRig.compressor.topRow', type: 'directionalPanel', orientation: 'responsive' };
const COMPRESSOR_BOTTOM_ROW_SCHEMA: DirectionalPanelSchema = { id: 'audioRig.compressor.bottomRow', type: 'directionalPanel', orientation: 'responsive' };

const AUDIO_RIG_GROUP_TRAIT: Record<AudioRigAccordionGroupKey, Trait> = {
  eqFilters: 'spectral',
  timeSpace: 'timeSpace',
  output: 'output',
};

/** Dispatches a param's ControlSchema to its matching primitive. Covers only
 *  the 4 variants GLOBAL_CHAIN_GRID.md's UI column actually uses for this
 *  drawer — audioRigConfig.test.ts is what guards the closed set in practice. */
function renderParamControl(param: AudioRigParamSchema, value: number, onChange: (v: number) => void) {
  switch (param.schema.type) {
    case 'sliderLinear':
      return <SliderLinear schema={param.schema} value={value} onChange={onChange} verticalHeight={param.schema.verticalHeight} />;
    case 'sliderLog':
      return <SliderLog schema={param.schema} value={value} onChange={onChange} verticalHeight={param.schema.verticalHeight} />;
    case 'sliderCenteredZero':
      return <SliderCenteredZero schema={param.schema} value={value} onChange={onChange} verticalHeight={param.schema.verticalHeight} />;
    case 'stepper':
      return <Stepper schema={param.schema} value={value} onChange={onChange} />;
    default:
      return null;
  }
}

/** Wraps one param's control in the shared `.audio-rig-drawer__param-row` div — the plain,
 *  non-LFO rendering shape every block's params without an lfoTarget use (see AudioRigEffectPanel).
 *  Takes the field's own resolved `onChange` directly (AudioRigEffectPanel's `fieldOnChange` map)
 *  rather than building `(v) => updateParam(param.field, v)` inline here — that inline arrow was a
 *  fresh function every render, which defeated every memoized primitive's own React.memo bail-out
 *  regardless of how many of them got memoized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
 *  Task 12). */
function paramRow(param: AudioRigParamSchema, effect: Record<string, number>, onChange: (v: number) => void) {
  return (
    <div className="audio-rig-drawer__param-row" key={param.field}>
      {renderParamControl(param, effect[param.field], onChange)}
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

/** AudioRigParamSchema narrowed to the lfoTarget-bearing case — AudioRigLfoGroupProps.params
 *  (below) is typed to exactly this, not the general AudioRigParamSchema, since AudioRigEffectPanel's
 *  own lfoFields filter (below) already guarantees every entry has one. Carrying that guarantee
 *  in the type itself removes the `.lfoTarget!` non-null assertions AudioRigLfoGroup would
 *  otherwise need internally — code review, 2026-09-12. */
interface LfoTargetedParamSchema extends AudioRigParamSchema {
  lfoTarget: GlobalLfoTargetId;
}

interface AudioRigLfoGroupProps {
  /** Becomes the timelineMap key (`lfo-target-group-${groupId}`) — 'audioRig.eq3' etc. */
  groupId: string;
  /** The caller only ever passes a block's lfoTarget-flagged params (eq3/filterLPF/filterHPF
   *  today, per audioRigConfig.ts) — LfoTargetedParamSchema[] makes that a type guarantee, not
   *  just a doc comment. */
  params: LfoTargetedParamSchema[];
  effect: Record<string, number>;
  /** One pre-bound, stable onChange per field, keyed by field name — AudioRigEffectPanel's own
   *  `fieldOnChange` map (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12), not a raw
   *  `updateParam` this component would otherwise have to bind inline per param itself. */
  fieldOnChange: Record<string, (v: number) => void>;
  /** eq3/filterLPF/filterHPF's own Rate/Depth Drift sliders, rendered directly beneath the
   *  shared display — the only groups with a per-group drift control today. */
  driftContent?: ReactNode;
}

/**
 * One shared LFO display for a block whose params are all LFO-tied (docs/specs/
 * LFO_CONSOLIDATED_DISPLAY.md) — replaces the old per-param nested "Modulation" accordion.
 * A separate component (not inlined in AudioRigDrawer's own per-block loop) so
 * useLfoTargetGroup is called unconditionally per this component's own instance, never
 * conditionally inside AUDIO_RIG_CONFIG.map() itself (Rules of Hooks) — AudioRigDrawer instead
 * conditionally *renders* this whole component only for blocks that have any lfoTarget param
 * (eq3/filterLPF/filterHPF), which is the legal way to make LFO wiring optional per block.
 *
 * Renders as column[sliders-panel, Lfo, driftContent] (docs/tasks/DIRECTIONAL_PANEL_WIRING.md
 * follow-up fix) — its own single DirectionalPanel root, always column, so the shared Lfo
 * display and Drift sliders always stack beneath the params regardless of the caller's own
 * block.panel orientation (eq3's is 'row', which used to squeeze the display/drift sliders into
 * the same row as Low/Mid/High). The params themselves render inside a nested inner panel whose
 * own orientation is "taken from slider children" — row if any param's own ControlSchema is
 * `orientation: 'vertical'` (eq3 today), column otherwise (filterLPF/filterHPF) — the same rule
 * VERTICAL_SLIDERS.md's classification already uses. Being a single root element, this
 * component's own wrapper renders as one flex item inside block.panel's content regardless of
 * block.panel's own orientation, which is why that orientation no longer needs to change.
 */
function AudioRigLfoGroup({ groupId, params, effect, fieldOnChange, driftContent }: AudioRigLfoGroupProps) {
  // Only this group's own lfoTarget values, not the whole globalLfo object (bugfix, found via
  // a manual re-render sweep, backlog item 18 — same class as AudioRigEffectPanel's own fix
  // below): useShallow bails the re-render when none of THESE targets' values actually
  // changed, instead of re-rendering on every globalLfo write anywhere, every other
  // LFO-bearing block's own targets included.
  const lfoTargets = params.map((p) => p.lfoTarget);
  const lfoValues = useAudioStore(useShallow((s) => lfoTargets.map((t) => s.globalLfo[t])));
  const setGlobalLfo = useAudioStore((s) => s.setGlobalLfo);
  const fields = params.map((p, i) => ({ field: p.field, label: p.schema.humanLabel ?? p.field, lfoValue: lfoValues[i] }));
  const { selected, transitioning, select, isTargeted, displayValue, displayLabel } = useLfoTargetGroup({ groupId, fields });
  // Non-null assertion is safe: `selected` only ever holds one of `fields`' own field names
  // (useLfoTargetGroup's own contract — it starts at fields[0].field and only ever moves to
  // another value from that same set), and `fields` is mapped 1:1 from `params` above — same
  // "guaranteed to be found" reasoning findParam() documents for its own call sites.
  const selectedTarget = params.find((p) => p.field === selected)!.lfoTarget;
  // Audio Load Budget: a boolean for THIS frame's displayed target, never the whole list — the frame re-renders only when it flips.
  const heldOff = useAudioStore((s) => s.heldOffLfoKeys.includes(selectedTarget));

  // "Taken from slider children" (docs/tasks/DIRECTIONAL_PANEL_WIRING.md follow-up fix): any
  // vertical-oriented slider in the group renders its own row (eq3's Low/Mid/High today, per
  // VERTICAL_SLIDERS.md's classification) — every other LFO-bearing block's sliders are 'auto',
  // which resolves to column here just like everywhere else.
  const slidersOrientation: PanelOrientation = params.some(
    (p) => 'orientation' in p.schema && p.schema.orientation === 'vertical',
  ) ? 'row' : 'column';

  // Stabilized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12) — Lfo is now React.memo'd
  // (Task 10); an inline `(v) => setGlobalLfo(selectedTarget, v)` here would have been a fresh
  // function every render, defeating that memo regardless. Lfo's own onChange takes the full
  // LfoValue object (not a single number), unlike every other param control in this file.
  const handleLfoChange = useCallback(
    (v: LfoValue) => setGlobalLfo(selectedTarget, v),
    [selectedTarget, setGlobalLfo],
  );

  // Stabilized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12 follow-up, found live via
  // React DevTools "highlight updates" after the initial Task 12 fix shipped): these 3 schema
  // objects used to be constructed fresh, inline, on every render of AudioRigLfoGroup — unlike
  // every other primitive's schema in this codebase, which is always a stable reference. Since
  // Lfo (React.memo'd, Task 10) only bails when EVERY prop — schema included — stays referentially
  // equal, a fresh schema unconditionally forced the shared LFO display (and, transitively, its
  // own internal Shape/Rate/Depth controls) to re-render on every sibling field's own value
  // change within this group, not just when the displayed/targeted LFO value itself changed. The
  // 2 DirectionalPanel schemas are memoized too, for the same consistency reason, even though
  // DirectionalPanel's own memo benefit is conditional on `children` also being stable (§1.3) —
  // still correct to do, never harmful.
  const groupPanelSchema = useMemo(
    () => ({ id: `${groupId}.group`, type: 'directionalPanel' as const, orientation: 'column' as const }),
    [groupId],
  );
  const slidersPanelSchema = useMemo(
    () => ({ id: `${groupId}.sliders`, type: 'directionalPanel' as const, orientation: slidersOrientation }),
    [groupId, slidersOrientation],
  );
  // loreLabel: OSCILLATION — docs/reference/ROBOT_DATA_GRID.md's "LFO MODULE" row, same fixed
  // group-level term LfoTargetGroup.tsx's own lfoSchema uses.
  const lfoDisplaySchema = useMemo(
    () => ({ id: `${groupId}.lfo`, type: 'lfo' as const, loreLabel: 'OSCILLATION', humanLabel: displayLabel }),
    [groupId, displayLabel],
  );

  return (
    <DirectionalPanel schema={groupPanelSchema}>
      <DirectionalPanel schema={slidersPanelSchema}>
        {params.map((param) => (
          <div
            key={param.field}
            className={withActiveClass('audio-rig-drawer__param-row sc-lfo-target-group__row', isTargeted(param.field))}
            onClick={() => select(param.field)}
            onFocus={() => select(param.field)}
          >
            {renderParamControl(param, effect[param.field], fieldOnChange[param.field])}
          </div>
        ))}
      </DirectionalPanel>
      <div className={withActiveClass('sc-lfo-target-group__display', transitioning)}>
        <Lfo
          schema={lfoDisplaySchema}
          value={displayValue}
          onChange={handleLfoChange}
          disabled={transitioning || heldOff}
          heldOff={heldOff}
        />
        {heldOff && <HeldOffNote />}
      </div>
      {driftContent}
    </DirectionalPanel>
  );
}

/**
 * Live Audio Rig console — resolves docs/tasks/AUDIO_RIG.md Task 10/11 (V1:
 * bypass + params + nested LFO accordions), docs/tasks/AUDIO_RIG_V2.md Task
 * 11 (V2: Decay control), and docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 2
 * (regrouping into 4 top-level accordions of nested DirectionalPanels).
 * Renders purely from AUDIO_RIG_CONFIG/AUDIO_RIG_ACCORDION_GROUPS, wired to
 * audioStore's setGlobalAudio/setCompressorBeforeDelay — every control here
 * is live, not presentational. The rig-wide bypass switch and each effect's
 * own Enabled toggle were removed: every effect's "off" state is fully
 * expressible through its own sliders (wet=0, a filter's passthrough
 * frequency, etc.), so a separate on/off flag was redundant. The Decay Mode
 * radio isn't part of AUDIO_RIG_CONFIG's per-effect params (it binds a
 * top-level GlobalAudioSettings field, compressorBeforeDelay, not one
 * nested under `compressor`) — it's a special case rendered inside the
 * Compressor block's own panel, under its other params.
 *
 * Structure: Transport & Composition (Speed & Automation panel — Tempo +
 * Automatic Effects) as its own top-level accordion, then
 * AUDIO_RIG_ACCORDION_GROUPS' 3 accordions (EQ & Filters, Time & Space,
 * Output), each wrapping its blockKeys' blocks via the shared AudioRigEffectPanel component
 * helper — its wrapper changed from its own AccordionContainer to a
 * DirectionalPanel nested inside its group's shared accordion. Delay and
 * Reverb no longer hand-compose a paired topRow (docs/specs/
 * AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.7) — every one of their params falls
 * through to the same flat params-map every non-special-cased block uses,
 * each its own full-width row, at every breakpoint. Compressor/Limiter keep
 * the original flat params-map (Compressor's own topRow/bottomRow pairing is
 * a separate, still-special-cased layout — §1.8). EQ & Filters is special-cased
 * (by AUDIO_RIG_ACCORDION_GROUPS' own `key` field, not its raw accordion id)
 * into a flattened row/column layout (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md
 * §1.5) — eq3, filterLPF, and filterHPF are 3 direct siblings of one shared
 * PanelGroup (orientation="responsive"), stacking one-per-row on
 * mobile/tablet and sharing one row as equal thirds on desktop
 * (PanelGroup.css's own default flex: 1 1 0 — no per-block override); Time &
 * Space wraps its own blockKeys in the same kind of tier-driven PanelGroup;
 * Output wraps its own blockKeys in a fixed-column PanelGroup — Compressor
 * and Limiter never share a row, but still get a real gap between them.
 * Each group's PanelGroup is a plain flex wrapper, not a DirectionalPanel —
 * it claims no Cabinetry facade of its own, so every block's own
 * DirectionalPanel (block.panel) inside AudioRigEffectPanel stays top-level and
 * keeps its own independent facade: a real visible box per block, with a
 * real gap between boxes, not one shared surface with extra internal
 * padding (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md's "Separate facades"
 * amendment — a shared DirectionalPanel here was tried first and reverted;
 * Crawford confirmed live in the browser that its gap didn't read as a
 * visible boundary). The 'robots' LFO_DRIFT_GROUPS entry (Robot Drift) no
 * longer renders here — it moved to SignatureArrayDrawer's own Source
 * accordion, since it's a robot-facing control even though the value it
 * edits (globalAudio.lfoDrift.robots) is still global, not per-robot.
 */
export function AudioRigDrawer() {
  const pingVarianceAutomation = useAudioStore((s) => s.pingVarianceAutomation);
  const setPingVarianceAutomation = useAudioStore((s) => s.setPingVarianceAutomation);
  const bpm = useAudioStore((s) => s.bpm);
  const setBPM = useAudioStore((s) => s.setBPM);

  // Stabilized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12) — SliderLinear is now
  // React.memo'd (Task 6); an inline `(v) => setPingVarianceAutomation(v / 100)` here would have
  // been a fresh function every render, defeating that memo regardless. setBPM needs no
  // equivalent wrap — it's already a stable Zustand store action, passed directly below.
  const handlePingVarianceChange = useCallback(
    (v: number) => setPingVarianceAutomation(v / 100),
    [setPingVarianceAutomation],
  );

  return (
    <div className="audio-rig-drawer">
      <AccordionContainer schema={TRANSPORT_COMPOSITION_ACCORDION_SCHEMA} style={getTraitColorStyle('composition')}>
        <DirectionalPanel schema={SPEED_AUTOMATION_PANEL_SCHEMA}>
          <div className="audio-rig-drawer__param-row">
            <SliderLinear
              schema={BPM_SCHEMA}
              value={bpm}
              onChange={setBPM}
            />
          </div>
          <div className="audio-rig-drawer__param-row">
            <SliderLinear
              schema={PING_VARIANCE_AUTOMATION_SCHEMA}
              value={pingVarianceAutomation * 100}
              onChange={handlePingVarianceChange}
            />
          </div>
        </DirectionalPanel>
        <AudioLoadPanel />
      </AccordionContainer>

      {AUDIO_RIG_ACCORDION_GROUPS.map((group) => (
        <AccordionContainer key={group.accordion.id} schema={group.accordion} style={getTraitColorStyle(AUDIO_RIG_GROUP_TRAIT[group.key])}>
          {group.key === 'eqFilters' ? (
            // Flattened (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.5) — eq3, filterLPF, and
            // filterHPF are 3 direct siblings of one PanelGroup, no intermediate grouping panel
            // and no shared facade (each keeps its own — see the "Separate facades" amendment).
            // Stacks one-per-row on mobile/tablet; on desktop they share one row as equal thirds
            // via PanelGroup.css's own default flex: 1 1 0 — no per-block override needed (a
            // straight 40/30/30 desktop split was tried and reverted; equal shares are exactly
            // what the shared equal-share contract already gives every other row for free).
            <PanelGroup orientation="responsive">
              {(['eq3', 'filterLPF', 'filterHPF'] as const).map((key) => <AudioRigEffectPanel key={key} effectKey={key} />)}
            </PanelGroup>
          ) : group.key === 'timeSpace' ? (
            <PanelGroup orientation="responsive">
              {group.blockKeys.map((key) => <AudioRigEffectPanel key={key} effectKey={key} />)}
            </PanelGroup>
          ) : (
            // 'output' — Compressor beside Limiter, fixed column (never shares a row, at any
            // breakpoint), wrapped so the two blocks get a real gap between them instead of
            // sitting flush with no spacing relationship at all.
            <PanelGroup orientation="column">
              {group.blockKeys.map((key) => <AudioRigEffectPanel key={key} effectKey={key} />)}
            </PanelGroup>
          )}
        </AccordionContainer>
      ))}
    </div>
  );
}

interface AudioRigEffectPanelProps {
  effectKey: AudioRigEffectKey;
}

/**
 * One effect block's own body (AudioRigLfoGroup-or-plain-params-map, plus the compressor-only
 * Decay Mode radio) — shared by every AUDIO_RIG_ACCORDION_GROUPS entry's flat stack and EQ &
 * Filters' own flattened row/column layout in AudioRigDrawer above.
 *
 * A real component (not a plain function called from AudioRigDrawer's own render, which is what
 * this was before) so it can subscribe to only ITS OWN slice of globalAudio, via its own
 * `effectKey`-scoped selector (bugfix, found via a manual re-render sweep, backlog item 18):
 * audioSwells.ts's own 16n tick (~8-9x/sec) writes to exactly one effect key at a time via
 * setGlobalAudio, and setGlobalAudio's own spread-one-key implementation (audioStore.ts)
 * already preserves every sibling effect's own object reference untouched — so subscribing to
 * the WHOLE globalAudio object (the old AudioRigDrawer-level select every panel used to share)
 * re-rendered all 7 panels on every tick, live or idle, regardless of which single effect the
 * active swell was actually targeting. Each panel now re-renders only when its own effect's
 * settings actually change. compressorBeforeDelay/lfoDrift are selected the same way — read
 * unconditionally every render (same call site regardless of effectKey, never skipped) so the
 * hook call itself never branches, only the selector's own returned value does.
 */
function AudioRigEffectPanel({ effectKey }: AudioRigEffectPanelProps) {
  const block = AUDIO_RIG_CONFIG.find((b) => b.key === effectKey)!;
  // Every param field on every effect is a number (GLOBAL_CHAIN_GRID.md has
  // no string/boolean params) — this cast is read-only and narrow, matching
  // audioStore.ts's own GLOBAL_SETTER cast for the same "dynamic key against
  // a closed-but-varying settings shape" situation.
  const effect = useAudioStore((s) => s.globalAudio[effectKey]) as unknown as Record<string, number>;
  const setGlobalAudio = useAudioStore((s) => s.setGlobalAudio);
  // Type predicate, not a plain truthy filter — proves lfoTarget is present to the type
  // system itself, so AudioRigLfoGroup's own params: LfoTargetedParamSchema[] needs no cast.
  const lfoFields = block.params.filter((p): p is LfoTargetedParamSchema => p.lfoTarget !== undefined);
  const driftGroup = LFO_DRIFT_GROUPS.find((g) => g.group === effectKey); // undefined for non-LFO blocks
  const drift = useAudioStore((s) => (driftGroup ? s.globalAudio.lfoDrift[driftGroup.group] : undefined));
  const setGlobalLfoDrift = useAudioStore((s) => s.setGlobalLfoDrift);
  // While the Audio Load dial keeps drift off, its sliders grey out (values kept). A boolean, so only a flip re-renders.
  const driftHeldOff = useAudioStore((s) => s.driftHeldOff);
  const compressorBeforeDelay = useAudioStore((s) => (effectKey === 'compressor' ? s.globalAudio.compressorBeforeDelay : undefined));
  const setCompressorBeforeDelay = useAudioStore((s) => s.setCompressorBeforeDelay);

  // Stabilized (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 12) — this used to be a plain
  // function, rebuilt fresh every render; every one of the ~9 call shapes below built its own
  // `(v) => updateParam(field, v)` inline from it, each a fresh function every render, which
  // defeated every memoized primitive's own React.memo bail-out (Tasks 1-11) regardless of how
  // many of them got memoized — the originally-reported bug (docs/todo/backlog.md #26): an
  // Audio Swell tick re-rendering the whole panel instead of just the swelling field.
  const updateParam = useCallback((field: string, value: number) => {
    setGlobalAudio(effectKey, { [field]: value } as Partial<GlobalAudioSettings[AudioRigEffectKey]>);
  }, [effectKey, setGlobalAudio]);
  // One pre-bound, stable onChange per field, keyed by field name. block.params is a stable
  // module-level reference (a slice of AUDIO_RIG_CONFIG, built once at import time — never
  // reconstructed), and updateParam is now stable per effectKey (above), so this whole map is
  // referentially stable across any re-render that doesn't change effectKey — which is every
  // re-render of a mounted AudioRigEffectPanel instance in practice. Chosen over a `useCallback`
  // at each of this file's ~9 distinct call shapes (paramRow's loop, the compressor special
  // case's 5 direct calls, AudioRigLfoGroup's own params.map, driftContent's 2 sliders, the Decay
  // Mode radio) since block.params' field set is already a stable, closed list per effect.
  const fieldOnChange = useMemo(() => {
    const map: Record<string, (v: number) => void> = {};
    for (const p of block.params) {
      map[p.field] = (v: number) => updateParam(p.field, v);
    }
    return map;
  }, [block.params, updateParam]);

  // Stabilized alongside fieldOnChange above — driftGroup is a stable reference across renders
  // of the same effectKey (LFO_DRIFT_GROUPS is a stable module-level array; .find() over it
  // returns the same object reference each time effectKey doesn't change), so these are safe
  // useCallback dependencies. Guarded rather than asserted non-null: the callback identity is
  // created unconditionally (Rules of Hooks), even though it's only ever wired into rendered
  // JSX when driftGroup is truthy (below).
  const handleRateDriftChange = useCallback((v: number) => {
    if (driftGroup) setGlobalLfoDrift(driftGroup.group, { rateDrift: v / 100 });
  }, [driftGroup, setGlobalLfoDrift]);
  const handleDepthDriftChange = useCallback((v: number) => {
    if (driftGroup) setGlobalLfoDrift(driftGroup.group, { depthDrift: v / 100 });
  }, [driftGroup, setGlobalLfoDrift]);
  const handleDecayModeChange = useCallback(
    (v: string) => setCompressorBeforeDelay(v === 'controlled'),
    [setCompressorBeforeDelay],
  );

  return (
    <div className="audio-rig-drawer__effect-block" key={block.key}>
      <DirectionalPanel schema={block.panel}>
        {lfoFields.length > 0 ? (
          <AudioRigLfoGroup
            groupId={`audioRig.${block.key}`}
            params={lfoFields}
            effect={effect}
            fieldOnChange={fieldOnChange}
            driftContent={driftGroup && drift && (
              <>
                <div className={withHeldOffClass('audio-rig-drawer__param-row', driftHeldOff)}>
                  <SliderCenteredZero
                    schema={driftGroup.rateSchema}
                    value={driftHeldOff ? 0 : drift.rateDrift * 100}
                    onChange={handleRateDriftChange}
                    disabled={driftHeldOff}
                  />
                </div>
                <div className={withHeldOffClass('audio-rig-drawer__param-row', driftHeldOff)}>
                  <SliderCenteredZero
                    schema={driftGroup.depthSchema}
                    value={driftHeldOff ? 0 : drift.depthDrift * 100}
                    onChange={handleDepthDriftChange}
                    disabled={driftHeldOff}
                  />
                </div>
                {driftHeldOff && <HeldOffNote />}
              </>
            )}
          />
        ) : block.key === 'compressor' ? (
          // Threshold+Ratio and Attack+Release are the only 2 "existing paired sub-rows" the
          // intent doc names as staying paired on desktop — 'responsive' stacks them on
          // mobile/tablet. Knee and the Decay Mode radio are NOT one of those named pairs, so
          // they de-nest entirely (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.8), each its
          // own direct param-row at every breakpoint — the same treatment Delay/Reverb's own
          // params already get (Task 8). This also resolves a pre-existing duplicate id
          // ('audioRig.compressor.bottomRow' used to be shared by 2 different panels).
          <>
            <DirectionalPanel schema={COMPRESSOR_TOP_ROW_SCHEMA}>
              {paramRow(findParam(block.params, 'threshold'), effect, fieldOnChange.threshold)}
              {paramRow(findParam(block.params, 'ratio'), effect, fieldOnChange.ratio)}
            </DirectionalPanel>
            <DirectionalPanel schema={COMPRESSOR_BOTTOM_ROW_SCHEMA}>
              {paramRow(findParam(block.params, 'attack'), effect, fieldOnChange.attack)}
              {paramRow(findParam(block.params, 'release'), effect, fieldOnChange.release)}
            </DirectionalPanel>
            {paramRow(findParam(block.params, 'knee'), effect, fieldOnChange.knee)}
            <div className="audio-rig-drawer__param-row">
              <RadioButton
                schema={DECAY_MODE_SCHEMA}
                value={compressorBeforeDelay ? 'controlled' : 'natural'}
                onChange={handleDecayModeChange}
              />
            </div>
          </>
        ) : (
          block.params.map((param) => paramRow(param, effect, fieldOnChange[param.field]))
        )}
      </DirectionalPanel>
    </div>
  );
}

export default AudioRigDrawer;
