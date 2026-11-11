# Phase Spec: Monitor Mode Made Trustworthy — Highlight you can hear, from a robot that is playing, and the mode shown on every card

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests, Part A (audio): `npx vitest run src/utils/audioBudget.test.ts src/systems/audioBudgetSystem.test.ts src/engine/AudioEngine.test.ts src/utils/robotAudibility.test.ts`
> - Focused tests, Part B (display): `npx vitest run src/components/panels/screen/screens/RosterTile.test.tsx src/components/panels/screen/screens/RosterBoard.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx src/components/panels/screen/worldView/MetaBox.test.tsx src/data/robotSelectionConfig.test.ts src/content/content.test.ts`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

**Status:** spec written 2026-11-11 from the confirmed intent
[docs/intent/monitor-mode-trustworthy.md](../intent/monitor-mode-trustworthy.md) (`interview-me`, 2026-11-11, five
questions, every guess confirmed). Not yet planned. Not yet a backlog entry: the shared counter's next free number is
81, and the plan.md line (Stage 3 for the sound, or Stage 5 for the cards) is Crawford's call (§7.2 Q1).

**Who it is for:** Crawford, listening and reading the fleet at a glance, on the desk shell and the phone shell.

**The finding** (the review of 2026-11-11): Highlight halves note velocity, nominally 6 dB, and cannot be heard; a
silenced robot's Highlight still dims the robots that are playing; the Audio Load budget gives Solo priority and
Highlight none; nothing on a card or tile says which mode a robot carries; and the roster tile's one-line status hides
the audio state on desktop. Two further findings were kept as features and are out of scope (§1.8).

---

## 0. Scope check

Two capabilities, each testable on its own, in one spec because they share one vocabulary (the four modes) and one
reviewer. They can be built in either order; the plan builds Part A first because the ear gate (§5.4) is the longer
wait.

| Part | Responsibility | Depends on |
|---|---|---|
| A — the sound | Highlight as a bus-gain dip; a Highlight counts only while its robot sounds; Highlight's admission rank | — |
| B — the display | The status field on the robot screen, the phone band and the roster tile: light + mode word, lit or dim; the tile's order and its two desk lines | — (reads the same stores Part A does; nothing Part A adds) |

---

## 1. Overview & Claude Explanation

### 1.1 Today

- **Highlight** lives in `scheduleNote` (`src/engine/AudioEngine.ts`, the `anyHighlight` block, ~line 810): if any
  robot with `audioMode === 'highlight'` is out of its station (`!isDockMuted`), every non-highlighted robot's note
  velocity is multiplied by 0.5 before `triggerWithCap`. The baseline velocity is 0.6 (`NOTE_VELOCITY_BASELINE`), the
  synth's velocity-to-loudness curve is shallow, and each bus runs into the master compressor; the halving is not
  audible. The check reads only the dock, so a highlighted robot silenced by another robot's Solo, or standing by over
  the budget, still dims the players.
- **Who is heard** is `isRobotAudible(audioMode, anySolo, docking)` (`src/utils/robotAudibility.ts`), enforced at the
  note trigger in `triggerWithCap`: Mute always wins; under any Solo only the soloed robots; otherwise the dock mutes a
  robot in its station. This rule does not change.
- **The budget** (`src/systems/audioBudgetSystem.ts` `reconcile`, `src/utils/audioBudget.ts` `reconcileSounding`)
  admits eligible robots first come, first served, with Solo priority: a Solo evicts the newest non-solo robot. A
  lowered cap evicts newest non-solo first. Highlight has no rank. The system reacts to an `id:audioMode:docking`
  signature and to `robotLoad`, and pushes the sounding set (`setSoundingRobots`, `soundingRobotIds`) and the
  standing-by list (`setStandingByRobots`) only when they change.
