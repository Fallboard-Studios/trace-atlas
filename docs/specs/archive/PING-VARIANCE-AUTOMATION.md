# Phase Spec: Ping Variance Automation (Audio Swells master control)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/ping-variance-automation.md](../intent/ping-variance-automation.md) (confirmed via `/interview-me`, 2026-09-01), plus three implementation-level decisions confirmed directly with the user during Specify itself (§7) — the storage/seeding mechanism (§1.2) and a related, previously-unaddressed gap in `globalBypass`'s interaction with the global swell pool (§1.6), surfaced by this spec's own open questions. Not a new feature — a reshaping of [docs/specs/AUDIO_SWELLS.md](AUDIO_SWELLS.md)'s one master control (`audioSwellsEnabled`), which this spec supersedes wherever the two disagree. Prior art reused directly rather than re-derived: `AUDIO_SWELLS.md` itself (the pool/trigger/selection/magnitude/duration mechanics, and the existing disabled-effect cancellation path §1.6 extends, both unchanged except where called out below), `src/utils/globalAudioSeed.ts` (the per-Attenuation-Style seeded-default convention, e.g. `DELAY_ENABLED_THRESHOLD`), and `AudioRigDrawer.tsx`'s existing LFO Drift rows (the `value * 100` / `v / 100` display-conversion pattern this spec reuses verbatim for the new slider).

---

## 1. Overview & Claude Explanation

`audioStore.audioSwellsEnabled` (boolean, default `true`) — the Sector Settings "Enable automatic effects" toggle — is deleted outright and replaced with `audioStore.pingVarianceAutomation` (a continuous `[0, 1]` fraction), surfaced as a new **Ping Variance Automation** slider at the bottom of the Audio Rig drawer. Both pools (global-effect swells and robot-attribute swells, including company-wide) are still governed by this one control, exactly as the boolean governed both before. Nothing about *which* swells are eligible, how they're selected, or their default direction/magnitude/duration math changes — this spec touches only the trigger gate and the peak-magnitude pipeline's last step, both already-existing seams in `audioSwells.ts`.

Two new behaviors, both spelled out in the intent doc's "Success" section:

1. **Magnitude scaling.** A newly-created swell's `peakDelta` — global or per-robot-member — is multiplied by the slider's current fraction as the literal last step of that swell's peak calculation, after direction is picked and after every attribute-specific clamp (`clampVolumeDownward`, `peakDeltaCappedByFraction` for detune, `clampGlobalPeak` for HPF/LPF). Fixed at creation; moving the slider afterward never retroactively rescales an in-flight swell.
2. **0% is a full stop.** At exactly `0`, no new swell starts (the same "gate, not a zero-magnitude swell" shape the boolean had), **and** every swell still in its rising phase is forced into its falling phase from wherever it currently sits, riding its own already-drawn `fallingMeasures` back to base. A swell already in its falling phase needs no forcing — it's already walking back to base as part of its normal cycle, so only a still-rising swell is ever converted (§1.4).

### 1.1 What's reused vs. what's new

Reused, unchanged: `SWELL_GLOBAL_TARGET_IDS`/`SWELL_ROBOT_ATTRIBUTE_IDS` (`types/audioSwell.ts`, not touched by this spec), `pickSwellPeakDelta`/`peakDeltaForDirection`/`peakDeltaCappedByFraction`/`clampVolumeDownward`/`clampGlobalPeak`/`clampSwellFloor`/`clampSwellCeiling` (every attribute-specific exception), `pickPhaseMeasures`, the whole trigger/selection roll shape (`SWELL_TRIGGER_CHANCE`, `SWELL_COMPANY_CHANCE`, the once-per-whole-measure gate), and — critically — the falling-phase interpolation formula in `advanceGlobalSwell`/`advanceRobotSwell`, which the forced-return mechanism (§1.4) rides as-is rather than inventing a new curve.

New: the `pingVarianceAutomation` store field/action/seed function, the Audio Rig slider, a multiply at each swell-creation call site, and a small forced-return check at the top of each advance function. `ActiveSwell`/`SwellMember` (`types/audioSwell.ts`) need **no new field** — §1.4 explains why the existing `phase` field alone is sufficient as the "already forced" marker.

### 1.2 Storage domain & the seeded-default convention

