# Intent: The Off Screen as the Console — the one place a world is made, loaded, kept, shared or deleted

Confirmed via `interview-me` on 2026-11-08 (5 questions, after an `idea-refine` pass that accepted six of seven
variations and dropped the single-column one), ahead of a `spec-driven-development` pass. The next free number is 71;
this becomes backlog 71 when its entry is written, and it reworks the screen roadmap 57 built and backlog 64 revised
([UI_SHELL.md](../UI_SHELL.md#the-off-screen), the sketch `docs/sketches/off-screen.html`).

## Outcome

The powered-off screen is the only place a world is made, loaded, edited, saved, shared or deleted. Foundry
(Settings → Seeds) and Save & Share (Settings → Sessions) leave the powered-on app, and with Audio Quality moved to
Fleet Params and Factory Reset moved to the off screen, the Settings branch leaves the nav entirely. The first-visit
gate screen (the etched label, the power hint, the footer) does not change; everything below describes the returning
visit.

## Behavior

- **Two columns, re-aimed.** The desk keeps `.off-screen__axes`. Left is *which world*: the New Transmission editor,
  then the Transmissions list, then Device. Right is *how it loads*: Trace Type and Trace Aspects, unchanged in content
  and behaviour. The readout spans both, with Share beside it. The phone stacks the left column, then the right.
- **New Transmission is an editor, not a row.** A style-name text input, a coordinate input and Scan. A commit (Enter,
  blur) that changes the text selects New Transmission and lands the typed world under the wash, exactly as Scan does
  today: Classic with no aspects, the loaded save detached. Scan draws into the inputs and commits in one go. A commit
  that changes nothing does nothing, as Foundry's unedited Retransmit does. There is no Retransmit button and no
  "pick the row, then edit" step: editing is picking.
- **One list of every world you could load, collapsible.** Inside a collapsible section whose header names the
  section and the selected row (and a count): the powered-off world on top under an **unsaved** eyebrow while nothing
  stored matches it (today's Current, the snapshot-and-restore machinery kept beneath), the saves newest first, a
  divider, the three presets. Collapsed by default; the common case (scan a world, pick a theme) never opens it. Picking
  a row is loading it; there is no Load button.
- **One action row at the list's foot, acting on the selected row.** Save, Rename, Delete, where Keep sits today.
  Save on the unsaved row keeps it under a generated name (today's Keep); Save on an edited save overwrites it with
  the live loading. Rename turns the selected row's name into an inline text input in place: Enter or blur commits,
  Escape cancels, a blank reverts. Delete removes the save at once, no confirm. Inert actions dim and keep their place:
  Rename and Delete on a preset and on New Transmission; Delete on the unsaved row; Rename on the unsaved row (its name
  is the generated one until it is saved). No per-row buttons, so nothing pops in or out as saves come and go.
- **"Unsaved" is the powered-off world only.** A save whose live loading has drifted (a theme click on it) is not
  marked unsaved; its label names the live loading as today, and Save overwrites it. The standing warning line goes;
  the eyebrow carries what it said.
- **Share belongs to the readout.** One Share button beside the readout copies the link for whatever the readout
  names: an edited New Transmission, a save under a changed theme, a preset. Share Live and Share Save collapse into
  it. It reports "copied" briefly in the slot the warning line held.
- **Device, collapsed, at the foot of the left column.** Factory Reset with its confirm intact. It is also what brings
  a deleted preset-era world back, which is its reason to sit beside the list.

## Style / constraint

- **Existing controls keep their styling.** Text, buttons, inputs and rows change only where the layout above needs
  them to. Cabinetry only on interactive things; the family rows stay the only thing that lifts off the plate.
- **Controls hold their largest size** (Crawford's standing rule): the collapsible header, the action row and the
  readout never resize on a content flip; a dimmed control keeps its value.
- **Copy through the content layer.** Every new string (the section titles, Save/Rename/Delete, Share, "unsaved",
  "copied") is an entry in `src/content/`.
- **Architecture holds.** Picks, commits and restores go through `requestWorldChange` and `retransmitWorld`; the theme
  and family rows stay in-place re-derivations with no wash. Collapsed state is UI state in `uiStore` if it persists
  at all, never a ref or a timeline.
- **Layout tasks get no RED test.** Pure CSS and arrangement tasks name a browser look as their proof.

## Out of scope

- **A name field before saving.** Saves auto-name; Rename is the correction.
- **A Delete confirm.** A lost save is a world link away; Factory Reset keeps its confirm because it wipes the device.
- **"Unsaved" on edited saves**, and any change to what the theme and family rows do.
- **The preset links themselves** (backlog 45) and **the off background art** (backlog 1).
- **Keeping Foundry or Save & Share anywhere in the powered-on app.** The off screen is the only way.

## Known implementation notes (not yet spec'd)

- `SectorSettingsDrawer`, `SessionsPanel` and the Settings branch's nav entries, `selectedSettingsLeaf` in `uiStore`
  and the related content keys come out; Audio Quality's panel moves under Fleet Params' sections.
- The New Transmission editor can reuse Foundry's `TextInput` and `CoordsInput` and its draft-versus-store
  reconciliation; `RadioButton`'s `trailing` slot no longer carries Scan, since the editor is not a row.
- The snapshot, `keepWorld` / `keepCurrentWorld`, `isWorldDirty` / `isPayloadDirty` and `mirrorWorldToUrl` stay the
  underpinnings; the list's unsaved row and the action row read them where Current and Keep did.
- `docs/sketches/off-screen.html` is the record of the look and should gain a frame for this layout before the build.
