# Phase Spec: Robot Options Tab Memoization

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/todo/backlog.md #27](../todo/backlog.md#27-robot-options-whole-panel-re-renders-on-any-single-field-edit)
(filed 2026-09-15, found live by Crawford on the Robot Options screen). Same bug *class* as
items 21-26 (a value update forcing more re-render than the change actually needs), and
specifically the exact follow-up item 26's own spec predicted and deferred
(`docs/specs/OBLIQUE_CABINETRY_MEMOIZATION.md` §1.4/§7.5: "RobotOptionsTab... likely needs the
identical treatment in its own follow-up pass"). Not a Crawford feature request; no paired
`docs/intent/*.md`.

---

## 1. Overview & Claude Explanation

### 1.1 The actual mechanism, confirmed via code reading

Reported symptom: the Robot Options screen's accordions re-render frequently during ordinary
single-robot editing, "even when no company is selected" — ruling out `CompanyOptionsSection`
(the separate company-broadcast call site for the same 5 shared components) as the trigger, and
ruling out any ticking/interval-driven store value (confirmed: `RobotOptionsTab` and every
component in its subtree read only `selectedRobotId` and the matching robot record out of
`localeStore` — no subscription to `activeLocaleLocalTime` or any other tick-driven field).

`RobotOptionsTab.tsx` (`src/components/panels/screen/console/RobotOptionsTab.tsx:67-121`) derives
3 value objects and passes 4 sections (`AudioSettingSection`, `PingControlsDrawer`,
`PingContourDrawer`, `SignatureArrayDrawer`) plus one display-only section
(`RobotDisplaySection`), all inline in its own render body:

```typescript
// RobotOptionsTab.tsx:67-86 — rebuilt fresh on every render
const audioSettingValue: AudioSettingValue = { /* ... */ };
const pingControlsValue: PingControlsValue = { /* ... */ };
const signatureArrayValue: SignatureArrayValue = { /* ... */ };

// RobotOptionsTab.tsx:88-121 — every onChange a fresh closure, every `style` a fresh object
<div className="robot-options" style={getRobotColorStyle(robot.identityColor)}>
  <RobotDisplaySection robot={robot} />
  <AudioSettingSection
    value={audioSettingValue}
    onAudioModeChange={(mode) => applyAudioMode(robot, localeId, mode)}
    // ...
    style={getTraitColorStyle('output')}
  />
  {/* PingControlsDrawer, PingContourDrawer, SignatureArrayDrawer: same shape */}
</div>
```

None of the 5 section components are `React.memo`-wrapped (confirmed via
`grep -n "^export function\|React.memo" src/components/robot/*.tsx` — zero `React.memo` matches
in this directory). So any single field edit anywhere in the panel — a slider drag calls e.g.
`applyDensity(robot, localeId, v)` → `localeStore` update → the `robot` selector
(`RobotOptionsTab.tsx:48-51`) returns a new object reference → `RobotOptionsTab` re-renders —
cascades into **all 5 sections re-executing**, not just the one the user touched. Each section
then hands a newly-built `style`/`children` ref into its own already-memoized
`AccordionContainer` (item 26), which bails out on nothing because those props are never stable
— the exact mechanism item 26 fixed for `AudioRigDrawer.tsx`, unaddressed here.

### 1.2 Three sub-issues found reading the actual section components, not just RobotOptionsTab

**1.2.1 `AudioSettingSection.tsx:97` builds its `Lfo` schema prop inline every render:**

```typescript
// AudioSettingSection.tsx:96-101 — today
<Lfo
  schema={{ id: 'robotOptions.volume.lfo', type: 'lfo', humanLabel: displayLabel }}
  value={displayValue}
  onChange={(v) => onVolumeLfoChange(v)}
  disabled={disabled || transitioning}
/>
```

`Lfo` is already `React.memo`-wrapped (`Lfo.tsx:113`) specifically so a caller passing a stable
`schema` lets it bail — this is the **identical instability item 26's own round-1
live-verification found and fixed** in `AudioRigLfoGroup` (`bba6767`). Reproduced here at a
different call site the original spec didn't touch (`AudioSettingSection` composes `Lfo`
directly, not through `AudioRigDrawer.tsx`).

**1.2.2 `PingContourDrawer.tsx:50,54` builds 2 `DirectionalPanel` schema objects inline:**

```typescript
// PingContourDrawer.tsx:50,54 — today
<DirectionalPanel schema={{ id: 'robotOptions.pingContour.topRow', type: 'directionalPanel', orientation: 'responsive' }}>
<DirectionalPanel schema={{ id: 'robotOptions.pingContour.bottomRow', type: 'directionalPanel', orientation: 'responsive' }}>
```