- **The bus gain.** Each robot's voice has a `busGain` set from its Volume through `robotBusGain(position)`
  (`src/engine/audioEngine/headroom.ts`: the volume curve times the headroom trim) at build (`reserveVoice`,
  `reReserveVoice`) and ramped by `updateRobotMasterVolume` over `VOLUME_RAMP_SECONDS` (50 ms) through `rampOrSet`.
- **The status field.** `useRobotMeta` (`src/components/panels/screen/screens/useRobotMeta.ts`) returns four display
  strings: job, docking, activity and `status`, the last being one of Emitting / Standing by / Disabled
  (`getAudibilityState` → `AUDIBILITY_LABELS`, `optionsRecord('probe.status')`). The robot screen's avatar column
  renders them as wells in `META_FIELDS` order (job, docking, activity, status); the phone band and the roster tile
  render one line from the templates `probe.band.statusLine` and `probe.roster.statusLine`
  (`{job} · {dockingState} · {activity} · {status}`, the band adding `· {battery}`). `MetaBox`'s `WorldLine` counts
  the robots whose state is `emitting`.
- **The tile line** (`RosterTile.css` `.roster-tile__status`) is `white-space: nowrap` with an ellipsis, on a 250 px
  tile (`--roster-tile-width`, `RosterBoard.css`), so on the desk the status word is the part that is cut.
- **The light.** The only status light in the app is the power rocker's, coloured through `statusLightColors.ts`
  (`getStatusLightColor('green' | 'red' | 'amber' | 'purple')`, each from a `colorTheme.json` family).

### 1.2 Highlight, the sound (Part A)

- **The dip is a bus-gain multiplier, not a velocity multiply.** While a Highlight is *live* (§1.3), every robot that
  is not itself a live Highlight has its bus gain target multiplied by `HIGHLIGHT_DIP_GAIN`, about −10 dB
  (10^(−10/20) ≈ 0.316; §7.1 A1). The highlighted robot's own bus gain is its Volume's, untouched.
- **One dip, whatever the count.** Two or more live Highlights all stay at full; everyone else drops the same amount
  once.
- **Ramped both ways** over `HIGHLIGHT_RAMP_SECONDS` (§7.1 A2), through `rampOrSet` as Volume is, so neither the
  dip nor its release is a step.
- **One target function.** The engine computes a robot's bus gain target in one place:
  `robotBusGain(volume) × (dipped(robotId) ? HIGHLIGHT_DIP_GAIN : 1)`, where `dipped` is "the live Highlight set is
  non-empty and does not hold this robot". `reserveVoice`, `reReserveVoice` (the budget's rebuild on admission) and
  `updateRobotMasterVolume` all go through it, so a voice rebuilt while a Highlight is live comes up already dipped and
  a Volume edit during a Highlight lands at the dipped level.
- **The velocity path is velocity's alone.** The `anyHighlight` block in `scheduleNote` is deleted; velocity is the
  Dynamics roll's and the accents' (`computeNoteVelocitySeeded`, `accentMultiplier`) and nothing else.

### 1.3 When a Highlight counts (Part A)

