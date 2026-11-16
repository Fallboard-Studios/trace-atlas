# Implementation Plan: Help Popover Links

Source spec: [docs/specs/HELP_POPOVER_LINKS.md](../specs/HELP_POPOVER_LINKS.md). Source intent:
[docs/intent/help-popover-links.md](../intent/help-popover-links.md). Backlog
[77](../todo/backlog.md#77-help-popovers-a-link-from-a-send-to-its-effect), plan.md Stage 5.

## Overview

A help popover can carry a link, "View {name} settings", that opens Fleet Params on the effect a control feeds, as a
step on backlog 75's trail. The work is in four groups. First the navigation: `openFleetParamsAt` in `navActions.ts`,
then the focus on arrival, both testable before any link exists. Then the popover: the `HelpLink` type and the link
button in `HelpPopover`. Then the links: `nav/helpLinks.ts` builds the five sends' links and `SendRow` uses them, which
puts real links on screen for the link's look (Gate 1); the lane link is built there too and `LfoLink` uses it. Docs
last, and the records after the merge.

## Architecture Decisions

- **The link rides on the schema's help** (spec §1.2). `ControlHelp = ContentHelp & { link?: HelpLink }` widens the
  schema's `help` field (`src/types/controls.ts:24`), `DualLabel`'s and `HelpPopover`'s prop. The twelve primitives
  that pass `schema.help` to `DualLabel` change nothing. `ContentHelp` stays words only.
- **One nav call, one step rule** (spec §1.3). `openFleetParamsAt(section, subsection)` appends the current stop
  without `recordStep`'s same-screen skip, and does nothing when Fleet Params already shows that tab and sub-tab.
  `recordStep`'s append-and-cap becomes a private `appendStop(stop)` both share, so the 50-stop cap stays in one place.
- **Resolves spec A3: the arrival-focus request is a module-level one-shot in `navActions.ts`**, not a `uiStore` field.
  `openFleetParamsAt` sets it; Fleet Params' sub-tab row takes it (`takeArrivalFocus()`, true once) in a layout effect
  keyed on the open sub-tab, and focuses its own active trigger. A store flag would re-render subscribers and need a
  clearing write; the one-shot holds a boolean, no DOM node, and is read only after the commit that mounts the
  sub-tab, as `RosterBoard` focuses a moved tile (`RosterBoard.tsx:128`).
- **The popover must not hand focus back on a link press.** Radix's focus scope returns focus to the "?" on close, and
  on unmount does it after a zero-delay timer. The link's press sets a ref that the popover's `onCloseAutoFocus` reads to
  `preventDefault()`. When the "?" has left the document (the usual case: its screen or sub-tab unmounted) Radix's
  late focus call on it is a no-op, so the sub-tab keeps focus; when it has not, the prevent stops it.
- **Resolves spec A2: send destinations are a `Record<RobotSendField, …>` in `nav/helpLinks.ts`**, and the linked send
  schemas are built there once at module load from `ROBOT_SEND_SCHEMAS`. `robotSends.ts` and `robotOptionsConfig.ts`
  are untouched.
- **Resolves spec Q1 (Crawford, 2026-11-16: props): `LfoLink` takes a required `onOpenLane(lane)` prop** and stays free
  of the nav layer. It adds the link to its lane schema inside the existing `useMemo`, with a `go` that calls
  `onOpenLane` through the `latest` ref. Only three components render it (`AudioRigDrawer`, `BusFilterDrawer`,
  `SignatureArrayDrawer`); each imports `openLfoLaneSettings` from `nav/helpLinks.ts` and passes it. A module function
  is stable, so no memo breaks, and a required prop means a fourth render site fails `build:types` until it passes one.
- **Resolves spec Q2 (Crawford, 2026-11-16: agreed): focus lands on the open sub-tab's trigger**
  (`.section-tabs--sub [role="tab"][aria-selected="true"]`).
- **Ordering.** The nav call and the focus come first: they carry the only trail change and the Radix risk, and they
  are testable alone. The popover's behaviour (Task 3) comes before the links; its look (Task 6, Gate 1) waits for the
  sends' real links (Tasks 4–5), so it is judged on the real screen, and comes before the lane slice (Tasks 7–8) so a
  change to the look lands before the second set of links.

## Dependency Graph

```
Task 1 (openFleetParamsAt: a step even on Fleet Params)
   │
   ├── Task 2 (arrival focus: the one-shot + Fleet Params' sub-tab row)
   │
   │        Task 3 (HelpLink type + the link button in HelpPopover + ui.help.link)
   │           │
   └─────┬─────┘
         │
Task 4 (helpLinks: the sends)
         │
Task 5 (SendRow reads them)
         │
Task 6 (the link's look — Gate 1)
         │
Task 7 (helpLinks: openLfoLaneSettings + the "LFO" name)
         │
Task 8 (LfoLink's required onOpenLane; the three drawers pass it)
         │
                 │
          Task 9 (docs)
                 │
          Task 10 (records, after the merge)
```

## Task List

### Phase 1: The jump

- [x] **Task 1: `navActions.ts` — `openFleetParamsAt`, a step even on Fleet Params**

  **Description:** Add `openFleetParamsAt(section: FleetParamsGroup, subsection: SelectedFleetParamsEffect)` to
  `src/components/panels/screen/nav/navActions.ts` (spec §1.3, §4). It returns at once when `activeHubTile` is
  `'audioRig'` and the shown section and sub-tab (`activeFleetParamsSubsection`) already match. Otherwise it appends
  `currentStop(s)`, runs `cleanSlate()`, opens Fleet Params and sets the section then the sub-tab. Factor
  `recordStep`'s append-and-cap into a private `appendStop(stop)` used by both. No caller yet; Tasks 4 and 7 add them.

  **Proof:** RED test — `navActions.test.ts`: `openFleetParamsAt` does not exist, so every case fails first.

  **Acceptance criteria:**
  - [ ] From a robot on a non-default section (Levels › Sends), Fleet Params shows the given tab and sub-tab, the trail
        gains one stop (that robot, on its tabs), and `back()` returns to it.
  - [ ] From Fleet Params on Time & Space › Delay to LFOs › Accent LFO (`'lfoBank'`, `'laneC'`), the trail gains one
        stop (Fleet Params on Delay) and `back()` shows Delay.
  - [ ] Already on that tab and sub-tab: no stop, no state change. It shuts the phone's nav sheet. The trail cap holds.
  - [ ] The existing cases stay green unmodified: `setFleetParamsSection` / `setFleetParamsSubsection` add no stop;
        `selectBranch`, `selectEntity`, `goHome` record as before.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/navActions.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/nav/navActions.ts`, `src/components/panels/screen/nav/navActions.test.ts`

  **Estimated scope:** S (one module and its test; the step helper is a move, not new logic)

- [x] **Task 2: arrival focus — the one-shot in `navActions.ts`, taken by Fleet Params' sub-tab row**

  **Description:** `openFleetParamsAt` sets a module-level arrival-focus flag after it changes the tabs (never on its
  no-op return). Export `takeArrivalFocus(): boolean`, which returns the flag and clears it. In
  `src/components/panels/screen/screens/FleetParamsScreen.tsx`, `SubTabs` gets a ref on its wrapper and a
  `useLayoutEffect` keyed on the open sub-tab: when `takeArrivalFocus()` is true it focuses its own
  `[role="tab"][aria-selected="true"]` (spec §1.5, Architecture Decisions). No timer of any kind.

  **Proof:** RED test — `FleetParamsScreen.test.tsx`: after `openFleetParamsAt` from a robot (rendered with the screen
  mounting), the open sub-tab's trigger is `document.activeElement`; it fails first because nothing focuses it.

  **Acceptance criteria:**
  - [ ] After `openFleetParamsAt('modulation', 'chorus')`, the Chorus sub-tab trigger has focus.
  - [ ] After `openFleetParamsAt` from Fleet Params' Delay to LFOs › Accent LFO, the Accent LFO trigger has focus.
  - [ ] A tab press, `setFleetParamsSection`, `selectBranch('fleetParams')` and `back()` onto a Fleet Params stop move
        no focus; `takeArrivalFocus()` is false after any of them and after the no-op case.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/FleetParamsScreen.test.tsx src/components/panels/screen/nav/navActions.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/nav/navActions.ts`, `src/components/panels/screen/screens/FleetParamsScreen.tsx`,
  `src/components/panels/screen/screens/FleetParamsScreen.test.tsx`

  **Estimated scope:** S (a flag, one layout effect, one test file)

### Checkpoint 1: The jump
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (note any pre-existing unrelated failures by name).
      2026-11-16: 360 files, 14,491 passed, 2 skipped, none failed; lint 4 pre-existing warnings (Scenery, gemShape).
- [x] `openFleetParamsAt` lands on its tab and sub-tab as a step, Back returns from it (including inside Fleet Params),
      and focus lands on the sub-tab, all without a caller in the UI yet.

---

### Phase 2: The popover

- [x] **Task 3: `HelpLink` and the link button in `HelpPopover`**

  **Description:** In `src/types/controls.ts` add `HelpLink { name: string; go: () => void }` and
  `ControlHelp = ContentHelp & { link?: HelpLink }`, and widen the schema's `help` field (line 24) to `ControlHelp`.
  Widen `help` on `DualLabel`'s and `HelpPopover`'s props the same way (type only in `DualLabel.tsx`). Add
  `'ui.help.link': { human: 'View settings', template: 'View {name} settings' }` to `src/content/copy/ui.ts`. In
  `HelpPopover.tsx`, with `help.link`, draw one `<button type="button" className="sc-help__link">` after the lore
  block, its text `fill('ui.help.link', { name })`. A press sets a `linkPressed` ref, closes the popover and calls
  `go()` once; `onCloseAutoFocus` calls `preventDefault()` when the ref is set, then clears it. No CSS in this task.

  **Proof:** RED test — `HelpPopover.test.tsx`: with a `help.link` the open popover has a button named by
  `fill('ui.help.link', …)`; it fails first because no button is drawn.

  **Acceptance criteria:**
  - [ ] With `help.link = { name: 'Reverb', go }`, the open popover has one button whose accessible name equals
        `fill('ui.help.link', { name: 'Reverb' })`.
  - [ ] A press calls `go` exactly once and closes the popover (the content leaves the DOM), and focus does not
        return to the "?".
  - [ ] Without a link there is no button, and a close by Escape still returns focus to the "?" (the existing case
        stays green).
  - [ ] `src/content/content.test.ts` passes with the new entry.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/HelpPopover.test.tsx src/components/ui/controls/DualLabel.test.tsx src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (runs in parallel with Tasks 1–2).

  **Files:** `src/types/controls.ts`, `src/components/ui/controls/DualLabel.tsx`, `src/components/ui/controls/HelpPopover.tsx`,
  `src/components/ui/controls/HelpPopover.test.tsx`, `src/content/copy/ui.ts`

  **Estimated scope:** M (five files, the logic in one)

---

### Phase 3: The links

- [x] **Task 4: `nav/helpLinks.ts` — the five sends' links and Grit's rule**

  **Description:** New `src/components/panels/screen/nav/helpLinks.ts` (spec §1.4, §4). A
  `Record<RobotSendField, …>` of destinations: Reverb → `timeSpace`/`reverb`, Delay → `timeSpace`/`delay`, Shimmer →
  `modulation`/`frequencyShifter`, Double → `modulation`/`chorus`, Grit → the Color room. Each link's `name` is its
  destination entry's `labels(...).humanLabel` (`fleet.reverb`, `fleet.delay`, `fleet.colour`,
  `fleet.frequencyShifter`, `fleet.chorus`). `colourRoomSubTab(globalAudio)` returns the first of
  `FLEET_PARAMS_SUBSECTIONS.colour`'s ids whose stored `wet` is above 0, else the first. Grit's `go` reads
  `useAudioStore.getState().globalAudio` at the press. Export `SEND_SCHEMAS_WITH_HELP_LINKS`, built once at module
  load: each `ROBOT_SEND_SCHEMAS[field]` with `help: { ...help, link }`.

  **Proof:** RED test — new `helpLinks.test.ts`: the module does not exist, so every case fails first.

  **Acceptance criteria:**
  - [ ] Each send's schema carries a link whose `name` is its destination entry's `human`, and whose `go()` lands Fleet
        Params on the §1.4 tab and sub-tab (asserted on `uiStore`).
  - [ ] Grit, with non-default Mixes set after import: only Chebyshev above 0 → `chebyshev`; only Bit Crusher →
        `bitCrusher`; Distortion and Bit Crusher both above 0 → `distortion`; all three at 0 → `distortion`.
  - [ ] Each linked schema is the same object on every read, and keeps the send's words and help text.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/helpLinks.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1 and 3.

  **Files:** `src/components/panels/screen/nav/helpLinks.ts`, `src/components/panels/screen/nav/helpLinks.test.ts`

  **Estimated scope:** S

