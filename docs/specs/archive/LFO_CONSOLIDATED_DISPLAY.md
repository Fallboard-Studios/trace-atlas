# Phase Spec: Consolidated LFO Display

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/lfo-consolidated-display.md](../intent/lfo-consolidated-display.md) (confirmed via `/interview-me`, 2026-09-02). Related prior art: [docs/specs/LFO_DRIFT_GROUPS.md](LFO_DRIFT_GROUPS.md) (the drift-group data this phase relocates, not redesigns) and [docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md) (the `ControlSchema` primitive inventory and `AccordionContainer`/`isActive` conventions this phase builds on). This phase touches presentation only — no `AudioEngine`/`lfoEngine.ts` change, no new Zustand field, no new `LfoTargetId`/`DriftGroupId`.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

Every LFO-modulatable slider in the app currently renders as: `[slider]` immediately followed by its own nested `AccordionContainer` (schema `humanLabel: 'Modulation'`) wrapping one `Lfo` control. Three places do this:

| Location | Group unit | LFO-tied params per unit | Today's structure |
|---|---|---|---|
| `AudioRigDrawer.tsx` (`AUDIO_RIG_CONFIG`, [audioRigConfig.ts:66-129](../../src/data/audioRigConfig.ts#L66-L129)) | `eq3` | `low`, `mid`, `high` (3) | 1 parent accordion, 3 nested "Modulation" accordions |
| same | `filterLPF` | `frequency`, `Q` (2) | 1 parent accordion, 2 nested accordions |
| same | `filterHPF` | `frequency`, `Q` (2) | 1 parent accordion, 2 nested accordions |
| `SignatureArrayDrawer.tsx` (`SIGNATURE_ARRAY_CONFIG`, [robotOptionsConfig.ts:292-360](../../src/data/robotOptionsConfig.ts#L292-L360)) | each of `layer0`/`layer1`/`layer2` (Baseline/Coaxial/Harmonic) | `gain`, `detune`, `phase`, and `pulseWidth` when `type === 'pulse'` (3-4) | 1 parent accordion (Signature Array) holding 3 layer divs; each param inside a layer has its own nested accordion |
| `AudioSettingSection.tsx` | Volume | `volume` (1) | 1 nested "Modulation" accordion under the Volume slider (`VOLUME_LFO_ACCORDION_SCHEMA`, [robotOptionsConfig.ts:78-82](../../src/data/robotOptionsConfig.ts#L78-L82)) |

Additionally, `eq3`/`filterLPF`/`filterHPF` each have a **drift** control — one shared `{ rateDrift, depthDrift }` pair per group (`LFO_DRIFT_GROUPS`, [audioRigConfig.ts:249-254](../../src/data/audioRigConfig.ts#L249-L254)) — rendered today as a **separate standalone accordion block after all 7 effect blocks** ([AudioRigDrawer.tsx:133-160](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L133-L160)), not inside the effect's own accordion. A 4th drift group, `robots`, covers every `RobotLfoTargetId` collectively (all layers, all robots) — it has no per-layer or per-robot UI at all today, and per the confirmed intent, none is being added.

This phase replaces every "nested accordion per slider" instance above with: bare sliders, followed by **one shared LFO display per group unit** (per row in the table above — note `layer0`/`layer1`/`layer2` are three separate units, not one Signature-Array-wide unit), which shows whichever slider in that unit was last **targeted** (clicked, clicked-around, or keyboard-focused). Where a drift control already exists for that unit (`eq3`/`filterLPF`/`filterHPF` only), it moves to sit directly beneath the shared LFO display, still inside that unit's one existing parent accordion. No new accordion is ever nested inside another.

### 1.2 New shared component: `LfoTargetGroup`

A new primitive-adjacent component, `src/components/ui/controls/LfoTargetGroup.tsx`, is added and reused by all three consumer files (`AudioRigDrawer.tsx`, `SignatureArrayDrawer.tsx`, `AudioSettingSection.tsx`). It does **not** take a single `ControlSchema` the way the 14 primitives in `docs/COMPONENT_LIBRARY.md` do — it composes several already-rendered sliders plus one `Lfo` control — so it is documented as a new shared composition component (§6), not added to the `ControlSchema` union or the 14-primitive table.

```typescript
export interface LfoTargetGroupField<F extends string = string> {
  field: F;
  /** Shown as the shared display's own label when this field is targeted —
   *  reuses each param's existing schema.humanLabel (e.g. 'Mid', 'Coaxial Gain'),
   *  no new copy authored by this phase. */
  label: string;
  lfoValue: LfoValue;
}

export interface LfoTargetGroupProps<F extends string = string> {
  /** Unique per group unit — becomes the timelineMap key
   *  (`lfo-target-group-${groupId}`) and the id namespace for the internal
   *  Lfo control's own schema.id. E.g. 'audioRig.eq3', 'robotOptions.layer1',
   *  'robotOptions.volume'. */
  groupId: string;
  fields: LfoTargetGroupField<F>[];
  onLfoChange: (field: F, value: LfoValue) => void;
  disabled?: boolean;
  /** Rendered directly beneath the shared Lfo display, inside the same
   *  wrapper — only passed for eq3/filterLPF/filterHPF, which is the only
   *  place a per-group drift control exists today (§1.1). */
  driftContent?: ReactNode;
}
```

Each field's slider is still rendered by the **caller** (`AudioRigDrawer`/`SignatureArrayDrawer`/`AudioSettingSection` already own `renderParamControl`-style dispatch for their own schema shapes — that dispatch logic is untouched). `LfoTargetGroup` itself renders three things:

1. **Nothing extra around the sliders.** The caller wraps each slider in a row `<div>` with a `data-lfo-target-group-row` -style hookup (see §4) that calls the group's exposed `select(field)` on click *and* on focus (via the row's own `onFocus`, which fires when any interactive child — e.g. the Radix slider thumb — receives focus, since focus bubbles for this handler the same way `onClick` does). The row's own className gets `withActiveClass(..., selected === field)` — the plain targeted-selection class (§1.3), independent of the `Lfo` component's own `isActive` class.
2. **One shared `Lfo` display**, its `value` and `schema.humanLabel` driven by whichever field is currently targeted (§1.3 covers the transition state), its `onChange` calling `onLfoChange(selected, value)`.
3. **`driftContent`**, if passed, directly below the `Lfo` display — still inside the one wrapping `<div>`, no new `AccordionContainer`.

`LfoTargetGroup` returns `select`/`selected`/`isTargeted(field)` via a small internal hook rather than exposing them — the caller only needs to wrap each slider row with the class/handlers `LfoTargetGroup` hands back through a render-prop-shaped API (concretely: `LfoTargetGroup` takes a `renderField: (field: F, targeted: boolean, select: () => void) => ReactNode` instead of pre-rendered nodes, so the caller controls slider markup while `LfoTargetGroup` owns selection state — see §4 for the exact shape).

### 1.3 Selection state and the transition scaffold

Per the confirmed intent: selection is plain, ephemeral, local `useState` inside `LfoTargetGroup` — never Zustand (mirrors `AccordionContainer`'s own "open/closed is local ephemeral state" precedent, [docs/COMPONENT_LIBRARY.md § AccordionContainer](../COMPONENT_LIBRARY.md)). Default selection is the group's first field on mount.

Swapping the target does **not** directly flip `selected` from the old field to the new one. It goes through an explicit transition state, modeled the same way `AccordionContainer` models its own open/close animation — a GSAP timeline registered in `timelineMap`, not a raw timer (CLAUDE.md forbids `setTimeout`/`setInterval`/`requestAnimationFrame` for this repo's timing generally, and using one here would also contradict the explicit ask that this become GSAP-animated later):

```typescript
// LfoTargetGroup.tsx — internal state machine
const [selected, setSelected] = useState<F>(fields[0].field);
const [transitioning, setTransitioning] = useState(false);
const timelineKey = `lfo-target-group-${groupId}`;

useEffect(() => () => killTimeline(timelineKey), [timelineKey]);

function select(next: F) {
  if (next === selected) return;
  killTimeline(timelineKey);
  setTransitioning(true);
  // Today: an effectively-instant (0-duration) placeholder tween — the
  // scaffold a real crossfade/slide will extend later (duration, ease,
  // actual DOM targets) without changing this state machine's shape.
  const tl = gsap.timeline({
    onComplete: () => {
      setSelected(next);
      setTransitioning(false);
    },
  });
  tl.to({}, { duration: 0 });
  setTimeline(timelineKey, tl);
}
```

While `transitioning` is `true`, the `Lfo` display renders a **neutral placeholder value** — never the old field's values, never the new field's — and is itself `disabled`:

```typescript
const NEUTRAL_LFO_VALUE: LfoValue = { shape: 'sine', rate: LFO_RATE_MIN, depth: LFO_DEPTH_MIN, active: false };
```

(Same shape `lfoConfig.ts`'s private `makeDefaultLfoSettings()` and `CompanyOptionsSection.tsx`'s `DISABLED_AUDIO_SETTING.volumeLfo` already use for "unconfigured/placeholder" LFO values — no new convention invented.)

Two CSS hooks result, both via the existing `withActiveClass` helper ([activeClass.ts](../../src/components/ui/controls/activeClass.ts)):

- The targeted row: `withActiveClass('sc-lfo-target-group__row', selected === field)` — persists across a transition (it reflects the *committed* `selected`, updated only in the timeline's `onComplete`, per §1.4's assumption).
- The shared display: `withActiveClass('sc-lfo-target-group__display', transitioning)` — an `isActive` class here literally means "currently transitioning," matching this component's own domain concept, same pattern `Toggle`/`Lfo`/`AccordionContainer` already use for their own different domain concepts.

### 1.4 Assumptions surfaced for confirmation

Per this skill's "surface assumptions immediately" step — none of these were asked during `/interview-me` and are judgment calls made while translating intent into a concrete design. Flagged again in §7; correct now if wrong:

1. **The row's targeted class and the display's label update only once the transition completes** (in `onComplete`, alongside `selected` itself) rather than optimistically at click-time. This keeps exactly one state (`selected`) driving every visible consequence of "which field is targeted," rather than splitting "which row looks targeted" from "which field's values show" into two independently-updating pieces. Since the transition is 0-duration today, this is imperceptible either way — the choice only matters once real animation duration is added later.
2. **Clicking the already-targeted field's row is a no-op** (`select()` returns early when `next === selected`) — it does not retrigger a transition.
3. **Focus-triggered selection uses the row's `onFocus` (React's bubbling focus)**, not a `focusin` listener — so it fires when the slider thumb itself receives focus, without needing every slider primitive (`SliderLinear`/`SliderCenteredZero`/`SliderLog`/`RadioButton`) to take a new prop. No changes to those primitives.
4. **`pulseWidth` disappearing mid-selection:** if `pulseWidth` is targeted and the layer's `type` changes away from `'pulse'` (hiding that slider — existing `showPulseWidth` logic in `SignatureArrayDrawer.tsx`), `LfoTargetGroup` falls back to the group's first remaining field the next time its `fields` prop no longer contains the currently-selected one (a plain `useEffect` guard, not a user-visible "transition" — an edge case, not the normal path).

---

## 2. Target File Structure

```text
src/
├── components/
│   └── ui/controls/
│       ├── LfoTargetGroup.tsx       # NEW — the shared component, §1.2-1.3
│       ├── LfoTargetGroup.css       # NEW — .sc-lfo-target-group / __row / __display, isActive
│       │                              #   variants for both (targeted row, transitioning display)
│       └── LfoTargetGroup.test.tsx  # NEW — see §5
├── data/
│   ├── audioRigConfig.ts            # MODIFIED — AudioRigParamSchema drops `lfoAccordion`;
│   │                                  #   lfoAccordionSchema() helper removed (dead once nothing
│   │                                  #   renders it); LFO_DRIFT_GROUPS unchanged in shape (still
│   │                                  #   4 entries) — AudioRigDrawer now looks up the matching
│   │                                  #   entry per block instead of rendering all 4 in one loop
│   ├── audioRigConfig.test.ts       # MODIFIED — drop lfoAccordion-shape assertions per param
│   └── robotOptionsConfig.ts        # MODIFIED — SignatureArrayParamSchema drops `lfoAccordion`;
│                                      #   its lfoAccordionSchema() helper removed;
│                                      #   VOLUME_LFO_ACCORDION_SCHEMA removed entirely (no longer
│                                      #   wrapped in its own accordion — AudioSettingSection builds
│                                      #   its LfoTargetGroupField label from VOLUME_SCHEMA.humanLabel)
│   └── robotOptionsConfig.test.ts   # MODIFIED
├── components/panels/screen/console/
│   ├── AudioRigDrawer.tsx           # MODIFIED — §4. Each of eq3/filterLPF/filterHPF's per-param
│   │                                  #   row+nested-accordion loop becomes bare rows +
│   │                                  #   <LfoTargetGroup>; delay/reverb/compressor/limiter
│   │                                  #   unaffected (zero lfoTarget params, so no LfoTargetGroup
│   │                                  #   rendered for them). The standalone
│   │                                  #   LFO_DRIFT_GROUPS.map(...) block keeps rendering only the
│   │                                  #   'robots' entry; eq3/filterLPF/filterHPF's drift entries
│   │                                  #   are looked up per-block and passed as driftContent.
│   ├── AudioRigDrawer.css           # MODIFIED — new row-wrapper class if needed; no removal of
│   │                                  #   existing __param-row/__effect-block classes
│   └── AudioRigDrawer.test.tsx      # MODIFIED — see §5
├── components/robot/
│   ├── SignatureArrayDrawer.tsx     # MODIFIED — §4. Each layer's param loop keeps 'type' inline,
│   │                                  #   renders gain/detune/phase/(pulseWidth) as bare rows
│   │                                  #   through one <LfoTargetGroup> per layer (3 total in the
│   │                                  #   one Signature Array accordion, not 1 for the whole thing)
│   ├── SignatureArrayDrawer.css     # MODIFIED
│   ├── SignatureArrayDrawer.test.tsx # MODIFIED — see §5
│   ├── AudioSettingSection.tsx      # MODIFIED — Volume's nested VOLUME_LFO_ACCORDION_SCHEMA
│   │                                  #   accordion replaced by one <LfoTargetGroup> with a single
│   │                                  #   field — same shape as every other group, N=1
│   ├── AudioSettingSection.css      # MODIFIED
│   └── AudioSettingSection.test.tsx # MODIFIED — see §5
docs/
└── COMPONENT_LIBRARY.md   # MODIFIED — new section documenting LfoTargetGroup as a shared
                             #   composition component (not a ControlSchema primitive, not added
                             #   to the 14-row table) — see §6
```

**Explicitly not touched, and why:**

- `src/components/company/CompanyOptionsSection.tsx`, `src/components/panels/screen/console/RobotOptionsTab.tsx`, `src/systems/robotOptionsActions.ts`, `src/systems/companyOptions.ts` — all three consumer components (`AudioSettingSection`, `SignatureArrayDrawer`, and by extension `AudioRigDrawer`) keep their existing `value`/`onChange` contracts unchanged; this is purely an internal-rendering restructure, so every call site that already wires them (robot mode and company-broadcast mode alike) needs no change. This is exactly why the intent doc's "company/all robot interfaces" requirement is satisfied automatically (docs/intent/lfo-consolidated-display.md's own Constraint section).
- `src/engine/lfoEngine.ts`, `src/engine/lfoDrift.ts`, `src/stores/audioStore.ts`, `src/types/lfo.ts`, `src/types/globalAudio.ts` — no audio-engine, scheduling, or Zustand-shape change. `setGlobalLfo`/`setGlobalLfoDrift`/`applyLayerLfo`/`applyVolumeLfo` are all called with the exact same arguments as today, just from a different place in the render tree.
- `src/components/ui/controls/Lfo.tsx`, `AccordionContainer.tsx`, `SliderLinear.tsx`/`SliderLog.tsx`/`SliderCenteredZero.tsx`/`RadioButton.tsx` — reused completely as-is. `Lfo.tsx` already accepts `schema.humanLabel`/`loreLabel` (it's `ControlSchemaBase`, [controls.ts:93-95](../../src/types/controls.ts#L93-L95)) — the "show the targeted param's name" requirement needs no new prop on `Lfo` itself, just a schema built per-render with the current target's label.
- `src/types/controls.ts` — no new `ControlSchema` variant; `LfoTargetGroup` is not schema-driven the way the 14 primitives are (§1.2).

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No accordions nested inside accordions, anywhere this phase touches.** `LfoTargetGroup`'s output (bare rows, one `Lfo`, optional drift sliders) is plain content directly inside the one `AccordionContainer` that already wraps `eq3`/`filterLPF`/`filterHPF`, each Signature Array layer's parent (Signature Array's own single accordion), and Volume's row inside `AudioSettingSection`. This is the entire point of the phase (CLAUDE.md's "UI Shell" / this repo's existing `AccordionContainer` doc: "a single independent collapsible section... not a group coordinator").
* **Selection state stays local, ephemeral, and outside Zustand.** `LfoTargetGroup`'s `selected`/`transitioning` state is component-local `useState`, matching `AccordionContainer`'s own precedent — never written to `uiStore` or `audioStore`. (CLAUDE.md: "State must stay in Zustand and remain JSON-serializable... keep runtime-only/presentational state out of it" — ephemeral UI selection is exactly the kind of value that precedent already excludes.)
* **The transition state goes through `timelineMap` (GSAP), never a raw timer.** No `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in `LfoTargetGroup`. `killTimeline` runs on unmount, mirroring `AccordionContainer.tsx`'s own cleanup effect exactly.
* **`sc-` CSS prefix.** `LfoTargetGroup` lives in `src/components/ui/controls/` alongside the 14 existing primitives — its own classes (`sc-lfo-target-group`, `__row`, `__display`) follow that folder's established `sc-` convention (docs/COMPONENT_LIBRARY.md § Primitives), even though it isn't itself one of the 14 `ControlSchema`-driven primitives.
* **Grouping granularity is fixed at 3 layers + 3 global effects + Volume — this phase does not build a generic N-level grouping system.** Signature Array's 3 layers are 3 separate `LfoTargetGroup` instances (one per layer), never 1 covering all 12 sliders; `eq3`/`filterLPF`/`filterHPF` are each their own instance; Volume is its own single-field instance. No new "group of groups" abstraction.
* **`driftContent` is only ever passed for `eq3`/`filterLPF`/`filterHPF`.** The standalone `robots` drift block stays exactly where it is today — a sibling block after the 7 effect accordions, per the confirmed intent's explicit "leave it exactly where it is" answer. `LfoTargetGroup` itself has no opinion on drift beyond rendering whatever `ReactNode` it's handed; it does not know about `DriftGroupId` or `LfoDriftGroupSchema` at all (keeps the component reusable by `SignatureArrayDrawer`/`AudioSettingSection`, neither of which has any drift content to pass).
* **No new copy for field labels.** Every `LfoTargetGroupField.label` reuses an existing `schema.humanLabel` already defined in `audioRigConfig.ts`/`robotOptionsConfig.ts` (`'Low'`/`'Mid'`/`'High'`, `'Frequency'`/`'Resonance'`, `'Baseline Gain'`/`'Coaxial Detune'`/etc., `'Volume'`) — no new lore/human copy authored by this phase.
* **No actual animation this phase.** The GSAP timeline in §1.3 is a 0-duration scaffold — do not add real `duration`/`ease`/DOM crossfade tweens now; that's explicitly deferred (confirmed intent's Out of scope).

---

## 4. Code Style & Architecture Conventions

**`components/ui/controls/LfoTargetGroup.tsx`** (full shape — render-prop field rendering, per §1.2's closing note):

```typescript
import { useEffect, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { Lfo } from './Lfo';
import { withActiveClass } from './activeClass';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import { LFO_RATE_MIN, LFO_DEPTH_MIN } from '@/types/lfo';
import type { LfoValue } from '@/types/controls';
import './LfoTargetGroup.css';

const NEUTRAL_LFO_VALUE: LfoValue = { shape: 'sine', rate: LFO_RATE_MIN, depth: LFO_DEPTH_MIN, active: false };

export interface LfoTargetGroupField<F extends string = string> {
  field: F;
  label: string;
  lfoValue: LfoValue;
}

export interface LfoTargetGroupProps<F extends string = string> {
  groupId: string;
  fields: LfoTargetGroupField<F>[];
  onLfoChange: (field: F, value: LfoValue) => void;
  /** Caller renders its own slider for `field`; `targeted` and `select` wire
   *  the row's className and click/focus handlers. Keeps every existing
   *  per-schema-type slider dispatch (renderParamControl in AudioRigDrawer,
   *  the switch in SignatureArrayDrawer) exactly where it already lives. */
  renderField: (field: F, targeted: boolean, select: () => void) => ReactNode;
  disabled?: boolean;
  driftContent?: ReactNode;
}

export function LfoTargetGroup<F extends string = string>({
  groupId, fields, onLfoChange, renderField, disabled, driftContent,
}: LfoTargetGroupProps<F>) {
  const [selected, setSelected] = useState<F>(fields[0].field);
  const [transitioning, setTransitioning] = useState(false);
  const timelineKey = `lfo-target-group-${groupId}`;

  useEffect(() => () => killTimeline(timelineKey), [timelineKey]);

  // Falls back if the currently-selected field disappears from `fields`
  // (e.g. pulseWidth hidden when layer type leaves 'pulse' — §1.4 item 4).
  useEffect(() => {
    if (!fields.some((f) => f.field === selected)) {
      killTimeline(timelineKey);
      setSelected(fields[0].field);
      setTransitioning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  function select(next: F) {
    if (next === selected) return;
    killTimeline(timelineKey);
    setTransitioning(true);
    const tl = gsap.timeline({ onComplete: () => { setSelected(next); setTransitioning(false); } });
    tl.to({}, { duration: 0 }); // scaffold — real crossfade timing lands later
    setTimeline(timelineKey, tl);
  }

  const activeField = fields.find((f) => f.field === selected)!;
  const displayValue = transitioning ? NEUTRAL_LFO_VALUE : activeField.lfoValue;
  const displayLabel = transitioning ? undefined : activeField.label;

  return (
    <div className="sc-lfo-target-group">
      {fields.map((f) => (
        <div key={f.field} className={withActiveClass('sc-lfo-target-group__row', f.field === selected)}>
          {renderField(f.field, f.field === selected, () => select(f.field))}
        </div>
      ))}
      <div className={withActiveClass('sc-lfo-target-group__display', transitioning)}>
        <Lfo
          schema={{ id: `${groupId}.lfo`, type: 'lfo', humanLabel: displayLabel }}
          value={displayValue}
          onChange={(v) => onLfoChange(selected, v)}
          disabled={disabled || transitioning}
        />
      </div>
      {driftContent}
    </div>
  );
}

export default LfoTargetGroup;
```

**`AudioRigDrawer.tsx`** (diff — `eq3`/`filterLPF`/`filterHPF`'s param loop; `block.params.map` for `delay`/`reverb`/`compressor`/`limiter` stays exactly as today, since none of their params carry `lfoTarget`):

```tsx
const driftGroup = LFO_DRIFT_GROUPS.find((g) => g.group === block.key); // undefined for non-LFO blocks
const lfoFields = block.params.filter((p) => p.lfoTarget);

return (
  <div className="audio-rig-drawer__effect-block" key={block.key}>
    {/* ...unchanged header/Toggle... */}
    <AccordionContainer schema={block.accordion} contentActive={effect.enabled}>
      {block.params.map((param) => (
        <div className="audio-rig-drawer__param-row" key={param.field}>
          {renderParamControl(param, effect[param.field], (v) => updateParam(param.field, v), blockDisabled)}
        </div>
      ))}
      {lfoFields.length > 0 && (
        <LfoTargetGroup
          groupId={`audioRig.${block.key}`}
          fields={lfoFields.map((p) => ({ field: p.field, label: p.schema.humanLabel ?? p.field, lfoValue: globalLfo[p.lfoTarget!] }))}
          onLfoChange={(field, value) => setGlobalLfo(lfoFields.find((p) => p.field === field)!.lfoTarget!, value)}
          disabled={blockDisabled}
          renderField={(field) => null /* row already rendered above — see note below */}
          driftContent={driftGroup && (
            <div className="audio-rig-drawer__param-row">
              <SliderCenteredZero schema={driftGroup.rateSchema} value={globalAudio.lfoDrift[driftGroup.group].rateDrift * 100}
                onChange={(v) => setGlobalLfoDrift(driftGroup.group, { rateDrift: v / 100 })} disabled={rigDisabled} />
              <SliderCenteredZero schema={driftGroup.depthSchema} value={globalAudio.lfoDrift[driftGroup.group].depthDrift * 100}
                onChange={(v) => setGlobalLfoDrift(driftGroup.group, { depthDrift: v / 100 })} disabled={rigDisabled} />
            </div>
          )}
        />
      )}
      {block.key === 'compressor' && ( /* ...unchanged Decay Mode row... */ )}
    </AccordionContainer>
  </div>
);
```

> **Note on `renderField` above:** `AudioRigDrawer`'s existing param rows are rendered *before* `LfoTargetGroup` (so `updateParam`'s existing closure/dispatch stays untouched), not through `renderField`. This means `AudioRigDrawer`'s call site needs each row's own `onClick`/`onFocus`/targeted-class applied directly, via a small piece of `LfoTargetGroup`'s public surface exposed for exactly this case (a `useLfoTargetSelection`-style hook alternative to the render-prop form). **This is flagged as an open design choice in §7** — the render-prop form above is clean for `SignatureArrayDrawer`/`AudioSettingSection` (which can render each row entirely through `renderField`), but `AudioRigDrawer`'s current two-pass structure (params rendered once for `updateParam`, a second conceptual pass for LFO wiring) fits more naturally with an exported hook (`useLfoTargetGroup(groupId, fields)` returning `{ selected, transitioning, select, displayValue, displayLabel }`) that both `LfoTargetGroup` (wrapping it for the render-prop callers) and `AudioRigDrawer` (using it directly against its own already-rendered rows) can share. Resolve this during Plan/Tasks — the state machine (§1.3) is correct either way; only the public API shape (component-with-render-prop vs. exported hook vs. both) is open.

**`SignatureArrayDrawer.tsx`** (diff — per layer, using the render-prop form directly since rows aren't pre-rendered elsewhere):

```tsx
const lfoParams = block.params.filter((p) => p.field !== 'type' && (p.field !== 'pulseWidth' || showPulseWidth));

return (
  <div key={block.key} className="signature-array-drawer__layer" data-layer-key={block.key}>
    {block.activeSchema && <Toggle ... />}
    {/* 'type' RadioButton rendered inline exactly as today — no LFO, stays grouped with the rest */}
    <RadioButton schema={typeParam.schema as RadioButtonSchema} value={layer.type} onChange={handleTypeChange} disabled={disabled} />
    <LfoTargetGroup
      groupId={`robotOptions.${block.key}`}
      fields={lfoParams.map((p) => ({
        field: p.field,
        label: (p.schema as SliderLinearSchema | SliderCenteredZeroSchema).humanLabel ?? p.field,
        lfoValue: value.lfoSettings?.[p.lfoTarget!] ?? { ...DEFAULT_LFO_SETTINGS[p.lfoTarget!], active: false },
      }))}
      onLfoChange={(field, v) => onLfoChange(lfoParams.find((p) => p.field === field)!.lfoTarget!, v)}
      disabled={disabled}
      renderField={(field) => {
        const param = lfoParams.find((p) => p.field === field)!;
        const paramVal = paramValue(layer, field);
        const onChange = handleParamChange(field);
        return field === 'detune'
          ? <SliderCenteredZero schema={param.schema as SliderCenteredZeroSchema} value={paramVal} onChange={onChange} disabled={disabled} />
          : <SliderLinear schema={param.schema as SliderLinearSchema} value={paramVal} onChange={onChange} disabled={disabled} />;
      }}
    />
  </div>
);
```

**`AudioSettingSection.tsx`** (diff — Volume's row):

```tsx
<div className="audio-setting-section__row">
  <LfoTargetGroup
    groupId="robotOptions.volume"
    fields={[{ field: 'volume', label: VOLUME_SCHEMA.humanLabel!, lfoValue: value.volumeLfo }]}
    onLfoChange={(_field, v) => onVolumeLfoChange(v)}
    disabled={disabled}
    renderField={() => (
      <SliderLinear schema={VOLUME_SCHEMA} value={value.masterVolume * 100} onChange={onVolumeChange} disabled={disabled} />
    )}
  />
</div>
```

* **Naming conventions:** `LfoTargetGroup` (PascalCase file/component), `groupId` strings follow the existing dotted-id convention (`audioRig.eq3`, `robotOptions.layer1`, `robotOptions.volume`) already used throughout `audioRigConfig.ts`/`robotOptionsConfig.ts`. CSS: `sc-lfo-target-group` root, `__row`/`__display` BEM-style elements, `isActive` state class via `withActiveClass` — exactly `AccordionContainer`'s own convention.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest (+ React Testing Library for every `.tsx` test below).
* **Test File Location:** Colocate, matching every file in §2.
* **`LfoTargetGroup.test.tsx` (new):**
  1. Defaults to the first field in `fields` on mount — its row carries the targeted class, its `Lfo` display shows that field's `lfoValue`/`label`.
  2. Clicking a different field's row (via its `renderField`-provided `select` callback) moves the targeted class to that row and updates the display's value/label to that field's — asserted after the (0-duration) transition timeline resolves.
  3. During the transition (before the timeline's `onComplete` fires — assert this with a manually-controlled/mocked `gsap.timeline` or by asserting the intermediate synchronous state directly), the display shows neither the old nor the new field's real values (`NEUTRAL_LFO_VALUE`), and carries the transitioning class.
  4. Focus-triggered selection: focusing a row's rendered control (simulated via the row wrapper's `onFocus`) selects it, same as click.
  5. Selecting the already-targeted field is a no-op — no new timeline created (`killTimeline`/`setTimeline` not called again).
  6. When the currently-selected field disappears from a new `fields` prop (the `pulseWidth`-hidden case, §1.4 item 4), selection falls back to `fields[0]` without user interaction.
  7. `onLfoChange` is called with the currently-selected field and the new value when the `Lfo` control fires `onChange`.
  8. Unmounting calls `killTimeline` for `lfo-target-group-${groupId}`.
  9. `driftContent`, when passed, renders inside the same wrapper, below the `Lfo` display, not inside any accordion.
* **`AudioRigDrawer.test.tsx` (modified):**
  - `eq3`/`filterLPF`/`filterHPF` each render exactly one `LfoTargetGroup`-driven display (not one per param) inside their own accordion; `delay`/`reverb`/`compressor`/`limiter` render none.
  - Selecting a different EQ band updates which `globalLfo` entry the shared `Lfo`'s `onChange` writes to.
  - `eq3`/`filterLPF`/`filterHPF`'s drift sliders render inside that block's own accordion (not in a separate trailing block); the standalone trailing block now contains only the `robots` drift group.
  - No nested `AccordionContainer` renders inside `eq3`'s/`filterLPF`'s/`filterHPF`'s own accordion (assert accordion count per block).
* **`SignatureArrayDrawer.test.tsx` (modified):**
  - Each of the 3 layers renders exactly one `LfoTargetGroup`; `type`'s `RadioButton` renders inline alongside the group's rows, not inside `LfoTargetGroup` itself, and not separated from the other layer controls.
  - Toggling a layer's `type` to/from `'pulse'` shows/hides the `pulseWidth` row and, when it was selected and disappears, falls back per §1.4 item 4 (covered at the `LfoTargetGroup` unit level already — this test only needs to confirm `fields` is passed correctly here).
  - Company-mode-shaped `value` (partial `lfoSettings`) still resolves each field's `lfoValue` via the existing `DEFAULT_LFO_SETTINGS` fallback, unchanged from today's per-param logic.
* **`AudioSettingSection.test.tsx` (modified):** Volume renders through `LfoTargetGroup` with one field; no `AccordionContainer` wraps it anymore; `onVolumeLfoChange` still fires correctly.
* **`audioRigConfig.test.ts` (modified):** `AudioRigParamSchema`'s closed-shape assertions drop `lfoAccordion`; `LFO_DRIFT_GROUPS` assertions unchanged (still 4 entries — this phase doesn't touch that array's own shape, only how `AudioRigDrawer` consumes it).
* **`robotOptionsConfig.test.ts` (modified):** `SignatureArrayParamSchema` drops `lfoAccordion` from its closed-shape assertions; `VOLUME_LFO_ACCORDION_SCHEMA` export assertion removed.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (surfaces any remaining reference to the removed `lfoAccordion` field or `VOLUME_LFO_ACCORDION_SCHEMA`).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** Open the Audio Rig, expand 3-Band EQ — confirm Low/Mid/High render as three bare sliders, one shared LFO display below labeled with whichever band was last clicked, and the EQ Drift sliders directly beneath that display, still inside the EQ's own accordion (not the old trailing standalone block). Click each band in turn and confirm the display's label and values update, and the just-clicked band's row is visibly targeted. Repeat for Low-Pass/High-Pass Filter. Open a robot's Signature Array — confirm Baseline/Coaxial/Harmonic each show their own bare sliders + one shared LFO display (3 total, not 1 for the whole drawer), and toggling Harmonic's type to `pulse`/back shows/hides Interval correctly without breaking the shared display. Confirm Volume shows the same bare-slider-plus-display shape. Repeat the EQ check inside a Company's bulk-edit panel to confirm the shared component behaves identically there.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** add a short section after "Primitives" (§ Primitives table) titled something like "Shared composition components" introducing `LfoTargetGroup` — its purpose (one shared LFO display per group of LFO-tied sliders), why it isn't a 15th `ControlSchema` primitive (it composes caller-rendered sliders + one `Lfo`, not a single schema-driven leaf control), and a pointer to this spec for the full design.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** TBD at Tasks time — suggest `feature/lfo-consolidated-display`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `LfoTargetGroup.tsx`/`.css` + its own test, standalone with no consumer wired yet, (2) `audioRigConfig.ts`'s `lfoAccordion` removal + `AudioRigDrawer.tsx` wiring (+ tests), (3) `robotOptionsConfig.ts`'s `lfoAccordion`/`VOLUME_LFO_ACCORDION_SCHEMA` removal + `SignatureArrayDrawer.tsx` wiring (+ test), (4) `AudioSettingSection.tsx` wiring (+ test), (5) `docs/COMPONENT_LIBRARY.md`.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code, not left open):

- ~~One shared LFO display per parent accordion, or per functionally-independent unit within it?~~ **Resolved: per unit** — Signature Array's 3 layers get 3 separate displays, not 1 (intent doc, confirmed).
- ~~Does the "Robot Drift" standalone knob move anywhere?~~ **Resolved: no, stays exactly where it is** — it isn't scoped to one effect's accordion (intent doc, confirmed).
- ~~Does Volume (single LFO, no group) get restructured too?~~ **Resolved: yes** — for visual consistency and because more sliders may be added to that section later (intent doc, confirmed).
- ~~Should the target-swap animate now?~~ **Resolved: no — but it must go through a real transition *state*, classed out, values genuinely neutral during it, scaffolded for real animation later** (intent doc, confirmed; §1.3 is the direct implementation of this answer).

Still open — flag for Plan/Tasks, not blocking this spec:

1. **`LfoTargetGroup`'s public API shape** (§4's note under the `AudioRigDrawer` diff): render-prop component vs. an exported hook (`useLfoTargetGroup`) vs. both. `AudioRigDrawer`'s existing two-pass rendering (params via `renderParamControl` first, LFO wiring conceptually after) fits a hook better than the render-prop form that suits `SignatureArrayDrawer`/`AudioSettingSection` more naturally. Pick one shape (or export both, the hook underlying the component) during Tasks — the underlying state machine (§1.3) is unaffected either way.
2. **Whether the targeted row's class/label update should be optimistic (immediate on click) or deferred to `onComplete`** (§1.4 item 1) — a genuine judgment call, not confirmed during interview. Currently spec'd as deferred, for the single reason that one state (`selected`) then drives every visible consequence. Revisit if, once real animation duration lands later, an instant "this is now the targeted row" click response feels more responsive than waiting out even a short transition.
3. **`Lfo`'s `schema.humanLabel` typed as `string | undefined`** — passing `undefined` during the transition (§4's `displayLabel`) relies on `Lfo`'s existing `DualLabel` already handling an absent label by rendering nothing (`docs/COMPONENT_LIBRARY.md`'s own "DualLabel renders whichever subset of the pair is present — neither... renders nothing"). No code change needed to `DualLabel`/`Lfo` for this to work; confirm this reads acceptably during the manual check (§5) rather than looking like a missing label.
4. **`Lfo`'s own internal `disabled` prop** is passed as `disabled || transitioning` (§4) so the neutral placeholder can't be edited mid-transition — confirm this doesn't visually read as "broken/greyed out" for a transition meant to be imperceptible; if it does, an alternative is skipping `disabled` and relying solely on the 0-duration timeline completing before a user could plausibly interact with it.