- A Highlight is **live** only while its robot is actually sounding: eligible (`isRobotAudible` true, so out of its
  station and not silenced by anyone's Solo) *and* in the budget's sounding set.
- So: a highlighted robot in its station highlights nothing until it comes back out (as today); under any Solo a
  Highlight on a non-soloed robot does nothing at all; a highlighted robot standing by over the budget highlights
  nothing until admitted (and §1.4 admits it).
- **Who decides.** `audioBudgetSystem.reconcile` already derives eligibility and the next sounding set from the
  signature; the live Highlight set is `next ∩ { r : r.audioMode === 'highlight' }`, pushed to
  `AudioEngine.setHighlightedRobots(ids)` only when it changes (a joined key, as `applyStandingBy` keeps one), and
  pushed **before** `applySet`, so a voice `setSoundingRobots` rebuilds reads the right dip state at build. The
  signature already carries everything the set depends on (`audioMode`, docking, the roster), and `robotLoad` is
  already a trigger, so no new subscription.
- **Lifetime.** The set is engine module state (never Zustand). `stopAudioBudget` pushes the empty set; `killAll`
  leaves it alone, like the polyphony cap, and the budget's forced reconcile on start re-pushes it. A rebuilt voice
  after a power cycle therefore comes up correct without a special case.

### 1.4 Admission: Solo, then Highlight, then Auto (Part A)

`reconcileSounding` gains the highlighted subset and ranks three ways. With `rank(id)` = 2 for a Solo, 1 for a
Highlight, 0 for anything else (all over the eligible set only):

1. **Keep** every still-eligible member of `previous`, in order.
2. **If the cap fell,** evict the newest rank-0 robot first, then the newest rank-1, then the newest rank-2, until
   the set fits.
3. **Admit the Solos** not yet in, in arrival order: into a free slot, else by evicting the newest rank-0 robot, else
   the newest rank-1; if every slot holds a Solo, this one waits (first come).
4. **Admit the Highlights** not yet in, in arrival order: into a free slot, else by evicting the newest rank-0 robot
   only, never a Solo or another Highlight; one that finds only Solos and Highlights waits (first come).
5. **Fill** any free slots from arrival order.

Returns `previous` itself when nothing changed, as today. Arrival order (`orderByArrival`) is unchanged: it is the
order of becoming eligible, and a mode change does not re-queue a robot. A robot whose mode changes to Highlight while
standing by is admitted by step 4 on that reconcile; one whose Highlight is removed keeps its slot (step 1), exactly
as an un-soloed robot does today.

### 1.5 The status field (Part B)

- **What it shows: the robot's own `audioMode`**, as a small light and a word. The words and their lore are the
  Monitor Mode options the editor already uses, `probe.monitorMode` in `src/content/copy/probe.ts`: Auto / Freeform,
  Mute / Standby, Solo / Featured, Highlight / Elevated. One entry per concept (CLAUDE.md): the field reads
  `optionsRecord('probe.monitorMode')`, and `probe.status`'s three options (Emitting, Standing by, Disabled) are
  deleted, not kept as a second vocabulary. `probe.status` stays as the field's own label (Status / ACOUSTIC EMISSION
  STATE).
- **The light's colour is the mode's, on that robot only:** Auto green, Solo yellow, Mute red, Highlight blue
  (§7.1 B1 for the theme families). A robot silenced by another robot's Solo is still a green Auto; a plain Auto
  robot never shows red because someone else is muted.
- **Lit or dim.** The light is lit when the robot is sounding right now (`isRobotAudible(...) && isRobotSounding(...)`,
  the pair `useRobotMeta` already evaluates) and dim when it is not, for any reason: its own Mute, the dock, another
  robot's Solo, the budget's standing by. The word never changes with the reason. So a silenced Auto robot reads
  "Auto" with a dim green light, and a soloed robot in its station reads "Solo" lit yellow. A user-muted robot reads
  "Mute" in red; whether that red is lit or dim is the one wording the interview left open (§7.2 Q2).
- **Derived, not stored.** `useRobotMeta` returns, beside the four strings, the mode key (`none | mute | solo |
  highlight`) and a `lit` boolean, both from the stores through boolean-typed selectors (another robot's tick
  re-renders nothing, as today). Nothing new in Zustand.
- **The light itself** is one small inline element before the word: a `ModeLight` (§7.1 B2) that takes the mode and
  `lit` and sets its colour from `statusLightColors.ts`, glow when lit, flat and translucent when dim. Hidden from the
  accessibility tree (`aria-hidden`): the word carries the meaning, and the robot screen's well label already names the
  field.
