# Phase Spec: Fleet Drift Consolidation

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/fleet-drift-consolidation.md](../intent/fleet-drift-consolidation.md) (confirmed via `/interview-me`, 2026-09-29). Prior art: [docs/specs/archive/LFO_DRIFT_GROUPS.md](archive/LFO_DRIFT_GROUPS.md) — the shipped Phase 10.3 this phase restructures again, not extends from a blank slate. Every mechanic that phase built (per-group oscillator pools, `centeredSwingFromRange`'s bounded swing math, the Depth Drift silence guard, cross-group isolation, the `Signal.override`-disable-then-restore fix) is reused unchanged; this phase changes *how many global-chain drift groups exist and where the control lives in the UI*, not the underlying mechanism. Also builds directly on the just-shipped Probe Drift nav split (`RobotSectionAccordionStack.tsx`, `robotSubsectionConfig.ts`) as its own structural precedent for "pull a shared drift control out into its own standalone nav leaf."

Current code location note: 10.3's spec cited drift code living in `lfoEngine.ts`; a later refactor split it into its own `src/engine/lfoDrift.ts` (plus `src/engine/lfoShared.ts`). All citations below are against the current tree, not 10.3's original locations.

ASSUMPTIONS I'm making, beyond what the intent doc already resolved (correct now or I'll proceed with these):
1. The merged `DriftGroupId` member is named `'globalFx'` (not, e.g., `'globalChain'` or reusing one of the 3 old names) — an internal identifier, never user-facing, so naming it clearly for what it now covers seemed reasonable.
2. The new Fleet Params group's internal id is `'fleetDrift'` (`FleetParamsGroup`) and its one leaf's `SelectedFleetParamsEffect` value is `'globalDrift'` — both internal identifiers, independent of the "Fleet Drift" display label the intent doc already flagged as provisional.
3. `docs/AUDIO_SYSTEM.md`'s "Drift" section (§289–325) gets rewritten to describe the new 2-group shape directly, matching 10.3's own precedent of writing the current design rather than layering a changelog. I also correct one drifted claim already sitting in that section unrelated to this phase (see §1.6) while I'm in there.

---

## 1. Overview & Claude Explanation

### 1.1 What merges, and what doesn't

