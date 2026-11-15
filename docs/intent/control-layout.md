# Intent: Control Layout — Tabs, Sub-tabs, Panels and Rows for Params and Probes

Confirmed in conversation on 2026-11-15 (a review of Crawford's two layout sheets, then five questions
answered), ahead of a `spec-driven-development` pass. Spec: [CONTENT_LAYOUT.md](../specs/CONTENT_LAYOUT.md). The layout itself is recorded in
[Layout - Params.csv](../reference/Layout%20-%20Params.csv) and
[Layout - Robots.csv](../reference/Layout%20-%20Robots.csv): one row per control, with its tab, sub-tab,
panel, row, and whether it is featured. Those two sheets are the source of truth for where every control
sits; this file records how to read them and everything they do not say.

## Outcome

Every control on the Fleet Params screen (`FleetParamsScreen.tsx`) and on the robot, company and All
Probes screens (`RobotScreen.tsx`, `CompanyScreen.tsx`, both through `RobotSectionTabs`) sits where the
sheets put it: in a tab, a sub-tab, a numbered panel and a numbered row. No control is added or removed,
and no control changes what it does.

- **User:** Crawford, and anyone editing a world: fewer controls on screen at once, the main control of
  each effect first, related controls together.
- **Why now:** the layout is being settled before the content sweep, which was split off because doing
  both at once was too much.
- **Success:** each screen, tab by tab, matches its sheet on the desk and on the phone.

## Behavior

**Reading the sheets**

