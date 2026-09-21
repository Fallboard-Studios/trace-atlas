# Phase Spec: Audio Load Budget

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev` — a phone on the LAN needs the **production** build instead: `npm run build && npx vite preview --host --port 4173`, then `http://<pc-ip>:4173/trace-atlas/?debug&…` (a phone over plain http is an insecure context — see [docs/PERFORMANCE.md](../PERFORMANCE.md))
> - Render-capacity measurement (plan Task 2 promotes the scratch script into the repo): `npm run perf:audio` — see §5.3

Source of intent: [Roadmap 17.2.6](../todo/roadmap.md#1726-performance-audio-load-budget), requested by Crawford 2026-09-20 after the phone investigation in [docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md). No separate intent doc — that investigation and §1.1 below are the motivation, and the design decisions in §7 were made by Crawford in the same session. **Status: draft v4, 2026-09-20 — every open question is resolved (J: Standard stays `interactive`); awaiting Crawford's final approval of this spec and its plan, nothing implemented.** Task breakdown: [docs/tasks/AUDIO_LOAD_BUDGET.md](../tasks/AUDIO_LOAD_BUDGET.md) (26 tasks in 7 phases).

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and why it's a problem

On a Pixel 8 the audio clicks and sometimes drops out completely, while the `?debug` overlay stays green (context `running`, audio clock advancing at ×1.00, UI frames and main thread healthy). The working explanation — consistent with everything measured, **not proven** — is that the audio thread intermittently misses its per-buffer deadline: a single miss is a click, a long run of misses is a silence, and Chrome keeps advancing the clock either way.

What drives the load, measured on desktop with pinned worlds (`?seed=…&x=…&y=…`; full data in `scratchy-audio-phones.md`):

| Driver | Evidence | Size |
|---|---|---|
| **Drift ("stacked" LFOs)** — secondary LFO pools modulating every running LFO's rate and depth | All 7 global LFOs: +0.19; the same with drift removed: +0.08 | ≈ half of the global-LFO cost |
| **Filter-frequency and filter-Q LFOs** (biquad parameters modulated at audio rate) | +0.12 for two frequency LFOs, +0.12 for two Q LFOs (≈ +0.06 each) | expensive |
| **EQ-gain LFOs** | +0.02 for three | nearly free |
| **Robot LFOs** (none run by default — a user must enable them in Robot Options) | 51 connected at once saturate the audio thread even on desktop (capacity ≈ 1.0, callback interval 10.7 → 19–20 ms) | unbounded count is a hazard |
| **How many robots are sounding at once**, in waves | A 4-minute run on `charlie` (0 LFOs) swings render capacity 0.27 ↔ 0.49 (peaks ≈ 0.99) on a ~1–2 minute cycle; a simulation of the battery cycle puts audible robots at 2 → ~8 by ~1:00–1:20 (60 BPM), ~4 at ~2:00, then ~4–8 | ±0.1–0.2 |
| The idle per-robot voice chains (all 12 built at spawn, never released) | 12 robots ≈ 24% vs 3 robots ≈ 16–20% when quiet | a few points |
| `latencyHint: "playback"` | Removed the full dropouts on `bravo` on the phone (one run each, by ear); no visible change on `charlie` | a larger output buffer, fixed at context creation |

The user-visible pattern matches: clicks come in waves that clear on their own, heavy seeds are worse, and the calm world clicks too because the *peaks* of sounding robots alone can exhaust a phone's audio budget.

**Nothing today limits how much can sound at once except `MAX_POLYPHONY = 16` simultaneous notes** (`src/constants/index.ts`), sized for a desktop. The number of audible robots is bounded only by the fixed 12-robot roster and the battery cycle; the number of running LFOs by the seed (globally) and by the user (per robot); and every LFO gets drift.

### 1.2 What's changing

A single user-adjustable **Audio Load** setting — one 0–100% dial with three named presets (Light / Standard / Full) — lowers audio cost in four ways together:

1. **`maxAudibleRobots`** — how many robots may *sound* at once (2–12). A robot eligible to sound (not muted, not excluded by solo) but over the limit **stands by**: silent, otherwise unchanged — it still swims, drains and recharges. Only its audio is withheld.
2. **`maxPolyphony`** — the simultaneous-note ceiling `MAX_POLYPHONY` fixes at 16 today, made dynamic.
3. **LFO tiers** (§1.4) — drift ("stacked" LFOs) switches off first; then the expensive filter-frequency/Q LFOs; robot LFOs are capped in number. Cheap EQ-gain LFOs are kept even on Light.
4. **Output latency hint** (§1.5) — Light selects `latencyHint: "playback"`, applied when the app loads.

**At the top of the dial (Full) every cap equals today's behavior exactly** — 12 robots, 16 notes, all LFOs and drift, `interactive` latency — so Full is a no-op and the whole feature is opt-down.

Users pick a preset or drag the slider; the default is chosen automatically — **Light on phone-like devices, Full elsewhere**. A URL param (`?load=`) pins it for testing and, later, for shared links.

### 1.3 How robot admission works: first come, first served — with solo as the exception

Which robots sound when more are eligible than slots is decided by a small pure function over an ordered list — the **sounding set** (§4.1):

- A robot that is eligible and already in the set **keeps its slot**.
- A newly eligible robot is admitted **only if a slot is free**; otherwise it waits, in arrival order.
- When a slot frees — a robot departs to dock (its `audioMode` becomes `'mute'`), is muted, or the limit is raised — the **earliest-waiting** robot is admitted.
- When the limit is **lowered**, robots are evicted **last-in, first-out** down to the new limit.
- **Solo always sounds** (decision A). A soloed robot is admitted immediately; if the set is full it evicts the most-recently-admitted *non-solo* robot. Soloed robots never count against being evicted by a later arrival. (If more robots are soloed than the limit, the limit still caps the set — solos beyond it wait first-come like anyone else.)
- **Standing by is the answer to an explicit unmute too** (decision B). Unmuting a docked robot when the set is full does not jump the queue; the card says "Standing by" and the Audio Load control is one tab away.
- Eviction and gating apply to **new notes only**. A robot that has just been evicted or muted lets its ringing note finish; nothing is truncated, so nothing clicks.

The battery cycle supplies the turnover for free: robots depart on their own within roughly a minute or two (`docs/ROBOT_LIFECYCLE.md`), freeing slots for the ones standing by.

### 1.4 LFO tiers — why by cost, not by "global vs robot"

Crawford's question: should the lighter presets turn off stacked LFOs first, then some or all LFOs — and should that split by robot LFOs versus global-effect LFOs? The measurements say **cut by what each thing costs**, which mostly cuts across that split:

- **Drift is the cheapest big win** (it is ≈ half of the global-LFO cost) and applies to both global and robot LFOs, so it goes first — on **Standard** and below.
- **Filter-frequency/Q LFOs are ~10× the cost of EQ-gain LFOs.** **Light** switches those off and keeps the three EQ-gain LFOs, which are nearly free — so a Light world still has movement in it ("some", not "all").
- **Robot LFOs are not what costs today** (none run until a user enables one), so switching them off on the middle preset would save nothing by default. The real risk is an *unbounded count*, so they are **capped** by tier instead of being switched off wholesale: 51 saturates a desktop.

| Dial position | Drift | Filter freq/Q global LFOs | EQ-gain global LFOs | Robot LFOs (max connected) |
|---|---|---|---|---|
| Light (0.2) | off | off | on | **4** (placeholder) |
| Standard (0.6) | off | on | on | **12** (placeholder) |
| Full (1.0) | on | on | on | unlimited (today) |

Between the presets the slider interpolates by thresholds (§4.2). The robot-LFO caps are **placeholders**: only "51 overloads" was measured; Task 4 of the plan measures cost per audio-rate robot-LFO target type (`volume`, layer `gain`, `detune`, `pulseWidth`) to set them. **`layerN.phase` robot LFOs are not counted toward the cap**: they run on a control-rate `scheduleRepeat` poll (`lfoEngine`'s `phaseFallbacks`), not an audio-rate connection, and were not part of the measured cost.

**A tier only suspends; it never edits the user's or the seed's values.** A suppressed LFO keeps its stored settings and simply isn't connected — the same "off via the parameter, not a deleted setting" pattern the Audio Rig and Layer toggles already follow. Raising the dial reconnects them. While an LFO is held off its controls are **greyed out (disabled)** — still showing the stored value, so the user can see what will return — with a short "Held off by Audio Load" label; raising the dial re-enables them (decision L). The consequence, accepted: an LFO can't be edited while it is held off. The **drift sliders** (the per-group Rate/Depth Drift controls in the Audio Rig and Robot Drift in Robot Options) are the "stacked LFO" controls and grey out the same way while the drift tier holds drift off. "Held off" means *requested but not connected because of the dial*: an LFO at `rate = 0` is never held off, so a user can always turn one on; one turned on beyond the robot-LFO cap greys out after the attempt.

### 1.5 Latency follows the preset — at load time only

Crawford asked whether latency can be tied to the presets. Yes, with one hard limit: **a Web Audio context's `latencyHint` is fixed when the context is created**, so it cannot follow a live slider. So:

- The preset in force **at page load** — auto-detected, or from `?load=` — chooses the hint (`src/engine/audioContextSetup.ts`, already in place for `?latency=`): Light → `playback`, Standard and Full → `interactive`. An explicit `?latency=` still wins.
- Changing the preset *live* changes every cap and LFO tier immediately, but **not** the latency. The control says so ("Latency: Playback — applies on next load").
- Because there is no persistence, "next load" would silently revert to the auto-detected default. To make a chosen preset survive a reload, and to lay groundwork for sharing, changing the preset **mirrors it into the URL** (`history.replaceState`, keeping every other param) — see decision H.

`playback` gets its own validation: it helped one phone run of the heavy world and did nothing visible on the calm one (n = 1 each), so Light selecting it is provisional until §5.3's phone check.

### 1.6 What this deliberately does *not* do

- **It does not tear down or defer building voice chains.** Every robot still gets a voice at spawn, as today. Gating is at the note trigger only, which removes any risk of a build spike or click when a robot changes state. Lazy voice chains are a possible **Phase B** (§7) — measured to be a weak lever on their own.
- **It does not change the lifecycle, animation, or visuals.** Standing-by robots keep swimming, drain and recharge; only their sound is withheld.
- **It does not add persistence.** No app-wide persistence exists yet (`docs/SESSION_STORAGE.md` is a design doc for roadmap Phase 20); per Crawford, that is out of scope here. The default is re-derived each load; `?load=` (and the URL mirroring in §1.5) is the only carry-over.
- **It does not remove any control or setting** — LFO and Audio Rig values are preserved (§1.4).

### 1.7 Audited: what depends on a robot being audible, and on LFOs

Checked 2026-09-20 by reading the code, not assumed:

- **`audioMode` has four values** — `'none' | 'solo' | 'mute' | 'highlight'` (`src/types/Robot.ts`). `isRobotAudible(audioMode, anySolo)` (`src/utils/robotAudibility.ts`) is `false` for `'mute'`, and `false` for anything but `'solo'` while any robot is soloed. `'highlight'` silences nobody; it attenuates the others by ~6 dB in `scheduleNote`.
- **Every writer of `audioMode` goes through `useLocaleStore.updateRobot`**: `robotOptionsActions.applyAudioMode` (individual, and the company-options broadcast), `robotSystems.landOnActive`/`landOnDocked`, and `spawnSystem.spawnRobot`. One store subscription sees all of them.
- **The sole audibility gate is `triggerWithCap`** (`src/engine/AudioEngine.ts`, ~line 297), evaluated per note *before* the polyphony cap. A muted robot never consumes a polyphony slot today; a standing-by robot must not either.
- **A docked robot is muted by `audioMode: 'mute'` alone**; its voice and melody stay reserved, and a user can flip it to `'none'` and hear it (`docs/ROBOT_LIFECYCLE.md`). Under the budget that still works, subject to a free slot (§1.3).
- **Robot LFOs are not connected at spawn.** `generateRobotLfoSettings` seeds settings (≈ 50% non-zero rate per target) into state, but nothing calls `connectLfoTarget` for a robot until a user edits one (`robotOptionsActions.applyLayerLfo`). Robots also spawn *after* `powerController.start()` runs, so any code that must touch robot LFOs at power-on has to wait for the roster.
- **Global LFOs are connected at `AudioEngine.start()`** (`AudioEngine.ts`, ~line 502) for every target with `rate > 0`, and by `audioStore.setGlobalLfo` afterwards; drift is attached inside `lfoEngine.connectLfoTarget` (`attachDrift`) and is inert until the seeded/edited drift amounts are non-zero — which they are for every seed tried.
- **Consumers that require a live voice** (relevant only to a future Phase B): `triggerWithCap`; `updateAllPanners`; `getRobotModulationTarget`; and `updateVoiceLayerParams` / `updateVoiceEnvelope` / `updateRobotMasterVolume` from `robotOptionsActions`, `audioSwells`, and the phase-LFO polling fallback — each `devWarn`s and no-ops when no voice exists.
- **The voice counter's release runs off Tone's ticker on the main thread** (`scheduleVoiceRelease` → `Tone.getContext().setTimeout`). A lower polyphony cap makes a stuck counter more likely to silence notes, so the cap is applied to *new triggers only* (§7 risks).

---

## 2. Target File Structure

```
src/
├── engine/
│   ├── AudioEngine.ts                   MODIFIED — dynamic polyphony cap + sounding-set gate in triggerWithCap; setPolyphonyCap()/
│   │                                    setSoundingRobots() pushed in by the budget system (no store import: keeps the existing
│   │                                    engine↔audioStore load-order constraint intact); getPolyphonyStats().maxVoices = live cap
│   ├── lfoEngine.ts                     MODIFIED — connectLfoTarget consults a pure "is this LFO allowed" predicate the budget system
│   │                                    supplies (target kind, drift on/off, robot-LFO cap); reconcile connect/disconnect on tier change
│   ├── lfoDrift.ts                      MODIFIED — attachDrift/detachDrift respect the drift tier
│   ├── audioContextSetup.ts             MODIFIED — hint from the boot-time preset (?latency= still wins)
│   └── audioDiagnostics.ts              MODIFIED — expose sounding/eligible counts, caps, tier state to the ?debug overlay
├── systems/
│   ├── audioBudgetSystem.ts             NEW — subscribes to robots' audioMode/docking + audioLoad; computes the sounding set and the LFO
│   │                                    allowances; pushes to AudioEngine/lfoEngine; writes audioStore.soundingRobotIds only on change
│   └── audioBudgetSystem.test.ts        NEW
├── stores/
│   ├── audioStore.ts                    MODIFIED — audioLoad (0..1) + setAudioLoad; soundingRobotIds: string[] (serializable, derived)
│   └── audioStore.test.ts               MODIFIED
├── utils/
│   ├── audioBudget.ts                   NEW — PURE: loadToLimits(audioLoad), reconcileSounding(prev, eligible, max, solo), lfoAllowed(),
│   │                                    presets, latencyForLoad(), detectDefaultAudioLoad(env), parseLoadParam(), loadToSearchParam()
│   └── audioBudget.test.ts              NEW
├── data/
│   ├── audioRigConfig.ts                MODIFIED — AUDIO_LOAD_SCHEMA (slider), AUDIO_LOAD_PRESET_SCHEMA (radio), AUDIO_LOAD_PANEL_SCHEMA
│   └── robotSelectionConfig.ts          MODIFIED — AUDIBILITY_LABELS gains a third state, 'limited' ("Standing by")
├── components/
│   ├── panels/screen/console/AudioRigDrawer.tsx      MODIFIED — Audio Load panel inside Transport & Composition (next to Tempo)
│   ├── selection/RobotSelectionCard.tsx              MODIFIED — status uses the third state
│   ├── robot/RobotDisplaySection.tsx                 MODIFIED — same
│   ├── (LFO frames in Audio Rig / Robot Options)     MODIFIED — greyed-out (disabled) state + "Held off by Audio Load" label on a suppressed LFO
│   └── debug/hudLines.ts                             MODIFIED — "robots n/cap · poly cap · load level" line
├── constants/index.ts                   MODIFIED — LOAD_* anchors and tier thresholds; MAX_POLYPHONY kept as the Full ceiling
└── main.tsx / app boot                  MODIFIED — start the budget system (see §4.4); mirror the preset into the URL
scripts/perf/audio-load.mjs              NEW — promoted from the session's scratch script; render-capacity time series per pinned world
package.json                             MODIFIED — "perf:audio" script (no new dependency)
docs/
├── AUDIO_SYSTEM.md, POLYPHONY_GUIDE.md  MODIFIED — the dynamic cap, the sounding set, the LFO tiers
├── ROBOT_LIFECYCLE.md                   MODIFIED — audibility is now mute/solo *and* the budget
├── PERFORMANCE.md                       MODIFIED — ?load=, the measurements, baselines
└── specs/AUDIO_LOAD_BUDGET.md           THIS FILE
```

Nothing is removed. No new dependency.

---

## 3. Implementation Boundaries & Constraints

Non-negotiable, from `CLAUDE.md` (re-checked for this change):

- **Audio scheduling stays on the transport/BeatClock path.** The budget system reacts to *store changes* (event-driven), never a timer. The one existing per-tick hook — the 16n `scheduleRepeat` in `startMelodyPlayback` — is not modified beyond reading a `Set`.
- **State is JSON-serializable and holds no runtime objects.** `audioLoad` (number) and `soundingRobotIds` (`string[]`) qualify. The engine's `Set<string>` mirror, the admission history and LFO allowances live in module state, never in Zustand.
- **`MIN_LEAD` is untouched.** No note is rescheduled; gating only decides whether a note triggers.
- **GSAP timelines never call `AudioEngine`.** The budget reacts to store state (`docking`/`audioMode`), the "semantic callbacks" route the guardrail requires. No timeline callback is added.
- **No synths are created in components.** The UI only reads/writes `audioStore`.
- **UI shell:** the control lives in the Audio Rig drawer inside `ScreenViewport`; nothing goes in `SleeveContainer`.
- **Full is a no-op.** At `audioLoad = 1` behavior — including test-observable behavior — is identical to today. This is the regression safety net and gets its own test (§5.2).
- **Melodies are untouched** (indices 0..7, never literal pitches); the gate never rewrites, drops, or re-registers a melody — it only stops a trigger.
- **LFO settings are never mutated by a tier** — suppression is at connection time only (§1.4).
- **Re-render discipline** (this repo has been bitten repeatedly — `docs/todo/backlog.md` items 21–27): `soundingRobotIds` is written **only when the set actually changed** (reference-stable otherwise), and UI reads it through a **boolean per-robot selector**, never the whole array.

**Ask first** (per `CLAUDE.md`): adding any dependency (none planned); any change beyond what is described here to the audio/animation architecture (e.g. Phase B's voice teardown).
**Never:** relax the "Absolutely forbidden" list to make a step easier; enforce a cap by disposing voices in Phase A; overwrite a stored LFO/robot value to implement a tier; store the sounding set anywhere but the store + the engine's private mirror.

---

## 4. Code Style & Architecture Conventions

### 4.1 The pure core (`src/utils/audioBudget.ts`)

Everything decision-making is a pure function with its own tests; the system, engine and UI are thin shells (the same split as `audioHealth.ts` / `audioDiagnostics.ts`).

```typescript
export interface LoadLimits {
  maxAudibleRobots: number;      // 2..MAX_ROBOTS
  maxPolyphony: number;          // LOAD_POLYPHONY_MIN..MAX_POLYPHONY
  driftEnabled: boolean;         // "stacked" LFOs
  filterLfosEnabled: boolean;    // global lpf/hpf frequency + Q LFOs
  maxRobotLfos: number;          // Infinity at Full
  latencyHint: 'playback' | 'interactive';  // only meaningful at boot (§1.5)
}

/** One dial in, every cap out — linear for the counts, thresholds for the booleans. */
export function loadToLimits(audioLoad: number): LoadLimits;

/**
 * First-come-first-served admission with solo priority. `previous` is the current ordered
 * sounding set; `eligible` is every id isRobotAudible() allows, in roster order; `soloIds`
 * the subset that is soloed. Keeps still-eligible members in place, drops the rest, admits
 * solo robots first (evicting the newest non-solo if full), then newly eligible ids in order
 * while there is room; if `max` fell, evicts last-in first-out. Returns `previous` itself
 * (same reference) when nothing changed.
 */
export function reconcileSounding(
  previous: readonly string[],
  eligible: readonly string[],
  soloIds: readonly string[],
  maxAudibleRobots: number,
): readonly string[];

/** May this LFO be connected right now? Pure over the limits and the current connected counts. */
export function lfoAllowed(
  target: LfoTargetId,
  scope: 'global' | 'robot',
  limits: LoadLimits,
  connectedRobotLfos: number,
): boolean;
```

### 4.2 The dial, anchors, thresholds and presets

```typescript
// constants/index.ts — STARTING values; plan Tasks 4 and 11 calibrate them against measured render capacity (§5.3).
export const LOAD_AUDIBLE_ROBOTS_MIN = 2;           // at audioLoad = 0
export const LOAD_POLYPHONY_MIN = 6;                // at audioLoad = 0
// at audioLoad = 1: MAX_ROBOTS (12) and MAX_POLYPHONY (16) — i.e. exactly today.
export const AUDIO_LOAD_PRESETS = { light: 0.2, standard: 0.6, full: 1 } as const;
export const LOAD_DRIFT_MIN = 0.8;                  // drift on at/above this
export const LOAD_FILTER_LFOS_MIN = 0.4;            // filter freq/Q LFOs on at/above this
// robot LFO cap: placeholder 4 / 12 / unlimited at the three presets; interpolated between, Infinity at 1.
// interpolation: audible = round(2 + 10·t), polyphony = round(6 + 10·t)
//   light (0.2)    → 4 robots,  8 notes, no drift, no filter LFOs, playback
//   standard (0.6) → 8 robots, 12 notes, no drift, filter LFOs on,  interactive
//   full (1.0)     → 12 robots, 16 notes, drift on, all LFOs,       interactive   (today)
```

### 4.3 The engine gate

`triggerWithCap` gains one check, right after the existing `isRobotAudible` test and before the polyphony cap, so a standing-by robot never consumes a polyphony slot:

```typescript
if (soundingRobots !== null && !soundingRobots.has(robotId)) return false; // audio-load budget: standing by
if (activeVoices >= polyphonyCap) return false;                             // was MAX_POLYPHONY
```

`soundingRobots` is `null` until the budget system first runs, and `polyphonyCap` defaults to `MAX_POLYPHONY` — so the engine behaves exactly as today before (and without) the system, which keeps every existing `AudioEngine` test valid untouched.

### 4.4 The system

`audioBudgetSystem.ts` exports `startAudioBudget()` / `stopAudioBudget()` (a module-singleton pair mirroring `startRobotLifecycle`/`stopRobotLifecycle`, idempotent). It subscribes to:

1. `useLocaleStore` — selecting a **signature string** of `id:audioMode:docking` per robot (not the robot objects), so it does not run on the constant battery/position/melody churn;
2. `useAudioStore` — `audioLoad` only.

On a change it recomputes eligibility (`isRobotAudible`), calls `reconcileSounding`, and — only if the result differs — pushes it to `AudioEngine.setSoundingRobots` and writes `soundingRobotIds`. On a tier change it tells `lfoEngine` to re-evaluate its connections (connect newly allowed, disconnect newly disallowed — reusing `connectLfoTarget`/`disconnectLfoTarget`, whose stale-signal handling already exists). It is started once at app boot (before first power-on, so the default is in force from the first note) and is **not** torn down by a power cycle: nothing in it depends on the transport, and `AudioEngine.killAll()` does not touch its state. Robots spawn after power-on, so LFO allowances are evaluated when a robot LFO is *connected*, not at `start()`.

### 4.5 The control

Follows the exact pattern of `BPM_SCHEMA` / `DECAY_MODE_SCHEMA` (bare Rig-wide meta-settings in `audioRigConfig.ts`, wired at the drawer): a `directionalPanel` "Audio Load" in Transport & Composition, next to Tempo (decision F), holding a `radio` (Light / Standard / Full) and a `sliderLinear` (0–100%), plus a display line stating what the current position means ("Up to 4 robots · 8 notes · no drift or filter LFOs · latency: Playback (applies on next load)"). The radio and slider are two views of one stored number: choosing a preset sets the slider; dragging the slider off a preset leaves the radio with no option selected. Lore labels are first-pass invented copy, to be confirmed in the manual check, same as the drift groups.

### 4.6 Naming and conventions

`audioLoad` (the dial), `LoadLimits`, `soundingRobotIds`, "standing by" (user-facing state), "Held off by Audio Load" (the greyed-out LFO label). Section-header comment blocks (`// ====`) and the `IMPORTS / TYPES / FUNCTIONS` layout, as in the surrounding files.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest + Testing Library, co-located `*.test.ts(x)`. Pure logic first (TDD), then store/system integration, then engine gate, then UI. Mutation-check each new gate the way `audioHealth`/`audioContextSetup` were (break it, confirm a test fails).

### 5.2 New tests

- **`audioBudget.test.ts`** — `loadToLimits` at 0, the presets, 1 (Full equals today's numbers), and out-of-range clamping; the three thresholds; `reconcileSounding`: keeps incumbents; admits in order up to the cap; never exceeds the cap (property-style over random sequences); FCFS on a freed slot (earliest waiter, not roster order); LIFO eviction when the cap falls; **solo admitted immediately and evicting the newest non-solo**; drops robots that became ineligible; returns the *same reference* when nothing changed; `lfoAllowed` for each target kind, drift, and the robot cap; `latencyForLoad`; `detectDefaultAudioLoad`; `parseLoadParam` / `loadToSearchParam` round-trip.
- **`audioBudgetSystem.test.ts`** — with real stores: a robot going `Active` when full stays out of `soundingRobotIds`; a departure frees the slot for the earliest waiter; an explicit unmute when full does not jump the queue; solo takes a slot; lowering `audioLoad` evicts LIFO and raising it admits waiters; **no writes when nothing changed** (subscriber-call count stays flat across a simulated 200-measure lifecycle run, guarding the re-render-storm class); idempotent start/stop.
- **`lfoEngine` / `lfoDrift` tests** — below the drift threshold no drift link is attached and an existing one is detached; filter-frequency/Q global LFOs are not connected below their threshold while EQ-gain LFOs are; the robot-LFO cap refuses the (n+1)th connection; **stored LFO settings are unchanged** after a tier goes down and back up (no value is overwritten); a suppressed LFO reconnects when the dial rises.
- **`AudioEngine.test.ts`** — a robot not in the sounding set never reaches `triggerAttackRelease` and does not increment `activeVoices`; a robot in it plays; `polyphonyCap` is honored; **`soundingRobots === null` and the default cap behave exactly as before** (the Full/no-system regression test); a lowered cap does not strand the counter; getPolyphonyStats reports the live cap.
- **`audioContextSetup.test.ts`** — the hint follows the boot-time preset; `?latency=` overrides it; Full/Standard leave Tone's default untouched.
- **`audioRigConfig` / `AudioRigDrawer.test.tsx`** — the panel renders inside Transport & Composition; preset ↔ slider sync; the readout shows the derived limits and the "applies on next load" note; the URL mirror is updated on change and preserves other params.
- **`RobotSelectionCard` / `RobotDisplaySection` tests** — an eligible-but-not-sounding robot shows "Standing by", not "Emitting"; a muted one still shows "Disabled".
- **LFO frame tests** — a held-off LFO's controls are disabled (and announced as such), still display the stored values, show the "Held off by Audio Load" label, and re-enable when the dial rises.
- **`hudLines.test.ts`** — the new line.

### 5.3 Success criteria

Thresholds below are **proposed** and are fixed before implementation the way `ACCORDION_LAZY_MOUNT.md` §5.3 did; Crawford confirms or adjusts them when approving this spec.

1. **Full is a no-op (deterministic).** With `audioLoad = 1` and the system running, every existing test passes unmodified; the engine gate never blocks a note that would have played before; no LFO or drift connection is suppressed.
2. **The caps hold (deterministic).** At any `audioLoad`, `soundingRobotIds.length ≤ maxAudibleRobots` after every reconcile across simulated lifecycle runs; no note from a robot outside the set triggers; the connected robot-LFO count never exceeds `maxRobotLfos`.
3. **No re-render storm (deterministic).** Over a simulated 200-measure lifecycle run, `soundingRobotIds` is written only on real changes, and `RobotSelectionCard` renders no more often than before.
4. **Render-capacity gate (desktop, measured).** Using `npm run perf:audio` on pinned worlds `charlie:200:-30` and `bravo:-150:90` (bravo has 5 running global LFOs, so it exercises the LFO tiers), **3 runs each in the foreground, one at a time**, a 4-minute time series per run, no orphaned Chrome before/after: **Light lowers the peak-window render capacity (the highest 15-second bucket mean) by ≥ 25% versus Full**, and **Standard by ≥ 10%**; and, on `bravo`, **Standard's mean is ≥ 0.10 below Full's** (drift alone was measured at ≈ 0.10 for seven LFOs). **Full is within ±0.03 of the pre-change baseline** taken in the same session (A/B, per `perf-harness-measurement-hygiene`). The pre-change baseline is recorded *first* (plan Task 3).
5. **Robot-LFO safety (desktop, measured).** With the cap at its Standard value and every robot's seeded LFOs requested (the stress case), the audio callback interval stays ≈ 10.7 ms (no doubling) and capacity stays < 0.9.
6. **Phone check (Crawford, by ear — recorded, not gated).** On the Pixel with `?debug&load=light`, both `charlie` and `bravo` for 5 minutes: report full dropouts (target: none) and click frequency versus today's, and note the overlay's `robots n/cap` reading when clicks occur. Also compare `light` against `standard` and against `standard&latency=playback` to see which part of Light does the work. If Light is not enough, that is a finding (further levers), not a failure of the spec.
7. **UI (manual + tests).** The control is present next to Tempo, preset ↔ slider stay in sync, the derived-limits line is correct, a robot silenced by the budget is never labelled "Emitting", and a suppressed LFO is greyed out and says why.
8. **Docs updated** (§6).

### 5.4 Verification order

`npm run build:types` → `npm run lint` → `npm test` → `npm run build` → baseline + post-change `npm run perf:audio` (foreground, one call at a time) → Crawford's phone check.

---

## 6. Documentation & Git/Workflow Context

- **Docs to update:** `docs/AUDIO_SYSTEM.md` and `docs/POLYPHONY_GUIDE.md` (dynamic cap, the sounding set, why gating is at trigger time, the LFO tiers), `docs/ROBOT_LIFECYCLE.md` (audibility is now mute/solo *and* the budget; standing-by robots keep the full lifecycle), `docs/PERFORMANCE.md` (`?load=`, the audio-load measurement, dated baselines — record before/after rather than overwriting), `docs/todo/scratchy-audio-phones.md` (results), `docs/todo/roadmap.md` (17.2.6 status). Optionally add the new specs to the `CLAUDE.md` reference list.
- **Branch:** `bugs/scratchy-audio-phones`. The earlier work (`?x=`/`?y=`, the `?debug` overlay and `?latency=` switch, the `generateUUID` fix, the investigation notes) was committed in four separate commits on 2026-09-20, so implementation lands on a clean base.
- **Commits:** one per task, tests with their code; attribution per the session's rules. **PR:** references this spec; reviewed by another contributor per `CLAUDE.md`.
- **Sequencing relative to the rest of 17.2:** independent of 17.2.3/17.2.5 (main-thread work). It absorbs the *preset-driven* part of 17.2.4 (`playback`) but not a raised `lookAhead`, which stays held.

---

## 7. Open Questions & Risks

### Decisions (resolved 2026-09-20, Crawford)

1. **What's capped:** *both* the audible-robot count and the polyphony ceiling, **under one setting** — extended by decision I below to LFO tiers and latency.
2. **Who plays when over budget:** **first come, first served.**
3. **The control:** **presets plus a fine slider** (Light / Standard / Full, and a 0–100% dial); the user can always change it.
4. **Default:** **auto — lighter on phones**, Full elsewhere, always user-overridable.
- **A. Solo bypasses the budget:** yes (§1.3).
- **B. An explicit unmute of a docked robot does not bypass it:** "Standing by" is fine.
- **C. Preset anchor values are calibrated by measurement, with a phone pass:** agreed.
- **D. Default detection:** coarse primary pointer ⇒ Light (a heuristic; the control is the escape hatch).
- **E. Persistence:** skipped — there is no session system yet (§1.6).
- **F. Where the control lives:** Audio Rig → Transport & Composition, next to Tempo.
- **G. Latency related to the presets:** yes, at load time only (§1.5).
- **H. The chosen preset is mirrored into the URL** (`history.replaceState`, other params kept): yes — so a reload keeps it and so the latency half of the presets survives without persistence; also groundwork for sharing.
- **I. LFO reduction — cut by cost:** confirmed. Stacked LFOs (drift) off on the middle preset, more off on Light; drift first, then filter-frequency/Q LFOs, keeping the nearly-free EQ-gain LFOs; robot LFOs capped by count rather than switched off (§1.4).
- **K. Robot-LFO caps come from measurement** (cost per robot-LFO target type, plan Task 4), not from the 4 / 12 placeholders: yes.
- **L. A held-off LFO is greyed out** (disabled, values still shown, "Held off by Audio Load" label): yes — chosen over the more editable "note only" alternative I had recommended.

- **J. Standard's latency hint: `interactive`** (unchanged from today). Only Light selects `playback`. Revisit only if the phone A/B (`load=standard` vs `load=standard&latency=playback`, §5.3 item 6) shows the hint matters at Standard.

### Open questions

None remaining. (Small points the task plan resolved — drift controls grey out too, phase LFOs are not counted toward the robot-LFO cap, "held off" means requested-but-not-connected — are recorded in §1.4 and §1.7 below and in the plan's "Spec addenda".)

### Risks

- **The levers may not be enough.** The phone's real budget is unknown and desktop numbers don't transfer directly. Mitigation: §5.3 measures the desktop effect first, the phone check reports the *reading* at each click via the overlay and compares the parts of Light separately, and a shortfall points to the next lever rather than to failure.
- **Tiers change how the world sounds.** Dropping drift and filter LFOs on Light audibly changes some seeds (a filter sweep disappears). That is the intended trade, but it should be visible to the user (§1.4's note, and the readout line).
- **First-come fairness.** With a full budget, late arrivals are silent until a slot frees — possibly for most of their Active period. The battery cycle bounds it, but some robots may seem "never heard". Take-turns rotation was offered and not chosen; it stays available as a later change to `reconcileSounding` alone.
- **A lower polyphony cap can strand the voice counter.** Enforce the cap only against *new* triggers, never by forcibly releasing counts, and reset it on power cycle as `killAll()` already does.
- **Suppression bookkeeping.** LFO connect/disconnect on a live dial is new behavior for `lfoEngine` (stale-signal handling exists but was written for rebuilt voices). Mitigation: tests for tier-down/tier-up round trips and "no stored value changes." Because held-off LFOs are greyed out (decision L), a user who wants to edit one must first raise the dial.
- **Auto-detection misclassifies.** A capable tablet defaulted to Light, or a weak laptop defaulted to Full. Mitigation: the control and `?load=` are always there, and the overlay shows the level in force.
- **Store-subscription churn.** `updateRobot` rewrites the locale on every battery tick and swell write; a naive subscription would run 12×/measure. Mitigation: subscribe to a signature of `id:audioMode:docking`, and write only on change (§4.4, criterion 3).
- **Measurement hygiene.** Time series are noisy run to run (same-world stock ranged 0.30–0.41 across rounds); the gates compare same-session A/B, ≥ 3 runs, pinned worlds. A single run is not evidence.
- **The link between audible robots and the load waves is an inference** (a simulation plus one time series). Plan Tasks 1–3 add the audible count to the overlay and log it against render capacity before any product change, and the spec is to be revised if the correlation is weak.

### Phase B (deferred, not scheduled)

Release voice chains for robots that have stood by for longer than a grace period, and rebuild on admission (staggered, from store state — `reReserveVoice` already rebuilds from the store). It needs its own spec: §1.7 lists everything that assumes a live voice, build spikes on a company-wide unmute must be staggered to avoid a scheduling-lookahead pause, and its measured benefit is small. Revisit only if Phase A leaves a gap.
