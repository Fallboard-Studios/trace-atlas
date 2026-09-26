# Intent: Automation Frequency/Duration Split

Confirmed via `/interview-me`, 2026-09-26. Splits the Audio Swells master control — today a single Intensity slider (`pingVarianceAutomation`, lore label "Ping Variance Automation", human label "Automatic Effects", see [docs/intent/ping-variance-automation.md](ping-variance-automation.md)) that scales magnitude *and* doubles as the system's on/off switch — into three sliders: Intensity (magnitude only), Frequency (trigger rate + on/off), Duration (swell length). Not a new feature; a reshaping of the existing Audio Swells system's controls.

## Outcome

Three Rig-wide sliders in Fleet Params > Pacing, replacing the one Intensity slider:

- **Intensity** — unchanged mechanically (still the last-step magnitude multiplier on a newly created swell's peak), but no longer gates on/off. Range `[1, 100]%`, load-seeded `[10, 60]%` (was `[33, 66]%`).
- **Frequency** — new. Governs both whether swells happen at all (0 = off) and how often. `sliderLog`, range `[0, 24]`, load-seeded `[2, 8]`.
- **Duration** — new. Governs total swell length in measures, replacing today's per-swell-randomized rising/falling picks. `sliderLinear`, range `[1, 24]`, load-seeded `[2, 8]`.

All three remain single Rig-wide values shared across both swell pools (global-chain effects and robot attributes, including company-wide swells) — same scope the single Intensity value has today; this is not a per-pool split.

## User

Same audience as the existing Intensity slider: anyone tuning the ambient soundscape from Fleet Params > Pacing. Today, "how often" and "how long" are baked-in constants (`SWELL_TRIGGER_CHANCE`, `DEFAULT_SWELL_DURATION_RANGE`/`MIX_SWELL_DURATION_RANGE`) nobody can touch from the UI — this gives that same control over pacing that Intensity already gives over magnitude.

## Why now

Intensity conflates two different questions — "how strong" and "is it happening" — under one slider, and offers no control at all over how often swells fire or how long they last. Separating them makes each dial answer exactly one question, matching the Duration/Frequency split description Crawford gave directly.

## Success

### Frequency

- **Replaces the fixed per-measure trigger roll with a real rate.** Today, `maybeStartGlobalSwell`/`maybeStartRobotSwell` each roll a fixed `SWELL_TRIGGER_CHANCE` (0.28) at most once per whole measure. Frequency replaces that with a per-tick check running every `tickAudioSwells` call (the existing ~16n/8–9x-per-second cadence), with a per-tick trigger probability derived from Frequency such that the long-run expected rate matches Frequency's value: Frequency swells per measure when Frequency ≥ 1, or one swell roughly every `1/Frequency` measures when 0 < Frequency < 1.
- **Frequency = 0 is the sole on/off switch**, taking over the role `pingVarianceAutomation === 0` plays today: no new swell starts, and every in-flight swell is forced into its falling phase from wherever it sits (the existing `maybeForceGlobalSwellReturn`/`maybeForceRobotSwellReturn` mechanism, re-keyed off Frequency instead of Intensity). Forced returns aren't undone if Frequency goes nonzero again before the return completes — same "keeps riding out the return it already started" rule the current Intensity=0 behavior has.
- **Intensity no longer has any on/off role.** Its new floor of 1% means it can never itself silence automation — Frequency is the only path to "no swells."
- **sliderLog**, because the useful range spans "once every 12 measures" (Frequency well below 1) to "4 times a measure" (Frequency well above 1), and a linear slider would crowd out the sub-1 end.

### Duration

- **One Duration value = one swell's total length in measures** (rising + falling together), replacing today's independent per-swell-randomized `pickPhaseMeasures` picks for rising and falling.
- **The rising/falling split inside that total stays randomized per swell**, not fixed at 50/50 — it can skew as far as roughly 20/80 (or 80/20) in either direction, same "some per-swell variety" spirit the current random ranges have, just applied to the split ratio instead of the total length.
- **Applies flat across every swell type.** Today, `delay.wet`/`reverb.wet` swells run roughly 2x longer than everything else (`MIX_SWELL_DURATION_RANGE {6,12}` vs `DEFAULT_SWELL_DURATION_RANGE {3,6}`). That distinction is dropped — Duration's value is used as-is for every target, mix or otherwise.

### Both new sliders

- **Seeded the same way Intensity already is.** Each gets its own seed-generator function in `globalAudioSeed.ts` (mirroring `generatePingVarianceAutomation`), drawing a per-locale default via `getSeededVal` from its own load range (Frequency `[2, 8]`, Duration `[2, 8]`) — sampled once per session on first seed, carried forward across later Attenuation Style switches, freely draggable across the full slider range afterward.

### Layout (Fleet Params > Pacing, under Tempo)

- Frequency sits to the right of Tempo (same row).
- Duration sits below Tempo, to the left of Intensity.
- Intensity moves to sit to the right of Duration (same row as Duration, below Frequency).

## Constraint

- Reuse existing mechanics wherever possible: the same falling-phase interpolation for a forced return, the same `BeatClock`/tick-driven, seeded (no `Math.random()`, no new timer) architecture the rest of Audio Swells already follows (`docs/specs/AUDIO_SWELLS.md` §1.4, §3).
- The existing once-per-whole-measure trigger *gating* is what changes for Frequency — evaluation moves to every tick — but the rest of the swell-creation pipeline (target eligibility, direction pick, magnitude calculation, Intensity's own multiplier) is untouched.

## Out of scope

- Per-pool-independent Frequency or Duration — both stay single Rig-wide values, matching Intensity's existing scope.
- Any change to the Audio Load Budget / performance-tier system (`audioBudgetSystem.ts`) — "load min/max" here means the existing per-locale seeded-default-value convention (`PING_VARIANCE_AUTOMATION_SEED_RANGE`-style), unrelated to that system.
- Any change to how magnitude scaling itself works, beyond decoupling it from on/off — Intensity's multiplier math is unchanged.
- Live/continuous rescaling of an in-flight swell's duration or rate when Frequency/Duration change mid-ramp — a swell's total length and rising/falling split are still fixed at creation, same as Intensity's magnitude is today.
- The exact per-tick probability formula for Frequency (e.g. how `1/Frequency` measures-between-swells is converted to a per-tick chance) — a Spec/Plan-level implementation detail, not decided here.
- The exact internal storage domain for Frequency/Duration (raw measure counts vs. some other unit) — an implementation detail for Spec/Plan.
