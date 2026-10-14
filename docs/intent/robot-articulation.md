# Intent: Robot Articulation — Portamento, Envelope Curves, Bus Filter

> **Status: shipped 2026-10-13** on `feature/palette-articulation` (spec [ROBOT_ARTICULATION.md](../specs/ROBOT_ARTICULATION.md), plan
> [ROBOT_ARTICULATION.md](../tasks/ROBOT_ARTICULATION.md)). Built as confirmed, with these deltas, all in
> [roadmap item 50.1](../todo/roadmap.md#501-robot-articulation-portamento-envelope-curves-bus-filter)'s "As built": two shape radios (Attack Shape and
> Release Shape) instead of one; Attack, Decay and Release now run 0–2 s; and a second Audio Load tier for the robots' own bus
> links, built before the phone run called for it. The lore words are still placeholders.

Confirmed via `interview-me` on 2026-10-13 (6 questions, every guess confirmed), ahead of a
`spec-driven-development` pass. Roadmap item 50.1
([docs/todo/roadmap.md](../todo/roadmap.md#501-robot-articulation-portamento-envelope-curves-bus-filter)),
the first sub-phase of the Audio Palette series (roadmap 50, raised by Crawford 2026-10-09: "if we
can organize it and make it happen without distortion, then i want to at least try it").

## Outcome

Three per-robot articulation traits, each a **parameter on a node every robot already owns**, so
the phase adds **zero audio nodes**:

- **Portamento** — `Tone.Synth.portamento` (seconds), never set today, so every note steps. One
  slider per robot, 0 = today; a glider slides each layer's frequency into the next note.
- **Contour shape** — `attackCurve` / `releaseCurve` on the shared ADSR envelope, Tone's full set
  (`linear | exponential | sine | cosine | bounce | ripple | step`), one radio with lore names.
- **The bus filter, exposed** — `AudioAttributes.filterFreq` already drives each robot's bus
  `Tone.Filter` (`resolveBusFilterCutoff`, `AudioEngine.ts:175`) at a fixed `ROBOT_BUS_FILTER_Q = 1`
  (`:172`) with no UI. Add **Cutoff**, **Resonance** (Q) and a **Type** radio
  (lowpass / bandpass / highpass), plus a per-robot LFO target on the filter's frequency: a
  resonant bandpass is the wah, a Bank lane on its frequency is the autowah.

- **User:** Crawford, composing the fleet. A listener notices *one* robot glide or wah when it
  docks; the fleet does not become a different instrument.
- **Why now:** The layout rework (PR #547) and Robot Pan (PR #553) are merged, so the robot section
  tabs exist and every new control is laid out once. **Pre-v1: there are no worlds in the wild whose
  sound can change**, so seeded defaults are free (Crawford, 2026-10-13).
- **Success:** A fresh world carries **rare accents** — roughly one glider in twelve, a couple of
  shaped contours, most filters near open with a few resonant. Headless tests prove each edit
  reaches the Tone node through the voice's `set` path (`compositeVoice.ts:87`). The Pixel A/B
  against the series baseline (seed `alpha`, Full, 0 underruns in 3:00 on `main` `ca2b6868`,
  [scratchy-audio-phones.md](../todo/scratchy-audio-phones.md#baseline-for-the-audio-palette-series-roadmap-50--crawfords-run-2026-10-13))
  stays flat.

## Behavior

- **Seeded, as a minority trait.** Every new field gets a `getSeededVal` draw in `spawnSystem.ts`
  beside `robot.audio.filterFreq` (`:297`). The distribution is skewed so the *default* value
  (no glide, linear contour, open-ish lowpass at low Q) is the common case and the articulated
  values are the accent. The spec fixes the odds; the interview fixed the feel: calm world,
  detail rewards attention.
- **One branch, all three traits, one A/B at the end.** The plumbing (seed draw, session diff,
  company broadcast, content keys, a control in a section) is the expensive part and is built
  once. Zero nodes makes the phone gate a formality, measured once.
- **Sections.** Portamento and the contour radio live in **Envelope** beside the ADSR sliders
  (`robotSubsectionConfig.ts`, id `envelope`). Cutoff / Resonance / Type live in **Source**, the
  spectral section (id `source`) — a filter shapes timbre, not loudness, and Levels (Volume + Pan)
  was just laid out and is not reshuffled.
- **LFO target ships in 50.1.** A `bus.frequency` target joins the robot LFO target list
  (`src/types/lfo.ts:44–49`, today layer gain / detune only), **gated by `filterLfosEnabled`**
  (`src/utils/audioBudget.ts:42`, `LOAD_FILTER_LFOS_MIN`): robot LFO count is what the budget fights
  ([17.2.7](../todo/roadmap.md#1727-performance-robot-lfo-priming)), and the gate is the existing
  escape hatch. Without the target the exposed filter is a tone control, not a wah.
- **Persistence.** All new fields join `RobotAudioOverrideDiff` (`src/types/session.ts`, where
  `filterFreq` already sits at `:22`) and the share link; absent = the seeded value, like every
  field since v1. **Companies broadcast every field** the way Volume does
  (`onVolumeChange`, `src/components/company/useCompanyOptions.ts:266`), broadcast-not-link.
- **Edits glide, never snap** where the node is an AudioParam (cutoff, Q); type and curve changes
  are discrete by nature and apply on the next note.

## Style / constraint

- Existing primitives only (layout decision 10): sliders and radios from `src/types/controls.ts`,
  schemas beside the ADSR / oscillator schemas in `robotOptionsConfig.ts`. Every control gets a
  help popover. Controls hold their largest-content size.
- Content layer: lore names in the [copy-tone-guide](../reference/copy-tone-guide.md)'s voice for
  the three traits, the seven curve shapes and the three filter types, in `src/content/copy/probe.ts`.
  Never a literal in a component or data config.
- Every Tone write lives in `AudioEngine` / `compositeVoice.ts`, from an action or the transport
  tick, never from a GSAP callback (Strict Separation). State stays JSON-serialisable: numbers and
  strings on `AudioAttributes` / `ADSREnvelope`, never a node.
- **Nothing reaches the robot's body** (Visual Mapping guardrail): ROBOT_DESIGN.md's dial list is
  unchanged.
- Audio Load Budget: no new nodes. If the A/B is *not* flat, the offender ships behind a new
  `LOAD_*_MIN` threshold beside `LOAD_FILTER_LFOS_MIN` (`src/constants/index.ts`) or not at all.

## Out of scope

- **`decayCurve`** — two options, too subtle to earn a control (rejected in the interview).
- **A curated subset of curves** — expose Tone's seven, name them well.
- **New nodes of any kind**, per-robot effects, sends — 50.2 onwards.
- **Changes to the Levels section** (Volume + Pan).
- **Portamento-only first** — rejected; one branch carries all three.
- **Any visual sign of articulation on the gem.**

## Known implementation notes (not yet spec'd)

- **Today's `filterFreq` seeding already closes the filter**: `FILTER_FREQ_RANGE` is 400–2500 Hz
  (`spawnSystem.ts:82`), so "most filters near open" means re-seeding that range (or treating the
  current range as the "open-ish" baseline and adding the resonant minority on top). The spec
  decides; either way the world changes sound, which is acceptable pre-v1.
- `resolveBusFilterCutoff` treats `0` as open; a Type radio needs a sensible cutoff for highpass
  (where "open" is low, not high). Decide the per-type default in the spec.
- `ADSREnvelope` (`src/types/Robot.ts:53`) gains two optional string fields; live envelope edits
  already flow through `set({ layers })` (`compositeVoice.ts:112`), and portamento rides the same
  patch. The bus filter is on the robot bus, not the layer synths, so its params take a separate
  engine method mirroring `updateRobotMasterVolume`.
- `reserveVoice` already threads `filterFreq` (`spawnSystem.ts:735`, `:889`); Q and type extend that
  signature or move to an attributes object — the spec picks.
- Verify every file:line above against the tree before building; the citations were checked on
  2026-10-13 against `main` at `450bf2ad`.
