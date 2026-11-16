# Phase Spec: Help Popover Links — "View Reverb settings" from a send, "View LFO settings" from a lane

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/components/panels/screen/nav src/components/ui/controls/HelpPopover.test.tsx src/components/ui/controls/LfoLink.test.tsx src/components/panels/screen/console/AudioRigEffectPanel.test.tsx src/components/robot/LevelsSections.test.tsx src/components/panels/screen/screens/FleetParamsScreen.test.tsx src/content/content.test.ts`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

**Status:** spec written 2026-11-16 from the confirmed intent
[docs/intent/help-popover-links.md](../intent/help-popover-links.md) (`interview-me`, 2026-11-16, six questions; five
guesses confirmed, the link's words rewritten by Crawford). Backlog
[77](../todo/backlog.md#77-help-popovers-a-link-from-a-send-to-its-effect), plan.md Stage 5. Planned in
[tasks/HELP_POPOVER_LINKS.md](../tasks/HELP_POPOVER_LINKS.md). Q1 and Q2 answered 2026-11-16: the lane link reaches
`LfoLink` as a prop; focus lands on the open sub-tab. **Built 2026-11-16** (Tasks 1–9; Gate 1 and Checkpoint 2
passed, Crawford): §8 records what was built differently.

**Who it is for:** the player reading a control's help who does not yet know the control feeds a shared effect, on the
desk shell and the phone shell.

**The finding:** the five sends' help names "the shared Reverb" (and Delay, Color, Shifter, Chorus) and the LFO lane
picker's help names "the four shared LFO lanes", but nothing on screen takes the player there. Backlog 75's trail
(merged PR #651) gives a jump a Back to return by, except inside Fleet Params, where a tab change is not a step.

---

## 0. Scope check

One capability: a help popover may carry a link, and a press on it is a navigation. The six links, the step rule and
the arrival focus are parts of that one behaviour and are not useful apart, so there is no capability map.

---

## 1. Overview & Claude Explanation

A control's help can carry a **link**: a name and a `go` function. `HelpPopover` draws it as "View {name} settings" at
the foot of the well and, on a press, closes and calls `go`. The popover knows nothing about navigation; `go` is handed
to it, as `onChange` is handed to a slider. Every `go` ends in one new `navActions` call that opens Fleet Params on a
tab and sub-tab **as a step on the trail**, even when the player is already on Fleet Params.

### 1.1 Today

- **Help's path.** A content entry's `help` (`ContentHelp`, `src/content/types.ts`: `human`, `lore?`, words only) is
  spread into a schema by `labels()`. Twelve primitives pass `schema.help` to `DualLabel`, which renders
  `HelpPopover` (`src/components/ui/controls/`). `HelpPopover` and `DualLabel` are `memo`'d on that stable object.
  `HelpPopover` is a modal Radix Popover, portalled into `ScreenViewport`, that hands focus back to its "?" on close.
- **The sends.** `ROBOT_SEND_SCHEMAS` (`src/data/robotOptionsConfig.ts`) is built from `ROBOT_SENDS`
  (`src/data/robotSends.ts`), one row per send. `SendRow` in `src/components/robot/LevelsSections.tsx` renders each
  as a `SliderLinear`. `LevelsSendsSection` is shared by the robot screen (`RobotScreen.tsx`) and the company and All
  Probes screens (`CompanyOptionsSection.tsx`).
- **The lane picker.** `LfoLink` (`src/components/ui/controls/LfoLink.tsx`) builds its lane row's schema inside
  itself, with `labels('ui.lfoLane')`, so the lane row's "?" shows `ui.lfoLane`'s help. Its lane is `value.lane`
  (`'a'`–`'d'`, or `null` for Off). Three components render it: `AudioRigDrawer.tsx` (Fleet Params' effects),
  `BusFilterDrawer.tsx` and `SignatureArrayDrawer.tsx` (twice: a layer's gain and detune). The robot and company
  screens reach it through the two robot drawers; `TempoSyncSlider` does not render it (the intent's list named every
  file that mentions it).
- **The Color Mixes.** `useAudioStore.getState().globalAudio.distortion.wet`, `.chebyshev.wet`, `.bitCrusher.wet`,
  each 0–1, default 0 (`src/types/globalAudio.ts`). The Color tab's sub-tabs run in chain order: `distortion`,
  `chebyshev`, `bitCrusher` (`FLEET_PARAMS_SUBSECTIONS.colour`, `navActions.ts`).
- **The trail.** `recordStep(destination)` in `navActions.ts` appends the screen being left unless the destination's
  screen key equals the current one. Fleet Params is one key (`fleetParams`) whatever its tabs, so a move between its
  tabs is never a step. `back()` restores a stop's four tab fields after the clean slate, so a Fleet Params stop already
  comes back on its tab and sub-tab.
- **Nothing opens Fleet Params on a tab as a step.** `selectBranch('fleetParams')` records a step but lands on the
  default tab; `setFleetParamsSection` / `setFleetParamsSubsection` move tabs with no step.
- **Focus after a jump.** The "?" leaves with its screen (or its sub-tab: Fleet Params mounts one sub-tab at a time), so
  focus drops to `<body>`. `useRescueLostFocus` then puts it on the nav rail (desk) or the menu toggle (phone), not on
  the page arrived at.

### 1.2 The link

- `HelpLink` is `{ name: string; go: () => void }`. A schema's `help` widens from `ContentHelp` to `ControlHelp`,
  `ContentHelp & { link?: HelpLink }`. The twelve `DualLabel` call sites are unchanged: they already pass
  `schema.help` through.
- `ContentHelp` stays words only. A link is added to a schema by the screen-side code that builds it (§1.4), never by
  a content entry.
- `HelpPopover` with `help.link` draws, after the lore block, one `<button>` whose text and accessible name are
  `fill('ui.help.link', { name })`: "View Reverb settings". A press closes the popover, stops Radix handing focus back
  to the "?", and calls `go()` once.
- Without `help.link` the popover is as today.

### 1.3 The jump

- A new `navActions` call, `openFleetParamsAt(section, subsection)` (name provisional), opens Fleet Params on that tab
  and sub-tab.
- **It records a step even on Fleet Params.** The stop appended is the current screen with its four tab fields, as
  every step is. So a jump from a robot's Levels › Sends returns there on Back, and a jump from Fleet Params' Delay to
  the LFOs tab returns to Delay.
- **No step when nothing changes.** If Fleet Params is already showing that tab and sub-tab, the call does nothing.
- Ordinary tab presses still record nothing. `setFleetParamsSection` and `setFleetParamsSubsection` are untouched.
- Like every action it starts from the clean slate, so the phone's nav sheet shuts.

### 1.4 The six links

| Control | Name (content entry) | Opens |
| --- | --- | --- |
| Reverb send | Reverb (`fleet.reverb`) | Time & Space › Reverb |
| Delay send | Delay (`fleet.delay`) | Time & Space › Delay |
| Grit send | Color (`fleet.colour`) | Color › the first of Distortion, Chebyshev, Bit Crusher whose stored Mix is above 0; Distortion when none is |
| Shimmer send | Shifter (`fleet.frequencyShifter`) | Modulation › Shifter |
| Double send | Chorus (`fleet.chorus`) | Modulation › Chorus |
| LFO lane picker | LFO (new entry, §1.6) | LFOs › the picked lane; Core LFO (lane A) when the lane is Off |

- **Destinations are worked out at the press.** Grit's `go` reads the three Mixes from `useAudioStore.getState()`
  when pressed; the lane picker's `go` reads the lane the control holds when pressed. The words never change.
- **One module builds them**, `src/components/panels/screen/nav/helpLinks.ts` (new): a record of the five sends'
  destinations keyed by `RobotSendField`, so a sixth send fails to compile until it has one; the Grit and lane
  resolvers; and the five send schemas with their links, built once at module load. `SendRow` reads its schema from
  there in place of `ROBOT_SEND_SCHEMAS`. The send table and the data configs stay free of navigation.
- **The lane picker is handed its navigation.** `LfoLink` takes a new required prop, `onOpenLane(lane)`, and adds the
  link to its lane schema inside its existing `useMemo`: the name from content, and a `go` that calls `onOpenLane` with
  the lane read through its `latest` ref, so the schema stays stable per control. The three drawers pass
  `openLfoLaneSettings` from `helpLinks.ts`; being required, the prop cannot be left off a new render site (A1, Q1).
- **A held-off send** (its room held dark by the Audio Load dial, the row dimmed) keeps its "?" and its link.

### 1.5 Arrival

- Fleet Params shows the tab and sub-tab, as a press on them would. No glow, no highlight, no scroll beyond what a tab
  change does.
- **Focus lands on the open sub-tab's trigger** (the sub-tab row's `[role="tab"][aria-selected="true"]`), so a keyboard
  player can arrow across the sub-tabs or Tab into the effect. The jump asks for it; Fleet Params focuses it after the
  commit that mounts the sub-tab (A3). Only a help jump moves focus: a Back, a breadcrumb press or a tab press does
  not.

### 1.6 Content

- `ui.help.link`: `{ human: 'View settings', template: 'View {name} settings' }` (the `ui.help` shape).
- The LFO link's name: a new entry whose `human` is "LFO". The LFOs tab's own name (`fleet.lfoBank`) is "LFOs", and
  Crawford's words are "View LFO settings" (A4).
- The five send links reuse their destinations' entries (§1.4). No lore line: the link is plain words.

### 1.7 What does not change

- The help text of every control, and every popover without a link.
- The trail's shape (`NavStop`), its cap, Back, Close and the browser's Back.
- `ROBOT_SENDS`, `ROBOT_SEND_SCHEMAS` and every data config.
- Fleet Params' screens and panels, apart from the focus on arrival.

---

## 2. Target File Structure

```text
src/types/controls.ts                       # HelpLink, ControlHelp; the schema's help field (line 24) widens to ControlHelp
src/content/copy/ui.ts                      # ui.help.link; the LFO link's name
src/components/ui/controls/
├── HelpPopover.tsx / .css                  # the link button at the foot of the well
├── HelpPopover.test.tsx
├── LfoLink.tsx                             # onOpenLane (required); the lane row's link
└── LfoLink.test.tsx
src/components/robot/BusFilterDrawer.tsx, SignatureArrayDrawer.tsx   # pass openLfoLaneSettings
src/components/panels/screen/console/AudioRigDrawer.tsx / .test.tsx  # passes openLfoLaneSettings
src/components/panels/screen/nav/
├── navActions.ts                           # openFleetParamsAt: a step even on Fleet Params; the arrival-focus request
├── navActions.test.ts
├── helpLinks.ts                            # new: the send destinations, the Grit and lane resolvers, the linked send schemas
└── helpLinks.test.ts                       # new
src/components/robot/
├── LevelsSections.tsx                      # SendRow reads the linked schema
└── LevelsSections.test.tsx
src/components/panels/screen/screens/
├── FleetParamsScreen.tsx                   # focuses the open sub-tab after a help jump
└── FleetParamsScreen.test.tsx

