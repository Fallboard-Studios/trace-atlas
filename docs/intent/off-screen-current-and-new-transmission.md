# Intent: The Off Screen — Current stays the world you came from, and a New Transmission row with Scan

Confirmed via `interview-me` on 2026-11-02 (7 questions; one redirect: Roll was first moved to its own button above
Current, then became the New Transmission row with Scan in it). Ahead of a `spec-driven-development` pass. A revision of
roadmap [57](../todo/archive/roadmap-archive.md#57-the-off-screen-power-as-pause-the-two-axis-chooser-keep-and-the-band-table)'s
Transmission list (`src/components/panels/screen/screens/OffScreen.tsx`). Backlog [64](../todo/backlog.md#64-off-screen-current-stays-the-world-you-came-from-and-a-new-transmission-row-with-scan).

## Why

It came up at Checkpoint 5's Look in [OFF_SCREEN_FINAL_FIXES.md](../tasks/OFF_SCREEN_FINAL_FIXES.md) (F12): picking
Current cancels a waiting pick only during the scene wash's 0.5 s fade-in, which nobody will hit in time. Outside that
window, clicking Current does nothing. The Current row is also named from whatever world is loaded, so a save or preset
pick renames it, and a theme or aspect click after the pick moves the selection back to it (`OffScreen.tsx`
`onThemeChange` and `onFamilyChange`, `setPick(CURRENT_PICK)`). The result is that Current stops meaning anything.

## Outcome

The Transmission list has two kinds of anchor. **Current** is the world you came from, and **New Transmission** is a
fresh one waiting to be tried. A listener can try saves, presets and new worlds and always get back to where they were.

- **User:** a listener on the off screen trying out new worlds, saves and presets without losing the world they came
  from.
- **Success:** power off on world A, Scan twice, click Calm, pick save B, then click Current, and you're back on
  exactly A. The Current row read A the whole way through.

## Behaviour

### Current

- Current is a snapshot of the world that was playing at power-off, tweaks included. It's selected when the off screen
  opens. On a fresh page, Current is the world the page booted with.
- Current's row is always named after the snapshot. Picking a save, a preset or New Transmission doesn't change it,
  and neither does a theme or aspect click on another row or a Scan.
- Clicking Current while another row is selected restores the snapshot exactly: an ordinary world change under the
  wash. Clicking Current when it's already selected does nothing.
- A theme or aspect click with Current selected changes Current itself, so the snapshot follows the change. Leave
  Current and come back, and the change is still there.

### New Transmission

- A row labelled "New Transmission", directly above Current, unselected on load.
- It holds a freshly rolled Attenuation Style and coordinates under the theme **Classic** with **no aspects** (every
  family cleared). A new roll is drawn each time the off screen opens, on every power-off and on a fresh page.
- Selecting it loads that world under the wash, as a save pick does. Leaving it and coming back reloads the same rolled
  world, as rolled, without any edits made while on it.
- **Scan** replaces Roll: a small flat button inside the New Transmission row (Roll leaves Current's row). Scan draws a
  new style and coordinates into the row and selects the row, so its world loads under the wash. It works whichever row
  is selected. Current is untouched.

### Theme and aspect clicks on a save, preset or New Transmission

- The selected row stays selected. The row and the readout show the change after the row's name, as Current's row is
  described today (for example "Harbour Song · Calm").
- Nothing is written to disk. Leave the row and come back, and the save or preset reloads as stored, without the
  edits.

### The readout, Keep and power-on

- The readout names the selected row's actual world. For New Transmission that's the rolled style and coordinates,
  while the row's own label stays "New Transmission".
- "Save Last World" (Keep) saves the **Current snapshot**, whichever row is selected, and the unsaved line under it
  describes Current.
- Powering on plays whichever row is selected. At the next power-off, that world, with its edits, becomes Current, and
  New Transmission rolls again.

## Constraints

- The guardrails stay: a theme or aspect change rebuilds nothing (it re-derives in place), and a world change goes
  under the scene wash.
- The snapshot and the rolled New Transmission world are runtime-only: never in the store's serialisable state, a save
  payload or the link.
- "New Transmission" and "Scan" are Crawford's words, used as given, and live in `src/content/` like every other
  string.

## Out of scope

- A confirm dialog before a Scan or a pick. The unsaved line under Keep is the warning, as roadmap 57 decided ("No
  confirm dialog, no autosave, no save prompt").
- Saving a save's, preset's or New Transmission's edits from the off screen. The Sessions panel does that once powered
  on.
- Rows remembering their edits after you leave them. Only Current is remembered.
- The copy pass on the rest of the off screen (backlog 62, roadmap 58).

## What goes away

- R3/F12's cancel during the wash. Clicking Current becomes an ordinary world change back to the snapshot, and as with
  every world change while the wash waits, the last click wins.
- Roll on Current's row, and a Roll that replaces Current.