- **Where.** The robot screen's avatar column: the Status well moves to the **front** of `META_FIELDS` (status, job,
  docking, activity) and the light sits inline before its value. The phone band and the roster tile: the light before
  the line, whose template now leads with `{status}` (§1.6). The `WorldLine` count keeps its meaning — robots sounding
  right now — through the same `isRobotAudible && isRobotSounding` pair, so the Deck's "n of m" is unchanged.

### 1.6 The roster tile (Part B)

- **Order.** `probe.roster.statusLine` becomes `{status} · {job} · {dockingState} · {activity}` and
  `probe.band.statusLine` becomes `{status} · {job} · {dockingState} · {activity} · {battery}`.
- **Phone shell:** one line with its ellipsis, as today. The mode leads, so it is never the part that is cut.
- **Desk shell:** the status line holds **two lines**: `white-space: normal`, a two-line clamp, and a `min-height` of
  two lines, so every tile in the grid is the same height whether its text needs one line or two (Crawford's rule:
  controls hold their largest-content size; `.roster-tile` already keeps a fixed width for the same reason). The
  `.roster-board__tiles` flex row then stays even without any per-row measurement. The name line and the battery
  strip are untouched.

### 1.7 What a listener and a reader meet

- Highlight a robot on the Deck: within the ramp, everyone else drops about 10 dB and that robot stands clear. Set it
  back to Auto: everyone comes back the same way.
- Highlight a robot that is in its station, or under someone's Solo: nothing changes, and its tile shows a dim blue
  "Highlight" until it is actually heard.
- On a Light tier, highlight a robot that is standing by: it is admitted at once, the newest Auto robot stands by in
  its place, and the dip follows.
- The roster on the desk: every tile reads `● Auto · Surveyor · Active · Working` on one or two lines, the light's
  colour telling the mode and its brightness telling whether the robot is sounding.

### 1.8 What does not change

- `isRobotAudible` and its enforcement at the note trigger; the dock's mute and Solo beating it (ROBOT_LIFECYCLE.md
  rule 6); the standing-by ledger (`standingBy.ts`) and who carries a voice.
- The stay-up rule reads docking only (a user-muted last robot leaves the world silent; a feature).
- Company-level mode is a broadcast to the members, read back as the first member's (COMPANIES.md).
- The world view: no mark for any mode. The body guardrail stands as written; selection and company glow are the only
  halos.
- The editor: `AUDIO_SETTING_SCHEMA`'s radio, `applyAudioMode`, the company's `onAudioModeChange`.
- The power rocker's light and `statusLightColors.ts`'s existing four states.
- Backlog 74 (the dock fade) and 79 (a per-note pulse) are separate items.

---

## 2. Target File Structure

