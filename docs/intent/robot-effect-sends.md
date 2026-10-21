# Intent: Robot Effect Sends — Grit, Shimmer and Double

Confirmed via `interview-me` on 2026-10-21 (6 questions, five guesses confirmed, one scope item deferred by Crawford),
ahead of a `spec-driven-development` pass. Proposed roadmap item **50.7**, the seventh sub-phase of the Audio Palette
series ([docs/todo/roadmap.md](../todo/roadmap.md#50-audio-palette-new-attributes-without-new-libraries)), after Global
Pedals (50.6, merged as PR #565 on 2026-10-21). Extends Robot Sends (50.2, [robot-sends.md](robot-sends.md)): the same
send/return model, applied to three effects that are global inserts today. Names (Grit, Shimmer, Double) are working
titles.

The question this answers came from the Tone.js inventory
([docs/reference/TONE_EFFECTS_INVENTORY.md](../reference/TONE_EFFECTS_INVENTORY.md), 2026-10-19): which global effects
should the robots be able to send into, and which should stay inserts.

## Outcome

Three new per-robot **send** rows in the Levels block (`AudioSettingSection.tsx`, rendered by the robot screen and the
company screen), under Pan beside Reverb and Delay:

- **Grit** sends into a **Colour room**: Distortion → Chebyshev → BitCrusher in series, moved off the dry chain and fed
  only by sends, with one return. The three colour Mixes become depths *inside* the room; the seeded character draw
  (clean / drive / fold / crush) still lights at most one of them.
- **Shimmer** sends into the **FrequencyShifter**, moved off the dry chain and fed only by sends. The shift stays global.
- **Double** sends into the **Chorus**, moved off the dry chain and fed only by sends.

A fresh Classic world has one or two gritty, shimmering or doubled probes among clean ones; everyone else is at exactly 0
and costs nothing. The per-robot seed bands for all five sends (these three plus Reverb and Delay) live in one table a
theme can later override.

- **User:** Crawford, choosing a world on the power-down screen and shaping one voice at a time on its card.
- **Why now:** The global Colour and pedal Mixes cannot be both audible and tame on the Pixel (brought down twice, now
  seeding below audibility at their floors); a per-robot send makes the robot decide how much goes in. And the themes
  (`docs/ideas/themes.md`, now six: ambient, calm, classic, upbeat, intense, chaos, titles WIP) need a single send band
  table to swap, which the Reverb and Delay bands do not have today.
- **Success:** In a fresh Classic world, Grit lands on two or three robots, Shimmer and Double on one or two each, nobody
  carries two of the three, and the rest are at exactly 0. A world with no sends into a room leaves that room dark and
  the phone reads as it does now. The three sliders persist, share and bulk-edit exactly as Reverb and Delay do.

## Behavior

- **True send/return, as Robot Sends built it.** Each room's effect `wet` stays pinned at 1 inside its bypass cell; each
  robot's send gain decides how much of that robot enters the room; the dry path is unchanged. A send of 0 means the
  room never hears that robot.
- **The rooms are bypass cells fed by sends.** The Dark-Effect Bypass ([spec](../specs/DARK_EFFECT_BYPASS.md)) gave
  every effect a cell, `in → dry → cut` and `in → effect → wet → cut`. A room is a cell whose `in` is fed by the robots'
  send gains instead of the previous chain node, and whose `cut` runs to the rooms' join. With no sends and a return of
  0 the room is dark by the existing crossing protocol: no input, no path to the destination, nothing processed.
- **The global Mix of each moved effect becomes its Return**, exactly as `reverb.wet` and `delay.wet` did in 50.2: how
  loud the room is as heard from every robot, starts at full, **not seeded**, keeps its slider. Inside the Colour room
  the three colour Mixes keep their meaning (depth of each node in the room) and their seeding; the room as a whole gets
  one Return.
- **The character draw stays.** One Colour draw per world still picks clean, drive, fold or crush, and a dark colour node
  still seeds its shape value. What changes is who hears it: only the robots with a Grit send.
- **The sends tap where the existing two tap**: post-Volume, post-bus-filter, post-pan, so a room hears each robot
  already placed in the stereo field and turning a robot down fades its send. (The shifter's known sideband leak on a
  panned voice therefore stays; see GLOBAL_PEDALS.md §8.)
- **The rooms' returns rejoin where Reverb's and Delay's do**: the Compressor's input under Natural Decay, the Width cell's
  `in` under Controlled Decay. The dry chain loses three stages: EQ → LPF → HPF → AutoWah → Phaser → Tremolo → Vibrato →
  Compressor → Width → Limiter.
- **Seeded as minority traits, with a cap.** Each robot rolls each of the three sends the way the Delay send rolls today:
  a quiet roll puts exactly 0 on most of the fleet, the rest draw from a band. Grit on two or three of twelve, Shimmer and
  Double on one or two each, and **no robot gets two of the three** in a fresh world. The exact bands and the quiet
  shares are a listen (the spec ships placeholders; a task tunes them). The counts become the obvious theme knob.
- **One per-robot send band table.** The five send bands (Reverb, Delay, Grit, Shimmer, Double) move into a table of
  their own, keyed by the robot field, replacing the two `delay.wet` / `reverb.wet` rows of `GLOBAL_AUDIO_LOADING_RANGES`
  that `generateRobotSends` reads today. The global effect bands stay where they are. A parity test pins that Reverb and
  Delay seed exactly the values they seed now.
- **Vibrato stays a chain insert**, retuned to a true vibrato (Mix near full, small depth) by the retune task below, so it
  no longer overlaps the Chorus once the Chorus is a room. It keeps its cell and the crossing protocol it carried.
- **Edits glide**, the way `updateRobotSends` ramps the existing two.
- **Saved and broadcast** as the existing two: optional fields on the robot override diff, the session payload and the
  share link (absent = seeded), and on `CompanyOptionsSnapshot` for broadcast-not-link bulk edit.
- **Swell targets**, as the existing two sends are: a rare swell on a Grit send is a roar, which is wanted.
- **The number retune lands first, as its own task and listen**, against the inserts as they are today: the Mix floors,
  the HPF seed, the AutoWah sensitivity, the Chorus delayTime, the Compressor band, the Tremolo sync odds, the Reverb
  preDelay range ([docs/tasks/CLASSIC_BAND_RETUNE.md](../tasks/CLASSIC_BAND_RETUNE.md)). The room bands in this
  phase's spec are written against that retuned Classic, not against numbers already agreed to be wrong.

## Style / constraint

- Existing primitives only: three more 0–100 % sliders composed in `AudioSettingSection` beside Reverb and Delay,
  schemas beside `REVERB_SEND_SCHEMA` in `robotOptionsConfig.ts`, each with a help popover. Lore names in
  `src/content/copy/probe.ts`, never a literal in a component.
- **No new effect nodes.** The three rooms are the existing nodes moved, plus one send `Gain` per robot per room (36 at
  twelve robots), three returns, and the cells' cuts. Nothing per robot beyond the gains. Every AudioParam write stays in
  `AudioEngine` / `globalFx.ts`, never from a GSAP callback. State stays JSON-serialisable; the gains live in the engine.
- **The cycle search stays bounded.** Each room's `cut` sits at the room's output, before the join, so a new room costs
  each robot's connect one extra branch, not a multiplication (GLOBAL_PEDALS.md §8 measured what happens otherwise).
- **The phone gate stands, with no Effects Load threshold for sends.** Same method as 50.2 and 50.6: the `?debug` HUD on
  the Pixel, Standard and Full, same `?session=` world, A/B against the branch base, with `npm run perf:audio` on
  desktop. The late-sitting collapse that `main` shares (backlog 27) is not this phase's to fix and does not fail the
  gate. A dark room must read as it does today; a lit room's cost is the effect's cost, already priced by 50.6.
- Nothing reaches the robot's body (Visual Mapping guardrail); ROBOT_DESIGN.md's dial list is unchanged.
- Pre-v1: new worlds will sound different, and existing saves load the three sends at their seeded values. No "keep
  existing sound" constraint.

## Out of scope

- **Per-robot delay time** (each robot owning a delay line, an Auto state following the global Delay Time and a
  per-robot note picker when off, Feedback global). Crawford wants it ("some could be on 16th notes and others on triplet
  quarters") and deferred it on 2026-10-21 because it is a build of its own and adds twelve delay lines to the graph
  right after the phone round. Its own later phase; the spec records the Auto-follow shape so it is not redesigned.
- **Sends into AutoWah, Phaser, Tremolo or Vibrato.** The wah's one follower would track whoever sends loudest; a
  parallel phaser halves its notches; a send *adds*, so a tremolo send makes a robot throb louder rather than duck and a
  vibrato send is a chorus. Per-robot tremolo is an LFO link on the bus gain and per-robot vibrato is the detune link,
  both of which the LFO Bank already does cheaply.
- **Three separate colour sends** (one per colour node). Rejected for one Grit send: 12 gains instead of 36, one slider
  on the card, and the character draw already decides which node is lit.
- **A second Chorus or a separate Vibrato room.** Chorus is the sendable one; Vibrato becomes a true vibrato insert.
- **Dropping Vibrato.** Considered; kept because it carried the bypass crossing protocol and, at full wet, makes a sound
  nothing else does.
- **The themes themselves.** This phase only leaves the send band table in the shape a theme can override.
- **Sends as LFO Bank targets**, same call as 50.2.
- **Any visual sign of a send on the gem.**
- **Holding existing worlds to their current sound.**

## Known implementation note (not yet spec'd)

- **Room cells.** The spec decides whether a room reuses the cell type as is (with `dry` held at 0, since the robots'
  dry signal already reaches the chain through the bus) or gets a `RoomCell` without the dry branch, and how the
  darken timer arms when the last send reaches 0 versus when the Return reaches 0. The crossing protocol's "edges made
  and broken only while `wet` is zero" rule must hold for a room whose input is twelve gains.
- **The Colour room's internal order and Mix law.** Three cells in series inside one room, or three effects on one
  `in` with their own cells and a shared `cut`; the spec picks, and keeps `colourWetGain` and the character draw.
- **Fields.** `gritSend` / `shimmerSend` / `doubleSend` (names to settle with the lore pass) on `Robot`,
  `CompanyOptionsSnapshot`, `RobotAudioOverrideDiff`, `sessionDiff.ts`, `session.ts`, the share link's compact codes
  (`rs` / `ds` exist), and the robot swell pool (`SwellRobotAttributeId`, `ROBOT_SWELL_FIELD_RANGE`). New `dataId` draws
  in `spawnSystem.ts` beside `generateRobotSends`, with the one-of-three cap drawn in a fixed order.
- **The send band table.** `ROBOT_SEND_LOADING_RANGES` (name to settle) keyed by robot field, with the quiet share per
  send beside the band, so a theme overrides both. `GLOBAL_AUDIO_LOADING_RANGES` loses its two `wet` rows and
  `GlobalAudioSeedFieldKey` loses the keys, which touches `GLOBAL_CHAIN_GRID.md` and the themes idea's "what exists"
  list.
- **Chain order tests.** Every test that pins `wireGlobalFxChain`'s `chainNodes` and the ten cells' order re-pins to the
  seven-stage chain plus five rooms. The docs-guard tests for Colour, Modulation and Pedals name the rooms.
- **The retune task.** [docs/tasks/CLASSIC_BAND_RETUNE.md](../tasks/CLASSIC_BAND_RETUNE.md), before this phase's T1:
  sixteen rows, two decisions for Crawford, one listen, GLOBAL_CHAIN_GRID.md and the loading table updated together. The
  Vibrato's new band (rows 1–2 there) is part of it.
- Verify every file and symbol named here against the tree before building; the pedals merge moved line numbers.