Unlike every other schema in this codebase (always a stable, module-level reference — item 26
§1.3 documented this as the established convention), these 2 are constructed at call time. They
don't depend on any prop or state, so this is the simplest of the 3 sub-issues to fix: hoist both
to module-level constants, matching the convention rather than reaching for `useMemo`.

**1.2.3 `RobotDisplaySection.tsx:44,46` rebuilds a schema and a handler every render:**

```typescript
// RobotDisplaySection.tsx:43-48 — today
const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
const companyAssignmentSchema = buildCompanyAssignmentSchema(companies); // fresh object every render
const handleCompanyChange = (value: string) => { /* ... */ };            // fresh closure every render
```

`companyAssignmentSchema` genuinely depends on `companies` (a per-locale array that only changes
when a company is actually added/removed/edited) — needs `useMemo` keyed on `companies`, not a
module-level hoist. `handleCompanyChange` closes over `localeId`/`robot.id`, both per-render
values — needs `useCallback`. **Important limitation, confirmed while researching this spec:**
unlike the other 4 sections, `RobotDisplaySection`'s sole prop is the **entire** `robot: Robot`
object (`RobotOptionsTab.tsx:90`, `<RobotDisplaySection robot={robot} />`), not a narrowed
per-field value object. Since `RobotOptionsTab` only re-renders in the first place *because* its
`robot` selector returned a new reference, that same new `robot` reference is what gets handed to
`RobotDisplaySection` on literally every edit, including edits to fields `RobotDisplaySection`
never reads (`rhythmicDensity`, ADSR, layers, etc.). Wrapping it in `React.memo` is still safe
(§1.4's "no worse off than today" reasoning) and the two internal fixes above are still worth
doing on their own hygiene merits, but **`React.memo` alone will not stop `RobotDisplaySection`
from re-rendering on every field edit** the way it will for the other 4 sections — that would
need `RobotOptionsTab` to derive and pass it a narrowed value object instead of the whole `robot`
(the same shape change items 12/14 etc. already gave every other section), which is a real prop-
contract change to a component whose own docstring currently states the opposite ("no `robot`
prop, no store access" is the pattern the *other* sections follow; this one is documented as the
deliberate exception). Out of scope here — flagged, not silently claimed as fixed. This also
happens to match the reported symptom precisely: `RobotDisplaySection` is **not** one of the
accordions (its own docstring: "not an AccordionContainer... always-visible header block") — the
4 sections Crawford described as "the accordions" are exactly the 4 this spec's fix actually
stops from cascading.

### 1.3 Why "just wrap the 5 sections in `React.memo`" isn't enough on its own

Same precondition chain item 26 §1.2 already established for `AudioRigDrawer.tsx`, applied here:
a bare `React.memo(AudioSettingSection)` would change nothing by itself, because
`RobotOptionsTab` still hands it a fresh `value` object and fresh `onChange` closures every
render. The fix has two independent halves, both required:

1. **`React.memo` the 5 section components** (`RobotDisplaySection`, `AudioSettingSection`,
   `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`) — safe to ship
   unconditionally, same reasoning item 26 §1.4 used for the 14 primitives: a memoized component
   with an unstabilized caller is no worse off than today.
2. **Stabilize `RobotOptionsTab.tsx`'s own construction of `value`/`onChange`/`style`** via
   `useMemo`/`useCallback` — this is the half that actually determines whether the memoized
   sections get to bail.

### 1.4 Scope: `RobotOptionsTab` only, not `CompanyOptionsSection`

`CompanyOptionsSection.tsx` (`src/components/company/CompanyOptionsSection.tsx`) is the other
call site for the same 4 schema-driven drawers (`AudioSettingSection`/`PingControlsDrawer`/
`PingContourDrawer`/`SignatureArrayDrawer`) and has the **identical** unstabilized-inline-object/
closure pattern (fresh `resolved`-derived value objects, fresh per-member-broadcast closures, on
every render). It was not the call site Crawford reported ("even when no company is selected"
rules it out as today's trigger), and this spec deliberately doesn't touch it — same "prove it on
the one measured/reported case first" scoping items 21→22 and item 26 §1.4 both already used.
Flagged in backlog item 27 as an identical-pattern follow-up.

Wrapping the 4 shared drawer components in `React.memo` (§1.3 point 1) benefits
`CompanyOptionsSection` automatically once it's given the same `useMemo`/`useCallback`
stabilization treatment in its own follow-up pass — it gets zero regression from this spec
either way (an unstabilized caller of a memoized component re-renders exactly as often as it
does today, never worse).

### 1.5 No other judgment calls requiring sign-off

Same as item 26 §1.5 — `React.memo`/`useMemo`/`useCallback` are the only tools in play, no
architectural fork to choose between. The one scope decision (§1.4) is resolved by precedent.

---

## 2. Target File Structure

```text
src/
├── components/
│   ├── panels/screen/console/
│   │   ├── RobotOptionsTab.tsx        # MODIFIED — useMemo the 3 value objects + the 2
│   │   │                                #   getTraitColorStyle results (module-level consts,
│   │   │                                #   since 'output'/'composition'/'timeSpace'/'spectral'
│   │   │                                #   are literal constants, not derived from props/state)
│   │   │                                #   + getRobotColorStyle(robot.identityColor) (useMemo,
│   │   │                                #   keyed on robot.identityColor); useCallback every
│   │   │                                #   onXChange
│   │   └── RobotOptionsTab.test.tsx    # MODIFIED — new re-render cascade regression test
│   └── robot/
│       ├── RobotDisplaySection.tsx      # MODIFIED — React.memo; useMemo companyAssignmentSchema
│       │                                 #   (keyed on companies); useCallback handleCompanyChange
│       ├── RobotDisplaySection.test.tsx # MODIFIED — memo-behavior test
│       ├── AudioSettingSection.tsx      # MODIFIED — React.memo; useMemo the inline Lfo schema
│       │                                 #   (keyed on displayLabel, matching Lfo.tsx's own
│       │                                 #   schema.id-keying precedent)
│       ├── AudioSettingSection.test.tsx # MODIFIED — memo-behavior + schema-stability tests
│       ├── PingControlsDrawer.tsx       # MODIFIED — React.memo (no internal instability found)
│       ├── PingControlsDrawer.test.tsx  # MODIFIED — memo-behavior test
│       ├── PingContourDrawer.tsx        # MODIFIED — React.memo; hoist the 2 inline
│       │                                 #   DirectionalPanel schemas to module-level constants
│       ├── PingContourDrawer.test.tsx   # MODIFIED — memo-behavior test
│       ├── SignatureArrayDrawer.tsx     # MODIFIED — React.memo (RobotDriftPanel, the inner
│       │                                 #   component with its own useAudioStore subscription,
│       │                                 #   is unaffected — it re-renders independently of its
│       │                                 #   parent either way; not touched)
│       └── SignatureArrayDrawer.test.tsx # MODIFIED — memo-behavior test
```

**Explicitly not touched, and why:**

- `CompanyOptionsSection.tsx` — flagged as an identical-pattern follow-up (§1.4), not fixed here.
- `SignatureArrayDrawer.tsx`'s per-layer `handleTypeChange`/`handleParamChange` closures, built
  inside its own `.map()` — this component re-renders as one whole unit on any of its own value
  changes regardless (it's not sub-divided into per-layer memoized children), so stabilizing
  these wouldn't reduce anything the `React.memo` boundary at the component's own outer edge
  doesn't already handle. Same reasoning as leaving `voxelTrackMath.ts` itself untouched in item
  26 — the fix belongs at the boundary that actually bails, not every internal closure.
- `LfoTargetGroup`/`useLfoTargetGroup.ts` — not part of this bug; `SignatureArrayDrawer` composes
  `LfoTargetGroup` (the shared wrapper component), not `useLfoTargetGroup` (the hook) directly,
  and neither is implicated in the cascade described here.
- The `RobotOptionsTab.css`/other `.css` files — no styling change.
- `docs/COMPONENT_LIBRARY.md` — unchanged; these 5 components aren't part of the 14-primitive
  Design System it documents.

---

## 3. Implementation Boundaries & Constraints

- **Strict Scope:** Touch only the files listed in §2.
- **Zero visual/behavioral regression:** every section's rendered output and interactive behavior
  (edit a field, drag a slider, toggle Click Track, change Octave Range, reassign a company)
  must be identical to today's. Pure performance refactor — every existing test for every touched
  file must pass unmodified.
- **No custom `React.memo` comparator anywhere** — every real prop across these 5 components is
  either a primitive, a stable schema object (once fixed), or a plain value/callback object the
  parent now hands over stably. If implementation finds an exception, fix the instability at its
  source rather than reaching for a comparator.
- **Per CLAUDE.md:** no `setTimeout`/`setInterval`/`requestAnimationFrame` introduced or touched.
  No GSAP architecture change — `useLfoTargetGroup`'s existing `timelineMap` usage
  (`AudioSettingSection`'s internal LFO-target transition) is untouched. No Zustand state shape
  changes — `useMemo`/`useCallback` dependency arrays read existing store-derived values, they
  don't add new ones.
- **`RobotDisplaySection`'s `companyAssignmentSchema` must stay correctly reactive to `companies`
  changing** (a company being added/removed/renamed elsewhere) — its `useMemo` dependency array
  must include `companies`, not be memoized away entirely.

---

## 4. Code Style & Architecture Conventions

**Component memoization** — same `XxxInner`/`React.memo(XxxInner)` pattern items 21-26 already
established (`Lfo.tsx` is the most recent, most directly analogous example):

```typescript
// AudioSettingSection.tsx — MODIFIED, illustrative shape
function AudioSettingSectionInner({ value, onAudioModeChange, onVolumeChange, onVolumeLfoChange, disabled, style }: AudioSettingSectionProps) {
  // ...entirely unchanged internals, except the Lfo schema below...
  const lfoSchema = useMemo(
    () => ({ id: 'robotOptions.volume.lfo', type: 'lfo' as const, humanLabel: displayLabel }),
    [displayLabel],
  );
  // ...
  return (
    // ...
    <Lfo schema={lfoSchema} value={displayValue} onChange={onVolumeLfoChange} disabled={disabled || transitioning} />
    // ...
  );
}

export const AudioSettingSection = React.memo(AudioSettingSectionInner);
```

Note `onChange={onVolumeLfoChange}` directly, not `onChange={(v) => onVolumeLfoChange(v)}` —
the inline-arrow wrapper serves no purpose here (identical signature) and would itself be a
fresh closure every render; passing the prop straight through is both simpler and already stable
once `RobotOptionsTab` gives it a stable `useCallback`.

**Value/style/callback stabilization at the call site** (`RobotOptionsTab.tsx`):

```typescript
// RobotOptionsTab.tsx — MODIFIED, illustrative shape

// Module-level — 'output'/'composition'/'timeSpace'/'spectral' are literal constants, not
// derived from any prop or state, so these never need to be recomputed per-render or per-instance.
const OUTPUT_STYLE = getTraitColorStyle('output');
const COMPOSITION_STYLE = getTraitColorStyle('composition');
const TIME_SPACE_STYLE = getTraitColorStyle('timeSpace');
const SPECTRAL_STYLE = getTraitColorStyle('spectral');

export function RobotOptionsTab() {
  // ...unchanged selectors...

  const robotColorStyle = useMemo(() => getRobotColorStyle(robot.identityColor), [robot.identityColor]);

  const audioSettingValue: AudioSettingValue = useMemo(() => ({
    audioMode: robot.audioMode ?? 'none',
    masterVolume: robot.masterVolume,
    volumeLfo: robot.lfoSettings?.[VOLUME_LFO_TARGET] as LfoValue ?? { ...DEFAULT_LFO_SETTINGS[VOLUME_LFO_TARGET] },
  }), [robot.audioMode, robot.masterVolume, robot.lfoSettings]);

  // pingControlsValue, signatureArrayValue: same useMemo shape, keyed on their own real inputs

  const handleAudioModeChange = useCallback((mode: Robot['audioMode']) => applyAudioMode(robot, localeId, mode), [robot, localeId]);
  // one useCallback per onXChange, same dependency shape

  return (
    <div className="robot-options" style={robotColorStyle}>
      <RobotDisplaySection robot={robot} />
      <AudioSettingSection
        value={audioSettingValue}
        onAudioModeChange={handleAudioModeChange}
        onVolumeChange={handleVolumeChange}
        onVolumeLfoChange={handleVolumeLfoChange}
        style={OUTPUT_STYLE}
      />
      {/* PingControlsDrawer, PingContourDrawer, SignatureArrayDrawer: same shape */}
    </div>
  );
}
```

`robot` itself changes reference on every store update regardless of which field changed (item
19/25's own precedent: Zustand's immutable-update convention means the whole robot record is a
new object whenever any of its fields change) — so `useCallback([robot, localeId])` for handlers
that call `applyXxx(robot, localeId, ...)` won't itself stay stable across a genuine field edit.
That's expected and fine: the point isn't to keep a handler stable across *every* robot update
(impossible without deeper store restructuring, out of scope here), it's to keep the **3 value
objects** and the **4 style objects** stable when the *rest* of the panel's own re-render is
triggered by something other than that specific handler's own inputs changing — matching what
item 26's own `useCallback` fix actually achieved for `AudioRigDrawer.tsx` (stability across
sibling-field edits, not across every possible cause of re-render).

**Module-level schema hoist** (`PingContourDrawer.tsx`):

```typescript
// PingContourDrawer.tsx — MODIFIED
const TOP_ROW_SCHEMA = { id: 'robotOptions.pingContour.topRow', type: 'directionalPanel' as const, orientation: 'responsive' as const };
const BOTTOM_ROW_SCHEMA = { id: 'robotOptions.pingContour.bottomRow', type: 'directionalPanel' as const, orientation: 'responsive' as const };
```

---

## 5. Testing & Verification Requirements

- **Framework:** Vitest + React Testing Library, matching every existing test file for these
  components.
- **Existing tests, every touched file:** must pass unmodified.
- **New memo-structural test, one per component** (`RobotDisplaySection`, `AudioSettingSection`,
  `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`): a real render-based
  re-render-count test — mount the component inside a re-rendering parent that passes
  byte-identical props (same object references, not just deep-equal), assert the component's own
  render body did not re-execute on the second render. Per this session's own hard-learned lesson
  (item 26 §5, the real bug caught by Task 12's deeper test): the marker must live inside *that
  specific component's own render body*, not a downstream child.
- **`AudioSettingSection`: `Lfo` schema-stability regression test** — render with the same
  `displayLabel` across 2 renders, assert the `schema` object reference `Lfo` receives is
  `Object.is`-identical both times (spy or capture the prop, matching item 26's own
  `computeVoxelBoxStates` call-count-spy pattern where a direct reference check isn't practical).
  Must be confirmed red against pre-fix code before being treated as done.
- **`RobotOptionsTab.tsx`: end-to-end cascade regression test** — the one that actually proves
  the originally-reported bug is fixed. Render `RobotOptionsTab` for a selected robot, trigger a
  single-field edit (e.g. call the store action `applyDensity` directly, or simulate the
  equivalent user interaction, matching however `AudioRigDrawer.test.tsx`'s own cascade test
  from item 26 Task 12 is structured), and assert that a *sibling* section's own render body did
  not re-execute — e.g. spy on a distinguishing marker in `PingContourDrawer`/
  `SignatureArrayDrawer` while only `PingControlsDrawer`'s own field changed. Must be confirmed
  red first.
* **Verification Steps:**
  1. `npx vitest run src/components/robot/ src/components/panels/screen/console/RobotOptionsTab.test.tsx` passes.
  2. `npm run build:types` — zero TypeScript errors.
  3. `npm run lint` — zero ESLint errors.
  4. `npm test` — full suite passes, including `CompanyOptionsSection.test.tsx` (unmodified, but
     must keep passing since it imports these now-memoized components) and every other consumer.
  5. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`, open Robot Options for any robot, React
  DevTools Profiler (Ranked/Flamegraph view or "highlight updates"), edit a single field in one
  section (e.g. drag Density) — confirm only that section's own control shows real render
  duration, not the whole panel (`RobotDisplaySection`/other 3 sections should show no
  highlight/no bar). Live re-verification, same deferred-to-Crawford category as items 21-26's
  own manual checks.

---

## 6. Documentation & Git/Workflow Context

- **Branch:** `refactor/factory-timing` (same branch items 21-26 landed on) — this is a small,
  same-subsystem follow-up to item 26, not a reason for a fresh branch.
- **Commit Pattern:** one commit per task (matching items 21/26's own multi-task shape), roughly:
  the 5 component `React.memo` + internal-instability fixes (can be one commit each, or grouped —
  left for Tasks to decide the exact split), then `RobotOptionsTab.tsx`'s own stabilization as the
  fix commit that actually changes observable re-render behavior (mirroring item 26 Task 12's own
  "everything before it is additive/safe regardless of caller readiness" structure).
- **`docs/todo/backlog.md` item 27:** mark fixed once implemented and verified, linking this spec
  and the eventual task file, matching every other item this session.

---

## 7. Open Questions & Risks

Resolved during Specify:

- ~~Does this also need to touch `CompanyOptionsSection.tsx`?~~ **Resolved: no** — same-pattern
  follow-up, not today's reported trigger, deferred per §1.4.
- ~~Is a custom `React.memo` comparator needed anywhere?~~ **Resolved: no** — same reasoning as
  item 26 §1.3/§1.5.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Exact commit granularity (§6)** — one commit per component vs. grouped — left for Tasks.
2. **`CompanyOptionsSection.tsx` follow-up** — not scoped or sized here; needs its own spec/task
   pass once this one is implemented and verified, same as item 26 deferred its own sibling
   drawers.