- **Panel** is its own cabinetry box (a `DirectionalPanel`). Panels are numbered within a sub-tab.
- **Labels stay with their items, inside the box.** A control's label sits with its control, in the
  same cabinetry box (Crawford, 2026-11-15: "try to keep labels with their items, within the cabinetry
  boxes").
- **Row** is numbered within a panel. Controls that share a panel and a row sit **side by side on the
  desktop**, left to right in sheet order, and **stack on the phone**. The row number decides the
  order, not the line order in the sheet (Reverb lists row 2 before row 1).
- **Featured** is, for now, one extra class on the control and nothing else: no visual change in this
  pass. It will later mean a border or similar that sets the control apart. A featured control can share
  a row (Gain beside Type).
- **Tempo sync** is a record of which sliders carry the Free | Sync toggle today. Nothing changes there.
- A blank `featured` or `tempo sync` cell is FALSE. The blank `Type`, `Old Locale` and `New Locale`
  cells are not instructions.

**Fleet Params: eight tabs become seven**

- **World** is a new first tab with two sub-tabs: **Pacing** (the old Pacing tab) and **Settings** (the
  old Audio Quality tab, which was last).
- Then **LFOs** (four lane sub-tabs, all laid out alike), **EQ & Filters**, **Time & Space**, **Color**,
  **Modulation**, **Output**, with the sub-tabs they have today.
- On every effect with a Mix, Amount or Return, that control is row 1 and featured, ahead of the
  effect's other sliders. It is last today.
- Each EQ band and each filter parameter that has an LFO link gets its own panel: the slider on row 1,
  its Lane and Depth on row 2.

**Robot, company and All Probes: every tab gets sub-tabs**

- **Levels:** Mix (Volume, Monitor Mode, Dynamics; Pan and Auto in a second panel) and Sends (the five
  sends).
- **Composition:** Rhythm & Melody (Note Density, Phrase Length, Pitch Repeat Chance, Note Variance) and
  Details (Rests, Accents, the two octave sliders). Pitch Repeat Chance stays on the same sub-tab as
  Phrase Length, which dims it at 0.
- **Envelope:** Contour (the four ADSR sliders) and Character (Portamento, Attack Shape, Release Shape,
  one per row).
- **Source:** the three oscillators and the Filter, as today. Each oscillator is three panels: Type and
  Gain with the Gain link, Detune with its link, then Phase with Interval on its own row beneath.
- The company and All Probes screens show exactly the robot layout.

**What goes**

- **Every intro panel leaves the views**: the screen-level and per-tab intros on Fleet Params, and the
  per-tab intros on the robot, company and All Probes screens. The `IntroPanel` component stays, and so
  does the intro copy in `src/content/`.
- **The Articulation panel and its heading go.** Rests and Accents are plain rows of Composition >
  Details.
- The Rhythm and Pitches sub-section names go with the sub-tabs that replace them.

**Small rulings**

- **Click Track** (dev only, behind `DEV_TUNING`) sits under the sliders on Rhythm & Melody.
- **Interval** is an optional row: it shows only for the oscillator types that have it, and its panel is
  one row shorter without it.
- Anything the sheets do not mention is unchanged: the robot's avatar column and phone band, the roster,
  the nav panel, the header.

**Renames**

The sheets' tab and sub-tab names are the names. These differ from the app today:

| Today | New |
|---|---|
| (none) | World |
| Audio Quality | Settings |
| LFO Bank | LFOs |
| Colour | Color |
| (none) | Mix, Sends (Levels) |
| Rhythm, Pitches | Rhythm & Melody, Details (Composition) |
| (none) | Character (Envelope), beside the existing Contour |
| Decay Mode | Decay |
| Lowest Octave, Highest Octave | Octave Min, Octave Max |
| Attack Time, Decay Time, Sustain Level, Release Time (envelope) | Attack, Decay, Sustain, Release |

## Style / constraint

- Existing primitives only: `SectionTabs` (and its `sub` variant), `DirectionalPanel`, and the controls
  already in each panel. No new component.
- Every new or changed name is a content entry in `src/content/copy/`, read through `labels()`. No
  literal in a component or a config.
- The tabs stay lazy: one tab and one sub-tab in the DOM at a time, as `SectionTabs` does today.
- The breadcrumb keeps naming the open tab and sub-tab from the same tables the screens read
  (`navActions.ts`, `robotSubsectionConfig.ts`).
- A control that does nothing stays dimmed with its value kept, wherever it moves.
- Layout only: no store field for audio, no engine call, no schema range and no saved value changes.

## Out of scope

- **The content sweep**: help text, lore names and intro copy are a separate pass. Only the names in the
  table above change here.
- **Any visual treatment for featured** beyond the class.
- **Deleting `IntroPanel`** or the intro copy.
- **New controls, removed controls, or changed ranges.**
- **The robot avatar column, the roster board and the off screen.**

## Known implementation note (not yet spec'd)

- **Panel headings and desk arrangement.** The sheets number panels but do not name them. Panels stack
  in number order on the desk and the phone. Today each effect's single panel carries the effect's
  heading; the spec says what happens to a heading whose controls are now split across several boxes.
- **Labels to confirm.** Two groups in the sheets read as shorthand, not renames, and are left as they
  are unless Crawford says otherwise: "Auto (tracking)" for Auto, and the oscillator rows' Type, Gain,
  Detune, Phase and Interval (today "Core Type" and so on, one sheet row standing for three controls).
  The sheets' typos and case slips were fixed in the sheets on 2026-11-15.
- **Tab state.** `FleetParamsGroup` loses `pacing` and `quality` as top-level tabs and gains `world`
  with those two as sub-tabs. `RobotSubsection` gains ids for the new sub-tabs, and `frequency`'s
  `mergedInto` goes. Neither stored tab id reaches a session save or the link (checked 2026-11-15).
- **Where featured lives**: a flag on the control's schema or on the row table; the spec chooses.
- **The intro helpers.** With no intro rendered, `intro()` and `introProps()` have no caller in the
  views. They stay, like the component; check that lint accepts that.
- **Other intro panels.** `RosterBoard.tsx` and the top of `CompanyScreen.tsx` each render an intro that
  is not a tab's. "Remove the intro panels from the views" is read as covering them too; confirm before
  building.
- **Docs to update with the build**: `docs/UI_SHELL.md` and `docs/COMPONENT_LIBRARY.md` where they name
  the eight tabs or the intro panels.
