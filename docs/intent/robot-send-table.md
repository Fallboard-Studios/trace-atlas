# Intent: Robot Sends — One Table for the Five Sends

Confirmed via `interview-me` on 2026-10-22 (four questions, four guesses confirmed), ahead of a `spec-driven-development`
pass. Roadmap item **55** ([docs/todo/roadmap.md](../todo/roadmap.md#55-robot-sends-one-table-for-the-five-sends)), raised
at the Robot Effect Sends ([50.7](robot-effect-sends.md)) code review and put next on the roadmap by Crawford the same
day. 50.7 merged as PR #569 on 2026-10-22, so the precondition ("once 50.7's PR merges") is met and all five sends exist on
`main`.

A refactor with **no change in behaviour**. The five per-robot sends (Reverb, Delay, Grit, Shimmer, Double) are spelled out
one field at a time in about fifteen places; this phase writes them once.

## Outcome

One table beside `ROBOT_SEND_FIELDS` in [src/data/robotSendLoadingRanges.ts](../../src/data/robotSendLoadingRanges.ts)
(or a sibling module the spec names) that gives each send everything its consumers need — the `Robot` field, the
`updateRobotSends` engine key, the share-link code, the slider schema, the content key — and every consumer iterating that
table instead of naming the five:

- the four reservation sites that prime a fresh voice (`loadInstruments`' post-load pass and `reReserveVoice` in
  [src/engine/AudioEngine.ts](../../src/engine/AudioEngine.ts); `spawnRobot` and `reRegisterAllRobotsAudio` in
  [src/systems/spawnSystem.ts](../../src/systems/spawnSystem.ts)), through one `robotSendLevels(robot)` helper;
- the ten named actions in [src/systems/robotOptionsActions.ts](../../src/systems/robotOptionsActions.ts)
  (`applyReverbSend` … `applyDoubleSendValue`), replaced by one `applySendValue(robot, localeId, field, fraction)` (and
  its display-percent form), which the swell tick's five-way `writeRobotSend` switch in
  [src/systems/audioSwells.ts](../../src/systems/audioSwells.ts) also goes through;
- the two screens — five `handle*SendChange` in `RobotScreen.tsx`, five `on*SendChange` in `useCompanyOptions.ts` — and
  `AudioSettingSection.tsx`'s five value / handler / swelling prop sets, which become one list of send rows that
  `CompanyOptionsSection.tsx` passes through;
- the five near-identical `*_SEND_SCHEMA`s in `robotOptionsConfig.ts`, derived from the table;
- the field-list copies: `SEND_ATTRIBUTES` (`audioSwells.ts`), `SEND_PRIME_KEYS` (`sessionDiff.ts`), the literal clamp
  list in [src/stores/localeStore.ts](../../src/stores/localeStore.ts), and the five-line-each-way `rs` / `ds` / `gr` /
  `sm` / `db` mapping in `sessionShareUtils.ts`;
- the engine's `reserveVoice`, which builds the five send gains one by one twice (live voice and stub fallback), and
  `updateRobotSends`, which writes Reverb and Delay one way and the three room sends in a loop.

- **User:** Crawford, at the next send-shaped change — a sixth send, or a change to how a send is primed — which becomes
  one new row and nothing else to hunt for.
- **Why now:** The 50.7 review named the duplication as the one follow-up; 50.7 has just merged, and the fifteen copies
  are fresh in mind.
- **Success:** A dedicated parity check, written RED on `main` *before* the refactor starts, stays green through it; the
  full suite is green; Crawford's by-ear listen confirms nothing moved. The regex source scan
  [src/engine/reservationSendsPrime.test.ts](../../src/engine/reservationSendsPrime.test.ts) is deleted once
  `robotSendLevels` leaves it nothing to guard.

## Behavior

- **Nothing audible or saved moves.** No seeded value, saved diff, share code, slider position, swell pick or sound
  changes. The existing suite alone is *not* the proof (most of the ~72 send tests spy on the named actions and are
  rewritten in the same change, so they cannot be the independent oracle); the parity check below is.
- **The parity check is a before/after snapshot, captured on `main` first.** Over a seed fixture it records every robot's
  five send values and the full `updateRobotSends` call sequence (robot id, keys, values, order) across the four paths
  that write sends: spawn, session restore, share-link restore and a swell tick. It must pass on `main` before the first
  refactor commit and after the last. The fixture seeds a distinguishing (non-default) value per send so a coincidental
  pass is impossible.
- **The five `Robot` fields stay by name.** `Robot.reverbSend` … `doubleSend`, and the same five optional fields on
  `RobotAudioBaseline`, `RobotAudioOverrideDiff` (`src/types/session.ts`) and `CompanyOptionsSnapshot`
  (`src/types/Company.ts`), are read by name by the session format and the company snapshot. The table maps *onto* these
  fields; it does not replace them with an array or a record.
- **The named actions go.** `applyReverbSend`, `applyDelaySend`, `applyGritSend`, `applyShimmerSend`, `applyDoubleSend`
  and their five `*Value` forms are removed, not kept as one-line wrappers. The ~72 references across seven test files
  move to the generic form (spy on `applySendValue`, assert the `field` argument). The two living-docs guards
  ([robotSendsDocs.test.ts](../../src/docs/robotSendsDocs.test.ts),
  [robotEffectSendsDocs.test.ts](../../src/docs/robotEffectSendsDocs.test.ts)) are re-pinned to the new names, as 50.7's
  T22 re-pinned the `globalPedalsDocs` chain line, and the specs they pin are amended in the same change.
- **The caller-side swell cancel stays where it is.** A hand edit cancels a swell on the same robot at the caller
  (`RobotScreen` / `useCompanyOptions`), never inside the action — the swell tick writes through the same action and
  would cancel itself. One generic handler factory per screen keeps that rule; it does not move the cancel into
  `applySendValue`.
- **The swell tick's fraction form is preserved.** The tick hands the stored 0..1 fraction over directly (a display percent
  does not round-trip every double), so `applySendValue` keeps both a fraction entry and a display-percent entry, exactly
  as the ten actions pair today. The NaN-dropped-whole rule and `clampSend` apply unchanged.
- **The regex scan is deleted, not kept as belt-and-braces.** Once every reservation site calls `robotSendLevels(robot)`,
  a site that forgets to prime is a type error or a missing call the parity check catches; the file-walking scan no longer
  guards anything the code does not.

## Style / constraint

- **Five written once is the goal in itself, not extensibility machinery.** No plugin registry, no generic "room"
  abstraction beyond what `SEND_FIELD_ROOM` / `SendRoomKey` already do, no theme hook. A sixth send is one row; that is
  the whole ambition.
- **Existing primitives only.** The sliders stay `SliderLinear` rows composed in `AudioSettingSection`; the table-derived
  schemas keep their `robotOptions.<field>` ids and `probe.<field>` content keys
  ([src/content/copy/probe.ts](../../src/content/copy/probe.ts)) so no user-facing string, id or help popover changes.
  No literal display string enters a component (content guard).
- **Architecture unchanged.** Every AudioParam write stays in `AudioEngine`; state stays JSON-serialisable (the table is
  a module constant, not store state); no GSAP callback reaches audio.
- **The usual gates, minus the phone.** TDD (parity RED first, one commit per task), lint, type-check, full suite, the
  code-review pass. No Pixel A/B and no `npm run perf:audio` run: the audio graph is untouched (same gains, same
  connections, same ramps), so there is nothing for the phone to measure.
- **Precedent followed:** Robot Effect Sends T1 (a parity test against the pre-change seeds before the first code
  change), and the repo's habit of removing a dead surface outright rather than leaving a compatibility shim (Layer Active,
  Accordion status light, Audio Rig bypass).