docs/COMPONENT_LIBRARY.md                   # HelpPopover's link, DualLabel's help, LfoLink's lane link
docs/UI_SHELL.md                            # navActions: the help jump as a step inside Fleet Params
docs/todo/backlog.md, docs/todo/plan.md     # entry 77 and its line; archive after the merge
docs/specs/HELP_POPOVER_LINKS.md            # an "As built" section
```

`DualLabel.tsx` and the other eleven primitives that pass `schema.help` are untouched. `robotSends.ts`,
`robotOptionsConfig.ts` and `uiStore.ts`'s trail are untouched, unless A3's focus request lands in `uiStore` (a plan
decision).

---

## 3. Implementation Boundaries & Constraints

**Always**
- RED first for every behaviour, one commit per task, the suite green at each (Crawford's TDD rule).
- Every navigation a link makes goes through `openFleetParamsAt` in `navActions.ts`. No component sets Fleet Params'
  tabs for a link itself.
- `HelpPopover`, `DualLabel` and `LfoLink` import nothing from navigation or a store: a link, or the lane's
  navigation, is a value they are handed.
- A link's schema is built once (module load, or the primitive's existing `useMemo`), so the `memo` boundaries hold.
- The trail stays plain data. `HelpLink` holds a function and so never enters `uiStore`.
- Words come from `src/content/`; the link's look reuses the popover's tokens, with a touch target no smaller than
  `--touch-target-size` on the phone shell.
- Run the focused tests per task, then the full suite, `build:types`, `lint` and `build` at each checkpoint.

**Ask first**
- A link on any control other than the six in §1.4.
- A highlight, glow or scroll-to on arrival.
- A column on `ROBOT_SENDS` in place of `helpLinks.ts`'s record (A2).
- Putting the link's destination in a content entry.
- Moving focus after anything other than a help jump.

**Never**
- `setTimeout`, `setInterval`, `requestAnimationFrame` or `queueMicrotask` to wait for the arrived page before
  focusing; the focus runs in a layout effect after the commit.
- A second trail, or a step recorded outside `navActions.ts`.
- A file-text test. The link's look is a look in the browser, on the task's Proof line.
- A "keep existing behaviour" clause in any doc (pre-v1 rule).

---

## 4. Code Style & Architecture Conventions

The link's types, as they would read in `src/types/controls.ts` (names provisional; the plan pins them):

```typescript
/** A help popover's way to the effect a control feeds (docs/specs/HELP_POPOVER_LINKS.md §1.2): the name the link reads
 *  ("View {name} settings") and the navigation a press runs. Built by screen-side code; never stored. */