```text
src/utils/
├── audioBudget.ts               # reconcileSounding: the highlighted subset and the three-way rank (§1.4)
├── audioBudget.test.ts          # the rank: eviction order, Solo over Highlight, Highlight over Auto, the waits
├── robotAudibility.ts           # isRobotEmitting(audioMode, anySolo, docking, isSounding) replaces getAudibilityState;
│                                #   AudibilityState and getAudibilityState go
└── robotAudibility.test.ts
src/systems/
├── audioBudgetSystem.ts         # reconcile: the live Highlight set, pushed before applySet when it changes (§1.3);
│                                #   stopAudioBudget pushes the empty set
└── audioBudgetSystem.test.ts
src/engine/
├── AudioEngine.ts               # setHighlightedRobots; the one bus-gain target (§1.2) used by reserveVoice,
│                                #   reReserveVoice and updateRobotMasterVolume; the ramp on a set change;
│                                #   the anyHighlight block in scheduleNote deleted
├── AudioEngine.test.ts
└── audioEngine/headroom.ts      # HIGHLIGHT_DIP_GAIN beside HEADROOM_TRIM_GAIN, if the plan puts it here
src/components/panels/screen/screens/
├── useRobotMeta.ts              # status = the mode word; plus mode key and lit (§1.5)
├── ModeLight.tsx / .css         # the small light (§7.1 B2)
├── RobotScreen.tsx              # META_FIELDS: status first; the light inline in the Status well and before the band's line
├── RobotScreen.css              # the well's inline light
├── RosterTile.tsx               # the light before the status line
├── RosterTile.css               # desk: two-line clamp and two-line min-height (§1.6)
├── RosterTile.test.tsx, RosterBoard.test.tsx, RobotScreen.test.tsx
src/components/panels/screen/worldView/
├── MetaBox.tsx                  # useEmittingCount through isRobotEmitting
└── MetaBox.test.tsx
src/data/
├── robotSelectionConfig.ts      # MODE_LABELS = optionsRecord('probe.monitorMode'); AUDIBILITY_LABELS goes
└── robotSelectionConfig.test.ts
src/content/copy/probe.ts        # probe.status loses its three options; the two statusLine templates reordered
src/utils/statusLightColors.ts   # 'yellow' and 'blue' states (§7.1 B1)

docs/AUDIO_SYSTEM.md             # the audioMode policy item (~line 575): the dip, when a Highlight is live, the rank;
                                 #   the budget paragraph's "solo excepted" becomes Solo then Highlight
docs/POLYPHONY_GUIDE.md          # line 27: scheduleNote no longer applies anything for Highlight
docs/ROBOT_LIFECYCLE.md          # rule 6: "Off" is "Auto"; a Highlight counts only while heard
docs/ROBOT_DESIGN.md             # one line if the plan finds it names the status field; otherwise untouched
docs/COMPONENT_LIBRARY.md        # only if ModeLight joins the library (§7.1 B2)
docs/todo/backlog.md, docs/todo/plan.md   # entry 81 and its line; archive after the merge
docs/specs/MONITOR_MODE_TRUSTWORTHY.md    # an "As built" section
```

`robotAudibility.ts`'s `isRobotAudible`, `isDockMuted` and `isRobotSounding` are untouched. `standingBy.ts`,
`robotSystems.ts`, `spawnSystem.ts`, the editor (`AudioSettingSection.tsx`, `robotOptionsActions.ts`,
`useCompanyOptions.ts`) and every world-view component are untouched.

---

## 3. Implementation Boundaries & Constraints

**Always**
- RED first for every behaviour, one commit per task, the suite green at each (Crawford's TDD rule). Each rule in
  §1.2–§1.6 that a test can reach is a test that fails on today's code.
- The dip is a bus-gain write through `rampOrSet`, in `AudioEngine.ts`, from state the budget system pushes; the
  engine never reads the store to decide it, and nothing about a Highlight is decided in a GSAP callback or a timer.
- The live set and the dip state are engine module state; the mode key and `lit` are derived in `useRobotMeta` from
  the stores through boolean-typed selectors. Nothing new in Zustand.
- Every word on screen comes from `src/content/` (`probe.monitorMode`, `probe.status`, the two templates); the
  light's colours come from `statusLightColors.ts` and `colorTheme.json`, never a literal in a component.
- Run the focused tests per task, then the full suite, `build:types`, `lint` and `build` at each checkpoint.

**Ask first**
- Any change to `isRobotAudible`'s rule or where it is enforced.
- Making `ModeLight` one of the Design System's primitives in `src/components/ui/controls/` (COMPONENT_LIBRARY.md
  lists thirteen) rather than a local component (§7.1 B2).
- Adding a colour family to `colorTheme.json` for the blue (§7.1 B1), or changing an existing family.
- A dip that is not a plain multiplier (a filter, a send change, a per-robot amount).
- Touching the world view for any mode.

**Never**
- A velocity multiply for Highlight, in `scheduleNote` or anywhere.
- Writing `audioMode` from the engine, the budget or the lifecycle: it stays the user's.
- `setTimeout`, `setInterval`, `requestAnimationFrame` or `queueMicrotask` anywhere in this work.
- A file-text test (source, doc or CSS read as text). The templates' order and the two-line CSS get a look in the
  browser, named on the task's Proof line; a task with no behaviour (a doc, the record) has no RED test.