## Out of scope

- **Keeping the ten named actions as wrappers** for the tests' or docs' sake. Rejected: wrappers that exist only to be
  spied on are the duplication in a thinner coat.
- **Changing the saved or shared format** — the session payload's five optional fields and the five share codes stay
  exactly as they are. The table carries the codes; it does not renumber or merge them.
- **Replacing the five named `Robot` fields with a `sends` record or array.** The session format and company snapshot
  read them by name.
- **Any seeded-value, band, cap or roll change** — `ROBOT_SEND_LOADING_RANGES`, `EXCLUSIVE_SEND_FIELDS` and the roll
  order are not touched.
- **A sixth send, per-robot delay time, or themes.** None is planned as part of this; the table merely makes the first of
  them one row when it comes.
- **Roadmap 54 (Output Headroom).** Separate item, its own interview; not folded in.
- **A phone A/B.** See Style / constraint.

## Known implementation note (not yet spec'd)

- **Table shape and home.** Whether the table lives in `robotSendLoadingRanges.ts` beside `ROBOT_SEND_FIELDS` or in a new
  `robotSends.ts` that re-exports the field list; and whether the schema column is a built `SliderLinearSchema` or just the
  schema id + content key with one builder. The spec decides; the constraint is one row per send carrying field, engine
  key, share code and content key.
- **`AudioSettingSection`'s row list.** The exact prop shape (`sends: Array<{ field, value, onChange, swelling }>` versus
  a `Record<RobotSendField, …>`), and whether `volume`'s row joins it or stays separate (it is not a send; likely stays).
- **The engine's two send-gain builds.** `reserveVoice` builds the five gains for the live voice and again for the stub
  fallback; whether both go through one `buildSendGains()` or the stub keeps its own path is the spec's call.
- **Where `SEND_PRIME_KEYS`' field→engine-key pairing goes.** It becomes a column of the table; `sessionDiff.ts`'s three
  loops read the table.
- **Parity-check mechanics.** Whether the `updateRobotSends` sequence is captured by a spy on the engine or by a
  recording stub, and which seed fixture (likely the 50.7 T1 fixture extended with non-default sends).
