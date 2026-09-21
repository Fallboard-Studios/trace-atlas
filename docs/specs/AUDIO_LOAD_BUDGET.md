# Phase Spec: Audio Load Budget

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev` — a phone on the LAN needs the **production** build instead: `npm run build && npx vite preview --host --port 4173`, then `http://<pc-ip>:4173/trace-atlas/?debug&…` (a phone over plain http is an insecure context — see [docs/PERFORMANCE.md](../PERFORMANCE.md))
> - Render-capacity measurement (Task 1 promotes the scratch script into the repo): `npm run perf:audio` — see §5.3

Source of intent: [Roadmap 17.2.6](../todo/roadmap.md#1726-performance-audio-load-budget), requested by Crawford 2026-09-20 after the phone investigation in [docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md). No separate intent doc — that investigation and §1.1 below are the motivation, and the four design decisions in §7 were made by Crawford in the same session. **Status: draft for review, 2026-09-20 — not yet approved, nothing implemented.** Task breakdown: not yet written (gated behind approval of this spec).

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and why it's a problem

On a Pixel 8 the audio clicks and sometimes drops out completely, while the `?debug` overlay stays green (context `running`, audio clock advancing at ×1.00, UI frames and main thread healthy). The working explanation — consistent with everything measured, **not proven** — is that the audio thread intermittently misses its per-buffer deadline: a single miss is a click, a long run of misses is a silence, and Chrome keeps advancing the clock either way.

What drives the load, measured on desktop with pinned worlds (`?seed=…&x=…&y=…`; full data in `scratchy-audio-phones.md`):

| Driver | Evidence | Size |
|---|---|---|
| The seed's **global LFO count** (0–7 running; audio-rate modulation of EQ/filter params) | Ablation both ways: `bravo` 0.57 → 0.41 with LFOs forced off; `charlie` 0.32 → 0.47 with all forced on | ≈ +0.02–0.03 render capacity per LFO |
| **How many robots are sounding at once**, in waves | A 4-minute run on `charlie` (0 LFOs) swings render capacity 0.27 ↔ 0.49 (peaks ≈ 0.99) on a ~1–2 minute cycle; a simulation of the battery cycle (`docs/ROBOT_LIFECYCLE.md` constants) puts audible robots at 2 → ~8 by ~1:00–1:20 (60 BPM), ~4 at ~2:00, then ~4–8 | ±0.1–0.2 |
| The idle per-robot voice chains (all 12 built at spawn, never released) | 12 robots ≈ 24% vs 3 robots ≈ 16–20% when quiet | a few points |
| `latencyHint: "playback"` | Removed the full dropouts on `bravo` on the phone (one run each, by ear); no visible change on `charlie` | tracked separately (17.2.4) |

The user-visible pattern matches: clicks come in waves that clear on their own, heavy seeds are worse, and the calm world clicks too because the *peaks* of sounding robots alone can exhaust a phone's audio budget.

**Nothing today limits how much can sound at once except `MAX_POLYPHONY = 16` simultaneous notes** (`src/constants/index.ts`), which is sized for a desktop. The number of robots that may be audible is bounded only by the fixed 12-robot roster and the battery cycle.

### 1.2 What's changing

A single user-adjustable **Audio Load** setting caps two things together:

- **`maxAudibleRobots`** — how many robots may *sound* at once (1–12). A robot that is eligible to sound (not muted, not excluded by solo) but over the limit stays silent — "standing by" — and still lives, wanders, drains and recharges normally. Only its audio is withheld.
- **`maxPolyphony`** — the simultaneous-note ceiling that `MAX_POLYPHONY` fixes at 16 today, made dynamic.

One dial moves both (§1.4). **At the top of the dial (Full) both caps equal today's behavior exactly — 12 audible robots, 16 notes — so Full is a no-op** and the whole feature is opt-down.

Users pick a preset (Light / Standard / Full) or drag a fine slider; the default is chosen automatically — **Light on phone-like devices, Full elsewhere** (§7 decision 4). A URL param (`?load=`) pins it for testing and, later, for shared links.

### 1.3 How admission works: first come, first served

Which robots sound when there are more eligible than slots is decided by a small pure function over an ordered list — the **sounding set** (§4.1):

- A robot that is eligible and already in the set **keeps its slot**.
- A newly eligible robot is admitted **only if a slot is free**; otherwise it waits, in arrival order.
- When a slot frees — a robot departs to dock (its `audioMode` becomes `'mute'`), is muted, or the limit is raised — the **earliest-waiting** robot is admitted.
- When the limit is **lowered**, robots are evicted **last-in, first-out** down to the new limit.
- Eviction and gating apply to **new notes only**. A robot that has just been evicted or muted lets its ringing note finish; nothing is truncated, so nothing clicks.

The battery cycle supplies the turnover for free: robots depart on their own within roughly a minute or two (`docs/ROBOT_LIFECYCLE.md`), which frees slots for the ones standing by.

### 1.4 Why one dial for both caps

Crawford chose "both, under one setting" (§7). The two caps guard the same thing from two sides — sounding robots bound the *sustained* number of voices producing notes, polyphony bounds the *instantaneous* worst case — and a user has no way to reason about their separate effect. The dial is a single 0–100% number `audioLoad`; both caps derive from it by linear interpolation between anchor points (§4.2). Presets are three named positions on the same dial, not a separate mode.

### 1.5 What this deliberately does *not* do

- **It does not tear down or defer building voice chains.** Every robot still gets a voice at spawn, as today. Gating is at the note trigger only. That keeps this change small and removes any risk of a build spike or a click when a robot changes state. Lazy chains (release voices for standing-by robots) is a possible **Phase B** (§7, decision list) — measured to be a weak lever on its own (a few points of render capacity, and least effective at the peaks), so it is only worth doing if Phase A's measurements leave a gap.
- **It does not touch the global LFOs**, the biggest single seed-dependent driver, nor `latencyHint`. Those are separate levers (control-rate LFO modulation; roadmap 17.2.4). Audio Load should be measured *with* them left as they are, so its own effect is isolated.
- **It does not change the lifecycle, animation, or visuals.** Standing-by robots keep swimming, drain and recharge; only their sound is withheld.
- **It does not persist the setting.** No app-wide persistence exists yet (`docs/SESSION_STORAGE.md` is a design doc for roadmap Phase 20). The default is re-derived each load, and `?load=` overrides it.

### 1.6 Audited: what depends on a robot being audible

Checked 2026-09-20 by reading the code, not assumed:

- **`audioMode` has four values** — `'none' | 'solo' | 'mute' | 'highlight'` (`src/types/Robot.ts`). `isRobotAudible(audioMode, anySolo)` (`src/utils/robotAudibility.ts`) is `false` for `'mute'`, and `false` for anything but `'solo'` while any robot is soloed. `'highlight'` does not silence anyone; it attenuates the others by ~6 dB in `scheduleNote`.
- **Every writer of `audioMode` goes through `useLocaleStore.updateRobot`**: `robotOptionsActions.applyAudioMode` (individual, and the company-options broadcast), `robotSystems.landOnActive`/`landOnDocked`, and `spawnSystem.spawnRobot`. So one store subscription sees all of them without touching each.
- **The sole audibility gate is `triggerWithCap`** (`src/engine/AudioEngine.ts`, ~line 297), evaluated per note *before* the polyphony cap. A muted robot never consumes a polyphony slot today; a standing-by robot must not either.
- **A docked robot is muted by `audioMode: 'mute'` alone.** Its voice and melody stay reserved (`docs/ROBOT_LIFECYCLE.md`), and a user can flip it to `'none'` — individually or via company options — and hear it. Under the budget that still works, subject to a free slot (§7 open question B).
- **Robot LFOs are not connected at spawn.** `generateRobotLfoSettings` seeds settings into state, but nothing calls `connectLfoTarget` for a robot until a user edits one in Robot Options (`robotOptionsActions.applyLayerLfo`). So robot LFOs are not an unaccounted load today, and this change does not touch them.
- **Consumers that require a live voice** (relevant only to a future Phase B, listed so it isn't rediscovered): `triggerWithCap`; `updateAllPanners` (iterates the voice map each 16n tick); `getRobotModulationTarget` (robot-LFO connect); and the `updateVoiceLayerParams` / `updateVoiceEnvelope` / `updateRobotMasterVolume` calls from `robotOptionsActions`, `audioSwells`, and the phase-LFO polling fallback — each `devWarn`s and no-ops when no voice exists.
- **The voice counter's release runs off Tone's ticker on the main thread** (`scheduleVoiceRelease` → `Tone.getContext().setTimeout`). A lower polyphony cap makes a stuck counter *more* likely to silence notes, so the cap must never be enforced below the number of currently-active voices in a way that strands the counter (§7 risks).

---

## 2. Target File Structure

```
src/
├── engine/
│   ├── AudioEngine.ts                   MODIFIED — dynamic polyphony cap + sounding-set gate in triggerWithCap;
│   │                                    setPolyphonyCap()/setSoundingRobots() pushed in by the budget system (no store import: keeps
│   │                                    the existing engine↔audioStore load-order constraint intact); getPolyphonyStats().maxVoices = live cap
│   └── audioDiagnostics.ts              MODIFIED — expose sounding/eligible counts + current caps to the ?debug overlay
├── systems/
│   ├── audioBudgetSystem.ts             NEW — subscribes to robots' audioMode/docking + audioLoad; computes the sounding set; pushes to
│   │                                    AudioEngine and writes audioStore.soundingRobotIds only when it actually changed
│   └── audioBudgetSystem.test.ts        NEW
├── stores/
│   ├── audioStore.ts                    MODIFIED — audioLoad (0..1) + setAudioLoad; soundingRobotIds: string[] (serializable, derived)
│   └── audioStore.test.ts               MODIFIED
├── utils/
│   ├── audioBudget.ts                   NEW — PURE: loadToLimits(audioLoad), reconcileSounding(prev, eligible, max), presets, detectDefaultAudioLoad(env), parseLoadParam()
│   └── audioBudget.test.ts              NEW
├── data/
│   ├── audioRigConfig.ts                MODIFIED — AUDIO_LOAD_SCHEMA (slider), AUDIO_LOAD_PRESET_SCHEMA (radio), AUDIO_LOAD_PANEL_SCHEMA
│   └── robotSelectionConfig.ts          MODIFIED — AUDIBILITY_LABELS gains a third state, 'limited' ("Standing by")
├── components/
│   ├── panels/screen/console/AudioRigDrawer.tsx      MODIFIED — Audio Load panel inside Transport & Composition
│   ├── selection/RobotSelectionCard.tsx              MODIFIED — status uses the third state
│   ├── robot/RobotDisplaySection.tsx                 MODIFIED — same
│   └── debug/hudLines.ts                             MODIFIED — "robots n/cap · poly cap" line
├── constants/index.ts                   MODIFIED — LOAD_* anchor constants; MAX_POLYPHONY kept as the Full ceiling
└── main.tsx / app boot                  MODIFIED — start the budget system (see §4.4)
scripts/perf/audio-load.mjs              NEW — promoted from the session's scratch script; render-capacity time series per pinned world
package.json                             MODIFIED — "perf:audio" script (no new dependency)
docs/
├── AUDIO_SYSTEM.md, POLYPHONY_GUIDE.md  MODIFIED — the dynamic cap and the sounding set
├── ROBOT_LIFECYCLE.md                   MODIFIED — audibility is now mute/solo *and* the budget
├── PERFORMANCE.md                       MODIFIED — ?load=, the measurement, baselines
├── PROCEDURAL_GENERATION.md             — untouched
└── specs/AUDIO_LOAD_BUDGET.md           THIS FILE
```

Nothing is removed. No new dependency.

---

## 3. Implementation Boundaries & Constraints

Non-negotiable, from `CLAUDE.md` (re-checked for this change):

- **Audio scheduling stays on the transport/BeatClock path.** The budget system reacts to *store changes* (event-driven), never a timer. The one existing per-tick hook — the 16n `scheduleRepeat` in `startMelodyPlayback` — is not modified beyond reading a `Set`.
- **State is JSON-serializable and holds no runtime objects.** `audioLoad` (number) and `soundingRobotIds` (`string[]`) qualify. The engine's `Set<string>` mirror and any admission history live in module state, never in Zustand.
- **`MIN_LEAD` is untouched.** No note is rescheduled; gating only decides whether a note triggers.
- **GSAP timelines never call `AudioEngine`.** The budget reacts to store state (`docking`/`audioMode`), which is exactly the "semantic callbacks" route the guardrail requires. No timeline callback is added.
- **No synths are created in components.** The UI only reads/writes `audioStore`.
- **UI shell:** the control lives in the Audio Rig drawer inside `ScreenViewport`; nothing goes in `SleeveContainer`.
- **Full is a no-op.** At `audioLoad = 1` behavior — including test-observable behavior — is identical to today. This is the regression safety net and gets its own test (§5.2).
- **Melodies are untouched** (indices 0..7, never literal pitches); the gate never rewrites, drops, or re-registers a melody — it only stops a trigger.
- **Re-render discipline** (this repo has been bitten repeatedly — `docs/todo/backlog.md` items 21–27): `soundingRobotIds` is written **only when the set actually changed** (reference-stable otherwise), and UI reads it through a **boolean per-robot selector**, never the whole array.

**Ask first** (per `CLAUDE.md`): adding any dependency (none planned); any change beyond the gate + cap described here to the audio/animation architecture (e.g. Phase B's voice teardown).
**Never:** relax the "Absolutely forbidden" list to make a step easier; enforce the cap by disposing voices in Phase A; store the sounding set anywhere but the store + the engine's private mirror.

---

## 4. Code Style & Architecture Conventions

### 4.1 The pure core (`src/utils/audioBudget.ts`)

Everything decision-making is a pure function with its own tests; the system and engine are thin shells (the same split as `audioHealth.ts` / `audioDiagnostics.ts`).

```typescript
export interface LoadLimits {
  maxAudibleRobots: number; // 1..MAX_ROBOTS
  maxPolyphony: number;     // LOAD_POLYPHONY_MIN..MAX_POLYPHONY
}

/** One dial in, both caps out — linear between the anchors in constants/index.ts. */
export function loadToLimits(audioLoad: number): LoadLimits;

/**
 * First-come-first-served admission. `previous` is the current ordered sounding set;
 * `eligible` is every robot id that isRobotAudible() says may sound, in roster order.
 * Keeps still-eligible members in place, drops the rest, admits newly eligible ids in
 * order while there is room, and — if `max` fell — evicts last-in first-out.
 * Returns `previous` itself (same reference) when nothing changed.
 */
export function reconcileSounding(
  previous: readonly string[],
  eligible: readonly string[],
  maxAudibleRobots: number,
): readonly string[];
```

### 4.2 The dial, anchors, and presets

```typescript
// constants/index.ts — STARTING values; Task 1 calibrates them against measured render capacity (§5.3).
export const LOAD_AUDIBLE_ROBOTS_MIN = 2;           // at audioLoad = 0
export const LOAD_POLYPHONY_MIN = 6;                // at audioLoad = 0
// at audioLoad = 1: MAX_ROBOTS (12) and MAX_POLYPHONY (16) — i.e. exactly today.
export const AUDIO_LOAD_PRESETS = { light: 0.2, standard: 0.6, full: 1 } as const;
// interpolation: audible = round(2 + 10·t), polyphony = round(6 + 10·t)
//   light  (0.2) → 4 robots,  8 notes
//   standard (0.6) → 8 robots, 12 notes
//   full   (1.0) → 12 robots, 16 notes   (today)
```

### 4.3 The engine gate

`triggerWithCap` gains one check, right after the existing `isRobotAudible` test and before the polyphony cap, so a standing-by robot never consumes a polyphony slot:

```typescript
if (soundingRobots !== null && !soundingRobots.has(robotId)) return false; // audio-load budget: standing by
if (activeVoices >= polyphonyCap) return false;                             // was MAX_POLYPHONY
```

`soundingRobots` is `null` until the budget system first runs, and `polyphonyCap` defaults to `MAX_POLYPHONY` — so the engine behaves exactly as today before (and without) the system, which keeps every existing `AudioEngine` test valid untouched.

### 4.4 The system

`audioBudgetSystem.ts` exports `startAudioBudget()` / `stopAudioBudget()` (a module-singleton pair mirroring `startRobotLifecycle`/`stopRobotLifecycle`, and idempotent). It subscribes to:

1. `useLocaleStore` — selecting a **signature string** of `id:audioMode:docking` per robot (not the robot objects), so it does not run on the constant battery/position/melody churn;
2. `useAudioStore` — `audioLoad` only.

On either change it recomputes eligibility (`isRobotAudible`), calls `reconcileSounding`, and — only if the result differs — pushes it to `AudioEngine.setSoundingRobots` and writes `soundingRobotIds`. It is started once at app boot (before first power-on, so the default is in force from the first note) and is **not** torn down by a power cycle: nothing in it depends on the transport, and `AudioEngine.killAll()` does not touch its state.

### 4.5 The control

Follows the exact pattern of `BPM_SCHEMA` / `DECAY_MODE_SCHEMA` (bare Rig-wide meta-settings in `audioRigConfig.ts`, wired at the drawer): a `directionalPanel` "Audio Load" in Transport & Composition holding a `radio` (Light / Standard / Full) and a `sliderLinear` (0–100%), plus a display line stating what the current position means ("Up to 4 robots · 8 notes at once"). The radio and slider are two views of one stored number: choosing a preset sets the slider; dragging the slider off a preset leaves the radio with no option selected. Lore labels are first-pass invented copy, to be confirmed in the manual check, same as the drift groups.

### 4.6 Naming and conventions

`audioLoad` (the dial), `LoadLimits`, `soundingRobotIds`, "standing by" (user-facing state). Section-header comment blocks (`// ====`) and the `IMPORTS / TYPES / FUNCTIONS` layout, as in the surrounding files.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest + Testing Library, co-located `*.test.ts(x)`. Pure logic first (TDD), then store/system integration, then engine gate, then UI. Mutation-check each new gate the way `audioHealth`/`audioContextSetup` were (break it, confirm a test fails).

### 5.2 New tests

- **`audioBudget.test.ts`** — `loadToLimits` at 0, the presets, 1, and out-of-range clamping; `reconcileSounding`: keeps incumbents; admits in order up to the cap; never exceeds the cap (property-style over many random eligible sequences); FCFS on a freed slot (earliest waiter, not roster order); LIFO eviction when the cap falls; drops robots that became ineligible; returns the *same reference* when nothing changed; empty inputs.
- **`detectDefaultAudioLoad`** — pure over `{ coarsePointer, viewportWidth, hardwareConcurrency, deviceMemory }`; **`parseLoadParam`** — `light|standard|full|0–100`, case-insensitive, invalid → `null`.
- **`audioBudgetSystem.test.ts`** — with real stores: a robot going `Active` when full stays out of `soundingRobotIds`; a departure frees the slot for the earliest waiter; lowering `audioLoad` evicts LIFO; raising it admits waiters; **mute and solo interplay** (a soloed set smaller than the cap; solo excludes non-solo robots); **no writes when nothing changed** (subscriber-call count stays flat across a simulated 200-measure lifecycle run, guarding the re-render-storm class); idempotent start/stop.
- **`AudioEngine.test.ts`** — a robot not in the sounding set never reaches `triggerAttackRelease` and does not increment `activeVoices`; a robot in it plays; `polyphonyCap` is honored; **`soundingRobots === null` and the default cap behave exactly as before** (the Full/no-system regression test); a lowered cap does not strand the counter; getPolyphonyStats reports the live cap.
- **`audioRigConfig` / `AudioRigDrawer.test.tsx`** — the panel renders inside Transport & Composition; preset selection sets the slider and vice versa; the readout shows the derived limits; keyboard/radio semantics come from the existing primitives.
- **`RobotSelectionCard` / `RobotDisplaySection` tests** — a robot that is eligible but not sounding shows "Standing by", not "Emitting"; a muted one still shows "Disabled".
- **`hudLines.test.ts`** — the new line.

### 5.3 Success criteria

Thresholds below are **proposed** and are fixed before implementation the way `ACCORDION_LAZY_MOUNT.md` §5.3 did; Crawford confirms or adjusts them when approving this spec.

1. **Full is a no-op (deterministic).** With `audioLoad = 1` and the system running, every existing test passes unmodified and the engine gate never blocks a note that would have played before.
2. **The caps hold (deterministic).** At any `audioLoad`, `soundingRobotIds.length ≤ maxAudibleRobots` after every reconcile across simulated lifecycle runs, and no note from a robot outside the set triggers.
3. **No re-render storm (deterministic).** Over a simulated 200-measure lifecycle run, `soundingRobotIds` is written only on real changes, and `RobotSelectionCard` renders no more often than before (measured with the existing render-count test pattern).
4. **Render-capacity gate (desktop, measured).** Using `npm run perf:audio` on pinned worlds `charlie:200:-30` and `bravo:-150:90`, **3 runs each in the foreground, one at a time**, a 4-minute time series per run, no orphaned Chrome before/after: **Light lowers the peak-window render capacity (the highest 15-second bucket mean) by ≥ 25% versus Full**, and **Standard by ≥ 10%**; **Full is within ±0.03 of the pre-change baseline** taken in the same session (A/B, per `perf-harness-measurement-hygiene`). The pre-change baseline is recorded *first* (Task 1).
5. **Phone check (Crawford, by ear — recorded, not gated).** On the Pixel with `?debug&load=light`, both `charlie` and `bravo` for 5 minutes: report full dropouts (target: none) and click frequency versus today's, and note the overlay's `robots n/cap` reading when clicks occur. If Light is not enough, that is a finding (further levers: control-rate LFOs, `playback` latency), not a failure of the spec.
6. **UI (manual + tests).** The control is present, preset ↔ slider stay in sync, the derived-limits line is correct, and a robot silenced by the budget is never labelled "Emitting".
7. **Docs updated** (§6).

### 5.4 Verification order

`npm run build:types` → `npm run lint` → `npm test` → `npm run build` → baseline + post-change `npm run perf:audio` (foreground, one call at a time) → Crawford's phone check.

---

## 6. Documentation & Git/Workflow Context

- **Docs to update:** `docs/AUDIO_SYSTEM.md` and `docs/POLYPHONY_GUIDE.md` (dynamic cap, the sounding set, why gating is at trigger time), `docs/ROBOT_LIFECYCLE.md` (audibility is now mute/solo *and* the budget; standing-by robots keep the full lifecycle), `docs/PERFORMANCE.md` (`?load=`, the audio-load measurement, dated baselines — record before/after rather than overwriting), `docs/todo/scratchy-audio-phones.md` (results), `docs/todo/roadmap.md` (17.2.6 status). Optionally add the new specs to the `CLAUDE.md` reference list.
- **Branch:** currently `bugs/scratchy-audio-phones`, which still carries uncommitted work (the `?x=`/`?y=` params, the `?debug` overlay and `?latency=` switch, the `generateUUID` fix). Those should be committed first, separately from this feature, so this spec's implementation lands on a clean base. Crawford decides when.
- **Commits:** one per task, tests with their code; commit-message attribution per the session's rules. **PR:** references this spec; reviewed by another contributor per `CLAUDE.md`.
- **Sequencing relative to the rest of 17.2:** independent of 17.2.3/17.2.5 (main-thread work); complements 17.2.4 (`playback`). The measured global-LFO cost is a separate item worth its own spec.

---

## 7. Open Questions & Risks

### Decisions (resolved 2026-09-20, Crawford)

1. **What's capped:** *both* the audible-robot count and the polyphony ceiling, **under one setting** (§1.4).
2. **Who plays when over budget:** **first come, first served** (§1.3).
3. **The control:** **presets plus a fine slider** (Light / Standard / Full, and a 0–100% dial) — and the user can always change it. *(Crawford's ask: "add an option to change it for the user".)*
4. **Default:** **auto — lighter on phones**, Full elsewhere, always user-overridable.

### Open questions (need Crawford before tasks are written — my recommendation first)

- **A. Does solo bypass the budget?** Recommend **yes**: solo is an explicit "let me hear this one", so a soloed robot always sounds — it takes a slot, evicting the most-recently-admitted non-solo robot if full. Pure first-come would let a robot the user just soloed stay silent, which reads as a bug. (Highlight needs no rule: it silences nobody.)
- **B. Does a user's explicit *unmute* of a docked robot bypass the budget?** Recommend **no — keep pure first-come, but make it legible**: the card says "Standing by" with a hint that the Audio Load limit is why, and the limit is one control away. The alternative (an unmute counts as a user pick and jumps the queue) is more surprising in the other direction — a slider the user set to 4 would quietly stop meaning 4.
- **C. Preset anchor values.** 4 / 8 / 12 robots and 8 / 12 / 16 notes are starting guesses. Task 1 measures render capacity against them on desktop, but **desktop numbers do not tell us the phone's budget** — Light's real value needs a phone pass.
- **D. Default-detection heuristic.** Recommend **coarse primary pointer ⇒ Light** (a tablet counts as a phone-class device here; it's only a default). Adding `hardwareConcurrency`/`deviceMemory` would catch weak desktops but also misjudge capable ones. It is a heuristic and can be wrong; the control is the escape hatch.
- **E. Persistence.** None exists. Recommend session-only for now (re-detected on load, `?load=` to pin), and folding this setting into the save/load design when roadmap 20 is built. A single `localStorage` key would work but starts a persistence pattern the app doesn't have; say if you want it anyway.
- **F. Where the control lives.** Recommend **Audio Rig → Transport & Composition** (where Tempo and Automatic Effects already are). A phone user in trouble might want it closer to hand — the Header is an option if you'd rather.
- **G. Should Light also imply `latencyHint: "playback"`?** Not in this spec: the hint is fixed when the AudioContext is created, so it can't follow a live slider. If `playback` is adopted, it would be a boot-time default chosen by the same phone detection (17.2.4). Worth deciding after two or three more phone runs of `bravo` on each setting.

### Risks

- **The lever may not be enough.** Audible robots are only one driver; global LFOs cost more per unit on heavy seeds, and the phone's actual budget is unknown. Mitigation: §5.3 measures the desktop effect first, the phone check reports the *reading* at each click (via the overlay), and the spec is explicit that a shortfall points to the next lever rather than to failure.
- **First-come fairness.** With a full budget, robots that arrive late are silent until a slot frees — possibly for most of their Active period, and the same early robots keep playing. The battery cycle bounds this (every robot departs within a minute or two), but a user could perceive some robots as "never heard". Take-turns rotation was offered and not chosen; it stays available as a later change to `reconcileSounding` alone.
- **A lower polyphony cap can strand the voice counter.** Release runs on the main thread; the counter is already documented as fragile (`AudioEngine.scheduleVoiceRelease`). Enforce the cap only against *new* triggers, never by forcibly releasing counts, and reset it on power cycle as `killAll()` already does.
- **Auto-detection misclassifies.** A capable tablet defaulted to Light, or a weak laptop defaulted to Full. Mitigation: the control and `?load=` are always there, and the overlay shows the level in force.
- **Store-subscription churn.** `updateRobot` rewrites the locale on every battery tick and swell write; a naive subscription would run 12×/measure. Mitigation: subscribe to a signature of `id:audioMode:docking`, and write only on change (§4.4, criterion 3).
- **Measurement hygiene.** Time series are noisy run to run; the gates compare same-session A/B, ≥ 3 runs, pinned worlds. A single run is not evidence.
- **The mechanism behind the waves is an inference.** The link between "audible robots" and the swings rests on a simulation and one time series, not a direct readout. Task 1 should add the audible count to the overlay and log it against render capacity, and the spec is to be revised if the correlation is weak.

### Phase B (deferred, not scheduled)

Release voice chains for robots that have stood by for longer than a grace period, and rebuild on admission (staggered, from store state — `reReserveVoice` already rebuilds from the store). It needs its own spec: the consumer audit in §1.6 lists everything that assumes a live voice, build spikes on a company-wide unmute must be staggered to avoid a scheduling-lookahead pause, and its measured benefit is small. Revisit only if Phase A leaves a gap.