Internal storage is a `[0, 1]` fraction — `pingVarianceAutomation: number` — a new **top-level** `AudioStore` field, sibling to where `audioSwellsEnabled` used to live, **not** nested inside `GlobalAudioSettings`. Same reasoning that kept the old boolean top-level applies unchanged: nothing here ever calls `AudioEngine.*` (there's no live node to push a "swell automation amount" to), so it doesn't belong in the type that exists specifically to mirror what `applyGlobalAudioToEngine` pushes.

The Audio Rig slider itself displays `[0, 100]` with a `%` unit, converting at the component boundary — the exact `value={x * 100}` / `onChange={(v) => set(v / 100)}` shape `AudioRigDrawer.tsx` already uses for `lfoDrift`'s `rateDrift`/`depthDrift` rows (§4). No new conversion idiom, per the user's direction to reuse existing components rather than invent a parallel one.

The seeded default is drawn once per **session**, not once per Attenuation Style switch — confirmed with the user directly (this spec's first draft assumed reseed-every-switch, matching `eq3.low`/`reverb.wet`; that assumption was wrong). `pingVarianceAutomation` belongs with `globalBypass`/`compressorBeforeDelay` in the **carry-forward group**, not the reseed-every-time group: it seeds once, from whichever Attenuation Style is active at the very first `regenerateGlobalAudioFromSeed` call (module load), and every later call — any future Attenuation Style switch or retransmit — leaves the user's current value alone, exactly like `globalBypass` already does. The mechanism differs from `globalBypass`'s, though, because `generateGlobalAudioSettings` returns a genuinely-seeded value for this field (not a static default), so "prefer current over generated" can't reuse `globalBypass`'s literal `current.X` spread trick unmodified — that trick only works because `generated.globalBypass` is *always* `DEFAULT_GLOBAL_AUDIO_SETTINGS.globalBypass`, so overwriting it with `current.globalBypass` is a no-op on the very first call and a real carry-forward on every later one. `pingVarianceAutomation` instead uses an explicit "already seeded" gate: the store's initial value is a sentinel (`-1`, outside `[0, 1]`, never a value a real seed or a real drag can produce), and `regenerateGlobalAudioFromSeed` only calls `generatePingVarianceAutomation` when the current value is still that sentinel — every later call is a no-op for this one field (§4 shows the exact diff). The draw itself is otherwise ordinary: `getSeededVal(noiseMap, 'globalAudio.pingVarianceAutomation', 0, 0.33, 0.66)`, in the fraction domain directly, mirroring `generateGlobalAudioSettings`'s existing per-field seeded-default convention (`sampleField`, `DELAY_ENABLED_THRESHOLD`). Freely draggable across the full `[0, 1]` range afterward, and that dragged value now survives every future Attenuation Style change for the rest of the session.

### 1.3 Magnitude scaling — exactly where in the pipeline

`tickAudioSwells` already reads one boolean from the store right before rolling `maybeStartGlobalSwell`/`maybeStartRobotSwell`; it now reads the fraction instead and gates on `> 0`:

```typescript
const automation = useAudioStore.getState().pingVarianceAutomation;
if (automation > 0) {
  maybeStartGlobalSwell(noiseMap, wholeMeasure, automation);
  maybeStartRobotSwell(localeId, noiseMap, wholeMeasure, automation);
}
```

Both functions gain an `automation: number` parameter, threaded down to whichever call site actually builds the final `peakDelta` — `maybeStartGlobalSwell` (one scalar), `startSingleRobotSwell` (one scalar), and `startCompanyWideSwell` (once per member, since magnitude is per-robot even though direction/timing are shared). Every one of those call sites already ends with a clamped `peakDelta` right before `activeSwells.set(...)`; the multiply is inserted there, after the clamp, never before — `clampVolumeDownward`/`clampGlobalPeak`'s own floor/ceiling values are physical/musical limits (a Volume swell shouldn't go below 50% of its range, an HPF shouldn't cross 4kHz) that must stay in force regardless of how far `automation` scales the delta down. A small named helper documents the safety property inline rather than a bare inline multiply, matching the file's existing convention of small, doc-commented pure helpers (`clampSwellFloor`, `peakDeltaCappedByFraction`, etc.):

```typescript
/** The literal last step of every swell's peak calculation (docs/specs/
 *  PING-VARIANCE-AUTOMATION.md §1.3) — multiplies an already-clamped,
 *  already-direction-picked delta by the automation fraction. Safe by
 *  construction: peakDelta and (peakDelta * automation) always share a sign
 *  (or automation collapses it to exactly 0), and |peakDelta * automation|
 *  <= |peakDelta|, so this can only ever shrink a swell toward its base
 *  value, never push it past a bound an earlier clamp already enforced. */
function scaleSwellPeakByAutomation(peakDelta: number, automation: number): number {
  return peakDelta * automation;
}
```

`automation` is never `0` at any of these call sites (the tick-level gate already excludes that), so this never silently creates a `peakDelta: 0` swell that then does nothing for its whole duration — that would be indistinguishable from a wasted concurrency-cap slot, which the intent doc's "0% is a full stop, not just a magnitude of zero" line explicitly rules out at the *trigger* level, not the magnitude level.

### 1.4 The 0% forced-return mechanism — reusing falling-phase math, no new field

`advanceActiveSwells` reads `automation` fresh once per tick (not the value captured at swell creation — this check is about the *current* slider position) and passes it to `advanceGlobalSwell`/`advanceRobotSwell`. At the top of each, before the existing elapsed/phase computation:

```typescript
if (automation === 0 && swell.phase === 'rising') {
  const currentValue = readGlobalValue(target); // fresh from the store, same convention writeRobotValue already uses
  swell.peakDelta = currentValue - swell.baseValue!;
  swell.risingMeasures = 0;
  swell.startMeasure = measure;
  swell.phase = 'falling';
}
```

(the robot-pool equivalent does this **per member**, since `baseValue`/`peakDelta` are per-member, while `phase`/`risingMeasures`/`startMeasure` are mutated once at the swell level, shared by every member — same lock-step-in-time-not-magnitude shape `AUDIO_SWELLS.md` §1.5 already established for company-wide swells).

Why this reuses the falling-phase formula exactly, with no new interpolation concept: the existing formula computes `fallElapsed = elapsed - risingMeasures` and `value = baseValue + peakDelta * (1 - fallElapsed / fallingMeasures)`. Setting `risingMeasures = 0` and `startMeasure = measure` (now) makes `elapsed = 0` on the very tick forcing happens, so `fallElapsed = 0` and the formula evaluates to `baseValue + peakDelta = currentValue` — i.e. **no audible jump on the forcing tick itself**. From the next tick onward, `fallElapsed` climbs toward the swell's own already-drawn `fallingMeasures` exactly as it would have for a normal end-of-cycle fall, landing on `baseValue` at the same cadence a natural fall would have. This is "riding its own already-drawn `fallingMeasures` back down to base," verbatim from the intent doc's Success criteria — not a new snap, not a new duration.

**No new `ActiveSwell`/`SwellMember` field is needed to mark "already forced."** The guard `swell.phase === 'rising'` is sufficient by construction: forcing immediately flips `phase` to `'falling'`, so the very next tick's check on the same swell is already `false` and skips re-forcing — which would otherwise be a real bug (re-deriving `peakDelta` from `currentValue` every tick while parked at that value would freeze the swell in place forever instead of ever reaching base). A swell already in its falling phase when `automation` hits `0` — whether because it got there naturally or because it was already forced on an earlier tick — is correctly left untouched by this check: it's already walking to base, so re-triggering the conversion would only reset its remaining-fall countdown for no benefit. This also gives "forced returns aren't undone" (intent doc, Success) for free: nothing in `advanceGlobalSwell`/`advanceRobotSwell`'s normal per-tick logic reads `automation` except this one top-of-function guard, so a forced swell rides its falling phase to completion identically regardless of what the slider does afterward — there is no code path that ever flips a `'falling'` swell back to `'rising'`.

### 1.5 Behavior divergence from the old boolean — an existing test gets rewritten, not preserved

`audioSwells.test.ts`'s current `describe('audioSwellsEnabled (Sector Settings toggle)', ...)` block has a test titled *"lets an already-in-flight swell finish naturally while disabled mid-ramp, rather than cancelling it"* — asserting the old boolean's deliberate design (disabling only ever gates *new* swells; an in-flight one, rising or falling, was always left alone). That assertion is **directly reversed** by §1.4 above: at automation `0`, a still-rising swell is no longer left alone, it's forced into an early return. This is not an oversight to reconcile — it's the intent doc's explicit "0% is a full stop" requirement, confirmed via interview, superseding the old toggle's behavior on this one point. §5 spells out the replacement test; flagged here so Plan/Implement doesn't read the old passing test as a regression signal when it starts failing.

### 1.6 `globalBypass` must fully silence the global pool — a related, pre-existing gap closed in this same pass

Confirmed with the user directly, prompted by this spec's own "should bypass gate the slider" question: **enabling the Rig-wide Bypass must mean nothing Rig-related is audible, swells included** — not just visually disabling the new slider. This is scoped to the **global pool only** — Bypass (`globalAudio.globalBypass`, `AudioRigDrawer.tsx`'s `rigDisabled`) is specifically "bypass the global effects chain"; it has no relationship to the robot pool, which modifies individual robot voices (volume, layer gain/detune/phase/pulseWidth, ADSR), not anything in the global FX chain. Robot swells stay fully unaffected by `globalBypass`, exactly as every other robot-facing control already is.

This isn't new machinery — it's a one-condition widening of a check `audioSwells.ts` already has. `isGlobalTargetEligible` and `advanceGlobalSwell`'s `stillEnabled` check both currently gate on one thing: the individual effect's own `enabled` flag (`AUDIO_SWELLS.md` §3's "a disabled/bypassed global effect is never eligible... if an effect's enabled flag flips to false while one of its params is mid-swell, that swell is cancelled immediately and the param snaps back to its captured base value in the same tick"). `globalBypass` is a second, rig-wide way for an effect to be inaudible, and this spec treats it identically to a per-effect disable — same eligibility check, same immediate-cancel-and-snap path, not the gradual §1.4 forced-return (bypass is a hard kill switch, not a "turn automation down" gesture, so the existing instant-cancel mechanic is the correct one to extend, not the new gradual one built for the slider):

```typescript
function isGlobalTargetEligible(target: SwellGlobalTargetId): boolean {
  if (activeSwells.has(target)) return false;
  const globalAudio = useAudioStore.getState().globalAudio;
  if (globalAudio.globalBypass) return false; // NEW — same "not eligible" reasoning as a disabled effect
  return globalAudio[GLOBAL_TARGET_META[target].effect].enabled;
}
```

```typescript
function advanceGlobalSwell(key: string, swell: ActiveSwell, measure: number, automation: number): void {
  // ...forced-return check (§1.4) runs first, unchanged...
  const globalAudio = useAudioStore.getState().globalAudio;
  const stillEnabled = globalAudio[meta.effect].enabled && !globalAudio.globalBypass; // globalBypass added
  if (!stillEnabled) {
    writeGlobalValue(target, baseValue); // unchanged — same immediate cancel-and-snap AUDIO_SWELLS.md §3 already specifies
    activeSwells.delete(key);
    return;
  }
  // ...unchanged...
}
```

Because `AudioEngine`'s own bypass routing already makes a bypassed chain's params inaudible regardless of what they're set to, this change doesn't fix an audible bug so much as it closes a state-consistency gap: without it, global swells keep silently running and consuming the pool's 5-slot cap, and burn CPU, while bypassed, and a swell frozen mid-ramp when bypass was enabled would resume from a stale mid-ramp position (not its true base) if bypass were later disabled mid-swell. Extending the existing disabled-effect path avoids both.

---

## 2. Target File Structure

```text
src/
├── stores/
│   ├── audioStore.ts              # MODIFIED — audioSwellsEnabled/setAudioSwellsEnabled
│   │                                 #   removed; pingVarianceAutomation/setPingVarianceAutomation
│   │                                 #   added (top-level, mirrors the removed field's shape);
│   │                                 #   regenerateGlobalAudioFromSeed additionally seeds it
│   └── audioStore.test.ts         # MODIFIED
├── utils/
│   ├── globalAudioSeed.ts         # MODIFIED — new generatePingVarianceAutomation()
│   │                                 #   (private PING_VARIANCE_AUTOMATION_SEED_RANGE
│   │                                 #   constant, [0.33, 0.66], same shape as
│   │                                 #   DELAY_ENABLED_THRESHOLD)
│   └── globalAudioSeed.test.ts    # MODIFIED
├── data/
│   ├── audioRigConfig.ts          # MODIFIED — new PING_VARIANCE_AUTOMATION_SCHEMA
│   │                                 #   (SliderLinearSchema, 0-100, unit '%') exported
│   │                                 #   as a bare schema, NOT added to AUDIO_RIG_CONFIG's
│   │                                 #   per-effect block array (it isn't an effect param)
│   ├── audioRigConfig.test.ts     # MODIFIED
│   ├── sectorSettingsConfig.ts    # MODIFIED — AUDIO_SWELLS_ENABLED_SCHEMA removed entirely
│   └── sectorSettingsConfig.test.ts # MODIFIED
├── components/panels/screen/console/
│   ├── AudioRigDrawer.tsx         # MODIFIED — bare SliderLinear rendered after the
│   │                                 #   LFO_DRIFT_GROUPS block (bottom of the drawer,
│   │                                 #   outside any AccordionContainer), wired to
│   │                                 #   pingVarianceAutomation/setPingVarianceAutomation
│   │                                 #   with the same *100 / /100 conversion the LFO
│   │                                 #   Drift rows already use
│   ├── AudioRigDrawer.test.tsx    # MODIFIED
│   ├── SectorSettingsDrawer.tsx   # MODIFIED — Toggle + audioSwellsEnabled wiring removed;
│   │                                 #   Toggle import dropped if this was its only use
│   └── SectorSettingsDrawer.test.tsx # MODIFIED
└── systems/
    ├── audioSwells.ts             # MODIFIED — tickAudioSwells' gate; maybeStartGlobalSwell/
    │                                 #   startSingleRobotSwell/startCompanyWideSwell gain an
    │                                 #   `automation` param and a final scaleSwellPeakByAutomation
    │                                 #   call; advanceActiveSwells/advanceGlobalSwell/
    │                                 #   advanceRobotSwell gain the forced-return check (§1.4);
    │                                 #   isGlobalTargetEligible/advanceGlobalSwell's stillEnabled
    │                                 #   also gate on globalBypass (§1.6) — robot-pool functions
    │                                 #   are untouched by §1.6, only automation-related (§1.3/1.4)
    └── audioSwells.test.ts        # MODIFIED — see §5

docs/
└── AUDIO_SYSTEM.md   # MODIFIED — "Audio Swells" section's "User toggle" paragraph
                        #   rewritten for the slider; heading/wording updated so a
                        #   reader searching for "Enable automatic effects" still finds it
```

**Explicitly not touched, and why:** `src/types/audioSwell.ts` (§1.4 — no new field needed), `src/data/audioSwellRanges.ts` (robot swing bounds are unrelated to this control), `src/engine/lfoEngine.ts`/`lfoDrift.ts`/`lfoShared.ts` (still untouched by Audio Swells entirely, per `AUDIO_SWELLS.md` §1.1 — unaffected by this reshaping), `src/systems/worldTransition.ts` (the `stopAudioSwells()`/`startAudioSwells(localeId)` wiring is per-locale lifecycle, orthogonal to this per-Attenuation-Style control), `src/components/ui/controls/*` (no new primitive — `SliderLinear` already exists and is reused as-is, per the user's explicit direction).

No new dependency. No file is renamed. No file is newly created — every change in this spec modifies an existing file, unlike `AUDIO_SWELLS.md`'s original build-from-scratch scope.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Reuse existing primitives — no new UI component.** The slider is `SliderLinear` (`src/components/ui/controls/SliderLinear.tsx`), the same primitive every other `sliderLinear`-typed Rig control already uses (e.g. `delay.wet`, `reverb.wet`). No new `ControlSchema` variant, no bespoke slider component.
* **No new `ActiveSwell`/`SwellMember` field.** §1.4 establishes that the existing `phase` field is a sufficient "already forced" marker — do not add a `forcedReturn` boolean or similar; that would be new machinery the intent doc's "reuse existing mechanics wherever possible" constraint explicitly rules out where an existing field already does the job.
* **`Math.random()` stays banned.** `generatePingVarianceAutomation` must use `getSeededVal` against the Attenuation Style noise map, exactly like every other seeded Rig field — no exception for this one.
* **`BeatClock`-driven scheduling is unchanged.** This spec adds no new schedule; it only changes what already-scheduled `tickAudioSwells`/`advanceActiveSwells` calls compute. No `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask` anywhere touched by this spec, per CLAUDE.md's non-negotiable rule.
* **The multiply happens strictly after every attribute-specific clamp, never before or instead of one** (§1.3) — `automation` scaling and the Volume/detune/HPF/LPF exceptions are independent, composable steps; do not fold `automation` into any of `clampVolumeDownward`/`peakDeltaCappedByFraction`/`clampGlobalPeak`'s own logic.
* **The forced-return check reads `automation` fresh every tick, not the value captured at swell creation** — unlike `baseValue`/`peakDelta`/`risingMeasures`/`fallingMeasures`, which are captured once and never re-read from the store after a swell starts (§1.4's "reads fresh from the store" language applies only to the *field's live value*, e.g. `readGlobalValue(target)`/`readRobotValue(robot, attribute)`, for the same "concurrent hand-edit" reason `writeRobotValue`'s own doc comment already gives).
* **Global writes still go through `useAudioStore.getState().setGlobalAudio()`; robot writes still go through `robotOptionsActions.ts`'s `apply*` functions** — unchanged from `AUDIO_SWELLS.md` §3; this spec's forced-return path writes through the exact same `writeGlobalValue`/`writeRobotValue` helpers every other tick already uses, not a new write path.
* **`setPingVarianceAutomation` is a plain state write, no `AudioEngine` call** — same shape as the `setAudioSwellsEnabled` it replaces; there is no live node to push an "automation amount" to. `audioSwells.ts` reads the field fresh on its own next tick, same as before.
* **`pingVarianceAutomation` seeds once per session and is then carried forward across every Attenuation Style switch** (§1.2) — do not reseed it on every `regenerateGlobalAudioFromSeed` call the way `eq3.low`/`reverb.wet`/every per-effect field is; it belongs in the `globalBypass`/`compressorBeforeDelay` carry-forward group, confirmed directly with the user.
* **`globalBypass` must gate the global swell pool exactly like a per-effect disable does** (§1.6) — extend `isGlobalTargetEligible`/`advanceGlobalSwell`'s existing `enabled`-flag check, don't add a parallel bypass-specific check. This is scoped to the global pool only; the robot pool must stay completely unaffected by `globalBypass`.
* **No changes to `docs/COMPONENT_LIBRARY.md`** — no UI primitive is touched or added.

---

## 4. Code Style & Architecture Conventions

**`src/stores/audioStore.ts`** (diff shape):

```typescript
/** Sentinel for "not yet seeded this session" — outside [0, 1], the domain of
 *  every real value (seeded or hand-dragged). regenerateGlobalAudioFromSeed
 *  uses this to seed pingVarianceAutomation exactly once per session and
 *  carry it forward across every later Attenuation Style switch (§1.2) —
 *  the field-level equivalent of how globalBypass/compressorBeforeDelay
 *  already survive regeneration via the current-value spread below, except
 *  those two never need a "have I seeded yet" check because their generator
 *  always returns the same static default. */
const PING_VARIANCE_AUTOMATION_UNSEEDED = -1;

export interface AudioStore {
  // ...
  /** Continuous automation-amount fraction, [0, 1] — replaces the former
   *  audioSwellsEnabled boolean (docs/specs/PING-VARIANCE-AUTOMATION.md).
   *  Read directly by audioSwells.ts's own tick, same as the boolean it
   *  replaces: a plain UI-adjacent value, not tied to AudioEngine. Seeded
   *  once per session (regenerateGlobalAudioFromSeed's first call), then
   *  carried forward across every future Attenuation Style switch — freely
   *  draggable via the Audio Rig slider at any time. */
  pingVarianceAutomation: number;
  // ...
  /** Sets the Audio Rig "Ping Variance Automation" slider — a plain state
   *  write, no AudioEngine call; audioSwells.ts reads this fraction fresh
   *  on its own next tick (both for scaling a newly-created swell's peak
   *  and for the 0%-forced-return check). */
  setPingVarianceAutomation: (value: number) => void;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  // ...
  pingVarianceAutomation: PING_VARIANCE_AUTOMATION_UNSEEDED, // real value assigned by the first regenerateGlobalAudioFromSeed call below (module-load AS-sync)
  // ...
  setPingVarianceAutomation: (value) => {
    set({ pingVarianceAutomation: value });
  },

  regenerateGlobalAudioFromSeed: (attenuationStyleId, attenuationStyleName) => {
    const generated = generateGlobalAudioSettings(attenuationStyleId, attenuationStyleName);
    const current = get().globalAudio;
    const globalAudio: GlobalAudioSettings = {
      ...generated,
      globalBypass: current.globalBypass,
      compressorBeforeDelay: current.compressorBeforeDelay,
    };
    // Seed once per session; every later switch leaves the user's current
    // value untouched (§1.2) — deliberately NOT included in this set() call
    // at all on a later switch, rather than spread from `current`, since
    // Zustand's default merge already preserves any key this call omits.
    const pingVarianceAutomation = get().pingVarianceAutomation === PING_VARIANCE_AUTOMATION_UNSEEDED
      ? generatePingVarianceAutomation(attenuationStyleId, attenuationStyleName)
      : undefined;
    set({ globalAudio, ...(pingVarianceAutomation !== undefined ? { pingVarianceAutomation } : {}) });
    applyGlobalAudioToEngine(globalAudio);
  },
}));
```

`audioSwellsEnabled`/`setAudioSwellsEnabled` are deleted, not deprecated — the intent doc is explicit that this is "one control, relocated and reshaped, not two."

**`src/utils/globalAudioSeed.ts`** (new function, same file/conventions `generateGlobalAudioSettings` already lives in):

```typescript
/** Ping Variance Automation's own seeded-default range — [33%, 66%] as a
 *  fraction — same "bounded/legible default, freely draggable afterward"
 *  convention every other seeded Rig field follows (e.g. DELAY_ENABLED_THRESHOLD).
 *  docs/specs/PING-VARIANCE-AUTOMATION.md §1.2. */
const PING_VARIANCE_AUTOMATION_SEED_RANGE = { min: 0.33, max: 0.66 };

export function generatePingVarianceAutomation(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  return getSeededVal(
    noiseMap, 'globalAudio.pingVarianceAutomation', 0,
    PING_VARIANCE_AUTOMATION_SEED_RANGE.min, PING_VARIANCE_AUTOMATION_SEED_RANGE.max
  );
}
```

**`src/data/audioRigConfig.ts`** (new bare schema, exported alongside `DECAY_MODE_SCHEMA` — both are top-level special cases `AudioRigDrawer.tsx` renders outside the per-effect `AUDIO_RIG_CONFIG` loop):

```typescript
// Human label confirmed with the user directly (2026-09-01) — the intent
// doc (docs/intent/ping-variance-automation.md, "Out of scope") had left it
// undecided; this spec's draft label was accepted as final.
export const PING_VARIANCE_AUTOMATION_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.pingVarianceAutomation',
  type: 'sliderLinear',
  loreLabel: 'PING VARIANCE AUTOMATION',
  humanLabel: 'Automatic Effects',
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
};
```

**`src/components/panels/screen/console/AudioRigDrawer.tsx`** (diff — new bare control after the existing `LFO_DRIFT_GROUPS.map(...)` block, before the closing `</div>`):

```typescript
const pingVarianceAutomation = useAudioStore((s) => s.pingVarianceAutomation);
const setPingVarianceAutomation = useAudioStore((s) => s.setPingVarianceAutomation);

// ...inside the returned JSX, after the LFO_DRIFT_GROUPS.map(...) block,
// still inside audio-rig-drawer but NOT inside any AccordionContainer —
// a bare control, same shape as the master-row Bypass toggle at the top:
<div className="audio-rig-drawer__master-row">
  <SliderLinear
    schema={PING_VARIANCE_AUTOMATION_SCHEMA}
    value={pingVarianceAutomation * 100}
    onChange={(v) => setPingVarianceAutomation(v / 100)}
    disabled={rigDisabled}
  />
</div>
```

Reuses the `audio-rig-drawer__master-row` class the Bypass toggle already establishes (no new CSS) and the exact `* 100` / `/ 100` conversion the LFO Drift rows use a few lines above it in the same file — not a new idiom. `disabled={rigDisabled}` matches every other Rig-wide control's existing disabled behavior (the rig-wide Bypass gates everything below it, including LFO Drift; Ping Variance Automation is no exception, being explicitly "a Rig-wide meta-setting" per the intent doc).

**`src/systems/audioSwells.ts`** (diff shape — the four touched functions):

```typescript
export function tickAudioSwells(localeId: string, measure: number): void {
  const as = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!as) return;
  const noiseMap = getAttenuationStyleNoiseMap(as.id, as.name);
  const automation = useAudioStore.getState().pingVarianceAutomation;

  advanceActiveSwells(localeId, measure, automation);

  const wholeMeasure = Math.floor(measure);
  if (wholeMeasure !== lastRolledMeasure) {
    lastRolledMeasure = wholeMeasure;
    if (automation > 0) {
      maybeStartGlobalSwell(noiseMap, wholeMeasure, automation);
      maybeStartRobotSwell(localeId, noiseMap, wholeMeasure, automation);
    }
  }
}

function maybeStartGlobalSwell(noiseMap: NoiseFunction2D, measure: number, automation: number): void {
  // ...unchanged selection/clamp logic...
  const peakDelta = scaleSwellPeakByAutomation(
    clampGlobalPeak(target, currentValue, pickSwellPeakDelta(noiseMap, `audioSwell.peak.${target}`, measure, range, currentValue)),
    automation,
  );
  // ...unchanged activeSwells.set(...)...
}

// startSingleRobotSwell/startCompanyWideSwell: same shape — automation
// threaded in as a parameter, scaleSwellPeakByAutomation wraps the existing
// clampVolumeDownward(...) call at each member's peakDelta computation.

function advanceActiveSwells(localeId: string, measure: number, automation: number): void {
  const processed = new Set<ActiveSwell>();
  for (const swell of activeSwells.values()) {
    if (processed.has(swell)) continue;
    processed.add(swell);
    if (swell.pool === 'global') advanceGlobalSwell(swell.globalTarget!, swell, measure, automation);
    else advanceRobotSwell(swell, localeId, measure, automation);
  }
}

// advanceGlobalSwell/advanceRobotSwell: each gains the §1.4 forced-return
// check as its first statement, ahead of the existing elapsed/phase logic.
```

* **Naming Conventions:** `scaleSwellPeakByAutomation`, `generatePingVarianceAutomation`, `PING_VARIANCE_AUTOMATION_SCHEMA`, `PING_VARIANCE_AUTOMATION_SEED_RANGE` — same `verbNoun`/`SCREAMING_SNAKE_CASE` conventions the surrounding files already use throughout.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest.
* **Test File Location:** Colocate, matching every file in §2.
* **`audioStore.test.ts` (modified):** `pingVarianceAutomation`/`setPingVarianceAutomation` replace every `audioSwellsEnabled`/`setAudioSwellsEnabled` assertion. `regenerateGlobalAudioFromSeed` gets new coverage for the carry-forward mechanism (§1.2), not a reseed-every-call one:
  1. The first call after store init (value still the `PING_VARIANCE_AUTOMATION_UNSEEDED` sentinel) seeds `pingVarianceAutomation` into `[0.33, 0.66]`.
  2. A second call with a **different** Attenuation Style id/name leaves `pingVarianceAutomation` at exactly the value the first call produced — unchanged, not re-sampled.
  3. If the user has dragged the slider to an arbitrary value (e.g. `0.9`, outside the seed range) between two `regenerateGlobalAudioFromSeed` calls, a later call still leaves it at `0.9` — proves the carry-forward reads the live current value, not just "was it ever seeded."
* **`globalAudioSeed.test.ts` (modified):** `generatePingVarianceAutomation` — determinism (same AS id/name → same value), range (`[0.33, 0.66]` across many sampled AS names, matching how `DELAY_ENABLED_THRESHOLD`'s own distribution is presumably already tested), and a direct source-scan/assertion that it's `getSeededVal`-driven (no `Math.random()`). This function's own determinism/range is tested independent of *when* `audioStore.ts` chooses to call it — that policy is `audioStore.test.ts`'s concern (above), not this file's.
* **`audioRigConfig.test.ts` (modified):** `PING_VARIANCE_AUTOMATION_SCHEMA` is a valid `SliderLinearSchema` (`min: 0, max: 100`), and — if this file has a "every schema id is unique" or "every schema referenced by the drawer is exported" style assertion — that it's included.
* **`sectorSettingsConfig.test.ts` (modified):** `AUDIO_SWELLS_ENABLED_SCHEMA` no longer exists/exported.
* **`SectorSettingsDrawer.test.tsx` (modified):** every existing `audioSwellsEnabled`-related test (`renders on by default...`, `renders off when...`, `clicking it flips...`) is deleted, not adapted — the control no longer lives in this drawer at all.
* **`AudioRigDrawer.test.tsx` (modified) — new coverage:**
  1. Renders the slider with `value = pingVarianceAutomation * 100`.
  2. Dragging it calls `setPingVarianceAutomation(v / 100)`.
  3. It's disabled when `globalBypass` is true, same as the LFO Drift rows.
  4. It renders once, outside any `AccordionContainer` (a DOM-structure assertion, guarding §2's "bare control" placement).
* **`audioSwells.test.ts` (modified) — the bulk of the behavioral coverage:**
  1. **Delete/replace, don't adapt:** the entire `describe('audioSwellsEnabled (Sector Settings toggle)', ...)` block (§1.5) is replaced by a new `describe('pingVarianceAutomation', ...)` block. The *"lets an already-in-flight swell finish naturally while disabled mid-ramp"* test is explicitly **removed**, not renamed — its assertion is now false (§1.5) — and replaced by the forced-return test below.
  2. **Gate, unchanged in shape:** at `pingVarianceAutomation: 0`, no new swell (global or robot) starts even when the trigger draw would otherwise succeed (mirrors the old boolean-disabled test, adapted to the new field name/value).
  3. **Magnitude scaling:** at `pingVarianceAutomation: 0.5`, a newly-created swell's `peakDelta` is exactly half what the identical seed would have produced at `1` (assert against a direct `pickSwellPeakDelta`/`clampGlobalPeak` computation for the same inputs, times `0.5`) — for both the global pool and a single-robot pick. Assert the multiply is the *last* step by picking a case where the default clamp would otherwise produce a larger delta than `0.5 * fullDelta` (i.e. prove clamping-then-scaling, not scaling-then-clamping, by using Volume's downward floor or HPF's ceiling as the clamped case and checking the final value is consistent only with clamp-first ordering).
  4. **Forced return, global pool:** start a swell at `pingVarianceAutomation: 1`, advance partway into its rising phase, then set `pingVarianceAutomation: 0` and tick once more — assert (a) no audible jump on that tick (value unchanged from the tick immediately prior), (b) the swell's `phase` is now `'falling'`, (c) advancing across its own original `fallingMeasures` count lands it exactly on `baseValue`, matching the normal return-to-base assertion style `AUDIO_SWELLS.md` §5 already established.
  5. **Forced return, robot pool (including company-wide):** same shape as (4), asserting every member of a company-wide swell is force-converted together (shared `phase`/timing) while each keeps its own `baseValue`/newly-derived `peakDelta`.
  6. **Already-falling swells are left alone:** a swell already in its falling phase when `pingVarianceAutomation` drops to `0` continues on its original `fallingMeasures` schedule, unperturbed (its `peakDelta`/`startMeasure` are unchanged by the tick that flips automation to `0`) — regression guard for §1.4's "only a still-rising swell is force-converted" design decision.
  7. **No double-forcing:** ticking several more times while `pingVarianceAutomation` stays at `0` does not re-derive `peakDelta` on an already-forced (now-falling) swell — assert its `peakDelta`/`startMeasure` are stable across those ticks (regression guard for the "freeze in place" bug §1.4 calls out).
  8. **Forced returns aren't undone:** force a swell into return at `0`, then set `pingVarianceAutomation` back to a nonzero value before the forced fall completes — assert the swell still rides out its forced fall to `baseValue` on the original schedule, never resumes a rising phase or gets a fresh `peakDelta`.
  9. **Resumes starting new swells once nonzero again** — same shape as the old boolean's equivalent test, adapted to the new field.
  10. **Seeded-default plumbing (integration-shaped, may belong in `audioStore.test.ts` instead per that file's existing convention):** after `regenerateGlobalAudioFromSeed`, `tickAudioSwells` reading `pingVarianceAutomation` sees a value in `[0.33, 0.66]`, not the old default of `true`/`1`.
* **`audioSwells.test.ts` — new `describe('globalBypass', ...)` block (§1.6):**
  1. **Global pool ineligibility:** with `globalAudio.globalBypass: true` and `pingVarianceAutomation: 1`, a tick whose trigger draw would otherwise succeed starts no new global swell; a robot swell can still start in the same tick (proves the gate is global-pool-scoped, not a blanket automation override).
  2. **Immediate cancel-and-snap, not a graceful fall:** start a global swell with `globalBypass: false`, advance partway into its rising phase, then set `globalBypass: true` and tick once more — assert the field snaps directly to `baseValue` on that tick (not a partial step toward it) and the swell is removed from `activeSwells`, mirroring the existing "effect disabled mid-swell" test's exact assertion shape.
  3. **Robot pool unaffected:** with `globalBypass: true`, a robot-pool trigger draw that would otherwise succeed still starts a swell, and an already in-flight robot swell keeps advancing normally — regression guard for §1.6's "scoped to the global pool only" boundary.
  4. **Composes correctly with `pingVarianceAutomation`:** `globalBypass: true` and `pingVarianceAutomation: 1` together still block new global swells (bypass alone is sufficient, no dependency on automation also being 0).
* **`AUDIO_SYSTEM.md` doc change:** no automated test; verify by reading — the "User toggle" paragraph must no longer describe a boolean/toggle, and must not leave any stale reference to `audioSwellsEnabled`, `setAudioSwellsEnabled`, or the Sector Settings drawer as this control's home.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass (the deliberate removal in item 1 above is the one intentional exception to "existing tests keep passing unmodified").
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load a fresh Attenuation Style, open the Audio Rig drawer, confirm the new slider appears at the bottom (not in Sector Settings, not inside an accordion) with a seeded starting value roughly in the 33–66% band; drag it to 0% while a swell is audibly mid-rise and confirm it audibly settles back to its resting value over a few measures rather than either snapping instantly or continuing to climb; drag it partway (e.g. 50%) and confirm newly-started swells are noticeably subtler than at 100%.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/swells` is the active branch and already reflects this spec's scope (a continuation of the same feature family) — no rename or fresh branch needed, mirroring `AUDIO_SWELLS.md` §6's own resolution.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `audioStore.ts` + `globalAudioSeed.ts` (+ tests) — the store field/action and the seed-once/carry-forward mechanism, no behavior change to swells yet; (2) `audioSwells.ts` (+ test) — the magnitude-scaling and forced-return mechanics (§1.3/§1.4), likely the largest single commit given §5's test list; (3) `audioSwells.ts` (+ test), separately — the `globalBypass` eligibility/cancellation extension (§1.6), small and independent enough to review on its own even though it's the same file as (2); (4) `audioRigConfig.ts` + `AudioRigDrawer.tsx` (+ tests) — the new slider; (5) `sectorSettingsConfig.ts` + `SectorSettingsDrawer.tsx` (+ tests) — removing the old toggle; (6) `docs/AUDIO_SYSTEM.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Do both pools stay governed by one control?~~ **Resolved: yes** — intent doc Outcome, unchanged from the boolean.
- ~~Is the magnitude scale applied once at creation or continuously?~~ **Resolved: once, at creation, baked in** — intent doc Success, explicitly not "live/continuous rescaling."
- ~~Does 0% cancel in-flight swells instantly or ramp them down?~~ **Resolved: forced return, riding the existing falling-phase interpolation** — intent doc Success.
- ~~Storage domain (fraction vs. integer percent)~~ **Resolved: `[0, 1]` fraction internally, `[0, 100]` display via the existing LFO-Drift-style conversion** — §1.2, this spec's own resolution of the intent doc's explicitly-deferred "Out of scope" item.
- ~~Does `SWELL_TRIGGER_CHANCE`/`SWELL_COMPANY_CHANCE` change?~~ **Resolved: no, explicitly out of scope** — intent doc.

Resolved via direct user confirmation (2026-09-01, same session — this spec's first draft had guessed at all three; the user corrected two of them):

- ~~Is the `'Automatic Effects'` human label acceptable as-is?~~ **Resolved: yes** — no longer a placeholder pending confirmation; treat §4's label as final unless revisited later.
- ~~Does `pingVarianceAutomation` reseed on every Attenuation Style switch, or carry the user's value forward?~~ **Resolved: carry forward, like `globalBypass`/`compressorBeforeDelay`** — this spec's first draft had it reseeding every switch (wrong); §1.2/§4 now reflect the corrected, sentinel-gated seed-once mechanism.
- ~~Should `globalBypass` silence global-pool swells, not just visually disable the slider?~~ **Resolved: yes, completely** — "if someone enables the bypass we shouldn't hear ANYTHING related to the global effects rig, swells or otherwise" (user, verbatim intent). §1.6 implements this by extending the existing disabled-effect eligibility/cancellation path to also check `globalBypass`, scoped to the global pool only — the robot pool is untouched.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **`AudioRigDrawer.test.tsx`'s existing test suite may already assert an exact list/count of `audio-rig-drawer__master-row` divs or top-level children** — Plan/Implement should check for a brittle count-based assertion that the new master-row addition could break incidentally, separate from the tests this spec intentionally adds.
2. **Whether the Audio Rig slider (`disabled={rigDisabled}`, §4) being visually disabled under `globalBypass` is sufficient, now that §1.6 also makes bypass functionally block new global swells at the `audioSwells.ts` level.** These are two independent mechanisms (UI disable vs. actual trigger gate) that happen to both key off `globalAudio.globalBypass` — not a conflict, just worth Plan/Implement double-checking they read the same underlying value and don't drift.
