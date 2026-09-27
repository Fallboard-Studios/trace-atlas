# Intent: Robot Options (Roadmap Phase 9)

Confirmed via `/interview-me` on `main`, 2026-08-26. Covers
[Roadmap Phase 9](../todo/roadmap.md#9-robot-options) — rebuilding the hand-built robot editor
(`RobotMetaTab`/`RobotAudioTab`/`RobotOscillatorsTab`) into four schema-driven drawers on the
Phase 1 primitive library, correcting scope-creep that had drifted into the roadmap's Phase 9
prose relative to [docs/reference/ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md).

## Outcome

The Robot Display drawer's Robot Name, Job Data, Battery Data, and Docked Status rows are plain
non-interactive `DualLabel` display rows — exactly the same display pattern Phase 8's
`RobotSelectionCard` already established, just inside the deeper Robot Options screen instead of
the selection list. Battery Data stays plain text percentage; no gauge widget is introduced. The
only editable controls in the Robot Display drawer are Audio Setting (a 4-option radio group: Off,
Mute, Solo, Highlight) and the transducer pressure ratio / Volume slider, which is
LFO-modulatable per `ROBOT_DATA_GRID.md`'s Volume row and `src/types/lfo.ts`'s `'volume'`
`RobotLfoTargetId`.

Three things that had crept into the roadmap's Phase 9 "Create"/"About" prose are struck as never
having been real requirements, not deferred features:

- **Job reassignment** — jobs are, and remain, fully system-determined by `assignJob`/
  `scoreJobAffinities` (Phase 7). No user-facing override.
- **Docking-state override** — docking remains fully battery-driven by `tickRobotLifecycle`
  (Phase 7). No user-facing override. The existing mute-while-docked behavior
  (`audioMode: 'mute'` set by `landOnDocked`) is completely unaffected either way — this was never
  in question, just confirming it isn't becoming user-editable as a side effect of this phase.
- **"Battery warning threshold"** — this was never a distinct field. It was a mislabeling of the
  battery-percentage readout that already exists (`Robot.batteryLevel`, displayed as text) — not a
  new settable alert threshold.

## User

Crawford (solo dev), continuing the Robot Options rebuild after Phase 8 (Robot Selection) shipped.

## Why now

Phase 9 is next in the roadmap sequence, and its own roadmap prose had drifted from
`ROBOT_DATA_GRID.md` (the actual source-of-truth field spec) by inventing editable
job/docking/battery-threshold capabilities that don't exist anywhere else in the app and aren't
wanted. That drift needed correcting before a spec or plan gets written against it.

## Success

- `roadmap.md`'s Phase 9 section describes exactly this: Robot Display's Name/Job/Battery/Docking
  rows are read-only `DualLabel`s (no gauge, no override controls); Audio Setting is a 4-option
  radio (Off/Mute/Solo/Highlight); transducer pressure ratio is an editable, LFO-modulatable
  slider.
- `docs/reference/ROBOT_DATA_GRID.md`'s Audio Setting row is understood to include "Off" as a 4th
  option even though the current table text only lists three (Mute/Solo/HiLite) — a documentation
  gap to fix when the grid itself is next touched, not a behavior gap.
- The other three drawers (Ping Controls, Ping Contour, Signature Array) are unchanged from what
  was already scoped in the roadmap — this intent doc doesn't revisit their content.

## Constraint

- Docking's existing behavior (mute-while-docked, battery-driven `Docked ↔ Active` cycling) is
  completely untouched by this phase.
- No new gauge/visual-widget primitive — battery stays plain text, matching Phase 8's
  `RobotSelectionCard` precedent, to avoid introducing a new visual component for one field.
- Audio Setting must include all 4 `audioMode` values (`none`/`mute`/`solo`/`highlight`), not the
  3 the data grid's prose currently lists — dropping "Off" would regress existing
  `RobotAudioTab` behavior, where a user can already turn mute/solo/highlight back off.

## Out of scope

- Any future job-reassignment or docking-override *feature* — Crawford has flagged more Robot
  Options behavior changes are coming later, but this phase is not where those land.
- A battery gauge visual widget.
- Ping Controls, Ping Contour, and Signature Array drawers' own field content — this interview
  only covered Robot Display. They proceed per the roadmap's existing Phase 9 scope (including
  Signature Array's Baseline/Coaxial/Harmonic layers and per-layer activation toggles); any
  mechanical deltas from today's implementation (e.g. fixed-slot layers vs. today's dynamic
  add/delete) are the phase spec's job to surface as open questions, not something this intent
  doc resolves either way.