export interface HelpLink {
  name: string;
  go: () => void;
}

/** A schema's help: the content entry's words, plus the link a screen added. */
export type ControlHelp = ContentHelp & { link?: HelpLink };
```

The jump, as it would read in `navActions.ts`:

```typescript
/** A help link's jump (spec §1.3): Fleet Params on this tab and sub-tab, recorded as a step even from Fleet Params
 *  itself, so Back returns to the tab the link was pressed on. Showing it already, it changes nothing. */
export function openFleetParamsAt(section: FleetParamsGroup, subsection: SelectedFleetParamsEffect): void {
  const s = useUIStore.getState();
  const here = s.activeHubTile === 'audioRig' && s.fleetParamsSection === section
    && activeFleetParamsSubsection(section, s.fleetParamsSubsection) === subsection;
  if (here) return;
  appendStop(currentStop(s)); // recordStep's append and cap, without its same-screen skip
  cleanSlate();
  open('fleetParams');
  s.setFleetParamsSection(section);
  s.setFleetParamsSubsection(subsection);
  requestArrivalFocus(); // A3
}
```

Grit's resolver, as it would read in `helpLinks.ts`:

```typescript
/** Grit's destination (spec §1.4): the first Color effect, in chain order, whose stored Mix is above 0; Distortion when
 *  none is, so the link always lands somewhere. Read at the press. */