Today (`src/types/lfo.ts`'s `DriftGroupId`): `'eq3' | 'filterLPF' | 'filterHPF' | 'robots'` — 4 groups. The first 3 map one-to-one onto the only 3 `AudioRigEffectKey` blocks that ever carry an `lfoTarget` (`AUDIO_RIG_CONFIG`, [audioRigConfig.ts:62-115](../../src/data/audioRigConfig.ts#L62-L115)); `'robots'` covers every `RobotLfoTargetId`, any field, any robot.

This phase merges the first 3 into one new group, `'globalFx'`, covering all 7 `GlobalLfoTargetId` targets ([lfo.ts:74-87](../../src/types/lfo.ts#L74-L87)) with a single shared `{ rateDrift, depthDrift }` pair. `'robots'` is untouched — same id, same pool, same UI (`RobotDriftPanel`), same everything. Confirmed explicitly via interview: this is not "one drift LFO for the whole app," it's "3 groups become 1," leaving a 2-member `DriftGroupId` (`'globalFx' | 'robots'`) where there were 4.

```typescript
// src/types/lfo.ts — DriftGroupId, replacing the 4-member union
export type DriftGroupId = 'globalFx' | 'robots';
export const DRIFT_GROUP_IDS: readonly DriftGroupId[] = ['globalFx', 'robots'];
```

`driftGroupForTarget` ([lfoDrift.ts:114-119](../../src/engine/lfoDrift.ts#L114-L119)) collapses its 3 prefix branches into 1:

```typescript
export function driftGroupForTarget(target: LfoTargetId): DriftGroupId {
  if (target.startsWith('eq3.') || target.startsWith('lpf.') || target.startsWith('hpf.')) return 'globalFx';
  return 'robots';
}
```

### 1.2 Pool size: fixed ceiling, same total as today

10.3's own reasoning (`docs/specs/archive/LFO_DRIFT_GROUPS.md` §1.2) was "size each group's pool to its own real, closed target ceiling — never a uniform constant, never derived at runtime." That reasoning carries over unchanged: `globalFx` has exactly 7 possible targets, ever (the 7 `GlobalLfoTargetId` members) — a closed, fixed set, the same category of fact `eq3`'s old `3` and `filterLPF`/`filterHPF`'s old `2` each were.

```typescript
const DRIFT_POOL_SIZE: Record<DriftGroupId, number> = {
  globalFx: 7,  // exactly 7 possible targets ever (eq3 low/mid/high, lpf frequency/Q, hpf frequency/Q)
  robots: 8,    // unchanged — dozens of possible simultaneously-active primaries, §1.2 of 10.3's own spec
};
```

Total oscillator count: `3 + 2 + 2 + 8 = 15` today → `7 + 8 = 15` after this phase. Identical total — worth noting only because 10.3's own spec flagged its rising oscillator count as an open risk (§7 item 4 there); this phase doesn't reopen that concern, it's a wash.

### 1.3 Nav placement: a new top-level Fleet Params group, not a leaf under EQ & Filters

Confirmed explicitly via interview (the single most load-bearing decision in this phase): "Fleet Drift" becomes a **new sibling** to Pacing/EQ & Filters/Time & Space/Output — a 5th top-level `FleetParamsGroup` — positioned immediately after EQ & Filters, not a 4th leaf nested inside it. This was resolved by checking how Fleet Params' own breadcrumb behaves: a leaf's own name is trimmed by `trimToLowestParent` ([useNavTree.ts:296-302](../../src/components/panels/screen/nav/useNavTree.ts#L296-L302)), leaving only its parent group's name visible — so "Fleet Params > Fleet Drift" as a breadcrumb only comes out looking like that if "Fleet Drift" is itself the group, not a leaf whose parent is "EQ & Filters."

```typescript
// src/stores/uiStore.ts — FleetParamsGroup, gains a 5th member
export type FleetParamsGroup = 'pacing' | 'eqFilters' | 'fleetDrift' | 'timeSpace' | 'output';

// SelectedFleetParamsEffect gains one new synthetic (non-AudioRigEffectKey) member,
// same pattern as 'tempo'/'automaticEffects'/'swellFrequency'/'swellDuration'
export type SelectedFleetParamsEffect = AudioRigEffectKey | 'tempo' | 'automaticEffects' | 'swellFrequency' | 'swellDuration' | 'globalDrift';
```

The group has exactly one leaf (its Rate Drift + Depth Drift sliders bundled together as one control panel — matching every other Fleet Params leaf, which is always "one whole effect's worth of controls," never split per-parameter). Trait: `'spectral'`, matching EQ & Filters (`AUDIO_RIG_EFFECT_TRAIT.eq3`/`.filterLPF`/`.filterHPF`, [AudioRigDrawer.tsx:48-56](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L48-L56)) — not asked about directly in the interview, so flagged in §7, but a reasonable default since Fleet Drift is drift *of* the same effects EQ & Filters already colors spectral.

### 1.4 What comes out of EQ/LPF/HPF's own panels

Each of the 3 global-chain `AudioRigEffectPanel` instances (EQ, Low-Pass Filter, High-Pass Filter) currently renders its own embedded Rate/Depth Drift slider pair via `AudioRigLfoGroup`'s `driftContent` prop ([AudioRigDrawer.tsx:120-122](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L120-L122), rendered at [AudioRigDrawer.tsx:231](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L231)), wired from `AudioRigEffectPanel`'s own `driftGroup`/`drift`/`handleRateDriftChange`/`handleDepthDriftChange` ([AudioRigDrawer.tsx:311-355, 370-390](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L311-L390)).

After this phase, `LFO_DRIFT_GROUPS.find((g) => g.group === effectKey)` can never match for `effectKey ∈ {eq3, filterLPF, filterHPF}` — the merged `'globalFx'` group is never any `AudioRigEffectKey`, exactly like `'robots'` never was. Rather than leave a permanently-`undefined` `driftGroup` and dead branches, `driftContent` is removed entirely: the prop drops off `AudioRigLfoGroupProps`, its render line (`{driftContent}`) drops off `AudioRigLfoGroup`, and `AudioRigEffectPanel` drops `driftGroup`/`drift`/`setGlobalLfoDrift`/`driftHeldOff`/`handleRateDriftChange`/`handleDepthDriftChange` outright. EQ/LPF/HPF's own panels end up exactly as they'd look if they'd never had a per-block drift control — just their own params plus the shared `Lfo` display.

### 1.5 The new Fleet Drift control: a standalone component, matching `RobotDriftPanel`'s own precedent

`LFO_DRIFT_GROUPS` ([audioRigConfig.ts:239-244](../../src/data/audioRigConfig.ts#L239-L244)) shrinks from 4 entries to 2: the merged `'globalFx'` entry (replacing the 3 it displaces) and `'robots'`, untouched. `RobotDriftPanel` ([SignatureArrayDrawer.tsx:43-72](../../src/components/robot/SignatureArrayDrawer.tsx#L43-L72)) already establishes the exact shape needed here: a small standalone component that looks up its own `LfoDriftGroupSchema` entry, reads/writes `useAudioStore` directly (not via props), and renders its `DirectionalPanel`/2 `SliderCenteredZero`s/`HeldOffNote` — deliberately ignoring any `disabled` prop from a parent, since this is a rig-wide control, not scoped to whatever's currently selected.

A new `FleetDriftPanel` component in `AudioRigDrawer.tsx` (alongside `AudioRigDrawer`/`AudioRigEffectPanel`, which `FleetParamsContent.tsx` already imports from there) mirrors it exactly:

```typescript
const GLOBAL_FX_DRIFT_GROUP = LFO_DRIFT_GROUPS.find((g) => g.group === 'globalFx')!;

export function FleetDriftPanel() {
  const rateDrift = useAudioStore((s) => s.globalAudio.lfoDrift.globalFx.rateDrift);
  const depthDrift = useAudioStore((s) => s.globalAudio.lfoDrift.globalFx.depthDrift);
  const setGlobalLfoDrift = useAudioStore((s) => s.setGlobalLfoDrift);
  const driftHeldOff = useAudioStore((s) => s.driftHeldOff);

  return (
    <DirectionalPanel schema={GLOBAL_FX_DRIFT_GROUP.panel}>
      <div className={withHeldOffClass('audio-rig-drawer__param-row', driftHeldOff)}>
        <SliderCenteredZero
          schema={GLOBAL_FX_DRIFT_GROUP.rateSchema}
          value={driftHeldOff ? 0 : rateDrift * 100}
          onChange={(v) => setGlobalLfoDrift('globalFx', { rateDrift: v / 100 })}
          disabled={driftHeldOff}
        />
      </div>
      <div className={withHeldOffClass('audio-rig-drawer__param-row', driftHeldOff)}>
        <SliderCenteredZero
          schema={GLOBAL_FX_DRIFT_GROUP.depthSchema}
          value={driftHeldOff ? 0 : depthDrift * 100}
          onChange={(v) => setGlobalLfoDrift('globalFx', { depthDrift: v / 100 })}
          disabled={driftHeldOff}
        />
      </div>
      {driftHeldOff && <HeldOffNote />}
    </DirectionalPanel>
  );
}
```

`FleetParamsContent.tsx`'s `renderLeaf` ([FleetParamsContent.tsx:133-159](../../src/components/panels/screen/nav/content/FleetParamsContent.tsx#L133-L159)) gains one new branch, matching its existing `'automaticEffects'` → `<AudioRigDrawer />` shape exactly (a self-contained component call, not plain-data-plus-handlers like Tempo/Frequency/Duration — `renderLeaf` stays a plain function calling no hooks itself, per its own existing Rules-of-Hooks comment):

```typescript
if (effectKey === 'globalDrift') {
  return <FleetDriftPanel />;
}
```

The new group's intro panel is automatic, not a new mechanism: `FleetParamsContent.tsx` already gives every group a group-level `IntroPanel` ([FleetParamsContent.tsx:241-246](../../src/components/panels/screen/nav/content/FleetParamsContent.tsx#L241-L246)), driven purely by iterating `FLEET_PARAMS_GROUPS` — adding the new group entry (§2) is the entire task; no new `IntroPanel` call site.

### 1.6 Two nav-tree sources stay hand-synced, same as today — plus one drifted doc claim to fix

`FleetParamsContent.tsx`'s own `FLEET_PARAMS_GROUPS` array (content/stacking order) and `navTreeConfig.ts`'s static `NAV_TREE_SCHEMA` (the actual tree-row structure) are two independently hand-authored tables today — `FleetParamsContent.tsx`'s own doc comment ([FleetParamsContent.tsx:60-64](../../src/components/panels/screen/nav/content/FleetParamsContent.tsx#L60-L64)) already acknowledges this ("kept as one flat source here since this content component, not the tree, decides stacking/accordion order"), unlike Probes/Companies, which consolidated to one shared `ROBOT_SECTIONS_CONFIG` table. This phase doesn't fix that duplication (out of scope, unrequested) — it just means the new Fleet Drift group must be added to **both** tables by hand, kept in sync the same way Pacing/EQ & Filters/Time & Space/Output already are.

Separately: `docs/AUDIO_SYSTEM.md`'s existing "Drift" §"UI" paragraph ([AUDIO_SYSTEM.md:323](../../docs/AUDIO_SYSTEM.md#L323)) already claims "`AudioRigDrawer.tsx` maps over [`LFO_DRIFT_GROUPS`] as a sibling to its own `AUDIO_RIG_CONFIG.map(...)` block" — that's not what the current shipped code does (§1.4 above: `robots`' UI lives in `SignatureArrayDrawer.tsx`, and eq3/filterLPF/filterHPF's drift lived nested *inside* each effect's own panel, not as a sibling map). This was already stale before this phase; §4/§6 folds the correction into the same doc rewrite this phase needs anyway, rather than leaving two generations of inaccuracy stacked on top of each other.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── lfo.ts                    # MODIFIED — DriftGroupId: 4 members -> 2 ('globalFx' | 'robots'),
│   │                               #   DRIFT_GROUP_IDS updated to match (§1.1)
│   └── lfo.test.ts               # MODIFIED — DRIFT_GROUP_IDS assertion updated to 2 members
├── engine/
│   ├── lfoDrift.ts          # MODIFIED — driftGroupForTarget collapses 3 branches to 1 (§1.1);
│   │                          #   DRIFT_POOL_SIZE/globalRateDriftByGroup/globalDepthDriftByGroup
│   │                          #   all reshape from 4 keys to 2 (§1.2)
│   └── lfoDrift.test.ts     # MODIFIED — every eq3/filterLPF/filterHPF-specific case merges into
│                              #   one globalFx case; cross-group isolation re-asserted for the new
│                              #   2-group shape (globalFx vs. robots, not 4-way)
├── stores/
│   ├── audioStore.ts        # MODIFIED — applyGlobalAudioToEngine's DRIFT_GROUP_IDS loop is
│   │                          #   unchanged code, now iterating 2 keys instead of 4 — no logic edit
│   └── audioStore.test.ts   # MODIFIED — setGlobalLfoDrift/applyGlobalAudioToEngine coverage
│                              #   re-parameterized for 2 groups
├── types/
│   └── globalAudio.ts       # MODIFIED — GlobalAudioSettings.lfoDrift's Record<DriftGroupId, ...>
│                              #   narrows to the new 2-key type automatically; DEFAULT_GLOBAL_AUDIO_
│                              #   SETTINGS.lfoDrift drops eq3/filterLPF/filterHPF entries, adds
│                              #   globalFx: { rateDrift: 0, depthDrift: 0 }
│   └── globalAudio.test.ts  # MODIFIED, if it asserts the lfoDrift key set directly
├── data/
│   ├── globalAudioSeedRanges.ts       # MODIFIED — GlobalAudioSeedFieldKey's 8 'lfoDrift.*' keys
│   │                                   #   become 4 ('lfoDrift.globalFx.rateDrift'/'.depthDrift',
│   │                                   #   'lfoDrift.robots.rateDrift'/'.depthDrift'), same
│   │                                   #   { min: -1, max: 1, scale: 'linear', step: 0.01 } range
│   ├── globalAudioSeedRanges.test.ts  # MODIFIED
│   ├── globalAudioLoadingRanges.ts     # MODIFIED — same 8-to-4 key contraction, same
│   │                                    #   { min: -0.7, max: 0.7 } window per remaining key
│   ├── globalAudioLoadingRanges.test.ts # MODIFIED
│   └── audioRigConfig.ts              # MODIFIED — LFO_DRIFT_GROUPS: 4 entries -> 2
│                                        #   ('globalFx'/'robots'); new FleetDriftPanel does NOT
│                                        #   live here (§1.5 — it lives in AudioRigDrawer.tsx,
│                                        #   alongside AudioRigDrawer/AudioRigEffectPanel, which is
│                                        #   a components file, not this data file)
│   └── audioRigConfig.test.ts         # MODIFIED
├── utils/
│   ├── globalAudioSeed.ts       # MODIFIED — generateGlobalAudioSettings's lfoDrift block: 4
│   │                              #   sampled sub-objects (eq3/filterLPF/filterHPF/robots) become 2
│   │                              #   (globalFx/robots)
│   └── globalAudioSeed.test.ts  # MODIFIED
│   ├── sessionDiff.ts           # MODIFIED — the hand-written per-group quantize/cleanup block
│   │                              #   (4 groups) becomes 2 (globalFx/robots)
│   └── sessionDiff.test.ts      # MODIFIED
├── stores/
│   └── uiStore.ts           # MODIFIED — FleetParamsGroup gains 'fleetDrift' (§1.3);
│                              #   SelectedFleetParamsEffect gains 'globalDrift'
├── data/
│   └── navTreeConfig.ts     # MODIFIED — NAV_TREE_SCHEMA's fleetParams.children gains a new
│                              #   'fleetParams.fleetDrift' node (1 child leaf), positioned right
│                              #   after 'fleetParams.eqFilters' (§1.3, §1.6)
│   └── navTreeConfig.test.ts # MODIFIED
├── components/panels/screen/
│   ├── nav/useNavTree.ts               # MODIFIED — FLEET_PARAMS_GROUPS (the id-guard array,
│   │                                     #   line 40) gains 'fleetDrift'; FLEET_PARAMS_GROUP_FIRST_
│   │                                     #   LEAF gains a 'fleetDrift': 'globalDrift' entry;
│   │                                     #   FLEET_PARAMS_LEAF_TO_EFFECT_KEY gains the new leaf's
│   │                                     #   own segment -> 'globalDrift' mapping
│   │   └── useNavTree.test.ts          # MODIFIED
│   ├── nav/content/FleetParamsContent.tsx      # MODIFIED — FLEET_PARAMS_GROUPS (the content-order
│   │                                             #   array, §1.6) gains a 'fleetDrift' group def
│   │                                             #   (1 leaf); renderLeaf gains the 'globalDrift'
│   │                                             #   branch (§1.5); imports FleetDriftPanel
│   │   └── content/FleetParamsContent.test.tsx # MODIFIED
│   └── console/AudioRigDrawer.tsx              # MODIFIED — new exported FleetDriftPanel (§1.5);
│                                                 #   AudioRigLfoGroupProps drops driftContent;
│                                                 #   AudioRigLfoGroup drops the {driftContent}
│                                                 #   render line; AudioRigEffectPanel drops
│                                                 #   driftGroup/drift/setGlobalLfoDrift/
│                                                 #   driftHeldOff/handleRateDriftChange/
│                                                 #   handleDepthDriftChange entirely (§1.4)
│       └── console/AudioRigDrawer.test.tsx     # MODIFIED — EQ/LPF/HPF panel tests drop their
│                                                 #   drift-slider assertions; new FleetDriftPanel
│                                                 #   coverage (rendering, onChange, driftHeldOff)
│       └── console/AudioRigEffectPanel.test.tsx # MODIFIED, if drift assertions live here instead
└── components/robot/
    └── SignatureArrayDrawer.tsx  # UNCHANGED — RobotDriftPanel's own ROBOTS_DRIFT_GROUP lookup
                                    #   (`LFO_DRIFT_GROUPS.find((g) => g.group === 'robots')`) keeps
                                    #   resolving correctly; 'robots' entry's shape is untouched

docs/
└── AUDIO_SYSTEM.md   # MODIFIED — "Drift" section (§289-325) rewritten for the 2-group shape;
                        #   also corrects the pre-existing stale "AudioRigDrawer.tsx maps over
                        #   LFO_DRIFT_GROUPS as a sibling to AUDIO_RIG_CONFIG.map(...)" claim (§1.6)
```

**Explicitly not touched, and why**: `src/components/robot/SignatureArrayDrawer.tsx`'s `RobotDriftPanel` (reads `LFO_DRIFT_GROUPS`'s `'robots'` entry, which keeps its exact current shape — §1.1); `src/components/ui/controls/SliderCenteredZero.tsx`/`DirectionalPanel.tsx`/`AccordionContainer.tsx`/`IntroPanel.tsx` (reused completely as-is, no primitive changes); `src/data/robotOptionsConfig.ts`/`src/data/companyConfig.ts`/`CompanyOptionsSection.tsx` (robot-level drift untouched, per intent doc's explicit out-of-scope); the Audio Load Budget's `driftHeldOff` computation itself (`audioStore.ts`) — it's already one boolean applied uniformly across every drift group regardless of count, so shrinking from 4 groups to 2 needs no change there (confirmed in the interview, not assumed).

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No Tone objects outside `src/engine/`** (CLAUDE.md) — unchanged; the merged pool, its Gains, and every connection stay in `lfoDrift.ts` alone.
* **`'robots'` is untouched — not a rename target, not a data-shape change, not a UI change.** Confirmed explicitly via interview as out of scope. Any diff touching `RobotDriftPanel`, its `ROBOTS_DRIFT_GROUP` lookup, or the `'robots'` key anywhere is a sign of scope creep, not a required change.
* **Two groups, fixed — this phase does not build a general N-group or fully-flat single-group system.** `DriftGroupId` is a closed 2-member union after this phase, the same "closed union, not an extensible registry" constraint 10.3's own spec placed on its 4-member version.
* **Pool size is a per-group constant, sized to that group's own real target ceiling — never a parameter, never derived at runtime.** `DRIFT_POOL_SIZE.globalFx = 7` is fixed the same way every prior pool size was (§1.2).
* **Cross-group isolation remains a first-class requirement.** With only 2 groups left, this is a smaller surface than 10.3's 4-way version, but no less real: setting `globalFx`'s drift must never move `robots`' Gain values, and vice versa. Still directly tested (§5), not just implied.
* **`layerN.phase` targets stay excluded from drift, unchanged.** No new logic gates this — untouched from 10.3.
* **No new UI primitive, no new `ControlSchema` variant.** `FleetDriftPanel` is composed entirely from `DirectionalPanel`/`SliderCenteredZero`/`HeldOffNote`, all already used by `RobotDriftPanel` for the identical purpose.
* **Both `FleetParamsContent.tsx`'s `FLEET_PARAMS_GROUPS` and `navTreeConfig.ts`'s `NAV_TREE_SCHEMA` must be updated together, by hand** — this phase does not consolidate them into one shared table (that would be its own, unrequested refactor — see §1.6). Leaving one updated and not the other is a broken-tree bug, not a partial success.
* **No changes to `docs/COMPONENT_LIBRARY.md`** — no primitive's schema or behavior changes.
* **The "Fleet Drift" label is provisional** (confirmed via interview) — implement it as the literal string used throughout this spec, but do not treat it as a locked-in final label if a later label-review pass changes it; that's a separate, not-yet-scheduled piece of work.

---

## 4. Code Style & Architecture Conventions

**`types/lfo.ts`** (diff):

```typescript
/**
 * The 2 independent LFO drift groups (docs/specs/FLEET_DRIFT_CONSOLIDATION.md,
 * restructured from the 4-group docs/specs/archive/LFO_DRIFT_GROUPS.md) — every
 * connected primary LFO belongs to exactly one, determined by its own target id
 * (see lfoDrift.ts's driftGroupForTarget). Every GlobalLfoTargetId (eq3/lpf/hpf,
 * the only 3 effect blocks that ever carry an lfoTarget — audioRigConfig.ts's
 * AUDIO_RIG_CONFIG) shares one 'globalFx' group; every RobotLfoTargetId,
 * regardless of field or which robot, shares the one 'robots' group, unchanged
 * from before this phase.
 */
export type DriftGroupId = 'globalFx' | 'robots';
export const DRIFT_GROUP_IDS: readonly DriftGroupId[] = ['globalFx', 'robots'];
```

**`engine/lfoDrift.ts`** (diff against the shipped 4-group code):

```typescript
const DRIFT_POOL_SIZE: Record<DriftGroupId, number> = {
  globalFx: 7,  // exactly 7 possible targets ever (eq3 low/mid/high, lpf frequency/Q, hpf frequency/Q)
  robots: 8,    // unchanged — see docs/specs/archive/LFO_DRIFT_GROUPS.md §1.2
};

const globalRateDriftByGroup: Record<DriftGroupId, number> = { globalFx: 0, robots: 0 };
const globalDepthDriftByGroup: Record<DriftGroupId, number> = { globalFx: 0, robots: 0 };

/**
 * Which drift group a target belongs to — every global-chain target (eq3.*/
 * lpf.*/hpf.*, the only 3 prefixes that ever carry an lfoTarget) shares
 * 'globalFx'; every RobotLfoTargetId shares 'robots' regardless of field or
 * robotId. Restructured from 3 separate global-chain branches
 * (docs/specs/FLEET_DRIFT_CONSOLIDATION.md) into 1.
 */
export function driftGroupForTarget(target: LfoTargetId): DriftGroupId {
  if (target.startsWith('eq3.') || target.startsWith('lpf.') || target.startsWith('hpf.')) return 'globalFx';
  return 'robots';
}
```

Every other function in this file (`getOrCreateDriftPool`, `attachDrift`, `refreshRateDriftGain`, `refreshDepthDriftGain`, `detachDrift`, `setGlobalRateDrift`, `setGlobalDepthDrift`, `isDriftSuppressed`/`setDriftSuppressed`) is reused **verbatim** — none of them hardcode a group name or a count; they're all already generic over `DriftGroupId`, which is exactly why 10.3's own restructuring-not-layering precedent (its §1.3/§1.5) applies again here with zero mechanism changes.

**`types/globalAudio.ts`** (diff):

```typescript
export interface GlobalAudioSettings {
  compressorBeforeDelay: boolean;
  /** Global, seeded LFO drift amounts — one independent { rateDrift, depthDrift }
   *  pair per DriftGroupId ('globalFx' | 'robots'), applied to every currently-
   *  connected primary Tone.LFO belonging to that group. Both fields -1.0 to
   *  1.0, default 0.0. See docs/specs/FLEET_DRIFT_CONSOLIDATION.md (restructured
   *  from docs/specs/archive/LFO_DRIFT_GROUPS.md's 4-group shape). */
  lfoDrift: Record<DriftGroupId, { rateDrift: number; depthDrift: number }>;
  // ...unchanged...
}

export const DEFAULT_GLOBAL_AUDIO_SETTINGS: GlobalAudioSettings = {
  compressorBeforeDelay: false,
  lfoDrift: {
    globalFx: { rateDrift: 0, depthDrift: 0 },
    robots: { rateDrift: 0, depthDrift: 0 },
  },
  // ...unchanged...
};
```

**`data/globalAudioSeedRanges.ts`** (diff — the 8-key set contracts to 4, same range per remaining key):

```typescript
export type GlobalAudioSeedFieldKey =
  | 'compressor.threshold'
  // ...unchanged...
  | 'limiter.threshold'
  | 'lfoDrift.globalFx.rateDrift' | 'lfoDrift.globalFx.depthDrift'
  | 'lfoDrift.robots.rateDrift' | 'lfoDrift.robots.depthDrift';

export const GLOBAL_AUDIO_SEED_RANGES: Record<GlobalAudioSeedFieldKey, SeedRange> = {
  // ...unchanged...
  'lfoDrift.globalFx.rateDrift': { min: -1, max: 1, scale: 'linear', step: 0.01 },
  'lfoDrift.globalFx.depthDrift': { min: -1, max: 1, scale: 'linear', step: 0.01 },
  'lfoDrift.robots.rateDrift': { min: -1, max: 1, scale: 'linear', step: 0.01 },
  'lfoDrift.robots.depthDrift': { min: -1, max: 1, scale: 'linear', step: 0.01 },
};
```

`data/globalAudioLoadingRanges.ts` gets the identical 8-to-4 contraction at the same `{ min: -0.7, max: 0.7 }` window already in place per remaining key — mechanically identical treatment, just fewer keys.

**`utils/globalAudioSeed.ts`** (the one block inside `generateGlobalAudioSettings` that changes):

```typescript
lfoDrift: {
  globalFx: { rateDrift: sampleField(noiseMap, 'lfoDrift.globalFx.rateDrift'), depthDrift: sampleField(noiseMap, 'lfoDrift.globalFx.depthDrift') },
  robots: { rateDrift: sampleField(noiseMap, 'lfoDrift.robots.rateDrift'), depthDrift: sampleField(noiseMap, 'lfoDrift.robots.depthDrift') },
},
```

**`utils/sessionDiff.ts`** (the hand-written per-group quantize/cleanup block, [sessionDiff.ts:167-185](../../src/utils/sessionDiff.ts#L167-L185), contracts from 4 sub-objects to 2 — same `quantizeToStep(…, -1, 0.01)` + `cleanupFloatingPoint(…, 2)` pair per field, unchanged):

```typescript
toCapture.lfoDrift = {
  globalFx: {
    rateDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.globalFx.rateDrift, -1, 0.01), 2),
    depthDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.globalFx.depthDrift, -1, 0.01), 2),
  },
  robots: {
    rateDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.robots.rateDrift, -1, 0.01), 2),
    depthDrift: cleanupFloatingPoint(quantizeToStep(toCapture.lfoDrift.robots.depthDrift, -1, 0.01), 2),
  },
};
```

**`stores/audioStore.ts`** — `setGlobalLfoDrift`'s own body ([audioStore.ts:297-303](../../src/stores/audioStore.ts#L297-L303)) and `applyGlobalAudioToEngine`'s `for (const group of DRIFT_GROUP_IDS)` loop ([audioStore.ts:58-61](../../src/stores/audioStore.ts#L58-L61)) are **unchanged lines of code** — both are already generic over whatever `DRIFT_GROUP_IDS` contains, so shrinking that array from 4 to 2 members changes their behavior with zero diff to either function body.

**`data/audioRigConfig.ts`** (diff — `LFO_DRIFT_GROUPS` contracts from 4 entries to 2; `driftGroupSchema`'s own body, [audioRigConfig.ts:209-234](../../src/data/audioRigConfig.ts#L209-L234), is unchanged):

```typescript
export const LFO_DRIFT_GROUPS: LfoDriftGroupSchema[] = [
  driftGroupSchema('globalFx', 'SIGNAL CHAIN FLUX', 'Fleet Drift'),
  driftGroupSchema('robots', 'AGENT FLUX', 'Robot Drift'),
];
```

`driftGroupSchema('globalFx', …)`'s ids follow the existing `audioRig.lfoDrift.${group}` convention unchanged (`audioRig.lfoDrift.globalFx`, `.rateDrift`, `.depthDrift`) — these are `DirectionalPanel`/slider ids, internal structural ids `FleetDriftPanel` renders through, distinct from the nav-tree/scroll-anchor id (`fleetParams.fleetDrift.drift`, set by `FleetParamsContent.tsx`'s own `sectionAnchorRef`, §4 below) — the same two-id-systems split `RobotDriftPanel`/`RobotSectionAccordionStack` already establish for Probe Drift (compare `probes.<id>.probeDrift.probeDrift` as the nav anchor vs. `ROBOTS_DRIFT_GROUP.panel.id` as the internal `DirectionalPanel` id).

`'SIGNAL CHAIN FLUX'` is a first-pass placeholder `loreLabel`, same unconfirmed status 10.3's own group labels shipped with (flagged in §7) — not sourced from any reference grid, since none covers this merged group.

**`components/panels/screen/console/AudioRigDrawer.tsx`** (diff):

```typescript
// AudioRigLfoGroupProps loses driftContent entirely — no LFO-bearing block ever
// supplies it anymore (§1.4).
interface AudioRigLfoGroupProps {
  groupId: string;
  params: LfoTargetedParamSchema[];
  effect: Record<string, number>;
  fieldOnChange: Record<string, (v: number) => void>;
  // driftContent removed
}

// AudioRigLfoGroup's own JSX drops the trailing {driftContent} render line entirely
// — the component's DirectionalPanel now ends after the Lfo display + HeldOffNote.

// AudioRigEffectPanel drops driftGroup/drift/setGlobalLfoDrift/driftHeldOff/
// handleRateDriftChange/handleDepthDriftChange entirely — none of them can ever
// resolve to a truthy driftGroup once LFO_DRIFT_GROUPS no longer contains eq3/
// filterLPF/filterHPF. AudioRigLfoGroup's own call site drops the driftContent prop.

// New export, alongside AudioRigDrawer/AudioRigEffectPanel:
const GLOBAL_FX_DRIFT_GROUP = LFO_DRIFT_GROUPS.find((g) => g.group === 'globalFx')!;

export function FleetDriftPanel() {
  const rateDrift = useAudioStore((s) => s.globalAudio.lfoDrift.globalFx.rateDrift);
  const depthDrift = useAudioStore((s) => s.globalAudio.lfoDrift.globalFx.depthDrift);
  const setGlobalLfoDrift = useAudioStore((s) => s.setGlobalLfoDrift);
  const driftHeldOff = useAudioStore((s) => s.driftHeldOff);

  return (
    <DirectionalPanel schema={GLOBAL_FX_DRIFT_GROUP.panel}>
      <div className={withHeldOffClass('audio-rig-drawer__param-row', driftHeldOff)}>
        <SliderCenteredZero
          schema={GLOBAL_FX_DRIFT_GROUP.rateSchema}
          value={driftHeldOff ? 0 : rateDrift * 100}
          onChange={(v) => setGlobalLfoDrift('globalFx', { rateDrift: v / 100 })}
          disabled={driftHeldOff}
        />
      </div>
      <div className={withHeldOffClass('audio-rig-drawer__param-row', driftHeldOff)}>
        <SliderCenteredZero
          schema={GLOBAL_FX_DRIFT_GROUP.depthSchema}
          value={driftHeldOff ? 0 : depthDrift * 100}
          onChange={(v) => setGlobalLfoDrift('globalFx', { depthDrift: v / 100 })}
          disabled={driftHeldOff}
        />
      </div>
      {driftHeldOff && <HeldOffNote />}
    </DirectionalPanel>
  );
}
```

**`stores/uiStore.ts`** (diff):

```typescript
export type FleetParamsGroup = 'pacing' | 'eqFilters' | 'fleetDrift' | 'timeSpace' | 'output';

export type SelectedFleetParamsEffect =
  AudioRigEffectKey | 'tempo' | 'automaticEffects' | 'swellFrequency' | 'swellDuration' | 'globalDrift';
```

**`data/navTreeConfig.ts`** (diff — new sibling node inside `fleetParams.children`, positioned right after `fleetParams.eqFilters`):

```typescript
{
  id: 'fleetParams.eqFilters',
  humanLabel: 'EQ & Filters',
  trait: 'spectral',
  children: [
    { id: 'fleetParams.eqFilters.eq', humanLabel: '3-Band EQ' },
    { id: 'fleetParams.eqFilters.hpf', humanLabel: 'High-Pass Filter' },
    { id: 'fleetParams.eqFilters.lpf', humanLabel: 'Low-Pass Filter' },
  ],
},
{
  id: 'fleetParams.fleetDrift',
  humanLabel: 'Fleet Drift',
  // Matches AUDIO_RIG_EFFECT_TRAIT's own eq3/filterLPF/filterHPF -> 'spectral' —
  // this group's one control is drift OF those same effects.
  trait: 'spectral',
  children: [
    { id: 'fleetParams.fleetDrift.drift', humanLabel: 'Fleet Drift' },
  ],
},
{
  id: 'fleetParams.timeSpace',
  // ...unchanged...
},
```

**`components/panels/screen/nav/useNavTree.ts`** (diff — 3 small additions, no restructuring):

```typescript
const FLEET_PARAMS_GROUPS: readonly FleetParamsGroup[] = ['pacing', 'eqFilters', 'fleetDrift', 'timeSpace', 'output'];

const FLEET_PARAMS_GROUP_FIRST_LEAF: Record<FleetParamsGroup, SelectedFleetParamsEffect> = {
  pacing: 'tempo',
  eqFilters: 'eq3',
  fleetDrift: 'globalDrift',
  timeSpace: 'reverb',
  output: 'compressor',
};

const FLEET_PARAMS_LEAF_TO_EFFECT_KEY: Record<string, SelectedFleetParamsEffect> = {
  eq: 'eq3',
  hpf: 'filterHPF',
  lpf: 'filterLPF',
  reverb: 'reverb',
  delay: 'delay',
  compression: 'compressor',
  limiter: 'limiter',
  tempo: 'tempo',
  frequency: 'swellFrequency',
  duration: 'swellDuration',
  automaticEffects: 'automaticEffects',
  drift: 'globalDrift',  // new — matches navTreeConfig.ts's 'fleetParams.fleetDrift.drift' leaf segment
};
```

**`components/panels/screen/nav/content/FleetParamsContent.tsx`** (diff — new group def + `renderLeaf` branch + import):

```typescript
import { AudioRigDrawer, AudioRigEffectPanel, FleetDriftPanel } from '../../console/AudioRigDrawer';
// ...

const FLEET_PARAMS_GROUPS: FleetParamsGroupDef[] = [
  { /* pacing, unchanged */ },
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
    id: 'fleetDrift',
    nodeId: 'fleetParams.fleetDrift',
    humanLabel: 'Fleet Drift',
    trait: 'spectral',
    leaves: [
      { id: 'fleetParams.fleetDrift.drift', humanLabel: 'Fleet Drift', effectKey: 'globalDrift' },
    ],
  },
  { /* timeSpace, unchanged */ },
  { /* output, unchanged */ },
];

// renderLeaf gains one new branch, alongside the existing tempo/swellFrequency/
// swellDuration/automaticEffects special cases, ahead of the generic
// AudioRigEffectPanel fallthrough:
if (effectKey === 'globalDrift') {
  return <FleetDriftPanel />;
}
```

Everything else in `FleetParamsContent.tsx` — `groupIds`, both `useSectionObserver` calls, `useAccordionOpenState`, `startHidden`, `rootRef`, the outer `.map(FLEET_PARAMS_GROUPS)` render — is **already generic over the array's contents**; adding a 5th group def is the entire diff to that logic (zero lines of the render/observer/state-wiring code itself change).

* **Naming Conventions:** `driftGroupForTarget`/`driftGroupSchema` keep this file's existing lowerCamelCase-private-helper convention. `FleetDriftPanel` matches `RobotDriftPanel`'s own naming (`<Scope>DriftPanel`). `'globalFx'`/`'fleetDrift'`/`'globalDrift'` are 3 distinct identifiers for 3 distinct concepts (drift group id / nav group id / effect-key id) — deliberately not unified into one string reused across all three, matching how e.g. `'eq3'` today is simultaneously an `AudioRigEffectKey`, a `GlobalAudioSettings` field key, and a `driftGroupForTarget` prefix without collapsing those into fewer types.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest (+ React Testing Library for component tests).
* **Test File Location:** Colocate, matching every file in §2.
* **`lfoDrift.test.ts` (modified):**
  1. **Pool sizing:** the `globalFx` pool never exceeds 7 oscillators; `robots` never exceeds 8 — regardless of how many targets in the other group have connected. `globalFx`'s pool is not constructed until its own first successful `connectLfoTarget` call for any of `eq3.*`/`lpf.*`/`hpf.*`.
  2. **`driftGroupForTarget` classification:** every one of the 7 `GlobalLfoTargetId` members maps to `'globalFx'` (both the 3 that used to map to `eq3` and the pairs that used to map to `filterLPF`/`filterHPF` all now land on the same group); every `RobotLfoTargetId` still maps to `'robots'`.
  3. **Cross-group isolation, 2-way:** connecting one primary in each of the 2 groups, `setGlobalRateDrift('globalFx', 1)` changes only the `globalFx`-group primary's rate-drift Gain, leaving `robots`' Gain untouched — and vice versa. Repeat for `setGlobalDepthDrift`.
  4. **Merge-specific regression case:** connect one primary each for a former-`eq3` target (e.g. `eq3.low`), a former-`filterLPF` target (`lpf.frequency`), and a former-`filterHPF` target (`hpf.Q`); confirm all 3 land in the SAME pool (`globalFx`) and all 3 respond identically to a single `setGlobalRateDrift('globalFx', …)` call — the direct test that the 3-groups-become-1 merge actually happened, not just that the type compiles.
  5. Swing-bound behavior, the full Depth Drift silence-guard matrix, and the `layerN.phase` exclusion — re-run once for `globalFx` and once for `robots`, same assertions as before, now against 2 groups instead of 4.
* **`lfo.test.ts` (modified):** `DRIFT_GROUP_IDS` has exactly the 2 documented members (`'globalFx'`, `'robots'`), no duplicates, and no leftover `'eq3'`/`'filterLPF'`/`'filterHPF'` string anywhere in the type or const.
* **`globalAudioSeedRanges.test.ts`/`globalAudioLoadingRanges.test.ts` (modified):** closed-set key-coverage assertions contract from 8 `lfoDrift.*` keys to 4; bounds/scale per remaining key unchanged.
* **`globalAudioSeed.test.ts` (modified):** `generateGlobalAudioSettings`'s `lfoDrift` output has both groups populated, each group's `rateDrift`/`depthDrift` sampled independently; determinism/non-degeneracy re-run per group (2, not 4).
* **`sessionDiff.test.ts` (modified):** the `lfoDrift` quantize/cleanup coverage contracts from 4 sub-objects to 2; a save/load round trip with nonzero `globalFx` drift (a genuinely distinguishing value, not left at its 0 default — per this codebase's own established "seed at least one field with a real value" parity-test convention) reproduces exactly.
* **`audioStore.test.ts` (modified):** `setGlobalLfoDrift(group, partial)` coverage re-parameterized across the 2 remaining groups instead of 4; `applyGlobalAudioToEngine` calls both `lfoEngine` setters for both groups with each group's own current values.
* **`audioRigConfig.test.ts` (modified):** `LFO_DRIFT_GROUPS` has exactly 2 entries (`'globalFx'`, `'robots'`), each with a valid `panel` + 2 `sliderCenteredZero` schemas at `-100..100`; every id unique across both groups' 6 combined schemas (2 panels + 4 sliders).
* **`AudioRigDrawer.test.tsx` / `AudioRigEffectPanel.test.tsx` (modified):**
  1. EQ/Low-Pass/High-Pass panels no longer render any Rate/Depth Drift slider — explicit negative assertions (`queryByRole`/`queryByText` returns null for drift controls under each of the 3 panels), not just "test doesn't check for it anymore."
  2. New `FleetDriftPanel` coverage: renders its Rate/Depth Drift sliders bound to `globalAudio.lfoDrift.globalFx`; dragging either calls `setGlobalLfoDrift('globalFx', …)` with the correct `%`-to-fraction conversion; both grey out and read `0` under `driftHeldOff`, matching `RobotDriftPanel`'s own existing coverage shape for `'robots'`.
* **`FleetParamsContent.test.tsx` (modified):** a 5th accordion ("Fleet Drift") renders after "EQ & Filters" and before "Time & Space"; it gets its own group-level `IntroPanel` once approached, matching every other group; its one leaf renders `FleetDriftPanel`'s content once approached (the same lazy-mount gate every other leaf already gets).
* **`useNavTree.test.ts` (modified):** `fleetParams.fleetDrift` appears as a tree node with exactly 1 child (`fleetParams.fleetDrift.drift`), positioned between `fleetParams.eqFilters` and `fleetParams.timeSpace`; selecting `fleetParams.fleetDrift` (the bare group) resolves `selectedFleetParamsEffect` to `'globalDrift'` (`FLEET_PARAMS_GROUP_FIRST_LEAF`); selecting `fleetParams.fleetDrift.drift` directly also resolves to `'globalDrift'` (`FLEET_PARAMS_LEAF_TO_EFFECT_KEY`); `isDeepestTwoLevels`/`isAutoExpandTier` behave the same way for this new group/leaf pair as they already do for every existing Fleet Params group/leaf pair (no new branch needed in either predicate — confirm the existing generic logic already covers it, don't add one).
* **`navTreeConfig.test.ts` (modified), if it enumerates fleetParams children directly:** update the expected child list/order.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (surfaces any remaining reference to the old `'eq3' | 'filterLPF' | 'filterHPF'` drift-group members, and any 4-argument-shaped object literal still using the old `lfoDrift` key set).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load a fresh Attenuation Style, open Fleet Params, confirm a "Fleet Drift" accordion appears right after "EQ & Filters" and before "Time & Space," with its own intro panel and a seeded (nonzero-but-modest) Rate/Depth Drift starting position; confirm EQ/Low-Pass/High-Pass no longer show any drift sliders of their own; with a global-chain LFO already active and audible (e.g. `eq3.low`), raise Fleet Drift's Depth Drift and confirm the audible wander now comes from the one merged control regardless of which of the 3 old effect blocks that LFO happens to target; confirm Probe Drift (still under Probes/Companies) is completely unaffected by any of this.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** TBD at Tasks time.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable:
  1. `types/lfo.ts`'s `DriftGroupId` 4→2 + `lfoDrift.ts`'s `driftGroupForTarget`/`DRIFT_POOL_SIZE`/per-group state (+ tests) — the engine-level merge itself.
  2. `types/globalAudio.ts`'s reshaped `lfoDrift` default + the seed-range/loading-range 8→4 key contraction + `globalAudioSeed.ts`'s 2-group sampling (+ tests).
  3. `sessionDiff.ts`'s 4→2 quantize/cleanup block (+ test).
  4. `audioStore.ts` — likely a no-diff-body commit folded into whichever of the above touches its tests, since the function bodies themselves don't change (§4).
  5. `audioRigConfig.ts`'s `LFO_DRIFT_GROUPS` 4→2 + `AudioRigDrawer.tsx`'s `driftContent` removal + new `FleetDriftPanel` (+ tests) — the UI-removal-and-relocation commit.
  6. `uiStore.ts`'s new `FleetParamsGroup`/`SelectedFleetParamsEffect` members + `navTreeConfig.ts`'s new tree node + `useNavTree.ts`'s 3 small additions (+ tests) — the nav-tree wiring commit.
  7. `FleetParamsContent.tsx`'s new group def + `renderLeaf` branch (+ test) — the content-view wiring commit, naturally last since it's the one that actually surfaces everything built in commits 1-6.
  8. `docs/AUDIO_SYSTEM.md` last, once the shipped shape is final.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Does this merge include the `'robots'` group too?~~ **Resolved: no** — intent doc, confirmed explicitly via interview; `'robots'` stays fully untouched.
- ~~Nav placement — new top-level group, or a leaf nested under EQ & Filters?~~ **Resolved: new top-level `FleetParamsGroup`, positioned right after EQ & Filters** — intent doc §"Behavior," confirmed via the breadcrumb-trimming reasoning in §1.3 above.
- ~~Is "Fleet Drift" the real label?~~ **Resolved: yes for now, provisional pending a separate label review** — intent doc, use it as specified, don't treat it as final.
- ~~Does the Effects Load dial need a specific behavior change?~~ **Resolved: no specific change requested** — flagged only as "keep an eye out"; confirmed in this spec (§1.4/§2) that `driftHeldOff` needs zero change since it was already group-count-agnostic.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Trait/color for the new Fleet Drift group (`'spectral'`, matching EQ & Filters) was not asked about directly in the interview** — it's this spec's own default (§1.3), chosen because Fleet Drift is drift *of* the effects EQ & Filters already colors spectral. Confirm during the manual check that this doesn't read as confusing (e.g. two adjacent spectral-colored accordions with otherwise-unrelated content) before treating it as final.
2. **`'SIGNAL CHAIN FLUX'` (the new group's `loreLabel`) is a first-pass placeholder**, same unconfirmed status every prior drift-group label shipped with (10.3's own spec flagged this identically) — no reference grid exists for this feature at all. Confirm it reads clearly during the manual check; adjust before merge if it doesn't clearly signal what the group covers, independent of whatever the separate "Fleet Drift" label-review pass eventually decides for the group name itself.
3. **The internal id choices (`'globalFx'`, `'fleetDrift'`, `'globalDrift'`) are this spec's own naming, not confirmed with Crawford directly** (§ASSUMPTIONS) — low-risk since none are user-facing, but worth a quick nod during Plan review in case a different internal convention is preferred.
4. **Total oscillator count stays flat at 15** (§1.2) — not a new risk, noted only for continuity with 10.3's own cost reasoning, which this phase doesn't reopen or worsen.
5. **The `FleetParamsContent.tsx`/`navTreeConfig.ts` hand-sync duplication (§1.6) is pre-existing and explicitly out of scope for this phase** — not filed as a new entry in `docs/DUPLICATE_VALUE_AUDIT.md` since that audit doesn't currently track it and this phase wasn't asked to open new tracking, only to implement within the existing pattern. Worth a mention to Crawford if a future pass wants to consolidate Fleet Params onto one shared table the way Probes/Companies already did (`ROBOT_SECTIONS_CONFIG`).