- A "keep existing sound" or compatibility clause in any doc (pre-v1 rule).
- A second status vocabulary beside the four mode words.

---

## 4. Code Style & Architecture Conventions

The engine's one bus-gain target, as it would read in `AudioEngine.ts` (names provisional; the plan pins them):

```typescript
/** The robots whose Highlight is live (§1.3), pushed by audioBudgetSystem. Module state; empty = no dip. */
let highlightedLive: ReadonlySet<string> = new Set();

/** A robot's bus gain for its Volume, dipped while a Highlight it does not own is live (§1.2). */
function busGainTarget(robotId: string, masterVolume: number): number {
  const dipped = highlightedLive.size > 0 && !highlightedLive.has(robotId);
  return robotBusGain(masterVolume) * (dipped ? HIGHLIGHT_DIP_GAIN : 1);
}

// In the public object:
/** The live Highlight set (§1.3). Every reserved voice's bus gain ramps to its new target over
 *  HIGHLIGHT_RAMP_SECONDS; re-sending the same set does nothing. */
setHighlightedRobots(ids: Iterable<string>): void {
  const next = new Set(ids);
  if (sameSet(next, highlightedLive)) return;
  highlightedLive = next;
  for (const [robotId, entry] of compositeVoices) {
    const volume = findActiveRobot(robotId)?.masterVolume ?? 1;
    rampOrSet(entry.busGain.gain as unknown as RampableParam, busGainTarget(robotId, volume), HIGHLIGHT_RAMP_SECONDS);
  }
},
```

And the field, as `useRobotMeta` would return it:

```typescript
export interface RobotMeta extends Record<RobotMetaField, string> {
  /** The robot's own audioMode, for the light's colour (§1.5). */
  mode: NonNullable<Robot['audioMode']>;
  /** Lit when the robot is sounding right now; dim for any silence. */
  lit: boolean;
}
```

- Names follow the neighbours': `setHighlightedRobots` beside `setSoundingRobots` / `setStandingByRobots`;
  `HIGHLIGHT_DIP_GAIN` beside `HEADROOM_TRIM_GAIN`; `HIGHLIGHT_RAMP_SECONDS` beside `VOLUME_RAMP_SECONDS`;
  `MODE_LABELS` where `AUDIBILITY_LABELS` was; `isRobotEmitting` beside `isRobotAudible`.
- `reconcileSounding`'s rank is one small helper (`rank(id)`) and `lastIndexWhere` with a predicate per rank, not a
  second algorithm; the doc comment restates §1.4's five steps.
- `ModeLight` is stateless and takes `mode` and `lit`; its colours resolve through `getStatusLightColor`, its lit glow
  is the same `box-shadow` idiom the rocker's light uses, and its dim state is the same colour at low alpha with no
  glow. Its size is one em-relative unit so it sits in the well's value line and the tile's label line alike.
- Comments as dense as the modules': each new function's doc comment names the spec section it implements.
- Headless-safe: `setHighlightedRobots` on a voice with a stub gain goes through `rampOrSet`'s set path, as Volume
  does.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; Vitest, the existing Tone mocks)

**Part A**

- `audioBudget.test.ts`, `reconcileSounding` with a highlighted subset: a Highlight with a free slot is admitted; with
  none it evicts the newest Auto; it never evicts a Solo or another Highlight and waits when only those are in; a Solo
  evicts the newest Auto first and the newest Highlight when no Auto is in; a lowered cap evicts newest Auto, then
  newest Highlight, then newest Solo; an un-highlighted robot keeps its slot; `previous` is returned by reference when
  nothing changed. The existing solo cases still pass unchanged.
