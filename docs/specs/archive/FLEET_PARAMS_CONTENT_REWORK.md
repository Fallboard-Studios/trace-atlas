# Phase Spec: Fleet Params Content Rework

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/fleet-params-content-rework.md](../intent/fleet-params-content-rework.md) (confirmed via `/interview-me`, 2026-09-25). Related prior art: [docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md](NAV_PANEL_VIEWS_AND_CONTENT.md) (the single-scrollable-view model, `useSectionObserver`, lazy-mount-on-approach this phase builds on), [docs/specs/NAV_LAYOUT_REWRITE.md](NAV_LAYOUT_REWRITE.md) (Task 14 — the per-leaf `AudioRigEffectPanel` split this phase re-wraps), and [docs/specs/COLOR_SCHEME_TRAIT_THEMING.md](COLOR_SCHEME_TRAIT_THEMING.md) (`getTraitColorStyle`, the trait pairs this phase reuses unchanged). This phase touches presentation/layout only — no `AudioEngine`, `audioRigConfig.ts` param schema, Zustand shape, or `Trait` union change.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

`FleetParamsContent.tsx` currently renders (see [FleetParamsContent.tsx:138-161](../../src/components/panels/screen/nav/content/FleetParamsContent.tsx#L138-L161)):

```
<div ref={sectionAnchorRef('fleetParams')}>
  <IntroPanel .../>                          {/* section-level intro, already correct */}
  {FLEET_PARAMS_GROUPS.map(group => (
    <div>
      <div ref={sectionAnchorRef(group.nodeId)}>{group.humanLabel}</div>   {/* bare heading, no accordion */}
      {group.leaves.map(leaf => (
        <AccordionContainer schema={leaf-scoped} ...>    {/* one accordion PER LEAF */}
          <AudioRigEffectPanel effectKey={leaf.effectKey} />
        </AccordionContainer>
      ))}
    </div>
  ))}
</div>
```

Only `pacing` (rendered via the same `FLEET_PARAMS_GROUPS.map` above, so it already gets this same per-leaf-accordion shape today — Tempo and Automatic Intensity each get their own `AccordionContainer`) was intended to be the odd one out with a single shared accordion, per this file's own header comment ([FleetParamsContent.tsx:14-18](../../src/components/panels/screen/nav/content/FleetParamsContent.tsx#L14-L18)) — but the code doesn't actually special-case it; `PACING_ACCORDION_SCHEMA`/`PACING_TEMPO_ID`/`PACING_AUTOMATIC_EFFECTS_ID` are declared and used only by the `useSectionObserver`/`useAccordionOpenState` calls above the JSX (lines 104-123), never by the render loop itself. This is the "failed spectacularly" gap named in the intent doc: the intended one-accordion-per-group shape exists in comments and unused constants, not in the rendered markup.

This phase makes every one of the 4 groups (Pacing, EQ & Filters, Time & Space, Output) actually render as: **one group-level accordion → one group-level `IntroPanel` → N leaf sections with no accordion of their own** — and wraps the whole thing in one always-open, spectral-traited outer panel.

### 1.2 Target render shape

```
<div class="fleet-params-content" style={spectral}>          {/* NEW — outer wrapper, §1.3 */}
  <IntroPanel loreLabel="Fleet Params LORE TITLE" trait="spectral" .../>   {/* unchanged position, same instance */}

  {FLEET_PARAMS_GROUPS.map(group => (
    <AccordionContainer schema={group-scoped} style={getTraitColorStyle(group.trait)}>  {/* NEW — was a bare heading div */}
      <IntroPanel loreLabel={`${group.humanLabel} LORE TITLE`} trait={group.trait} .../>  {/* NEW */}
      {group.leaves.map(leaf => (
        <div ref={sectionAnchorRef(leaf.id)}>            {/* anchor kept — NO AccordionContainer anymore */}
          <AudioRigEffectPanel effectKey={leaf.effectKey} />   {/* or AudioRigDrawer, for automaticEffects — §1.4 */}
        </div>
      ))}
    </AccordionContainer>
  ))}
</div>
```

Every group accordion is independently open/closeable (`useAccordionOpenState`, unchanged hook, now called once per group's `nodeId` instead of once for `PACING_ACCORDION_SCHEMA.id` alone). `hasApproached`-gated lazy mount continues to apply per leaf, exactly as today ([FleetParamsContent.tsx:153](../../src/components/panels/screen/nav/content/FleetParamsContent.tsx#L153)) — now also applied to each group's own `IntroPanel` render (gated on the group's own `hasApproached`, so an `IntroPanel` doesn't mount before its accordion has been scrolled to), matching the section-level `IntroPanel`'s existing ungated (always-mounted) treatment being kept **only** at the top level.

### 1.3 The outer wrapper

A new plain `<div className="fleet-params-content">` (no `AccordionContainer` — confirmed non-collapsible) replaces the current bare `<div ref={sectionAnchorRef('fleetParams')}>`. It carries `style={getTraitColorStyle('spectral')}`, matching `fleetParams`'s own `trait: 'spectral'` in [navTreeConfig.ts:56](../../src/data/navTreeConfig.ts#L56). The `sectionAnchorRef('fleetParams')` ref moves onto this same div (no separate wrapper needed). A new co-located `FleetParamsContent.css` file is added purely for this one class — today this component has no CSS file of its own (every visual is delegated to children).

### 1.4 Pacing's 2 leaves: Tempo and Automatic Intensity need real wiring, not just re-wrapping

Pacing's 2 leaves cannot both go through the generic `AudioRigEffectPanel effectKey={leaf.effectKey}` path every other leaf uses, because neither `tempo` nor `automaticEffects` is a normal effect-chain block:

- **`tempo`** *is* present in `AUDIO_RIG_CONFIG` ([audioRigConfig.ts:85-95](../../src/data/audioRigConfig.ts#L85-L95), one param, `BPM_SCHEMA`) — but `AudioRigEffectPanel` reads/writes its value via `s.globalAudio[effectKey]` / `setGlobalAudio(effectKey, ...)` ([AudioRigDrawer.tsx:308-309,327-329](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L308-L309)), and `GlobalAudioSettings` ([globalAudio.ts:65](../../src/types/globalAudio.ts#L65)) has **no `tempo` key at all** — live BPM is a wholly separate top-level store field, `audioStore.bpm`/`setBPM` ([audioStore.ts:105,139,226,238-242](../../src/stores/audioStore.ts#L105)), by design (`BPM_SCHEMA`'s own comment: "a bare Rig-wide meta-setting... not a per-effect param"). Rendering `<AudioRigEffectPanel effectKey="tempo" />` as-is would read `undefined` off `globalAudio.tempo` and silently do nothing on drag — this is a **live bug**, not a hypothetical, and this phase fixes it as part of the leaf-rendering rework (confirmed in-scope by Crawford directly, 2026-09-25: "the tempo slider and the automatic effects slider should still change BPM and pingVarianceAutomation despite this move").
- **`automaticEffects`** has no `AUDIO_RIG_CONFIG` block at all — its real control (`pingVarianceAutomation`/`setPingVarianceAutomation`, correctly wired already) lives entirely inside the standalone `AudioRigDrawer` component ([AudioRigDrawer.tsx:252-277](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L252-L277)), which `FleetParamsContent.tsx` currently imports but never renders.

This phase's leaf loop therefore special-cases these 2 keys instead of calling `AudioRigEffectPanel` for them:

```tsx
{group.leaves.map((leaf) => (
  <div key={leaf.id} ref={sectionAnchorRef(leaf.id)}>
    {hasApproached(leaf.id) && (
      leaf.effectKey === 'tempo' ? <TempoControl /> :
      leaf.effectKey === 'automaticEffects' ? <AudioRigDrawer /> :
      <AudioRigEffectPanel effectKey={leaf.effectKey} />
    )}
  </div>
))}
```

`TempoControl` is a small new component/inline block in `FleetParamsContent.tsx` (not `AudioRigDrawer.tsx` — `tempo`'s `AUDIO_RIG_CONFIG` entry and `BPM_SCHEMA` stay where they are, only how it's *rendered* changes) reading `useAudioStore((s) => s.bpm)` / `s.setBPM`, rendering one `SliderLinear` with `BPM_SCHEMA`, wrapped in `getTraitColorStyle('composition')` (Pacing's own group trait, matching `AUDIO_RIG_EFFECT_TRAIT.tempo`) — the same visual shape `AudioRigEffectPanel`'s own `audio-rig-drawer__effect-block` wrapper gives every other leaf, just reading/writing the correct store field instead of `globalAudio`. No unit conversion needed (`BPM_SCHEMA`'s own comment: `audioStore.bpm` is already stored in the slider's own display units).

`AudioRigDrawer` (the existing, already-correct component) is rendered directly for `automaticEffects` — no changes needed to it at all; this phase's only fix here is actually calling it from the leaf loop instead of leaving the import dead.

### 1.5 Group/leaf accordion schema and trait wiring

```typescript
// One AccordionSchema per group, replacing PACING_ACCORDION_SCHEMA as the only real instance —
// now built for all 4 groups uniformly instead of one hand-written constant.
const groupSchema: AccordionSchema = { id: group.nodeId, type: 'accordion', humanLabel: group.humanLabel };
```

Group trait comes from a new `FLEET_PARAMS_GROUP_TRAIT: Record<FleetParamsGroup, Trait>` map colocated in `FleetParamsContent.tsx`, mirroring `AUDIO_RIG_EFFECT_TRAIT`'s existing per-effect map shape but at group granularity: `{ pacing: 'composition', eqFilters: 'spectral', timeSpace: 'timeSpace', output: 'output' }` — these are the exact same 4 trait values `navTreeConfig.ts` already assigns each group node (lines 66/77/90/100) and `AUDIO_RIG_EFFECT_TRAIT` already assigns each group's own leaves, so no new trait/value is invented, only restated at the granularity this component now needs. `FLEET_PARAMS_GROUPS` (the existing array in `FleetParamsContent.tsx`, §1.6 File Structure) gains a `trait: Trait` field per group rather than introducing a parallel lookup map, keeping one source of truth per group definition (matches how `FLEET_PARAMS_GROUPS` already carries `nodeId`/`humanLabel`/`leaves` together).

Leaves no longer receive their own `AccordionSchema`/`AccordionContainer`/`getTraitColorStyle` call from `FleetParamsContent.tsx` — `AudioRigEffectPanel` already colors its own `audio-rig-drawer__effect-block` wrapper via `AUDIO_RIG_EFFECT_TRAIT[effectKey]` internally ([AudioRigDrawer.tsx:364](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L364)), unchanged by this phase — so a leaf's own content still carries its per-effect color even though it's no longer separately boxed in an accordion.

---

## 2. Target File Structure

```text
src/
├── components/
│   └── panels/screen/nav/content/
│       ├── FleetParamsContent.tsx    # MODIFIED — §1.2-1.5: outer wrapper div, FLEET_PARAMS_GROUPS
│       │                               #   gains `trait: Trait`, group-level AccordionContainer +
│       │                               #   IntroPanel added, per-leaf AccordionContainer removed,
│       │                               #   PACING_ACCORDION_SCHEMA/PACING_TEMPO_ID/
│       │                               #   PACING_AUTOMATIC_EFFECTS_ID dead constants removed
│       │                               #   (superseded by the uniform per-group loop); NEW
│       │                               #   `TempoControl` component (§1.4) reading/writing
│       │                               #   audioStore.bpm/setBPM directly, replacing the broken
│       │                               #   `AudioRigEffectPanel effectKey="tempo"` path; the
│       │                               #   already-imported-but-unused `AudioRigDrawer` is now
│       │                               #   actually rendered for the automaticEffects leaf
│       ├── FleetParamsContent.css    # NEW — .fleet-params-content (outer wrapper only)
│       └── FleetParamsContent.test.tsx  # MODIFIED — existing file, extended per §5
```

**Explicitly not touched, and why:**

- `src/components/panels/screen/console/AudioRigDrawer.tsx` — internals unchanged (both `AudioRigEffectPanel` and `AudioRigDrawer` keep their exact current props/behavior); the only change is on the calling side (`FleetParamsContent.tsx` now actually renders `AudioRigDrawer` for the `automaticEffects` leaf instead of leaving the import unused — §1.4). `AUDIO_RIG_EFFECT_TRAIT` stays as the per-leaf color source for every `AudioRigEffectPanel`-rendered leaf's own content block.
- `src/data/audioRigConfig.ts`, `src/data/robotOptionsConfig.ts` — no param schema, block config, or `AudioRigEffectKey` change.
- `src/data/navTreeConfig.ts`, `src/components/panels/screen/nav/useNavTree.ts` — the nav tree's own group/leaf structure, labels, and traits are already correct (this phase's group traits are read *from* the same values, not changed); scrollspy/highlight wiring (`setSelectedFleetParamsEffect`, `useSectionObserver` calls) is unchanged.
- `src/components/panels/screen/nav/useAccordionOpenState.ts`, `useSectionObserver.ts`, `src/utils/sectionRefs.ts` — reused as-is; this phase changes *how many times* `useAccordionOpenState`/`sectionAnchorRef` are called and *for which ids*, not their own implementation.
- `src/components/ui/controls/AccordionContainer.tsx`, `IntroPanel.tsx` — reused completely unchanged.
- `src/utils/traitColors.ts`, `src/types/traits.ts` — no new `Trait` value; `getTraitColorStyle` called with existing values only.
- `src/stores/uiStore.ts` — `FleetParamsGroup`/`SelectedFleetParamsEffect` types and `setSelectedFleetParamsEffect` action unchanged.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No accordion nested inside another accordion.** The outer Fleet Params wrapper is a plain, non-collapsible `<div>` (confirmed via `/interview-me`) — never an `AccordionContainer`. Each of the 4 groups gets exactly one `AccordionContainer`; leaves render as plain anchor `<div>`s with no `AccordionContainer` of their own (CLAUDE.md's "UI Shell" guardrail's spirit — no nested collapsible-in-collapsible anywhere this phase touches).
* **Trait coloring only at 2 levels within this component:** the outer wrapper (`'spectral'`, fixed) and each group accordion (`FLEET_PARAMS_GROUP_TRAIT[group.id]`). `FleetParamsContent.tsx` itself never calls `getTraitColorStyle` for an individual leaf rendered via `AudioRigEffectPanel` — that stays `AudioRigEffectPanel`'s own internal concern, unchanged. The one exception is the new `TempoControl` (§1.4), which — having no `AudioRigEffectPanel` wrapper of its own to color it — calls `getTraitColorStyle('composition')` directly, matching `AUDIO_RIG_EFFECT_TRAIT.tempo`.
* **Zero hardcoded lore/human copy strings beyond the placeholder convention.** Every new `IntroPanel` instance (one per group, 4 total) uses `loreLabel={`${group.humanLabel} LORE TITLE`}` and lorem-ipsum-style placeholder text for `loreDescription`/`humanDescription`, matching the section-level `IntroPanel`'s own existing placeholder shape ([FleetParamsContent.tsx:132-137](../../src/components/panels/screen/nav/content/FleetParamsContent.tsx#L132-L137)) — not real authored copy (confirmed: real copy is a separate future pass).
* **No Zustand shape change.** `useAccordionOpenState`'s per-group open/closed state stays local component state exactly as it is today for Pacing (CLAUDE.md: state must stay JSON-serializable in Zustand; ephemeral open/closed UI state is explicitly excluded from that requirement, matching every other `AccordionContainer` consumer in this codebase).
* **Scrollspy/highlight behavior must not regress.** `useSectionObserver`'s 2 existing calls (top-level `sectionIds` covering `PACING_ACCORDION_SCHEMA.id` + every leaf id, and the Pacing-subsection-only second call) are refactored to the new uniform per-group shape without changing what `setSelectedFleetParamsEffect` receives for any given scroll position — every leaf id (`fleetParams.pacing.tempo`, `fleetParams.eqFilters.eq`, etc.) and every group id (`fleetParams.pacing`, `fleetParams.eqFilters`, etc.) keeps observing and resolving to the exact same `SelectedFleetParamsEffect` value it does today.
* **Lazy-mount gating (`hasApproached`) is preserved per leaf** (`AudioRigEffectPanel` only mounts once its own leaf anchor has been observed, exactly as today) **and extended to each group's new `IntroPanel`** (mounts once the group's own accordion anchor has been observed) — the section-level `IntroPanel` stays ungated (always mounted), unchanged.

---

## 4. Code Style & Architecture Conventions

**`FleetParamsContent.tsx`** (full replacement of the group-definition + render sections; imports/hooks/observer wiring above stay in the same file, adjusted per §3's last bullet):

```typescript
interface FleetParamsGroupDef {
  id: FleetParamsGroup;
  nodeId: string;
  humanLabel: string;
  trait: Trait;                    // NEW field
  leaves: FleetParamsLeaf[];
}

const FLEET_PARAMS_GROUPS: FleetParamsGroupDef[] = [
  {
    id: 'pacing',
    nodeId: 'fleetParams.pacing',
    humanLabel: 'Pacing',
    trait: 'composition',          // matches navTreeConfig.ts's fleetParams.pacing trait
    leaves: [
      { id: 'fleetParams.pacing.tempo', humanLabel: 'Tempo', effectKey: 'tempo' },
      { id: 'fleetParams.pacing.automaticEffects', humanLabel: 'Automatic Intensity', effectKey: 'automaticEffects' },
    ],
  },
  {
    id: 'eqFilters',
    nodeId: 'fleetParams.eqFilters',
    humanLabel: 'EQ & Filters',
    trait: 'spectral',
    leaves: [
      { id: 'fleetParams.eqFilters.eq', humanLabel: '3-Band EQ', effectKey: 'eq3' },
      { id: 'fleetParams.eqFilters.hpf', humanLabel: 'High-Pass Filter', effectKey: 'filterHPF' },
      { id: 'fleetParams.eqFilters.lpf', humanLabel: 'Low-Pass Filter', effectKey: 'filterLPF' },
    ],
  },
  {
    id: 'timeSpace',
    nodeId: 'fleetParams.timeSpace',
    humanLabel: 'Time & Space',
    trait: 'timeSpace',
    leaves: [
      { id: 'fleetParams.timeSpace.reverb', humanLabel: 'Reverb', effectKey: 'reverb' },
      { id: 'fleetParams.timeSpace.delay', humanLabel: 'Delay', effectKey: 'delay' },
    ],
  },
  {
    id: 'output',
    nodeId: 'fleetParams.output',
    humanLabel: 'Output',
    trait: 'output',
    leaves: [
      { id: 'fleetParams.output.compression', humanLabel: 'Compressor', effectKey: 'compressor' },
      { id: 'fleetParams.output.limiter', humanLabel: 'Limiter', effectKey: 'limiter' },
    ],
  },
];

export function FleetParamsContent() {
  const setSelectedFleetParamsEffect = useUIStore((s) => s.setSelectedFleetParamsEffect);

  const groupIds = FLEET_PARAMS_GROUPS.map((g) => g.nodeId);
  const leafIds = ALL_LEAVES.map((l) => l.id);
  const sectionIds = ['fleetParams', ...groupIds, ...leafIds];
  useSectionObserver(sectionIds, (id) => {
    const group = FLEET_PARAMS_GROUPS.find((g) => g.nodeId === id);
    if (group) {
      setSelectedFleetParamsEffect(group.leaves[0].effectKey);
      return;
    }
    const leaf = ALL_LEAVES.find((l) => l.id === id);
    if (leaf) setSelectedFleetParamsEffect(leaf.effectKey);
  });

  const { isOpen, setOpen, hasApproached } = /* combine useAccordionOpenState (per-group, keyed
    internally by group.nodeId — same hook, no signature change) with a hasApproached from
    useSectionObserver above, exposed the same way FleetParamsContent already exposes it today */;

  // §1.4 — tempo/automaticEffects can't go through the generic AudioRigEffectPanel path.
  function renderLeaf(effectKey: SelectedFleetParamsEffect) {
    if (effectKey === 'tempo') return <TempoControl />;
    if (effectKey === 'automaticEffects') return <AudioRigDrawer />;
    return <AudioRigEffectPanel effectKey={effectKey} />;
  }

  return (
    <div ref={sectionAnchorRef('fleetParams')} className="fleet-params-content" style={getTraitColorStyle('spectral')}>
      <IntroPanel
        loreLabel="Fleet Params LORE TITLE"
        loreDescription={PLACEHOLDER_LORE}
        humanDescription={PLACEHOLDER_HUMAN}
        trait="spectral"
      />
      {FLEET_PARAMS_GROUPS.map((group) => {
        const schema: AccordionSchema = { id: group.nodeId, type: 'accordion', humanLabel: group.humanLabel };
        return (
          <div key={group.nodeId} ref={sectionAnchorRef(group.nodeId)}>
            <AccordionContainer
              schema={schema}
              open={isOpen(group.nodeId)}
              onOpenChange={(open) => setOpen(group.nodeId, open)}
              style={getTraitColorStyle(group.trait)}
            >
              {hasApproached(group.nodeId) && (
                <IntroPanel
                  loreLabel={`${group.humanLabel} LORE TITLE`}
                  loreDescription={PLACEHOLDER_LORE}
                  humanDescription={PLACEHOLDER_HUMAN}
                  trait={group.trait}
                />
              )}
              {group.leaves.map((leaf) => (
                <div key={leaf.id} ref={sectionAnchorRef(leaf.id)}>
                  {hasApproached(leaf.id) ? renderLeaf(leaf.effectKey) : null}
                </div>
              ))}
            </AccordionContainer>
          </div>
        );
      })}
    </div>
  );
}

// §1.4 — replaces the broken AudioRigEffectPanel effectKey="tempo" path. Reads/writes
// audioStore.bpm/setBPM directly (not globalAudio, which has no `tempo` key), reusing
// BPM_SCHEMA/AUDIO_RIG_EFFECT_TRAIT.tempo ('composition') as-is — no new schema/trait authored.
function TempoControl() {
  const bpm = useAudioStore((s) => s.bpm);
  const setBPM = useAudioStore((s) => s.setBPM);
  return (
    <div className="audio-rig-drawer__effect-block" style={getTraitColorStyle('composition')}>
      <div className="audio-rig-drawer__param-row">
        <SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={setBPM} />
      </div>
    </div>
  );
}
```

> **Note on the `useAccordionOpenState` call:** today's single call (`useAccordionOpenState(PACING_ACCORDION_SCHEMA.id)`) picks one `defaultOpenId`. With 4 real group accordions, this phase keeps calling it once, still with a single `defaultOpenId` — `FLEET_PARAMS_GROUPS[0].nodeId` (`'fleetParams.pacing'`), so the view isn't all-collapsed on first render and exactly one group starts open, matching this hook's own documented "opens exactly one accordion on mount" contract ([useAccordionOpenState.ts:17](../../src/components/panels/screen/nav/useAccordionOpenState.ts#L17)). No change to the hook itself — `isOpen`/`setOpen` are already keyed by arbitrary id strings, so passing any of the 4 `nodeId`s works today.

* **Naming conventions:** `FLEET_PARAMS_GROUP_TRAIT` naming is dropped in favor of inlining `trait` directly on `FleetParamsGroupDef` (§ above) — one source of truth per group, matching this file's own existing preference for one flat array over parallel lookup maps (see the file's own header comment on `FLEET_PARAMS_GROUPS` being "kept as one flat source here since this content component... decides stacking/accordion order"). CSS: `fleet-params-content` (plain kebab-case, not `sc-`-prefixed, since this is a content/layout component, not a `ui/controls` primitive — matches `AudioRigDrawer.tsx`'s own `audio-rig-drawer` class precedent).
* **Formatting:** Matches the file's existing style exactly — no reformatting beyond the lines actually changing. Dead constants (`PACING_ACCORDION_SCHEMA`, `PACING_TEMPO_ID`, `PACING_AUTOMATIC_EFFECTS_ID`) are deleted, not left commented out.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** `FleetParamsContent.test.tsx`, colocated — already exists; extend its current coverage per the cases below rather than replacing it wholesale.
* **Test cases:**
  1. Renders exactly one outer wrapper carrying the `'spectral'` trait's CSS custom properties (assert via `getTraitColorStyle('spectral')`'s own output, matching whatever assertion style `AudioRigDrawer.test.tsx`/similar already use for trait-styled wrappers).
  2. Renders exactly 4 `AccordionContainer` instances (one per group) — not 8 (the old per-leaf count, 2+3+2+2 minus Pacing's un-rendered 2 = today's actual 7, since Pacing wasn't really special-cased — confirm the exact "before" count during Tasks by reading current test output, not assumed here).
  3. Each group's accordion is independently open/closeable — opening EQ & Filters does not close Pacing (`useAccordionOpenState`'s existing per-id independence, already covered generically by that hook's own tests — this test only needs to confirm `FleetParamsContent` wires 4 distinct ids into it, not `'fleetParams.pacing'` reused for all 4).
  4. Each group's `IntroPanel` only mounts after that group's own anchor `hasApproached` (assert it's absent before the observer fires, present after — same pattern the existing per-leaf `hasApproached` gate should already have a test for; extend rather than duplicate).
  5. No `AccordionContainer` renders for any individual leaf (`fleetParams.pacing.tempo`, `fleetParams.eqFilters.eq`, etc.) — only the 4 group-level ones.
  6. Scrolling to (intersecting) a group's own anchor calls `setSelectedFleetParamsEffect` with that group's first leaf's `effectKey` (e.g. entering `fleetParams.eqFilters` sets `'eq3'`) — mirrors today's `PACING_ACCORDION_SCHEMA.id → 'tempo'` special case, now generalized to all 4 groups.
  7. Scrolling to a leaf's own anchor still calls `setSelectedFleetParamsEffect` with that leaf's own `effectKey`, unchanged from today.
  8. Every `IntroPanel`'s `loreLabel` follows the `"${humanLabel} LORE TITLE"` convention (section: `"Fleet Params LORE TITLE"`; each group: e.g. `"EQ & Filters LORE TITLE"`).
  9. The Tempo leaf renders `TempoControl`, not `AudioRigEffectPanel` — dragging its slider calls `setBPM` with the new value, and its displayed value tracks `audioStore.bpm` (mock/set the store value and assert the slider reflects it). Confirms the previous `globalAudio.tempo` (nonexistent field) read is gone.
  10. The Automatic Intensity leaf renders `AudioRigDrawer` — dragging its slider calls `setPingVarianceAutomation`, and its displayed value tracks `audioStore.pingVarianceAutomation`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** Open Fleet Params in the app. Confirm: one outer panel with a visibly distinct (spectral) tint behind everything; the section `IntroPanel` at the top; 4 accordions below it (Pacing/EQ & Filters/Time & Space/Output), each a different tint matching its trait when opened; opening EQ & Filters shows its own `IntroPanel` then EQ/HPF/LPF stacked with no collapse triangles of their own; the same for Time & Space (Reverb/Delay) and Output (Compressor/Limiter); Pacing shows the same shape (its own `IntroPanel`, then Tempo/Automatic Intensity stacked, no per-leaf accordion) — drag the Tempo slider and confirm the app's actual playback tempo changes (not just the slider's own displayed number), and drag Automatic Intensity and confirm it still visibly affects ping variance automation, exactly as it did before this rework. Confirm opening one group doesn't close another. Confirm clicking each leaf/group in the nav tree still scrolls to and highlights correctly, matching pre-rework behavior.

---

## 6. Documentation & Git/Workflow Context

* **Docs update:** None required beyond this spec and the source intent doc — `docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md` already documents the general single-scrollable-view/lazy-mount model this phase specializes for Fleet Params; no separate doc currently claims Fleet Params' specific accordion nesting in a way that needs correcting (confirmed: `NAV_PANEL_VIEWS_AND_CONTENT.md` was not found to assert per-leaf accordions for this branch specifically during research for this spec — verify during Tasks if it turns out to).
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** Current branch (`content/nav-and-console-content`) already has in-flight, uncommitted changes touching `FleetParamsContent.tsx`/`AudioRigDrawer.tsx`/`IntroPanel.tsx` — continue on this branch unless directed otherwise.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) add `trait` to `FleetParamsGroupDef`/`FLEET_PARAMS_GROUPS` + the new `FleetParamsContent.css` outer-wrapper class, (2) group-level `AccordionContainer` + `IntroPanel` wiring, removing per-leaf `AccordionContainer` and the dead `PACING_*` constants, (3) `FleetParamsContent.test.tsx` coverage for the new shape.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code, not left open):

- ~~Is the outer Fleet Params wrapper itself collapsible?~~ **Resolved: no, plain always-open container** (interview-me, confirmed).
- ~~Do leaves keep any accordion of their own?~~ **Resolved: no — only the 4 groups get an accordion; leaves are plain sections** (interview-me, confirmed).
- ~~What lore copy goes in the new group-level `IntroPanel`s?~~ **Resolved: placeholder only, `"${Section Title} LORE TITLE"` convention** (interview-me, confirmed).
- ~~Does Pacing get special-cased differently from the other 3 groups?~~ **Resolved: no — all 4 groups share one identical structure; Pacing's *intended* shape (not its current, incompletely-wired code) is the template** (interview-me, confirmed).
- ~~Do Tempo/Automatic Intensity need real wiring as part of this phase?~~ **Resolved: yes — Tempo must still drive `audioStore.bpm` via `setBPM`, and Automatic Intensity must still drive `pingVarianceAutomation` via `setPingVarianceAutomation`, despite the leaf/accordion restructure** (Crawford, direct follow-up, 2026-09-25). §1.4 covers the concrete fix: `AudioRigEffectPanel effectKey="tempo"` is currently broken (reads a nonexistent `globalAudio.tempo`) and is replaced by a new `TempoControl` bound to `audioStore.bpm`/`setBPM` directly; `automaticEffects` renders the existing, already-correct `AudioRigDrawer` component, which this file imports today but never calls.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Exact "before" per-leaf `AccordionContainer` count for the test in §5.2** — stated as needing confirmation at Tasks time rather than guessed here, since the current code's own comments (Pacing as a "shared accordion" already) don't match what actually renders (§1.1).
2. **LFO target-selection styling** (mentioned in the intent doc's EQ & Filters note) is explicitly out of scope for this phase — flagged here only so it isn't accidentally folded into this rework's tasks.

## Out of scope

(Carried from the intent doc, restated for this spec's own boundary.)

- Real lore/human copy for any `IntroPanel` — placeholders only.
- Styling the LFO target-selection state (`AudioRigLfoGroup`'s `isTargeted` row class).
- Any change to leaf-level control logic, param schemas, or `audioRigConfig.ts` beyond what §1.4 requires (`TempoControl` reads the existing `BPM_SCHEMA`/`audioStore.bpm` as-is; `AudioRigDrawer`'s own internals are untouched).