- [x] **Task 5: `LevelsSections.tsx` — `SendRow` reads the linked schema**

  **Description:** `SendRow` in `src/components/robot/LevelsSections.tsx` passes
  `SEND_SCHEMAS_WITH_HELP_LINKS[spec.field]` to its `SliderLinear` in place of `ROBOT_SEND_SCHEMAS[spec.field]`. The
  robot screen and the company and All Probes screens (`CompanyOptionsSection.tsx`) all render `LevelsSendsSection`,
  so the one change covers the three.

  **Proof:** RED test — `LevelsSections.test.tsx`: open each send row's "?" and find its link by name; it fails first
  because the rows' schemas carry no link.

  **Acceptance criteria:**
  - [ ] Each of the five rows' popovers has its "View {name} settings" button, named by `fill`.
  - [ ] A press on Double's lands Fleet Params on Modulation › Chorus (asserted on `uiStore`).
  - [ ] A held-off send's row (`heldOffSends`) still opens its "?" with the link.
  - [ ] `SendRow`'s existing memo test stays green unmodified.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/LevelsSections.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/components/robot/LevelsSections.tsx`, `src/components/robot/LevelsSections.test.tsx`

  **Estimated scope:** XS

- [x] **Task 6: `HelpPopover.css` — the link's look**

  **Description:** Style `.sc-help__link` in `src/components/ui/controls/HelpPopover.css`: plain link text at the foot
  of the well, separated from the description and lore by the well's existing spacing, no cabinetry, the popover's
  own colour tokens, a visible focus ring, and on the phone shell a hit area of at least `--touch-target-size`
  (the "?"'s own `::before` pattern, `HelpPopover.css:48`).

  **Proof:** Look — `npm run dev`, open a robot's Levels › Sends and a send's "?". At 320 px, 768 px and wide: the
  link sits under the lore, reads as a link, not a control, and its focus ring shows on Tab.

  **Acceptance criteria:**
  - [ ] The link reads as plain text under the lore, with no box, bevel or glow.
  - [ ] On the phone shell the press area is at least 44 px tall without growing the well's text.
  - [ ] Keyboard focus on it is visible.

  **Verification:**
  - [ ] The Look above, in a live browser, recorded in the commit. No test file.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/components/ui/controls/HelpPopover.css`

  **Estimated scope:** XS

### Gate 1: The link's look (stop and report)
- [x] Crawford looks at a send's link in the well on the desk and the phone shell: its place under the lore, its weight
      against the description, the touch size. Any change is a Task 6 amendment before Task 7.
      Passed 2026-11-16 (Crawford: "everything looks good"); no amendment.

- [x] **Task 7: `nav/helpLinks.ts` — `openLfoLaneSettings` and the "LFO" name**

  **Description:** Add `openLfoLaneSettings(lane: LfoLaneId | null): void` to `helpLinks.ts`: it calls
  `openFleetParamsAt('lfoBank', …)` with `laneA`–`laneD`, or `laneA` when the lane is `null`. Add the link's name, a
  new content entry whose `human` is "LFO" (spec A4), beside `ui.lfoLane` in `src/content/copy/ui.ts` (key pinned
  here: `ui.lfoLane.settingsName`). No caller yet; Task 8 adds the three.

  **Proof:** RED test — `helpLinks.test.ts`: `openLfoLaneSettings` does not exist, so the cases fail first.

  **Acceptance criteria:**
  - [ ] `openLfoLaneSettings('c')` opens LFOs › Accent LFO; `openLfoLaneSettings(null)` opens Core LFO; each is a step.
  - [ ] `fill('ui.help.link', { name: labels('ui.lfoLane.settingsName').humanLabel })` reads "View LFO settings".

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/helpLinks.test.ts src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4 (the module), and Gate 1 passed.

  **Files:** `src/components/panels/screen/nav/helpLinks.ts`, `src/components/panels/screen/nav/helpLinks.test.ts`,
  `src/content/copy/ui.ts`

  **Estimated scope:** S

- [x] **Task 8: `LfoLink.tsx` — a required `onOpenLane`; the three drawers pass `openLfoLaneSettings`**

  **Description:** `LfoLink` (`src/components/ui/controls/LfoLink.tsx`) gains a required prop
  `onOpenLane: (lane: LfoLaneId | null) => void`, held in its `latest` ref with `value` and `onChange`. The lane
  schema's `useMemo` adds `help: { ...labels('ui.lfoLane').help, link: { name, go } }`, `name` from
  `ui.lfoLane.settingsName` and `go = () => latest.current.onOpenLane(latest.current.value.lane)`. The memo keys stay
  `[schema.id, shell]`. The control's own label row (`schema.help`) gets no link. `AudioRigDrawer.tsx`,
  `BusFilterDrawer.tsx` and `SignatureArrayDrawer.tsx` (both renders) import `openLfoLaneSettings` and pass it; the
  prop being required, `build:types` fails until all four renders do. `LfoLink.test.tsx`'s existing renders gain the
  prop through one shared test default.

  **Proof:** RED test — `LfoLink.test.tsx`: open the lane row's "?" and find "View LFO settings"; it fails first
  because the lane schema carries no link. `AudioRigDrawer.test.tsx`: a press on a Fleet Params effect's lane link
  lands on its lane; it fails first because the drawer passes nothing.

  **Acceptance criteria:**
  - [ ] The lane row's popover has the link; with the lane `'b'` a press calls `onOpenLane('b')`; with Off,
        `onOpenLane(null)`; rerendered with a new lane after mount, a press passes the new lane.
  - [ ] The control's own "?" (when its schema has help) has no link; the lane schema is the same object across a
        rerender with a new value (the memo holds).
  - [ ] In `AudioRigDrawer`, a lane link on lane C lands Fleet Params on LFOs › Accent LFO (asserted on `uiStore`).
  - [ ] `build:types` passes with all four renders passing the prop; the existing LfoLink, BusFilterDrawer and
        SignatureArrayDrawer cases stay green with only the added prop.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/LfoLink.test.tsx src/components/panels/screen/console/AudioRigDrawer.test.tsx src/components/robot/BusFilterDrawer.test.tsx src/components/robot/SignatureArrayDrawer.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `src/components/ui/controls/LfoLink.tsx`, `src/components/ui/controls/LfoLink.test.tsx`,
  `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`,
  `src/components/robot/BusFilterDrawer.tsx`, `src/components/robot/SignatureArrayDrawer.tsx`

  **Estimated scope:** M (six files, one over the guideline: a required prop must land with every site that passes it,
  or the type check fails between commits; the three drawer edits are one line each)

### Checkpoint 2: The links (stop and report)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Spec §5.3's runs, desk and phone shell, recorded here:
  - [ ] each send's link from a robot, a company and All Probes lands on its tab and sub-tab, and Back returns to
        Levels › Sends;
  - [ ] Grit: all Mixes 0 → Distortion; Chebyshev's Mix up → Chebyshev;
  - [ ] the lane link from a robot (lane B) → Companion LFO → Back; from Fleet Params' Delay (lane Off) → Core LFO →
        Back lands on Delay;
  - [ ] keyboard: open a "?", Tab to the link, Enter: focus is on the sub-tab and the arrow keys move across the
        sub-tabs;
  - [ ] a held-off send's link works.
- [ ] Restart Vite after the last edit before any headless probe (a `?t=` copy of an edited module is a second store).
- [ ] Reviewed with Crawford before docs.

---

### Phase 4: Docs

- [ ] **Task 9: `COMPONENT_LIBRARY.md`, `UI_SHELL.md`, the spec's "As built"**

  **Description:** `docs/COMPONENT_LIBRARY.md`: `HelpPopover`'s link (the `ControlHelp` type, the button, the press
  closing without handing focus back), `DualLabel`'s widened `help`, and `LfoLink`'s required `onOpenLane` and lane
  link. `docs/UI_SHELL.md`'s navActions section: `openFleetParamsAt` as the one step
  recorded inside Fleet Params, the arrival focus, and `helpLinks.ts`. `docs/specs/HELP_POPOVER_LINKS.md`: a §8 "As
  built" (gate results, defaults taken, anything built differently). Spot-check every name against the shipped code.

  **Proof:** Read — Crawford's review. No test file.

  **Acceptance criteria:**
  - [ ] Every named type, function, file and selector matches the shipped source.
  - [ ] The spec's status line and §7 record Q1 and Q2 as answered.

  **Verification:**
  - [ ] Manual review against the code.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1–8.

  **Files:** `docs/COMPONENT_LIBRARY.md`, `docs/UI_SHELL.md`, `docs/specs/HELP_POPOVER_LINKS.md`

  **Estimated scope:** S (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every automated acceptance criterion is met; Gate 1 passed; Checkpoint 2's runs recorded (any not done flagged
      here, never skipped).
- [ ] Ready for Crawford's PR.

---

### Phase 5: The records (after the merge)

- [ ] **Task 10: archive backlog 77**

  **Description:** On a docs branch after the feature PR merges: move entry 77 from `docs/todo/backlog.md` to
  `docs/todo/archive/backlog-archive.md` (no stub; rebase links that point at it), delete its plan.md Stage 5 line, and
  point the spec's status line at the archive.

  **Proof:** Read — Crawford's review. No test file.

  **Acceptance criteria:**
  - [ ] No live link to `backlog.md#77-…` remains; the archive entry says what shipped and links the spec.

  **Verification:**
  - [ ] Grep `docs/` for `#77-help-popovers` and check each hit resolves.

  **Dependencies:** The feature PR merged.

  **Files:** `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`,
  `docs/specs/HELP_POPOVER_LINKS.md`

  **Estimated scope:** XS (docs only)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Radix's focus scope returns focus to the "?" after a zero-delay timer and steals it back from the sub-tab | Medium | Task 3's `onCloseAutoFocus` prevent; Task 3 asserts focus does not return to the "?", Task 2 asserts focus on the sub-tab, and Checkpoint 2's keyboard run checks the two together in a real browser. |
| A link built per render breaks the `memo` boundaries of `HelpPopover`, `DualLabel` and the sliders | Medium | Send schemas are built at module load (Task 4's "same object" criterion); `LfoLink`'s link lives in its existing `useMemo` and the drawers pass a module function (Task 8's "same object across a rerender" criterion). |
| The arrival-focus one-shot is left set and fires on a later, unrelated Fleet Params render | Low | Set only after a real change (never on the no-op); taken in the first layout effect after it; Task 2's criterion that it is false after every other path. |
| `useRescueLostFocus` (nav rail, phone toggle) moves focus after the sub-tab takes it | Low | It acts only when focus is on `<body>`; whichever layout effect runs first, the sub-tab ends with focus. Checkpoint 2's keyboard run on both shells confirms. |
| Grit reads a Mix that a global LFO is moving in the engine, not the store | Low | Spec A5: the stored value, what the slider shows; recorded, not guarded. |
| A sixth send or a renamed sub-tab leaves a link pointing nowhere | Low | The destinations are a `Record<RobotSendField, …>` typed with `SelectedFleetParamsEffect`, so either fails to compile. |

## Open Questions

1. **Spec Q1: how the lane link reaches `LfoLink`.** **Resolved** (Crawford, 2026-11-16): a required prop,
   `onOpenLane`, passed by the three drawers (Task 8).
2. **Spec Q2: focus on arrival.** **Resolved** (Crawford, 2026-11-16): the open sub-tab's trigger (Task 2).
3. **Spec A3: where the arrival-focus request lives.** **Resolved** (Architecture Decisions): a module-level one-shot in
   `navActions.ts`.
4. **Spec A2: where the send destinations live.** **Resolved**: a record in `nav/helpLinks.ts`.