- `audioBudgetSystem.test.ts`: a highlighted robot in the sounding set is pushed to `setHighlightedRobots`; one in its
  station, under a Solo, or standing by is not; the push happens before `setSoundingRobots` on the same reconcile (call
  order on the mocked engine); re-sending the same set does not call again; `stopAudioBudget` pushes the empty set;
  a Light-tier roster with a highlighted robot standing by admits it and pushes it.
- `AudioEngine.test.ts`: with a live Highlight, `updateRobotMasterVolume` on another robot ramps to its Volume's gain
  times the dip, and on the highlighted robot to its Volume's gain alone; `setHighlightedRobots` ramps every reserved
  voice to its new target and back on the empty set; a voice reserved or re-reserved while a Highlight is live is
  built at the dipped gain; `scheduleNote` passes the same velocity to `triggerWithCap` whether or not a Highlight is
  live (the halving is gone).
- `robotAudibility.test.ts`: `isRobotEmitting` is `isRobotAudible && isSounding`; `getAudibilityState` and
  `AudibilityState` are no longer exported (a type-level check, not a source scan).

**Part B**

- `RosterTile.test.tsx` / `RosterBoard.test.tsx`: the line begins with the mode word and reads `Auto · <job> · <docking>
  · <activity>`; a muted robot's reads `Mute · …`; a robot silenced by another's Solo still reads `Auto`; the light
  carries the mode and lit / dim as data attributes (`data-mode`, `data-lit`), lit for a sounding robot, dim for one
  in its station, under a Solo, standing by, or muted.
- `RobotScreen.test.tsx`: the Status well is the first well; its value is the mode word with the light before it; the
  phone band's line leads with the mode word.
- `MetaBox.test.tsx`: the Deck's count is unchanged for the same rosters (emitting = audible and sounding).
- `robotSelectionConfig.test.ts`: `MODE_LABELS` carries the four `probe.monitorMode` options; `AUDIBILITY_LABELS` is
  gone.
- `content.test.ts` stays green: `probe.status` keeps its label and loses its options; no orphan key.

### 5.2 Checks

`npm run build:types`, `npm run lint`, `npm test`, `npm run build` green at each task and at the two checkpoints.

### 5.3 Runs (the proof; not tests)

- **The dip, by ear** (desk, headphones): Highlight one robot on a Full tier; the others drop and the robot stands
  clear; set it back to Auto; the drop releases without a step. Then Highlight a robot in its station: nothing
  changes. Then Solo one robot and Highlight another: nothing changes until the Solo is lifted.
- **The rank, on a Light tier** (`?load=` at the lowest): Highlight a robot standing by; its tile's light comes on and
  the newest Auto robot's goes dim.
- **The look**: the roster on the desk at 768 px and wide; every tile the same height, the line one or two lines, the
  light before the word, the colours right; the phone shell at 320 px, one line, the mode never cut; the robot
  screen's Status well first, the light inline; the phone band leading with the mode.

### 5.4 Gate: Crawford's ear and eye (stop)

After Part A is built: Crawford listens to §5.3's first run and names the dip amount and ramp he hears (§7.1 A1, A2
are defaults, re-pinned here). After Part B: he looks at §5.3's third run and names the light's size, the blue
(§7.1 B1) and the dim level. Both are gates in the plan: the build stops and reports.

### 5.5 Done when

- Every test in §5.1 is written RED and passes; the suite, types, lint and build are green.
- §5.3's runs are done and §5.4's gate has passed.
- AUDIO_SYSTEM.md, POLYPHONY_GUIDE.md and ROBOT_LIFECYCLE.md read as the code is (§2); this spec has its "As built"
  section; backlog 81 is archived and its plan.md line deleted.

---

## 6. Git & Workflow Context

- One branch for both parts unless Crawford splits them at the gate: `feature/monitor-mode-trustworthy` from `main`.
  Part A's tasks first, then Part B's; the §5.4 gates sit between and after.
