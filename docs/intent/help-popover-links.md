# Intent: Help Popover Links — "View Reverb settings" from a send, "View LFO settings" from a lane

Confirmed via `interview-me` on 2026-11-16 (six questions; five guesses confirmed outright, one rewritten by Crawford:
the link's words), ahead of a `spec-driven-development` pass. This is backlog
[77](../todo/archive/backlog-archive.md#77-help-popovers-a-link-from-a-send-to-its-effect), plan.md Stage 5.

## Outcome

A control's help popover can carry one link, "View X settings", that opens Fleet Params on the effect the control
feeds. The popover closes, the player lands on that tab and sub-tab, and Back returns them to where they were. The five
sends and the LFO lane picker carry one; no other control does yet.

## Behavior

- **Who it is for, and why.** The player reading a control's help who does not yet know it feeds a shared effect.
  Crawford: "discovery, documentation, and ease of use", all three. Today the sends' help names "the shared Reverb" and
  the lane picker's help names "the four shared LFO lanes", but nothing on screen gets the player there.
- **A general field, two users.** The link is something any help popover can carry, not a send-only feature. The five
  sends and the LFO lane picker are the only ones that carry it in this item.

### The links

| Control | Link words | Opens (Fleet Params tab › sub-tab) |
| --- | --- | --- |
| Reverb send (`probe.reverbSend`) | View Reverb settings | Time & Space › Reverb |
| Delay send (`probe.delaySend`) | View Delay settings | Time & Space › Delay |
| Grit send (`probe.gritSend`) | View Color settings | Color › the first of Distortion, Chebyshev, Bit Crusher whose Mix is above 0 |
| Shimmer send (`probe.shimmerSend`) | View Shifter settings | Modulation › Shifter |
| Double send (`probe.doubleSend`) | View Chorus settings | Modulation › Chorus |
| LFO lane picker (`ui.lfoLane`, the `LfoLink` control) | View LFO settings | LFOs › the lane picked |

- **The sends link from every screen that shows them**: a robot, a company, All Probes.
- **The lane picker links from everywhere it appears**: robot and company screens and Fleet Params' own effects.
- **The words are fixed per control; only the destination is live.** Grit always reads "View Color settings" and the
  lane picker always "View LFO settings". Which sub-tab opens is worked out at the press: Grit's from the three Mixes in
  chain order, the lane picker's from its lane.
- **Nothing live to point at.** The link always shows. With the lane on Off it opens the first lane (Core LFO); with all
  three Color Mixes at 0 it opens Distortion. That is when the player most needs to see what the control would feed,
  and a link that comes and goes with a setting reads as a bug.

### Back

- A help link is a step on backlog 75's trail, so Back returns to the screen the player left, on the tabs it showed.
- **A help jump inside Fleet Params is a step too.** A lane picker on Fleet Params' Delay jumping to the LFOs tab
  stays on the Fleet Params screen, which backlog 75 does not count as a step (tabs are not identity). A help jump is
  the one exception: it records the step, so Back returns to Delay. Ordinary tab presses still record nothing.

### Arrival

- The popover closes and Fleet Params opens on the tab and sub-tab. Nothing else: no glow, no highlight on the effect.
  The breadcrumb already says where the player is.
- Keyboard focus lands on the page arrived at, not lost with the closed popover.

### Look

- A plain text link at the foot of the popover, under the lore. No cabinetry: it is a way out, not a control.
- One content template, "View {name} settings", filled with each link's name.

## Style / constraint

- **Selection stays in one place.** The jump is a `navActions` call; no component derives a path itself.
- **The shared control stays stateless.** `HelpPopover` is one of the shared primitives in
  `src/components/ui/controls/`; it renders a link it is handed and does not import navigation or read stores.
- **State stays serialisable.** A trail stop is plain data, as backlog 75 left it.
- **UI Shell guardrail.** The popover keeps portalling into `ScreenViewport`.
- **Copy lives in `src/content/`**: the template and each link's name.
- **Tests exercise code, not text**: where each link goes, Grit's and the lane's choice, the empty cases, the Back step
  inside Fleet Params and the popover closing are behaviour with tests. The link's look is a look in the browser.

## Out of scope

- Links on any other control.
- A reverse link: a Return or an effect pointing back to the sends that feed it.
- A highlight, glow or scroll-to on arrival.
- The full path in the link's words ("Open Fleet Params › Time & Space › Reverb" was proposed and cut: too long).
- The Guide (roadmap [51](../todo/roadmap.md#51-guide-a-read-only-branch-that-teaches-the-whole-app)).
- Ordinary tab presses as Back steps.

## Known implementation notes (not yet spec'd)

None of these was asked in the interview; each is a fact from the code or a question the spec must answer.

- **How help reaches the popover.** Help is a content field (`ContentHelp`, `src/content/types.ts`: `human`, `lore?`),
  copied into a schema by `labels()`, then passed from the schema to `DualLabel` and on to `HelpPopover`. `ContentHelp`
  is words only, so the link's destination does not belong in it. The likely shape: the screen hands `DualLabel` /
  `HelpPopover` a link (its name and an `onGo`), built from a table beside `ROBOT_SENDS` (`src/data/robotSends.ts`, one
  row per send) and from `LfoLink`'s lane. To decide in the spec: a column on `ROBOT_SENDS` or its own table.
- **A live destination.** Grit's and the lane's targets depend on values at the press, so the link carries a function
  (or a target the nav action resolves), not a fixed sub-tab. Data configs do not import `navActions`.
- **The memo boundary.** `HelpPopover` and `DualLabel` are `memo`'d on a stable `help` object; a link handed in needs
  to be as stable (built once per control, its `onGo` reading the live values at the press).
- **The nav action.** Nothing in `navActions.ts` opens a Fleet Params tab and sub-tab as a step. `selectBranch` records
  a step but resets to the default tab; `setFleetParamsSection` / `setFleetParamsSubsection` move tabs without one.
  `recordStep` skips a step when the screen key is unchanged, which is why a jump inside Fleet Params needs its own rule.
- **The Mix read for Grit.** The three Mixes are `fleet.distortion.mix`, `fleet.chebyshev.mix`, `fleet.bitCrusher.mix`
  in the Fleet Params store. To decide: the stored value, as the guess assumes, or a value moved by an LFO or swell at
  that moment.
- **The words for "LFO".** The LFOs tab's own name is "LFOs" (`fleet.lfoBank`), so "View LFO settings" needs its own
  name in content rather than the tab's. The sends' names match the sub-tabs' (`fleet.reverb`, `fleet.delay`,
  `fleet.colour` "Color", `fleet.frequencyShifter` "Shifter", `fleet.chorus`).
- **Where `LfoLink` appears.** `RobotScreen.tsx`, `CompanyOptionsSection.tsx`, `AudioRigDrawer.tsx` (Fleet Params),
  `BusFilterDrawer.tsx`, `SignatureArrayDrawer.tsx`, `TempoSyncSlider.tsx`. Its help is `ui.lfoLane`'s.
- **The modal popover and focus.** The popover is a modal Radix Popover that returns focus to the "?" on close; a link
  press has to close it without that return, then move focus to the arrived page.
- **Docs to update with the build.** `COMPONENT_LIBRARY.md` (HelpPopover, DualLabel, LfoLink), `CONTENT_LAYER.md` (the
  template), `UI_SHELL.md` (the jump as a step), and backlog 77's entry.
