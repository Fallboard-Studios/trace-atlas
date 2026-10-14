# Intent: Robot Sends — Per-Robot Reverb and Delay Depth

Confirmed via `interview-me` on 2026-10-14 (7 questions, every guess confirmed), ahead of a
`spec-driven-development` pass. Roadmap item 50.2
([docs/todo/roadmap.md](../todo/roadmap.md#502-robot-sends-per-robot-reverb-and-delay-depth)), part of the
Audio Palette series (roadmap 50). Pairs with Robot Pan (roadmap 49, shipped): pan is where, send is how far.

## Outcome

A **Reverb** row and a **Delay** row under Pan in the Levels block (`AudioSettingSection.tsx`, rendered by
both the robot screen and the company screen), so the stack reads Volume, Pan, Reverb, Delay: how loud,
where, how far. Each is a per-robot **send** into the global reverb or delay, true send/return. A robot at
zero is completely dry while its neighbours sit in heavy echo, and a company can be "the far ones" through
the usual broadcast.

- **User:** Crawford, composing a world — placing each voice at its own distance.
- **Why now:** Robot Pan has shipped, so the distance control lands beside it in the same place.
- **Success:** One robot can be bone dry and another drowned in the same world; a company broadcast moves
  its members together; the placement survives a session save and a share link; the Pixel A/B shows no
  new underruns.

## Behavior

- **True send/return.** The global Reverb and Delay become pure echo rooms (effect `wet` = 1). Each
  robot's send gain decides how much of its sound enters each room, and the dry path is unchanged. A send
  of 0 means that robot has no reverb (or delay) at all.
- **The global wet sliders change meaning, not place.** `reverb.wet` and `delay.wet` become **master
  returns**: how loud each echo room is overall. They start at full, are **no longer seeded**, and keep
  their current slider range. Seeding both the return and each send in 0.1–0.4 would multiply them to near
  silence, which is why the return is not seeded. **Swells move to the individual robots** (Crawford,
  2026-10-14, after the spec showed a swell on a return at full could only dip): `reverbSend` and
  `delaySend` join the robot swell pool, and `delay.wet` / `reverb.wet` leave the global swell pool.
- **Seeded spread per robot.** Each robot draws its own Reverb and Delay send at spawn from the current
  global ranges (`GLOBAL_AUDIO_LOADING_RANGES`: `reverb.wet` 0.1–0.4, `delay.wet` 0–0.3), so a fresh world
  already has near and far. The delay "quiet" chance (`DELAY_QUIET_THRESHOLD`, which seeds some worlds with
  no delay) carries over to the per-robot draw. **New worlds will sound different from today's; that is
  accepted** — the app is pre-v1 (see the pre-v1 rule: no "keep existing sound" constraint).
- **Tapped after Volume.** The send takes its signal after the robot's Volume bus gain, so turning a robot
  down also fades its echo.
- **Edits glide.** A slider move or a company broadcast ramps the send gain the way
  `updateRobotMasterVolume` ramps the bus gain, so nothing clicks.
- **Saved.** Both sends join the robot override diff (session saves) and the share link as optional
  fields; absent = the seeded value. An untouched robot adds nothing to a save, since the spread is
  recomputed from the seed. (Unlike Volume, which is live-only; like Pan, which is a composition choice.)
- **Companies broadcast both**, broadcast-not-link as every other field, via `CompanyOptionsSnapshot`.
- **Survives the Decay toggle.** `wireGlobalFxChain` is the one place the chain is wired and it already
  rewires on the Natural / Controlled Decay toggle, so the send bus is wired there and must come back
  intact after a flip.

## Style / constraint

- Existing primitives only: two plain 0–100 sliders composed in `AudioSettingSection` beside Volume and
  Pan, schemas beside `VOLUME_SCHEMA` in `robotOptionsConfig.ts`. Each gets a help popover.
- Content layer: lore names in the copy-tone-guide's voice, in `src/content/copy/probe.ts`. Never a literal
  in the component.
- **Nodes:** one send `Gain` per robot per effect (24 at most), nothing else. No per-robot effect nodes.
  Every AudioParam write stays in `AudioEngine` / `globalFx.ts`, on the transport tick or from an action,
  never from a GSAP callback (Strict Separation). State stays JSON-serialisable; the gains live in the
  engine, never in state.
- **The phone gate stands, with no Effects Limit threshold.** Measured the Audio Palette way: same
  `?session=` world, A/B against the branch base on the Pixel via the `?debug` HUD, Standard and Full, plus
  `npm run perf`, against the series baseline (seed `alpha`, Full, 0 underruns in 3:00 on `main`
  `ca2b6868`). If underruns rise, treat it as a wiring bug to find or back out, **not** a `LOAD_*_MIN`
  setting: under send/return, "sends off on weak phones" would mean no reverb or delay at all, a worse
  sound than the crackle.
- Nothing reaches the robot's body (Visual Mapping guardrail); ROBOT_DESIGN.md's dial list is unchanged.

## Out of scope

- **Sends as robot LFO targets or Bank targets** — same call as Pan; the per-robot volume LFO target was
  removed as "not as impactful as I had hoped", and a send target would add LFO load. (Swells are the
  exception: the sends ARE robot swell attributes, see Behavior. A swell is a scheduled ramp of the stored
  field, not an audio-rate connection, so none of the LFO-cost reasoning applies.)
- **Swells on the global returns** — `delay.wet` / `reverb.wet` leave the global swell pool; no replacement.
- **Per-robot effect nodes** (a reverb or delay each) — twelve instances on a phone.
- **An Effects Limit (`LOAD_*_MIN`) threshold for sends.**
- **Any visual sign of the sends on the gem.**
- **Holding existing worlds to their current sound.**

## Known implementation note (not yet spec'd)

- **Topology detail for the spec.** Today the robot bus feeds EQ3 → LPF → HPF → Delay → Reverb →
  Compressor → Limiter in series (Controlled Decay moves the Compressor ahead of the Delay). A true
  send/return needs the dry path to bypass the echo rooms and the sends to enter each room's input, with
  the room outputs summed back in. The spec decides where the sends tap in relative to the global EQ and
  filters, whether Delay still feeds Reverb as it does in series today, and how both Decay orderings stay
  correct. This is the one place the roadmap's "topology change, so it is measured" bites.
- **Fields.** `reverbSend` / `delaySend` (names to settle) on `Robot` and `CompanyOptionsSnapshot`, in
  `RobotAudioOverrideDiff` / `sessionDiff.ts` / `session.ts` and the share-link encoding, as `panAuto` /
  `pan` were; new `dataId` draws in `spawnSystem.ts`; the `GLOBAL_AUDIO_LOADING_RANGES` rows and
  `globalAudioSeed.ts` draws for `reverb.wet` / `delay.wet` change from seeded to a fixed full return,
  mirrored in GLOBAL_CHAIN_GRID.md and the themes idea.
- **`reserveVoice` coordination.** 50.1 (Robot Articulation) proposes an optional trailing `articulation`
  object on `reserveVoice`; 50.2 also needs per-robot values at reservation (initial send levels, plus the
  `reReserveVoice` and stub-fallback paths and `releaseVoice` / `disposeVoiceNodes` cleanup). The spec
  decides one shared way to hand them over so the two branches don't collide.
- Verify every file:line cited in the roadmap entry against the tree before building (e.g.
  `wireGlobalFxChain` is `globalFx.ts:144`, bus wiring `AudioEngine.ts:683–708`, `DELAY_QUIET_THRESHOLD`
  use at `globalAudioSeed.ts:147`).