export function colourRoomSubTab(globalAudio: Pick<GlobalAudioSettings, ColourEffectKey>): ColourEffectKey {
  return COLOUR_CHAIN.find((key) => globalAudio[key].wet > 0) ?? COLOUR_CHAIN[0];
}
```

- `COLOUR_CHAIN` reads `FLEET_PARAMS_SUBSECTIONS.colour`'s order, so the chain is named once.
- Names follow the neighbours': `openFleetParamsAt` beside `selectBranch` and `selectEntity`; `helpLinks.ts` beside
  `navActions.ts`.
- Comments as dense as the module's: each new function's doc comment names the spec section it implements.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; Vitest, Testing Library)

Fixtures use non-default values (a robot screen on a non-default section, Fleet Params on a non-default tab, Mixes off
their 0 default), so a test cannot pass by landing on a default.

- `navActions.test.ts`, `openFleetParamsAt`:
  - from a robot on Levels › Sends: Fleet Params shows the tab and sub-tab; the trail gains one stop, the robot with its
    tabs; `back()` returns to it;
  - from Fleet Params on Time & Space › Delay to LFOs › Accent LFO: the trail gains one stop, Fleet Params on Delay;
    `back()` shows Delay;
  - already on that tab and sub-tab: no stop, no state change;
  - it shuts the phone's nav sheet;
  - `setFleetParamsSection` / `setFleetParamsSubsection` still add no stop (the existing case stays green).
- `helpLinks.test.ts`:
  - each send's link: its name is its destination entry's `human`, and `go()` lands Fleet Params on the §1.4 tab and
    sub-tab;
  - Grit: only Chebyshev above 0 opens Chebyshev; only Bit Crusher opens Bit Crusher; Distortion and Bit Crusher both
    above 0 opens Distortion; all three at 0 opens Distortion; the Mix is read at the press, not at module load (set it
    after import, then press);
  - the lane resolver: `'c'` opens Accent LFO; `null` opens Core LFO.
- `HelpPopover.test.tsx`:
  - with `help.link`, the open popover has a button named "View Reverb settings" (built with `fill`, not a literal);
  - a press calls `go` once and closes the popover;
  - without a link there is no button.
- `LevelsSections.test.tsx`: each of the five send rows' "?" opens a popover with its link, by name; a press on
  Double's lands Fleet Params on Modulation › Chorus (asserted on the store).
- `LfoLink.test.tsx`: the lane row's "?" has "View LFO settings"; with lane `'b'` a press calls `onOpenLane('b')`; with
  the lane Off, `onOpenLane(null)`; a lane change after mount is the one the press passes; the control's own label row
  (its `schema.help`) gets no link.
- `AudioRigDrawer.test.tsx`: a Fleet Params effect's lane link on lane C lands on LFOs › Accent LFO.
- `helpLinks.test.ts`, `openLfoLaneSettings`: `'c'` opens Accent LFO, `null` opens Core LFO.
- `FleetParamsScreen.test.tsx`: after a help jump the open sub-tab's trigger has focus; after `back()`, a breadcrumb
  press or a tab press, focus does not move.

### 5.2 Checks

`npm run build:types`, `npm run lint`, `npm test`, `npm run build` green at each task and at each checkpoint.

### 5.3 Runs (the proof; not tests)

- **The links, by hand** (desk and phone shell): from a robot's Levels › Sends, each send's "?" → link → the right tab
  and sub-tab → Back returns to Levels › Sends. The same from a company and from All Probes.
- **Grit**: Color Mixes all 0 → Distortion; Chebyshev's Mix up → Chebyshev.
- **The lane picker**: on a robot (lane B) → Companion LFO → Back; on Fleet Params' Delay (lane Off) → Core LFO → Back
  lands on Delay.
- **Keyboard**: open a "?" with the keyboard, Tab to the link, Enter: focus is on the sub-tab, and the arrow keys move
  across the sub-tabs.
- **The look**: the link in the well at 320 px, 768 px and wide; a held-off send's link.

### 5.4 Gates (stop and report)

- **Gate 1, after the popover task: Crawford's look** at the link in the well (its place under the lore, its weight
  against the description, the phone's touch size). No sketch first: it is one line of plain text in an existing well.

### 5.5 Done when

- Every test in §5.1 is written RED and passes; the suite, types, lint and build are green.
- Gate 1 has passed and §5.3's runs are done.
- COMPONENT_LIBRARY.md and UI_SHELL.md read as the code is; this spec has its "As built" section; backlog 77 is
  archived and its plan.md line deleted.

---

## 6. Git & Workflow Context

- This spec and the plan (`docs/tasks/HELP_POPOVER_LINKS.md`, the repo's place for plans rather than the skill's
  default `tasks/plan.md`) are committed on `docs/backlog-77-intent` beside the intent, before the first task.
- One feature branch, `feature/help-popover-links` from `main`.
- Commit per task, the RED test in the same commit as its GREEN, message in the repo's voice
  (`feat(nav): a help link opens Fleet Params as a step (Task 2)`), ending with the session's attribution line.
- Crawford opens and merges the PR.

---

## 7. Assumptions and Open Questions

### 7.1 Assumptions (defaults the plan builds on)

- **A1. `LfoLink` is handed the lane's navigation as a required prop** (Q1). It stays free of the nav layer like the
  other primitives; the three drawers that render it import `openLfoLaneSettings` and pass it.
- **A2. The send destinations live in `helpLinks.ts`**, a record keyed by `RobotSendField`, not as a column on
  `ROBOT_SENDS`. The record's type fails to compile for a sixth send, which is the table's own guarantee, and the send
  wiring table stays free of navigation.
- **A3. Arrival focus is a one-shot request** the jump makes and Fleet Params' sub-tab row takes in a layout effect
  after the commit that mounts it, as `RosterBoard` focuses a moved tile. The plan pins where the request is held (a
  plain flag in `uiStore`, or a module-level one-shot in `navActions.ts`); either way it holds no DOM node.
- **A4. The LFO link's name is a new entry, "LFO"**, so the words are "View LFO settings" as Crawford gave them, not
  "View LFOs settings" from the tab's name.
- **A5. Grit reads the stored Mix**, the value the Mix slider shows. A swell writes the store, so a swelling Mix counts
  at its current stored value; a global LFO moving a Mix in the engine does not count.
- **A6. The link is a `<button>`**, not an anchor: it runs an in-app action and has no URL.

### 7.2 Open questions

Answered 2026-11-16.

- **Q1. How the lane link reaches `LfoLink`.** **Answered: a prop** (Crawford), not an import from `nav/helpLinks.ts`.
  The render sites turned out to be three drawers, not six files (§1.1).
- **Q2. Focus on arrival (A3).** **Answered: the open sub-tab's trigger**, as written. The alternative was the sub-tab's
  panel (its first control), which skips the tabs but lands in the middle of a section.

---

## 8. As built (2026-11-16)

Built as §1–§4 describe, with the plan's choices: A3's request is a module-level one-shot in `navActions.ts`
(`takeArrivalFocus()`), A2's destinations a record in `nav/helpLinks.ts`, A4's name the entry `ui.lfoLane.settingsName`.
The names in §4 held: `openFleetParamsAt`, `HelpLink`, `ControlHelp`, `colourRoomSubTab`, `openLfoLaneSettings`,
`SEND_SCHEMAS_WITH_HELP_LINKS`. The RED tests found three things the spec and plan did not foresee:

- **The arrival focus's ref is on the sub-tab row's own wrapper**, a `display: contents` `div`
  (`.fleet-params-screen__sub-tabs`, one rule in `FleetParamsScreen.css`, so the layout is unchanged). On a jump to
  another section the row mounts with its section, and a ref on the section's `div` is not yet attached when the child's
  layout effect runs.
- **Only the open section's row takes the request.** Radix keeps the section being left mounted for one more commit,
  and its own open sub-tab can change with the store's (Delay to Reverb when `laneC` is stored); that row took the
  request, focused its trigger, and left the DOM, dropping focus to `<body>`.
- **A link press commits the close with `flushSync` before `go()`.** §1.2's "stops Radix handing focus back" was not
  enough where the "?" stays mounted: Radix removes the content a commit after the close, so its focus trap was still
  live when the arrived page focused itself and pulled focus back to the link, which then left the DOM. Where the "?"
  leaves with its screen (every link today) it worked either way. The `onCloseAutoFocus` prevent is kept, and cleared
  after, so a later Escape returns focus to the "?".

Smaller differences:

- **Every action's clean slate clears the arrival request**, so one set by a jump whose Fleet Params never mounted
  cannot fire on a later Back onto Fleet Params (§1.5's "only a help jump moves focus").
- **A send whose entry had no help would get no link** (no "?" to carry it); all five have help.
- **The drawer's test is in `AudioRigEffectPanel.test.tsx`**, where the `LfoLink`s are tested; `AudioRigDrawer.test.tsx`
  covers only the intensity drawer. The focused-tests command above is corrected.
- **`ui.lfoLane.settingsName` sat in the content guard's `AWAITING_CONSUMER`** for one commit (Task 7 to Task 8); the
  list is empty again.
- **Task 4's test assumed the audio store loads at its defaults**; a parallel run saw a Bit Crusher Mix above 0, so its
  cases now set the three Mixes first.
- **Built on `docs/backlog-77-intent`** beside the intent, spec and plan, not on a separate `feature/` branch (§6;
  Crawford, 2026-11-16: "the current branch is fine").

Gates and runs:

- **Gate 1** (the link's look): passed 2026-11-16, no change. Plain underlined text in the well's text colour, a 2 px
  accent focus ring, and on the phone shell a 44 px invisible press layer (measured in headless Chrome at 320, 768 and
  1280 px).
- **§5.3's runs**, in headless Chrome over CDP on a fresh dev server, desk 1280 px and phone 375 px: 42 of 42. **The
  lane run "on Fleet Params' Delay (lane Off)" cannot happen**: Delay has no lane picker (in Fleet Params only the EQ,
  LPF and HPF carry LFO targets, `audioRigConfig.ts`), so it ran from EQ & Filters › LPF with its first link set Off:
  Core LFO, and Back lands on LPF. The unit tests' Delay-to-LFOs cases call `openFleetParamsAt` directly and stand.
  Reviewed with Crawford 2026-11-16.