- Commit per task, RED test in the same commit as its GREEN, message in the repo's voice (`feat(audio): the Highlight
  dip is a bus gain (Task 3)`), ending with the attribution line the session carries.
- Crawford opens and merges the PR; the PR body links this spec's sections.
- The intent file stays; this spec and the plan (`docs/tasks/MONITOR_MODE_TRUSTWORTHY.md`) are committed before the
  first task.

---

## 7. Assumptions and Open Questions

### 7.1 Assumptions (defaults the plan builds on; each re-pinned at a gate)

- **A1. The dip is −10 dB:** `HIGHLIGHT_DIP_GAIN = 10 ** (-10 / 20)` (≈ 0.316). Crawford's word was "about 10 dB";
  the ear gate names the number.
- **A2. The ramp is 150 ms** (`HIGHLIGHT_RAMP_SECONDS = 0.15`), longer than Volume's 50 ms: twelve voices moving at
  once is a scene change, not a slider edit, and a slower glide reads as a mix move. The ear gate names it.
- **A3. The dip applies to every voice that is not a live Highlight**, sounding or not: a standing-by robot has no
  voice, a silenced one triggers nothing, so dipping a voice nobody hears costs nothing and keeps the rule one line.
- **A4. The live set is computed in `audioBudgetSystem`**, not in the engine from the store: the system already owns
  the sounding set and the signature, and the engine stays store-blind for this as for standing by.
- **A5. `reconcileSounding` takes the highlighted ids as a fourth array** (`previous, eligible, soloIds, highlightIds,
  cap`) rather than a rank map; the three-way rank is derived inside. The plan may choose the map if the arrays read
  worse.
- **B1. The colours come from `colorTheme.json`'s existing families:** green = `indicator` (as the rocker's on),
  red = `alert` (as the rocker's off), yellow = `wire` (h 48, the app's yellow), blue = `glass` (h 192, the lit
  porthole and floodlight colour: the app's "blue", a cyan). `statusLightColors.ts` gains `'yellow'` and `'blue'`.
  If Crawford wants a truer blue, a new family is an ask-first.
- **B2. `ModeLight` is a local component** in `src/components/panels/screen/screens/`, not a Design System primitive:
  it has three consumers, all in that folder's screens, and no schema. It joins the library if a fourth consumer
  outside the screens appears.
- **B3. The dim light is the same colour at about 30 % alpha with no glow**, not grey: the mode stays readable in the
  colour even when silent. The eye gate names the level.
- **B4. The desk tile reserves two lines always** (a two-line `min-height`), rather than growing per tile: equal
  heights with no measurement, and no reflow when a word changes.
- **B5. The phone band keeps one line** with the mode leading, the same template rule as the tile.

### 7.2 Open questions

- **Q1. The number and the stage.** Backlog 81, and the plan.md line: Stage 3 (audio refinement, where the sound
  belongs) or Stage 5 (UX refinement, where the cards belong). Default if unanswered: one entry, Stage 3, named for
  both parts.
- **Q2. The muted robot's light.** The interview's restate said "a user-muted robot is always a bright red Mute", and
  the lit/dim rule says the light is dim whenever the robot is not sounding, which a muted robot never is. The two
  cannot both hold. Default: **the rule wins** — Mute is a red light, dim, since the robot is silent — because a bright
  light on a silent robot would be the one exception to "bright means you can hear it". Crawford may prefer the
  restate's bright red as a warning; the eye gate decides.
- **Q3. Solo-silenced robots' voices under a Highlight.** Today a solo-silenced robot keeps its voice (an un-solo
  would rebuild eleven at once). With a Solo live there is no live Highlight (§1.3), so the dip never meets this case
  today; it is noted so the plan does not add one.
- **Q4. The Deck's count under a Highlight.** The `WorldLine` counts sounding robots; a dipped robot is still
  sounding and still counts. Correct as specified; flagged in case Crawford expected "1 of 12" while a Highlight
  is live.
